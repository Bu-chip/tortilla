import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { abrirBaseDeDatos, migrar } from '../db.js';
import { crearEscenarioAceptacion, iguales, V1, crearGrupo, unir } from './ayudas.js';
import { crearDegustacion, editarDegustacion, retirarDegustacion, listarDegustaciones } from '../servicios/degustaciones.js';
import { mediasDeBar } from '../servicios/medias.js';
import { exportarTodo } from '../servicios/exportar.js';
import { importarExportacion, importarAntiguo } from '../servicios/importar.js';
import { editarBar } from '../servicios/bares.js';
import { leerConfig } from '../config.js';
import { crearBuscadorLugares } from '../servicios/lugares.js';
const datos = (barId, extra = {}) => ({ versionNota: 2, opId: crypto.randomUUID(), barId, variedad: V1, fecha: '2026-09-25', notaGeneral: 8, ...extra });

test('Nota general explícita y aspectos opcionales no se mezclan con las medias históricas; restauración v2 sin pérdidas', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  const d = crearDegustacion(db, personas.A, datos(bares.A.id)).degustacion;
  assert.equal(d.nota, 8); assert.deepEqual(Object.values(d.criterios), [null, null, null, null, null]);
  const e = crearDegustacion(db, personas.B, datos(bares.A.id, { notaGeneral: 4, criterios: { sabor: 10, patata: 10, textura: 10, equilibrio: 10, presentacion: 10 } })).degustacion;
  assert.equal(e.nota, 4);
  const m = mediasDeBar(db, personas.A.id, { barId: bares.A.id });
  assert.equal(m.tu.media, 8); assert.equal(m.tu.visitas, 1); assert.equal(m.demas.media, 4); assert.equal(m.global.media, 6);
  assert.equal(mediasDeBar(db, personas.A.id, { barId: bares.A.id, metodo: 'historica' }).global.media, 7.5);
  const exp = exportarTodo(db); const destino = abrirBaseDeDatos(':memory:');
  importarExportacion(destino, exp); importarExportacion(destino, exp);
  assert.equal(destino.prepare('SELECT COUNT(*) n FROM degustaciones').get().n, 6);
  assert.equal(mediasDeBar(destino, personas.A.id, { barId: bares.A.id }).global.media, 6);
  assert.equal(destino.prepare('SELECT textura FROM degustaciones WHERE id = ?').get(d.id).textura, null);
  db.close(); destino.close();
});
test('Visitas generales se promedian por visita y respetan autoría, grupos, edición y retirada', () => {
  const { db, personas, bares } = crearEscenarioAceptacion();
  for (const [p,n] of [[personas.A,8],[personas.A,6],[personas.B,9],[personas.B,7],[personas.C,4]]) crearDegustacion(db,p,datos(bares.A.id,{notaGeneral:n}));
  const m = mediasDeBar(db,personas.A.id,{barId:bares.A.id});
  assert.equal(m.tu.media,7); assert.equal(m.demas.media,20/3); assert.equal(m.demas.personas,2);
  const visita = listarDegustaciones(db,personas.A,{solo:'mias'}).find((d)=>d.versionNota===2);
  editarDegustacion(db,personas.A,visita.id,datos(bares.A.id,{notaGeneral:10}));
  assert.throws(()=>editarDegustacion(db,personas.B,visita.id,datos(bares.A.id)),/propias/);
  retirarDegustacion(db,personas.A,visita.id); assert.equal(mediasDeBar(db,personas.A.id,{barId:bares.A.id}).tu.visitas,1);
  const grupo = crearGrupo(db,'nuevo-grupo','Otro'); unir(db,personas.C.id,grupo.id);
  crearDegustacion(db,personas.C,datos(bares.A.id,{notaGeneral:1,grupoId:grupo.id}));
  assert.equal(mediasDeBar(db,personas.A.id,{barId:bares.A.id}).demas.valoraciones,3); db.close();
});
test('No me fijé no crea una receta; exportar/restaurar conserva las observaciones', () => {
  const {db,personas,bares}=crearEscenarioAceptacion(); const antes=db.prepare('SELECT COUNT(*) n FROM variedades').get().n;
  const d=crearDegustacion(db,personas.A,datos(bares.A.id,{variedad:{cebolla:'no_se',vegana:true,ingredientes:['setas']}})).degustacion;
  assert.equal(d.variedad.id,null); assert.equal(d.variedad.vegana,true); assert.equal(mediasDeBar(db,personas.A.id,{barId:bares.A.id,vegana:true}).tu.visitas,1); assert.equal(db.prepare('SELECT COUNT(*) n FROM variedades').get().n,antes);
  const destino=abrirBaseDeDatos(':memory:'); importarExportacion(destino,exportarTodo(db));
  assert.deepEqual(listarDegustaciones(destino,personas.A).find(v=>v.id===d.id).variedad,d.variedad); db.close(); destino.close();
});
test('Validación rechaza notas inválidas y cambios de método sin crear bares huérfanos',()=>{
  const {db,personas,bares,visitas}=crearEscenarioAceptacion();const antes=db.prepare('SELECT COUNT(*) n FROM bares').get().n;
  for(const notaGeneral of [null,0,11,7.3]) assert.throws(()=>crearDegustacion(db,personas.A,datos(null,{notaGeneral,nuevoBar:{nombre:'Nuevo lugar'}})));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bares').get().n,antes);
  assert.throws(()=>crearDegustacion(db,personas.A,datos(bares.A.id,{variedad:{cebolla:'con',vegana:true,ingredientes:['chorizo']}})),/vegana/);
  assert.throws(()=>editarDegustacion(db,personas.A,visitas.A1.id,datos(bares.A.id)),/método original/); db.close();
});
test('Lugar y visita se guardan de forma atómica e idempotente',()=>{
  const {db,personas}=crearEscenarioAceptacion(); const cuerpo=datos(null,{nuevoBar:{nombre:'Café elegido',direccion:'Calle uno, 3'}});
  const a=crearDegustacion(db,personas.A,cuerpo); const b=crearDegustacion(db,personas.A,cuerpo);
  assert.equal(a.degustacion.id,b.degustacion.id); assert.equal(b.repetida,true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bares WHERE nombre='Café elegido'").get().n,1);
  crearDegustacion(db,personas.A,datos(a.degustacion.bar.id)); assert.equal(mediasDeBar(db,personas.A.id,{barId:a.degustacion.bar.id}).tu.visitas,2); db.close();
});
test('Importación antigua no duplica bares al reintentar ni los deja tras un error',()=>{
  const {db,personas}=crearEscenarioAceptacion();const elemento={opId:'importar-nuevo',candidata:{barNombre:'Bar importado',fecha:'2026-09-25',variedad:V1,criterios:iguales(7)}};
  importarAntiguo(db,personas.A,[elemento]); importarAntiguo(db,personas.A,[elemento]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bares WHERE nombre='Bar importado'").get().n,1);
  const malo={...elemento,opId:'importar-malo',candidata:{...elemento.candidata,barNombre:'No guardar',criterios:{}}};
  assert.equal(importarAntiguo(db,personas.A,[malo]).errores.length,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bares WHERE nombre='No guardar'").get().n,0); db.close();
});
test('Editar coordenadas exige una pareja válida; demo y datos normales tienen rutas distintas',()=>{
  const {db,bares}=crearEscenarioAceptacion();assert.throws(()=>editarBar(db,bares.A.id,{lat:43}),/juntas/);
  editarBar(db,bares.A.id,{lat:43,lng:-2});assert.throws(()=>editarBar(db,bares.A.id,{lng:null}),/juntas/);db.close();
  assert.notEqual(leerConfig({DEMO_MODE:'1'}).rutaDb,leerConfig({DEMO_MODE:'0'}).rutaDb);
});
test('Visitas ajenas se seleccionan antes del límite; paginar no trunca ni repite',()=>{
  const {db,personas,bares}=crearEscenarioAceptacion();for(let i=0;i<45;i++)crearDegustacion(db,personas.A,datos(bares.A.id));
  assert.equal(listarDegustaciones(db,personas.A,{solo:'demas',limite:3}).length,2);
  const a=listarDegustaciones(db,personas.A,{limite:40});const b=listarDegustaciones(db,personas.A,{limite:40,offset:40});
  assert.equal(new Set([...a,...b].map(d=>d.id)).size,49);db.close();
});
test('Buscador filtra establecimientos, conserva identidad y gestiona proveedor ausente o caído',async()=>{
  let llamadas=0;const feature={properties:{place_id:'lugar-123',name:'Café Test',categories:['catering.cafe'],city:'Bilbao',address_line2:'Calle 1',lat:43,lon:-2}};
  const buscador=crearBuscadorLugares(leerConfig({PLACES_PROVIDER:'geoapify',GEOAPIFY_API_KEY:'clave-ficticia'}),{transporte:async(url)=>{
    llamadas++;assert.equal(url.hostname,'api.geoapify.com');assert.equal(url.searchParams.get('limit'),'5');
    return {ok:true,json:async()=>({features:[feature,{properties:{...feature.properties,categories:['commercial']}}]})};
  }});
  const a=await buscador.buscar('Café'); assert.equal(a.length,1);assert.ok(!JSON.stringify(a).includes('clave-ficticia'));
  await buscador.buscar('Café');assert.equal(llamadas,1);assert.equal((await buscador.resolver(a[0].referenciaLugar)).proveedorId,'geoapify:lugar-123');
  assert.throws(()=>crearBuscadorLugares(leerConfig({PLACES_PROVIDER:'ninguno'})).buscar('Café'),/no está activada/);
  await assert.rejects(crearBuscadorLugares(leerConfig({PLACES_PROVIDER:'geoapify',GEOAPIFY_API_KEY:'x'}),{transporte:async()=>{throw new Error('red');}}).buscar('Café'),/No se pudieron/);
});
test('Migración del esquema anterior conserva notas exactas y se aplica una sola vez',()=>{
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../migraciones/001_inicial.sql',import.meta.url),'utf8'));
  db.exec("CREATE TABLE migraciones (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL); INSERT INTO migraciones VALUES ('001_inicial.sql', '2026-09-01'); INSERT INTO personas VALUES ('p','P','p',NULL,0,'hoy'); INSERT INTO grupos VALUES ('g','G',NULL,0,'hoy'); INSERT INTO membresias VALUES ('p','g','miembro','hoy'); INSERT INTO bares VALUES ('b','B','b',NULL,NULL,NULL,NULL,NULL,0,'p','hoy','hoy'); INSERT INTO variedades VALUES ('v','b','sin',0,'[]','sin|0|','Sin','p','hoy'); INSERT INTO degustaciones (id,op_id,grupo_id,autor_id,bar_id,variedad_id,fecha,patata,jugosidad,cuajado,sabor,presentacion,creado_en,actualizado_en) VALUES ('d','op','g','p','b','v','2026-09-01',8,7.5,6,9,8,'hoy','hoy')");
  migrar(db); const d=listarDegustaciones(db,{id:'p'})[0];assert.equal(d.nota,7.7);assert.equal(d.versionNota,1);assert.equal(d.notaGeneral,null);
  assert.deepEqual(migrar(db),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
});
