import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { leerConfig } from '../config.js';
import { crearCopia } from '../db.js';
const destino = process.argv[2];
if (!destino) { console.error('Uso: npm run copia -- /ruta/nueva/copia.sqlite'); process.exit(1); }
const config = leerConfig();
const db = new DatabaseSync(config.rutaDb, { readOnly: true });
try { console.log(`Copia completa: ${crearCopia(db, path.resolve(destino))}`); }
finally { db.close(); }
