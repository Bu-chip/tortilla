/** Utilidades HTTP mínimas: errores tipados, JSON y cookies. */

export class ErrorHttp extends Error {
  constructor(estado, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

export function enviarJson(res, estado, datos, cabeceras = {}) {
  const cuerpo = JSON.stringify(datos ?? null);
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...cabeceras,
  });
  res.end(cuerpo);
}

export function leerJson(req, limite = 512 * 1024) {
  return new Promise((resolver, rechazar) => {
    const tipo = String(req.headers['content-type'] || '');
    if (!tipo.toLowerCase().startsWith('application/json')) {
      rechazar(new ErrorHttp(415, 'El cuerpo de la petición debe ser JSON.'));
      req.resume();
      return;
    }
    const trozos = [];
    let tamano = 0;
    req.on('data', (trozo) => {
      tamano += trozo.length;
      if (tamano > limite) {
        rechazar(new ErrorHttp(413, 'La petición es demasiado grande.'));
        req.destroy();
        return;
      }
      trozos.push(trozo);
    });
    req.on('end', () => {
      if (tamano === 0) return resolver({});
      try {
        const datos = JSON.parse(Buffer.concat(trozos).toString('utf8'));
        if (!datos || typeof datos !== 'object') return rechazar(new ErrorHttp(400, 'El cuerpo debe ser un objeto JSON.'));
        resolver(datos);
      } catch {
        rechazar(new ErrorHttp(400, 'El JSON de la petición no es válido.'));
      }
    });
    req.on('error', rechazar);
  });
}

export function leerCookies(req) {
  const resultado = {};
  const crudo = req.headers.cookie;
  if (!crudo) return resultado;
  for (const parte of crudo.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const nombre = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (nombre) resultado[nombre] = decodeURIComponent(valor);
  }
  return resultado;
}

export function cabeceraCookie(nombre, valor, { maxAgeSegundos, segura = false, ruta = '/' } = {}) {
  const partes = [`${nombre}=${encodeURIComponent(valor)}`, `Path=${ruta}`, 'HttpOnly', 'SameSite=Lax'];
  if (typeof maxAgeSegundos === 'number') partes.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSegundos))}`);
  if (segura) partes.push('Secure');
  return partes.join('; ');
}

export function ipDe(req) {
  const reenviada = req.headers['x-forwarded-for'];
  if (typeof reenviada === 'string' && reenviada.length) return reenviada.split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconocida';
}
