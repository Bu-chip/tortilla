import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cifrar,descifrar,restaurar,verificarCopia } from '../herramientas/copias.js';
const password='Clave ficticia para probar recuperaciones 2026';
const sql=(await Promise.all(['0001_piloto.sql','0002_acceso.sql','0003_gestion.sql'].map(n=>readFile(new URL(`../migraciones/${n}`,import.meta.url),'utf8')))).join('\n')+"\nINSERT INTO personas(id,nombre,usuario,creado_en) VALUES('ficticia','Persona de prueba','ficticia','2026-10-01');";
test('La copia completa se cifra y se recupera en una base aparte con el dato intacto',async()=>{
  const copia=cifrar(sql,password);assert.ok(!copia.includes('Persona de prueba'));assert.notEqual(copia,cifrar(sql,password));
  assert.equal((await verificarCopia(copia,password)).personas,1);
  const tmp=await mkdtemp(path.join(tmpdir(),'tortillas-copia-test-'));
  try{const dest=path.join(tmp,'restaurada.sqlite');await restaurar(descifrar(copia,password),dest);const db=new DatabaseSync(dest);assert.equal(db.prepare('SELECT nombre FROM personas').get().nombre,'Persona de prueba');db.close();}
  finally{await rm(tmp,{recursive:true,force:true});}
});
test('Clave incorrecta, copia alterada y esquema incompleto se rechazan',async()=>{
  const copia=cifrar(sql,password);
  assert.throws(()=>descifrar(copia,'Esta no es la clave de recuperación'),/clave incorrecta/);
  const rota=JSON.parse(copia),bytes=Buffer.from(rota.datos,'base64');bytes[42]^=1;rota.datos=bytes.toString('base64');
  assert.throws(()=>descifrar(JSON.stringify(rota),password),/archivo alterado/);
  await assert.rejects(verificarCopia(cifrar('CREATE TABLE incompleta(id INTEGER);',password),password),/Faltan tablas/);
  assert.throws(()=>cifrar(sql,'corta'),/20 caracteres/);
});
test('La recuperación nunca sustituye un archivo existente',async()=>{
  const tmp=await mkdtemp(path.join(tmpdir(),'tortillas-no-sobrescribir-')),dest=path.join(tmp,'original.sqlite');
  try{await writeFile(dest,'CONSERVAR');await assert.rejects(restaurar(sql,dest),{code:'EEXIST'});assert.equal(await readFile(dest,'utf8'),'CONSERVAR');}
  finally{await rm(tmp,{recursive:true,force:true});}
});

test('Actualizar la gestión dos veces conserva las visitas y registra una sola migración',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(await readFile(new URL('../crear-tablas.sql',import.meta.url),'utf8'));
    db.exec("INSERT INTO personas(id,nombre,usuario,creado_en) VALUES('conservar','Nombre conservado','conservar','2026-10-01');");
    const actualizacion=await readFile(new URL('../actualizar-gestion.sql',import.meta.url),'utf8');db.exec(actualizacion);db.exec(actualizacion);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM d1_migrations WHERE name='0003_gestion.sql'").get().n,1);
    assert.equal(db.prepare("SELECT nombre FROM personas WHERE id='conservar'").get().nombre,'Nombre conservado');
  }finally{db.close();}
});
