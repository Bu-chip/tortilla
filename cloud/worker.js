import { ErrorHttp } from '../server/http.js';
import { fecha } from '../server/servicios/validar.js';
import { crearBuscadorLugares } from '../server/servicios/lugares.js';
import { formatearMedias, compararPorPerspectiva } from '../server/servicios/medias.js';
import { normalizar } from '../server/servicios/texto.js';
import { verificarFirebase, comprobarCuenta } from './firebase.js';
import { first, all, run, sha256 } from './db.js';
import * as cuentas from './cuentas.js';
import * as acceso from './acceso.js';
import * as leer from './lecturas.js';
import * as escribir from './escrituras.js';
import * as importacion from './importar.js';

function filtros(p){
  const desde=p.get('desde')?fecha(p.get('desde'),'desde'):null, hasta=p.get('hasta')?fecha(p.get('hasta'),'hasta'):null;
  if(desde&&hasta&&desde>hasta)throw new ErrorHttp(400,'La fecha inicial debe ser anterior a la final.');
  return {q:(p.get('q')||'').slice(0,80),zona:(p.get('zona')||'').slice(0,80),desde,hasta,
    metodo:p.get('metodo')==='historica'?'historica':'general',perspectiva:['tu','global'].includes(p.get('perspectiva'))?p.get('perspectiva'):'demas',
    cebolla:['con','sin'].includes(p.get('cebolla'))?p.get('cebolla'):null,vegana:['1','true'].includes(p.get('vegana')),variedad:p.get('variedad')||null};
}
async function cuerpoDe(request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ErrorHttp(415,'Se esperaba JSON.');
  const reader=request.body?.getReader(); if(!reader)throw new ErrorHttp(400,'Faltan datos.');
  const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024){await reader.cancel();throw new ErrorHttp(413,'Demasiados datos en un envío.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||Array.isArray(body)||typeof body!=='object')throw new Error();return body;}
  catch{throw new ErrorHttp(400,'Los datos enviados no son válidos.');}
}
function configuracion(env){
  return {funciones:{gestionCuenta:1},nombreApp:env.APP_NAME||'Tortillas',demo:false,registro:'invitacion',auth:'firebase',
    firebase:{apiKey:env.FIREBASE_API_KEY,projectId:env.FIREBASE_PROJECT_ID,authDomain:env.FIREBASE_AUTH_DOMAIN},
    lugares:{activa:env.PLACES_PROVIDER!=='ninguno',proveedor:'photon',zona:env.PLACES_AREA||'Bilbao y alrededores'}};
}

// La sustitución del verificador solo existe como parámetro de pruebas, nunca como variable de despliegue.
export function crearWorker({autenticar=null,transporte=fetch}={}) {
  let buscador;
  return {
    async fetch(request,env){
      const url=new URL(request.url),origin=request.headers.get('origin');
      const permitido=origin && [env.FRONTEND_ORIGIN,url.origin].includes(origin);
      const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
      if(permitido)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Requested-With','Access-Control-Max-Age':'600'});
      const json=(data,status=200)=>Response.json(data,{status,headers});
      try{
        if(origin&&!permitido)throw new ErrorHttp(403,'Origen no permitido.');
        if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
        if(url.pathname==='/api/config'&&request.method==='GET'){
          if(!env.FIREBASE_PROJECT_ID||!env.FIREBASE_API_KEY||!env.FIREBASE_AUTH_DOMAIN)throw new ErrorHttp(503,'El piloto todavía no tiene configurado el acceso.');
          return json(configuracion(env));
        }
        if(!url.pathname.startsWith('/api/'))throw new ErrorHttp(404,'Ruta no encontrada.');
        if(request.headers.get('x-requested-with')!=='tortillas')throw new ErrorHttp(403,'Petición no permitida.');
        if(!env.DB)throw new ErrorHttp(503,'Falta configurar la base de datos del piloto.');
        const bearer=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];
        if(!bearer)throw new ErrorHttp(401,'Necesitas entrar para ver esto.');
        const identidad=autenticar?await autenticar(bearer,env):await verificarFirebase(bearer,env.FIREBASE_PROJECT_ID,{transporte});
        if(!autenticar)await comprobarCuenta(bearer,identidad,env,{transporte});
        await acceso.limitar(env.DB,`usuario:${identidad.id}`,120,60);
        const db=env.DB,method=request.method,path=url.pathname;
        if(path==='/api/acceso/perfil'&&method==='POST'){
          await acceso.limitar(db,`registro:${identidad.id}`,10,3600);
          const persona=await acceso.registrarPerfil(db,identidad,await cuerpoDe(request),env);
          return json(await leer.yo(db,persona),201);
        }
        if(path==='/api/acceso/salir'&&method==='POST')return json({ok:true});
        if(path==='/api/cuenta/eliminar'&&method==='POST')return json(await cuentas.eliminarDatos(db,identidad,await cuerpoDe(request)));
        if(path==='/api/cuenta'&&method==='GET')return json(await leer.yo(db,await cuentas.perfil(db,identidad.id)));
        if(path==='/api/cuenta'&&method==='PATCH')return json(await leer.yo(db,await cuentas.cambiarNombre(db,identidad.id,await cuerpoDe(request))));
        if(path==='/api/exportar'&&method==='GET'){await cuentas.perfil(db,identidad.id);return json(await leer.exportar(db,identidad.id));}
        const persona=await acceso.personaDe(db,identidad);
        const grupos=await leer.gruposDe(db,persona.id),ambito=leer.ambitoDe(grupos);
        const f=filtros(url.searchParams);
        buscador??=crearBuscadorLugares({lugaresProveedor:env.PLACES_PROVIDER==='ninguno'?'ninguno':'photon',lugaresLat:Number(env.PLACES_LAT||43.263),lugaresLon:Number(env.PLACES_LON||-2.935)},
          {transporte:async (input,init)=>{await acceso.limitar(db,'photon:salida',20,60);return transporte(input,init);}});
        if(path==='/api/yo'&&method==='GET')return json(await leer.yo(db,persona));
        if(path==='/api/lugares'&&method==='GET'){
          await acceso.limitar(db,`lugares:${persona.id}`,30,60);
          return json({lugares:await buscador.buscar(f.q)});
        }
        if(path==='/api/zonas'&&method==='GET')return json({zonas:await all(db,"SELECT zona,COUNT(*) AS bares FROM bares WHERE zona IS NOT NULL AND zona<>'' AND es_demo=0 GROUP BY zona ORDER BY zona")});
        if(path==='/api/bares/sugerencias'&&method==='GET')return json({sugerencias:await leer.sugerir(db,{nombre:url.searchParams.get('nombre')||'',zona:f.zona})});
        if(path==='/api/bares'&&method==='GET')return json({ambito,filtros:f,bares:await leer.catalogo(db,persona,f)});
        let match=path.match(/^\/api\/bares\/([^/]+)$/);
        if(match&&method==='GET')return json({ambito,...await leer.ficha(db,persona,decodeURIComponent(match[1]),f)});
        if(match&&method==='PATCH')return json({bar:await escribir.editarBar(db,persona,decodeURIComponent(match[1]),await cuerpoDe(request))});
        if(path==='/api/degustaciones'&&method==='GET')return json({ambito,resumen:await leer.resumen(db,persona.id),degustaciones:await leer.visitas(db,persona,{solo:url.searchParams.get('solo'),q:f.q,barId:url.searchParams.get('bar'),limite:Number(url.searchParams.get('limite')??200),offset:Number(url.searchParams.get('offset')??0)})});
        if(path==='/api/degustaciones'&&method==='POST'){
          await acceso.limitar(db,`visitas:${persona.id}`,40,600);
          const result=await escribir.guardarVisita(db,persona,await cuerpoDe(request),buscador);return json(result,result.repetida?200:201);
        }
        match=path.match(/^\/api\/degustaciones\/([^/]+)$/);
        if(match&&method==='GET'){
          const degustacion=await leer.visita(db,persona,decodeURIComponent(match[1]));
          if(!degustacion)throw new ErrorHttp(404,'Esa valoración no existe o no puedes verla.');return json({degustacion});
        }
        if(match&&method==='PATCH')return json(await escribir.guardarVisita(db,persona,await cuerpoDe(request),buscador,{id:decodeURIComponent(match[1])}));
        if(match&&method==='DELETE')return json(await escribir.retirar(db,persona,decodeURIComponent(match[1])));
        if(path==='/api/batalla'){
          if(method==='PUT'){
            const body=await cuerpoDe(request);if(!['con','sin'].includes(body.lado))throw new ErrorHttp(400,'Elige con o sin cebolla.');
            await run(db,`INSERT INTO preferencias_cebolla(persona_id,lado,actualizado_en) VALUES(?,?,?) ON CONFLICT(persona_id) DO UPDATE SET lado=excluded.lado,actualizado_en=excluded.actualizado_en`,[persona.id,body.lado,new Date().toISOString()]);
          }else if(method==='DELETE')await run(db,'DELETE FROM preferencias_cebolla WHERE persona_id=?',[persona.id]);
          else if(method!=='GET')throw new ErrorHttp(405,'Método no permitido.');
          return json({ambito,...await leer.batalla(db,persona.id)});
        }
        if(path==='/api/vegana'&&method==='GET'){
          const porVariedad=await leer.mediasAgrupadas(db,persona.id,{...f,vegana:true},'variedad_id');
          const bares=await leer.buscarBares(db,f),recetas=await leer.variedades(db);
          return json({ambito,filtros:f,variedades:recetas.filter(v=>v.vegana&&bares.some(b=>b.id===v.barId)).map(v=>{
            const bar=bares.find(b=>b.id===v.barId);return {...v,bar,nombre:`${bar.nombre} · ${v.nombre}`,variedadNombre:v.nombre,medias:porVariedad.get(v.id)||formatearMedias(null)};
          }).sort(compararPorPerspectiva(f.perspectiva))});
        }
        if(path.startsWith('/api/importar')&&method==='POST'){
          const body=await cuerpoDe(request);
          if(body.formato!=='tortillometro_v2')throw new ErrorHttp(400,'Formato de importación no reconocido.');
          if(path==='/api/importar/previsualizar')return json({elementos:await importacion.previsualizar(db,persona,body.entradas,Math.max(0,Math.min(500,Math.floor(Number(body.offset)||0))))});
          if(path==='/api/importar')return json(await importacion.importar(db,persona,body.elementos,buscador));
        }
        match=path.match(/^\/api\/grupos\/([^/]+)\/miembros(?:\/([^/]+))?$/);
        if(match){
          const grupoId=decodeURIComponent(match[1]);
          if(method==='GET'&&!match[2])return json({miembros:await cuentas.miembros(db,persona,grupoId)});
          if(method==='PATCH'&&match[2])return json(await cuentas.cambiarMiembro(db,persona,grupoId,decodeURIComponent(match[2]),(await cuerpoDe(request)).rol));
        }
        match=path.match(/^\/api\/grupos\/([^/]+)\/invitaciones(?:\/([^/]+))?$/);
        if(match){
          const grupoId=decodeURIComponent(match[1]);
          if(method==='GET'&&!match[2])return json({invitaciones:await acceso.invitaciones(db,persona,grupoId)});
          if(method==='POST'&&!match[2])return json(await acceso.crearInvitacion(db,persona,grupoId),201);
          if(method==='DELETE'&&match[2])return json(await acceso.revocarInvitacion(db,persona,grupoId,decodeURIComponent(match[2])));
        }
        throw new ErrorHttp(404,'Ruta no encontrada.');
      }catch(error){
        if(error instanceof ErrorHttp)return json({error:error.message,...error.extra},error.estado);
        // Nunca registrar tokens, contraseñas, códigos de invitación ni cuerpos de peticiones.
        console.error('Fallo interno del piloto',error?.name||'Error');
        return json({error:'No se ha podido completar la operación. Vuelve a intentarlo.'},500);
      }
    },
    async scheduled(_event,env){
      // Ventanas de todos los límites duran como máximo una hora; elimina solo datos auxiliares antiguos.
      await run(env.DB,"DELETE FROM limites WHERE (clave LIKE 'registro:%' AND ventana<?) OR (clave LIKE 'visitas:%' AND ventana<?) OR (clave NOT LIKE 'registro:%' AND clave NOT LIKE 'visitas:%' AND ventana<?)",[Math.floor(Date.now()/3600000)-48,Math.floor(Date.now()/600000)-288,Math.floor(Date.now()/60000)-2880]);
    }
  };
}
export default crearWorker();
