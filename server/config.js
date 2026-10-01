import path from 'node:path';

const VERDADERO = new Set(['1', 'true', 'si', 'sí', 'yes', 'on']);

function esVerdadero(valor) {
  return VERDADERO.has(String(valor ?? '').trim().toLowerCase());
}

/** Lee la configuración desde variables de entorno. Sin secretos en el código. */
export function leerConfig(env = process.env, raiz = process.cwd()) {
  const registro = String(env.REGISTRATION ?? '').trim().toLowerCase();
  return {
    nombreApp: (env.APP_NAME || 'Tortillas').trim(),
    puerto: Number(env.PORT) || 3210,
    host: env.HOST ? String(env.HOST).trim() : undefined,
    rutaDb: esVerdadero(env.DEMO_MODE) ? path.resolve(raiz, env.DEMO_DB_PATH || 'data/demo.sqlite') : path.resolve(raiz, env.DB_PATH || 'data/tortillas.sqlite'),
    demo: esVerdadero(env.DEMO_MODE),
    codigoInvitacion: String(env.INVITE_CODE ?? '').trim(),
    registroAbierto: registro === 'open' || registro === 'abierto',
    nombreGrupo: (env.GROUP_NAME || 'Amigos').trim(),
    diasSesion: Number(env.SESSION_DAYS) || 90,
    cookieSegura: esVerdadero(env.COOKIE_SECURE),
    geoapifyKey: String(env.GEOAPIFY_API_KEY || '').trim(),
    lugaresProveedor: String(env.PLACES_PROVIDER || (env.GEOAPIFY_API_KEY?.trim() ? 'geoapify' : 'photon')).trim().toLowerCase(),
    lugaresZona: env.PLACES_AREA || 'Bilbao y alrededores',
    lugaresLat: Number(env.PLACES_LAT || 43.263),
    lugaresLon: Number(env.PLACES_LON || -2.935),
    raiz,
  };
}
