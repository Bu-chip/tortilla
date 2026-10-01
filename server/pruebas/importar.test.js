import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../db.js';
import { crearEscenarioAceptacion, iguales, V1 } from './ayudas.js';
import { exportarPersona, exportarTodo } from '../servicios/exportar.js';
import { importarAntiguo, importarExportacion, previsualizarImportacionAntigua } from '../servicios/importar.js';
import { crearDegustacion, listarDegustaciones } from '../servicios/degustaciones.js';
import { mediasDeBar as mediasDeBarOriginal } from '../servicios/medias.js';
import { formatearNota } from '../../app/js/formato.js';

test('La exportación conserva identificadores, autoría, criterios, fechas y valores ausentes', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  crearDegustacion(db, personas.A, { opId: 'exp-detalle-01', barId: bares.B.id, variedad: V1, fecha: '2026-09-20', criterios: { patata: 8, jugosidad: 7.5, cuajado: 6, sabor: 9, presentacion: 8 }, precio: null, sal: 'a_punto' });
  const datos = exportarPersona(db, personas.A.id);
  assert.equal(datos.formato, 'tortillas-exportacion');
  assert.equal(datos.degustaciones.length, 3);
  const detalle = datos.degustaciones.find((d) => d.op_id === 'exp-detalle-01');
  assert.equal(detalle.autor_id, personas.A.id);
  assert.equal(detalle.jugosidad, 7.5);
  assert.equal(detalle.precio, null);
  assert.equal(detalle.integracion, null);
  assert.equal(detalle.fecha, '2026-09-20');
  assert.equal(datos.bares.length, 2);
  assert.equal(datos.personas[0].clave_hash, undefined);
});

test('Restaurar una exportación en una instancia vacía y repetirla no duplica registros', () => {
  const origen = crearEscenarioAceptacion();
  const datos = exportarTodo(origen.db);
  const destino = abrirBaseDeDatos(':memory:');
  const primera = importarExportacion(destino, datos);
  assert.equal(primera.degustaciones.insertados, 4);
  assert.equal(primera.bares.insertados, 2);
  assert.equal(primera.personas.insertados, 3);
  const segunda = importarExportacion(destino, datos);
  assert.equal(segunda.degustaciones.insertados, 0);
  assert.equal(segunda.degustaciones.omitidos, 4);
  const m = mediasDeBar(destino, origen.personas.A.id, { barId: origen.bares.A.id });
  assert.equal(formatearNota(m.tu.media), '7,00');
  assert.equal(formatearNota(m.demas.media), '8,00');
  assert.equal(m.global.valoraciones, 4);
});

test('Importación revisable del Tortillómetro antiguo: previsualiza, sugiere bar, crea y no duplica', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const entradas = [
    { id: 1717000000000, bar: 'bar a', ciudad: 'Zona de prueba', cebolla: 'con cebolla', cuajado: 'punto medio', extras: ['pimiento', 'vegana'], criterios: { patata: 8, jugosidad: 7, cuajado2: 6, sabor: 9, presentacion: 8 }, nota: 7.6, fecha: '15/6/2026' },
    { id: 1717000001000, bar: '', cebolla: null, cuajado: null, extras: [], criterios: { patata: 0, jugosidad: 5, cuajado2: 5, sabor: 5, presentacion: 5 }, nota: 4, fecha: 'ayer' },
  ];
  const vista = previsualizarImportacionAntigua(db, personas.A, entradas);
  assert.equal(vista.length, 2);
  assert.equal(vista[0].candidata.fecha, '2026-06-15');
  assert.equal(vista[0].candidata.variedad.cebolla, 'con');
  assert.equal(vista[0].candidata.variedad.vegana, true);
  assert.deepEqual(vista[0].candidata.variedad.ingredientes, ['pimiento']);
  assert.equal(vista[0].candidata.tipoCuajado, 'medio');
  assert.equal(vista[0].sugerencias[0].id, bares.A.id);
  assert.equal(vista[0].problemas.length, 0);
  assert.ok(vista[1].problemas.length >= 3);
  const resultado = importarAntiguo(db, personas.A, [{ opId: vista[0].opId, candidata: vista[0].candidata, barId: bares.A.id }]);
  assert.equal(resultado.creadas, 1);
  const lista = listarDegustaciones(db, personas.A, { solo: 'mias', barId: bares.A.id });
  const importada = lista.find((d) => d.origen === 'importacion:tortillometro_v2');
  assert.equal(importada.nota, 7.6);
  assert.equal(importada.fecha, '2026-06-15');
  const repetido = importarAntiguo(db, personas.A, [{ opId: vista[0].opId, candidata: vista[0].candidata, barId: bares.A.id }]);
  assert.equal(repetido.creadas, 0);
  assert.equal(repetido.repetidas, 1);
  assert.equal(previsualizarImportacionAntigua(db, personas.A, entradas)[0].yaImportada, true);
});

function mediasDeBar(db, id, filtros = {}) { return mediasDeBarOriginal(db, id, { ...filtros, metodo: 'historica' }); }
