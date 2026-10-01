/** Constructor de DOM sin HTML crudo: todo el texto se inserta como nodo de texto. */
export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave === 'dataset') Object.assign(nodo.dataset, valor);
    else if (clave === 'style' && typeof valor === 'object') Object.assign(nodo.style, valor);
    else if (clave.startsWith('on') && typeof valor === 'function') nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    else if (valor === true) nodo.setAttribute(clave, '');
    else nodo.setAttribute(clave, String(valor));
  }
  anadir(nodo, hijos);
  return nodo;
}

export function anadir(nodo, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

export function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  return nodo;
}

/** Convierte marcado SVG propio (nunca datos de usuario) en un elemento. */
export function svg(marcado) {
  const plantilla = document.createElement('template');
  plantilla.innerHTML = marcado.trim();
  return plantilla.content.firstElementChild;
}

export function debounce(fn, ms = 250, signal) {
  let t;
  const cancelar = () => clearTimeout(t);
  signal?.addEventListener('abort', cancelar, { once: true });
  const ejecutar = (...args) => {
    clearTimeout(t);
    if (!signal?.aborted) t = setTimeout(() => { if (!signal?.aborted) fn(...args); }, ms);
  };
  ejecutar.cancelar = cancelar;
  return ejecutar;
}

/** Sustituye el contenido de un nodo aceptando listas anidadas y valores nulos. */
export function reemplazar(nodo, ...hijos) {
  vaciar(nodo);
  anadir(nodo, hijos);
  return nodo;
}
