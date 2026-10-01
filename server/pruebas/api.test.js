import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../index.js';
import { leerConfig } from '../config.js';
import { reiniciarLimites } from '../limites.js';
import { crearEscenarioAceptacion, iguales, V1 } from './ayudas.js';
import { formatearNota } from '../../app/js/formato.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function arrancar({ demo = true, transporteLugares } = {}) {
  reiniciarLimites();
  const escenario = crearEscenarioAceptacion({ esDemo: true });
  const config = { ...leerConfig({}, raiz), demo, codigoInvitacion: 'CODIGO-PRUEBA', nombreGrupo: 'Amigos de prueba' };
  const servidor = crearServidor({ db: escenario.db, config, transporteLugares });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const pedir = async (ruta, { metodo = 'GET', cuerpo, cookie, cabeceras = {}, sinCabeceraApp = false } = {}) => {
    // Este escenario reproduce las visitas históricas de cinco criterios.
    if (ruta.startsWith('/api/bares') && metodo === 'GET' && !ruta.includes('metodo=')) ruta += (ruta.includes('?') ? '&' : '?') + 'metodo=historica';
    const headers = { ...(cuerpo ? { 'content-type': 'application/json' } : {}), ...(sinCabeceraApp ? {} : { 'x-requested-with': 'tortillas' }), ...(cookie ? { cookie } : {}), ...cabeceras };
    const r = await fetch(base + ruta, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const texto = await r.text();
    let datos = texto;
    try { datos = JSON.parse(texto); } catch { /* texto plano */ }
    return { estado: r.status, datos, cabeceras: r.headers, cookie: extraerCookie(r.headers.get('set-cookie')) };
  };
  const entrarDemo = async (usuario) => {
    const r = await pedir('/api/acceso/demo', { metodo: 'POST', cuerpo: { usuario } });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    return r.cookie;
  };
  const cerrar = () => new Promise((r) => servidor.close(r));
  return { ...escenario, config, servidor, base, pedir, entrarDemo, cerrar };
}

function extraerCookie(setCookie) {
  if (!setCookie) return null;
  return setCookie.split(';')[0];
}

function peticionCruda(base, lineaPeticion) {
  const { hostname, port } = new URL(base);
  return new Promise((resolver, rechazar) => {
    const socket = net.connect(Number(port), hostname, () => {
      socket.write(`${lineaPeticion} HTTP/1.1\r\nHost: ${hostname}:${port}\r\nConnection: close\r\n\r\n`);
    });
    let datos = '';
    socket.on('data', (t) => { datos += t.toString(); });
    socket.on('end', () => resolver(datos));
    socket.on('error', rechazar);
  });
}

test('Sin sesión no se obtienen datos ni agregados', async () => {
  const s = await arrancar();
  try {
    assert.equal((await s.pedir('/api/bares')).estado, 401);
    assert.equal((await s.pedir(`/api/bares/${s.bares.A.id}`)).estado, 401);
    assert.equal((await s.pedir('/api/config')).estado, 200);
  } finally { await s.cerrar(); }
});

test('Photon se busca con sesión y guarda solo datos verificados; reintentos y otras búsquedas reutilizan el mismo bar', async () => {
  let llamadas = 0; let caido = false;
  const s = await arrancar({ transporteLugares: async () => {
    llamadas++;
    if (caido) throw new Error('sin conexión');
    return { ok: true, json: async () => ({ features: [{ type: 'Feature',
      properties: { osm_type: 'N', osm_id: 321, osm_key: 'amenity', osm_value: 'pub', name: 'Taberna de prueba Photon', street: 'Calle Prueba', housenumber: '4', city: 'Bilbao' },
      geometry: { type: 'Point', coordinates: [-2.93, 43.26] } }] }) };
  } });
  try {
    assert.equal((await s.pedir('/api/lugares?q=Taberna')).estado, 401);
    assert.equal(llamadas, 0);
    const publico = (await s.pedir('/api/config')).datos;
    assert.deepEqual(publico.lugares, { activa: true, proveedor: 'photon', zona: 'Bilbao y alrededores' });
    const cookie = await s.entrarDemo('persona-a');
    const busqueda = await s.pedir('/api/lugares?q=Taberna', { cookie });
    const lugar = busqueda.datos.lugares[0];
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM bares').get().n, 2, 'buscar no incorpora sugerencias al catálogo');
    const cuerpo = { opId: 'photon-api-visita-1', versionNota: 2, notaGeneral: 8, fecha: '2026-09-30',
      nuevoBar: { ...lugar, nombre: 'Nombre falsificado', lat: 0, lng: 0, proveedorId: 'falso' } };
    const invalida = await s.pedir('/api/degustaciones', { metodo: 'POST', cookie, cuerpo: { ...cuerpo, notaGeneral: 11 } });
    assert.equal(invalida.estado, 400);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM bares').get().n, 2, 'una nota inválida no deja un bar vacío');
    const guardada = await s.pedir('/api/degustaciones', { metodo: 'POST', cookie, cuerpo });
    assert.equal(guardada.estado, 201, JSON.stringify(guardada.datos));
    const barId = guardada.datos.degustacion.bar.id;
    const fila = s.db.prepare('SELECT * FROM bares WHERE id = ?').get(barId);
    assert.equal(fila.nombre, 'Taberna de prueba Photon'); assert.equal(fila.lat, 43.26); assert.equal(fila.proveedor_id, 'photon:N:321');
    const segundaBusqueda = await s.pedir('/api/lugares?q=Prueba', { cookie });
    caido = true;
    const repetida = await s.pedir('/api/degustaciones', { metodo: 'POST', cookie, cuerpo });
    assert.equal(repetida.estado, 200); assert.equal(repetida.datos.repetida, true);
    const otra = await s.pedir('/api/degustaciones', { metodo: 'POST', cookie, cuerpo: { ...cuerpo, opId: 'photon-api-visita-2', nuevoBar: segundaBusqueda.datos.lugares[0] } });
    assert.equal(otra.estado, 201); assert.equal(otra.datos.degustacion.bar.id, barId);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM bares').get().n, 3);
    assert.equal(llamadas, 2, 'guardar y repetir no añaden consultas externas');
    assert.equal((await s.pedir(`/api/bares/${barId}`, { cookie })).datos.bar.fuente, 'photon');
    assert.equal((await s.pedir('/api/exportar', { cookie })).datos.bares.find(b => b.id === barId).proveedor_id, 'photon:N:321');
  } finally { await s.cerrar(); }
});

test('El selector de demostración solo funciona con DEMO_MODE activo', async () => {
  const s = await arrancar({ demo: false });
  try {
    assert.equal((await s.pedir('/api/acceso/demo')).estado, 404);
    assert.equal((await s.pedir('/api/acceso/demo', { metodo: 'POST', cuerpo: { usuario: 'persona-a' } })).estado, 404);
  } finally { await s.cerrar(); }
});

test('Las mutaciones exigen la cabecera de la aplicación y un origen coherente', async () => {
  const s = await arrancar();
  try {
    const cookie = await s.entrarDemo('persona-a');
    const sin = await s.pedir('/api/batalla', { metodo: 'PUT', cuerpo: { lado: 'con' }, cookie, sinCabeceraApp: true });
    assert.equal(sin.estado, 403);
    const ajeno = await s.pedir('/api/batalla', { metodo: 'PUT', cuerpo: { lado: 'con' }, cookie, cabeceras: { origin: 'https://otro.example' } });
    assert.equal(ajeno.estado, 403);
    const ok = await s.pedir('/api/batalla', { metodo: 'PUT', cuerpo: { lado: 'con' }, cookie, cabeceras: { origin: s.base } });
    assert.equal(ok.estado, 200);
    assert.equal(ok.datos.miLado, 'con');
  } finally { await s.cerrar(); }
});

test('Dos sesiones distintas: cada una ve sus propias medias y los cambios de la otra', async () => {
  const s = await arrancar();
  try {
    const cookieA = await s.entrarDemo('persona-a');
    const cookieB = await s.entrarDemo('persona-b');
    const fichaA = await s.pedir(`/api/bares/${s.bares.A.id}`, { cookie: cookieA });
    assert.equal(formatearNota(fichaA.datos.medias.tu.media), '7,00');
    assert.equal(formatearNota(fichaA.datos.medias.demas.media), '8,00');
    const fichaB = await s.pedir(`/api/bares/${s.bares.A.id}`, { cookie: cookieB });
    assert.equal(formatearNota(fichaB.datos.medias.tu.media), '8,00');
    assert.equal(formatearNota(fichaB.datos.medias.demas.media), '7,00');
    // B añade una tercera visita con 10; A la ve reflejada en «Los demás» sin tocar su propia media.
    const alta = await s.pedir('/api/degustaciones', {
      metodo: 'POST', cookie: cookieB,
      cuerpo: { opId: 'api-b3-000001', autorId: s.personas.A.id, barId: s.bares.A.id, variedad: V1, fecha: '2026-09-15', criterios: iguales(10) },
    });
    assert.equal(alta.estado, 201, JSON.stringify(alta.datos));
    assert.equal(alta.datos.degustacion.autor.id, s.personas.B.id, 'la autoría sale de la sesión, no del cuerpo');
    const despues = await s.pedir(`/api/bares/${s.bares.A.id}`, { cookie: cookieA });
    assert.equal(formatearNota(despues.datos.medias.tu.media), '7,00');
    assert.equal(formatearNota(despues.datos.medias.demas.media), '8,67');
    assert.equal(despues.datos.medias.global.valoraciones, 5);
    // Reintento con la misma operación: no duplica.
    const reintento = await s.pedir('/api/degustaciones', {
      metodo: 'POST', cookie: cookieB,
      cuerpo: { opId: 'api-b3-000001', barId: s.bares.A.id, variedad: V1, fecha: '2026-09-15', criterios: iguales(10) },
    });
    assert.equal(reintento.estado, 200);
    assert.equal(reintento.datos.repetida, true);
    assert.equal((await s.pedir(`/api/bares/${s.bares.A.id}`, { cookie: cookieA })).datos.medias.global.valoraciones, 5);
    // B no puede editar la visita de A ni falsear su media.
    const intruso = await s.pedir(`/api/degustaciones/${s.visitas.A1.id}`, { metodo: 'PATCH', cookie: cookieB, cuerpo: { variedad: V1, fecha: '2026-09-01', criterios: iguales(1) } });
    assert.equal(intruso.estado, 403);
    assert.equal(formatearNota((await s.pedir(`/api/bares/${s.bares.A.id}`, { cookie: cookieA })).datos.medias.tu.media), '7,00');
  } finally { await s.cerrar(); }
});

test('Ranking por perspectiva y recuentos; una persona sin visitas no recibe ranking personal', async () => {
  const s = await arrancar();
  try {
    const cookieC = await s.entrarDemo('persona-c');
    const r = await s.pedir('/api/bares?perspectiva=tu', { cookie: cookieC });
    assert.equal(r.estado, 200);
    assert.ok(r.datos.bares.every((b) => b.medias.tu.media === null));
    const demas = await s.pedir('/api/bares?perspectiva=demas', { cookie: cookieC });
    assert.equal(demas.datos.bares[0].nombre, 'Bar A');
    assert.equal(formatearNota(demas.datos.bares[0].medias.demas.media), '7,50');
    assert.equal(demas.datos.bares[0].medias.demas.valoraciones, 4);
    assert.equal(demas.datos.bares[1].medias.demas.media, null);
  } finally { await s.cerrar(); }
});

test('Registro con código de invitación; código incorrecto rechazado; entrada con clave', async () => {
  const s = await arrancar();
  try {
    const mal = await s.pedir('/api/acceso/registro', { metodo: 'POST', cuerpo: { nombre: 'Nueva', usuario: 'nueva', clave: 'clave-larga-1', codigo: 'NO' } });
    assert.equal(mal.estado, 403);
    const bien = await s.pedir('/api/acceso/registro', { metodo: 'POST', cuerpo: { nombre: 'Nueva', usuario: 'Nueva', clave: 'clave-larga-1', codigo: 'CODIGO-PRUEBA' } });
    assert.equal(bien.estado, 201, JSON.stringify(bien.datos));
    assert.equal(bien.datos.grupos[0].nombre, 'Amigos de prueba');
    const yo = await s.pedir('/api/yo', { cookie: bien.cookie });
    assert.equal(yo.datos.persona.usuario, 'nueva');
    // La nueva persona no ve el grupo de prueba.
    const ficha = await s.pedir(`/api/bares/${s.bares.A.id}`, { cookie: bien.cookie });
    assert.equal(ficha.datos.medias.global.valoraciones, 0);
    const entrada = await s.pedir('/api/acceso/entrar', { metodo: 'POST', cuerpo: { usuario: 'persona-a', clave: 'clave-de-prueba-A' } });
    assert.equal(entrada.estado, 200);
    const fallida = await s.pedir('/api/acceso/entrar', { metodo: 'POST', cuerpo: { usuario: 'persona-a', clave: 'incorrecta' } });
    assert.equal(fallida.estado, 401);
    const salida = await s.pedir('/api/acceso/salir', { metodo: 'POST', cuerpo: {}, cookie: entrada.cookie });
    assert.equal(salida.estado, 200);
    assert.equal((await s.pedir('/api/yo', { cookie: entrada.cookie })).estado, 401);
  } finally { await s.cerrar(); }
});

test('El límite de intentos de entrada responde 429 sin bloquear las visitas repetidas', async () => {
  const s = await arrancar();
  try {
    let ultimo = 0;
    for (let i = 0; i < 11; i += 1) {
      ultimo = (await s.pedir('/api/acceso/entrar', { metodo: 'POST', cuerpo: { usuario: 'persona-a', clave: 'mal' } })).estado;
    }
    assert.equal(ultimo, 429);
    const cookieA = await s.entrarDemo('persona-a');
    for (let i = 0; i < 3; i += 1) {
      const r = await s.pedir('/api/degustaciones', { metodo: 'POST', cookie: cookieA, cuerpo: { opId: `repetida-${i}-0001`, barId: s.bares.A.id, variedad: V1, fecha: '2026-09-20', criterios: iguales(8) } });
      assert.equal(r.estado, 201);
    }
  } finally { await s.cerrar(); }
});

test('La aplicación servida no expone referencias/, docs/, .env ni la base de datos', async () => {
  const s = await arrancar();
  try {
    assert.equal((await s.pedir('/')).estado, 200);
    assert.match((await s.pedir('/')).datos, /Tortillas/);
    assert.equal((await s.pedir('/referencias/originales/tortillometro-landing.html')).estado, 404);
    assert.equal((await s.pedir('/docs/criterios-de-aceptacion.md')).estado, 404);
    assert.equal((await s.pedir('/PROMPT-CLAUDE.md')).estado, 404);
    assert.equal((await s.pedir('/.env.example')).estado, 404);
    assert.equal((await s.pedir('/data/tortillas.sqlite')).estado, 404);
    assert.equal((await s.pedir('/server/index.js')).estado, 404);
    assert.equal((await s.pedir('/%2e%2e/referencias/originales/tortillometro-landing.html')).estado, 404);
    const cruda = await peticionCruda(s.base, 'GET /../referencias/originales/tortillometro-landing.html');
    assert.match(cruda, /^HTTP\/1\.1 (404|400)/);
    const cruda2 = await peticionCruda(s.base, 'GET /js/../../referencias/originales/tortillometro-landing.html');
    assert.match(cruda2, /^HTTP\/1\.1 (404|400)/);
  } finally { await s.cerrar(); }
});

test('Exportación propia descargable y batalla con una preferencia por persona', async () => {
  const s = await arrancar();
  try {
    const cookieA = await s.entrarDemo('persona-a');
    const exp = await s.pedir('/api/exportar', { cookie: cookieA });
    assert.equal(exp.estado, 200);
    assert.match(exp.cabeceras.get('content-disposition'), /attachment/);
    assert.equal(exp.datos.degustaciones.length, 2);
    assert.equal(exp.datos.personas[0].clave_hash, undefined);
    let b = await s.pedir('/api/batalla', { metodo: 'PUT', cookie: cookieA, cuerpo: { lado: 'con' } });
    assert.equal(b.datos.votos.con, 1);
    b = await s.pedir('/api/batalla', { metodo: 'PUT', cookie: cookieA, cuerpo: { lado: 'sin' } });
    assert.equal(b.datos.votos.con, 0);
    assert.equal(b.datos.votos.sin, 1);
    assert.equal(b.datos.votos.total, 1);
    await s.pedir('/api/degustaciones', { metodo: 'POST', cookie: cookieA, cuerpo: { opId: 'batalla-no-vota-01', barId: s.bares.A.id, variedad: V1, fecha: '2026-09-20', criterios: iguales(8) } });
    b = await s.pedir('/api/batalla', { cookie: cookieA });
    assert.equal(b.datos.votos.total, 1, 'una degustación nueva no añade votos');
    b = await s.pedir('/api/batalla', { metodo: 'DELETE', cookie: cookieA });
    assert.equal(b.datos.miLado, null);
    assert.equal(b.datos.votos.total, 0);
  } finally { await s.cerrar(); }
});


test('Desactivar la demo invalida incluso una sesión demo ya iniciada', async () => {
  const s = await arrancar();
  try {
    const cookie = await s.entrarDemo('persona-a');
    s.config.demo = false;
    assert.equal((await s.pedir('/api/yo', { cookie })).estado, 401);
    assert.equal((await s.pedir('/api/acceso/entrar', { metodo: 'POST', cuerpo: { usuario: 'persona-a', clave: 'clave-de-prueba-A' } })).estado, 401);
  } finally { await s.cerrar(); }
});
test('API nueva guarda bar y visita juntos, reintenta y devuelve solo medias generales', async () => {
  const s = await arrancar();
  try {
    const cookie = await s.entrarDemo('persona-a');
    const cuerpo = { versionNota: 2, opId: 'api-general-123', nuevoBar: { nombre: 'Café nuevo' }, fecha: '2026-09-25', notaGeneral: 8.5 };
    const a = await s.pedir('/api/degustaciones', { metodo: 'POST', cookie, cuerpo });
    assert.equal(a.estado, 201, JSON.stringify(a.datos));
    const b = await s.pedir('/api/degustaciones', { metodo: 'POST', cookie, cuerpo });
    assert.equal(b.estado, 200); assert.equal(b.datos.degustacion.id, a.datos.degustacion.id);
    const ficha = await s.pedir(`/api/bares/${a.datos.degustacion.bar.id}?metodo=general`, { cookie });
    assert.equal(ficha.datos.medias.tu.media, 8.5); assert.equal(ficha.datos.medias.tu.visitas, 1);
    assert.equal(ficha.datos.mediasHistoricas.global.valoraciones, 0);
    const original = await s.pedir(`/api/bares/${s.bares.A.id}?metodo=general`, { cookie });
    assert.equal(original.datos.medias.global.media, null); assert.equal(original.datos.mediasHistoricas.global.media, 7.5);
  } finally { await s.cerrar(); }
});
