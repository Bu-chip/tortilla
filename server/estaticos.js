import fs from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://cdnjs.cloudflare.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join('; ');

function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function responder404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('No encontrado');
}

/**
 * Sirve únicamente el contenido de `app/`. Cualquier ruta que salga de esa carpeta
 * (referencias/, docs/, .env, data/) responde 404.
 */
export function crearServidorEstatico({ raizApp, config }) {
  const raiz = path.resolve(raizApp);
  return async function servir(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    let rutaPedida;
    try {
      rutaPedida = decodeURIComponent(url.pathname);
    } catch {
      return responder404(res);
    }
    if (rutaPedida.includes('\0')) return responder404(res);
    const normalizada = path.posix.normalize('/' + rutaPedida);
    const absoluta = path.resolve(raiz, '.' + normalizada);
    if (absoluta !== raiz && !absoluta.startsWith(raiz + path.sep)) return responder404(res);
    const relativa = path.relative(raiz, absoluta);
    if (relativa.split(path.sep).some((segmento) => segmento.startsWith('.') && segmento !== '')) return responder404(res);

    let archivo = absoluta;
    let info = await fs.stat(archivo).catch(() => null);
    if (!info || info.isDirectory()) {
      // Rutas sin extensión (navegación de la aplicación) devuelven la página principal.
      if (path.extname(normalizada) && normalizada !== '/') return responder404(res);
      archivo = path.join(raiz, 'index.html');
      info = await fs.stat(archivo).catch(() => null);
      if (!info || info.isDirectory()) return responder404(res);
    }
    const extension = path.extname(archivo).toLowerCase();
    const tipo = MIME[extension] || 'application/octet-stream';
    const comunes = { 'Content-Type': tipo, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    if (extension === '.html') {
      const html = (await fs.readFile(archivo, 'utf8')).replaceAll('{{APP_NAME}}', escaparHtml(config.nombreApp));
      res.writeHead(200, { ...comunes, 'Content-Security-Policy': CSP, 'Referrer-Policy': 'same-origin' });
      res.end(req.method === 'HEAD' ? undefined : html);
      return;
    }
    const contenido = await fs.readFile(archivo);
    res.writeHead(200, { ...comunes, 'Content-Length': contenido.length });
    res.end(req.method === 'HEAD' ? undefined : contenido);
  };
}
