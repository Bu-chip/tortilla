import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const raw=process.env.TORTILLAS_API_URL;
if(!raw)throw new Error('Indica TORTILLAS_API_URL con la URL https pública del Worker.');
const api=new URL(raw);
if(api.protocol!=='https:'||api.username||api.password||api.search||api.hash||api.pathname!=='/')throw new Error('La URL debe ser un origen HTTPS, sin credenciales, rutas ni parámetros.');
const destino=path.join(raiz,'dist/web');
// Limpia únicamente la salida generada para no conservar archivos de una publicación anterior.
await fs.rm(destino,{recursive:true,force:true});
await fs.mkdir(destino,{recursive:true});
// Solo se publican los archivos de app/. Nunca data/, referencias/, documentos o configuración privada.
await fs.cp(path.join(raiz,'app'),destino,{recursive:true});
let html=await fs.readFile(path.join(destino,'index.html'),'utf8');
html=html.replaceAll('{{APP_NAME}}','Tortillas').replaceAll('href="/','href="./').replaceAll('src="/','src="./');
const csp=`default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://cdnjs.cloudflare.com; connect-src 'self' ${api.origin} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-src https://*.firebaseapp.com; base-uri 'self'; form-action 'self'`;
html=html.replace('<meta charset="UTF-8">',`<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="same-origin">`);
await fs.writeFile(path.join(destino,'index.html'),html);
await fs.writeFile(path.join(destino,'js/despliegue.js'),`export const API_BASE = ${JSON.stringify(api.origin)};\n`);
await fs.writeFile(path.join(destino,'.nojekyll'),'');
console.log('Web preparada en dist/web. No se ha publicado ni copiado ninguna base de datos.');
