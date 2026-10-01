import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { compilarWorker, comprobarTipos } from '../../server/herramientas/preparar-worker.js';

test('El archivo del panel pasa tipos y busca/guarda un bar con Unicode en Workers sin Buffer global', async () => {
  const temporal = await mkdtemp(path.join(os.tmpdir(), 'tortillas-worker-web-'));
  let mf;
  try {
    const codigo = await compilarWorker();
    const archivo = path.join(temporal, 'worker.js');
    await writeFile(archivo, codigo);
    await comprobarTipos(archivo);
    // Solo este módulo de prueba sustituye identidad/proveedor. El archivo entregado conserva Firebase real.
    const entrada = `
      import original, { crearWorker } from './worker.js';
      const prueba = crearWorker({
        autenticar: async () => ({id:'cuenta-prueba',email:'organizador@example.invalid'}),
        transporte: async input => {
          const url = new URL(input);
          if (url.hostname !== 'photon.komoot.io') throw new Error('Salida no prevista en la prueba');
          return Response.json({features:[{
            type:'Feature',geometry:{type:'Point',coordinates:[-2.9326,43.2619]},
            properties:{osm_type:'N',osm_id:123,osm_key:'amenity',osm_value:'bar',
              name:'Bar ficticio Iruña 🥔',city:'Pruebas',street:'Calle ficticia',housenumber:'1'}
          }]});
        }
      });
      export default {fetch(request,env) {
        if (new URL(request.url).pathname === '/entorno-prueba') return Response.json({buffer:typeof globalThis.Buffer});
        return (request.headers.get('Authorization') === 'Bearer cuenta-prueba' ? prueba : original).fetch(request,env);
      }};
    `;
    mf = new Miniflare({ ...convertV4MiniflareOptions({
      cf: false, compatibilityDate: '2026-07-01', d1Databases: ['DB'],
      modulesRoot: temporal,
      modules: [
        { type: 'ESModule', path: path.join(temporal, 'entrada.js'), contents: entrada },
        { type: 'ESModule', path: archivo, contents: codigo },
      ],
      bindings: {
        FRONTEND_ORIGIN:'https://web.example.invalid', FIREBASE_PROJECT_ID:'proyecto-ficticio',
        FIREBASE_AUTH_DOMAIN:'proyecto-ficticio.firebaseapp.com', FIREBASE_API_KEY:'clave-publica-ficticia',
        PILOT_OWNER_EMAIL:'organizador@example.invalid',
      },
    }), resourcePersistencePath: path.join(temporal, 'datos') });
    const db = await mf.getD1Database('DB');
    for (const nombre of ['0001_piloto.sql','0002_acceso.sql']) {
      const sql = await readFile(new URL(`../migraciones/${nombre}`,import.meta.url),'utf8');
      for (const sentencia of sql.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(sentencia).run();
    }
    async function pedir(ruta,method='GET',body,autenticado=true) {
      const headers = {'X-Requested-With':'tortillas',Origin:'https://web.example.invalid'};
      if (autenticado) headers.Authorization='Bearer cuenta-prueba';
      if (body) headers['Content-Type']='application/json';
      const response=await mf.dispatchFetch(`https://prueba.example.invalid${ruta}`,{method,headers,body:body?JSON.stringify(body):undefined});
      return {status:response.status,body:await response.json()};
    }
    assert.equal((await pedir('/entorno-prueba')).body.buffer,'undefined');
    assert.equal((await pedir('/api/config','GET',null,false)).status,200);
    assert.equal((await pedir('/api/yo','GET',null,false)).status,401);
    assert.equal((await pedir('/api/acceso/perfil','POST',{nombre:'Persona ficticia'})).status,201);
    const busqueda=await pedir('/api/lugares?q='+encodeURIComponent('Café Iruña 🥔'));
    assert.equal(busqueda.status,200);
    assert.equal(busqueda.body.lugares.length,1);
    const lugar=busqueda.body.lugares[0];
    assert.equal(lugar.referenciaLugar,`photon:N:123:${Buffer.from('Iruña 🥔').toString('base64url')}`);
    const guardada=await pedir('/api/degustaciones','POST',{
      opId:'visita-runtime-web',versionNota:2,notaGeneral:8,fecha:new Date().toISOString().slice(0,10),
      variedad:{cebolla:'sin',vegana:true},nuevoBar:{referenciaLugar:lugar.referenciaLugar},
    });
    assert.equal(guardada.status,201,JSON.stringify(guardada.body));
    const barId=guardada.body.degustacion.bar.id;
    assert.equal((await pedir('/api/bares')).body.bares[0].medias.tu.media,8);
    assert.equal((await pedir(`/api/bares/${barId}`)).body.variedades[0].medias.tu.media,8);
    assert.equal((await pedir('/api/vegana')).body.variedades[0].medias.tu.media,8);
    const historial=await pedir('/api/degustaciones?limite=1&offset=0');
    assert.equal(historial.status,200);
    assert.equal(historial.body.degustaciones.length,1);
  } finally {
    await mf?.dispose();
    await rm(temporal,{recursive:true,force:true});
  }
});
