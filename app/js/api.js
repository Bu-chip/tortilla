import { API_BASE } from './despliegue.js';
import { tokenFirebase, usuarioFirebase } from './firebase-cliente.js';
import { estado } from './estado.js';

export class ErrorApi extends Error {
  constructor(estado, datos) {
    super(datos?.error || `Error ${estado}`);
    this.estado = estado;
    this.datos = datos || {};
    this.campo = datos?.campo || null;
  }
}

export class ErrorRed extends Error {}

async function pedir(metodo, ruta, cuerpo) {
  let respuesta;
  const version=estado.versionSesion;
  const uid=usuarioFirebase()?.uid;
  const comprobarCuenta=()=>{
    if(uid!==usuarioFirebase()?.uid || version!==estado.versionSesion)throw new ErrorApi(409,{error:'La cuenta ha cambiado. Vuelve a abrir esta pantalla.'});
  };
  let token;
  try { token=ruta==='/api/config'?null:await tokenFirebase(); }
  catch(error) {
    if(error?.code==='auth/network-request-failed')throw new ErrorRed('No hay conexión con el servicio de cuentas.');
    document.dispatchEvent(new CustomEvent('tortillas:sin-sesion'));
    throw new ErrorApi(401,{error:'Tu sesión ha caducado. Vuelve a entrar.'});
  }
  comprobarCuenta();
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'tortillas',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorRed('No hay conexión con el servidor.');
  }
  const texto = await respuesta.text();
  comprobarCuenta();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = null;
  }
  if (!respuesta.ok) {
    if (respuesta.status === 401 && !ruta.startsWith('/api/acceso/')) {
      document.dispatchEvent(new CustomEvent('tortillas:sin-sesion'));
    }
    throw new ErrorApi(respuesta.status, datos);
  }
  return datos;
}

export const api = {
  get: (ruta) => pedir('GET', ruta),
  post: (ruta, cuerpo = {}) => pedir('POST', ruta, cuerpo),
  patch: (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo),
  put: (ruta, cuerpo = {}) => pedir('PUT', ruta, cuerpo),
  del: (ruta) => pedir('DELETE', ruta),
};

export function mensajeDeError(error, porDefecto = 'Algo ha fallado.') {
  if (error instanceof ErrorRed) return error.message;
  if (error instanceof ErrorApi) return error.message || porDefecto;
  return porDefecto;
}

/** Errores que merecen reintento conservando lo escrito: red, servidor o exceso de peticiones. */
export function esErrorRecuperable(error) {
  return error instanceof ErrorRed || (error instanceof ErrorApi && (error.estado >= 500 || error.estado === 429));
}
