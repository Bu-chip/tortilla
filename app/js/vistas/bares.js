import { el, debounce } from '../dom.js';
import { api, mensajeDeError } from '../api.js';
import { ruta as construirRuta } from '../router.js';
import { grupoChips, segmentado } from '../componentes/chips.js';
import { encabezado, mediasCompactas, chipVariedad, estadoVacio, aviso, cargando, formatearNota } from '../ui.js';
import { TEXTOS } from '../etiquetas.js';

const PERSPECTIVAS = [
  { valor: 'demas', etiqueta: 'Los demás' },
  { valor: 'tu', etiqueta: 'Tu media' },
  { valor: 'global', etiqueta: 'Global' },
];

export async function render(cont, params) {
  const filtros = {
    metodo: params.get('metodo') === 'historica' ? 'historica' : 'general',
    q: params.get('q') || '',
    zona: params.get('zona') || '',
    cebolla: ['con', 'sin'].includes(params.get('cebolla')) ? params.get('cebolla') : null,
    vegana: params.get('vegana') === '1',
    perspectiva: ['demas', 'tu', 'global'].includes(params.get('perspectiva')) ? params.get('perspectiva') : 'demas',
  };

  const entrada = el('input', { type: 'search', id: 'bares-q', class: 'entrada', placeholder: 'Nombre del bar, barrio o ciudad', value: filtros.q, autocomplete: 'off' });
  const selectZona = el('select', { id: 'bares-zona' }, el('option', { value: '' }, 'Todas las zonas'));
  const chipsCebolla = grupoChips({ nombre: 'Cebolla', valor: filtros.cebolla, opciones: [{ valor: 'con', etiqueta: 'Con cebolla', emoji: '🧅' }, { valor: 'sin', etiqueta: 'Sin cebolla', emoji: '🚫' }], alCambiar: (v) => { filtros.cebolla = v; refrescar(); } });
  const chipVegana = grupoChips({ nombre: 'Solo veganas', valor: filtros.vegana ? 'si' : null, opciones: [{ valor: 'si', etiqueta: 'Solo veganas', emoji: '🌿', clase: '' }], alCambiar: (v) => { filtros.vegana = v === 'si'; refrescar(); } });
  const perspectiva = segmentado({ nombre: 'Perspectiva del ranking', valor: filtros.perspectiva, opciones: PERSPECTIVAS, alCambiar: (v) => { filtros.perspectiva = v; refrescar(); } });
  const metodo = el('select', { id: 'ranking-metodo', 'aria-label': 'Método de valoración' }, el('option', { value: 'general' }, 'Notas generales'), el('option', { value: 'historica' }, 'Medias históricas · 5 criterios'));
  metodo.value = filtros.metodo;
  metodo.addEventListener('change', () => { filtros.metodo = metodo.value; refrescar(); });
  let revision = 0;
  const lista = el('div', { 'aria-live': 'polite', 'aria-busy': 'false' });
  const ambitoNodo = el('div', { style: { marginTop: '.3rem' } });

  entrada.addEventListener('input', debounce(() => { filtros.q = entrada.value; refrescar(); }, 250));
  selectZona.addEventListener('change', () => { filtros.zona = selectZona.value; refrescar(); });

  cont.append(
    encabezado('Dónde repetirías', { subtitulo: 'Bares, tortillas y las notas de tu grupo.' }),
    ambitoNodo,
    el('div', { class: 'tarjeta', style: { marginTop: '.75rem' } },
      el('div', { class: 'campo' }, el('label', { for: 'bares-q' }, 'Buscar'), entrada),
      el('details', { class: 'filtros-ranking', open: !!(filtros.zona || filtros.cebolla || filtros.vegana) }, el('summary', {}, 'Filtrar por zona y receta'),
      el('div', { class: 'campo' }, el('label', { for: 'bares-zona' }, 'Zona'), selectZona),
      el('div', { class: 'campo' }, el('span', { class: 'campo__etiqueta' }, 'Variante'), el('div', { class: 'chips' }, chipsCebolla.elemento, chipVegana.elemento))),
      el('div', { class: 'campo', style: { marginBottom: 0 } }, el('span', { class: 'campo__etiqueta' }, 'Ordenar por'), perspectiva.elemento, metodo)),
    el('div', { class: 'seccion' }, lista));

  try {
    const { zonas } = await api.get('/api/zonas');
    for (const z of zonas) selectZona.append(el('option', { value: z.zona, selected: z.zona === filtros.zona ? true : null }, `${z.zona} (${z.bares})`));
  } catch { /* sin zonas */ }

  async function refrescar() {
    const turno = ++revision;
    history.replaceState(null, '', construirRuta('/bares', { metodo: filtros.metodo, q: filtros.q, zona: filtros.zona, cebolla: filtros.cebolla, vegana: filtros.vegana ? '1' : '', perspectiva: filtros.perspectiva === 'demas' ? '' : filtros.perspectiva }));
    lista.setAttribute('aria-busy', 'true');
    lista.replaceChildren(cargando('Calculando medias…'));
    try {
      const consulta = new URLSearchParams({ metodo: filtros.metodo });
      if (filtros.q) consulta.set('q', filtros.q);
      if (filtros.zona) consulta.set('zona', filtros.zona);
      if (filtros.cebolla) consulta.set('cebolla', filtros.cebolla);
      if (filtros.vegana) consulta.set('vegana', '1');
      consulta.set('perspectiva', filtros.perspectiva);
      const r = await api.get(`/api/bares?${consulta}`);
      if (turno !== revision) return;
      ambitoNodo.replaceChildren(el('span', { class: 'etiqueta-ambito' }, `Ámbito: ${r.ambito.etiqueta}`, r.ambito.demo ? el('span', { class: 'etiqueta-demo' }, TEXTOS.demo) : null));
      pintarLista(r.bares);
    } catch (error) {
      if (turno !== revision) return;
      lista.replaceChildren(aviso('error', mensajeDeError(error, 'No se ha podido cargar el ranking.'), { acciones: el('button', { type: 'button', class: 'boton boton--pequeno', onclick: refrescar }, 'Reintentar') }));
    } finally {
      if (turno === revision) lista.setAttribute('aria-busy', 'false');
    }
  }

  function pintarLista(bares) {
    lista.replaceChildren();
    if (!bares.length) {
      lista.append(estadoVacio({ titulo: 'No hay bares con esos filtros', texto: filtros.q || filtros.zona || filtros.cebolla || filtros.vegana ? 'Prueba a quitar algún filtro o crea el bar al puntuar.' : 'Crea el primero al puntuar una tortilla.', accion: el('a', { class: 'boton boton--pequeno', href: '#/valorar' }, '⭐ Puntuar una tortilla') }));
      return;
    }
    const clave = filtros.perspectiva === 'tu' ? (b) => b.medias.tu.media : filtros.perspectiva === 'global' ? (b) => b.medias.global.media : (b) => b.medias.demas.media;
    const conDatos = bares.filter((b) => clave(b) !== null);
    const sinDatos = bares.filter((b) => clave(b) === null);
    const titulo = { tu: 'Tu ranking personal', demas: 'Ranking según los demás', global: 'Ranking global (todas las visitas)' }[filtros.perspectiva];
    const filtroTexto = [filtros.cebolla ? (filtros.cebolla === 'con' ? 'con cebolla' : 'sin cebolla') : null, filtros.vegana ? 'veganas' : null].filter(Boolean).join(', ');
    lista.append(el('div', { class: 'seccion__cabecera' }, el('h2', {}, titulo), filtroTexto ? el('span', { class: 'chip chip--info chip--pequeno' }, `Filtro: solo variedades ${filtroTexto}`) : null));
    if (!conDatos.length) {
      lista.append(estadoVacio({
        titulo: filtros.perspectiva === 'tu' ? 'Todavía no has puntuado ningún bar' : filtros.perspectiva === 'demas' ? 'Nadie más ha puntuado todavía' : 'Todavía no hay valoraciones',
        texto: filtros.perspectiva === 'tu' ? 'Tu ranking personal se construye con tus propias visitas; no inventamos uno.' : 'Cuando haya valoraciones en tu ámbito aparecerán aquí ordenadas.',
        animo: 'duda',
      }));
    } else {
      lista.append(el('ol', { class: 'lista', 'aria-label': titulo }, conDatos.map((b, i) => tarjetaBar(b, i + 1))));
    }
    if (sinDatos.length) {
      lista.append(el('details', { class: 'detalles', style: { marginTop: '1rem' } },
        el('summary', {}, `${sinDatos.length} ${sinDatos.length === 1 ? 'bar sin datos' : 'bares sin datos'} en esta perspectiva`),
        el('ul', { class: 'lista' }, sinDatos.map((b) => tarjetaBar(b, null)))));
    }
  }

  function tarjetaBar(b, puesto) {
    const lugar = [b.zona, b.ciudad].filter(Boolean).join(' · ');
    const valor = filtros.perspectiva === 'tu' ? b.medias.tu.media : filtros.perspectiva === 'global' ? b.medias.global.media : b.medias.demas.media;
    return el('li', {}, el('a', { class: 'bar-tarjeta', href: `#/bar/${encodeURIComponent(b.id)}?metodo=${filtros.metodo}` },
      el('div', { class: 'bar-tarjeta__cabecera' },
        el('div', { class: `bar-tarjeta__puesto ${puesto === 1 ? 'bar-tarjeta__puesto--1' : ''} ${puesto ? '' : 'bar-tarjeta__puesto--sin'}`, 'aria-label': puesto ? `Puesto ${puesto}` : 'Sin puesto' }, puesto ? (puesto === 1 ? '🥇' : `${puesto}º`) : '—'),
        el('div', { style: { flex: '1 1 auto', minWidth: 0 } },
          el('div', { class: 'bar-tarjeta__nombre' }, b.nombre, b.esDemo ? el('span', { class: 'etiqueta-demo', style: { marginLeft: '.4rem', verticalAlign: 'middle' } }, 'demo') : null),
          lugar ? el('div', { class: 'bar-tarjeta__zona' }, lugar) : null),
        valor !== null ? el('div', { class: 'visita__nota', 'aria-label': `Media ${formatearNota(valor)}` }, formatearNota(valor), el('small', {}, PERSPECTIVAS.find((p) => p.valor === filtros.perspectiva).etiqueta)) : null),
      b.variedades.length ? el('div', { class: 'bar-tarjeta__variedades' }, b.variedades.slice(0, 2).map((v) => chipVariedad(v))) : null,
      mediasCompactas(b.medias, { perspectiva: filtros.perspectiva })));
  }

  await refrescar();
}
