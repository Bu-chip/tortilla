import { estado } from './estado.js';
const clave = (personaId) => `tortillas:borrador:${estado.config.auth==='firebase'?`${estado.config.firebase.projectId}:`:''}${personaId}`;

export function leerBorrador(personaId) {
  try {
    const texto = localStorage.getItem(clave(personaId));
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/** Devuelve true solo si el borrador quedó realmente guardado. */
export function guardarBorrador(personaId, datos) {
  try {
    localStorage.setItem(clave(personaId), JSON.stringify({ ...datos, guardadoEn: new Date().toISOString() }));
    return localStorage.getItem(clave(personaId)) !== null;
  } catch {
    return false;
  }
}

export function borrarBorrador(personaId) {
  try {
    localStorage.removeItem(clave(personaId));
  } catch { /* nada */ }
}
