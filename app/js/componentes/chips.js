import { el } from '../dom.js';

/** Grupo de chips con estado visible (aria-pressed). Simple o múltiple, siempre corregible. */
export function grupoChips({ nombre, opciones, valor = null, multiple = false, alCambiar = () => {}, clase = '', permitirVacio = true }) {
  let actual = multiple ? [...(valor || [])] : valor;
  const botones = new Map();
  const raiz = el('div', { class: `chips ${clase}`, role: 'group', 'aria-label': nombre });
  function anadir(op) {
    if (botones.has(op.valor)) return;
    const boton = el('button', { type: 'button', class: `chip ${op.clase || ''}`, 'aria-pressed': 'false', title: op.titulo || null },
      op.emoji ? el('span', { 'aria-hidden': 'true' }, `${op.emoji} `) : null,
      op.etiqueta,
      op.extra ? op.extra : null);
    boton.addEventListener('click', () => {
      if (multiple) actual = actual.includes(op.valor) ? actual.filter((v) => v !== op.valor) : [...actual, op.valor];
      else if (actual === op.valor && permitirVacio) actual = null;
      else actual = op.valor;
      pintar();
      alCambiar(actual);
    });
    botones.set(op.valor, boton);
    raiz.append(boton);
  }
  for (const op of opciones) anadir(op);
  function pintar() {
    for (const [v, b] of botones) b.setAttribute('aria-pressed', String(multiple ? actual.includes(v) : actual === v));
  }
  pintar();
  return {
    elemento: raiz,
    anadir,
    obtener: () => actual,
    establecer: (v) => { actual = multiple ? [...(v || [])] : v; pintar(); },
    enfocar: () => botones.values().next().value?.focus(),
  };
}

/** Control segmentado para elegir perspectiva o pestañas. */
export function segmentado({ nombre, opciones, valor, alCambiar = () => {} }) {
  let actual = valor;
  const botones = new Map();
  const raiz = el('div', { class: 'segmentado', role: 'group', 'aria-label': nombre });
  for (const op of opciones) {
    const boton = el('button', { type: 'button', 'aria-pressed': 'false' }, op.etiqueta);
    boton.addEventListener('click', () => { if (actual === op.valor) return; actual = op.valor; pintar(); alCambiar(actual); });
    botones.set(op.valor, boton);
    raiz.append(boton);
  }
  function pintar() { for (const [v, b] of botones) b.setAttribute('aria-pressed', String(actual === v)); }
  pintar();
  return { elemento: raiz, obtener: () => actual, establecer: (v) => { actual = v; pintar(); } };
}
