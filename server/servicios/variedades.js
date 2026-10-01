import { ahora, nuevoId } from '../identidad.js';
import { normalizar } from './texto.js';

export const CEBOLLA = ['con', 'sin', 'no_se'];
export const INGREDIENTES_SUGERIDOS = ['pimiento', 'chorizo', 'bacalao', 'calabacín', 'jamón', 'queso', 'setas', 'espinacas'];

const ETIQUETAS_CEBOLLA = { con: 'con cebolla', sin: 'sin cebolla', no_se: 'cebolla sin confirmar' };

export function normalizarIngredientes(lista = []) {
  const limpios = (Array.isArray(lista) ? lista : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const vistos = new Map();
  for (const ingrediente of limpios) {
    const clave = normalizar(ingrediente);
    if (clave && !vistos.has(clave)) vistos.set(clave, ingrediente);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

export function firmaVariedad({ cebolla, vegana, ingredientes }) {
  const claves = normalizarIngredientes(ingredientes).map(normalizar).sort();
  return `${cebolla}|${vegana ? 1 : 0}|${claves.join(',')}`;
}

export function nombreVariedad({ cebolla, vegana, ingredientes }) {
  const partes = [];
  if (vegana) partes.push('vegana');
  partes.push(ETIQUETAS_CEBOLLA[cebolla] || ETIQUETAS_CEBOLLA.no_se);
  const lista = normalizarIngredientes(ingredientes);
  if (lista.length) partes.push(lista.join(', '));
  const texto = partes.join(' · ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatearVariedad(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    barId: fila.bar_id,
    cebolla: fila.cebolla,
    vegana: fila.vegana === 1,
    ingredientes: JSON.parse(fila.ingredientes || '[]'),
    nombre: fila.nombre,
  };
}

export function obtenerOCrearVariedad(db, { barId, cebolla, vegana, ingredientes }, personaId = null) {
  const datos = { cebolla, vegana: !!vegana, ingredientes: normalizarIngredientes(ingredientes) };
  const firma = firmaVariedad(datos);
  const existente = db.prepare('SELECT * FROM variedades WHERE bar_id = ? AND firma = ?').get(barId, firma);
  if (existente) return formatearVariedad(existente);
  const id = nuevoId();
  db.prepare(`INSERT INTO variedades (id, bar_id, cebolla, vegana, ingredientes, firma, nombre, creado_por, creado_en)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, barId, datos.cebolla, datos.vegana ? 1 : 0, JSON.stringify(datos.ingredientes), firma, nombreVariedad(datos), personaId, ahora());
  return formatearVariedad(db.prepare('SELECT * FROM variedades WHERE id = ?').get(id));
}

export function obtenerVariedad(db, id) {
  return formatearVariedad(db.prepare('SELECT * FROM variedades WHERE id = ?').get(id));
}

export function variedadesDeBar(db, barId) {
  return db.prepare('SELECT * FROM variedades WHERE bar_id = ? ORDER BY nombre').all(barId).map(formatearVariedad);
}

export function variedadesDeBares(db, barIds) {
  const resultado = new Map(barIds.map((id) => [id, []]));
  if (!barIds.length) return resultado;
  const marcas = barIds.map(() => '?').join(',');
  for (const fila of db.prepare(`SELECT * FROM variedades WHERE bar_id IN (${marcas}) ORDER BY nombre`).all(...barIds)) {
    resultado.get(fila.bar_id)?.push(formatearVariedad(fila));
  }
  return resultado;
}

export function variedadesVeganas(db) {
  return db.prepare(`
    SELECT v.*, b.nombre AS bar_nombre, b.zona AS bar_zona, b.ciudad AS bar_ciudad
    FROM variedades v JOIN bares b ON b.id = v.bar_id
    WHERE v.vegana = 1 ORDER BY b.nombre, v.nombre`).all()
    .map((fila) => ({ ...formatearVariedad(fila), bar: { id: fila.bar_id, nombre: fila.bar_nombre, zona: fila.bar_zona, ciudad: fila.bar_ciudad } }));
}
