/** Límite de peticiones en memoria: ventanas fijas por clave. Suficiente para un servidor único. */
const cubos = new Map();

export function permitir(clave, maximo, ventanaMs, instante = Date.now()) {
  let cubo = cubos.get(clave);
  if (!cubo || instante - cubo.inicio >= ventanaMs) {
    cubo = { inicio: instante, n: 0 };
    cubos.set(clave, cubo);
  }
  cubo.n += 1;
  if (cubos.size > 5000) {
    for (const [k, v] of cubos) if (instante - v.inicio >= ventanaMs) cubos.delete(k);
  }
  return cubo.n <= maximo;
}

export function reiniciarLimites() {
  cubos.clear();
}
