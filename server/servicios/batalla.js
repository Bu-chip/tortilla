import { ahora } from '../db.js';
import { ErrorHttp } from '../http.js';
import { EXPRESION_NOTA } from './medias.js';

/** La batalla usa una preferencia por persona, que se puede cambiar. Las degustaciones no votan. */
export function estadoBatalla(db, personaId) {
  const mia = db.prepare('SELECT lado, actualizado_en FROM preferencias_cebolla WHERE persona_id = ?').get(personaId);
  const votos = { con: 0, sin: 0 };
  const filas = db.prepare(`
    SELECT pc.lado, COUNT(*) AS n FROM preferencias_cebolla pc
    WHERE pc.persona_id IN (
      SELECT m2.persona_id FROM membresias m2
      WHERE m2.grupo_id IN (SELECT m.grupo_id FROM membresias m WHERE m.persona_id = @persona))
    GROUP BY pc.lado`).all({ persona: personaId });
  for (const fila of filas) votos[fila.lado] = fila.n;
  const total = votos.con + votos.sin;
  const miembros = db.prepare(`
    SELECT COUNT(DISTINCT m2.persona_id) AS n FROM membresias m2
    WHERE m2.grupo_id IN (SELECT m.grupo_id FROM membresias m WHERE m.persona_id = @persona)`).get({ persona: personaId }).n;

  const notas = { con: { media: null, valoraciones: 0 }, sin: { media: null, valoraciones: 0 } };
  const filasNotas = db.prepare(`
    SELECT v.cebolla, AVG(x.nota) AS media, COUNT(*) AS n
    FROM (SELECT d.variedad_id, d.nota_general AS nota FROM degustaciones d
          WHERE d.version_nota = 2 AND d.retirada_en IS NULL AND d.grupo_id IN (SELECT m.grupo_id FROM membresias m WHERE m.persona_id = @persona)) x
    JOIN variedades v ON v.id = x.variedad_id
    WHERE v.cebolla IN ('con', 'sin') GROUP BY v.cebolla`).all({ persona: personaId });
  for (const fila of filasNotas) notas[fila.cebolla] = { media: fila.media, valoraciones: fila.n };

  return {
    miLado: mia?.lado ?? null,
    actualizadoEn: mia?.actualizado_en ?? null,
    votos: { con: votos.con, sin: votos.sin, total, miembros },
    degustaciones: notas,
  };
}

export function fijarPreferencia(db, personaId, lado) {
  if (!['con', 'sin'].includes(lado)) throw new ErrorHttp(400, 'Elige «con» o «sin».', { campo: 'lado' });
  db.prepare(`INSERT INTO preferencias_cebolla (persona_id, lado, actualizado_en) VALUES (?, ?, ?)
              ON CONFLICT(persona_id) DO UPDATE SET lado = excluded.lado, actualizado_en = excluded.actualizado_en`)
    .run(personaId, lado, ahora());
  return estadoBatalla(db, personaId);
}

export function quitarPreferencia(db, personaId) {
  db.prepare('DELETE FROM preferencias_cebolla WHERE persona_id = ?').run(personaId);
  return estadoBatalla(db, personaId);
}
