import { el, debounce } from '../dom.js';
import { api, mensajeDeError } from '../api.js';
import { estado } from '../estado.js';
import { fuenteLugares } from './fuente-lugares.js';

/** Elegir un bar existente (buscando) o dar de alta uno nuevo, con sugerencias para no duplicar. */
export function selectorBar({ inicial = {}, alCambiar = () => {} }) {
  let bar = inicial.bar || null;
  let nuevoBar = inicial.nuevoBar ? { ...inicial.nuevoBar } : null;
  let modo = bar || nuevoBar?.referenciaLugar ? 'elegido' : nuevoBar ? 'nuevo' : 'buscar';
  let consulta = '';
  const raiz = el('div', { class: 'selector-bar' });
  const avisar = () => alCambiar({ bar, nuevoBar });

  const lugar = (b) => [b.zona, b.ciudad].filter(Boolean).join(' · ');

  function pintar() {
    raiz.replaceChildren(modo === 'elegido' ? vistaElegido() : modo === 'nuevo' ? vistaNuevo() : vistaBuscar());
  }

  function vistaElegido() {
    const elegido = bar || nuevoBar;
    return el('div', { class: 'bar-elegido' },
      el('span', { 'aria-hidden': 'true' }, '📍'),
      el('div', {}, el('strong', {}, elegido.nombre), el('div', { class: 'pista' }, (elegido.direccion ? [elegido.direccion, elegido.ciudad] : [lugar(elegido)]).filter(Boolean).join(' · ') || 'Sin zona indicada')),
      el('button', { type: 'button', class: 'enlace', onclick: () => { bar = null; nuevoBar = null; modo = 'buscar'; pintar(); avisar(); raiz.querySelector('input')?.focus(); } }, 'Cambiar'));
  }

  function vistaBuscar() {
    let revision = 0;
    const entrada = el('input', { type: 'search', id: 'buscar-bar', placeholder: 'Nombre del bar, restaurante o café', autocomplete: 'off', value: consulta, 'aria-describedby': 'buscar-bar-ayuda' });
    const lista = el('ul', { class: 'resultados', 'aria-live': 'polite' });
    const externos = el('div', { 'aria-live': 'polite' });
    const elegir = (b, externo = false) => { bar = externo ? null : b; nuevoBar = externo ? b : null; modo = 'elegido'; pintar(); avisar(); };
    const resultado = (b, externo) => el('li', {}, el('button', { type: 'button', onclick: () => elegir(b, externo) },
      el('span', {}, el('strong', {}, b.nombre), el('span', { class: 'pista resultado-direccion' }, [b.direccion || (externo ? 'Sin calle indicada' : ''), lugar(b)].filter(Boolean).join(' · '))),
      el('span', { class: 'pista' }, externo ? 'Elegir' : 'Guardado')));
    const crear = el('button', { type: 'button', class: 'enlace alta-manual', onclick: () => {
      nuevoBar = { nombre: consulta.trim(), zona: '', ciudad: '', direccion: '' }; modo = 'nuevo'; pintar(); avisar();
      raiz.querySelector('#nuevo-bar-nombre')?.focus();
    } }, 'No lo encuentro · Añadir a mano');
    const buscar = async () => {
      const turno = ++revision;
      const q = consulta.trim();
      lista.replaceChildren(); externos.replaceChildren();
      if (!q) return;
      try {
        const r = await api.get(`/api/bares?q=${encodeURIComponent(q)}`);
        if (turno !== revision || modo !== 'buscar') return;
        lista.replaceChildren(...r.bares.slice(0, 4).map((b) => resultado(b, false)));
        if (!r.bares.length) lista.append(el('li', { class: 'pista' }, 'Todavía no está entre los lugares guardados.'));
      } catch (error) { if (turno === revision) lista.replaceChildren(el('li', { class: 'campo__error' }, mensajeDeError(error))); }
    };
    const buscarFuera = async () => {
      const turno = revision;
      const q = consulta.trim();
      if (modo !== 'buscar' || !raiz.isConnected || q.length < 3 || !estado.config.lugares?.activa) return;
      externos.replaceChildren(el('p', { class: 'pista' }, `Buscando en ${estado.config.lugares.zona}…`));
      try {
        const r = await api.get(`/api/lugares?q=${encodeURIComponent(q)}`);
        if (turno !== revision || modo !== 'buscar' || consulta.trim() !== q) return;
        externos.replaceChildren(el('p', { class: 'eyebrow' }, `Otros lugares · ${estado.config.lugares.zona}`),
          r.lugares.length ? el('ul', { class: 'resultados' }, r.lugares.map((b) => resultado(b, true))) : el('p', { class: 'pista' }, 'Sin coincidencias. Prueba otro nombre o añádelo a mano.'),
          r.lugares.length ? el('p', { class: 'pista' }, 'Comprueba la calle y el municipio antes de elegir.') : null,
          el('p', { class: 'atribucion' }, fuenteLugares(estado.config.lugares.proveedor)));
      } catch (error) { if (turno === revision) externos.replaceChildren(el('p', { class: 'campo__error' }, mensajeDeError(error))); }
    };
    const luego = debounce(() => { buscar(); buscarFuera(); }, 650);
    entrada.addEventListener('input', () => { consulta = entrada.value; revision++; lista.replaceChildren(); externos.replaceChildren(); luego(); });
    if (consulta) luego();
    return el('div', {}, el('div', { class: 'campo' }, el('label', { for: 'buscar-bar', class: 'visualmente-oculto' }, 'Busca el bar'), entrada,
      el('p', { class: 'campo__ayuda', id: 'buscar-bar-ayuda' }, estado.config.lugares?.activa ? `Guardados y otros lugares en ${estado.config.lugares.zona}` : 'Busca entre los lugares guardados.')), lista, externos, crear);
  }

  function vistaNuevo() {
    const sugerencias = el('div', { class: 'sugerencias-bar', 'aria-live': 'polite' });
    const sugerir = debounce(async () => {
      sugerencias.replaceChildren();
      const nombre = (nuevoBar?.nombre || '').trim();
      if (nombre.length < 2) return;
      try {
        const r = await api.get(`/api/bares/sugerencias?nombre=${encodeURIComponent(nombre)}&zona=${encodeURIComponent(nuevoBar.zona || '')}`);
        if (!r.sugerencias.length) return;
        sugerencias.append(el('p', { class: 'pista' }, '¿Es alguno de estos? Así no duplicamos fichas:'));
        for (const b of r.sugerencias) {
          sugerencias.append(el('button', { type: 'button', class: 'sugerencia', onclick: () => { bar = b; nuevoBar = null; modo = 'elegido'; pintar(); avisar(); } },
            el('span', {}, el('strong', {}, b.nombre), el('div', { class: 'pista' }, lugar(b))),
            el('span', { class: 'pista' }, 'Usar este')));
        }
      } catch { /* sin sugerencias */ }
    }, 250);
    const campo = (id, etiqueta, clave, { opcional = true, ayuda = null } = {}) => {
      const input = el('input', { type: 'text', id, value: nuevoBar[clave] || '', autocomplete: 'off', maxlength: clave === 'direccion' ? '160' : '80' });
      input.addEventListener('input', () => {
        nuevoBar[clave] = input.value;
        avisar();
        if (clave === 'nombre' || clave === 'zona') sugerir();
      });
      return el('div', { class: 'campo' }, el('label', { for: id }, etiqueta, opcional ? el('span', { style: { textTransform: 'none', letterSpacing: 0 } }, ' (opcional)') : null), input, ayuda ? el('p', { class: 'campo__ayuda' }, ayuda) : null);
    };
    const contenedor = el('div', { class: 'bar-nuevo' },
      el('h3', {}, 'Bar nuevo'),
      campo('nuevo-bar-nombre', 'Nombre del bar', 'nombre', { opcional: false }),
      sugerencias,
      campo('nuevo-bar-zona', 'Barrio o zona', 'zona', { ayuda: 'Sirve para buscar y para el mapa. Ej.: Santutxu, Casco Viejo.' }),
      campo('nuevo-bar-ciudad', 'Ciudad', 'ciudad'),
      campo('nuevo-bar-direccion', 'Dirección', 'direccion'),
      el('button', { type: 'button', class: 'enlace', onclick: () => { nuevoBar = null; modo = 'buscar'; pintar(); avisar(); } }, '← Volver a buscar'));
    sugerir();
    return contenedor;
  }

  pintar();
  return {
    elemento: raiz,
    obtener: () => ({ bar, nuevoBar }),
    establecerBar: (b) => { bar = b; nuevoBar = null; modo = 'elegido'; pintar(); avisar(); },
    enfocar: () => raiz.querySelector('input, button')?.focus(),
  };
}
