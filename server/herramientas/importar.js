/** Restaura una exportación (tortillas-exportacion v1) sin duplicar. Uso: npm run importar -- archivo.json */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerConfig } from '../config.js';
import { abrirBaseDeDatos } from '../db.js';
import { importarExportacion } from '../servicios/importar.js';

const archivo = process.argv[2];
if (!archivo) {
  console.error('Indica el archivo JSON a importar: npm run importar -- exportacion.json');
  process.exit(1);
}
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = leerConfig(process.env, raiz);
const db = abrirBaseDeDatos(config.rutaDb);
const datos = JSON.parse(fs.readFileSync(path.resolve(archivo), 'utf8'));
const resumen = importarExportacion(db, datos);
console.log('Importación terminada:');
for (const [tabla, cuenta] of Object.entries(resumen)) console.log(`  ${tabla}: ${cuenta.insertados} insertados, ${cuenta.omitidos} ya existían, ${cuenta.reasignados} reasignados`);
