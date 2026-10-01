export const estado = {
  config: { nombreApp: 'Tortillas', demo: false, registro: 'invitacion' },
  sesion: null,
  versionSesion: 0,
};

const oyentes = new Set();

export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function avisar() {
  for (const fn of oyentes) fn(estado);
}

export function establecerConfig(config) {
  estado.config = { ...estado.config, ...config };
  avisar();
}

export function establecerSesion(datos) {
  if(estado.sesion?.persona?.id!==datos?.persona?.id)estado.versionSesion++;
  estado.sesion = datos;
  avisar();
}

export function limpiarSesion() {
  estado.versionSesion++;
  estado.sesion = null;
  avisar();
}

export function persona() {
  return estado.sesion?.persona ?? null;
}

const CLAVE_MOVIMIENTO = 'tortillas:movimiento-reducido';

export function movimientoReducido() {
  try {
    return localStorage.getItem(CLAVE_MOVIMIENTO) === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function fijarMovimientoReducido(activo) {
  try {
    localStorage.setItem(CLAVE_MOVIMIENTO, activo ? '1' : '0');
  } catch { /* sin almacenamiento */ }
  document.documentElement.dataset.movimiento = activo ? 'reducido' : 'normal';
}
