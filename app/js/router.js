export function analizarHash(hash = location.hash) {
  const sinAlmohadilla = hash.replace(/^#/, '') || '/';
  const [rutaCruda, consulta = ''] = sinAlmohadilla.split('?');
  const ruta = rutaCruda.startsWith('/') ? rutaCruda : `/${rutaCruda}`;
  return { ruta, params: new URLSearchParams(consulta) };
}

export function navegar(ruta, { reemplazar = false } = {}) {
  const destino = `#${ruta}`;
  if (reemplazar) {
    history.replaceState(null, '', destino);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (location.hash === destino) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = ruta;
}

export function iniciarRouter(manejar) {
  window.addEventListener('hashchange', () => manejar(analizarHash()));
  manejar(analizarHash());
}

/** Construye un hash con parámetros, omitiendo vacíos. */
export function ruta(base, params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    p.set(k, String(v));
  }
  const consulta = p.toString();
  return `#${base}${consulta ? `?${consulta}` : ''}`;
}
