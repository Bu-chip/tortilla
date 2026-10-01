/** Formato compartido entre servidor (tests) y navegador. Redondeo solo al presentar. */

export function formatearNota(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return null;
  const redondeado = Math.round(Number(valor) * 100) / 100;
  return redondeado.toFixed(2).replace('.', ',');
}

/** Nota de una degustación: media aritmética de los cinco criterios, sin redondear. */
export function notaDeVisita(criterios) {
  const claves = ['patata', 'jugosidad', 'cuajado', 'sabor', 'presentacion'];
  const valores = claves.map((k) => criterios?.[k]);
  if (valores.some((v) => v === null || v === undefined || Number.isNaN(Number(v)))) return null;
  return valores.reduce((suma, v) => suma + Number(v), 0) / 5;
}

export function formatearFecha(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  if (!a || !m || !d) return String(iso);
  return `${d}/${m}/${a}`;
}

export function fechaLocalHoy(fecha = new Date()) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function formatearPrecio(valor) {
  if (valor === null || valor === undefined) return null;
  return `${Number(valor).toFixed(2).replace('.', ',')} €`;
}

export function plural(n, singular, pluralTexto) {
  return n === 1 ? singular : pluralTexto;
}

/** Nota corta para controles: «8» o «8,5». */
export function formatearNotaCorta(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return null;
  const n = Number(valor);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
