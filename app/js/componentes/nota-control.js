import { el } from '../dom.js';
import { formatearNotaCorta } from '../formato.js';
import { tortilla, porcion, animoPorNota } from '../tortilla.js';

/**
 * Nota de 1 a 10 en pasos de 0,5. Deslizador + botones −/+ (alternativa sin arrastrar) + teclado.
 * Sin responder se distingue de una nota elegida: no hay valor precargado.
 */
export function crearNotaControl({ clave, etiqueta, emoji = '', ayuda = '', valor = null, opcional = false, alCambiar = () => {}, decorador = null }) {
  const id = `nota-${clave}`;
  let actual = valor ?? null;
  const salida = el('output', { class: 'nota-control__valor', id: `${id}-valor`, for: id, 'aria-live': 'polite' });
  const rango = el('input', {
    type: 'range', id, min: '1', max: '10', step: '0.5', class: 'nota-control__rango',
    'aria-describedby': ayuda ? `${id}-ayuda` : null,
  });
  const menos = el('button', { type: 'button', class: 'nota-control__boton', 'aria-label': `Bajar medio punto en ${etiqueta.toLowerCase()}` }, '−');
  const mas = el('button', { type: 'button', class: 'nota-control__boton', 'aria-label': `Subir medio punto en ${etiqueta.toLowerCase()}` }, '+');
  const quitar = opcional ? el('button', { type: 'button', class: 'enlace nota-control__quitar' }, 'Quitar la nota') : null;

  const raiz = el('div', { class: 'nota-control', dataset: { clave } },
    el('div', { class: 'nota-control__cabecera' },
      el('label', { for: id, class: 'nota-control__etiqueta' },
        emoji ? el('span', { class: 'nota-control__emoji', 'aria-hidden': 'true' }, `${emoji} `) : null,
        etiqueta,
        opcional ? el('span', { class: 'nota-control__opcional' }, ' (opcional)') : null),
      salida),
    ayuda ? el('p', { class: 'nota-control__ayuda', id: `${id}-ayuda` }, ayuda) : null,
    decorador ? el('div', { class: 'nota-control__decorador' }, decorador.elemento) : null,
    el('div', { class: 'nota-control__fila' }, menos, rango, mas),
    el('div', { class: 'nota-control__escala', 'aria-hidden': 'true' }, el('span', {}, '1'), el('span', {}, '5'), el('span', {}, '10')),
    quitar);

  function pintar() {
    const vacio = actual === null;
    raiz.classList.toggle('nota-control--vacio', vacio);
    rango.value = vacio ? '5.5' : String(actual);
    rango.setAttribute('aria-valuetext', vacio ? 'Sin puntuar' : `${formatearNotaCorta(actual)} de 10`);
    salida.textContent = vacio ? 'Sin puntuar' : `${formatearNotaCorta(actual)} / 10`;
    rango.style.setProperty('--relleno', vacio ? '0%' : `${((actual - 1) / 9) * 100}%`);
    menos.disabled = !vacio && actual <= 1;
    mas.disabled = !vacio && actual >= 10;
    if (quitar) quitar.hidden = vacio;
    decorador?.actualizar?.(actual);
  }

  function establecer(v, { avisar = true } = {}) {
    if (v === null || v === undefined || v === '') actual = null;
    else actual = Math.min(10, Math.max(1, Math.round(Number(v) * 2) / 2));
    raiz.classList.remove('nota-control--error');
    pintar();
    if (avisar) alCambiar(actual);
  }

  rango.addEventListener('input', () => establecer(Number(rango.value)));
  menos.addEventListener('click', () => establecer(actual === null ? 5 : actual - 0.5));
  mas.addEventListener('click', () => establecer(actual === null ? 6 : actual + 0.5));
  quitar?.addEventListener('click', () => { establecer(null); rango.focus(); });
  // Gesto expresivo: el decorador se hunde mientras se pulsa y recupera su forma al soltar.
  const soltar = () => decorador?.pulsar?.(false);
  rango.addEventListener('pointerdown', () => decorador?.pulsar?.(true));
  rango.addEventListener('pointerup', soltar);
  rango.addEventListener('pointercancel', soltar);
  rango.addEventListener('lostpointercapture', soltar);
  rango.addEventListener('blur', soltar);
  rango.addEventListener('keydown', (e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) decorador?.pulsar?.(true); });
  rango.addEventListener('keyup', soltar);

  pintar();
  return {
    elemento: raiz,
    obtener: () => actual,
    establecer,
    enfocar: () => rango.focus(),
    marcarError: (activo = true) => raiz.classList.toggle('nota-control--error', activo),
  };
}

/** Medidor de «mmmm» para el sabor: la cara y las emes cambian con la nota; el número siempre está visible. */
export function medidorMmm() {
  const cara = el('span', { class: 'mmm__cara' });
  const texto = el('span', { class: 'mmm__texto' }, '¿Mmm?');
  const elemento = el('div', { class: 'mmm', 'aria-hidden': 'true' }, cara, texto);
  let animoActual = null;
  function actualizar(nota) {
    const animo = animoPorNota(nota);
    if (animo !== animoActual) {
      animoActual = animo;
      cara.replaceChildren(tortilla({ animo, tamano: 60 }));
    }
    if (nota === null) {
      texto.textContent = '¿Mmm?';
      elemento.style.setProperty('--nivel', '0');
      return;
    }
    const emes = Math.max(1, Math.round(nota));
    texto.textContent = `M${'m'.repeat(emes)}${nota >= 9 ? '!' : ''}`;
    elemento.style.setProperty('--nivel', String((nota - 1) / 9));
  }
  return { elemento, actualizar };
}

/** Porción que se hunde con la jugosidad al interactuar y recupera su forma al soltar. */
export function porcionJugosa() {
  const texto = el('span', { class: 'jugosa__texto' }, 'Mueve la nota: la porción se hunde según lo jugosa que estaba.');
  const elemento = el('div', { class: 'jugosa', 'aria-hidden': 'true' }, porcion(), texto);
  function actualizar(nota) {
    elemento.style.setProperty('--jugo', nota === null ? '0' : String((nota - 1) / 9));
    texto.textContent = nota === null ? 'Mueve la nota: la porción se hunde según lo jugosa que estaba.'
      : nota < 4 ? 'Ni se inmuta. Seca como una suela.' : nota < 7 ? 'Cede un poco. Correcta.' : nota < 9 ? 'Se hunde con gusto. Jugosa.' : '¡Se derrite! Jugosísima.';
  }
  function pulsar(activo) {
    elemento.classList.toggle('jugosa--hundida', activo);
  }
  return { elemento, actualizar, pulsar };
}
