import { all, first, run, statement, sha256 } from './db.js';
import { gruposDe } from './lecturas.js';
import { texto } from '../server/servicios/validar.js';
import { ErrorHttp } from '../server/http.js';

export async function limitar(db, clave, maximo, ventanaSegundos) {
  const ventana=Math.floor(Date.now()/1000/ventanaSegundos);
  const sql=`INSERT INTO limites(clave,ventana,n) VALUES(?,?,1)
    ON CONFLICT(clave,ventana) DO UPDATE SET n=n+1 RETURNING n`;
  const row=await first(db,sql,[clave,ventana]);
  if(row.n>maximo) throw new ErrorHttp(429,'Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.');
}
export async function personaDe(db, identidad) {
  const row=await first(db,'SELECT id,nombre,usuario FROM personas WHERE id=? AND es_demo=0',[identidad.id]);
  if(!row || !(await gruposDe(db,row.id)).length) throw new ErrorHttp(403,'Introduce tu invitación para entrar al grupo.',{necesitaPerfil:true});
  return {...row,esDemo:false};
}
export async function registrarPerfil(db, identidad, cuerpo, env) {
  const existente=await first(db,'SELECT persona_id FROM membresias WHERE persona_id=?',[identidad.id]);
  // Una membresía existente nunca obtiene nuevos permisos por volver a registrarse.
  if(existente) return personaDe(db,identidad);
  const nombre=texto(cuerpo.nombre,'nombre',{min:2,max:40});
  const instante=new Date().toISOString();
  const owner=!!env.PILOT_OWNER_EMAIL && identidad.email===env.PILOT_OWNER_EMAIL.trim().toLowerCase();
  const nombreGrupo=(env.GROUP_NAME||'Amigos').trim().slice(0,80);
  const personaInsert=(condicion,params=[])=>statement(db,`INSERT INTO personas(id,nombre,usuario,clave_hash,es_demo,creado_en)
    SELECT ?,?,?,NULL,0,? WHERE ${condicion} ON CONFLICT(id) DO NOTHING`,[identidad.id,nombre,identidad.id,instante,...params]);
  if(owner){
    const libre="NOT EXISTS(SELECT 1 FROM membresias WHERE grupo_id='piloto' AND rol='admin')";
    await db.batch([
      statement(db,"INSERT INTO grupos(id,nombre,es_demo,creado_en) VALUES('piloto',?,0,?) ON CONFLICT(id) DO NOTHING",[nombreGrupo,instante]),
      personaInsert(libre),
      statement(db,`INSERT INTO membresias(persona_id,grupo_id,rol,creado_en)
        SELECT ?,'piloto','admin',? WHERE ${libre} ON CONFLICT DO NOTHING`,[identidad.id,instante]),
    ]);
  }else{
    const codigo=texto(cuerpo.codigo,'código de invitación',{min:20,max:100});
    const hash=await sha256(codigo);
    const valido=`codigo_hash=? AND revocada_en IS NULL AND expira_en>?`;
    await db.batch([
      personaInsert(`EXISTS(SELECT 1 FROM invitaciones WHERE ${valido})`,[hash,instante]),
      statement(db,`INSERT INTO membresias(persona_id,grupo_id,rol,creado_en)
        SELECT ?,grupo_id,'miembro',? FROM invitaciones WHERE ${valido} ON CONFLICT DO NOTHING`,[identidad.id,instante,hash,instante]),
    ]);
  }
  try { return await personaDe(db,identidad); }
  catch { throw new ErrorHttp(403,'La invitación ha caducado, se ha anulado o no es válida.',{campo:'codigo'}); }
}
export async function administrar(db,persona,grupoId) {
  const grupo=await first(db,`SELECT g.id,g.nombre FROM grupos g JOIN membresias m ON m.grupo_id=g.id
    WHERE m.persona_id=? AND g.id=? AND m.rol='admin'`,[persona.id,grupoId]);
  if(!grupo) throw new ErrorHttp(403,'Solo quien administra este grupo puede gestionar invitaciones.');
  return grupo;
}
export async function invitaciones(db,persona,grupoId) {
  await administrar(db,persona,grupoId);
  return all(db,'SELECT id,creado_en AS creadoEn,expira_en AS expiraEn,revocada_en AS revocadaEn FROM invitaciones WHERE grupo_id=? ORDER BY creado_en DESC LIMIT 30',[grupoId]);
}
export async function crearInvitacion(db,persona,grupoId) {
  await administrar(db,persona,grupoId);
  const codigo=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
  const id=crypto.randomUUID(), creadoEn=new Date().toISOString(), expiraEn=new Date(Date.now()+7*86400000).toISOString();
  await run(db,'INSERT INTO invitaciones(id,grupo_id,codigo_hash,creado_por,creado_en,expira_en) VALUES(?,?,?,?,?,?)',[id,grupoId,await sha256(codigo),persona.id,creadoEn,expiraEn]);
  return {id,codigo,creadoEn,expiraEn};
}
export async function revocarInvitacion(db,persona,grupoId,id) {
  await administrar(db,persona,grupoId);
  await run(db,'UPDATE invitaciones SET revocada_en=? WHERE id=? AND grupo_id=? AND revocada_en IS NULL',[new Date().toISOString(),id,grupoId]);
  return {ok:true};
}
