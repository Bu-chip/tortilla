import test from 'node:test';
import assert from 'node:assert/strict';
import { formatearNota, notaDeVisita, fechaLocalHoy, formatearFecha } from '../../app/js/formato.js';

test('formatearNota muestra dos decimales con coma y redondea solo al presentar', () => {
  assert.equal(formatearNota(26 / 3), '8,67');
  assert.equal(formatearNota(7.7), '7,70');
  assert.equal(formatearNota(20 / 3), '6,67');
  assert.equal(formatearNota(6.8), '6,80');
  assert.equal(formatearNota(null), null);
  assert.equal(formatearNota(undefined), null);
});

test('notaDeVisita es la media de los cinco criterios y no admite huecos', () => {
  assert.equal(notaDeVisita({ patata: 8, jugosidad: 7.5, cuajado: 6, sabor: 9, presentacion: 8 }), 7.7);
  assert.equal(notaDeVisita({ patata: 8, jugosidad: 7.5, cuajado: 6, sabor: 9 }), null);
  assert.equal(notaDeVisita({ patata: 8, jugosidad: 7.5, cuajado: 6, sabor: 9, presentacion: null }), null);
});

test('fechaLocalHoy usa componentes locales y formatearFecha muestra dd/mm/aaaa', () => {
  assert.equal(fechaLocalHoy(new Date(2026, 8, 30, 23, 59)), '2026-09-30');
  assert.equal(fechaLocalHoy(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(formatearFecha('2026-09-01'), '01/09/2026');
});
