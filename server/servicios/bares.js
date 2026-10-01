import { ahora, nuevoId } from '../identidad.js';
import { ErrorHttp } from '../http.js';
import { normalizar, seParecen } from './texto.js';
import { coordenada, texto } from './validar.js';

export function formatearBar(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    zona: fila.zona,
    ciudad: fila.ciudad,
    direccion: fila.direccion,
    lat: fila.lat,
    lng: fila.lng,
    esDemo: fila.es_demo === 1,
    fuente: fila.proveedor_id?.startsWith('photon:') ? 'photon' : fila.proveedor_id?.startsWith('geoapify:') ? 'geoapify' : null,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function validarDatosBar(cuerpo, { parcial = false } = {}) {
  const datos = {};
  if (!parcial || cuerpo.nombre !== undefined) datos.nombre = texto(cuerpo.nombre, 'nombre', { max: 80, min: 2 });
  if (!parcial || cuerpo.zona !== undefined) datos.zona = texto(cuerpo.zona, 'zona', { max: 80, opcional: true });
  if (!parcial || cuerpo.ciudad !== undefined) datos.ciudad = texto(cuerpo.ciudad, 'ciudad', { max: 80, opcional: true });
  if (!parcial || cuerpo.direccion !== undefined) datos.direccion = texto(cuerpo.direccion, 'direccion', { max: 160, opcional: true });
  if (!parcial || cuerpo.lat !== undefined) datos.lat = coordenada(cuerpo.lat, 'lat', -90, 90);
  if (!parcial || cuerpo.lng !== undefined) datos.lng = coordenada(cuerpo.lng, 'lng', -180, 180);
  if ((datos.lat === null) !== (datos.lng === null) && !parcial) {
    throw new ErrorHttp(400, 'Latitud y longitud deben indicarse juntas.', { campo: 'lat' });
  }
  return datos;
}

export function obtenerBar(db, id) {
  return formatearBar(db.prepare('SELECT * FROM bares WHERE id = ?').get(id));
}

export function crearBar(db, datos, personaId = null, { esDemo = false } = {}) {
  const id = nuevoId();
  const instante = ahora();
  db.prepare(`INSERT INTO bares (id, nombre, nombre_norm, zona, ciudad, direccion, lat, lng, es_demo, creado_por, creado_en, actualizado_en)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, datos.nombre, normalizar(datos.nombre), datos.zona ?? null, datos.ciudad ?? null, datos.direccion ?? null,
      datos.lat ?? null, datos.lng ?? null, esDemo ? 1 : 0, personaId, instante, instante);
  return obtenerBar(db, id);
}

export function editarBar(db, id, cambios) {
  const actual = db.prepare('SELECT * FROM bares WHERE id = ?').get(id);
  if (!actual) throw new ErrorHttp(404, 'Ese bar no existe.');
  const nuevo = { ...actual, ...Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined)) };
  validarDatosBar(nuevo);
  db.prepare(`UPDATE bares SET nombre = ?, nombre_norm = ?, zona = ?, ciudad = ?, direccion = ?, lat = ?, lng = ?, actualizado_en = ? WHERE id = ?`)
    .run(nuevo.nombre, normalizar(nuevo.nombre), nuevo.zona ?? null, nuevo.ciudad ?? null, nuevo.direccion ?? null,
      nuevo.lat ?? null, nuevo.lng ?? null, ahora(), id);
  return obtenerBar(db, id);
}

export function buscarBares(db, { q = '', zona = '' } = {}) {
  const partes = ['1 = 1'];
  const params = {};
  const qn = normalizar(q);
  if (qn) {
    partes.push("(b.nombre_norm LIKE @q OR LOWER(COALESCE(b.zona, '')) LIKE @qz OR LOWER(COALESCE(b.ciudad, '')) LIKE @qz)");
    params.q = `%${qn}%`;
    params.qz = `%${q.trim().toLowerCase()}%`;
  }
  if (zona) {
    partes.push('b.zona = @zona');
    params.zona = zona;
  }
  return db.prepare(`SELECT * FROM bares b WHERE ${partes.join(' AND ')} ORDER BY b.nombre`).all(params).map(formatearBar);
}

/** Bares parecidos por nombre (y, si se indica, zona), para evitar duplicados sin fusionar nada automáticamente. */
export function sugerirBares(db, { nombre = '', zona = '' } = {}, limite = 5) {
  if (!normalizar(nombre)) return [];
  const todos = db.prepare('SELECT * FROM bares ORDER BY nombre').all();
  const parecidos = todos.filter((b) => seParecen(b.nombre, nombre));
  parecidos.sort((a, b) => {
    const za = zona && normalizar(a.zona || '') === normalizar(zona) ? 0 : 1;
    const zb = zona && normalizar(b.zona || '') === normalizar(zona) ? 0 : 1;
    if (za !== zb) return za - zb;
    const ea = normalizar(a.nombre) === normalizar(nombre) ? 0 : 1;
    const eb = normalizar(b.nombre) === normalizar(nombre) ? 0 : 1;
    return ea - eb;
  });
  return parecidos.slice(0, limite).map(formatearBar);
}

export function existeBarIdentico(db, { nombre, zona }) {
  return db.prepare("SELECT id FROM bares WHERE nombre_norm = ? AND LOWER(COALESCE(zona, '')) = LOWER(?)")
    .all(normalizar(nombre), zona || '').length > 0;
}

export function listarZonas(db) {
  return db.prepare("SELECT zona, COUNT(*) AS n FROM bares WHERE zona IS NOT NULL AND zona <> '' GROUP BY zona ORDER BY zona").all()
    .map((f) => ({ zona: f.zona, bares: f.n }));
}
