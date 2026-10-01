import { el } from '../dom.js';
import { api } from '../api.js';
import { estado } from '../estado.js';
import { navegar } from '../router.js';
import { tortilla } from '../tortilla.js';
import { tarjetaVisita, textoAmbito, estadoVacio, aviso } from '../ui.js';
import { TEXTOS } from '../etiquetas.js';

const BLOBS = [
  { w: 120, color: 'var(--yema)', top: '6%', left: '2%', dur: '7s', delay: '0s' },
  { w: 80, color: 'var(--melocoton)', top: '18%', right: '4%', dur: '5s', delay: '1s' },
  { w: 60, color: 'var(--salvia)', bottom: '30%', left: '6%', dur: '8s', delay: '2s' },
  { w: 90, color: 'var(--lavanda)', bottom: '26%', right: '3%', dur: '6s', delay: '.5s' },
];

export async function render(cont) {
  const { config, sesion } = estado;
  const botonTortilla = el('button', { type: 'button', class: 'portada__tortilla animar-entrada', 'aria-label': 'Puntuar una tortilla' },
    tortilla({ animo: 'feliz', tamano: 300 }),
    el('span', { class: 'portada__etiqueta', 'aria-hidden': 'true' }, '¡Puntúame! 👆'));
  botonTortilla.addEventListener('click', () => {
    const svg = botonTortilla.querySelector('svg');
    svg.classList.add('tortilla--rebota');
    setTimeout(() => navegar('/valorar'), 180);
  });

  const busqueda = el('input', { type: 'search', id: 'buscar-inicio', class: 'entrada', placeholder: 'Busca un bar o una zona' });
  const formulario = el('form', { role: 'search', onsubmit: (e) => { e.preventDefault(); navegar(`/bares?q=${encodeURIComponent(busqueda.value.trim())}`); } },
    el('label', { for: 'buscar-inicio', class: 'visualmente-oculto' }, 'Buscar un bar o una zona'),
    busqueda,
    el('button', { type: 'submit', class: 'boton boton--pequeno' }, '🔎 Buscar'));

  cont.append(el('section', { class: 'portada' },
    BLOBS.map((b) => el('div', { class: 'blob', 'aria-hidden': 'true', style: { width: `${b.w}px`, height: `${b.w}px`, background: b.color, top: b.top, left: b.left, right: b.right, bottom: b.bottom, animationDuration: b.dur, animationDelay: b.delay } })),
    el('h1', { class: 'portada__titulo animar-titulo' }, config.nombreApp, ' ', el('span', { 'aria-hidden': 'true' }, '🍳')),
    el('p', { class: 'portada__sub animar-titulo' }, 'Puntúa · repite bar · compara con tus amigos'),
    botonTortilla,
    el('p', { class: 'portada__toca animar-entrada' }, `${TEXTOS.invitacion} ↑`),
    el('div', { class: 'portada__acciones animar-entrada' }, formulario, el('a', { class: 'boton boton--marron boton--pequeno', href: '#/bares' }, '🏆 Ver el ranking')),
    el('p', { style: { marginTop: '.9rem' } }, textoAmbito(sesion?.ambito))));

  if (sesion?.ambito?.demo) {
    cont.append(el('div', { class: 'seccion' }, aviso('info', 'Demostración: bares reales de Bilbao; visitas, recetas, precios y opiniones ficticios. No confirman la oferta del establecimiento.')));
  }

  const misVisitas = el('section', { class: 'seccion', 'aria-labelledby': 'mis-visitas-titulo' },
    el('div', { class: 'seccion__cabecera' }, el('h2', { id: 'mis-visitas-titulo' }, 'Tus últimas visitas'), el('a', { class: 'enlace', href: '#/historial' }, 'Ver todo el historial')),
    el('div', { class: 'lista', id: 'mis-visitas' }));
  const grupo = el('section', { class: 'seccion', 'aria-labelledby': 'grupo-titulo' },
    el('div', { class: 'seccion__cabecera' }, el('h2', { id: 'grupo-titulo' }, 'Lo último del grupo')),
    el('div', { class: 'lista', id: 'ultimas-grupo' }));
  cont.append(misVisitas, grupo);

  try {
    const [mias, todas] = await Promise.all([
      api.get('/api/degustaciones?solo=mias&limite=3'),
      api.get('/api/degustaciones?solo=demas&limite=3'),
    ]);
    const listaMias = misVisitas.querySelector('#mis-visitas');
    if (!mias.degustaciones.length) {
      listaMias.append(estadoVacio({ titulo: 'Todavía no has puntuado ninguna tortilla', texto: 'La primera siempre es especial. Toca la tortilla de arriba.', animo: 'duda', accion: el('a', { class: 'boton boton--pequeno', href: '#/valorar' }, '⭐ Puntuar una tortilla') }));
    } else {
      listaMias.append(...mias.degustaciones.map((d) => tarjetaVisita(d, { mostrarBar: true })));
    }
    const ajenas = todas.degustaciones.filter((d) => !d.esMia).slice(0, 3);
    const listaGrupo = grupo.querySelector('#ultimas-grupo');
    if (!ajenas.length) listaGrupo.append(estadoVacio({ titulo: 'Nadie más ha puntuado todavía', texto: 'Cuando tus amigos valoren algo aparecerá aquí.', animo: 'meh' }));
    else listaGrupo.append(...ajenas.map((d) => tarjetaVisita(d, { mostrarBar: true })));
  } catch (error) {
    misVisitas.append(aviso('error', `No se han podido cargar las visitas: ${error.message}`));
  }
}
