import { estado } from './estado.js';
let cuentaRutas, ultimaLista='/bares';
const rutasRecordadas=new Map();
function revisarCuenta(){
  if(cuentaRutas!==estado.versionSesion){rutasRecordadas.clear();ultimaLista='/bares';cuentaRutas=estado.versionSesion;}
}
export function recordarRuta(base, params){
  revisarCuenta();
  const hash=ruta(base,params);
  if(['/bares','/historial','/mapa'].includes(base)){rutasRecordadas.set(base,hash);ultimaLista=base;}
  history.replaceState(null,'',hash);
}
export function rutaRecordada(base){revisarCuenta();return rutasRecordadas.get(base)||`#${base}`;}
export function volverALista(){revisarCuenta();return {href:rutaRecordada(ultimaLista),texto:{'/bares':'Bares y ranking','/historial':'Historial','/mapa':'Mapa'}[ultimaLista]};}

export function analizarHash(hash = location.hash) {
  const sinAlmohadilla = hash.replace(/^#/, '') || '/';
  const [rutaCruda, consulta = ''] = sinAlmohadilla.split('?');
  const ruta = rutaCruda.startsWith('/') ? rutaCruda : `/${rutaCruda}`;
  return { ruta, params: new URLSearchParams(consulta) };
}

export function navegar(ruta, { reemplazar = false } = {}) {
  const destino = `#${ruta}`;
  if (reemplazar) {
    history.replaceState(null, '', destino);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (location.hash === destino) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = ruta;
}

export function iniciarRouter(manejar) {
  const cambiar=()=>{const actual=analizarHash();revisarCuenta();if(['/bares','/historial','/mapa'].includes(actual.ruta)){rutasRecordadas.set(actual.ruta,location.hash);ultimaLista=actual.ruta;}manejar(actual);};
  window.addEventListener('hashchange', cambiar);
  cambiar();
}

/** Construye un hash con parámetros, omitiendo vacíos. */
export function ruta(base, params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    p.set(k, String(v));
  }
  const consulta = p.toString();
  return `#${base}${consulta ? `?${consulta}` : ''}`;
}
