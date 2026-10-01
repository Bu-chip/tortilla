import { el } from '../dom.js';
import { api } from '../api.js';
import { establecerSesion } from '../estado.js';
import { navegar } from '../router.js';
import { tortilla } from '../tortilla.js';
import { aviso } from '../ui.js';
import { usuarioFirebase,entrarFirebase,entrarGoogleFirebase,registrarFirebase,enviarVerificacion,refrescarFirebase,salirFirebase,recuperarFirebase,errorFirebase } from '../firebase-cliente.js';
import { recordarAcceso, fijarRecuerdo, eliminarAccesoFirebase } from '../firebase-cliente.js';

export async function render(cont,params){
  const error=el('div',{'aria-live':'assertive'}), zona=el('div',{});
  const input=(id,label,type='text',autocomplete='off')=>{
    const control=el('input',{id,type,autocomplete,required:true});
    return {control,campo:el('div',{class:'campo'},el('label',{for:id},label),control)};
  };
  let ocupado=false;
  const actuar=async(button,fn)=>{
    if(ocupado)return;
    ocupado=true;const controles=[...zona.querySelectorAll('button,input')];
    controles.forEach(c=>{c.disabled=true;});button.disabled=true;error.replaceChildren();
    try{await fn();}catch(e){error.replaceChildren(aviso('error',errorFirebase(e)));}
    finally{ocupado=false;controles.forEach(c=>{c.disabled=false;});button.disabled=false;}
  };
  async function completar(){
    const user=usuarioFirebase();
    if(!user)return acceso();
    if(!user.emailVerified)return confirmar();
    try{
      const datos=await api.get('/api/yo');establecerSesion(datos);navegar('/',{reemplazar:true});
    }catch(e){
      if(e.datos?.bajaPendiente)bajaPendiente();
      else if(e.datos?.necesitaPerfil)perfil();
      else if(e.estado===401){await salirFirebase();acceso();error.replaceChildren(aviso('nota','Vuelve a entrar para renovar tu sesión.'));}
      else if(e.datos?.verificarCorreo)confirmar();
      else throw e;
    }
  }
  function cancelar(){return el('button',{type:'button',class:'boton boton--fantasma',onclick:async e=>actuar(e.currentTarget,async()=>{await salirFirebase();acceso();})},'Usar otra cuenta');}
  function acceso(crear=false){
    const correo=input('correo','Correo electrónico','email','email');correo.control.autocapitalize='none';
    const clave=input('clave',crear?'Contraseña (al menos 12 caracteres)':'Contraseña','password',crear?'new-password':'current-password');
    if(crear)clave.control.minLength=12;
    const nombre=input('nombre','Cómo te verán tus amigos','text','nickname');nombre.control.maxLength=40;nombre.control.minLength=2;
    const button=el('button',{type:'submit',class:'boton boton--bloque'},crear?'Crear mi cuenta':'Entrar');
    const form=el('form',{onsubmit:e=>{e.preventDefault();actuar(button,async()=>{
      if(crear){await registrarFirebase(correo.control.value.trim(),clave.control.value,nombre.control.value.trim());confirmar();await enviarVerificacion();error.replaceChildren(aviso('exito','Te hemos enviado un correo para confirmar tu cuenta.'));}
      else{await entrarFirebase(correo.control.value.trim(),clave.control.value);await completar();}
    });}},crear?nombre.campo:null,correo.campo,clave.campo,button);
    const google=el('button',{type:'button',class:'boton boton--bloque acceso__google',onclick:e=>actuar(e.currentTarget,async()=>{await entrarGoogleFirebase();await completar();})},'Continuar con Google');
    const recuerdo=el('input',{type:'checkbox',checked:recordarAcceso(),onchange:e=>actuar(e.currentTarget,()=>fijarRecuerdo(e.currentTarget.checked))});
    zona.replaceChildren(el('label',{class:'casilla'},recuerdo,'Recordar el acceso en este dispositivo'),el('p',{class:'pista'},'Actívalo solo en tu dispositivo personal.'),google,el('p',{class:'acceso__alternativa'},'o con tu correo y contraseña'),el('div',{class:'tabs'},el('button',{class:'chip','aria-pressed':String(!crear),onclick:()=>acceso(false)},'Entrar'),el('button',{class:'chip','aria-pressed':String(crear),onclick:()=>acceso(true)},'Crear cuenta')),form,
      el('button',{class:'boton boton--fantasma',onclick:recuperar},'He olvidado mi contraseña'));
  }
  function confirmar(){
    zona.replaceChildren(el('h2',{},'Confirma tu correo'),el('p',{},`Abre el mensaje de confirmación de ${usuarioFirebase()?.email||'tu cuenta'}. Después vuelve aquí.`),
      el('button',{class:'boton boton--bloque',onclick:e=>actuar(e.currentTarget,async()=>{await refrescarFirebase();if(!usuarioFirebase().emailVerified)throw new Error('El correo todavía no está confirmado. Revisa también la carpeta de spam.');await completar();})},'Ya he confirmado mi correo'),
      el('button',{class:'boton boton--fantasma',onclick:e=>actuar(e.currentTarget,async()=>{await enviarVerificacion();error.replaceChildren(aviso('exito','Correo de confirmación enviado.'));})},'Volver a enviar el correo'),cancelar());
  }
  function perfil(){
    const nombre=input('perfil-nombre','Cómo te verán tus amigos','text','nickname');nombre.control.value=usuarioFirebase()?.displayName||'';nombre.control.maxLength=40;nombre.control.minLength=2;
    const codigo=input('codigo','Código de invitación');codigo.control.required=false;codigo.control.value=params.get('invitacion')||'';
    const button=el('button',{type:'submit',class:'boton boton--bloque'},'Entrar al grupo');
    zona.replaceChildren(el('h2',{},'Tu grupo de tortillas'),el('form',{onsubmit:e=>{e.preventDefault();actuar(button,async()=>{
      const datos=await api.post('/api/acceso/perfil',{nombre:nombre.control.value.trim(),codigo:codigo.control.value.trim()});
      establecerSesion(datos);navegar('/',{reemplazar:true});
    });}},nombre.campo,codigo.campo,el('p',{class:'campo__ayuda'},'Te lo pasa quien organiza el grupo. Si estás creando el primer grupo con la cuenta organizadora, déjalo vacío.'),button),
    el('button',{class:'boton boton--fantasma',onclick:e=>actuar(e.currentTarget,async()=>{establecerSesion(await api.get('/api/cuenta'));navegar('/cuenta');})},'Gestionar mis datos si ya tenía una cuenta'),cancelar());
  }
  function bajaPendiente(){
    zona.replaceChildren(el('h2',{},'Terminar la eliminación'),el('p',{},'Tus datos de Tortillas ya están eliminados. Falta cerrar el acceso asociado. Si te pide confirmar tu identidad, entra de nuevo.'),
      el('button',{class:'boton boton--peligro',onclick:e=>actuar(e.currentTarget,async()=>{await eliminarAccesoFirebase();acceso();error.replaceChildren(aviso('exito','Tu cuenta de Tortillas se ha eliminado.'));})},'Eliminar el acceso de Tortillas'),cancelar());
  }
  function recuperar(){
    const correo=input('recuperar-correo','Correo electrónico','email','email'),button=el('button',{type:'submit',class:'boton boton--bloque'},'Enviar recuperación');
    zona.replaceChildren(el('h2',{},'Recuperar mi cuenta'),el('p',{class:'pista'},'Si entras con Google, vuelve al acceso y pulsa «Continuar con Google». Su contraseña se recupera desde Google.'),el('form',{onsubmit:e=>{e.preventDefault();actuar(button,async()=>{
      try{await recuperarFirebase(correo.control.value.trim());}catch(e){if(e.code!=='auth/user-not-found')throw e;}
      error.replaceChildren(aviso('exito','Si existe una cuenta con ese correo, recibirás un enlace para elegir otra contraseña. Revisa también spam.'));
    });}},correo.campo,button),el('button',{class:'boton boton--fantasma',onclick:()=>acceso()},'Volver a entrar'));
  }
  cont.append(el('div',{class:'acceso'},el('div',{class:'acceso__tortilla'},tortilla({animo:'guino',tamano:140})),el('h1',{},'Tortillas entre amigos'),
    el('p',{class:'subtitulo'},'Tu próxima tortilla merece una nota.'),error,el('section',{class:'tarjeta','aria-label':'Acceso con cuenta'},zona)));
  await completar();
}
