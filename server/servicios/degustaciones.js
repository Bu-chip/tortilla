import { ahora, enTransaccion, nuevoId } from '../db.js';
import { ErrorHttp } from '../http.js';
import { texto } from './validar.js';
import { obtenerOCrearVariedad } from './variedades.js';
import { obtenerBar, crearBar, validarDatosBar, existeBarIdentico, sugerirBares } from './bares.js';

export { CRITERIOS, ASPECTOS, validarDatosDegustacion, formatearDegustacion } from './datos-degustacion.js';
import { CRITERIOS, ASPECTOS, validarDatosDegustacion, formatearDegustacion } from './datos-degustacion.js';

function grupoParaEscribir(db, personaId, grupoId) {
  const grupos = db.prepare('SELECT grupo_id FROM membresias WHERE persona_id = ? ORDER BY creado_en').all(personaId).map((f) => f.grupo_id);
  if (!grupos.length) throw new ErrorHttp(403, 'No perteneces a ningún grupo; no puedes guardar valoraciones todavía.');
  if (grupoId) {
    if (!grupos.includes(grupoId)) throw new ErrorHttp(403, 'No perteneces a ese grupo.');
    return grupoId;
  }
  return grupos[0];
}

const SELECT_DEGUSTACION = `
  SELECT d.*, p.nombre AS autor_nombre,
         b.nombre AS bar_nombre, b.zona AS bar_zona, b.ciudad AS bar_ciudad, b.direccion AS bar_direccion,
         v.nombre AS variedad_nombre, v.cebolla AS variedad_cebolla, v.vegana AS variedad_vegana, v.ingredientes AS variedad_ingredientes,
         g.nombre AS grupo_nombre
  FROM degustaciones d
  JOIN personas p ON p.id = d.autor_id
  JOIN bares b ON b.id = d.bar_id
  LEFT JOIN variedades v ON v.id = d.variedad_id
  JOIN grupos g ON g.id = d.grupo_id`;


/** Devuelve la degustación si es propia o pertenece a un grupo visible. */
export function obtenerDegustacion(db, persona, id, { incluirRetiradas = false } = {}) {
  const fila = db.prepare(`${SELECT_DEGUSTACION}
    WHERE d.id = @id AND (d.autor_id = @persona OR d.grupo_id IN (SELECT m.grupo_id FROM membresias m WHERE m.persona_id = @persona))`)
    .get({ id, persona: persona.id });
  if (!fila) return null;
  if (fila.retirada_en && !(incluirRetiradas && fila.autor_id === persona.id)) return null;
  return formatearDegustacion(fila, persona.id);
}

export function listarDegustaciones(db, persona, { solo = 'todas', barId = null, q = '', limite = 200, variedadId = null, desde = null, hasta = null, offset = 0 } = {}) {
  const partes = ['d.retirada_en IS NULL'];
  const params = { persona: persona.id };
  if (solo === 'mias') partes.push('d.autor_id = @persona');
  else partes.push('(d.autor_id = @persona OR d.grupo_id IN (SELECT m.grupo_id FROM membresias m WHERE m.persona_id = @persona))');
  if (solo === 'demas') partes.push('d.autor_id <> @persona');
  if (barId) { partes.push('d.bar_id = @bar'); params.bar = barId; }
  if (variedadId) { partes.push('d.variedad_id = @variedad'); params.variedad = variedadId; }
  if (desde) { partes.push('d.fecha >= @desde'); params.desde = desde; }
  if (hasta) { partes.push('d.fecha <= @hasta'); params.hasta = hasta; }
  if (q && q.trim()) { partes.push('(b.nombre LIKE @q OR COALESCE(b.zona, \'\') LIKE @q OR p.nombre LIKE @q)'); params.q = `%${q.trim()}%`; }
  params.limite = Math.min(Math.max(Number(limite) || 200, 1), 1000);
  params.offset = Math.max(0, Math.floor(Number(offset) || 0));
  return db.prepare(`${SELECT_DEGUSTACION} WHERE ${partes.join(' AND ')} ORDER BY d.fecha DESC, d.creado_en DESC, d.id DESC LIMIT @limite OFFSET @offset`)
    .all(params).map((fila) => formatearDegustacion(fila, persona.id));
}

/** Crea una degustación. Idempotente por (autor, opId): un reintento devuelve la existente. */
export function crearDegustacion(db, persona, cuerpo, { origen = null } = {}) {
  const opId = texto(cuerpo.opId, 'opId', { max: 120, min: 6 });
  const previa = db.prepare('SELECT id FROM degustaciones WHERE autor_id = ? AND op_id = ?').get(persona.id, opId);
  if (previa) return { degustacion: obtenerDegustacion(db, persona, previa.id, { incluirRetiradas: true }), repetida: true };
  if (!cuerpo.barId && cuerpo.nuevoBar) return enTransaccion(db, () => {
    const bar = resolverBarNuevo(db, persona, cuerpo.nuevoBar, cuerpo.forzarBar);
    return crearDegustacion(db, persona, { ...cuerpo, nuevoBar: null, barId: bar.id }, { origen });
  });
  const datos = validarDatosDegustacion(cuerpo);
  const grupoId = grupoParaEscribir(db, persona.id, cuerpo.grupoId);
  const bar = obtenerBar(db, datos.barId);
  if (!bar) throw new ErrorHttp(404, 'Ese bar no existe.', { campo: 'barId' });
  return enTransaccion(db, () => {
    const previa = db.prepare('SELECT id FROM degustaciones WHERE autor_id = ? AND op_id = ?').get(persona.id, opId);
    if (previa) return { degustacion: obtenerDegustacion(db, persona, previa.id, { incluirRetiradas: true }), repetida: true };
    const campos = camposGuardables(db, persona, datos);
    const id = nuevoId();
    const instante = ahora();
    insertarCampos(db, { id, op_id: opId, grupo_id: grupoId, autor_id: persona.id, ...campos,
      origen, retirada_en: null, creado_en: instante, actualizado_en: instante });
    return { degustacion: obtenerDegustacion(db, persona, id), repetida: false };
  });
}

/** Edita una degustación propia. Corregir no crea otra visita. */
export function editarDegustacion(db, persona, id, cuerpo) {
  const actual = db.prepare('SELECT * FROM degustaciones WHERE id = ?').get(id);
  if (!actual || actual.retirada_en) throw new ErrorHttp(404, 'Esa valoración no existe.');
  if (actual.autor_id !== persona.id) throw new ErrorHttp(403, 'Solo puedes editar tus propias valoraciones.');
  if (cuerpo.versionNota !== undefined && cuerpo.versionNota !== actual.version_nota) throw new ErrorHttp(400, 'Una corrección conserva el método original de valoración.');
  if (!cuerpo.barId && cuerpo.nuevoBar) return enTransaccion(db, () => {
    const bar = resolverBarNuevo(db, persona, cuerpo.nuevoBar, cuerpo.forzarBar);
    return editarDegustacion(db, persona, id, { ...cuerpo, nuevoBar: null, barId: bar.id });
  });
  const datos = validarDatosDegustacion({ ...cuerpo, versionNota: actual.version_nota, barId: cuerpo.barId ?? actual.bar_id });
  const bar = obtenerBar(db, datos.barId);
  if (!bar) throw new ErrorHttp(404, 'Ese bar no existe.', { campo: 'barId' });
  return enTransaccion(db, () => {
    const campos = { ...camposGuardables(db, persona, datos), actualizado_en: ahora() };
    db.prepare(`UPDATE degustaciones SET ${Object.keys(campos).map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND autor_id = ?`)
      .run(...Object.values(campos), id, persona.id);
    return obtenerDegustacion(db, persona, id);
  });
}

/** Retira (baja lógica) una degustación propia. Deja de contar en todas las medias. */
export function retirarDegustacion(db, persona, id) {
  const actual = db.prepare('SELECT id, autor_id, retirada_en FROM degustaciones WHERE id = ?').get(id);
  if (!actual || actual.retirada_en) throw new ErrorHttp(404, 'Esa valoración no existe.');
  if (actual.autor_id !== persona.id) throw new ErrorHttp(403, 'Solo puedes retirar tus propias valoraciones.');
  db.prepare('UPDATE degustaciones SET retirada_en = ?, actualizado_en = ? WHERE id = ? AND autor_id = ?').run(ahora(), ahora(), id, persona.id);
  return { id, retirada: true };
}

export function resumenPersona(db, personaId) {
  const fila = db.prepare(`SELECT COUNT(*) AS visitas, COUNT(DISTINCT bar_id) AS bares, SUM(CASE WHEN version_nota=1 THEN 1 ELSE 0 END) AS historicas FROM degustaciones WHERE autor_id = ? AND retirada_en IS NULL`).get(personaId);
  return { visitas: fila.visitas, bares: fila.bares };
}

// Solo estas columnas, definidas aquí, forman parte de la escritura; nunca claves recibidas del cliente.
function camposGuardables(db, persona, datos) {
  const variedad = datos.versionNota === 2 && datos.variedad.cebolla === 'no_se' ? null
    : obtenerOCrearVariedad(db, { barId: datos.barId, ...datos.variedad }, persona.id);
  return {
    bar_id: datos.barId, variedad_id: variedad?.id ?? null, receta_observada: JSON.stringify(datos.variedad),
    version_nota: datos.versionNota, nota_general: datos.notaGeneral, fecha: datos.fecha,
    ...Object.fromEntries([...new Set([...CRITERIOS, ...ASPECTOS])].map((k) => [k, datos.criterios[k] ?? null])),
    integracion: datos.integracion, tipo_cuajado: datos.tipoCuajado, sal: datos.sal, tamano: datos.tamano,
    formato: datos.formato, precio: datos.precio, acompanamientos: JSON.stringify(datos.acompanamientos),
    comentario: datos.comentario, comentario_privado: datos.comentarioPrivado ? 1 : 0,
  };
}
function insertarCampos(db, campos) {
  db.prepare(`INSERT INTO degustaciones (${Object.keys(campos).join(', ')}) VALUES (${Object.keys(campos).map(() => '?').join(', ')})`).run(...Object.values(campos));
}

function resolverBarNuevo(db, persona, entrada, forzar = false) {
  const datos = validarDatosBar(entrada);
  if (entrada.proveedorId) {
    const existente = db.prepare('SELECT id FROM bares WHERE proveedor_id = ?').get(entrada.proveedorId);
    if (existente) return obtenerBar(db, existente.id);
  }
  if (!forzar && existeBarIdentico(db, datos)) throw new ErrorHttp(409, 'Hay un lugar parecido. Comprueba la dirección antes de crear otra ficha.', { sugerencias: sugerirBares(db, datos) });
  const bar = crearBar(db, datos, persona.id, { esDemo: !!persona.esDemo });
  if (entrada.proveedorId) db.prepare('UPDATE bares SET proveedor_id = ? WHERE id = ?').run(entrada.proveedorId, bar.id);
  return bar;
}
