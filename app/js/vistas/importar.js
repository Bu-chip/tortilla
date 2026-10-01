import { el } from '../dom.js';
import { api, mensajeDeError } from '../api.js';
import { encabezado, aviso, cargando, toast, formatearFecha } from '../ui.js';
import { formatearNota, notaDeVisita } from '../formato.js';
import { CEBOLLA, TIPO_CUAJADO } from '../etiquetas.js';
import { estado } from '../estado.js';

export async function render(cont) {
  const maximo=estado.config.auth==='firebase'?60:500;
  const entrada = el('textarea', { id: 'importar-json', rows: '8', placeholder: '[{"id":1717000000000,"bar":"Bar Txoko","ciudad":"Bilbao","cebolla":"con cebolla", ...}]', spellcheck: 'false' });
  const zona = el('div', { 'aria-live': 'polite' });
  const botonPrevisualizar = el('button', { type: 'button', class: 'boton' }, 'Revisar antes de importar');

  cont.append(
    encabezado('Importar del Tortillómetro antiguo', { subtitulo: 'Trae las valoraciones guardadas en el navegador del HTML original, revisándolas una a una.' }),
    el('div', { class: 'tarjeta', style: { marginTop: '.75rem' } },
      el('h2', {}, 'Cómo sacar los datos antiguos'),
      el('ol', { style: { paddingLeft: '1.2rem', margin: '.5rem 0 .8rem' } },
        el('li', {}, 'Abre el HTML antiguo en el navegador donde puntuaste.'),
        el('li', {}, 'Abre la consola del navegador (F12 o Cmd+Opt+I) y escribe: ', el('code', {}, "copy(localStorage.getItem('tortillometro_v2'))")),
        el('li', {}, 'Pega aquí el texto copiado. No se borra nada del navegador antiguo.')),
      el('div', { class: 'campo' }, el('label', { for: 'importar-json' }, 'Datos antiguos (JSON)'), entrada),
      el('p',{class:'pista'},`Hasta ${maximo} entradas en cada revisión. Las importaciones repetidas no se duplican.`),
      botonPrevisualizar),
    el('div', { class: 'seccion' }, zona));

  botonPrevisualizar.addEventListener('click', async () => {
    let entradas;
    try {
      entradas = JSON.parse(entrada.value);
      if (!Array.isArray(entradas)) throw new Error('no-lista');
    } catch {
      zona.replaceChildren(aviso('error', 'Eso no parece la lista JSON del Tortillómetro. Debe empezar por «[» y terminar por «]».'));
      return;
    }
    if(entradas.length>maximo){zona.replaceChildren(aviso('error',`Importa como máximo ${maximo} entradas cada vez.`));return;}
    zona.replaceChildren(cargando('Revisando…'));
    try {
      const elementos=[];
      const tamano=estado.config.auth==='firebase'?20:500;
      for(let offset=0;offset<entradas.length;offset+=tamano){
        const respuesta=await api.post('/api/importar/previsualizar',{formato:'tortillometro_v2',entradas:entradas.slice(offset,offset+tamano),offset});
        elementos.push(...respuesta.elementos);
      }
      pintarRevision(elementos);
    } catch (error) {
      zona.replaceChildren(aviso('error', mensajeDeError(error)));
    }
  });

  function pintarRevision(elementos) {
    const filas = elementos.map((e) => {
      const seleccion = el('select', { 'aria-label': `Bar para la entrada ${e.indice + 1}` },
        e.sugerencias.map((s) => el('option', { value: s.id }, `${s.nombre}${s.zona ? ` (${s.zona})` : ''}`)),
        el('option', { value: '' }, e.candidata.barNombre ? `Crear «${e.candidata.barNombre}» nuevo` : 'Sin bar (no se puede importar)'));
      const fecha = el('input', { type: 'date', value: e.candidata.fecha || '', 'aria-label': `Fecha para la entrada ${e.indice + 1}` });
      const incluir = el('input', { type: 'checkbox', checked: !e.yaImportada && !e.problemas.length ? true : null, disabled: e.yaImportada ? true : null, 'aria-label': `Importar la entrada ${e.indice + 1}` });
      const nota = notaDeVisita(e.candidata.criterios);
      return { e, seleccion, fecha, incluir, fila: el('tr', {},
        el('td', {}, incluir),
        el('td', {}, el('strong', {}, e.candidata.barNombre || '(sin bar)'), el('div', { class: 'pista' }, e.candidata.barZona || ''), el('div', { style: { marginTop: '.3rem' } }, seleccion)),
        el('td', {}, fecha, e.candidata.fecha ? null : el('div', { class: 'campo__error' }, 'Pon una fecha')),
        el('td', {}, nota === null ? '—' : formatearNota(nota), el('div', { class: 'pista' }, `${CEBOLLA[e.candidata.variedad.cebolla] || ''}${e.candidata.variedad.vegana ? ' · vegana' : ''}${e.candidata.variedad.ingredientes.length ? ` · ${e.candidata.variedad.ingredientes.join(', ')}` : ''}${e.candidata.tipoCuajado ? ` · ${TIPO_CUAJADO[e.candidata.tipoCuajado]}` : ''}`)),
        el('td', {}, e.yaImportada ? el('span', { class: 'chip chip--info chip--pequeno' }, 'Ya importada') : e.problemas.length ? el('ul', { style: { margin: 0, paddingLeft: '1rem' }, class: 'campo__error' }, e.problemas.map((p) => el('li', {}, p))) : el('span', { class: 'chip chip--info chip--pequeno' }, 'Lista'))) };
    });
    const botonImportar = el('button', { type: 'button', class: 'boton boton--marron' }, 'Importar las seleccionadas');
    const resultado = el('div', {});
    botonImportar.addEventListener('click', async () => {
      const seleccionadas = filas.filter((f) => f.incluir.checked);
      if (!seleccionadas.length) { toast('No hay ninguna entrada seleccionada.'); return; }
      botonImportar.disabled = true;
      try {
        const elementos=seleccionadas.map((f) => ({ opId: f.e.opId, candidata: { ...f.e.candidata, fecha: f.fecha.value || f.e.candidata.fecha }, barId: f.seleccion.value || null, fecha: f.fecha.value || null }));
        const r={creadas:0,repetidas:0,errores:[]};
        const tamano=estado.config.auth==='firebase'?3:500;
        for(let offset=0;offset<elementos.length;offset+=tamano){
          const respuesta=await api.post('/api/importar',{formato:'tortillometro_v2',elementos:elementos.slice(offset,offset+tamano)});
          r.creadas+=respuesta.creadas;r.repetidas+=respuesta.repetidas;r.errores.push(...respuesta.errores);
        }
        resultado.replaceChildren(aviso(r.errores.length ? 'nota' : 'exito', `Importadas ${r.creadas}; ya existían ${r.repetidas}; con error ${r.errores.length}.`, { acciones: el('a', { class: 'boton boton--pequeno', href: '#/historial' }, 'Ver el historial') }),
          r.errores.length ? el('ul', { class: 'campo__error' }, r.errores.map((x) => el('li', {}, x.mensaje))) : null);
      } catch (error) {
        resultado.replaceChildren(aviso('error', mensajeDeError(error)));
      } finally {
        botonImportar.disabled = false;
      }
    });
    zona.replaceChildren(
      el('h2', {}, `Revisión: ${elementos.length} ${elementos.length === 1 ? 'entrada' : 'entradas'}`),
      el('p', { class: 'pista', style: { margin: '.3rem 0 .6rem' } }, 'Elige el bar existente o crea uno nuevo, corrige la fecha si falta y desmarca lo que no quieras traer. Las entradas repetidas no se duplican.'),
      el('div', { class: 'tabla-scroll' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Traer'), el('th', {}, 'Bar'), el('th', {}, 'Fecha'), el('th', {}, 'Nota y tortilla'), el('th', {}, 'Estado'))),
        el('tbody', {}, filas.map((f) => f.fila)))),
      el('div', { style: { marginTop: '.8rem' } }, botonImportar),
      resultado);
  }
}
