/**
 * Cálculo de medias sobre el conjunto autorizado de degustaciones.
 * Cada degustación pesa lo mismo. «Tu media» usa todas las visitas de la persona;
 * «Los demás» excluye todas las de la persona actual. Nunca se promedia primero por persona.
 */

export const EXPRESION_NOTA = '(d.patata + d.jugosidad + d.cuajado + d.sabor + d.presentacion) / 5.0';

export const AGREGADOS = `
  AVG(CASE WHEN d.autor_id = @persona THEN d.nota END) AS tu_media,
  COUNT(CASE WHEN d.autor_id = @persona THEN 1 END) AS tu_visitas,
  AVG(CASE WHEN d.autor_id <> @persona THEN d.nota END) AS demas_media,
  COUNT(CASE WHEN d.autor_id <> @persona THEN 1 END) AS demas_valoraciones,
  COUNT(DISTINCT CASE WHEN d.autor_id <> @persona THEN d.autor_id END) AS demas_personas,
  AVG(d.nota) AS global_media,
  COUNT(d.id) AS global_valoraciones,
  COUNT(DISTINCT d.autor_id) AS global_personas`;

/** Condiciones del conjunto visible para @persona, con filtros opcionales. Devuelve SQL y parámetros usados. */
export function condicionesVisibles({ barId = null, variedadId = null, desde = null, hasta = null, cebolla = null, vegana = false, metodo = 'general' } = {}) {
  const partes = [
    'd.retirada_en IS NULL',
    "d.grupo_id IN (SELECT m.grupo_id FROM membresias m WHERE m.persona_id = @persona AND m.rol IN ('admin','miembro'))",
  ];
  const params = {};
  partes.push(metodo === 'historica' ? 'd.version_nota = 1' : 'd.version_nota = 2');
  if (barId) { partes.push('d.bar_id = @bar'); params.bar = barId; }
  if (variedadId) { partes.push('d.variedad_id = @variedad'); params.variedad = variedadId; }
  if (desde) { partes.push('d.fecha >= @desde'); params.desde = desde; }
  if (hasta) { partes.push('d.fecha <= @hasta'); params.hasta = hasta; }
  if (cebolla) {
    partes.push("(d.variedad_id IN (SELECT v.id FROM variedades v WHERE v.cebolla = @cebolla) OR (d.variedad_id IS NULL AND json_extract(d.receta_observada, '$.cebolla') = @cebolla))");
    params.cebolla = cebolla;
  }
  if (vegana) partes.push("(d.variedad_id IN (SELECT v.id FROM variedades v WHERE v.vegana = 1) OR (d.variedad_id IS NULL AND json_extract(d.receta_observada, '$.vegana') = 1))");
  return { sql: partes.join(' AND '), params };
}

export function fuente(filtros) {
  const { sql, params } = condicionesVisibles(filtros);
  return { sql: `(SELECT d.*, ${filtros?.metodo === 'historica' ? EXPRESION_NOTA : 'd.nota_general'} AS nota FROM degustaciones d WHERE ${sql}) d`, params };
}

export function formatearMedias(fila) {
  return {
    tu: { media: fila?.tu_media ?? null, visitas: fila?.tu_visitas ?? 0 },
    demas: {
      media: fila?.demas_media ?? null,
      valoraciones: fila?.demas_valoraciones ?? 0,
      personas: fila?.demas_personas ?? 0,
    },
    global: {
      media: fila?.global_media ?? null,
      valoraciones: fila?.global_valoraciones ?? 0,
      personas: fila?.global_personas ?? 0,
    },
  };
}

export function mediasDeBar(db, personaId, filtros = {}) {
  const f = fuente(filtros);
  const fila = db.prepare(`SELECT ${AGREGADOS} FROM ${f.sql}`).get({ persona: personaId, ...f.params });
  return formatearMedias(fila);
}

/** Medias de todos los bares visibles, agrupadas por bar. */
export function mediasPorBar(db, personaId, filtros = {}) {
  const f = fuente(filtros);
  const filas = db.prepare(`SELECT d.bar_id, ${AGREGADOS} FROM ${f.sql} GROUP BY d.bar_id`).all({ persona: personaId, ...f.params });
  return new Map(filas.map((fila) => [fila.bar_id, formatearMedias(fila)]));
}

/** Medias por variedad (dentro de un bar o en todo el ámbito). */
export function mediasPorVariedad(db, personaId, filtros = {}) {
  const f = fuente(filtros);
  const filas = db.prepare(`SELECT d.variedad_id, ${AGREGADOS} FROM ${f.sql} GROUP BY d.variedad_id`).all({ persona: personaId, ...f.params });
  return new Map(filas.map((fila) => [fila.variedad_id, formatearMedias(fila)]));
}

export function mediaSegunPerspectiva(medias, perspectiva) {
  if (perspectiva === 'tu') return { media: medias.tu.media, n: medias.tu.visitas };
  if (perspectiva === 'global') return { media: medias.global.media, n: medias.global.valoraciones };
  return { media: medias.demas.media, n: medias.demas.valoraciones };
}

export function compararPorPerspectiva(perspectiva) {
  return (a, b) => {
    const ma = mediaSegunPerspectiva(a.medias, perspectiva);
    const mb = mediaSegunPerspectiva(b.medias, perspectiva);
    if (ma.media === null && mb.media === null) return a.nombre.localeCompare(b.nombre, 'es');
    if (ma.media === null) return 1;
    if (mb.media === null) return -1;
    if (mb.media !== ma.media) return mb.media - ma.media;
    if (mb.n !== ma.n) return mb.n - ma.n;
    return a.nombre.localeCompare(b.nombre, 'es');
  };
}
