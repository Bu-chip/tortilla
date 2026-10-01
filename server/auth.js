import crypto from 'node:crypto';
import { ahora } from './db.js';

export const NOMBRE_COOKIE = 'tortillas_sesion';

export function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(clave), sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

export function verificarClave(clave, guardado) {
  if (!guardado || typeof guardado !== 'string') return false;
  const [algoritmo, salHex, hashHex] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = crypto.scryptSync(String(clave), Buffer.from(salHex, 'hex'), esperado.length);
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function crearSesion(db, personaId, dias = 90) {
  const token = crypto.randomBytes(32).toString('base64url');
  const inicio = new Date();
  const expira = new Date(inicio.getTime() + dias * 86_400_000);
  db.prepare('INSERT INTO sesiones (token_hash, persona_id, creado_en, expira_en) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), personaId, inicio.toISOString(), expira.toISOString());
  return { token, expira, segundos: dias * 86_400 };
}

export function personaDeToken(db, token) {
  if (!token) return null;
  const fila = db.prepare(`
    SELECT p.id, p.nombre, p.usuario, p.es_demo, s.expira_en
    FROM sesiones s JOIN personas p ON p.id = s.persona_id
    WHERE s.token_hash = ?`).get(hashToken(token));
  if (!fila) return null;
  if (fila.expira_en < ahora()) {
    db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hashToken(token));
    return null;
  }
  return { id: fila.id, nombre: fila.nombre, usuario: fila.usuario, esDemo: fila.es_demo === 1 };
}

export function cerrarSesion(db, token) {
  if (token) db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hashToken(token));
}

export function limpiarSesionesCaducadas(db) {
  return db.prepare('DELETE FROM sesiones WHERE expira_en < ?').run(ahora()).changes;
}

export function gruposDe(db, personaId) {
  return db.prepare(`
    SELECT g.id, g.nombre, g.es_demo, m.rol
    FROM membresias m JOIN grupos g ON g.id = m.grupo_id
    WHERE m.persona_id = ? ORDER BY m.creado_en, g.nombre`).all(personaId)
    .map((g) => ({ id: g.id, nombre: g.nombre, esDemo: g.es_demo === 1, rol: g.rol }));
}
