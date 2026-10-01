import { abrirBaseDeDatos, ahora } from '../db.js';
import { crearBar } from '../servicios/bares.js';
import { crearDegustacion } from '../servicios/degustaciones.js';
import { hashClave } from '../auth.js';

export function crearPersona(db, id, nombre, usuario, { clave = null, esDemo = false } = {}) {
  db.prepare('INSERT INTO personas (id, nombre, usuario, clave_hash, es_demo, creado_en) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, nombre, usuario, clave ? hashClave(clave) : null, esDemo ? 1 : 0, ahora());
  return { id, nombre, usuario };
}

export function crearGrupo(db, id, nombre, codigo = null, { esDemo = false } = {}) {
  db.prepare('INSERT INTO grupos (id, nombre, codigo_invitacion, es_demo, creado_en) VALUES (?, ?, ?, ?, ?)').run(id, nombre, codigo, esDemo ? 1 : 0, ahora());
  return { id, nombre };
}

export function unir(db, personaId, grupoId) {
  db.prepare('INSERT INTO membresias (persona_id, grupo_id, rol, creado_en) VALUES (?, ?, ?, ?)').run(personaId, grupoId, 'miembro', ahora());
}

export const iguales = (n) => ({ patata: n, jugosidad: n, cuajado: n, sabor: n, presentacion: n });
export const V1 = { cebolla: 'sin', vegana: false, ingredientes: [] };
export const V2 = { cebolla: 'con', vegana: false, ingredientes: [] };

/** Conjunto base de docs/criterios-de-aceptacion.md: A1, A2, B1, B2 en Bar A; Bar B vacío; Persona C sin visitas. */
export function crearEscenarioAceptacion({ esDemo = false } = {}) {
  const db = abrirBaseDeDatos(':memory:');
  const A = crearPersona(db, 'persona-a', 'Persona A', 'persona-a', { esDemo, clave: 'clave-de-prueba-A' });
  const B = crearPersona(db, 'persona-b', 'Persona B', 'persona-b', { esDemo });
  const C = crearPersona(db, 'persona-c', 'Persona C', 'persona-c', { esDemo });
  const grupo = crearGrupo(db, 'grupo-prueba', 'Grupo de prueba', null, { esDemo });
  for (const p of [A, B, C]) unir(db, p.id, grupo.id);
  const barA = crearBar(db, { nombre: 'Bar A', zona: 'Zona de prueba', ciudad: null, direccion: null, lat: null, lng: null }, A.id);
  const barB = crearBar(db, { nombre: 'Bar B', zona: 'Zona de prueba', ciudad: null, direccion: null, lat: null, lng: null }, A.id);
  const visita = (persona, clave, variedad, fecha, nota) =>
    crearDegustacion(db, persona, { opId: `visita-${clave}`, barId: barA.id, variedad, fecha, criterios: iguales(nota) }).degustacion;
  const A1 = visita(A, 'a1', V1, '2026-09-01', 8);
  const A2 = visita(A, 'a2', V1, '2026-09-08', 6);
  const B1 = visita(B, 'b1', V1, '2026-09-10', 9);
  const B2 = visita(B, 'b2', V2, '2026-09-12', 7);
  return {
    db,
    personas: { A, B, C },
    bares: { A: barA, B: barB },
    variedades: { V1: A1.variedad.id, V2: B2.variedad.id },
    visitas: { A1, A2, B1, B2 },
    grupo,
  };
}
