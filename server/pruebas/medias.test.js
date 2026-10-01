import test from 'node:test';
import assert from 'node:assert/strict';
import { crearEscenarioAceptacion, crearGrupo, crearPersona, unir, iguales, V1, V2 } from './ayudas.js';
import { mediasDeBar as mediasDeBarOriginal, mediasPorBar as mediasPorBarOriginal } from '../servicios/medias.js';
import { crearDegustacion, editarDegustacion, listarDegustaciones, retirarDegustacion } from '../servicios/degustaciones.js';
import { crearBar } from '../servicios/bares.js';
import { formatearNota } from '../../app/js/formato.js';

const mediasDeBar = (db, id, filtros = {}) => mediasDeBarOriginal(db, id, { ...filtros, metodo: 'historica' });
const mediasPorBar = (db, id, filtros = {}) => mediasPorBarOriginal(db, id, { ...filtros, metodo: 'historica' });
const nota = (valor) => formatearNota(valor);

test('Persona A abre Bar A: Tu media 7,00 (2 visitas); Los demás 8,00 (2 valoraciones de 1 persona); global 7,50', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id });
  assert.equal(nota(m.tu.media), '7,00');
  assert.equal(m.tu.visitas, 2);
  assert.equal(nota(m.demas.media), '8,00');
  assert.equal(m.demas.valoraciones, 2);
  assert.equal(m.demas.personas, 1);
  assert.equal(nota(m.global.media), '7,50');
  assert.equal(m.global.valoraciones, 4);
  assert.equal(m.global.personas, 2);
});

test('Persona B abre Bar A: las medias se intercambian (Tu 8,00; Los demás 7,00; global 7,50)', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const m = mediasDeBar(db, personas.B.id, { barId: bares.A.id });
  assert.equal(nota(m.tu.media), '8,00');
  assert.equal(nota(m.demas.media), '7,00');
  assert.equal(nota(m.global.media), '7,50');
});

test('Persona C abre Bar A: sin media propia; Los demás 7,50 con 4 valoraciones de 2 personas', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const m = mediasDeBar(db, personas.C.id, { barId: bares.A.id });
  assert.equal(m.tu.media, null);
  assert.equal(m.tu.visitas, 0);
  assert.equal(nota(m.demas.media), '7,50');
  assert.equal(m.demas.valoraciones, 4);
  assert.equal(m.demas.personas, 2);
});

test('Bar B sin visitas: ninguna media es cero, todas son nulas', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  for (const p of Object.values(personas)) {
    const m = mediasDeBar(db, p.id, { barId: bares.B.id });
    assert.equal(m.tu.media, null);
    assert.equal(m.demas.media, null);
    assert.equal(m.global.media, null);
    assert.equal(m.global.valoraciones, 0);
  }
});

test('Persona A filtra V1: Tu 7,00; Los demás 9,00; 3 visitas; global 7,67', () => {
  const { db, personas, bares, variedades } = crearEscenarioAceptacion();
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id, variedadId: variedades.V1 });
  assert.equal(nota(m.tu.media), '7,00');
  assert.equal(nota(m.demas.media), '9,00');
  assert.equal(m.global.valoraciones, 3);
  assert.equal(nota(m.global.media), '7,67');
});

test('Persona A filtra V2: sin media propia; Los demás 7,00; 1 visita', () => {
  const { db, personas, bares, variedades } = crearEscenarioAceptacion();
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id, variedadId: variedades.V2 });
  assert.equal(m.tu.media, null);
  assert.equal(nota(m.demas.media), '7,00');
  assert.equal(m.global.valoraciones, 1);
});

test('Tercera visita de B con 10: para A sigue 7,00; Los demás 26/3 = 8,67; global 8,00; 5 visitas', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  crearDegustacion(db, personas.B, { opId: 'visita-b3', barId: bares.A.id, variedad: V1, fecha: '2026-09-15', criterios: iguales(10) });
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id });
  assert.equal(nota(m.tu.media), '7,00');
  assert.equal(nota(m.demas.media), '8,67');
  assert.equal(nota(m.global.media), '8,00');
  assert.equal(m.global.valoraciones, 5);
});

test('C añade una visita con 4: para A, Los demás es (9+7+4)/3 = 6,67 (no 6,00); global 6,80', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  crearDegustacion(db, personas.C, { opId: 'visita-c1', barId: bares.A.id, variedad: V2, fecha: '2026-09-16', criterios: iguales(4) });
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id });
  assert.equal(nota(m.demas.media), '6,67');
  assert.equal(m.demas.personas, 2);
  assert.equal(nota(m.global.media), '6,80');
});

test('Ámbito autorizado solo con A1 y A2: A ve Tu media 7,00 y ningún dato en Los demás', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  // B se lleva sus visitas a un grupo al que A no pertenece.
  const grupoB = crearGrupo(db, 'grupo-solo-b', 'Solo B');
  unir(db, personas.B.id, grupoB.id);
  db.prepare('UPDATE degustaciones SET grupo_id = ? WHERE autor_id = ?').run(grupoB.id, personas.B.id);
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id });
  assert.equal(nota(m.tu.media), '7,00');
  assert.equal(m.demas.media, null);
  assert.equal(m.demas.valoraciones, 0);
  assert.equal(m.global.valoraciones, 2);
  // Una persona ajena al grupo no obtiene agregados.
  const D = crearPersona(db, 'persona-d', 'Persona D', 'persona-d');
  const md = mediasDeBar(db, D.id, { barId: bares.A.id });
  assert.equal(md.global.valoraciones, 0);
  assert.equal(md.demas.media, null);
});

test('A edita A2 de 6 a 10: Tu 9,00; Los demás 8,00; global 8,50; siguen siendo 4 visitas', () => {
  const { db, personas, bares, visitas } = crearEscenarioAceptacion();
  editarDegustacion(db, personas.A, visitas.A2.id, { variedad: V1, fecha: '2026-09-08', criterios: iguales(10) });
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id });
  assert.equal(nota(m.tu.media), '9,00');
  assert.equal(nota(m.demas.media), '8,00');
  assert.equal(nota(m.global.media), '8,50');
  assert.equal(m.global.valoraciones, 4);
});

test('A retira A2: Tu 8,00; Los demás 8,00; global 8,00; quedan 3 visitas activas', () => {
  const { db, personas, bares, visitas } = crearEscenarioAceptacion();
  retirarDegustacion(db, personas.A, visitas.A2.id);
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id });
  assert.equal(nota(m.tu.media), '8,00');
  assert.equal(nota(m.demas.media), '8,00');
  assert.equal(nota(m.global.media), '8,00');
  assert.equal(m.global.valoraciones, 3);
  assert.equal(listarDegustaciones(db, personas.A, { barId: bares.A.id }).length, 3);
});

test('La lista solo carga dos visitas pero los agregados usan las cuatro autorizadas', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const lista = listarDegustaciones(db, personas.A, { barId: bares.A.id, limite: 2 });
  assert.equal(lista.length, 2);
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id });
  assert.equal(m.global.valoraciones, 4);
});

test('Filtros de fecha se aplican por igual a las dos medias', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id, desde: '2026-09-05', hasta: '2026-09-10' });
  assert.equal(nota(m.tu.media), '6,00');
  assert.equal(m.tu.visitas, 1);
  assert.equal(nota(m.demas.media), '9,00');
  assert.equal(m.demas.valoraciones, 1);
});

test('mediasPorBar agrupa por bar y deja fuera los bares sin visitas', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  crearBar(db, { nombre: 'Bar C', zona: null, ciudad: null, direccion: null, lat: null, lng: null }, personas.A.id);
  const mapa = mediasPorBar(db, personas.A.id);
  assert.equal(mapa.size, 1);
  assert.equal(nota(mapa.get(bares.A.id).tu.media), '7,00');
  assert.equal(mapa.has(bares.B.id), false);
});

test('Filtro de cebolla en el ranking usa solo las variedades correspondientes', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const con = mediasPorBar(db, personas.A.id, { cebolla: 'con' }).get(bares.A.id);
  assert.equal(con.tu.media, null);
  assert.equal(nota(con.demas.media), '7,00');
  const sin = mediasPorBar(db, personas.A.id, { cebolla: 'sin' }).get(bares.A.id);
  assert.equal(nota(sin.tu.media), '7,00');
  assert.equal(nota(sin.demas.media), '9,00');
});
