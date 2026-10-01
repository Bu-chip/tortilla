import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarFirebase,comprobarCuenta } from '../firebase.js';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='clave-prueba';
const now=Math.floor(Date.now()/1000);
const base={aud:'proyecto-prueba',iss:'https://securetoken.google.com/proyecto-prueba',sub:'persona-prueba',exp:now+3600,iat:now,auth_time:now,email:'a@example.invalid',email_verified:true};
const b64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function token(claims=base,header={alg:'RS256',kid:jwk.kid}){
  const msg=`${b64(header)}.${b64(claims)}`;
  return `${msg}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(msg))).toString('base64url')}`;
}
const options={transporte:async()=>Response.json({keys:[jwk]},{headers:{'cache-control':'max-age=300'}})};
test('Se acepta un token firmado por Google simulado para el proyecto esperado',async()=>{
  assert.equal((await verificarFirebase(await token(),'proyecto-prueba',options)).id,'persona-prueba');
});
test('Se rechazan firmas alteradas, otro proyecto, emisor falso, token caducado y algoritmo inseguro',async()=>{
  const t=await token();
  await assert.rejects(verificarFirebase(`${t.slice(0,t.lastIndexOf('.')+1)}AAAA`,'proyecto-prueba',options),e=>e.estado===401);
  for(const claims of [{...base,aud:'otro'},{...base,iss:'https://intruso.invalid'},{...base,exp:now-1},{...base,iat:now+300}])await assert.rejects(verificarFirebase(await token(claims),'proyecto-prueba',options),e=>e.estado===401);
  await assert.rejects(verificarFirebase(await token(base,{alg:'none',kid:jwk.kid}),'proyecto-prueba',options),e=>e.estado===401);
});
test('El correo sin confirmar no puede crear ni utilizar perfiles',async()=>{
  await assert.rejects(verificarFirebase(await token({...base,email_verified:false}),'proyecto-prueba',options),e=>e.estado===403&&e.extra.verificarCorreo);
});
test('Google conserva el mismo UID y sigue exigiendo correo confirmado y el proyecto correcto',async()=>{
  const claims={...base,firebase:{sign_in_provider:'google.com'}};
  assert.equal((await verificarFirebase(await token(claims),'proyecto-prueba',options)).id,base.sub);
  await assert.rejects(verificarFirebase(await token({...claims,email_verified:false}),'proyecto-prueba',options),e=>e.estado===403);
  await assert.rejects(verificarFirebase(await token(claims),'otro-proyecto',options),e=>e.estado===401);
});
test('Cuenta desactivada y sesiones anteriores al cambio de contraseña se rechazan',async()=>{
  const env={FIREBASE_PROJECT_ID:'proyecto-prueba',FIREBASE_API_KEY:'publica'};
  await assert.rejects(comprobarCuenta('token',{id:'desactivada',authTime:now},env,{transporte:async()=>Response.json({users:[{localId:'desactivada',disabled:true}]})}),e=>e.estado===401);
  await assert.rejects(comprobarCuenta('token',{id:'revocada',authTime:now-30},env,{transporte:async()=>Response.json({users:[{localId:'revocada',validSince:String(now)}]})}),e=>e.estado===401);
});
