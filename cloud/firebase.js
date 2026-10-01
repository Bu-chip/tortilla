import { ErrorHttp } from '../server/http.js';

const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const encoder = new TextEncoder();
let cache = { hasta: 0, claves: [] };
let pendiente;
const cuentas = new Map();
function bytes(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
const parse = value => JSON.parse(new TextDecoder().decode(bytes(value)));
const fallo = () => new ErrorHttp(401, 'Tu sesión ha caducado o no es válida. Vuelve a entrar.');

/** Verificación RS256, emisor, proyecto, caducidad y correo confirmado. Sin claves privadas. */
export async function verificarFirebase(token, projectId, { transporte = fetch, ahora = Date.now } = {}) {
  if (!projectId) throw new ErrorHttp(503, 'Falta configurar el acceso de esta aplicación.');
  let parts, header, claims;
  try {
    if (typeof token !== 'string' || token.length > 12000) throw fallo();
    parts = token.split('.');
    if (parts.length !== 3) throw fallo();
    header = parse(parts[0]); claims = parse(parts[1]);
  } catch { throw fallo(); }
  const seconds = Math.floor(ahora() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
      !Number.isFinite(claims.exp) || claims.exp <= seconds ||
      !Number.isFinite(claims.iat) || claims.iat > seconds + 30 ||
      !Number.isFinite(claims.auth_time) || claims.auth_time > seconds + 30) throw fallo();
  if (cache.hasta <= ahora()) {
    pendiente ??= (async () => {
      try {
        const response = await transporte(JWKS, { signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!Array.isArray(body.keys)) throw new Error();
        const ttl = Math.min(3600, Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]) || 300);
        cache = { claves: body.keys, hasta: ahora() + ttl * 1000 };
      } catch { throw new ErrorHttp(503, 'No se pudo comprobar tu sesión. Vuelve a intentarlo.'); }
      finally { pendiente = null; }
    })();
    await pendiente;
  }
  const jwk = cache.claves.find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw fallo();
  let valid;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  } catch { throw fallo(); }
  if (!valid) throw fallo();
  if (claims.email_verified !== true || typeof claims.email !== 'string') {
    throw new ErrorHttp(403, 'Confirma tu correo antes de entrar al grupo.', { verificarCorreo: true });
  }
  return { id: claims.sub, email: claims.email.toLowerCase(), nombre: claims.name || '', authTime: claims.auth_time };
}

/** Comprueba bajas y revocación de sesiones tras cambiar/recuperar contraseña. Caché máxima de 30 s. */
export async function comprobarCuenta(token, identidad, env, { transporte=fetch }={}) {
  const key=`${env.FIREBASE_PROJECT_ID}:${identidad.id}`;
  let cuenta=cuentas.get(key);
  if(!cuenta || cuenta.hasta<Date.now()) {
    let response;
    try {
      response=await transporte(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(6000)});
    }catch{throw new ErrorHttp(503,'No se pudo comprobar tu sesión. Vuelve a intentarlo.');}
    if(response.status>=500||response.status===429)throw new ErrorHttp(503,'El acceso no está disponible ahora. Vuelve a intentarlo.');
    if(!response.ok)throw fallo();
    const data=await response.json(), user=data.users?.find(u=>u.localId===identidad.id);
    if(!user||user.disabled)throw fallo();
    cuenta={hasta:Date.now()+30000,desde:Number(user.validSince)||0};
    cuentas.set(key,cuenta);
    while(cuentas.size>200)cuentas.delete(cuentas.keys().next().value);
  }
  if(identidad.authTime<cuenta.desde)throw fallo();
}
