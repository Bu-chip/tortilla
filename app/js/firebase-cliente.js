let auth, sdk, claveRecuerdo;
export function recordarAcceso(){try{return localStorage.getItem(claveRecuerdo)==='1';}catch{return false;}}
export async function fijarRecuerdo(activo){
  await sdk.setPersistence(auth,activo?sdk.browserLocalPersistence:sdk.browserSessionPersistence);
  try{localStorage.setItem(claveRecuerdo,activo?'1':'0');}catch{ /* La sesión actual conserva la elección del SDK. */ }
}
export async function iniciarFirebase(config) {
  if(config.auth!=='firebase')return;
  const [app,modulo]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
  ]);
  sdk=modulo;
  auth=sdk.getAuth(app.initializeApp(config.firebase));
  auth.languageCode='es';
  claveRecuerdo=`tortillas:recordar:${config.firebase.projectId}`;
  await sdk.setPersistence(auth,recordarAcceso()?sdk.browserLocalPersistence:sdk.browserSessionPersistence);
  await auth.authStateReady();
}
export const usuarioFirebase=()=>auth?.currentUser||null;
export const tokenFirebase=async(force=false)=>auth?.currentUser ? auth.currentUser.getIdToken(force) : null;
export const entrarFirebase=(email,password)=>sdk.signInWithEmailAndPassword(auth,email,password);
export function entrarGoogleFirebase(){
  const provider=new sdk.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  // Se abre desde el clic para conservar la activación del usuario. Sin permisos de Drive/Gmail.
  return sdk.signInWithPopup(auth,provider);
}
export const tieneClaveFirebase=(user=usuarioFirebase())=>!!user?.providerData?.some(p=>p.providerId==='password');
export async function registrarFirebase(email,password,nombre) {
  const {user}=await sdk.createUserWithEmailAndPassword(auth,email,password);
  await sdk.updateProfile(user,{displayName:nombre});
  return user;
}
export const enviarVerificacion=()=>sdk.sendEmailVerification(auth.currentUser);
export async function refrescarFirebase(){await sdk.reload(auth.currentUser);return tokenFirebase(true);}
export const salirFirebase=()=>auth ? sdk.signOut(auth) : Promise.resolve();
export const recuperarFirebase=email=>sdk.sendPasswordResetEmail(auth,email);
export async function confirmarIdentidad(clave){
  if(tieneClaveFirebase())await sdk.reauthenticateWithCredential(auth.currentUser,sdk.EmailAuthProvider.credential(auth.currentUser.email,clave));
  else await sdk.reauthenticateWithPopup(auth.currentUser,new sdk.GoogleAuthProvider());
  await tokenFirebase(true);
}
export const eliminarAccesoFirebase=()=>sdk.deleteUser(auth.currentUser);
export async function cambiarClaveFirebase(actual,nueva){
  if(!tieneClaveFirebase())throw new Error('Esta cuenta utiliza Google. Gestiona su contraseña desde tu cuenta de Google.');
  await sdk.reauthenticateWithCredential(auth.currentUser,sdk.EmailAuthProvider.credential(auth.currentUser.email,actual));
  await sdk.updatePassword(auth.currentUser,nueva);
  await salirFirebase();
}
export function errorFirebase(error){
  const mensajes={
    'auth/invalid-credential':'Correo o contraseña incorrectos.',
    'auth/wrong-password':'Correo o contraseña incorrectos.',
    'auth/user-not-found':'Correo o contraseña incorrectos.',
    'auth/email-already-in-use':'Ese correo ya tiene una cuenta. Prueba a entrar o recupera tu contraseña.',
    'auth/invalid-email':'Revisa la dirección de correo.',
    'auth/weak-password':'Elige una contraseña más larga y difícil de adivinar.',
    'auth/password-does-not-meet-requirements':'La contraseña no cumple los requisitos del acceso.',
    'auth/too-many-requests':'Demasiados intentos. Espera un momento antes de volver a intentarlo.',
    'auth/network-request-failed':'No hay conexión con el servicio de cuentas. Vuelve a intentarlo.',
    'auth/requires-recent-login':'Vuelve a entrar para confirmar esta operación.',
    'auth/user-disabled':'Esta cuenta está desactivada.',
    'auth/operation-not-allowed':'El acceso aún no está habilitado. Falta terminar la configuración.',
    'auth/popup-closed-by-user':'Se ha cerrado la ventana de Google. Puedes volver a intentarlo.',
    'auth/cancelled-popup-request':'Ya hay una ventana de acceso abierta. Termina allí o vuelve a intentarlo.',
    'auth/popup-blocked':'El navegador ha bloqueado la ventana de Google. Permite ventanas emergentes para esta web y vuelve a pulsar el botón.',
    'auth/unauthorized-domain':'Falta autorizar el dominio de esta web en Firebase. Avisa a quien organiza el grupo.',
    'auth/account-exists-with-different-credential':'Ese correo ya tiene una cuenta con otro método de acceso. Entra con el método que utilizaste al crearla.',
  };
  return mensajes[error?.code] || (error?.code?.startsWith('auth/')?'No se ha podido completar el acceso. Vuelve a intentarlo.':error?.message||'No se ha podido completar la operación.');
}
