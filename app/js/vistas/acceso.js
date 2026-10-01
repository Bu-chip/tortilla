import { el } from '../dom.js';
import { api, mensajeDeError } from '../api.js';
import { estado, establecerSesion } from '../estado.js';
import { navegar } from '../router.js';
import { tortilla } from '../tortilla.js';
import { aviso } from '../ui.js';
import { TEXTOS } from '../etiquetas.js';

export async function render(cont, params) {
  const { config } = estado;
  if(config.auth==='firebase') return (await import('./acceso-firebase.js')).render(cont,params);
  const volver = params.get('volver') || '/';
  const entrar = (datos) => { establecerSesion(datos); navegar(volver.startsWith('/') ? volver : '/', { reemplazar: true }); };
  const zonaError = el('div', { 'aria-live': 'assertive' });
  const mostrarError = (mensaje) => zonaError.replaceChildren(aviso('error', mensaje));

  const caja = el('div', { class: 'acceso' },
    el('div', { class: 'acceso__tortilla' }, tortilla({ animo: 'guino', tamano: 140 })),
    el('div', { style: { textAlign: 'center' } }, el('h1', {}, config.nombreApp), el('p', { class: 'subtitulo' }, 'Puntúa tortillas con tus amigos, repite bar y compara tu media con la de los demás.')),
    zonaError);

  if (config.demo) {
    const lista = el('div', { class: 'lista-demo' });
    caja.append(el('section', { class: 'tarjeta tarjeta--demo', 'aria-labelledby': 'demo-titulo' },
      el('h2', { id: 'demo-titulo' }, el('span', { class: 'etiqueta-demo' }, TEXTOS.demo)),
      el('p', { class: 'pista', style: { margin: '.5rem 0 .75rem' } }, 'Personas ficticias del conjunto de prueba. Entra como cualquiera para ver cómo cambian «Tu media» y «Los demás». Esto no es autenticación real.'),
      lista));
    try {
      const { personas } = await api.get('/api/acceso/demo');
      for (const p of personas) {
        lista.append(el('button', { type: 'button', class: 'boton boton--fantasma boton--bloque', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { entrar(await api.post('/api/acceso/demo', { usuario: p.usuario })); } catch (error) { mostrarError(mensajeDeError(error)); e.currentTarget.disabled = false; }
        } }, `Entrar como ${p.nombre}`));
      }
    } catch (error) {
      lista.append(aviso('error', mensajeDeError(error)));
    }
  }

  // Entrar con clave
  const usuario = el('input', { type: 'text', id: 'acceso-usuario', autocomplete: 'username', autocapitalize: 'none', required: true });
  const clave = el('input', { type: 'password', id: 'acceso-clave', autocomplete: 'current-password', required: true });
  const formEntrar = el('form', { onsubmit: async (e) => {
    e.preventDefault();
    const boton = formEntrar.querySelector('button[type=submit]');
    boton.disabled = true;
    try { entrar(await api.post('/api/acceso/entrar', { usuario: usuario.value.trim(), clave: clave.value })); }
    catch (error) { mostrarError(mensajeDeError(error)); boton.disabled = false; }
  } },
    el('div', { class: 'campo' }, el('label', { for: 'acceso-usuario' }, 'Usuario'), usuario),
    el('div', { class: 'campo' }, el('label', { for: 'acceso-clave' }, 'Clave'), clave),
    el('button', { type: 'submit', class: 'boton boton--bloque' }, 'Entrar'));

  // Crear cuenta
  const rNombre = el('input', { type: 'text', id: 'registro-nombre', autocomplete: 'name', required: true, maxlength: '40' });
  const rUsuario = el('input', { type: 'text', id: 'registro-usuario', autocomplete: 'username', autocapitalize: 'none', required: true, maxlength: '30', pattern: '[a-z0-9._-]{3,30}' });
  const rClave = el('input', { type: 'password', id: 'registro-clave', autocomplete: 'new-password', required: true, minlength: '8' });
  const rCodigo = el('input', { type: 'text', id: 'registro-codigo', autocomplete: 'off', required: config.registro !== 'abierto' });
  const formRegistro = el('form', { hidden: true, onsubmit: async (e) => {
    e.preventDefault();
    const boton = formRegistro.querySelector('button[type=submit]');
    boton.disabled = true;
    try { entrar(await api.post('/api/acceso/registro', { nombre: rNombre.value.trim(), usuario: rUsuario.value.trim(), clave: rClave.value, codigo: rCodigo.value.trim() })); }
    catch (error) { mostrarError(mensajeDeError(error)); boton.disabled = false; }
  } },
    el('div', { class: 'campo' }, el('label', { for: 'registro-nombre' }, 'Tu nombre (como lo verán tus amigos)'), rNombre),
    el('div', { class: 'campo' }, el('label', { for: 'registro-usuario' }, 'Usuario'), rUsuario, el('p', { class: 'campo__ayuda' }, 'Letras minúsculas sin acentos, números, punto o guion. Entre 3 y 30 caracteres.')),
    el('div', { class: 'campo' }, el('label', { for: 'registro-clave' }, 'Clave (mínimo 8 caracteres)'), rClave),
    config.registro === 'abierto' ? null : el('div', { class: 'campo' }, el('label', { for: 'registro-codigo' }, 'Código de invitación'), rCodigo, el('p', { class: 'campo__ayuda' }, 'Te lo pasa quien administra el grupo.')),
    el('button', { type: 'submit', class: 'boton boton--bloque' }, 'Crear cuenta y entrar'));

  const tabEntrar = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'true' }, 'Entrar');
  const tabCrear = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, 'Crear cuenta');
  const cambiar = (crear) => {
    formEntrar.hidden = crear;
    formRegistro.hidden = !crear;
    tabEntrar.setAttribute('aria-pressed', String(!crear));
    tabCrear.setAttribute('aria-pressed', String(crear));
    zonaError.replaceChildren();
  };
  tabEntrar.addEventListener('click', () => cambiar(false));
  tabCrear.addEventListener('click', () => cambiar(true));

  caja.append(el('section', { class: 'tarjeta', 'aria-label': 'Acceso con cuenta' },
    el('div', { class: 'tabs', style: { marginBottom: '1rem' } }, tabEntrar, tabCrear),
    formEntrar,
    formRegistro),
    el('p', { class: 'pista', style: { textAlign: 'center' } }, el('a', { href: '#/acerca' }, '¿Cómo funciona esto?')));
  cont.append(caja);
}
