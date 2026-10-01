import { recordarRuta, ruta as construirRuta } from '../router.js';
import { el, debounce } from '../dom.js';
import { api, mensajeDeError } from '../api.js';
import { encabezado, mediasCompactas, estadoVacio, aviso, cargando, formatearNota } from '../ui.js';
import { movimientoReducido } from '../estado.js';
import { normalizarTexto } from '../texto.js';

const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
let promesaLeaflet = null;

/** Carga Leaflet bajo demanda desde cdnjs. Si falla, la lista sigue siendo la navegación principal. */
function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (promesaLeaflet) return promesaLeaflet;
  promesaLeaflet = new Promise((resolver, rechazar) => {
    const fallo = () => { promesaLeaflet = null; rechazar(new Error('No se ha podido cargar el mapa. Depende de un proveedor externo (Leaflet en cdnjs y mapas de OpenStreetMap).')); };
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) document.head.append(el('link', { rel: 'stylesheet', href: LEAFLET_CSS }));
    const script = el('script', { src: LEAFLET_JS, async: true });
    script.addEventListener('load', () => (window.L ? resolver(window.L) : fallo()));
    script.addEventListener('error', fallo);
    document.head.append(script);
    setTimeout(() => { if (!window.L) fallo(); }, 15000);
  });
  return promesaLeaflet;
}

const ICONO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="36" height="36"><ellipse cx="32" cy="58" rx="14" ry="4" fill="rgba(92,58,30,.25)"/><ellipse cx="32" cy="31" rx="29" ry="27" fill="#E8A800"/><ellipse cx="32" cy="30" rx="27" ry="25" fill="#F9C846"/><ellipse cx="32" cy="29" rx="21" ry="20" fill="#FDD86A"/><circle cx="25" cy="27" r="4" fill="#5C3A1E"/><circle cx="39" cy="27" r="4" fill="#5C3A1E"/><path d="M23 36q9 8 18 0" stroke="#5C3A1E" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';

export async function render(cont, params, { signal } = {}) {
  const barDestacado = params.get('bar');
  const entrada = el('input', { type: 'search', id: 'mapa-q', class: 'entrada', placeholder: 'Zona, barrio o nombre del bar', value: params.get('q') || '', autocomplete: 'off' });
  const contenedorMapa = el('div', { class: 'mapa', role: 'region', 'aria-label': 'Mapa de bares' }, el('div', { class: 'mapa__aviso' }, 'Cargando el mapa…'));
  const lista = el('div', { class: 'lista', 'aria-live': 'polite' });
  const botonCerca = el('button', { type: 'button', class: 'boton boton--pequeno boton--fantasma' }, '📍 Cerca de mí');
  const avisoGeo = el('div', {});

  cont.classList.add('contenido--ancho');
  cont.append(
    encabezado('Mapa de bares', { subtitulo: 'Cada tortilla es un bar con ubicación. La lista de abajo tiene todos, con o sin coordenadas.' }),
    el('div', { class: 'tarjeta', style: { marginTop: '.75rem' } },
      el('div', { class: 'campo', style: { marginBottom: '.5rem' } }, el('label', { for: 'mapa-q' }, 'Buscar por zona o nombre'), entrada),
      el('div', { class: 'fila-botones' }, botonCerca, el('span', { class: 'pista' }, 'Opcional: no hace falta dar permiso de ubicación para navegar.')),
      avisoGeo),
    el('div', { class: 'seccion' }, contenedorMapa),
    el('section', { class: 'seccion', 'aria-labelledby': 'lista-mapa-titulo' }, el('h2', { id: 'lista-mapa-titulo' }, 'Lista de bares'), el('div', { style: { marginTop: '.6rem' } }, lista)));

  let bares = [];
  try {
    bares = (await api.get('/api/bares?perspectiva=global')).bares;
  } catch (error) {
    lista.append(aviso('error', mensajeDeError(error)));
    contenedorMapa.replaceChildren(el('div', { class: 'mapa__aviso' }, 'No se han podido cargar los bares.'));
    return;
  }

  let descartado = false;
  let mapa = null;
  let mapaDisponible = false;
  let marcadores = new Map();
  let L = null;

  const coincide = (b, q) => !q || normalizarTexto(`${b.nombre} ${b.zona || ''} ${b.ciudad || ''}`).includes(normalizarTexto(q));

  function pintarLista(q = '') {
    lista.replaceChildren();
    const visibles = bares.filter((b) => coincide(b, q));
    if (!visibles.length) {
      lista.append(estadoVacio({ titulo: 'No hay bares con esa búsqueda', texto: 'Prueba con otra zona o crea el bar al puntuar.' }));
      return;
    }
    for (const b of visibles) {
      const conUbicacion = b.lat !== null && b.lng !== null;
      lista.append(el('div', { class: `bar-tarjeta ${b.id === barDestacado ? 'visita--mia' : ''}` },
        el('div', { class: 'bar-tarjeta__cabecera' },
          el('div', { style: { flex: '1 1 auto', minWidth: 0 } },
            el('div', { class: 'bar-tarjeta__nombre' }, el('a', { href: `#/bar/${encodeURIComponent(b.id)}`, style: { color: 'inherit', textDecoration: 'none' } }, b.nombre)),
            el('div', { class: 'bar-tarjeta__zona' }, [b.zona, b.ciudad].filter(Boolean).join(' · ') || 'Sin zona', b.direccion ? ` · ${b.direccion}` : '')),
          conUbicacion && mapaDisponible
            ? el('button', { type: 'button', class: 'boton boton--pequeno boton--fantasma', onclick: () => centrarEn(b) }, 'Ver en el mapa')
            : el('span', { class: 'chip chip--info chip--pequeno' }, conUbicacion ? 'Mapa no disponible' : 'Sin ubicación')),
        mediasCompactas(b.medias),
        el('div', { style: { marginTop: '.5rem' } }, el('a', { href: `#/bar/${encodeURIComponent(b.id)}` }, 'Abrir ficha →'))));
    }
    if (mapa) {
      for (const [id, marcador] of marcadores) {
        const b = bares.find((x) => x.id === id);
        if (coincide(b, q)) marcador.addTo(mapa);
        else marcador.remove();
      }
    }
  }

  function centrarEn(b) {
    if (!mapa) { contenedorMapa.scrollIntoView({ behavior: movimientoReducido() ? 'instant' : 'smooth' }); return; }
    mapa.setView([b.lat, b.lng], 16);
    marcadores.get(b.id)?.openPopup();
    contenedorMapa.scrollIntoView({ behavior: movimientoReducido() ? 'instant' : 'smooth', block: 'center' });
  }

  function popupDe(b) {
    const nodo = el('div', {},
      el('strong', {}, b.nombre), el('br'),
      el('span', { class: 'pista' }, [b.zona, b.ciudad].filter(Boolean).join(' · ')), el('br'),
      el('span', {}, `Tu media: ${b.medias.tu.media === null ? '—' : formatearNota(b.medias.tu.media)} · Los demás: ${b.medias.demas.media === null ? '—' : formatearNota(b.medias.demas.media)}`), el('br'),
      el('a', { href: `#/bar/${encodeURIComponent(b.id)}` }, 'Abrir ficha →'));
    return nodo;
  }

  pintarLista(entrada.value);
  entrada.addEventListener('input', debounce(() => { recordarRuta('/mapa', { q: entrada.value }); pintarLista(entrada.value); }, 200, signal));

  botonCerca.addEventListener('click', () => {
    if (!navigator.geolocation) { avisoGeo.replaceChildren(aviso('info', 'Este navegador no ofrece ubicación. Puedes buscar por zona.')); return; }
    botonCerca.disabled = true;
    navigator.geolocation.getCurrentPosition((pos) => {
      botonCerca.disabled = false;
      const { latitude, longitude } = pos.coords;
      if (mapa) mapa.setView([latitude, longitude], 15);
      const conDistancia = bares.filter((b) => b.lat !== null).map((b) => ({ b, d: Math.hypot((b.lat - latitude) * 111, (b.lng - longitude) * 111 * Math.cos(latitude * Math.PI / 180)) })).sort((x, y) => x.d - y.d).slice(0, 3);
      avisoGeo.replaceChildren(aviso('info', conDistancia.length ? `Más cercanos: ${conDistancia.map((x) => `${x.b.nombre} (${x.d < 1 ? `${Math.round(x.d * 1000)} m` : `${x.d.toFixed(1)} km`})`).join(', ')}.` : 'No hay bares con coordenadas cerca.'));
    }, (error) => {
      botonCerca.disabled = false;
      avisoGeo.replaceChildren(aviso('info', error.code === 1 ? 'Sin permiso de ubicación. Puedes buscar por zona.' : error.code === 3 ? 'La ubicación ha tardado demasiado. Puedes reintentar o buscar por zona.' : 'No se ha podido obtener tu ubicación. Puedes buscar por zona.'));
    }, { timeout: 8000 });
  });

  return {
    alMontar: async () => {
      try {
        L = await cargarLeaflet();
      } catch (error) {
        contenedorMapa.replaceChildren(el('div', { class: 'mapa__aviso' }, `${error.message} Usa la lista de abajo para abrir las fichas.`));
        return;
      }
      if (descartado || signal?.aborted) return;
      contenedorMapa.replaceChildren();
      const conUbicacion = bares.filter((b) => b.lat !== null && b.lng !== null);
      if (!conUbicacion.length) { contenedorMapa.replaceChildren(el('div', { class: 'mapa__aviso' }, 'Estos lugares todavía no tienen una ubicación confirmada. Puedes abrir sus fichas en la lista.')); return; }
      mapa = L.map(contenedorMapa, { scrollWheelZoom: false, zoomAnimation: !movimientoReducido(), fadeAnimation: !movimientoReducido() });
      mapaDisponible = true;
      // OSM exige identificar el origen. Solo las teselas envían el origen, sin ruta, consultas ni fragmento.
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).on('tileerror', () => {
        mapaDisponible = false; pintarLista(entrada.value);
        avisoGeo.replaceChildren(aviso('error', 'El mapa no está cargando. Las fichas siguen disponibles en la lista.', { acciones: el('button', { class: 'boton boton--pequeno', onclick: () => window.location.reload() }, 'Reintentar mapa') }));
      }).addTo(mapa);
      const icono = L.divIcon({ className: 'marcador-tortilla', html: ICONO_SVG, iconSize: [36, 36], iconAnchor: [18, 34], popupAnchor: [0, -30] });
      for (const b of conUbicacion) {
        const marcador = L.marker([b.lat, b.lng], { icon: icono, title: b.nombre, alt: b.nombre }).bindPopup(popupDe(b));
        marcador.addTo(mapa);
        marcadores.set(b.id, marcador);
      }
      if (conUbicacion.length) mapa.fitBounds(L.latLngBounds(conUbicacion.map((b) => [b.lat, b.lng])).pad(0.2));
      else mapa.setView([43.263, -2.935], 13);
      if (!conUbicacion.length) contenedorMapa.append(el('div', { class: 'mapa__aviso', style: { pointerEvents: 'none' } }, 'Ningún bar tiene coordenadas todavía. Añádelas desde «Editar bar» en su ficha.'));
      pintarLista(entrada.value);
      const destacado = conUbicacion.find((b) => b.id === barDestacado);
      if (destacado) centrarEn(destacado);
    },
    limpiar: () => { descartado = true; if (mapa) { mapa.remove(); mapa = null; } },
  };
}
