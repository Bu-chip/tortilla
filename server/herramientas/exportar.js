/** Exporta toda la instancia a JSON (sin claves ni sesiones). Uso: npm run exportar -- [archivo.json] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerConfig } from '../config.js';
import { abrirBaseDeDatos } from '../db.js';
import { exportarTodo } from '../servicios/exportar.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = leerConfig(process.env, raiz);
const db = abrirBaseDeDatos(config.rutaDb);
const datos = exportarTodo(db);
const destino = process.argv[2];
const texto = JSON.stringify(datos, null, 2);
if (destino) {
  fs.writeFileSync(path.resolve(destino), texto);
  console.log(`Exportación completa escrita en ${path.resolve(destino)} (${datos.degustaciones.length} degustaciones).`);
} else {
  process.stdout.write(texto + '\n');
}
