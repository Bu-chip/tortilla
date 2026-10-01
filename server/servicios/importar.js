import crypto from 'node:crypto';
import { ahora, enTransaccion } from '../db.js';
import { ErrorHttp } from '../http.js';
import { normalizar } from './texto.js';
import { crearBar, obtenerBar, sugerirBares } from './bares.js';
import { crearDegustacion } from './degustaciones.js';
import { firmaVariedad } from './variedades.js';
import { nota as validarNota } from './validar.js';

/**
 * Restaura una exportación propia (formato tortillas-exportacion v1) sin duplicar registros.
 * Los registros existentes se conservan; los identificadores en conflicto se reasignan de forma explícita.
 */
export function importarExportacion(db, datos) {
  if (!datos || datos.formato !== 'tortillas-exportacion' || ![1, 2].includes(datos.version)) {
    throw new ErrorHttp(400, 'El archivo no es una exportación reconocida (tortillas-exportacion v1 o v2).');
  }
  const resumen = {};
  const cuenta = (tabla, clave) => { resumen[tabla] ??= { insertados: 0, omitidos: 0, reasignados: 0 }; resumen[tabla][clave] += 1; };
  const personas = new Map();
  const grupos = new Map();
  const bares = new Map();
  const variedades = new Map();

  return enTransaccion(db, () => {
    for (const p of datos.personas ?? []) {
      const porId = db.prepare('SELECT id FROM personas WHERE id = ?').get(p.id);
      if (porId) { personas.set(p.id, p.id); cuenta('personas', 'omitidos'); continue; }
      const porUsuario = db.prepare('SELECT id FROM personas WHERE usuario = ?').get(p.usuario);
      if (porUsuario) { personas.set(p.id, porUsuario.id); cuenta('personas', 'reasignados'); continue; }
      db.prepare('INSERT INTO personas (id, nombre, usuario, clave_hash, es_demo, creado_en) VALUES (?, ?, ?, NULL, ?, ?)')
        .run(p.id, p.nombre, p.usuario, p.es_demo ? 1 : 0, p.creado_en || ahora());
      personas.set(p.id, p.id);
      cuenta('personas', 'insertados');
    }
    for (const g of datos.grupos ?? []) {
      if (db.prepare('SELECT id FROM grupos WHERE id = ?').get(g.id)) { grupos.set(g.id, g.id); cuenta('grupos', 'omitidos'); continue; }
      db.prepare('INSERT INTO grupos (id, nombre, codigo_invitacion, es_demo, creado_en) VALUES (?, ?, ?, ?, ?)')
        .run(g.id, g.nombre, g.codigo_invitacion ?? null, g.es_demo ? 1 : 0, g.creado_en || ahora());
      grupos.set(g.id, g.id);
      cuenta('grupos', 'insertados');
    }
    for (const m of datos.membresias ?? []) {
      const personaId = personas.get(m.persona_id) ?? m.persona_id;
      const grupoId = grupos.get(m.grupo_id) ?? m.grupo_id;
      if (!db.prepare('SELECT 1 FROM personas WHERE id = ?').get(personaId) || !db.prepare('SELECT 1 FROM grupos WHERE id = ?').get(grupoId)) { cuenta('membresias', 'omitidos'); continue; }
      const r = db.prepare('INSERT OR IGNORE INTO membresias (persona_id, grupo_id, rol, creado_en) VALUES (?, ?, ?, ?)')
        .run(personaId, grupoId, m.rol || 'miembro', m.creado_en || ahora());
      cuenta('membresias', r.changes ? 'insertados' : 'omitidos');
    }
    for (const b of datos.bares ?? []) {
      const proveedor = b.proveedor_id ? db.prepare('SELECT id FROM bares WHERE proveedor_id = ?').get(b.proveedor_id) : null;
      if (proveedor) { bares.set(b.id, proveedor.id); cuenta('bares', 'reasignados'); continue; }
      if (db.prepare('SELECT id FROM bares WHERE id = ?').get(b.id)) { bares.set(b.id, b.id); cuenta('bares', 'omitidos'); continue; }
      db.prepare(`INSERT INTO bares (id, nombre, nombre_norm, zona, ciudad, direccion, lat, lng, es_demo, creado_por, creado_en, actualizado_en, proveedor_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(b.id, b.nombre, normalizar(b.nombre), b.zona ?? null, b.ciudad ?? null, b.direccion ?? null, b.lat ?? null, b.lng ?? null,
          b.es_demo ? 1 : 0, personas.get(b.creado_por) ?? null, b.creado_en || ahora(), b.actualizado_en || b.creado_en || ahora(), b.proveedor_id ?? null);
      bares.set(b.id, b.id);
      cuenta('bares', 'insertados');
    }
    for (const v of datos.variedades ?? []) {
      const barId = bares.get(v.bar_id) ?? v.bar_id;
      if (db.prepare('SELECT id FROM variedades WHERE id = ?').get(v.id)) { variedades.set(v.id, v.id); cuenta('variedades', 'omitidos'); continue; }
      const ingredientes = Array.isArray(v.ingredientes) ? v.ingredientes : [];
      const firma = v.firma || firmaVariedad({ cebolla: v.cebolla, vegana: !!v.vegana, ingredientes });
      const misma = db.prepare('SELECT id FROM variedades WHERE bar_id = ? AND firma = ?').get(barId, firma);
      if (misma) { variedades.set(v.id, misma.id); cuenta('variedades', 'reasignados'); continue; }
      if (!db.prepare('SELECT 1 FROM bares WHERE id = ?').get(barId)) { cuenta('variedades', 'omitidos'); continue; }
      db.prepare(`INSERT INTO variedades (id, bar_id, cebolla, vegana, ingredientes, firma, nombre, creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(v.id, barId, v.cebolla, v.vegana ? 1 : 0, JSON.stringify(ingredientes), firma, v.nombre, personas.get(v.creado_por) ?? null, v.creado_en || ahora());
      variedades.set(v.id, v.id);
      cuenta('variedades', 'insertados');
    }
    for (const d of datos.degustaciones ?? []) {
      const autorId = personas.get(d.autor_id) ?? d.autor_id;
      const grupoId = grupos.get(d.grupo_id) ?? d.grupo_id;
      const barId = bares.get(d.bar_id) ?? d.bar_id;
      const variedadId = variedades.get(d.variedad_id) ?? d.variedad_id;
      if (db.prepare('SELECT id FROM degustaciones WHERE id = ? OR (autor_id = ? AND op_id = ?)').get(d.id, autorId, d.op_id)) { cuenta('degustaciones', 'omitidos'); continue; }
      const existen = ['personas', 'grupos', 'bares'].every((tabla, i) => db.prepare(`SELECT 1 FROM ${tabla} WHERE id = ?`).get([autorId, grupoId, barId, variedadId][i]));
      if (!existen) { cuenta('degustaciones', 'omitidos'); continue; }
      if (variedadId && !db.prepare('SELECT 1 FROM variedades WHERE id = ? AND bar_id = ?').get(variedadId, barId)) throw new ErrorHttp(400, 'La receta no pertenece al bar de la visita.');
      const version = d.version_nota ?? 1;
      if (version === 2) validarNota(d.nota_general, 'nota general');
      for (const clave of (version === 2 ? ['patata', 'sabor', 'textura', 'equilibrio', 'presentacion'] : ['patata', 'jugosidad', 'cuajado', 'sabor', 'presentacion'])) validarNota(d[clave], clave, { opcional: version === 2 });
      db.prepare(`INSERT INTO degustaciones (id, op_id, grupo_id, autor_id, bar_id, variedad_id, fecha,
          patata, jugosidad, cuajado, sabor, presentacion, integracion, tipo_cuajado, sal, tamano, formato, precio,
          acompanamientos, comentario, comentario_privado, origen, retirada_en, creado_en, actualizado_en, version_nota, nota_general, textura, equilibrio, receta_observada)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(d.id, d.op_id, grupoId, autorId, barId, variedadId ?? null, d.fecha,
          d.patata ?? null, d.jugosidad ?? null, d.cuajado ?? null, d.sabor ?? null, d.presentacion ?? null, d.integracion ?? null, d.tipo_cuajado ?? null, d.sal ?? null,
          d.tamano ?? null, d.formato ?? null, d.precio ?? null, JSON.stringify(Array.isArray(d.acompanamientos) ? d.acompanamientos : []),
          d.comentario ?? null, d.comentario_privado ? 1 : 0, d.origen ?? 'importacion', d.retirada_en ?? null, d.creado_en || ahora(), d.actualizado_en || d.creado_en || ahora(), version, d.nota_general ?? null, d.textura ?? null, d.equilibrio ?? null, JSON.stringify(typeof d.receta_observada === 'object' && d.receta_observada ? d.receta_observada : {}));
      cuenta('degustaciones', 'insertados');
    }
    for (const p of datos.preferencias ?? []) {
      const personaId = personas.get(p.persona_id) ?? p.persona_id;
      if (!db.prepare('SELECT 1 FROM personas WHERE id = ?').get(personaId)) { cuenta('preferencias', 'omitidos'); continue; }
      const r = db.prepare('INSERT OR IGNORE INTO preferencias_cebolla (persona_id, lado, actualizado_en) VALUES (?, ?, ?)').run(personaId, p.lado, p.actualizado_en || ahora());
      cuenta('preferencias', r.changes ? 'insertados' : 'omitidos');
    }
    return resumen;
  });
}

/* ---------- Importación revisable del Tortillómetro antiguo (clave localStorage «tortillometro_v2») ---------- */

const CEBOLLA_ANTIGUA = { 'con cebolla': 'con', 'sin cebolla': 'sin' };
const CUAJADO_ANTIGUO = { 'poco cuajada': 'poco', 'punto medio': 'medio', 'bien cuajada': 'bien' };

function fechaAntigua(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  let m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function opIdAntiguo(entrada, indice) {
  if (entrada.id !== undefined && entrada.id !== null && String(entrada.id).trim()) return `tortillometro_v2:${String(entrada.id).trim()}`;
  const resumen = crypto.createHash('sha1').update(JSON.stringify(entrada)).digest('hex').slice(0, 16);
  return `tortillometro_v2:sin-id-${resumen}-${indice}`;
}

/** Convierte una entrada antigua en una degustación candidata con problemas y sugerencias de bar. */
export function previsualizarImportacionAntigua(db, persona, entradas) {
  if (!Array.isArray(entradas)) throw new ErrorHttp(400, 'Se esperaba una lista de valoraciones antiguas.');
  if (entradas.length > 500) throw new ErrorHttp(400, 'Demasiadas entradas de una vez (máximo 500).');
  return entradas.map((entrada, indice) => {
    const e = entrada && typeof entrada === 'object' ? entrada : {};
    const problemas = [];
    const c = e.criterios && typeof e.criterios === 'object' ? e.criterios : {};
    const criterios = {
      patata: c.patata,
      jugosidad: c.jugosidad,
      cuajado: c.cuajado2 ?? c.cuajado,
      sabor: c.sabor,
      presentacion: c.presentacion,
    };
    for (const [clave, valor] of Object.entries(criterios)) {
      try { criterios[clave] = validarNota(valor, clave); } catch (error) { problemas.push(error.message); }
    }
    const nombreBar = typeof e.bar === 'string' ? e.bar.trim() : '';
    if (!nombreBar) problemas.push('Falta el nombre del bar.');
    const fecha = fechaAntigua(e.fecha);
    if (!fecha) problemas.push('No se reconoce la fecha; se pedirá una.');
    const extras = Array.isArray(e.extras) ? e.extras.map((x) => String(x).toLowerCase()) : [];
    const vegana = extras.includes('vegana');
    const ingredientes = extras.filter((x) => x !== 'vegana');
    const opId = opIdAntiguo(e, indice);
    const yaImportada = !!db.prepare('SELECT 1 FROM degustaciones WHERE autor_id = ? AND op_id = ?').get(persona.id, opId);
    return {
      indice,
      opId,
      original: e,
      candidata: {
        barNombre: nombreBar,
        barZona: typeof e.ciudad === 'string' ? e.ciudad.trim() : '',
        fecha,
        criterios,
        variedad: { cebolla: CEBOLLA_ANTIGUA[String(e.cebolla || '').toLowerCase()] || 'no_se', vegana, ingredientes },
        tipoCuajado: CUAJADO_ANTIGUO[String(e.cuajado || '').toLowerCase()] || null,
      },
      sugerencias: nombreBar ? sugerirBares(db, { nombre: nombreBar, zona: e.ciudad }) : [],
      problemas,
      yaImportada,
    };
  });
}

/** Crea las degustaciones elegidas tras la revisión. Cada elemento indica bar existente o bar nuevo. */
export function importarAntiguo(db, persona, elementos) {
  if (!Array.isArray(elementos)) throw new ErrorHttp(400, 'Se esperaba una lista de elementos revisados.');
  const resultado = { creadas: 0, repetidas: 0, errores: [] };
  for (const elemento of elementos) {
    try {
      const candidata = elemento?.candidata;
      if (!candidata) throw new ErrorHttp(400, 'Elemento sin datos.');
      const repetida = enTransaccion(db, () => {
      if (db.prepare('SELECT 1 FROM degustaciones WHERE autor_id = ? AND op_id = ?').get(persona.id, elemento.opId)) return true;
      let bar = elemento.barId ? obtenerBar(db, elemento.barId) : null;
      if (!bar) {
        if (!candidata.barNombre) throw new ErrorHttp(400, 'Falta el bar.');
        bar = crearBar(db, { nombre: candidata.barNombre, zona: candidata.barZona || null, ciudad: null, direccion: null, lat: null, lng: null }, persona.id);
      }
      const { repetida } = crearDegustacion(db, persona, {
        opId: elemento.opId,
        barId: bar.id,
        variedad: candidata.variedad,
        fecha: elemento.fecha || candidata.fecha,
        criterios: candidata.criterios,
        tipoCuajado: candidata.tipoCuajado,
      }, { origen: 'importacion:tortillometro_v2' });
      return repetida;
      });
      resultado[repetida ? 'repetidas' : 'creadas'] += 1;
    } catch (error) {
      resultado.errores.push({ opId: elemento?.opId ?? null, mensaje: error.message });
    }
  }
  return resultado;
}
