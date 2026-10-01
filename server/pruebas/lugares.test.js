import test from 'node:test';
import assert from 'node:assert/strict';
import { leerConfig } from '../config.js';
import { crearBuscadorLugares, identidadLugar } from '../servicios/lugares.js';
import { crearBuscadorPhoton, leerReferenciaPhoton } from '../servicios/lugares-photon.js';
import { formatearBar } from '../servicios/bares.js';

const config = leerConfig({});
const feature = (id, cambios = {}, coordenadas = [-2.9326563, 43.2619441]) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: coordenadas },
  properties: { osm_type: 'N', osm_id: id, osm_key: 'amenity', osm_value: 'bar', name: 'El Globo',
    street: 'Diputazio kalea', housenumber: '8', locality: 'Uribitarte', city: 'Bilbao', ...cambios },
});
const respuesta = (features) => ({ ok: true, json: async () => ({ features }) });

test('Las referencias Photon funcionan sin Buffer y conservan Unicode y borradores anteriores', async () => {
  const original = globalThis.Buffer;
  const consultas = ['Iruña', 'Tortilla 🥔', '東京の店', 'a'.repeat(80)];
  const esperadas = consultas.map(q => `photon:N:123:${original.from(q).toString('base64url')}`);
  try {
    globalThis.Buffer = undefined;
    const buscador = crearBuscadorPhoton(config, { transporte: async () => respuesta([feature(123)]) });
    for (const [i, q] of consultas.entries()) {
      const [lugar] = await buscador.buscar(q);
      assert.equal(lugar.referenciaLugar, esperadas[i]);
      assert.equal(leerReferenciaPhoton(esperadas[i]).q, q);
      assert.equal((await buscador.resolver(esperadas[i])).proveedorId, 'photon:N:123');
    }
    for (const valor of ['_____w', 'AAAAA', 'SXJ1w7Fh_', 'ICAg']) {
      assert.throws(() => leerReferenciaPhoton(`photon:N:123:${valor}`), e => e.estado === 400);
    }
  } finally { globalThis.Buffer = original; }
});

test('Photon funciona sin clave; Geoapify sigue siendo opcional y se puede apagar la búsqueda', () => {
  const libre = crearBuscadorLugares(config);
  assert.equal(libre.activa, true); assert.equal(libre.proveedor, 'photon');
  assert.equal(crearBuscadorLugares(leerConfig({ GEOAPIFY_API_KEY: 'prueba' })).proveedor, 'geoapify');
  assert.equal(crearBuscadorLugares(leerConfig({ PLACES_PROVIDER: 'geoapify' })).activa, false);
  const apagado = crearBuscadorLugares(leerConfig({ PLACES_PROVIDER: 'ninguno', GEOAPIFY_API_KEY: 'prueba' }));
  assert.equal(apagado.activa, false);
  assert.throws(() => apagado.buscar('Globo'), /no está activada/);
});

test('Photon conserva sucursales, elimina el mismo objeto repetido y filtra datos ajenos o inválidos', async () => {
  const buscador = crearBuscadorPhoton(config, { transporte: async (url) => {
    assert.equal(url.hostname, 'photon.komoot.io');
    assert.equal(url.searchParams.get('dedupe'), '0');
    assert.ok(url.searchParams.getAll('osm_tag').includes('amenity:pub'));
    assert.equal(url.searchParams.has('apiKey'), false);
    return respuesta([feature(1), feature(1, { housenumber: '10' }), feature(2, { street: 'Plaza Barria', housenumber: null }),
      feature(3, { osm_value: 'school' }), feature(4, {}, [null, 43.26]), feature(5, {}, [-3.7, 40.4]), feature(6, { name: '' })]);
  } });
  const lugares = await buscador.buscar('Globo');
  assert.equal(lugares.length, 2);
  assert.equal(lugares[0].direccion, 'Diputazio kalea 8');
  assert.equal(lugares[1].direccion, 'Plaza Barria');
  assert.notEqual(identidadLugar(lugares[0].referenciaLugar), identidadLugar(lugares[1].referenciaLugar));
  assert.equal((await buscador.resolver(lugares[0].referenciaLugar)).proveedorId, 'photon:N:1');
  assert.equal(formatearBar({ proveedor_id: 'photon:N:1' }).fuente, 'photon');
  assert.equal(formatearBar({ proveedor_id: 'geoapify:abcde' }).fuente, 'geoapify');
});

test('Búsquedas simultáneas y repetidas comparten respuesta; se normaliza el tipo inicial del negocio', async () => {
  let llamadas = 0; let terminar;
  const buscador = crearBuscadorPhoton(config, { transporte: (url) => {
    llamadas++; assert.equal(url.searchParams.get('q'), 'Iruña');
    return new Promise((resolve) => { terminar = () => resolve(respuesta([feature(1, { name: 'Iruña' })])); });
  } });
  const a = buscador.buscar('Café Iruña'); const b = buscador.buscar('iruña');
  assert.equal(llamadas, 1); terminar();
  assert.deepEqual(await a, await b);
  await buscador.buscar('Iruña'); assert.equal(llamadas, 1);
  assert.deepEqual(await buscador.buscar('Ir'), []);
});

test('Un borrador se vuelve a resolver después de reiniciar o caducar; su identidad no depende del nombre buscado', async () => {
  let tiempo = 0; let llamadas = 0;
  const transporte = async () => { llamadas++; return respuesta([feature(123)]); };
  const primero = crearBuscadorPhoton(config, { transporte, reloj: () => tiempo });
  const [lugar] = await primero.buscar('El Globo');
  const segundo = crearBuscadorPhoton(config, { transporte, reloj: () => tiempo });
  assert.equal((await segundo.resolver(lugar.referenciaLugar)).lat, 43.2619441);
  tiempo += 16 * 60_000;
  await segundo.resolver(lugar.referenciaLugar); assert.equal(llamadas, 3);
  const [otraConsulta] = await segundo.buscar('Globo');
  assert.equal(identidadLugar(otraConsulta.referenciaLugar), identidadLugar(lugar.referenciaLugar));
  await assert.rejects(segundo.resolver(lugar.referenciaLugar.replace(':123:', ':999:')), /Vuelve a elegirlo/);
  assert.throws(() => identidadLugar('photon:N:123:invalido'), /Vuelve a elegirlo/);
});

test('Un fallo del proveedor permite usar la caché y pausa las nuevas peticiones antes de reintentar', async () => {
  let tiempo = 0; let llamadas = 0;
  const buscador = crearBuscadorPhoton(config, { reloj: () => tiempo, transporte: async () => {
    llamadas++; if (llamadas === 2) return { ok: false };
    return respuesta([feature(1)]);
  } });
  const a = await buscador.buscar('Globo');
  await assert.rejects(buscador.buscar('Motrikes'), /No se pudieron/);
  await assert.rejects(buscador.buscar('Iruña'), /ocupada/);
  assert.deepEqual(await buscador.buscar('Globo'), a); assert.equal(llamadas, 2);
  tiempo += 31_000; await buscador.buscar('Iruña'); assert.equal(llamadas, 3);
});

test('El límite de salida también protege la resolución de selecciones y permite consultas ya cacheadas', async () => {
  let tiempo = 0; let llamadas = 0;
  const buscador = crearBuscadorPhoton(config, { reloj: () => tiempo, transporte: async () => { llamadas++; return respuesta([feature(1)]); } });
  for (let i = 0; i < 20; i++) await buscador.buscar(`nombre ${i}`);
  await assert.rejects(buscador.resolver(`photon:N:1:${Buffer.from('Otra consulta').toString('base64url')}`), /ocupada/);
  await buscador.buscar('nombre 0'); assert.equal(llamadas, 20);
  tiempo = 61_000; await buscador.buscar('Otra consulta'); assert.equal(llamadas, 21);
});
