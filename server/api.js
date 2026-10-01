import { crearBuscadorLugares, identidadLugar } from './servicios/lugares.js';
import crypto from 'node:crypto';
import { ErrorHttp, cabeceraCookie, enviarJson, ipDe, leerCookies, leerJson } from './http.js';
import { NOMBRE_COOKIE, cerrarSesion, crearSesion, gruposDe, hashClave, personaDeToken, verificarClave } from './auth.js';
import { permitir } from './limites.js';
import { ahora, enTransaccion, nuevoId } from './db.js';
import * as bares from './servicios/bares.js';
import * as degustaciones from './servicios/degustaciones.js';
import * as medias from './servicios/medias.js';
import * as variedades from './servicios/variedades.js';
import * as batalla from './servicios/batalla.js';
import * as exportar from './servicios/exportar.js';
import * as importar from './servicios/importar.js';
import { normalizar } from './servicios/texto.js';
import { fecha as validarFecha, texto } from './servicios/validar.js';

const MUTANTES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PERSPECTIVAS = ['demas', 'tu', 'global'];
const RESPUESTA = Symbol('respuesta');

function respuesta(estado, cuerpo) {
  return { [RESPUESTA]: true, estado, cuerpo };
}

function compilarPatron(patron) {
  const claves = [];
  const fuente = patron.replace(/:([a-zA-Z]+)/g, (_, clave) => {
    claves.push(clave);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${fuente}/?$`), claves };
}

function limitar(clave, maximo, ventanaMs) {
  if (!permitir(clave, maximo, ventanaMs)) {
    throw new ErrorHttp(429, 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.');
  }
}

function igualesSeguro(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Protección contra peticiones cruzadas: cabecera propia y, si llega, origen coincidente con el host. */
function comprobarOrigen(req) {
  if (req.headers['x-requested-with'] !== 'tortillas') {
    throw new ErrorHttp(403, 'Petición no permitida: falta la cabecera de la aplicación.');
  }
  const origen = req.headers.origin;
  if (origen && origen !== 'null') {
    let host;
    try {
      host = new URL(origen).host;
    } catch {
      throw new ErrorHttp(403, 'Origen no válido.');
    }
    const esperado = req.headers['x-forwarded-host'] || req.headers.host;
    if (host !== esperado) throw new ErrorHttp(403, 'Origen no permitido.');
  }
}

function leerFiltros(p) {
  const perspectiva = PERSPECTIVAS.includes(p.get('perspectiva')) ? p.get('perspectiva') : 'demas';
  const cebolla = ['con', 'sin'].includes(p.get('cebolla')) ? p.get('cebolla') : null;
  const vegana = ['1', 'true'].includes(p.get('vegana') || '');
  const desde = p.get('desde') ? validarFecha(p.get('desde'), 'desde') : null;
  const hasta = p.get('hasta') ? validarFecha(p.get('hasta'), 'hasta') : null;
  if (desde && hasta && desde > hasta) throw new ErrorHttp(400, 'La fecha «desde» no puede ser posterior a «hasta».', { campo: 'desde' });
  return {
    metodo: p.get('metodo') === 'historica' ? 'historica' : 'general',
    q: (p.get('q') || '').trim().slice(0, 80),
    zona: (p.get('zona') || '').trim().slice(0, 80),
    cebolla,
    vegana,
    desde,
    hasta,
    perspectiva,
    variedad: (p.get('variedad') || '').trim() || null,
  };
}

export function crearApi({ db, config, transporteLugares }) {
  const lugares = crearBuscadorLugares(config, { transporte: transporteLugares });
  const rutas = [];
  const resolverLugar = async (cuerpo) => {
    if (!cuerpo.nuevoBar) return cuerpo;
    const ref = cuerpo.nuevoBar.referenciaLugar;
    if (!ref) return { ...cuerpo, nuevoBar: bares.validarDatosBar(cuerpo.nuevoBar) };
    const existente = db.prepare('SELECT id FROM bares WHERE proveedor_id = ?').get(identidadLugar(ref));
    return existente ? { ...cuerpo, nuevoBar: null, barId: existente.id } : { ...cuerpo, nuevoBar: await lugares.resolver(ref) };
  };
  const definir = (metodo, patron, manejador, opciones = {}) => {
    rutas.push({ metodo, ...compilarPatron(patron), manejador, publica: !!opciones.publica });
  };

  const ambitoDe = (persona) => {
    const grupos = gruposDe(db, persona.id);
    return {
      grupos: grupos.map((g) => ({ id: g.id, nombre: g.nombre, esDemo: g.esDemo })),
      etiqueta: grupos.length ? grupos.map((g) => g.nombre).join(' + ') : 'Sin grupo',
      demo: grupos.some((g) => g.esDemo),
    };
  };

  const respuestaYo = (persona) => ({
    persona,
    grupos: gruposDe(db, persona.id),
    ambito: ambitoDe(persona),
    preferencia: batalla.estadoBatalla(db, persona.id).miLado,
    resumen: degustaciones.resumenPersona(db, persona.id),
  });

  const iniciarSesion = (ctx, personaId) => {
    const sesion = crearSesion(db, personaId, config.diasSesion);
    ctx.res.setHeader('Set-Cookie', cabeceraCookie(NOMBRE_COOKIE, sesion.token, { maxAgeSegundos: sesion.segundos, segura: config.cookieSegura }));
    return respuestaYo(personaDeToken(db, sesion.token));
  };

  const grupoDeConfiguracion = () => {
    let grupo = db.prepare('SELECT id FROM grupos WHERE nombre = ? AND es_demo = 0').get(config.nombreGrupo);
    if (!grupo) {
      const id = nuevoId();
      db.prepare('INSERT INTO grupos (id, nombre, codigo_invitacion, es_demo, creado_en) VALUES (?, ?, NULL, 0, ?)').run(id, config.nombreGrupo, ahora());
      grupo = { id };
    }
    return grupo;
  };

  const grupoParaRegistro = (codigo) => {
    if (config.registroAbierto) return grupoDeConfiguracion();
    if (config.codigoInvitacion && codigo && igualesSeguro(codigo, config.codigoInvitacion)) return grupoDeConfiguracion();
    if (codigo) {
      const grupo = db.prepare('SELECT id, es_demo FROM grupos WHERE codigo_invitacion = ?').get(codigo);
      if (grupo && (grupo.es_demo === 0 || config.demo)) return grupo;
    }
    throw new ErrorHttp(403, 'El código de invitación no es válido.', { campo: 'codigo' });
  };

  /* ---------- Configuración y acceso ---------- */

  definir('GET', '/api/config', () => ({
    nombreApp: config.nombreApp,
    demo: config.demo,
    lugares: { activa: lugares.activa, proveedor: lugares.proveedor, zona: config.lugaresZona },
    registro: config.registroAbierto ? 'abierto' : 'invitacion',
  }), { publica: true });

  definir('GET', '/api/yo', (ctx) => respuestaYo(ctx.persona));

  definir('GET', '/api/acceso/demo', () => {
    if (!config.demo) throw new ErrorHttp(404, 'El modo demostración no está activo.');
    return { personas: db.prepare('SELECT usuario, nombre FROM personas WHERE es_demo = 1 ORDER BY nombre').all() };
  }, { publica: true });

  definir('POST', '/api/acceso/demo', async (ctx) => {
    if (!config.demo) throw new ErrorHttp(404, 'El modo demostración no está activo.');
    limitar(`demo:${ctx.ip}`, 60, 60_000);
    const cuerpo = await leerJson(ctx.req);
    const usuario = texto(cuerpo.usuario, 'usuario', { max: 40 });
    const persona = db.prepare('SELECT id FROM personas WHERE usuario = ? AND es_demo = 1').get(usuario);
    if (!persona) throw new ErrorHttp(404, 'Esa persona de demostración no existe.');
    return iniciarSesion(ctx, persona.id);
  }, { publica: true });

  definir('POST', '/api/acceso/entrar', async (ctx) => {
    limitar(`entrar:${ctx.ip}`, 10, 5 * 60_000);
    const cuerpo = await leerJson(ctx.req);
    const usuario = texto(cuerpo.usuario, 'usuario', { max: 40 }).toLowerCase();
    const clave = typeof cuerpo.clave === 'string' ? cuerpo.clave : '';
    const persona = db.prepare('SELECT id, clave_hash, es_demo FROM personas WHERE usuario = ?').get(usuario);
    if (!persona || (persona.es_demo && !config.demo) || !persona.clave_hash || !verificarClave(clave, persona.clave_hash)) {
      throw new ErrorHttp(401, 'Usuario o clave incorrectos.');
    }
    return iniciarSesion(ctx, persona.id);
  }, { publica: true });

  definir('POST', '/api/acceso/registro', async (ctx) => {
    limitar(`registro:${ctx.ip}`, 5, 60 * 60_000);
    const cuerpo = await leerJson(ctx.req);
    const nombre = texto(cuerpo.nombre, 'nombre', { max: 40, min: 2 });
    const usuario = texto(cuerpo.usuario, 'usuario', { max: 30, min: 3 }).toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(usuario)) {
      throw new ErrorHttp(400, 'El usuario solo puede llevar letras sin acentos, números, punto, guion y guion bajo.', { campo: 'usuario' });
    }
    const clave = typeof cuerpo.clave === 'string' ? cuerpo.clave : '';
    if (clave.length < 8) throw new ErrorHttp(400, 'La clave debe tener al menos 8 caracteres.', { campo: 'clave' });
    const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo.trim() : '';
    const grupo = grupoParaRegistro(codigo);
    if (db.prepare('SELECT 1 FROM personas WHERE usuario = ?').get(usuario)) {
      throw new ErrorHttp(409, 'Ese nombre de usuario ya está en uso.', { campo: 'usuario' });
    }
    const id = nuevoId();
    enTransaccion(db, () => {
      db.prepare('INSERT INTO personas (id, nombre, usuario, clave_hash, es_demo, creado_en) VALUES (?, ?, ?, ?, 0, ?)')
        .run(id, nombre, usuario, hashClave(clave), ahora());
      db.prepare('INSERT INTO membresias (persona_id, grupo_id, rol, creado_en) VALUES (?, ?, ?, ?)').run(id, grupo.id, 'miembro', ahora());
    });
    return respuesta(201, iniciarSesion(ctx, id));
  }, { publica: true });

  definir('POST', '/api/acceso/salir', (ctx) => {
    cerrarSesion(db, ctx.token);
    ctx.res.setHeader('Set-Cookie', cabeceraCookie(NOMBRE_COOKIE, '', { maxAgeSegundos: 0, segura: config.cookieSegura }));
    return { ok: true };
  }, { publica: true });

  /* ---------- Bares y ranking ---------- */

  definir('GET', '/api/lugares', async (ctx) => {
    limitar(`lugares:${ctx.persona.id}`, 30, 60_000);
    limitar('lugares:instancia', 60, 60_000);
    return { lugares: await lugares.buscar(ctx.url.searchParams.get('q')) };
  });

  definir('GET', '/api/zonas', () => ({ zonas: bares.listarZonas(db) }));

  definir('GET', '/api/bares', (ctx) => {
    const filtros = leerFiltros(ctx.url.searchParams);
    const lista = bares.buscarBares(db, { q: filtros.q, zona: filtros.zona });
    const mapaMedias = medias.mediasPorBar(db, ctx.persona.id, {
      metodo: filtros.metodo, cebolla: filtros.cebolla, vegana: filtros.vegana, desde: filtros.desde, hasta: filtros.hasta,
    });
    const mapaVariedades = variedades.variedadesDeBares(db, lista.map((b) => b.id));
    const resultado = lista
      .map((bar) => ({ ...bar, variedades: mapaVariedades.get(bar.id) ?? [], medias: mapaMedias.get(bar.id) ?? medias.formatearMedias(null) }))
      .filter((bar) => {
        if (!filtros.cebolla && !filtros.vegana) return true;
        if (bar.medias.global.valoraciones) return true;
        return bar.variedades.some((v) => (!filtros.cebolla || v.cebolla === filtros.cebolla) && (!filtros.vegana || v.vegana));
      })
      .sort(medias.compararPorPerspectiva(filtros.perspectiva));
    return { ambito: ambitoDe(ctx.persona), filtros, bares: resultado };
  });

  definir('GET', '/api/bares/sugerencias', (ctx) => {
    const p = ctx.url.searchParams;
    return { sugerencias: bares.sugerirBares(db, { nombre: p.get('nombre') || '', zona: p.get('zona') || '' }) };
  });

  definir('POST', '/api/bares', async (ctx) => {
    limitar(`bares:${ctx.persona.id}`, 30, 10 * 60_000);
    const cuerpo = await leerJson(ctx.req);
    const datos = bares.validarDatosBar(cuerpo);
    if (!cuerpo.forzar && bares.existeBarIdentico(db, datos)) {
      throw new ErrorHttp(409, 'Ya hay un bar con ese nombre en esa zona. Elige el existente o confirma que es otro distinto.', {
        campo: 'nombre',
        sugerencias: bares.sugerirBares(db, datos),
      });
    }
    return respuesta(201, { bar: bares.crearBar(db, datos, ctx.persona.id, { esDemo: !!ctx.persona.esDemo }) });
  });

  definir('GET', '/api/bares/:id', (ctx) => {
    const bar = bares.obtenerBar(db, ctx.params.id);
    if (!bar) throw new ErrorHttp(404, 'Ese bar no existe.');
    const f = leerFiltros(ctx.url.searchParams);
    let variedadId = null;
    if (f.variedad) {
      const pertenece = db.prepare('SELECT 1 FROM variedades WHERE id = ? AND bar_id = ?').get(f.variedad, bar.id);
      if (!pertenece) throw new ErrorHttp(404, 'Esa variedad no es de este bar.');
      variedadId = f.variedad;
    }
    const filtroActivo = !!(variedadId || f.desde || f.hasta);
    const m = medias.mediasDeBar(db, ctx.persona.id, { metodo: f.metodo, barId: bar.id, variedadId, desde: f.desde, hasta: f.hasta });
    const generales = filtroActivo ? medias.mediasDeBar(db, ctx.persona.id, { barId: bar.id, metodo: f.metodo }) : m;
    const porVariedad = medias.mediasPorVariedad(db, ctx.persona.id, { metodo: f.metodo, barId: bar.id, desde: f.desde, hasta: f.hasta });
    const lista = variedades.variedadesDeBar(db, bar.id).map((v) => ({ ...v, medias: porVariedad.get(v.id) ?? medias.formatearMedias(null) }));
    const visitas = degustaciones.listarDegustaciones(db, ctx.persona, { metodo: f.metodo, barId: bar.id, variedadId, desde: f.desde, hasta: f.hasta, limite: 500 });
    return {
      bar,
      puedeEditarBar: true,
      ambito: ambitoDe(ctx.persona),
      filtro: { variedadId, desde: f.desde, hasta: f.hasta, activo: filtroActivo },
      metodo: f.metodo,
      mediasHistoricas: medias.mediasDeBar(db, ctx.persona.id, { barId: bar.id, variedadId, desde: f.desde, hasta: f.hasta, metodo: 'historica' }),
      medias: m,
      mediasGenerales: generales,
      variedades: lista,
      visitas,
    };
  });

  definir('PATCH', '/api/bares/:id', async (ctx) => {
    const cuerpo = await leerJson(ctx.req);
    const datos = bares.validarDatosBar(cuerpo, { parcial: true });
    return { bar: bares.editarBar(db, ctx.params.id, datos) };
  });

  /* ---------- Degustaciones ---------- */

  definir('GET', '/api/degustaciones', (ctx) => {
    const p = ctx.url.searchParams;
    return {
      degustaciones: degustaciones.listarDegustaciones(db, ctx.persona, {
        solo: ['mias', 'demas'].includes(p.get('solo')) ? p.get('solo') : 'todas',
        offset: p.get('offset') || 0,
        q: p.get('q') || '',
        barId: p.get('bar') || null,
        limite: p.get('limite') || 200,
      }),
      resumen: degustaciones.resumenPersona(db, ctx.persona.id),
      ambito: ambitoDe(ctx.persona),
    };
  });

  definir('POST', '/api/degustaciones', async (ctx) => {
    limitar(`degustaciones:${ctx.persona.id}`, 40, 10 * 60_000);
    const cuerpo = await leerJson(ctx.req);
    const previa = typeof cuerpo.opId === 'string' && db.prepare('SELECT id FROM degustaciones WHERE autor_id = ? AND op_id = ?').get(ctx.persona.id, cuerpo.opId);
    const resultado = degustaciones.crearDegustacion(db, ctx.persona, previa ? cuerpo : await resolverLugar(cuerpo));
    return respuesta(resultado.repetida ? 200 : 201, resultado);
  });

  definir('GET', '/api/degustaciones/:id', (ctx) => {
    const degustacion = degustaciones.obtenerDegustacion(db, ctx.persona, ctx.params.id);
    if (!degustacion) throw new ErrorHttp(404, 'Esa valoración no existe o no puedes verla.');
    return { degustacion };
  });

  definir('PATCH', '/api/degustaciones/:id', async (ctx) => {
    const cuerpo = await leerJson(ctx.req);
    return { degustacion: degustaciones.editarDegustacion(db, ctx.persona, ctx.params.id, await resolverLugar(cuerpo)) };
  });

  definir('DELETE', '/api/degustaciones/:id', (ctx) => degustaciones.retirarDegustacion(db, ctx.persona, ctx.params.id));

  /* ---------- Sección vegana ---------- */

  definir('GET', '/api/vegana', (ctx) => {
    const f = leerFiltros(ctx.url.searchParams);
    const porVariedad = medias.mediasPorVariedad(db, ctx.persona.id, { metodo: f.metodo, vegana: true, desde: f.desde, hasta: f.hasta });
    const lista = variedades.variedadesVeganas(db)
      .filter((v) => !f.zona || v.bar.zona === f.zona)
      .filter((v) => !f.q || normalizar(v.bar.nombre).includes(normalizar(f.q)))
      .map((v) => ({ ...v, nombre: `${v.bar.nombre} · ${v.nombre}`, variedadNombre: v.nombre, medias: porVariedad.get(v.id) ?? medias.formatearMedias(null) }))
      .sort(medias.compararPorPerspectiva(f.perspectiva));
    return { ambito: ambitoDe(ctx.persona), filtros: f, variedades: lista };
  });

  /* ---------- Batalla con o sin cebolla ---------- */

  definir('GET', '/api/batalla', (ctx) => ({ ambito: ambitoDe(ctx.persona), ...batalla.estadoBatalla(db, ctx.persona.id) }));
  definir('PUT', '/api/batalla', async (ctx) => {
    const cuerpo = await leerJson(ctx.req);
    return { ambito: ambitoDe(ctx.persona), ...batalla.fijarPreferencia(db, ctx.persona.id, cuerpo.lado) };
  });
  definir('DELETE', '/api/batalla', (ctx) => ({ ambito: ambitoDe(ctx.persona), ...batalla.quitarPreferencia(db, ctx.persona.id) }));

  /* ---------- Exportar e importar ---------- */

  definir('GET', '/api/exportar', (ctx) => {
    const datos = exportar.exportarPersona(db, ctx.persona.id);
    const nombre = `tortillas-${ctx.persona.usuario}-${datos.exportadoEn.slice(0, 10)}.json`;
    enviarJson(ctx.res, 200, datos, { 'Content-Disposition': `attachment; filename="${nombre}"` });
  });

  definir('POST', '/api/importar/previsualizar', async (ctx) => {
    const cuerpo = await leerJson(ctx.req, 2 * 1024 * 1024);
    if (cuerpo.formato !== 'tortillometro_v2') throw new ErrorHttp(400, 'Formato de importación no reconocido.');
    return { elementos: importar.previsualizarImportacionAntigua(db, ctx.persona, cuerpo.entradas) };
  });

  definir('POST', '/api/importar', async (ctx) => {
    limitar(`importar:${ctx.persona.id}`, 10, 10 * 60_000);
    const cuerpo = await leerJson(ctx.req, 2 * 1024 * 1024);
    if (cuerpo.formato !== 'tortillometro_v2') throw new ErrorHttp(400, 'Formato de importación no reconocido.');
    return importar.importarAntiguo(db, ctx.persona, cuerpo.elementos);
  });

  /* ---------- Despacho ---------- */

  return async function manejarApi(req, res, url) {
    try {
      const metodo = req.method === 'HEAD' ? 'GET' : req.method;
      let coincidencia = null;
      let existeRuta = false;
      for (const ruta of rutas) {
        const m = ruta.regex.exec(url.pathname);
        if (!m) continue;
        existeRuta = true;
        if (ruta.metodo !== metodo) continue;
        coincidencia = { ruta, params: Object.fromEntries(ruta.claves.map((clave, i) => [clave, decodeURIComponent(m[i + 1])])) };
        break;
      }
      if (!coincidencia) throw new ErrorHttp(existeRuta ? 405 : 404, existeRuta ? 'Método no permitido.' : 'Ruta no encontrada.');
      if (MUTANTES.has(req.method)) comprobarOrigen(req);
      const token = leerCookies(req)[NOMBRE_COOKIE] || null;
      let persona = personaDeToken(db, token);
      if (persona?.esDemo && !config.demo) persona = null;
      if (!coincidencia.ruta.publica && !persona) throw new ErrorHttp(401, 'Necesitas entrar para ver esto.');
      const ctx = { req, res, url, db, config, persona, token, params: coincidencia.params, ip: ipDe(req) };
      const resultado = await coincidencia.ruta.manejador(ctx);
      if (res.writableEnded) return;
      if (resultado && resultado[RESPUESTA]) enviarJson(res, resultado.estado, resultado.cuerpo);
      else enviarJson(res, 200, resultado ?? { ok: true });
    } catch (error) {
      if (res.writableEnded) return;
      if (error instanceof ErrorHttp) enviarJson(res, error.estado, { error: error.message, ...error.extra });
      else {
        console.error('[api]', error);
        enviarJson(res, 500, { error: 'Error interno del servidor.' });
      }
    }
  };
}
