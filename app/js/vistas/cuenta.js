import { el } from '../dom.js';
import { api,mensajeDeError } from '../api.js';
import { estado,limpiarSesion,establecerSesion } from '../estado.js';
import { aviso,confirmar } from '../ui.js';
import { navegar } from '../router.js';
import { borrarBorrador } from '../borradores.js';
import { descargarDatos } from '../datos-personales.js';
import { usuarioFirebase,tieneClaveFirebase,cambiarClaveFirebase,errorFirebase,confirmarIdentidad,eliminarAccesoFirebase,salirFirebase } from '../firebase-cliente.js';

export async function render(cont){
  cont.classList.add('cuenta');
  const gestion=!!estado.config.funciones?.gestionCuenta, firebase=estado.config.auth==='firebase';
  const mensajes=el('div',{'aria-live':'polite'});
  cont.append(el('h1',{},'Mi cuenta y grupo'),el('p',{class:'subtitulo'},'Tu nombre, tus amigos y tus datos.'),mensajes);
  const seccion=(titulo,...hijos)=>el('section',{class:'cuenta-seccion'},el('h2',{},titulo),hijos);
  const campo=(label,id,input)=>{input.classList.add('entrada');return el('div',{class:'campo'},el('label',{for:id},label),input);};
  const actuar=async(boton,fn)=>{boton.disabled=true;mensajes.replaceChildren();try{await fn();}catch(error){mensajes.replaceChildren(aviso('error',errorFirebase(error)));mensajes.scrollIntoView({block:'nearest'});}finally{boton.disabled=false;}};
  const actualizar=async()=>{establecerSesion(await api.get('/api/cuenta'));cont.replaceChildren();await render(cont);};
  if(gestion){
    const nombre=el('input',{id:'cuenta-nombre',value:estado.sesion.persona.nombre,minlength:2,maxlength:40,required:true,autocomplete:'nickname'});
    const guardar=el('button',{type:'submit',class:'boton boton--pequeno'},'Guardar nombre');
    cont.append(seccion('Cómo te ven tus amigos',el('form',{onsubmit:e=>{e.preventDefault();actuar(guardar,async()=>{establecerSesion(await api.patch('/api/cuenta',{nombre:nombre.value.trim()}));await actualizar();cont.prepend(aviso('exito','Nombre actualizado.'));});}},campo('Tu nombre','cuenta-nombre',nombre),guardar)));
  }
  if(firebase){
    cont.append(el('p',{class:'pista'},usuarioFirebase()?.email||''));
    if(tieneClaveFirebase()){
      const actual=el('input',{id:'clave-actual',type:'password',autocomplete:'current-password',required:true});
      const nueva=el('input',{id:'clave-nueva',type:'password',autocomplete:'new-password',minlength:12,required:true});
      const repetir=el('input',{id:'clave-confirmar',type:'password',autocomplete:'new-password',minlength:12,required:true});
      const guardar=el('button',{type:'submit',class:'boton'},'Cambiar contraseña');
      cont.append(seccion('Acceso',el('details',{},el('summary',{},'Cambiar contraseña'),el('form',{onsubmit:e=>{
        e.preventDefault();actuar(guardar,async()=>{if(nueva.value!==repetir.value)throw new Error('Las nuevas contraseñas no coinciden.');await cambiarClaveFirebase(actual.value,nueva.value);limpiarSesion();navegar('/acceso',{reemplazar:true});});
      }},campo('Contraseña actual','clave-actual',actual),campo('Nueva contraseña (mínimo 12 caracteres)','clave-nueva',nueva),campo('Repite la nueva contraseña','clave-confirmar',repetir),guardar))));
    }else cont.append(seccion('Acceso con Google',el('p',{},'La contraseña y su recuperación se gestionan en Google.'),el('a',{href:'https://myaccount.google.com/security',target:'_blank',rel:'noopener noreferrer'},'Gestionar el acceso en Google')));
  }
  if(!gestion&&!firebase)cont.append(aviso('info','Estás en la demo local. Las cuentas e invitaciones se gestionan en la web compartida.'));
  for(const grupo of estado.sesion.grupos){
    const bloque=seccion(grupo.nombre), admin=grupo.rol==='admin';cont.append(bloque);
    if(gestion){
      try{
        const {miembros}=await api.get(`/api/grupos/${encodeURIComponent(grupo.id)}/miembros`);
        const lista=el('ul',{class:'lista','aria-label':`Miembros de ${grupo.nombre}`});
        const unicoAdmin=admin&&miembros.filter(m=>m.rol==='admin').length===1;
        for(const m of miembros){
          const soyYo=m.id===estado.sesion.persona.id;
          const rol={admin:'Administrador',miembro:'Miembro',bloqueado:'Acceso retirado',salio:'Salió del grupo'}[m.rol];
          const acciones=el('div',{class:'fila-botones'});
          const cambiar=(etiqueta,nuevoRol,explicacion)=>el('button',{class:'boton boton--pequeno boton--fantasma',onclick:e=>actuar(e.currentTarget,async()=>{
            if(!await confirmar({titulo:`${etiqueta}: ${m.nombre}`,texto:explicacion,aceptar:etiqueta,peligro:nuevoRol==='bloqueado'}))return;
            await api.patch(`/api/grupos/${encodeURIComponent(grupo.id)}/miembros/${encodeURIComponent(m.id)}`,{rol:nuevoRol});await actualizar();
          })},etiqueta);
          if(admin){
            if(m.rol==='miembro')acciones.append(cambiar('Hacer administrador','admin','Podrá gestionar miembros e invitaciones del grupo.'));
            if(m.rol==='admin'&&!unicoAdmin)acciones.append(cambiar('Pasar a miembro','miembro','Debe quedar otro administrador. Sus visitas se conservan.'));
            if(!soyYo&&['admin','miembro'].includes(m.rol))acciones.append(cambiar('Retirar acceso','bloqueado','No podrá ver ni añadir visitas del grupo, ni volver con una invitación. Sus visitas anteriores se conservan.'));
            if(['bloqueado','salio'].includes(m.rol))acciones.append(cambiar('Readmitir','miembro','Volverá a tener acceso a las visitas y medias del grupo.'));
          }
          lista.append(el('li',{class:'miembro-fila'},el('div',{},el('strong',{},m.nombre,soyYo?' (tú)':''),el('p',{class:'pista'},rol)),acciones));
        }
        bloque.append(lista,...(unicoAdmin?[el('p',{class:'pista'},'Antes de salir, nombra a otro administrador. Así el grupo seguirá teniendo a alguien que lo gestione.')]:[]),el('button',{disabled:unicoAdmin,class:'boton boton--fantasma',onclick:e=>actuar(e.currentTarget,async()=>{
          if(!await confirmar({titulo:'¿Salir del grupo?',texto:'Dejarás de ver sus visitas. Tus valoraciones anteriores seguirán en el grupo. Puedes exportarlas o eliminar tu cuenta desde esta pantalla.',aceptar:'Salir del grupo',peligro:true}))return;
          await api.patch(`/api/grupos/${encodeURIComponent(grupo.id)}/miembros/${encodeURIComponent(estado.sesion.persona.id)}`,{rol:'salio'});await actualizar();
        })},'Salir del grupo'));
      }catch(error){bloque.append(aviso('error',mensajeDeError(error)));}
    }
    if(!admin||(!gestion&&!firebase))continue;
    const lista=el('div',{}),codigo=el('div',{});
    const cargar=async()=>{
      const datos=await api.get(`/api/grupos/${encodeURIComponent(grupo.id)}/invitaciones`);
      lista.replaceChildren(...datos.invitaciones.map(i=>{
        const vigente=!i.revocadaEn&&new Date(i.expiraEn)>new Date();
        return el('div',{class:'miembro-fila'},el('p',{class:'pista'},`Creada el ${new Date(i.creadoEn).toLocaleDateString('es')} · ${vigente?'Válida hasta '+new Date(i.expiraEn).toLocaleDateString('es'):i.revocadaEn?'Anulada':'Caducada'}`),vigente?el('button',{class:'boton boton--pequeno boton--fantasma',onclick:e=>actuar(e.currentTarget,async()=>{await api.del(`/api/grupos/${encodeURIComponent(grupo.id)}/invitaciones/${i.id}`);codigo.replaceChildren();await cargar();})},'Anular invitación'):null);
      }));
    };
    const boton=el('button',{class:'boton boton--pequeno',onclick:e=>actuar(e.currentTarget,async()=>{
      const i=await api.post(`/api/grupos/${encodeURIComponent(grupo.id)}/invitaciones`);
      const enlace=new URL(location.href);enlace.search='';enlace.hash=`/acceso?invitacion=${encodeURIComponent(i.codigo)}`;
      const salida=el('input',{class:'entrada',readonly:true,'aria-label':'Enlace de invitación',value:enlace.href});
      codigo.replaceChildren(el('p',{class:'pista'},'Válido durante siete días. Cópialo ahora para compartirlo con tus amigos.'),salida,el('button',{class:'boton boton--fantasma',onclick:async()=>{try{await navigator.clipboard.writeText(enlace.href);mensajes.replaceChildren(aviso('exito','Invitación copiada.'));}catch{salida.focus();salida.select();}}},'Copiar enlace'));await cargar();
    })},'Crear invitación');
    bloque.append(el('details',{},el('summary',{},'Invitar a alguien'),el('p',{class:'pista'},'Anular el enlace impide nuevas incorporaciones. Para retirar a alguien, utiliza su ficha de miembro.'),boton,codigo,lista));
    try{await cargar();}catch(error){lista.append(aviso('error',mensajeDeError(error)));}
  }
  if(!estado.sesion.grupos.length)cont.append(aviso('info','Ya no perteneces a ningún grupo. Puedes conservar una copia de tus datos o eliminar tu cuenta.'),el('button',{class:'boton',onclick:()=>{limpiarSesion();navegar('/acceso');}},'Entrar con una invitación'));
  cont.append(seccion('Tus datos',el('p',{},'Tus visitas se comparten con tu grupo; los comentarios marcados como privados solo los ves tú. El catálogo de bares y recetas es compartido entre los grupos.'),
    el('button',{class:'boton boton--fantasma',onclick:e=>actuar(e.currentTarget,descargarDatos)},'Exportar mis datos'),el('p',{class:'pista'},'La exportación contiene tus valoraciones. No es una copia completa del grupo.'),el('a',{href:'#/acerca'},'Cómo se almacenan y protegen los datos')));
  if(gestion&&firebase){
    const clave=el('input',{id:'baja-clave',type:'password',autocomplete:'current-password',required:tieneClaveFirebase()});
    const texto=el('input',{id:'baja-confirmacion',required:true,pattern:'ELIMINAR',autocomplete:'off'});
    const boton=el('button',{type:'submit',class:'boton boton--peligro'},'Eliminar mi cuenta y mis visitas');
    cont.append(seccion('Eliminar mi cuenta',el('details',{},el('summary',{},'Eliminar permanentemente mi cuenta'),el('p',{},'Se borran tu nombre, valoraciones, comentarios y preferencias, y tu acceso a Tortillas. Los bares y recetas compartidos se conservan sin tu autoría. Esto no elimina tu cuenta de Google. Exporta antes lo que quieras conservar.'),
      el('form',{onsubmit:e=>{e.preventDefault();actuar(boton,async()=>{
        await confirmarIdentidad(clave.value);clave.value='';
        if(!await confirmar({titulo:'¿Eliminar definitivamente?',texto:'Tus visitas dejarán de aparecer en el grupo y en las medias. Esta operación no se puede deshacer desde la aplicación.',aceptar:'Eliminar definitivamente',peligro:true}))return;
        await api.post('/api/cuenta/eliminar',{confirmacion:texto.value});borrarBorrador(estado.sesion.persona.id);limpiarSesion();
        try{await eliminarAccesoFirebase();}finally{navegar('/acceso',{reemplazar:true});}
      });}},tieneClaveFirebase()?campo('Confirma tu contraseña','baja-clave',clave):el('p',{class:'pista'},'Google te pedirá confirmar tu identidad.'),campo('Escribe ELIMINAR','baja-confirmacion',texto),boton))));
  }
  cont.append(el('button',{class:'boton boton--fantasma',onclick:e=>actuar(e.currentTarget,async()=>{await api.post('/api/acceso/salir');await salirFirebase();limpiarSesion();navegar('/acceso',{reemplazar:true});})},'Cerrar sesión'));
}
