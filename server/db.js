import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const dirMigraciones = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migraciones');
const profundidad = new WeakMap();

/** Abre (o crea) la base de datos SQLite y aplica las migraciones pendientes. */
export function abrirBaseDeDatos(ruta = ':memory:') {
  const existente = ruta !== ':memory:' && fs.existsSync(ruta) && fs.statSync(ruta).size > 0;
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 3000');
  if (existente) {
    const tabla = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migraciones'").get();
    const aplicadas = new Set(tabla ? db.prepare('SELECT nombre FROM migraciones').all().map((f) => f.nombre) : []);
    if (fs.readdirSync(dirMigraciones).some((f) => f.endsWith('.sql') && !aplicadas.has(f))) {
      const carpeta = path.join(path.dirname(ruta), 'copias');
      fs.mkdirSync(carpeta, { recursive: true, mode: 0o700 });
      crearCopia(db, path.join(carpeta, `${path.basename(ruta)}-antes-${Date.now()}.sqlite`));
    }
  }
  migrar(db);
  return db;
}

/** Copia consistente, incluido el contenido del WAL. Conserva cuentas y sesiones; no es una exportación compartible. */
export function crearCopia(db, destino) {
  if (fs.existsSync(destino)) throw new Error('La copia ya existe; elige otra ruta.');
  db.prepare('VACUUM INTO ?').run(destino);
  fs.chmodSync(destino, 0o600);
  return destino;
}

/** Migraciones reproducibles: archivos SQL numerados, aplicados una sola vez y en orden. */
export function migrar(db) {
  db.exec('CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)');
  const aplicadas = new Set(db.prepare('SELECT nombre FROM migraciones').all().map((f) => f.nombre));
  const archivos = fs.readdirSync(dirMigraciones).filter((f) => f.endsWith('.sql')).sort();
  const aplicadasAhora = [];
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = fs.readFileSync(path.join(dirMigraciones, archivo), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO migraciones (nombre, aplicada_en) VALUES (?, ?)').run(archivo, ahora());
      db.exec('COMMIT');
      aplicadasAhora.push(archivo);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return aplicadasAhora;
}

/** Ejecuta una función dentro de una transacción; admite anidamiento mediante savepoints. */
export function enTransaccion(db, fn) {
  const nivel = profundidad.get(db) || 0;
  if (nivel === 0) db.exec('BEGIN IMMEDIATE');
  else db.exec(`SAVEPOINT sp${nivel}`);
  profundidad.set(db, nivel + 1);
  try {
    const resultado = fn();
    if (nivel === 0) db.exec('COMMIT');
    else db.exec(`RELEASE sp${nivel}`);
    return resultado;
  } catch (error) {
    if (nivel === 0) db.exec('ROLLBACK');
    else db.exec(`ROLLBACK TO sp${nivel}; RELEASE sp${nivel}`);
    throw error;
  } finally {
    profundidad.set(db, nivel);
  }
}

export function ahora() {
  return new Date().toISOString();
}

export function nuevoId() {
  return crypto.randomUUID();
}
