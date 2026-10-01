import { all, first, run, statement, sha256 } from './db.js';
import { ErrorHttp } from '../server/http.js';
import { texto } from '../server/servicios/validar.js';
import { administrar } from './acceso.js';

const ACTIVOS = "rol IN ('admin','miembro')";
export async function comprobarBaja(db, id) {
  if (await first(db,'SELECT 1 FROM bajas_cuenta WHERE uid_hash=?',[await sha256(id)]))
    throw new ErrorHttp(403,'Tus datos de Tortillas ya se han eliminado. Termina de eliminar el acceso.',{bajaPendiente:true});
}
export async function perfil(db, id) {
  await comprobarBaja(db,id);
  const persona=await first(db,'SELECT id,nombre,usuario FROM personas WHERE id=? AND es_demo=0',[id]);
  if(!persona)throw new ErrorHttp(403,'Completa tu perfil para entrar.',{necesitaPerfil:true});
  return {...persona,esDemo:false};
}
export async function cambiarNombre(db,id,cuerpo) {
  const nombre=texto(cuerpo.nombre,'nombre',{min:2,max:40});
  await perfil(db,id);
  await run(db,'UPDATE personas SET nombre=? WHERE id=?',[nombre,id]);
  return perfil(db,id);
}
export async function miembros(db,persona,grupoId) {
  if(!await first(db,`SELECT 1 FROM membresias WHERE persona_id=? AND grupo_id=? AND ${ACTIVOS}`,[persona.id,grupoId]))
    throw new ErrorHttp(403,'No perteneces a ese grupo.');
  return all(db,`SELECT p.id,p.nombre,m.rol,m.creado_en AS creadoEn FROM membresias m JOIN personas p ON p.id=m.persona_id
    WHERE m.grupo_id=? ORDER BY CASE m.rol WHEN 'admin' THEN 0 WHEN 'miembro' THEN 1 ELSE 2 END,p.nombre`,[grupoId]);
}
export async function cambiarMiembro(db,persona,grupoId,id,rol) {
  if(!['admin','miembro','bloqueado','salio'].includes(rol))throw new ErrorHttp(400,'Ese rol no existe.');
  const saliendo=id===persona.id&&rol==='salio';
  if(!saliendo)await administrar(db,persona,grupoId);
  const autorizacion=saliendo ? "persona_id=?" : "EXISTS(SELECT 1 FROM membresias a WHERE a.persona_id=? AND a.grupo_id=membresias.grupo_id AND a.rol='admin')";
  // El permiso y el último administrador se comprueban en la misma escritura, también ante dos peticiones simultáneas.
  const [resultado]=await db.batch([statement(db,`UPDATE membresias SET rol=? WHERE persona_id=? AND grupo_id=? AND ${autorizacion}
    AND (?<>'salio' OR rol IN ('admin','miembro'))
    AND (rol<>'admin' OR ?='admin' OR EXISTS(SELECT 1 FROM membresias otro WHERE otro.grupo_id=membresias.grupo_id AND otro.rol='admin' AND otro.persona_id<>membresias.persona_id))`,
    [rol,id,grupoId,persona.id,rol,rol]),
    statement(db,`UPDATE invitaciones SET revocada_en=? WHERE creado_por=? AND grupo_id=? AND revocada_en IS NULL
      AND EXISTS(SELECT 1 FROM membresias WHERE persona_id=? AND grupo_id=? AND rol IN ('bloqueado','salio'))`,[new Date().toISOString(),id,grupoId,id,grupoId])]);
  if(!resultado.meta.changes)throw new ErrorHttp(409,'No se pudo cambiar el miembro. Debe quedar al menos un administrador; elige a otra persona antes de salir.');
  // Las visitas se conservan. Bloquear impide reutilizar una invitación; un administrador puede readmitir.
  return {ok:true};
}
export async function eliminarDatos(db,identidad,cuerpo) {
  if(cuerpo.confirmacion!=='ELIMINAR')throw new ErrorHttp(400,'Confirma la eliminación escribiendo ELIMINAR.');
  if(!Number.isFinite(identidad.authTime)||Date.now()/1000-identidad.authTime>300)
    throw new ErrorHttp(401,'Confirma de nuevo tu acceso antes de eliminar la cuenta.',{reautenticar:true});
  const id=identidad.id, hash=await sha256(id), ahora=new Date().toISOString();
  const pendiente='EXISTS(SELECT 1 FROM bajas_cuenta WHERE uid_hash=?)';
  // El marcador y el borrado son atómicos. Mantener solo el hash evita reactivar un perfil con un token aún válido.
  const sinGrupoAbandonado=`NOT EXISTS(SELECT 1 FROM membresias m WHERE m.persona_id=? AND m.rol='admin'
    AND NOT EXISTS(SELECT 1 FROM membresias a WHERE a.grupo_id=m.grupo_id AND a.rol='admin' AND a.persona_id<>m.persona_id)
    AND EXISTS(SELECT 1 FROM membresias o WHERE o.grupo_id=m.grupo_id AND o.rol IN ('admin','miembro') AND o.persona_id<>m.persona_id))`;
  await db.batch([
    statement(db,`INSERT INTO bajas_cuenta(uid_hash,creado_en) SELECT ?,? WHERE ${sinGrupoAbandonado} ON CONFLICT DO NOTHING`,[hash,ahora,id]),
    statement(db,`DELETE FROM invitaciones WHERE (creado_por=? OR grupo_id IN (SELECT grupo_id FROM membresias WHERE persona_id=? AND rol='admin' AND NOT EXISTS(SELECT 1 FROM membresias o WHERE o.grupo_id=membresias.grupo_id AND o.persona_id<>? AND o.rol IN ('admin','miembro')))) AND ${pendiente}`,[id,id,id,hash]),
    statement(db,`DELETE FROM degustaciones WHERE autor_id=? AND ${pendiente}`,[id,hash]),
    statement(db,`DELETE FROM preferencias_cebolla WHERE persona_id=? AND ${pendiente}`,[id,hash]),
    statement(db,`DELETE FROM limites WHERE clave IN (?,?,?,?) AND ${pendiente}`,[`usuario:${id}`,`registro:${id}`,`visitas:${id}`,`lugares:${id}`,hash]),
    statement(db,`UPDATE bares SET creado_por=NULL WHERE creado_por=? AND ${pendiente}`,[id,hash]),
    statement(db,`UPDATE variedades SET creado_por=NULL WHERE creado_por=? AND ${pendiente}`,[id,hash]),
    statement(db,`DELETE FROM membresias WHERE persona_id=? AND ${pendiente}`,[id,hash]),
    statement(db,`DELETE FROM personas WHERE id=? AND ${pendiente}`,[id,hash]),
  ]);
  if(!await first(db,'SELECT 1 FROM bajas_cuenta WHERE uid_hash=?',[hash]))
    throw new ErrorHttp(409,'Nombra a otro administrador antes de eliminar tu cuenta.');
  return {datosEliminados:true};
}
