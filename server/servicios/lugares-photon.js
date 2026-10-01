import { ErrorHttp } from '../http.js';
import { validarDatosBar } from './bares.js';

const TIPOS = ['bar', 'pub', 'cafe', 'restaurant', 'fast_food', 'biergarten', 'food_court'];
const RADIO_KM = 25;
const elegirDeNuevo = () => new ErrorHttp(400, 'No se ha podido identificar ese establecimiento. Vuelve a elegirlo en la búsqueda.');

// APIs web disponibles tanto en Node como en Workers; conserva las referencias ya guardadas.
function codificarConsulta(q) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(q)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function leerReferenciaPhoton(referencia) {
  const partes = typeof referencia === 'string' && referencia.match(/^photon:([NWR]):([1-9]\d{0,19}):([A-Za-z0-9_-]{4,430})$/);
  if (!partes) throw elegirDeNuevo();
  let q;
  try {
    const bytes = Uint8Array.from(atob(partes[3].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    q = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { throw elegirDeNuevo(); }
  if (q.length < 3 || q.length > 80 || q !== q.trim() || codificarConsulta(q) !== partes[3]) throw elegirDeNuevo();
  return { proveedorId: `photon:${partes[1]}:${partes[2]}`, q };
}

function distanciaKm(lat, lon, lat2, lon2) {
  const rad = (v) => v * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Servidor público de Photon: uso moderado, caché y consultas agrupadas; sin claves ni cuentas. */
export function crearBuscadorPhoton(config, { transporte = fetch, reloj = Date.now } = {}) {
  const consultas = new Map();
  const pendientes = new Map();
  let ventana = { inicio: reloj(), n: 0 };
  let pausaHasta = 0;
  const lat = config.lugaresLat;
  const lon = config.lugaresLon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) throw new Error('Revisa PLACES_LAT y PLACES_LON.');
  const dLat = RADIO_KM / 111;
  const dLon = RADIO_KM / (111 * Math.cos(lat * Math.PI / 180));

  function convertir(feature, q) {
    const p = feature?.properties;
    const coords = feature?.geometry?.coordinates;
    if (!p || p.osm_key !== 'amenity' || !TIPOS.includes(p.osm_value) || !/^[NWR]$/.test(p.osm_type) ||
        !/^[1-9]\d{0,19}$/.test(String(p.osm_id)) || feature.geometry?.type !== 'Point' ||
        !Array.isArray(coords) || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
    try {
      if (distanciaKm(lat, lon, coords[1], coords[0]) > RADIO_KM) return null;
      const bar = validarDatosBar({ nombre: p.name, zona: p.locality || p.district,
        ciudad: p.city || p.town || p.village,
        direccion: [p.street, p.housenumber].filter(Boolean).join(' ') || null, lat: coords[1], lng: coords[0] });
      return { ...bar, referenciaLugar: `photon:${p.osm_type}:${p.osm_id}:${codificarConsulta(q)}` };
    } catch { return null; }
  }

  async function solicitar(q) {
    const instante = reloj();
    if (instante - ventana.inicio >= 60_000) ventana = { inicio: instante, n: 0 };
    // Limita también las consultas al guardar borradores y evita insistir tras un fallo externo.
    if (instante < pausaHasta || ventana.n >= 20 || pendientes.size >= 2) throw new ErrorHttp(503, 'La búsqueda de otros lugares está ocupada. Prueba en un momento o añádelo a mano.');
    ventana.n++;
    const url = new URL('https://photon.komoot.io/api/');
    for (const [k, v] of Object.entries({ q, limit: 8, lat, lon, dedupe: 0,
      bbox: [Math.max(-180, lon - dLon), Math.max(-90, lat - dLat), Math.min(180, lon + dLon), Math.min(90, lat + dLat)].join(',') })) url.searchParams.set(k, v);
    for (const tipo of TIPOS) url.searchParams.append('osm_tag', `amenity:${tipo}`);
    try {
      const respuesta = await transporte(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Tortillas/0.1 (place search)' } });
      if (!respuesta.ok) throw new Error('proveedor');
      const datos = await respuesta.json();
      if (!Array.isArray(datos.features)) throw new Error('respuesta');
      const vistos = new Set();
      const lugares = datos.features.slice(0, 8).map((f) => convertir(f, q)).filter((l) => {
        if (!l || vistos.has(l.referenciaLugar)) return false;
        vistos.add(l.referenciaLugar); return true;
      }).slice(0, 5);
      consultas.set(q.toLowerCase(), { lugares, caduca: reloj() + (lugares.length ? 15 * 60_000 : 60_000) });
      while (consultas.size > 100) consultas.delete(consultas.keys().next().value);
      return lugares;
    } catch {
      pausaHasta = reloj() + 30_000;
      throw new ErrorHttp(503, 'No se pudieron buscar otros lugares. Puedes seguir con los guardados o añadir uno a mano.');
    }
  }

  function buscar(consulta) {
    let q = String(consulta || '').trim().slice(0, 80);
    // «Café Iruña» figura como «Iruña» en OSM; quitar solo el tipo inicial evita una segunda petición.
    const sinTipo = q.replace(/^(?:bar|caf[eé]|cafeter[ií]a|restaurante)\s+/i, '');
    if (sinTipo.length >= 3) q = sinTipo;
    if (q.length < 3) return Promise.resolve([]);
    const clave = q.toLowerCase();
    const previa = consultas.get(clave);
    if (previa && reloj() < previa.caduca) return Promise.resolve(previa.lugares);
    if (pendientes.has(clave)) return pendientes.get(clave);
    const peticion = solicitar(q).finally(() => pendientes.delete(clave));
    pendientes.set(clave, peticion);
    return peticion;
  }

  return {
    buscar,
    async resolver(referencia) {
      const { proveedorId, q } = leerReferenciaPhoton(referencia);
      // Al caducar la caché o reiniciar el servidor, vuelve a consultar la fuente. Nunca acepta coordenadas del cliente.
      const lugar = (await buscar(q)).find((l) => leerReferenciaPhoton(l.referenciaLugar).proveedorId === proveedorId);
      if (!lugar) throw elegirDeNuevo();
      return { ...lugar, proveedorId };
    },
  };
}
