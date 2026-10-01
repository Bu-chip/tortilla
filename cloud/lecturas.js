import { all, first } from './db.js';
import { formatearBar } from '../server/servicios/bares.js';
import { formatearVariedad } from '../server/servicios/variedades.js';
import { formatearDegustacion } from '../server/servicios/datos-degustacion.js';
import { fuente, AGREGADOS, formatearMedias, compararPorPerspectiva } from '../server/servicios/medias.js';
import { normalizar, seParecen } from '../server/servicios/texto.js';
import { ErrorHttp } from '../server/http.js';

export const SELECT_VISITA = `SELECT d.*, p.nombre AS autor_nombre,
 b.nombre AS bar_nombre, b.zona AS bar_zona, b.ciudad AS bar_ciudad, b.direccion AS bar_direccion,
 v.nombre AS variedad_nombre, v.cebolla AS variedad_cebolla, v.vegana AS variedad_vegana,
 v.ingredientes AS variedad_ingredientes, g.nombre AS grupo_nombre
 FROM degustaciones d JOIN personas p ON p.id=d.autor_id JOIN bares b ON b.id=d.bar_id
 LEFT JOIN variedades v ON v.id=d.variedad_id JOIN grupos g ON g.id=d.grupo_id`;
const VISIBLE = 'd.grupo_id IN (SELECT grupo_id FROM membresias WHERE persona_id=@persona)';

export async function gruposDe(db, id) {
  return (await all(db, `SELECT g.id,g.nombre,m.rol FROM grupos g JOIN membresias m ON m.grupo_id=g.id
    WHERE m.persona_id=? AND g.es_demo=0 ORDER BY m.creado_en,g.nombre`, [id])).map(g => ({ ...g, esDemo: false }));
}
export const ambitoDe = grupos => ({ grupos, etiqueta: grupos.map(g=>g.nombre).join(' + ') || 'Sin grupo', demo: false });
export const resumen = (db,id) => first(db, 'SELECT COUNT(*) AS visitas,COUNT(DISTINCT bar_id) AS bares FROM degustaciones WHERE autor_id=? AND retirada_en IS NULL', [id]);
export async function yo(db, persona) {
  const grupos = await gruposDe(db, persona.id);
  const preferencia = await first(db, 'SELECT lado FROM preferencias_cebolla WHERE persona_id=?', [persona.id]);
  return { persona, grupos, ambito: ambitoDe(grupos), preferencia: preferencia?.lado ?? null, resumen: await resumen(db,persona.id) };
}
export const obtenerBar = async (db,id) => formatearBar(await first(db,'SELECT * FROM bares WHERE id=? AND es_demo=0',[id]));
export async function buscarBares(db, { q='', zona='' }={}) {
  const params = {}; const conditions = ['b.es_demo=0'];
  if (q.trim()) { conditions.push("(b.nombre_norm LIKE @q OR LOWER(COALESCE(b.zona,'')) LIKE @qz OR LOWER(COALESCE(b.ciudad,'')) LIKE @qz)"); params.q=`%${normalizar(q)}%`;params.qz=`%${q.trim().toLowerCase()}%`; }
  if (zona) { conditions.push('b.zona=@zona'); params.zona=zona; }
  return (await all(db,`SELECT * FROM bares b WHERE ${conditions.join(' AND ')} ORDER BY b.nombre`,params)).map(formatearBar);
}
export async function sugerir(db,{nombre='',zona=''}={}) {
  if (!normalizar(nombre)) return [];
  return (await buscarBares(db)).filter(b=>seParecen(b.nombre,nombre))
    .sort((a,b)=>Number(normalizar(b.zona||'')===normalizar(zona))-Number(normalizar(a.zona||'')===normalizar(zona))).slice(0,5);
}
async function filasMedias(db,id,filtros,por=null) {
  const f=fuente(filtros);
  if (por && !['bar_id','variedad_id'].includes(por)) throw new Error('Agrupación no válida');
  return all(db,`SELECT ${por ? `d.${por},` : ''}${AGREGADOS} FROM ${f.sql} ${por ? `GROUP BY d.${por}` : ''}`,{persona:id,...f.params});
}
export async function medias(db,id,filtros={}) {
  return formatearMedias((await filasMedias(db,id,filtros))[0]);
}
export async function mediasAgrupadas(db,id,filtros,por) {
  if (!['bar_id','variedad_id'].includes(por)) throw new Error('Agrupación no válida');
  return new Map((await filasMedias(db,id,filtros,por)).map(r=>[r[por],formatearMedias(r)]));
}
export async function variedades(db,barId=null) {
  return (await all(db,`SELECT * FROM variedades ${barId?'WHERE bar_id=?':''} ORDER BY nombre`,barId?[barId]:[])).map(formatearVariedad);
}
export async function catalogo(db,persona,filtros) {
  const lista=await buscarBares(db,filtros), porBar=await mediasAgrupadas(db,persona.id,filtros,'bar_id'), recetas=await variedades(db);
  return lista.map(b=>({...b,variedades:recetas.filter(v=>v.barId===b.id),medias:porBar.get(b.id)||formatearMedias(null)}))
    .filter(b=>!filtros.cebolla&&!filtros.vegana || b.medias.global.valoraciones || b.variedades.some(v=>(!filtros.cebolla||v.cebolla===filtros.cebolla)&&(!filtros.vegana||v.vegana)))
    .sort(compararPorPerspectiva(filtros.perspectiva));
}
export async function visitas(db,persona,{solo='todas',barId=null,variedadId=null,desde=null,hasta=null,q='',limite=200,offset=0}={}) {
  const conditions=['d.retirada_en IS NULL',VISIBLE]; const params={persona:persona.id};
  if(solo==='mias') conditions.push('d.autor_id=@persona');
  if(solo==='demas') conditions.push('d.autor_id<>@persona');
  for(const [k,value,condition] of [['bar',barId,'d.bar_id=@bar'],['variedad',variedadId,'d.variedad_id=@variedad'],['desde',desde,'d.fecha>=@desde'],['hasta',hasta,'d.fecha<=@hasta']]) {
    if(value){conditions.push(condition);params[k]=value;}
  }
  if(q.trim()){ conditions.push("(b.nombre LIKE @q OR COALESCE(b.zona,'') LIKE @q OR p.nombre LIKE @q)");params.q=`%${q.trim().slice(0,80)}%`; }
  params.limite=Math.min(1000,Math.max(1,Math.floor(Number(limite)||200)));
  params.offset=Math.max(0,Math.floor(Number(offset)||0));
  return (await all(db,`${SELECT_VISITA} WHERE ${conditions.join(' AND ')} ORDER BY d.fecha DESC,d.creado_en DESC,d.id DESC LIMIT @limite OFFSET @offset`,params)).map(r=>formatearDegustacion(r,persona.id));
}
export async function visita(db,persona,id,retiradas=false) {
  const row=await first(db,`${SELECT_VISITA} WHERE d.id=@id AND ${VISIBLE}`,{id,persona:persona.id});
  if(!row || row.retirada_en && !(retiradas&&row.autor_id===persona.id)) return null;
  return formatearDegustacion(row,persona.id);
}
export async function ficha(db,persona,id,f) {
  const bar=await obtenerBar(db,id); if(!bar) throw new ErrorHttp(404,'Ese bar no existe.');
  const variedadId=f.variedad||null;
  if(variedadId && !await first(db,'SELECT 1 FROM variedades WHERE id=? AND bar_id=?',[variedadId,id])) throw new ErrorHttp(404,'Esa receta no pertenece a este bar.');
  const filtros={metodo:f.metodo,barId:id,variedadId,desde:f.desde,hasta:f.hasta};
  const activo=!!(variedadId||f.desde||f.hasta), m=await medias(db,persona.id,filtros);
  const porVariedad=await mediasAgrupadas(db,persona.id,{...filtros,variedadId:null},'variedad_id');
  return {bar,metodo:f.metodo,filtro:{variedadId,desde:f.desde,hasta:f.hasta,activo},medias:m,
    mediasGenerales:activo?await medias(db,persona.id,{metodo:f.metodo,barId:id}):m,
    mediasHistoricas:await medias(db,persona.id,{...filtros,metodo:'historica'}),
    variedades:(await variedades(db,id)).map(v=>({...v,medias:porVariedad.get(v.id)||formatearMedias(null)})),
    visitas:await visitas(db,persona,{...filtros,limite:500})};
}
export async function batalla(db,id) {
  const alcance='SELECT m2.persona_id FROM membresias m2 WHERE m2.grupo_id IN (SELECT grupo_id FROM membresias WHERE persona_id=@persona)';
  const mia=await first(db,'SELECT lado,actualizado_en FROM preferencias_cebolla WHERE persona_id=?',[id]);
  const rows=await all(db,`SELECT lado,COUNT(*) AS n FROM preferencias_cebolla WHERE persona_id IN (${alcance}) GROUP BY lado`,{persona:id});
  const votos={con:0,sin:0,total:0,miembros:(await first(db,`SELECT COUNT(DISTINCT persona_id) AS n FROM membresias WHERE persona_id IN (${alcance})`,{persona:id})).n};
  for(const r of rows){votos[r.lado]=r.n;votos.total+=r.n;}
  const notas={con:{media:null,valoraciones:0},sin:{media:null,valoraciones:0}};
  for(const r of await all(db,`SELECT v.cebolla,AVG(d.nota_general) AS media,COUNT(*) AS n FROM degustaciones d JOIN variedades v ON v.id=d.variedad_id WHERE ${VISIBLE} AND d.version_nota=2 AND d.retirada_en IS NULL AND v.cebolla IN ('con','sin') GROUP BY v.cebolla`,{persona:id})) notas[r.cebolla]={media:r.media,valoraciones:r.n};
  return {miLado:mia?.lado??null,actualizadoEn:mia?.actualizado_en??null,votos,degustaciones:notas};
}
export async function exportar(db,id) {
  const persona=await first(db,'SELECT id,nombre,usuario,es_demo,creado_en FROM personas WHERE id=?',[id]);
  const degustaciones=await all(db,'SELECT * FROM degustaciones WHERE autor_id=? ORDER BY fecha,creado_en',[id]);
  const bares=await all(db,'SELECT * FROM bares WHERE id IN (SELECT bar_id FROM degustaciones WHERE autor_id=?)',[id]);
  const recetas=await all(db,'SELECT * FROM variedades WHERE id IN (SELECT variedad_id FROM degustaciones WHERE autor_id=?)',[id]);
  for(const v of recetas)v.ingredientes=JSON.parse(v.ingredientes);
  for(const d of degustaciones){d.acompanamientos=JSON.parse(d.acompanamientos);d.receta_observada=JSON.parse(d.receta_observada);}
  return {formato:'tortillas-exportacion',version:2,alcance:'persona',exportadoEn:new Date().toISOString(),personas:[persona],
    grupos:await all(db,'SELECT g.id,g.nombre,g.es_demo,g.creado_en FROM grupos g JOIN membresias m ON m.grupo_id=g.id WHERE m.persona_id=?',[id]),
    membresias:await all(db,'SELECT * FROM membresias WHERE persona_id=?',[id]),bares,variedades:recetas,degustaciones,
    preferencias:await all(db,'SELECT * FROM preferencias_cebolla WHERE persona_id=?',[id])};
}
