import { all, first, run, statement, sha256 } from './db.js';
import { visita, obtenerBar, sugerir, gruposDe } from './lecturas.js';
import { validarDatosDegustacion, CRITERIOS, ASPECTOS } from '../server/servicios/datos-degustacion.js';
import { validarDatosBar } from '../server/servicios/bares.js';
import { firmaVariedad, nombreVariedad, normalizarIngredientes } from '../server/servicios/variedades.js';
import { normalizar } from '../server/servicios/texto.js';
import { texto } from '../server/servicios/validar.js';
import { ErrorHttp } from '../server/http.js';
import { identidadLugar } from '../server/servicios/lugares.js';

/** Planifica la escritura; todos los INSERT/UPDATE se ejecutan en una sola transacción D1. */
export async function guardarVisita(db,persona,cuerpo,lugares,{id=null,origen=null}={}) {
  const actual=id?await first(db,'SELECT * FROM degustaciones WHERE id=?',[id]):null;
  if(id && (!actual||actual.retirada_en))throw new ErrorHttp(404,'Esa valoración no existe.');
  if(actual && actual.autor_id!==persona.id)throw new ErrorHttp(403,'Solo puedes editar tus propias valoraciones.');
  if(actual && cuerpo.versionNota!==undefined && cuerpo.versionNota!==actual.version_nota)throw new ErrorHttp(400,'Una corrección conserva el método original de valoración.');
  const opId=actual?.op_id||texto(cuerpo.opId,'opId',{min:6,max:120});
  const previa=await first(db,'SELECT id FROM degustaciones WHERE autor_id=? AND op_id=?',[persona.id,opId]);
  if(!id&&previa)return {degustacion:await visita(db,persona,previa.id,true),repetida:true};
  const grupos=await gruposDe(db,persona.id);
  const grupoId=actual?.grupo_id||cuerpo.grupoId||grupos[0]?.id;
  if(!grupos.some(g=>g.id===grupoId))throw new ErrorHttp(403,'No perteneces a ese grupo.');
  // Valida la nota y detalles ANTES de consultar proveedores o escribir lugares.
  const datos=validarDatosDegustacion({...cuerpo,barId:cuerpo.barId||actual?.bar_id||'nuevo',versionNota:actual?.version_nota??cuerpo.versionNota});
  let barId=cuerpo.barId||(!cuerpo.nuevoBar&&actual?.bar_id), nuevo=null;
  const instante=new Date().toISOString();
  if(!barId && cuerpo.nuevoBar){
    const ref=cuerpo.nuevoBar.referenciaLugar;
    if(ref){
      const proveedorId=identidadLugar(ref);
      const existente=await first(db,'SELECT id FROM bares WHERE proveedor_id=?',[proveedorId]);
      if(existente)barId=existente.id;
      else {nuevo=await lugares.resolver(ref);barId=`b_${(await sha256(nuevo.proveedorId)).slice(0,48)}`;}
    }else{
      nuevo=validarDatosBar(cuerpo.nuevoBar);
      if(!cuerpo.forzarBar && await first(db,"SELECT id FROM bares WHERE nombre_norm=? AND LOWER(COALESCE(zona,''))=LOWER(?)",[normalizar(nuevo.nombre),nuevo.zona||''])){
        throw new ErrorHttp(409,'Hay un lugar parecido. Comprueba la dirección antes de crear otra ficha.',{sugerencias:await sugerir(db,nuevo)});
      }
      barId=`b_${(await sha256(`${persona.id}:${opId}:${id?'editar:'+JSON.stringify(nuevo):'crear'}`)).slice(0,48)}`;
    }
  }
  if(!barId || !nuevo&&!await obtenerBar(db,barId))throw new ErrorHttp(404,'Ese bar no existe.');
  let guard=id?'EXISTS(SELECT 1 FROM degustaciones WHERE id=? AND autor_id=? AND retirada_en IS NULL)':'NOT EXISTS(SELECT 1 FROM degustaciones WHERE autor_id=? AND op_id=?)';
  const guardParams=id?[id,persona.id]:[persona.id,opId];
  guard+=" AND EXISTS(SELECT 1 FROM membresias WHERE persona_id=? AND grupo_id=? AND rol IN ('admin','miembro'))";
  guardParams.push(persona.id,grupoId);
  const commands=[];
  if(nuevo){
    const b=validarDatosBar(nuevo);
    commands.push(statement(db,`INSERT INTO bares(id,nombre,nombre_norm,zona,ciudad,direccion,lat,lng,es_demo,creado_por,creado_en,actualizado_en,proveedor_id)
      SELECT ?,?,?,?,?,?,?,?,0,?,?,?,? WHERE ${guard} ON CONFLICT DO NOTHING`,
      [barId,b.nombre,normalizar(b.nombre),b.zona,b.ciudad,b.direccion,b.lat,b.lng,persona.id,instante,instante,nuevo.proveedorId||null,...guardParams]));
  }
  let variedadId=null;
  if(!(datos.versionNota===2&&datos.variedad.cebolla==='no_se')){
    const ingredientes=normalizarIngredientes(datos.variedad.ingredientes), v={...datos.variedad,ingredientes};
    const firma=firmaVariedad(v);
    variedadId=`v_${(await sha256(`${barId}:${firma}`)).slice(0,48)}`;
    // Las bases creadas por esta versión usan IDs deterministas; conserva cualquier receta anterior.
    const existente=await first(db,'SELECT id FROM variedades WHERE bar_id=? AND firma=?',[barId,firma]);
    if(existente)variedadId=existente.id;
    commands.push(statement(db,`INSERT INTO variedades(id,bar_id,cebolla,vegana,ingredientes,firma,nombre,creado_por,creado_en)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT DO NOTHING`,[variedadId,barId,v.cebolla,v.vegana?1:0,JSON.stringify(ingredientes),firma,nombreVariedad(v),persona.id,instante,...guardParams]));
  }
  const campos={bar_id:barId,variedad_id:variedadId,receta_observada:JSON.stringify(datos.variedad),version_nota:datos.versionNota,nota_general:datos.notaGeneral,fecha:datos.fecha,
    ...Object.fromEntries([...new Set([...CRITERIOS,...ASPECTOS])].map(k=>[k,datos.criterios[k]??null])),integracion:datos.integracion,
    tipo_cuajado:datos.tipoCuajado,sal:datos.sal,tamano:datos.tamano,formato:datos.formato,precio:datos.precio,
    acompanamientos:JSON.stringify(datos.acompanamientos),comentario:datos.comentario,comentario_privado:datos.comentarioPrivado?1:0,actualizado_en:instante};
  if(id){
    commands.push(statement(db,`UPDATE degustaciones SET ${Object.keys(campos).map(k=>`${k}=?`).join(',')} WHERE id=? AND autor_id=? AND retirada_en IS NULL AND ${guard}`,[...Object.values(campos),id,persona.id,...guardParams]));
  }else{
    id=crypto.randomUUID();
    const camposInsert={id,op_id:opId,autor_id:persona.id,...campos,origen,creado_en:instante};
    commands.push(statement(db,`INSERT INTO degustaciones(grupo_id,${Object.keys(camposInsert).join(',')})
      SELECT (SELECT grupo_id FROM membresias WHERE persona_id=? AND grupo_id=?),${Object.keys(camposInsert).map(()=>'?').join(',')}
      WHERE ${guard}`, [persona.id,grupoId,...Object.values(camposInsert),...guardParams]));
  }
  await db.batch(commands);
  const guardada=await first(db,'SELECT id FROM degustaciones WHERE autor_id=? AND op_id=?',[persona.id,opId]);
  if(!guardada || !(await gruposDe(db,persona.id)).some(g=>g.id===grupoId))throw new ErrorHttp(403,'Ya no perteneces a ese grupo.');
  return {degustacion:await visita(db,persona,guardada.id,true),repetida:!actual&&guardada.id!==id};
}
export async function retirar(db,persona,id){
  const row=await first(db,'SELECT autor_id,retirada_en FROM degustaciones WHERE id=?',[id]);
  if(!row||row.retirada_en)throw new ErrorHttp(404,'Esa valoración no existe.');
  if(row.autor_id!==persona.id)throw new ErrorHttp(403,'Solo puedes retirar tus propias valoraciones.');
  const instante=new Date().toISOString();
  await run(db,'UPDATE degustaciones SET retirada_en=?,actualizado_en=? WHERE id=? AND autor_id=?',[instante,instante,id,persona.id]);
  return {id,retirada:true};
}
export async function editarBar(db,persona,id,cuerpo){
  const actual=await first(db,'SELECT * FROM bares WHERE id=?',[id]);
  if(!actual)throw new ErrorHttp(404,'Ese bar no existe.');
  if(actual.creado_por!==persona.id)throw new ErrorHttp(403,'Solo quien añadió el lugar puede corregir sus datos.');
  const datos=validarDatosBar({...actual,...validarDatosBar(cuerpo,{parcial:true})});
  await run(db,'UPDATE bares SET nombre=?,nombre_norm=?,zona=?,ciudad=?,direccion=?,lat=?,lng=?,actualizado_en=? WHERE id=? AND creado_por=?',
    [datos.nombre,normalizar(datos.nombre),datos.zona,datos.ciudad,datos.direccion,datos.lat,datos.lng,new Date().toISOString(),id,persona.id]);
  return obtenerBar(db,id);
}
