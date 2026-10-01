import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../app/js/api.js';
import { establecerSesion,establecerConfig,limpiarSesion } from '../../app/js/estado.js';
import { guardarBorrador,leerBorrador } from '../../app/js/borradores.js';
import { tieneClaveFirebase,cambiarClaveFirebase,errorFirebase } from '../../app/js/firebase-cliente.js';

test('Una cuenta solo de Google no ofrece cambio de contraseña; una cuenta vinculada con contraseña sí',async()=>{
  assert.equal(tieneClaveFirebase({providerData:[{providerId:'google.com'}]}),false);
  assert.equal(tieneClaveFirebase({providerData:[{providerId:'google.com'},{providerId:'password'}]}),true);
  assert.equal(tieneClaveFirebase(null),false);
  await assert.rejects(cambiarClaveFirebase('no-usada','no-usada'),/Google/);
  assert.match(errorFirebase({code:'auth/popup-blocked'}),/ventanas emergentes/);
  assert.match(errorFirebase({code:'auth/account-exists-with-different-credential'}),/método que utilizaste/);
});

test('Una respuesta cuyo contenido llega tras cambiar de cuenta no se muestra a la nueva persona',async()=>{
  const original=globalThis.fetch;
  let resolver,leyendo;
  const lectura=new Promise(resolve=>{leyendo=resolve;});
  globalThis.fetch=async()=>({ok:true,text:()=>{leyendo();return new Promise(resolve=>{resolver=resolve;});}});
  try{
    establecerSesion({persona:{id:'A'}});
    const pendiente=api.get('/api/degustaciones');
    await lectura;
    limpiarSesion();establecerSesion({persona:{id:'B'}});
    resolver('{"degustaciones":["privado de A"]}');
    await assert.rejects(pendiente,e=>e.estado===409);
  }finally{globalThis.fetch=original;limpiarSesion();}
});

test('Los borradores quedan separados por persona y por proyecto, sin perder los antiguos locales',()=>{
  const original=globalThis.localStorage,datos=new Map();
  globalThis.localStorage={getItem:k=>datos.get(k)||null,setItem:(k,v)=>datos.set(k,v),removeItem:k=>datos.delete(k)};
  try{
    establecerConfig({auth:'local'});guardarBorrador('A',{texto:'local anterior'});
    establecerConfig({auth:'firebase',firebase:{projectId:'piloto'}});guardarBorrador('A',{texto:'borrador A'});
    assert.equal(leerBorrador('B'),null);assert.equal(leerBorrador('A').texto,'borrador A');
    establecerConfig({firebase:{projectId:'otro'}});assert.equal(leerBorrador('A'),null);
    establecerConfig({auth:'local'});assert.equal(leerBorrador('A').texto,'local anterior');
  }finally{globalThis.localStorage=original;}
});
