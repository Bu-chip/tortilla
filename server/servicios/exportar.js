import { ahora } from '../db.js';

const COLUMNAS_PERSONA = 'id, nombre, usuario, es_demo, creado_en';

function analizarJson(fila, campos) {
  const copia = { ...fila };
  for (const campo of campos) {
    try { copia[campo] = JSON.parse(copia[campo] ?? '[]'); } catch { copia[campo] = []; }
  }
  return copia;
}

const filaVariedad = (f) => analizarJson(f, ['ingredientes']);
const filaDegustacion = (f) => analizarJson(f, ['acompanamientos', 'receta_observada']);

/** Exportación de una persona: sus degustaciones (incluidas las retiradas) y los bares y variedades a los que se refieren. */
export function exportarPersona(db, personaId) {
  const persona = db.prepare(`SELECT ${COLUMNAS_PERSONA} FROM personas WHERE id = ?`).get(personaId);
  const degustaciones = db.prepare('SELECT * FROM degustaciones WHERE autor_id = ? ORDER BY fecha, creado_en').all(personaId).map(filaDegustacion);
  const barIds = [...new Set(degustaciones.map((d) => d.bar_id))];
  const variedadIds = [...new Set(degustaciones.map((d) => d.variedad_id))];
  const bares = barIds.map((id) => db.prepare('SELECT * FROM bares WHERE id = ?').get(id)).filter(Boolean);
  const variedades = variedadIds.map((id) => db.prepare('SELECT * FROM variedades WHERE id = ?').get(id)).filter(Boolean).map(filaVariedad);
  const grupos = db.prepare('SELECT g.id, g.nombre, g.es_demo, g.creado_en FROM grupos g JOIN membresias m ON m.grupo_id = g.id WHERE m.persona_id = ?').all(personaId);
  const membresias = db.prepare('SELECT persona_id, grupo_id, rol, creado_en FROM membresias WHERE persona_id = ?').all(personaId);
  const preferencia = db.prepare('SELECT persona_id, lado, actualizado_en FROM preferencias_cebolla WHERE persona_id = ?').get(personaId) ?? null;
  return {
    formato: 'tortillas-exportacion',
    version: 2,
    alcance: 'persona',
    exportadoEn: ahora(),
    personas: [persona],
    grupos,
    membresias,
    bares,
    variedades,
    degustaciones,
    preferencias: preferencia ? [preferencia] : [],
  };
}

/** Exportación completa de la instancia (herramienta de administración). Nunca incluye claves ni sesiones. */
export function exportarTodo(db) {
  return {
    formato: 'tortillas-exportacion',
    version: 2,
    alcance: 'completo',
    exportadoEn: ahora(),
    personas: db.prepare(`SELECT ${COLUMNAS_PERSONA} FROM personas ORDER BY creado_en`).all(),
    grupos: db.prepare('SELECT id, nombre, codigo_invitacion, es_demo, creado_en FROM grupos ORDER BY creado_en').all(),
    membresias: db.prepare('SELECT persona_id, grupo_id, rol, creado_en FROM membresias').all(),
    bares: db.prepare('SELECT * FROM bares ORDER BY creado_en').all(),
    variedades: db.prepare('SELECT * FROM variedades ORDER BY creado_en').all().map(filaVariedad),
    degustaciones: db.prepare('SELECT * FROM degustaciones ORDER BY fecha, creado_en').all().map(filaDegustacion),
    preferencias: db.prepare('SELECT persona_id, lado, actualizado_en FROM preferencias_cebolla').all(),
  };
}
