import { el } from '../dom.js';
import { estado, movimientoReducido, fijarMovimientoReducido } from '../estado.js';
import { tortilla } from '../tortilla.js';
import { ASPECTOS } from '../etiquetas.js';
import { fuenteLugares } from '../componentes/fuente-lugares.js';

export async function render(cont) {
  const { config, sesion } = estado;
  const casilla = el('input', { type: 'checkbox', id: 'menos-animaciones', checked: movimientoReducido() ? true : null });
  casilla.addEventListener('change', () => fijarMovimientoReducido(casilla.checked));

  cont.append(el('div', { class: 'prosa' },
    el('div', { style: { display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' } }, tortilla({ animo: 'mmm', tamano: 110 }), el('div', {}, el('h1', {}, `Acerca de ${config.nombreApp}`), el('p', { class: 'subtitulo' }, 'Cómo se puntúa y qué significa cada media.'))),

    el('h2', {}, 'Qué es esto'),
    el('p', {}, 'Una aplicación para puntuar tortillas de patata con tus amigos: recordar lo probado, repetir bar sin perder las visitas anteriores y comparar tu opinión con la del resto. El nombre es provisional.'),

    el('h2', {}, 'Cómo se puntúa una visita'),
    el('p', {}, 'Cada visita a un bar es una degustación. Volver a probar la misma tortilla otro día crea otra degustación; corregir un error edita la existente. Elige una nota general de 1 a 10 en medios puntos. Si quieres, afina estos cinco aspectos:'),
    el('ul', {}, ASPECTOS.map((c) => el('li', {}, el('strong', {}, `${c.etiqueta}: `), c.ayuda))),
    el('p', {}, 'Los aspectos son opcionales y no calculan ni cambian tu nota general. Un aspecto sin responder queda vacío. Las visitas anteriores conservan su media de patata, jugosidad, cuajado, sabor y presentación, identificada como histórica. Nunca se mezcla con las notas generales.'),
    el('p', {}, 'Punto de cuajado, sal, tamaño, precio y acompañamientos describen la visita. «No me fijé» conserva la observación sin crear una receta nueva.'),

    el('h2', {}, 'Qué significa cada media'),
    el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Media'), el('th', {}, 'Qué incluye'))),
      el('tbody', {},
        el('tr', {}, el('td', {}, el('strong', {}, 'Tu media')), el('td', {}, 'Todas tus visitas a ese bar, también las repetidas. Cada visita pesa lo mismo.')),
        el('tr', {}, el('td', {}, el('strong', {}, 'Los demás')), el('td', {}, 'Todas las visitas de otras personas de tu ámbito. Excluye todas las tuyas, no solo la última.')),
        el('tr', {}, el('td', {}, el('strong', {}, 'Media global')), el('td', {}, 'Todas las visitas juntas. Es un dato adicional; nunca sustituye a «Los demás».')))),
    el('p', {}, el('strong', {}, 'Ejemplo: '), 'tú puntúas un bar con 8 y 6; otra persona, con 9 y 7. Ves ', el('strong', {}, 'Tu media 7,00 · 2 visitas'), ' y ', el('strong', {}, 'Los demás 8,00 · 2 valoraciones de 1 persona'), '. La global es 7,50. Si entra la otra persona, las dos medias se intercambian. No se promedia primero por persona ni se cuenta solo la última visita; el redondeo a dos decimales es solo para mostrar.'),
    el('p', {}, 'Un filtro de variedad o de fechas se aplica por igual a las dos medias y la ficha sigue mostrando la media general del bar. Sin datos verás «Aún no has puntuado» o «Todavía no hay otras valoraciones», nunca un cero.'),

    el('h2', {}, 'Ranking'),
    el('p', {}, 'El ranking ordena los bares por la media de la perspectiva elegida (los demás, la tuya o la global) y muestra siempre el número de valoraciones y de personas. Con pocas visitas, un 10 dice menos que un 8,8 con muchas; por eso los recuentos van al lado y no se aplican ponderaciones que alteren la media. Si no has puntuado ningún bar, no hay ranking personal inventado.'),

    el('h2', {}, 'Variedades, cebolla y vegana'),
    el('p', {}, 'Una variedad es una receta del bar: con o sin cebolla, vegana o no, y sus ingredientes añadidos. Vegana es una característica de la receta que puede convivir con pimiento, setas o lo que sea. La batalla «con o sin cebolla» recoge una preferencia por persona, que se puede cambiar; puntuar tortillas no vota.'),

    el('h2', {}, 'Quién ve qué'),
    el('p', {}, `Cada persona pertenece a un grupo (ámbito). Ves las visitas y las medias de tu grupo; una persona sin grupo no ve nada. Tu ámbito actual: ${sesion?.ambito?.etiqueta || 'sin sesión'}.`),
    sesion?.ambito?.demo ? el('p', {}, el('strong', {}, 'Datos de demostración: '), 'los bares son reales; las visitas, recetas, precios y opiniones son ficticios y no confirman la oferta de los establecimientos.') : null,
    el('p', {}, 'Puedes exportar tus datos desde el menú (JSON con identificadores, autoría, criterios, fechas y valores ausentes) e importar valoraciones del Tortillómetro antiguo revisándolas una a una.'),

    el('h2', {}, 'Comodidad'),
    el('label', { class: 'casilla', for: 'menos-animaciones' }, casilla, 'Menos animaciones (también se respeta la preferencia del sistema)'),
    el('p', { class: 'pista' }, 'Los controles de nota funcionan con teclado (flechas), con los botones − y + y arrastrando. La animación nunca es necesaria para saber si algo se guardó.'),

    el('h2', {}, 'Lugares y mapas'),
    el('p', {}, 'Las ubicaciones de la búsqueda externa proceden de ', fuenteLugares(config.lugares?.proveedor), '. Elegir un establecimiento no confirma que sirva tortilla ni una receta concreta. Las visitas y opiniones son las de tu grupo.'),
    el('p', { class: 'pista', style: { marginTop: '1.5rem' } }, `${config.nombreApp} · versión de trabajo · ${estado.config.demo ? 'modo demostración' : 'modo normal'}`)));
}
