import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdtemp, readFile, writeFile, open, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ejecutar=promisify(execFile);
const aad=Buffer.from('tortillas-d1-copia-v1');
const tablas=['personas','grupos','membresias','bares','variedades','preferencias_cebolla','degustaciones','invitaciones','limites','bajas_cuenta'];
function clave(texto,sal){
  if(typeof texto!=='string'||texto.length<20)throw new Error('La clave de la copia debe tener al menos 20 caracteres.');
  return scryptSync(texto,sal,32);
}
export function cifrar(sql,password){
  const sal=randomBytes(16),iv=randomBytes(12),key=clave(password,sal);
  try{
    const cifrador=createCipheriv('aes-256-gcm',key,iv);cifrador.setAAD(aad);
    const datos=Buffer.concat([cifrador.update(sql,'utf8'),cifrador.final()]);
    return JSON.stringify({formato:'tortillas-d1',version:1,sal:sal.toString('base64'),iv:iv.toString('base64'),tag:cifrador.getAuthTag().toString('base64'),datos:datos.toString('base64')});
  }finally{key.fill(0);}
}
export function descifrar(copia,password){
  const c=JSON.parse(copia);
  if(c.formato!=='tortillas-d1'||c.version!==1)throw new Error('Formato de copia desconocido.');
  const sal=Buffer.from(c.sal,'base64'),iv=Buffer.from(c.iv,'base64'),tag=Buffer.from(c.tag,'base64');
  if(sal.length!==16||iv.length!==12||tag.length!==16)throw new Error('La copia está incompleta.');
  const key=clave(password,sal);
  try{
    const descifrador=createDecipheriv('aes-256-gcm',key,iv);descifrador.setAAD(aad);descifrador.setAuthTag(tag);
    return Buffer.concat([descifrador.update(Buffer.from(c.datos,'base64')),descifrador.final()]).toString('utf8');
  }catch{throw new Error('No se pudo abrir la copia: clave incorrecta o archivo alterado.');}
  finally{key.fill(0);}
}
export async function restaurar(sql,destino){
  // Reservar exclusivamente: nunca abrir ni sustituir una base que ya exista.
  const archivo=await open(destino,'wx',0o600);await archivo.close();
  let db;
  try{
    db=new DatabaseSync(destino);
    // Las exportaciones D1 pueden no estar ordenadas por dependencias.
    db.exec('PRAGMA foreign_keys=OFF;');db.exec(sql);
    const integridad=db.prepare('PRAGMA integrity_check').all();
    if(integridad.length!==1||integridad[0].integrity_check!=='ok')throw new Error('La integridad de la copia no es correcta.');
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('La copia contiene referencias incompletas.');
    const existentes=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
    if(tablas.some(t=>!existentes.has(t)))throw new Error('Faltan tablas: esta copia no corresponde a la versión actual.');
    return Object.fromEntries(tablas.map(t=>[t,db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
  }catch(error){db?.close();db=null;await rm(destino,{force:true});throw error;}
  finally{db?.close();}
}
export async function verificarCopia(copia,password){
  const temporal=await mkdtemp(path.join(tmpdir(),'tortillas-restauracion-'));
  try{return await restaurar(descifrar(copia,password),path.join(temporal,'verificacion.sqlite'));}
  finally{await rm(temporal,{recursive:true,force:true});}
}
async function exportarRemoto(){
  const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_DATABASE_ID:database,CLOUDFLARE_API_TOKEN:token}=process.env;
  if(!account||!database||!token)throw new Error('Faltan la cuenta, la base o el token de lectura de Cloudflare.');
  const temporal=await mkdtemp(path.join(tmpdir(),'tortillas-exportacion-'));
  try{
    const config=path.join(temporal,'wrangler.json'),salida=path.join(temporal,'datos.sql');
    await writeFile(config,JSON.stringify({name:'copia-tortillas',account_id:account,compatibility_date:'2026-09-01',d1_databases:[{binding:'DB',database_name:'tortillas-piloto',database_id:database}]}),{mode:0o600});
    const wrangler=fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js',import.meta.url));
    try{await ejecutar(process.execPath,[wrangler,'d1','export','DB','--remote','--config',config,'--output',salida],{env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:240000,maxBuffer:2*1024*1024});}
    catch{throw new Error('Cloudflare no pudo exportar la base. Revisa el token de lectura, los identificadores y la conexión.');}
    return await readFile(salida,'utf8');
  }finally{await rm(temporal,{recursive:true,force:true});}
}
async function principal(){
  const [accion,entrada,salida]=process.argv.slice(2),password=process.env.BACKUP_PASSWORD;
  if(!password||password.length<20)throw new Error('Configura BACKUP_PASSWORD con la clave de la copia (mínimo 20 caracteres).');
  if(accion==='crear'&&entrada){
    const copia=cifrar(await exportarRemoto(),password);
    await verificarCopia(copia,password);
    await writeFile(path.resolve(entrada),copia,{flag:'wx',mode:0o600});
    console.log('Copia cifrada creada y restauración local verificada.');
  }else if(accion==='verificar'&&entrada){
    await verificarCopia(await readFile(entrada,'utf8'),password);console.log('Restauración local e integridad verificadas.');
  }else if(accion==='restaurar-local'&&entrada&&salida){
    await restaurar(descifrar(await readFile(entrada,'utf8'),password),path.resolve(salida));console.log('Copia restaurada en una base local nueva.');
  }else if(accion==='extraer-sql'&&entrada&&salida){
    const copia=await readFile(entrada,'utf8');await verificarCopia(copia,password);
    await writeFile(path.resolve(salida),descifrar(copia,password),{flag:'wx',mode:0o600});console.log('SQL extraído para restaurar en una base nueva. Contiene datos privados: no lo subas a GitHub.');
  }else throw new Error('Uso: node cloud/herramientas/copias.js crear copia.enc | verificar copia.enc | restaurar-local copia.enc nueva.sqlite | extraer-sql copia.enc nueva.sql');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{await principal();}catch(error){console.error(error.message);process.exitCode=1;}
}
