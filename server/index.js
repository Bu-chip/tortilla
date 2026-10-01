import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerConfig } from './config.js';
import { abrirBaseDeDatos } from './db.js';
import { crearApi } from './api.js';
import { crearServidorEstatico } from './estaticos.js';
import { sembrarDemo } from './semilla-demo.js';
import { limpiarSesionesCaducadas } from './auth.js';

export function crearServidor({ db, config, transporteLugares }) {
  const api = crearApi({ db, config, transporteLugares });
  const estatico = crearServidorEstatico({ raizApp: path.join(config.raiz, 'app'), config });
  return http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Petición no válida');
      return;
    }
    const esApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
    Promise.resolve(esApi ? api(req, res, url) : estatico(req, res, url)).catch((error) => {
      console.error('[servidor]', error);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error interno');
    });
  });
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (esPrincipal) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const config = leerConfig(process.env, raiz);
  const db = abrirBaseDeDatos(config.rutaDb);
  if (process.argv.includes('--semilla-demo')) {
    const resultado = sembrarDemo(db);
    console.log(resultado.yaExistia ? 'Datos de demostración ya presentes.' : 'Datos de demostración creados.');
  }
  const caducadas = limpiarSesionesCaducadas(db);
  if (caducadas) console.log(`Sesiones caducadas eliminadas: ${caducadas}`);
  const servidor = crearServidor({ db, config });
  servidor.listen(config.puerto, config.host, () => {
    console.log(`${config.nombreApp} escuchando en http://localhost:${config.puerto} · ${config.demo ? 'modo demostración' : 'modo normal'} · base de datos ${config.rutaDb}`);
  });
}
