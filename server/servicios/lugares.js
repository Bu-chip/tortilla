import { ErrorHttp } from '../http.js';
import { validarDatosBar } from './bares.js';
import { crearBuscadorPhoton, leerReferenciaPhoton } from './lugares-photon.js';

export function crearBuscadorLugares(config, { transporte = fetch } = {}) {
  const proveedor = config.lugaresProveedor || (config.geoapifyKey ? 'geoapify' : 'photon');
  if (!['photon', 'geoapify', 'ninguno'].includes(proveedor)) throw new Error('PLACES_PROVIDER debe ser photon, geoapify o ninguno.');
  const activa = proveedor === 'photon' || (proveedor === 'geoapify' && !!config.geoapifyKey);
  const buscador = proveedor === 'photon' ? crearBuscadorPhoton(config, { transporte }) : crearBuscadorGeoapify(config, { transporte });
  return {
    activa, proveedor,
    buscar: (q) => {
      if (!activa) throw new ErrorHttp(503, 'La búsqueda de otros lugares no está activada. Puedes usar un lugar guardado o añadirlo.');
      return buscador.buscar(q);
    },
    resolver: (id) => {
      if (!activa) throw new ErrorHttp(503, 'La búsqueda de otros lugares no está activada. Puedes usar un lugar guardado o añadirlo.');
      if ((typeof id === 'string' && id.startsWith('photon:')) !== (proveedor === 'photon')) throw new ErrorHttp(400, 'Vuelve a elegir el lugar en la búsqueda.');
      return buscador.resolver(id);
    },
  };
}

/** La identidad no depende de la consulta; se conserva al recuperar un borrador o cambiar de proveedor. */
export function identidadLugar(referencia) {
  if (typeof referencia !== 'string' || referencia.length < 5 || referencia.length > 600) throw new ErrorHttp(400, 'Vuelve a elegir el lugar en la búsqueda.');
  if (referencia.startsWith('photon:')) return leerReferenciaPhoton(referencia).proveedorId;
  return `geoapify:${referencia}`;
}

/** Places API permite persistir el lugar elegido con atribución. Las sugerencias no entran en SQLite. */
function crearBuscadorGeoapify(config, { transporte }) {
  const cache = new Map();
  const consultas = new Map();
  async function solicitar(ruta, params) {
    if (!config.geoapifyKey) throw new ErrorHttp(503, 'La búsqueda de otros lugares todavía no está activada. Puedes usar un lugar guardado o añadirlo.');
    const url = new URL(`https://api.geoapify.com/${ruta}`);
    for (const [k, v] of Object.entries({ ...params, apiKey: config.geoapifyKey })) url.searchParams.set(k, v);
    try {
      const r = await transporte(url, { signal: AbortSignal.timeout(6500) });
      if (!r.ok) throw new Error('proveedor');
      const datos = await r.json();
      if (!Array.isArray(datos.features)) throw new Error('respuesta');
      return datos.features;
    } catch {
      throw new ErrorHttp(503, 'No se pudieron buscar otros lugares. Puedes seguir con los guardados o añadir uno a mano.');
    }
  }
  function convertir(feature) {
    const p = feature.properties;
    if (!p || typeof p.place_id !== 'string' || !p.name || !p.categories?.some((c) => c === 'catering' || c.startsWith('catering.'))) return null;
    try {
      const bar = validarDatosBar({ nombre: p.name, zona: p.suburb || p.neighbourhood, ciudad: p.city || p.town || p.village,
        direccion: p.address_line2 || p.formatted, lat: p.lat, lng: p.lon });
      if (bar.lat === null || bar.lng === null) return null;
      const resultado = { ...bar, referenciaLugar: p.place_id };
      cache.set(p.place_id, { lugar: resultado, fecha: Date.now() });
      while (cache.size > 500) cache.delete(cache.keys().next().value);
      return resultado;
    } catch { return null; }
  }
  return {
    async buscar(q) {
      const nombre = String(q || '').trim().slice(0, 80);
      if (nombre.length < 3) return [];
      const previa = consultas.get(nombre.toLowerCase());
      if (previa && Date.now() - previa.fecha < 60_000) return previa.lugares;
      const features = await solicitar('v2/places', { categories: 'catering', name: nombre, lang: 'es', limit: 5,
        filter: `circle:${config.lugaresLon},${config.lugaresLat},25000`, bias: `proximity:${config.lugaresLon},${config.lugaresLat}` });
      const lugares = features.slice(0, 5).map(convertir).filter(Boolean);
      consultas.set(nombre.toLowerCase(), { fecha: Date.now(), lugares });
      while (consultas.size > 100) consultas.delete(consultas.keys().next().value);
      return lugares;
    },
    async resolver(id) {
      if (typeof id !== 'string' || id.length < 5 || id.length > 600) throw new ErrorHttp(400, 'Vuelve a elegir el lugar en la búsqueda.');
      const previa = cache.get(id);
      if (previa && Date.now() - previa.fecha < 30 * 60_000) return { ...previa.lugar, proveedorId: `geoapify:${id}` };
      const features = await solicitar('v2/place-details', { id, features: 'details' });
      const lugar = features.map(convertir).find((l) => l?.referenciaLugar === id);
      if (!lugar) throw new ErrorHttp(400, 'No se ha podido identificar ese establecimiento. Vuelve a buscarlo.');
      return { ...lugar, proveedorId: `geoapify:${id}` };
    },
  };
}
