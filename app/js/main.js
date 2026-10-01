import { el, vaciar, reemplazar } from './dom.js';
import { api, mensajeDeError } from './api.js';
import { estado, establecerConfig, establecerSesion, limpiarSesion, movimientoReducido, fijarMovimientoReducido, suscribir } from './estado.js';
import { iniciarRouter, navegar } from './router.js';
import { tortilla } from './tortilla.js';
import { toast, cargando, estadoVacio, aviso } from './ui.js';
import * as inicio from './vistas/inicio.js';
import * as acceso from './vistas/acceso.js';
import * as bares from './vistas/bares.js';
import * as bar from './vistas/bar.js';
import * as valorar from './vistas/valorar.js';
import * as historial from './vistas/historial.js';
import * as mapa from './vistas/mapa.js';
import * as batalla from './vistas/batalla.js';
import * as vegana from './vistas/vegana.js';
import * as acerca from './vistas/acerca.js';
import * as importar from './vistas/importar.js';
import * as cuenta from './vistas/cuenta.js';
import { iniciarFirebase,salirFirebase } from './firebase-cliente.js';

const RUTAS = [
  { patron: /^\/cuenta$/, vista: cuenta, titulo: 'Mi cuenta', nav: '/cuenta' },
  { patron: /^\/$/, vista: inicio, titulo: 'Inicio', nav: '/' },
  { patron: /^\/bares$/, vista: bares, titulo: 'Bares y ranking', nav: '/bares' },
  { patron: /^\/bar\/([^/]+)$/, vista: bar, titulo: 'Ficha de bar', params: ['id'], nav: '/bares' },
  { patron: /^\/valorar$/, vista: valorar, titulo: 'Puntuar', nav: '/valorar' },
  { patron: /^\/historial$/, vista: historial, titulo: 'Historial', nav: '/historial' },
  { patron: /^\/mapa$/, vista: mapa, titulo: 'Mapa', nav: '/mapa' },
  { patron: /^\/batalla$/, vista: batalla, titulo: 'Con o sin cebolla', nav: '/batalla' },
  { patron: /^\/vegana$/, vista: vegana, titulo: 'Sección vegana', nav: '/vegana' },
  { patron: /^\/acerca$/, vista: acerca, titulo: 'Acerca de', nav: '/acerca', publica: true },
  { patron: /^\/acceso$/, vista: acceso, titulo: 'Entrar', nav: null, publica: true, soloSinSesion: true },
  { patron: /^\/importar$/, vista: importar, titulo: 'Importar', nav: '/importar' },
];

const NAV_ESCRITORIO = [
  { ruta: '/', texto: 'Inicio' },
  { ruta: '/bares', texto: 'Bares y ranking' },
  { ruta: '/historial', texto: 'Historial' },
  { ruta: '/mapa', texto: 'Mapa' },

];

const MENU = [
  { ruta: '/cuenta', texto: 'Mi cuenta y grupo', icono: '👤', fondo: '#FFF0C0' },
  { ruta: '/valorar', texto: 'Puntuar tortilla', icono: '⭐', fondo: '#FFF0C0' },
  { ruta: '/bares', texto: 'Bares y ranking', icono: '🏆', fondo: '#FFE0D0', badge: 'TOP' },
  { ruta: '/mapa', texto: 'Mapa de bares', icono: '🗺️', fondo: '#D0E8F8' },
  { ruta: '/batalla', texto: 'Con vs sin cebolla', icono: '🧅', fondo: '#E8E0F8' },
  { ruta: '/vegana', texto: 'Sección vegana', icono: '🌿', fondo: '#E0F0E0' },
  { ruta: '/historial', texto: 'Historial', icono: '📒', fondo: '#FFD8E8' },
  { ruta: '/acerca', texto: 'Acerca de', icono: 'ℹ️', fondo: '#EEEEEE' },
  { ruta: '/importar', texto: 'Importar del Tortillómetro', icono: '📥', fondo: '#FFF0C0', separador: true },
  { accion: 'exportar', texto: 'Exportar mis datos', icono: '📤', fondo: '#E0F0E0' },
  { accion: 'salir', texto: 'Salir', icono: '👋', fondo: '#FFE0D0' },
];

const main = document.getElementById('contenido');
document.querySelector('.saltar').addEventListener('click', (e) => { e.preventDefault(); main.focus(); main.scrollIntoView({ block: 'start' }); });
const cajon = document.getElementById('cajon');
const cajonFondo = document.getElementById('cajon-fondo');
const hamburguesa = document.getElementById('hamburguesa');
let rutaActual = '/';
let limpiezaVista = null;
let contadorRender = 0;
let primeraCarga = true;

/* ---------- Cajón ---------- */
let elementoAnterior = null;
function abrirCajon() {
  elementoAnterior = document.activeElement;
  cajon.hidden = false;
  cajonFondo.hidden = false;
  hamburguesa.setAttribute('aria-expanded', 'true');
  hamburguesa.setAttribute('aria-label', 'Cerrar el menú');
  document.body.style.overflow = 'hidden';
  cajon.querySelector('a, button')?.focus();
}
function cerrarCajon() {
  if (cajon.hidden) return;
  cajon.hidden = true;
  cajonFondo.hidden = true;
  hamburguesa.setAttribute('aria-expanded', 'false');
  hamburguesa.setAttribute('aria-label', 'Abrir el menú');
  document.body.style.overflow = '';
  elementoAnterior?.focus?.();
}
hamburguesa.addEventListener('click', () => (cajon.hidden ? abrirCajon() : cerrarCajon()));
document.getElementById('cajon-cerrar').addEventListener('click', cerrarCajon);
cajonFondo.addEventListener('click', cerrarCajon);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !cajon.hidden) cerrarCajon(); });
cajon.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const enfocables = [...cajon.querySelectorAll('a[href], button:not([disabled])')];
  if (!enfocables.length) return;
  const primero = enfocables[0];
  const ultimo = enfocables[enfocables.length - 1];
  if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
});
document.getElementById('persona-chip').addEventListener('click', abrirCajon);

async function salir() {
  cerrarCajon();
  ++contadorRender;
  try { await api.post('/api/acceso/salir', {}); } catch { /* la sesión local se limpia igual */ }
  await salirFirebase();
  limpiarSesion();
  vaciar(main);
  toast('Hasta la próxima tortilla.');
  navegar('/acceso', { reemplazar: true });
}

/* ---------- Navegación ---------- */
function construirNavegacion() {
  const conSesion = !!estado.sesion;
  const nav = document.getElementById('nav-escritorio');
  reemplazar(nav, conSesion ? NAV_ESCRITORIO.map((i) => el('a', { href: `#${i.ruta}`, 'aria-current': i.ruta === rutaActual ? 'page' : null }, i.texto)) : []);
  document.querySelector('.cabecera__puntuar').hidden = !conSesion;

  const chip = document.getElementById('persona-chip');
  if (conSesion) {
    chip.hidden = false;
    chip.textContent = estado.sesion.persona.nombre;
    chip.title = `Sesión de ${estado.sesion.persona.nombre}. Abre el menú.`;
  } else {
    chip.hidden = true;
  }
  hamburguesa.hidden = !conSesion;

  const barra = document.getElementById('barra-inferior');
  barra.hidden = !conSesion;
  barra.replaceChildren(
    el('a', { href: '#/', 'aria-current': rutaActual === '/' ? 'page' : null }, el('span', { class: 'ico', 'aria-hidden': 'true' }, '🏠'), 'Inicio'),
    el('a', { href: '#/bares', 'aria-current': rutaActual === '/bares' ? 'page' : null }, el('span', { class: 'ico', 'aria-hidden': 'true' }, '🏆'), 'Bares'),
    el('a', { href: '#/valorar', class: 'tab-puntuar', 'aria-current': rutaActual === '/valorar' ? 'page' : null, 'aria-label': 'Puntuar una tortilla' }, el('span', { class: 'tortilla-boton' }, tortilla({ animo: 'feliz', tamano: 40 })), 'Puntuar'),
    el('a', { href: '#/historial', 'aria-current': rutaActual === '/historial' ? 'page' : null }, el('span', { class: 'ico', 'aria-hidden': 'true' }, '📒'), 'Historial'),
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); abrirCajon(); } }, el('span', { class: 'ico', 'aria-hidden': 'true' }, '☰'), 'Más'));

  const listaCajon = document.getElementById('cajon-lista');
  reemplazar(listaCajon, MENU.map((i) => {
    const contenido = [el('span', { class: 'icono', style: { '--icono-fondo': i.fondo }, 'aria-hidden': 'true' }, i.icono), i.texto, i.badge ? el('span', { class: 'menu-badge' }, i.badge) : null];
    if (i.accion === 'salir') return el('button', { type: 'button', class: `menu-item ${i.separador ? 'menu-item--separador' : ''}`, onclick: salir }, contenido);
    if (i.accion === 'exportar') return el('button', { type:'button', class: `menu-item ${i.separador ? 'menu-item--separador' : ''}`, onclick: async()=>{
      cerrarCajon();
      try{
        const datos=await api.get('/api/exportar');
        const url=URL.createObjectURL(new Blob([JSON.stringify(datos,null,2)],{type:'application/json'}));
        const a=el('a',{href:url,download:`tortillas-${new Date().toISOString().slice(0,10)}.json`});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(error){toast(mensajeDeError(error));}
    } }, contenido);
    return el('a', { class: `menu-item ${i.separador ? 'menu-item--separador' : ''}`, href: `#${i.ruta}`, 'aria-current': i.ruta === rutaActual ? 'page' : null, onclick: cerrarCajon }, contenido);
  }));
  const personaCajon = document.getElementById('cajon-persona');
  if (conSesion) {
    reemplazar(personaCajon, 'Sesión de ', el('strong', {}, estado.sesion.persona.nombre), estado.sesion.ambito?.demo ? [' · ', el('span', { class: 'etiqueta-demo' }, 'demo')] : null, el('div', {}, `Ámbito: ${estado.sesion.ambito?.etiqueta || 'sin grupo'}`));
  } else {
    personaCajon.replaceChildren();
  }
}

async function manejarRuta({ ruta, params }) {
  const id = ++contadorRender;
  cerrarCajon();
  const coincidencia = RUTAS.map((r) => ({ r, m: r.patron.exec(ruta) })).find((x) => x.m);
  if (typeof limpiezaVista === 'function') { try { limpiezaVista(); } catch { /* nada */ } limpiezaVista = null; }
  vaciar(main);
  main.className = 'contenido';
  if (!coincidencia) {
    main.append(estadoVacio({ titulo: 'Esta página no existe', texto: 'Igual la tortilla se la comió.', accion: el('a', { class: 'boton boton--pequeno', href: '#/' }, 'Volver al inicio') }));
    return;
  }
  const { r, m } = coincidencia;
  if (!r.publica && !estado.sesion) {
    const destino = `${ruta}${params.toString() ? `?${params}` : ''}`;
    navegar(`/acceso${destino !== '/' ? `?volver=${encodeURIComponent(destino)}` : ''}`, { reemplazar: true });
    return;
  }
  if (r.soloSinSesion && estado.sesion) { navegar('/', { reemplazar: true }); return; }
  rutaActual = r.nav === '/bares' && r.params ? '/bares' : ruta;
  construirNavegacion();
  document.title = `${r.titulo} · ${estado.config.nombreApp}`;
  main.append(cargando());
  const contenedor = el('div', {});
  try {
    const extra = Object.fromEntries((r.params || []).map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const resultado = await r.vista.render(contenedor, params, extra);
    if (id !== contadorRender) return;
    vaciar(main);
    if (contenedor.classList.contains('contenido--ancho')) main.classList.add('contenido--ancho');
    contenedor.classList.add('vista');
    if (estado.sesion?.ambito?.demo) contenedor.prepend(el('p', { class: 'demo-contexto' }, 'DEMO · Visitas y recetas ficticias, en bares reales.'));
    main.append(contenedor);
    if (resultado && typeof resultado === 'object') {
      if (typeof resultado.limpiar === 'function') limpiezaVista = resultado.limpiar;
      if (typeof resultado.alMontar === 'function') await resultado.alMontar();
    }
    if (!primeraCarga) { window.scrollTo({ top: 0 }); main.focus({ preventScroll: true }); }
    primeraCarga = false;
  } catch (error) {
    if (id !== contadorRender) return;
    console.error(error);
    vaciar(main);
    main.append(aviso('error', `No se ha podido mostrar esta pantalla: ${mensajeDeError(error)}`, { acciones: el('button', { type: 'button', class: 'boton boton--pequeno', onclick: () => manejarRuta({ ruta, params }) }, 'Reintentar') }));
  }
}

/* ---------- Arranque ---------- */
async function arrancar() {
  fijarMovimientoReducido(movimientoReducido());
  document.getElementById('logo-icono').append(tortilla({ animo: 'feliz', tamano: 36 }));
  try {
    establecerConfig(await api.get('/api/config'));
    await iniciarFirebase(estado.config);
  } catch(error) {
    main.replaceChildren(aviso('error','No se ha podido conectar con la aplicación. Comprueba la conexión o la configuración del piloto.',{acciones:el('button',{class:'boton',onclick:()=>location.reload()},'Reintentar')}));
    return;
  }
  document.title = estado.config.nombreApp;
  try { establecerSesion(await api.get('/api/yo')); } catch { limpiarSesion(); }
  suscribir(construirNavegacion);
  construirNavegacion();
  document.addEventListener('tortillas:sin-sesion', () => {
    if (!estado.sesion) return;
    ++contadorRender;
    limpiarSesion();
    salirFirebase().catch(()=>{});
    vaciar(main);
    toast('Tu sesión ha caducado. Vuelve a entrar.');
    navegar('/acceso', { reemplazar: true });
  });
  iniciarRouter(manejarRuta);
}

arrancar();
