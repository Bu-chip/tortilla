/**
 * Datos de demostración claramente ficticios. Sirven para probar «Tu media» y «Los demás»
 * con visitas repetidas. No contienen notas reales de nadie.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBaseDeDatos, ahora, enTransaccion } from './db.js';
import { leerConfig } from './config.js';
import { crearBar } from './servicios/bares.js';
import { crearDegustacion } from './servicios/degustaciones.js';
import { fijarPreferencia } from './servicios/batalla.js';

export const GRUPO_DEMO = { id: 'grupo-demo', nombre: 'Conjunto de prueba', codigo: 'DEMO-AMIGOS' };

export const PERSONAS_DEMO = [
  { id: 'persona-demo-ana', usuario: 'ana-demo', nombre: 'Ana (demo)' },
  { id: 'persona-demo-benat', usuario: 'benat-demo', nombre: 'Beñat (demo)' },
  { id: 'persona-demo-carla', usuario: 'carla-demo', nombre: 'Carla (demo)' },
];

// Direcciones verificadas en las webs de los establecimientos. Opiniones y recetas: exclusivamente ficticias.
const BARES_DEMO = [
  { clave: 'bar-a', nombre: 'Baster', zona: 'Casco Viejo', ciudad: 'Bilbao', direccion: 'Correo, 22', lat: null, lng: null },
  { clave: 'bar-b', nombre: 'Gure Toki', zona: 'Casco Viejo', ciudad: 'Bilbao', direccion: 'Plaza Nueva, 12', lat: null, lng: null },
  { clave: 'taberna', nombre: 'Egur re', zona: 'Casco Viejo', ciudad: 'Bilbao', direccion: 'María Muñoz, 6', lat: null, lng: null },
  { clave: 'cafe', nombre: 'El Globo · Plaza Nueva', zona: 'Casco Viejo', ciudad: 'Bilbao', direccion: 'Plaza Nueva, 1', lat: null, lng: null },
  { clave: 'casa', nombre: 'El Globo · Diputación', zona: 'Abando', ciudad: 'Bilbao', direccion: 'Diputación, 8', lat: null, lng: null },
  { clave: 'bodega', nombre: 'La Viña del Ensanche', zona: 'Abando', ciudad: 'Bilbao', direccion: 'Diputación, 10', lat: null, lng: null },
];

const SIN = { cebolla: 'sin', vegana: false, ingredientes: [] };
const CON = { cebolla: 'con', vegana: false, ingredientes: [] };
const iguales = (n) => ({ patata: n, jugosidad: n, cuajado: n, sabor: n, presentacion: n });
const notas = (p, j, c, s, pr) => ({ patata: p, jugosidad: j, cuajado: c, sabor: s, presentacion: pr });

const VISITAS_DEMO = [
  // Ejemplo obligatorio: Ana 8 y 6, Beñat 9 y 7 en el Bar de prueba A.
  { clave: 'a1', persona: 'ana-demo', bar: 'bar-a', variedad: SIN, fecha: '2026-09-01', criterios: iguales(8), tipoCuajado: 'medio', sal: 'a_punto', formato: 'pincho', precio: 2.5, comentario: 'Primera visita de prueba. Buen pincho.' },
  { clave: 'a2', persona: 'ana-demo', bar: 'bar-a', variedad: SIN, fecha: '2026-09-08', criterios: iguales(6), tipoCuajado: 'bien', sal: 'sosa', comentario: 'Esta vez venía más seca.' },
  { clave: 'b1', persona: 'benat-demo', bar: 'bar-a', variedad: SIN, fecha: '2026-09-10', criterios: iguales(9), tipoCuajado: 'poco', integracion: 9 },
  { clave: 'b2', persona: 'benat-demo', bar: 'bar-a', variedad: CON, fecha: '2026-09-12', criterios: iguales(7), tipoCuajado: 'medio', tamano: 'generosa', formato: 'racion', precio: 6 },

  { clave: 't1', persona: 'benat-demo', bar: 'taberna', variedad: { cebolla: 'con', vegana: false, ingredientes: ['pimiento'] }, fecha: '2026-08-20', criterios: notas(8.5, 9, 8, 9, 7.5), tipoCuajado: 'medio', sal: 'a_punto', formato: 'pincho', precio: 2.4, comentario: 'El pimiento le sienta de maravilla.' },
  { clave: 't2', persona: 'carla-demo', bar: 'taberna', variedad: CON, fecha: '2026-09-05', criterios: notas(7, 8.5, 7.5, 8, 7), integracion: 8, tipoCuajado: 'poco' },
  { clave: 't3', persona: 'ana-demo', bar: 'taberna', variedad: CON, fecha: '2026-09-20', criterios: notas(9, 9.5, 8.5, 9.5, 8), tamano: 'generosa', formato: 'conjunto', precio: 3.5, acompanamientos: ['pan', 'cafe'], comentario: 'Con pan y café por 3,50. Repetiré.' },

  { clave: 'c1', persona: 'carla-demo', bar: 'cafe', variedad: { cebolla: 'sin', vegana: true, ingredientes: [] }, fecha: '2026-07-14', criterios: notas(7.5, 7, 7.5, 8, 8.5), comentario: 'Nota privada de prueba: preguntar qué usan en vez de huevo.', comentarioPrivado: true },
  { clave: 'c2', persona: 'ana-demo', bar: 'cafe', variedad: { cebolla: 'con', vegana: true, ingredientes: ['pimiento'] }, fecha: '2026-08-02', criterios: notas(6, 6.5, 7, 6.5, 7), tipoCuajado: 'bien' },
  { clave: 'c3', persona: 'carla-demo', bar: 'cafe', variedad: { cebolla: 'sin', vegana: true, ingredientes: [] }, fecha: '2026-09-18', criterios: notas(8, 8, 8, 8.5, 8.5), tipoCuajado: 'medio', sal: 'a_punto', formato: 'pincho', precio: 2.2 },

  { clave: 'k1', persona: 'benat-demo', bar: 'casa', variedad: { cebolla: 'con', vegana: false, ingredientes: ['chorizo'] }, fecha: '2026-06-30', criterios: notas(5, 4.5, 6, 5.5, 6), tipoCuajado: 'bien', sal: 'salada', comentario: 'Demasiado hecha para mi gusto.' },
  { clave: 'k2', persona: 'carla-demo', bar: 'casa', variedad: { cebolla: 'con', vegana: false, ingredientes: ['chorizo'] }, fecha: '2026-07-02', criterios: notas(6, 5, 6.5, 6, 6.5), tipoCuajado: 'bien' },

  { clave: 'g1', persona: 'ana-demo', bar: 'bodega', variedad: SIN, fecha: '2026-05-11', criterios: notas(9.5, 10, 9, 10, 9), tipoCuajado: 'poco', sal: 'a_punto', formato: 'pincho', precio: 2.8, comentario: 'La mejor hasta ahora (en la demo).' },
  { clave: 'g2', persona: 'benat-demo', bar: 'bodega', variedad: SIN, fecha: '2026-05-11', criterios: notas(9, 9.5, 9, 9.5, 8.5), tipoCuajado: 'poco', integracion: 9.5 },
  { clave: 'g3', persona: 'ana-demo', bar: 'bodega', variedad: SIN, fecha: '2026-09-25', criterios: notas(8, 8.5, 8, 9, 8.5), tipoCuajado: 'medio', tamano: 'media', formato: 'pincho', precio: 3 },
];

const PREFERENCIAS_DEMO = [
  { persona: 'ana-demo', lado: 'con' },
  { persona: 'benat-demo', lado: 'sin' },
];

function borrarDemo(db) {
  const personas = db.prepare('SELECT id FROM personas WHERE es_demo = 1').all().map((p) => p.id);
  const baresDemo = db.prepare('SELECT id FROM bares WHERE es_demo = 1').all().map((b) => b.id);
  const lista = (ids) => ids.map(() => '?').join(',') || "''";
  db.prepare(`DELETE FROM degustaciones WHERE autor_id IN (${lista(personas)}) OR bar_id IN (${lista(baresDemo)}) OR grupo_id = ?`).run(...personas, ...baresDemo, GRUPO_DEMO.id);
  db.prepare(`DELETE FROM variedades WHERE bar_id IN (${lista(baresDemo)})`).run(...baresDemo);
  db.prepare(`DELETE FROM preferencias_cebolla WHERE persona_id IN (${lista(personas)})`).run(...personas);
  db.prepare(`DELETE FROM sesiones WHERE persona_id IN (${lista(personas)})`).run(...personas);
  db.prepare(`DELETE FROM membresias WHERE persona_id IN (${lista(personas)}) OR grupo_id = ?`).run(...personas, GRUPO_DEMO.id);
  db.prepare('DELETE FROM bares WHERE es_demo = 1').run();
  db.prepare('DELETE FROM personas WHERE es_demo = 1').run();
  db.prepare('DELETE FROM grupos WHERE id = ?').run(GRUPO_DEMO.id);
}

export function sembrarDemo(db, { reiniciar = false } = {}) {
  const existe = db.prepare('SELECT 1 FROM grupos WHERE id = ?').get(GRUPO_DEMO.id);
  if (existe && !reiniciar) return { yaExistia: true };
  return enTransaccion(db, () => {
    if (existe) borrarDemo(db);
    const instante = ahora();
    db.prepare('INSERT INTO grupos (id, nombre, codigo_invitacion, es_demo, creado_en) VALUES (?, ?, ?, 1, ?)')
      .run(GRUPO_DEMO.id, GRUPO_DEMO.nombre, GRUPO_DEMO.codigo, instante);
    const personas = new Map();
    for (const p of PERSONAS_DEMO) {
      db.prepare('INSERT INTO personas (id, nombre, usuario, clave_hash, es_demo, creado_en) VALUES (?, ?, ?, NULL, 1, ?)').run(p.id, p.nombre, p.usuario, instante);
      db.prepare('INSERT INTO membresias (persona_id, grupo_id, rol, creado_en) VALUES (?, ?, ?, ?)').run(p.id, GRUPO_DEMO.id, 'miembro', instante);
      personas.set(p.usuario, { id: p.id, nombre: p.nombre, usuario: p.usuario });
    }
    const bares = new Map();
    for (const b of BARES_DEMO) {
      const { clave, ...datos } = b;
      bares.set(clave, crearBar(db, datos, null, { esDemo: true }));
    }
    let visitas = 0;
    for (const v of VISITAS_DEMO) {
      const { clave, persona, bar, ...datos } = v;
      const nuevas = { versionNota: 2, notaGeneral: ({ a1: 8, a2: 6, b1: 9, b2: 7, t1: 8.5, t2: 8, t3: 9, c1: 7.5, c2: 6.5, c3: 8.5, k1: 5.5, k2: 6, g1: 9.5, g2: 9, g3: 8.5 })[clave], criterios: { sabor: datos.criterios.sabor, patata: datos.criterios.patata, textura: datos.criterios.jugosidad, equilibrio: datos.integracion ?? null, presentacion: datos.criterios.presentacion } };
      crearDegustacion(db, personas.get(persona), { opId: `demo:${clave}`, barId: bares.get(bar).id, grupoId: GRUPO_DEMO.id, ...datos, ...nuevas }, { origen: 'demo' });
      visitas += 1;
    }
    for (const p of PREFERENCIAS_DEMO) fijarPreferencia(db, personas.get(p.persona).id, p.lado);
    return { yaExistia: false, creados: { personas: personas.size, bares: bares.size, visitas } };
  });
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const config = leerConfig(process.env, raiz);
  const db = abrirBaseDeDatos(config.rutaDb);
  const resultado = sembrarDemo(db, { reiniciar: process.argv.includes('--reiniciar') });
  if (resultado.yaExistia) console.log('Los datos de demostración ya existían. Usa --reiniciar para regenerarlos.');
  else console.log(`Datos de demostración creados en ${config.rutaDb}:`, resultado.creados);
}
