import { el } from '../dom.js';
import { api,mensajeDeError } from '../api.js';
import { estado,limpiarSesion } from '../estado.js';
import { aviso } from '../ui.js';
import { navegar } from '../router.js';
import { usuarioFirebase,tieneClaveFirebase,cambiarClaveFirebase,errorFirebase } from '../firebase-cliente.js';

export async function render(cont){
  cont.classList.add('cuenta');
  cont.append(el('h1',{},'Mi cuenta'));
  if(estado.config.auth!=='firebase'){cont.append(el('p',{},'Estás usando la versión local. La gestión de cuentas del piloto estará disponible en la web compartida.'));return;}
  const mensajes=el('div',{'aria-live':'polite'});
  cont.append(el('p',{},usuarioFirebase()?.email||''),mensajes);
  if(tieneClaveFirebase()){
  const actual=el('input',{id:'clave-actual',type:'password',autocomplete:'current-password',required:true});
  const nueva=el('input',{id:'clave-nueva',type:'password',autocomplete:'new-password',minlength:12,required:true});
  const confirmar=el('input',{id:'clave-confirmar',type:'password',autocomplete:'new-password',minlength:12,required:true});
  const campo=(label,id,input)=>el('div',{class:'campo'},el('label',{for:id},label),input);
  const guardar=el('button',{type:'submit',class:'boton'},'Cambiar contraseña');
  cont.append(el('section',{class:'tarjeta'},el('h2',{},'Contraseña'),el('form',{onsubmit:async e=>{
    e.preventDefault();if(nueva.value!==confirmar.value){mensajes.replaceChildren(aviso('error','Las nuevas contraseñas no coinciden.'));return;}
    guardar.disabled=true;
    try{await cambiarClaveFirebase(actual.value,nueva.value);limpiarSesion();navegar('/acceso',{reemplazar:true});}
    catch(error){mensajes.replaceChildren(aviso('error',errorFirebase(error)));}finally{guardar.disabled=false;}
  }},campo('Contraseña actual','clave-actual',actual),campo('Nueva contraseña (mínimo 12 caracteres)','clave-nueva',nueva),campo('Repite la nueva contraseña','clave-confirmar',confirmar),guardar)));
  }else{
    cont.append(el('section',{class:'tarjeta'},el('h2',{},'Acceso con Google'),el('p',{},'Entras con tu cuenta de Google. Su contraseña y su recuperación se gestionan en Google.'),el('a',{href:'https://myaccount.google.com/security',target:'_blank',rel:'noopener noreferrer',class:'boton boton--fantasma'},'Gestionar mi cuenta de Google')));
  }
  for(const grupo of estado.sesion.grupos.filter(g=>g.rol==='admin')){
    const lista=el('div',{}),codigo=el('div',{}),boton=el('button',{class:'boton'},'Crear invitación');
    const cargar=async()=>{
      const datos=await api.get(`/api/grupos/${encodeURIComponent(grupo.id)}/invitaciones`);
      lista.replaceChildren(...datos.invitaciones.map(i=>{
        const vigente=!i.revocadaEn&&new Date(i.expiraEn)>new Date();
        return el('div',{class:'tarjeta'},el('p',{},`Creada el ${new Date(i.creadoEn).toLocaleDateString('es')} · ${vigente?'Válida hasta '+new Date(i.expiraEn).toLocaleDateString('es'):i.revocadaEn?'Anulada':'Caducada'}`),vigente?el('button',{class:'boton boton--fantasma',onclick:async e=>{
          e.currentTarget.disabled=true;try{await api.del(`/api/grupos/${encodeURIComponent(grupo.id)}/invitaciones/${i.id}`);codigo.replaceChildren();await cargar();}catch(error){mensajes.replaceChildren(aviso('error',mensajeDeError(error)));e.currentTarget.disabled=false;}
        }},'Anular invitación'):null);
      }));
    };
    boton.onclick=async()=>{boton.disabled=true;try{
      const i=await api.post(`/api/grupos/${encodeURIComponent(grupo.id)}/invitaciones`);
      const enlace=new URL(location.href);enlace.search='';enlace.hash=`/acceso?invitacion=${encodeURIComponent(i.codigo)}`;
      const salida=el('input',{class:'entrada',readonly:true,'aria-label':'Enlace de invitación',value:enlace.href});
      codigo.replaceChildren(el('p',{},'Copia este enlace y envíaselo a tus amigos. Es válido durante siete días; solo se muestra ahora.'),salida,
        el('button',{class:'boton boton--fantasma',onclick:async()=>{try{await navigator.clipboard.writeText(enlace.href);mensajes.replaceChildren(aviso('exito','Invitación copiada.'));}catch{salida.focus();salida.select();mensajes.replaceChildren(aviso('info','Selecciona y copia el enlace.'));}}},'Copiar enlace'));
      await cargar();
    }catch(error){mensajes.replaceChildren(aviso('error',mensajeDeError(error)));}finally{boton.disabled=false;}};
    cont.append(el('section',{class:'tarjeta'},el('h2',{},`Invitar a ${grupo.nombre}`),el('p',{class:'pista'},'Anular una invitación impide nuevas incorporaciones. Quienes ya entraron conservan su cuenta.'),boton,codigo,lista));
    try{await cargar();}catch(error){mensajes.replaceChildren(aviso('error',mensajeDeError(error)));}
  }
}
