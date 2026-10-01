import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const raiz=fileURLToPath(new URL('../../',import.meta.url));
const destino=path.join(raiz,'dist/github');
// Lista positiva. Nunca recorrer toda la carpeta de trabajo para publicar.
const archivos=['.gitignore','package.json','package-lock.json','README-publico.md'];
const permitidos=/\.(?:js|json|jsonc|sql|css|html|svg|yml|md)$/;
async function recorrer(carpeta){
 for(const d of await fs.readdir(path.join(raiz,carpeta),{withFileTypes:true})){
  const p=`${carpeta}/${d.name}`;
  if(d.isSymbolicLink())throw new Error(`No se publican enlaces simbólicos: ${p}`);
  if(d.name==='dist'||d.name.startsWith('.')||p==='cloud/wrangler.jsonc')continue;
  if(d.isDirectory())await recorrer(p);
  else if(d.isFile()&&permitidos.test(p))archivos.push(p);
 }
}
for(const dir of ['app','server','cloud','.github/workflows'])await recorrer(dir);
const lista=[];
for(const archivo of archivos){
 const contenido=await fs.readFile(path.join(raiz,archivo));
 // La configuración privada nunca se permite, aunque se copie accidentalmente a otro nombre.
 if(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}/.test(contenido.toString()))throw new Error(`Revisar configuración privada antes de publicar: ${archivo}`);
 lista.push({origen:archivo,ruta:archivo,contenido});
 if(archivo==='README-publico.md')lista.push({origen:archivo,ruta:'README.md',contenido});
}
await fs.rm(destino,{recursive:true,force:true});await fs.mkdir(destino,{recursive:true});
for(const {ruta,contenido} of lista){const p=path.join(destino,ruta);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,contenido);}
await fs.writeFile(path.join(raiz,'dist/github-manifest.json'),JSON.stringify({directory:destino,files:lista.map(a=>a.ruta).sort()},null,2)+'\n');
console.log(`Paquete revisable: ${lista.length} archivos en dist/github. No se ha publicado.`);
