const PALABRAS_VACIAS = new Set(['bar', 'el', 'la', 'los', 'las', 'de', 'del', 'casa', 'taberna', 'cafe', 'cafeteria', 'restaurante', 'y', 'e', 'a']);

export function normalizar(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokensSignificativos(texto = '') {
  return normalizar(texto).split(' ').filter((t) => t && !PALABRAS_VACIAS.has(t));
}

/** Parecido sencillo: inclusión o tokens significativos compartidos. */
export function seParecen(a, b) {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(tokensSignificativos(a));
  const tb = tokensSignificativos(b);
  return tb.some((t) => t.length >= 3 && ta.has(t));
}
