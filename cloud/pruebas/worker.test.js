import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { crearWorker } from '../worker.js';
import { sha256 } from '../db.js';

let mf,db,worker,persistencia;
const opciones=()=>({...convertV4MiniflareOptions({cf:false,modules:true,script:'export default { fetch(){return new Response("Pruebas aisladas")} }',d1Databases:['DB'],compatibilityDate:'2026-09-01'}),resourcePersistencePath:persistencia});
const identidades={A:{id:'cuenta-a',email:'organizador@example.invalid'},B:{id:'cuenta-b',email:'amigo@example.invalid'},C:{id:'cuenta-c',email:'otro@example.invalid'}};
const env={FIREBASE_PROJECT_ID:'prueba-aislada',FIREBASE_API_KEY:'config-publica-ficticia',FIREBASE_AUTH_DOMAIN:'prueba-aislada.firebaseapp.com',FRONTEND_ORIGIN:'https://web.example.invalid',PILOT_OWNER_EMAIL:identidades.A.email,PLACES_PROVIDER:'ninguno'};
before(async()=>{
  persistencia=await fs.mkdtemp(path.join(os.tmpdir(),'tortilla-d1-prueba-'));
  mf=new Miniflare(opciones());
  db=await mf.getD1Database('DB');env.DB=db;
  for(const file of ['0001_piloto.sql','0002_acceso.sql']){
    const sql=await fs.readFile(new URL(`../migraciones/${file}`,import.meta.url),'utf8');
    for(const statement of sql.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  worker=crearWorker({autenticar:async token=>{
    if(!identidades[token])throw new Error('La prueba solo admite identidades ficticias');return identidades[token];
  }});
});
after(async()=>{await mf?.dispose();await fs.rm(persistencia,{recursive:true,force:true});});
async function pedir(token,path,method='GET',body,origin=env.FRONTEND_ORIGIN){
  const headers={'X-Requested-With':'tortillas','Origin':origin};if(token)headers.Authorization=`Bearer ${token}`;
  if(body!==undefined)headers['Content-Type']='application/json';
  const res=await worker.fetch(new Request(`https://api.example.invalid${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
  return {status:res.status,headers:res.headers,body:await res.json()};
}
const nueva=(op,nota=8,extra={})=>({opId:op,versionNota:2,notaGeneral:nota,fecha:'2026-09-30',variedad:{cebolla:'no_se'},...extra});
let codigo,invId,barId,visitaId;
test('La base nueva empieza vacía y no admite ni el selector demo ni peticiones ajenas',async()=>{
  for(const table of ['personas','bares','degustaciones'])assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
  assert.equal((await pedir(null,'/api/bares')).status,401);
  assert.equal((await pedir(null,'/api/acceso/demo','POST',{})).status,401);
  assert.equal((await pedir(null,'/api/config','GET',undefined,'https://intruso.example.invalid')).status,403);
  const config=await pedir(null,'/api/config');assert.equal(config.body.demo,false);assert.equal(config.body.PILOT_OWNER_EMAIL,undefined);
});
test('Solo la cuenta organizadora verificada puede fundar el grupo; se conserva al repetir',async()=>{
  assert.equal((await pedir('B','/api/acceso/perfil','POST',{nombre:'Amigo de prueba'})).status,400);
  const r=await pedir('A','/api/acceso/perfil','POST',{nombre:'Persona A'});
  assert.equal(r.status,201);assert.equal(r.body.grupos[0].rol,'admin');
  assert.equal((await pedir('A','/api/acceso/perfil','POST',{nombre:'Otro nombre'})).body.persona.nombre,'Persona A');
});
test('Invitación real hasheada, incorporación al grupo y prohibición de escalar permisos',async()=>{
  const r=await pedir('A','/api/grupos/piloto/invitaciones','POST',{});
  assert.equal(r.status,201);codigo=r.body.codigo;invId=r.body.id;
  const almacenada=await db.prepare('SELECT * FROM invitaciones WHERE id=?').bind(invId).first();
  assert.equal(almacenada.codigo_hash,await sha256(codigo));assert.ok(!JSON.stringify(almacenada).includes(codigo));
  assert.equal((await pedir('B','/api/acceso/perfil','POST',{nombre:'Persona B',codigo:'xxxxxxxxxxxxxxxxxxxx'})).status,403);
  const join=await pedir('B','/api/acceso/perfil','POST',{nombre:'Persona B',codigo,rol:'admin'});
  assert.equal(join.status,201);assert.equal(join.body.grupos[0].id,'piloto');assert.equal(join.body.grupos[0].rol,'miembro');
  assert.equal((await pedir('B','/api/grupos/piloto/invitaciones','POST',{})).status,403);
});
test('Una invitación anulada o caducada deja de incorporar cuentas sin eliminar las existentes',async()=>{
  assert.equal((await pedir('A',`/api/grupos/piloto/invitaciones/${invId}`,'DELETE')).status,200);
  assert.equal((await pedir('C','/api/acceso/perfil','POST',{nombre:'Persona C',codigo})).status,403);
  const r=await pedir('A','/api/grupos/piloto/invitaciones','POST',{});
  await db.prepare("UPDATE invitaciones SET expira_en='2000-01-01' WHERE id=?").bind(r.body.id).run();
  assert.equal((await pedir('C','/api/acceso/perfil','POST',{nombre:'Persona C',codigo:r.body.codigo})).status,403);
  assert.equal((await pedir('B','/api/yo')).status,200);
});
test('Validación y transacción D1: una visita errónea no deja un bar; los reintentos concurrentes no duplican',async()=>{
  const mal=await pedir('A','/api/degustaciones','POST',nueva('visita-mal',0,{nuevoBar:{nombre:'No debe existir'}}));
  assert.equal(mal.status,400);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM bares').first()).n,0);
  const payload=nueva('visita-prueba-a',8,{nuevoBar:{nombre:'Bar ficticio de prueba',zona:'Pruebas'}});
  const [r,s]=await Promise.all([pedir('A','/api/degustaciones','POST',payload),pedir('A','/api/degustaciones','POST',payload)]);
  assert.ok([200,201].includes(r.status),JSON.stringify(r));assert.ok([200,201].includes(s.status),JSON.stringify(s));
  assert.equal(r.body.degustacion.id,s.body.degustacion.id);barId=r.body.degustacion.bar.id;visitaId=r.body.degustacion.id;
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM bares').first()).n,1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM degustaciones').first()).n,1);
});
test('Cada visita cuenta y la nota general es independiente de los aspectos',async()=>{
  assert.equal((await pedir('A','/api/degustaciones','POST',nueva('segunda-visita-a',6,{barId,criterios:{sabor:10,patata:10,textura:10,equilibrio:10,presentacion:10}}))).status,201);
  assert.equal((await pedir('B','/api/degustaciones','POST',nueva('visita-prueba-b',9,{barId,autorId:'cuenta-a'}))).status,201);
  const ficha=(await pedir('A',`/api/bares/${barId}`)).body;
  assert.equal(ficha.medias.tu.media,7);assert.equal(ficha.medias.tu.visitas,2);assert.equal(ficha.medias.demas.media,9);assert.equal(ficha.mediasHistoricas.global.media,null);
  assert.equal((await pedir('B',`/api/degustaciones/${visitaId}`,'PATCH',nueva('ignorar',10,{barId}))).status,403);
  assert.equal((await pedir('B',`/api/degustaciones/${visitaId}`,'DELETE')).status,403);
});
test('Otra cuenta de otro grupo no obtiene visitas ni agregados; los comentarios privados solo son propios',async()=>{
  await db.batch([
    db.prepare("INSERT INTO personas(id,nombre,usuario,creado_en) VALUES('cuenta-c','Persona C','cuenta-c','2026-09-30')"),
    db.prepare("INSERT INTO grupos(id,nombre,creado_en) VALUES('otro','Otro grupo','2026-09-30')"),
    db.prepare("INSERT INTO membresias(persona_id,grupo_id,rol,creado_en) VALUES('cuenta-c','otro','admin','2026-09-30')"),
  ]);
  const catalogo=(await pedir('C','/api/bares')).body;
  assert.equal(catalogo.bares[0].medias.global.media,null);assert.equal((await pedir('C',`/api/degustaciones/${visitaId}`)).status,404);
  assert.equal((await pedir('C','/api/degustaciones')).body.degustaciones.length,0);
  assert.equal((await pedir('C','/api/degustaciones','POST',nueva('grupo-falso',8,{barId,grupoId:'piloto'}))).status,403);
  const r=await pedir('A',`/api/degustaciones/${visitaId}`,'PATCH',nueva('ignorar',8,{barId,comentario:'Solo para mí',comentarioPrivado:true}));
  assert.equal(r.status,200);assert.equal((await pedir('B',`/api/degustaciones/${visitaId}`)).body.degustacion.comentario,null);
});
test('Exportación propia, edición histórica, retirada y preferencia de cebolla mantienen el ámbito',async()=>{
  const vieja={opId:'visita-antigua-a',barId,versionNota:1,fecha:'2026-09-29',variedad:{cebolla:'con'},criterios:{patata:7,jugosidad:7,cuajado:7,sabor:7,presentacion:7}};
  const r=await pedir('A','/api/degustaciones','POST',vieja);assert.equal(r.status,201,JSON.stringify(r));
  assert.equal((await pedir('A',`/api/degustaciones/${r.body.degustacion.id}`,'PATCH',nueva('ignorar',9,{barId}))).status,400);
  const exp=(await pedir('A','/api/exportar')).body;assert.ok(exp.degustaciones.every(d=>d.autor_id==='cuenta-a'));
  assert.ok(!JSON.stringify(exp).includes('clave_hash'));assert.ok(!JSON.stringify(exp).includes('codigo_hash'));
  assert.equal((await pedir('B','/api/batalla','PUT',{lado:'con'})).body.votos.con,1);
  assert.equal((await pedir('B','/api/batalla','PUT',{lado:'sin'})).body.votos.total,1);
  assert.equal((await pedir('C','/api/batalla')).body.votos.total,0);
  assert.equal((await pedir('A',`/api/degustaciones/${r.body.degustacion.id}`,'DELETE')).status,200);
});
test('D1 revierte una escritura completa si falla una de las sentencias del lote',async()=>{
  const before=(await db.prepare('SELECT COUNT(*) AS n FROM bares').first()).n;
  await assert.rejects(db.batch([
    db.prepare("INSERT INTO bares(id,nombre,nombre_norm,creado_en,actualizado_en) VALUES('rollback','Rollback','rollback','2026-09-30','2026-09-30')"),
    db.prepare("INSERT INTO membresias(persona_id,grupo_id,creado_en) VALUES('persona-que-no-existe','piloto','2026-09-30')"),
  ]));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM bares').first()).n,before);
});

test('Importar conserva el método histórico y el identificador entre lotes y reintentos',async()=>{
  const entrada={bar:'Bar histórico ficticio',ciudad:'Pruebas',fecha:'29/09/2026',cebolla:'con cebolla',criterios:{patata:6,jugosidad:8,cuajado2:7,sabor:9,presentacion:5}};
  const preview=await pedir('A','/api/importar/previsualizar','POST',{formato:'tortillometro_v2',entradas:[entrada],offset:20});
  assert.equal(preview.status,200);const e=preview.body.elementos[0];assert.equal(e.indice,20);assert.ok(e.opId.endsWith('-20'));
  const guardar=()=>pedir('A','/api/importar','POST',{formato:'tortillometro_v2',elementos:[e]});
  assert.deepEqual((await guardar()).body,{creadas:1,repetidas:0,errores:[]});
  assert.deepEqual((await guardar()).body,{creadas:0,repetidas:1,errores:[]});
  const row=await db.prepare('SELECT * FROM degustaciones WHERE op_id=?').bind(e.opId).first();
  assert.equal(row.version_nota,1);assert.equal(row.nota_general,null);assert.equal(row.cuajado,7);
  // La corrección histórica también crea el lugar y actualiza la visita juntos.
  const corregida=await pedir('A',`/api/degustaciones/${row.id}`,'PATCH',{versionNota:1,nuevoBar:{nombre:'Ubicación histórica corregida'},fecha:'2026-09-29',variedad:{cebolla:'con'},criterios:{patata:6,jugosidad:8,cuajado:7,sabor:9,presentacion:5}});
  assert.equal(corregida.status,200,JSON.stringify(corregida));assert.equal(corregida.body.degustacion.bar.nombre,'Ubicación histórica corregida');
  assert.equal((await pedir('A','/api/importar','POST',{formato:'tortillometro_v2',elementos:[e,e,e,e]})).status,400);
});

test('Un alta manual no puede suplantar un identificador externo del catálogo',async()=>{
  const r=await pedir('B','/api/degustaciones','POST',nueva('proveedor-manipulado',8,{nuevoBar:{nombre:'Manual ficticio',proveedorId:'photon:N:123'}}));
  assert.equal(r.status,201,JSON.stringify(r));
  assert.equal((await db.prepare('SELECT proveedor_id FROM bares WHERE id=?').bind(r.body.degustacion.bar.id).first()).proveedor_id,null);
});

test('Parar y reiniciar el emulador conserva cuentas, notas y anulación de invitaciones',async()=>{
  const previo=(await pedir('A','/api/yo')).body;
  await mf.dispose();mf=new Miniflare(opciones());db=await mf.getD1Database('DB');env.DB=db;
  worker=crearWorker({autenticar:async token=>identidades[token]});
  const r=await pedir('A','/api/yo');assert.equal(r.status,200);assert.deepEqual(r.body,previo);
  assert.ok((await db.prepare('SELECT revocada_en FROM invitaciones WHERE id=?').bind(invId).first()).revocada_en);
  assert.equal((await pedir('B',`/api/degustaciones/${visitaId}`)).body.degustacion.comentario,null);
});
