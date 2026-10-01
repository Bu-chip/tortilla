import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const raiz=fileURLToPath(new URL('../../',import.meta.url));
const repo='Bu-chip/tortilla';
const publicar=process.argv.includes('--publicar');
const manifiesto=JSON.parse(await fs.readFile(path.join(raiz,'dist/github-manifest.json'),'utf8'));
const api=(ruta,body)=>JSON.parse(execFileSync('gh',['api',`repos/${repo}/${ruta}`,...(body?['--method','POST','--input','-']:[])],{input:body?JSON.stringify(body):undefined,encoding:'utf8',maxBuffer:8*1024*1024}));
const padre=api('git/ref/heads/main').object.sha;
const commit=api(`git/commits/${padre}`);
const remoto=api(`git/trees/${commit.tree.sha}?recursive=1`);
if(remoto.truncated)throw new Error('El inventario remoto está truncado. Revisarlo manualmente.');
const porRuta=new Map(remoto.tree.map(x=>[x.path,x]));
const cambios=[];
for(const archivo of manifiesto.files){
 if(archivo.startsWith('/')||archivo.split('/').includes('..'))throw new Error('Ruta de paquete no válida.');
 const datos=await fs.readFile(path.join(raiz,'dist/github',archivo));
 const sha=createHash('sha1').update(`blob ${datos.length}\0`).update(datos).digest('hex');
 if(porRuta.get(archivo)?.sha!==sha)cambios.push({path:archivo,mode:'100644',type:'blob',content:datos.toString('utf8')});
}
console.log(`${cambios.length} archivos para ${repo}, sobre ${padre.slice(0,7)}.`);
if(!publicar){console.log(cambios.map(c=>c.path).join('\n'));console.log('Revisar el paquete; usar --publicar solo después de las pruebas.');}
else if(cambios.length){
 const tree=api('git/trees',{base_tree:commit.tree.sha,tree:cambios});
 const nuevo=api('git/commits',{message:'Pulir navegación, gestión del grupo y recuperación de datos',tree:tree.sha,parents:[padre]});
 // La referencia solo admite avance lineal: nunca reemplaza cambios concurrentes.
 execFileSync('gh',['api',`repos/${repo}/git/refs/heads/main`,'--method','PATCH','--input','-'],{input:JSON.stringify({sha:nuevo.sha,force:false}),encoding:'utf8'});
 await fs.writeFile(path.join(raiz,'dist/github-publicacion.json'),JSON.stringify({repository:repo,parent:padre,commit:nuevo.sha,tree:tree.sha,files:manifiesto.files.length},null,2)+'\n');
 console.log(`Código publicado: ${nuevo.sha}. Ejecutar el flujo de Pages para publicar la web.`);
}
