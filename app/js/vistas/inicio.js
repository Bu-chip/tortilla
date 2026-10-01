import { el } from '../dom.js';
import { api } from '../api.js';
import { estado } from '../estado.js';
import { navegar } from '../router.js';
import { tortilla } from '../tortilla.js';
import { tarjetaVisita, estadoVacio, aviso } from '../ui.js';

export async function render(cont) {
  const { config, sesion } = estado;
  const botonTortilla = el('a', { href: '#/valorar', class: 'inicio-mascota', 'aria-label': 'Puntuar una tortilla' }, tortilla({ animo: 'feliz', tamano: 160 }));
  const busqueda = el('input', { type: 'search', id: 'buscar-inicio', class: 'entrada', placeholder: 'Bar, barrio o ciudad' });
  cont.append(el('section', { class: 'inicio-bienvenida' },
    el('div', {}, el('p', { class: 'eyebrow' }, sesion?.ambito?.etiqueta || config.nombreApp),
      el('h1', {}, 'Una tortilla más', el('br'), 'para recordar.'),
      el('p', { class: 'subtitulo' }, 'Tus notas, tus sitios y los de tus amigos.'),
      el('a', { href: '#/valorar', class: 'boton' }, 'Puntuar una tortilla')), botonTortilla),
    el('form', { class: 'inicio-buscar', role: 'search', onsubmit: e => { e.preventDefault(); navegar(`/bares?q=${encodeURIComponent(busqueda.value.trim())}`); } },
      el('label', { for: 'buscar-inicio', class: 'visualmente-oculto' }, 'Buscar un bar o una zona'), busqueda, el('button', { class: 'boton boton--fantasma', type: 'submit' }, 'Buscar')));

  const misVisitas = el('section', { class: 'seccion', 'aria-labelledby': 'mis-visitas-titulo' },
    el('div', { class: 'seccion__cabecera' }, el('h2', { id: 'mis-visitas-titulo' }, 'Tus últimas visitas'), el('a', { class: 'enlace', href: '#/historial' }, 'Ver todo el historial')),
    el('div', { class: 'lista', id: 'mis-visitas' }));
  const grupo = el('section', { class: 'seccion', 'aria-labelledby': 'grupo-titulo' },
    el('div', { class: 'seccion__cabecera' }, el('h2', { id: 'grupo-titulo' }, 'Lo último del grupo')),
    el('div', { class: 'lista', id: 'ultimas-grupo' }));
  cont.append(misVisitas, grupo);

  const [mias, todas] = await Promise.allSettled([
      api.get('/api/degustaciones?solo=mias&limite=3'),
      api.get('/api/degustaciones?solo=demas&limite=3'),
    ]);
    const listaMias = misVisitas.querySelector('#mis-visitas');
    if (mias.status === 'rejected') listaMias.append(aviso('error', 'No se han podido cargar tus visitas. Recarga para reintentar.'));
    else if (!mias.value.degustaciones.length) {
      listaMias.append(estadoVacio({ titulo: 'Todavía no has puntuado ninguna tortilla', texto: 'Empieza por el último pincho que recuerdes.', animo: 'duda', accion: el('a', { class: 'boton boton--pequeno', href: '#/valorar' }, '⭐ Puntuar una tortilla') }));
    } else {
      listaMias.append(...mias.value.degustaciones.map((d) => tarjetaVisita(d, { mostrarBar: true })));
    }
    const ajenas = todas.status === 'fulfilled' ? todas.value.degustaciones.filter((d) => !d.esMia).slice(0, 3) : [];
    const listaGrupo = grupo.querySelector('#ultimas-grupo');
    if (todas.status === 'rejected') listaGrupo.append(aviso('error', 'No se han podido cargar las visitas del grupo. Recarga para reintentar.'));
    else if (!ajenas.length) listaGrupo.append(estadoVacio({ titulo: 'Nadie más ha puntuado todavía', texto: 'Cuando tus amigos valoren algo aparecerá aquí.', animo: 'meh' }));
    else listaGrupo.append(...ajenas.map((d) => tarjetaVisita(d, { mostrarBar: true })));
}
