import test from 'node:test';
import assert from 'node:assert/strict';
import { crearEscenarioAceptacion, crearPersona, iguales, V1 } from './ayudas.js';
import { crearDegustacion, editarDegustacion, obtenerDegustacion, retirarDegustacion, validarDatosDegustacion } from '../servicios/degustaciones.js';
import { mediasDeBar as mediasDeBarOriginal } from '../servicios/medias.js';
import { formatearNota } from '../../app/js/formato.js';

const base = (extra = {}) => ({ barId: 'x', variedad: V1, fecha: '2026-09-01', criterios: iguales(7), ...extra });

test('Una visita con 8, 7,5, 6, 9 y 8 da nota 7,7 mostrada 7,70; integración y precio no la alteran', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const { degustacion } = crearDegustacion(db, personas.C, {
    opId: 'visita-c-decimales', barId: bares.B.id, variedad: V1, fecha: '2026-09-20',
    criterios: { patata: 8, jugosidad: 7.5, cuajado: 6, sabor: 9, presentacion: 8 },
    integracion: 10, precio: 3.2, formato: 'pincho', acompanamientos: ['pan'],
  });
  assert.equal(degustacion.nota, 7.7);
  assert.equal(formatearNota(degustacion.nota), '7,70');
  assert.equal(degustacion.integracion, 10);
  const m = mediasDeBar(db, personas.C.id, { barId: bares.B.id });
  assert.equal(formatearNota(m.tu.media), '7,70');
});

test('Un campo vacío, un 0, un 11 o un 7,3 no producen una visita válida', () => {
  assert.throws(() => validarDatosDegustacion(base({ criterios: { ...iguales(7), patata: undefined } })), /Te falta puntuar la patata/);
  assert.throws(() => validarDatosDegustacion(base({ criterios: { ...iguales(7), sabor: 0 } })), /1 a 10/);
  assert.throws(() => validarDatosDegustacion(base({ criterios: { ...iguales(7), cuajado: 11 } })), /1 a 10/);
  assert.throws(() => validarDatosDegustacion(base({ criterios: { ...iguales(7), jugosidad: 7.3 } })), /pasos de 0,5/);
  assert.throws(() => validarDatosDegustacion(base({ criterios: { ...iguales(7), presentacion: '' } })), /Te falta puntuar la presentación/);
  const ok = validarDatosDegustacion(base({ criterios: { ...iguales(7), jugosidad: '7,5' } }));
  assert.equal(ok.criterios.jugosidad, 7.5);
});

test('Precio ausente no es cero; precio 0 se rechaza; fecha futura se rechaza', () => {
  assert.equal(validarDatosDegustacion(base()).precio, null);
  assert.throws(() => validarDatosDegustacion(base({ precio: 0 })), /mayor que cero/);
  assert.throws(() => validarDatosDegustacion(base({ fecha: '2099-01-01' })), /futuro/);
  assert.throws(() => validarDatosDegustacion(base({ fecha: '2026-02-30' })), /calendario/);
});

test('Un reintento con la misma identidad de operación registra una sola degustación', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const datos = { opId: 'reintento-0001', barId: bares.A.id, variedad: V1, fecha: '2026-09-01', criterios: iguales(8) };
  const primera = crearDegustacion(db, personas.A, datos);
  const segunda = crearDegustacion(db, personas.A, datos);
  assert.equal(primera.repetida, false);
  assert.equal(segunda.repetida, true);
  assert.equal(segunda.degustacion.id, primera.degustacion.id);
  assert.equal(mediasDeBar(db, personas.A.id, { barId: bares.A.id }).tu.visitas, 3);
});

test('Otra visita legítima con el mismo autor, bar y notas se guarda como nueva', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const r1 = crearDegustacion(db, personas.A, { opId: 'legitima-0001', barId: bares.A.id, variedad: V1, fecha: '2026-09-01', criterios: iguales(8) });
  const r2 = crearDegustacion(db, personas.A, { opId: 'legitima-0002', barId: bares.A.id, variedad: V1, fecha: '2026-09-01', criterios: iguales(8) });
  assert.notEqual(r1.degustacion.id, r2.degustacion.id);
  assert.equal(mediasDeBar(db, personas.A.id, { barId: bares.A.id }).tu.visitas, 4);
});

test('Volver a puntuar conserva una sola ficha de bar y una sola variedad con la misma firma', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const r = crearDegustacion(db, personas.C, { opId: 'visita-c-otra', barId: bares.A.id, variedad: { cebolla: 'sin', vegana: false, ingredientes: [] }, fecha: '2026-09-21', criterios: iguales(5) });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM variedades WHERE bar_id = ?').get(bares.A.id).n, 2);
  assert.equal(r.degustacion.variedad.nombre, 'Sin cebolla');
  const conPimiento = crearDegustacion(db, personas.C, { opId: 'visita-c-pim', barId: bares.A.id, variedad: { cebolla: 'con', vegana: true, ingredientes: ['Pimiento', 'pimiento'] }, fecha: '2026-09-22', criterios: iguales(5) });
  assert.equal(conPimiento.degustacion.variedad.nombre, 'Vegana · con cebolla · pimiento');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM variedades WHERE bar_id = ?').get(bares.A.id).n, 3);
});

test('Solo el autor puede editar o retirar; la autoría no depende del cuerpo', () => {
  const { db, personas, visitas } = crearEscenarioAceptacion();
  assert.throws(() => editarDegustacion(db, personas.B, visitas.A1.id, { variedad: V1, fecha: '2026-09-01', criterios: iguales(1) }), /Solo puedes editar/);
  assert.throws(() => retirarDegustacion(db, personas.B, visitas.A1.id), /Solo puedes retirar/);
  const editada = editarDegustacion(db, personas.A, visitas.A1.id, { autorId: personas.B.id, variedad: V1, fecha: '2026-09-02', criterios: iguales(9) });
  assert.equal(editada.autor.id, personas.A.id);
  assert.equal(editada.nota, 9);
  assert.equal(editada.fecha, '2026-09-02');
});

test('El comentario privado solo lo ve su autor', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const { degustacion } = crearDegustacion(db, personas.A, { opId: 'privada-0001', barId: bares.B.id, variedad: V1, fecha: '2026-09-03', criterios: iguales(7), comentario: 'Secreto', comentarioPrivado: true });
  assert.equal(obtenerDegustacion(db, personas.A, degustacion.id).comentario, 'Secreto');
  assert.equal(obtenerDegustacion(db, personas.B, degustacion.id).comentario, null);
});

test('Una persona sin grupo no puede guardar ni ver degustaciones ajenas', () => {
  const { db, bares, visitas } = crearEscenarioAceptacion();
  const D = crearPersona(db, 'persona-d', 'Persona D', 'persona-d');
  assert.throws(() => crearDegustacion(db, D, { opId: 'sin-grupo-01', barId: bares.A.id, variedad: V1, fecha: '2026-09-03', criterios: iguales(7) }), /ningún grupo/);
  assert.equal(obtenerDegustacion(db, D, visitas.A1.id), null);
});

function mediasDeBar(db, id, filtros = {}) { return mediasDeBarOriginal(db, id, { ...filtros, metodo: 'historica' }); }
