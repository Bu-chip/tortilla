import { first } from './db.js';
import { sugerir } from './lecturas.js';
import { guardarVisita } from './escrituras.js';
import { ErrorHttp } from '../server/http.js';
import { nota } from '../server/servicios/validar.js';

async function opIdDe(e,i){
  if(e.id!==undefined&&e.id!==null&&String(e.id).trim())return `tortillometro_v2:${String(e.id).trim()}`;
  // Conserva la identidad de las importaciones históricas realizadas por la versión local.
  const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(JSON.stringify(e)));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
  return `tortillometro_v2:sin-id-${hash}-${i}`;
}
function fechaDe(valor){
  let m=String(valor||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return String(valor||'').match(/^\d{4}-\d{2}-\d{2}/)?.[0]||null;
}
export async function previsualizar(db,persona,entradas,offset=0){
  if(!Array.isArray(entradas)||entradas.length>20)throw new ErrorHttp(400,'Importa como máximo 20 entradas cada vez en el piloto gratuito.');
  const result=[];
  for(const [indice,entrada] of entradas.entries()){
    const e=entrada&&typeof entrada==='object'?entrada:{},c=e.criterios||{},problemas=[];
    const criterios={patata:c.patata,jugosidad:c.jugosidad,cuajado:c.cuajado2??c.cuajado,sabor:c.sabor,presentacion:c.presentacion};
    for(const k of Object.keys(criterios)){try{criterios[k]=nota(criterios[k],k);}catch(error){problemas.push(error.message);}}
    const nombre=typeof e.bar==='string'?e.bar.trim():'',fecha=fechaDe(e.fecha);
    if(!nombre)problemas.push('Falta el nombre del bar.');if(!fecha)problemas.push('No se reconoce la fecha; indica una.');
    const extras=Array.isArray(e.extras)?e.extras.map(x=>String(x).toLowerCase()):[],opId=await opIdDe(e,indice+offset);
    result.push({indice:indice+offset,opId,original:e,problemas,yaImportada:!!await first(db,'SELECT 1 FROM degustaciones WHERE autor_id=? AND op_id=?',[persona.id,opId]),
      sugerencias:await sugerir(db,{nombre,zona:e.ciudad}),candidata:{barNombre:nombre,barZona:typeof e.ciudad==='string'?e.ciudad.trim():'',fecha,criterios,
        variedad:{cebolla:({'con cebolla':'con','sin cebolla':'sin'})[String(e.cebolla||'').toLowerCase()]||'no_se',vegana:extras.includes('vegana'),ingredientes:extras.filter(x=>x!=='vegana')},
        tipoCuajado:({'poco cuajada':'poco','punto medio':'medio','bien cuajada':'bien'})[String(e.cuajado||'').toLowerCase()]||null}});
  }return result;
}
export async function importar(db,persona,elementos,lugares){
  if(!Array.isArray(elementos)||elementos.length>3)throw new ErrorHttp(400,'Guarda como máximo 3 entradas cada vez en el piloto gratuito.');
  const result={creadas:0,repetidas:0,errores:[]};
  for(const e of elementos){
    try{
      if(!e?.candidata)throw new ErrorHttp(400,'Elemento sin datos.');
      const c=e.candidata;
      const {repetida}=await guardarVisita(db,persona,{opId:e.opId,versionNota:1,barId:e.barId||null,nuevoBar:e.barId?null:{nombre:c.barNombre,zona:c.barZona},
        forzarBar:true,fecha:e.fecha||c.fecha,criterios:c.criterios,variedad:c.variedad,tipoCuajado:c.tipoCuajado},lugares,{origen:'importacion:tortillometro_v2'});
      result[repetida?'repetidas':'creadas']++;
    }catch(error){result.errores.push({opId:e?.opId||null,mensaje:error instanceof ErrorHttp?error.message:'No se pudo guardar esta entrada.'});}
  }return result;
}
