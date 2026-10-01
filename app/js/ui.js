import { el, vaciar } from './dom.js';
import { formatearNota, formatearNotaCorta, formatearFecha, formatearPrecio, plural } from './formato.js';
import { tortilla, animoPorNota } from './tortilla.js';
import { CEBOLLA_CORTA, TIPO_CUAJADO, SAL, SAL_CHISPAS, TAMANO, FORMATO, ACOMPANAMIENTOS, EMOJI_INGREDIENTE, TEXTOS, CRITERIOS, ASPECTOS } from './etiquetas.js';

let temporizadorToast;
export function toast(mensaje, { duracion = 3000 } = {}) {
  const nodo = document.getElementById('toast');
  if (!nodo) return;
  nodo.textContent = mensaje;
  nodo.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => nodo.classList.remove('visible'), duracion);
}

export function cargando(texto = 'Cargando…') {
  return el('div', { class: 'cargando', role: 'status' }, tortilla({ animo: 'feliz', tamano: 72, clase: 'tortilla--girando' }), texto);
}

export function estadoVacio({ titulo, texto, animo = 'duda', accion = null }) {
  return el('div', { class: 'estado-vacio tarjeta tarjeta--suave' },
    tortilla({ animo, tamano: 110 }),
    el('h3', {}, titulo),
    texto ? el('p', {}, texto) : null,
    accion);
}

export function aviso(tipo, contenido, { acciones = null } = {}) {
  const iconos = { error: '⚠️', exito: '✅', info: 'ℹ️', nota: '📝' };
  return el('div', { class: `aviso aviso--${tipo}`, role: tipo === 'error' ? 'alert' : 'status' },
    el('span', { 'aria-hidden': 'true' }, iconos[tipo] || ''),
    el('div', { style: { flex: '1 1 auto' } }, contenido, acciones ? el('div', { class: 'fila-botones' }, acciones) : null));
}

export function textoAmbito(ambito) {
  if (!ambito) return null;
  return el('span', { class: 'etiqueta-ambito' },
    `Grupo: ${ambito.etiqueta}`,
    ambito.demo ? el('span', { class: 'etiqueta-demo' }, TEXTOS.demo) : null);
}

function textoPersonas(n) {
  return `${n} ${plural(n, 'persona', 'personas')}`;
}

/** Las dos medias pedidas, una junto a otra, con recuentos. La global va aparte y con menor peso. */
export function tarjetaMedias(medias, { mostrarGlobal = true, etiquetaFiltro = null } = {}) {
  const tu = medias.tu;
  const demas = medias.demas;
  const cont = el('div', {});
  const grid = el('div', { class: 'medias' },
    el('div', { class: 'media-tarjeta media-tarjeta--tu' },
      el('div', { class: 'media-tarjeta__titulo' }, TEXTOS.tuMedia),
      tu.media === null
        ? el('div', { class: 'media-tarjeta__vacio' }, TEXTOS.sinMediaPropia)
        : el('div', { class: 'media-tarjeta__valor' }, formatearNota(tu.media), el('small', {}, ' / 10')),
      tu.media === null ? null : el('div', { class: 'media-tarjeta__pie' }, `${tu.visitas} ${plural(tu.visitas, 'visita', 'visitas')}`)),
    el('div', { class: 'media-tarjeta media-tarjeta--demas' },
      el('div', { class: 'media-tarjeta__titulo' }, TEXTOS.losDemas),
      demas.media === null
        ? el('div', { class: 'media-tarjeta__vacio' }, TEXTOS.sinOtras)
        : el('div', { class: 'media-tarjeta__valor' }, formatearNota(demas.media), el('small', {}, ' / 10')),
      demas.media === null ? null : el('div', { class: 'media-tarjeta__pie' }, `${demas.valoraciones} ${plural(demas.valoraciones, 'valoración', 'valoraciones')} de ${textoPersonas(demas.personas)}`)));
  cont.append(grid);
  if (mostrarGlobal && medias.global.media !== null) {
    cont.append(el('p', { class: 'media-global' },
      `Media global (todas las visitas${etiquetaFiltro ? `, ${etiquetaFiltro}` : ''}): `,
      el('strong', {}, formatearNota(medias.global.media)),
      ` · ${medias.global.valoraciones} ${plural(medias.global.valoraciones, 'valoración', 'valoraciones')} de ${textoPersonas(medias.global.personas)}`));
  }
  return cont;
}

/** Versión compacta para listas y ranking. */
export function mediasCompactas(medias, { perspectiva = 'demas' } = {}) {
  const tu = medias.tu.media === null ? TEXTOS.sinMediaPropia : `${formatearNota(medias.tu.media)} · ${medias.tu.visitas} ${plural(medias.tu.visitas, 'visita', 'visitas')}`;
  const demas = medias.demas.media === null ? TEXTOS.sinOtras : `${formatearNota(medias.demas.media)} · ${medias.demas.valoraciones} ${plural(medias.demas.valoraciones, 'valoración', 'valoraciones')} de ${textoPersonas(medias.demas.personas)}`;
  const fila = el('div', { class: 'medias--compactas' },
    el('span', { class: 'm-tu' }, `${TEXTOS.tuMedia}: `, medias.tu.media === null ? tu : el('strong', {}, formatearNota(medias.tu.media)), medias.tu.media === null ? '' : ` · ${medias.tu.visitas} ${plural(medias.tu.visitas, 'visita', 'visitas')}`),
    el('span', { class: 'm-demas' }, `${TEXTOS.losDemas}: `, medias.demas.media === null ? demas : el('strong', {}, formatearNota(medias.demas.media)), medias.demas.media === null ? '' : ` · ${medias.demas.valoraciones} ${plural(medias.demas.valoraciones, 'valoración', 'valoraciones')} de ${textoPersonas(medias.demas.personas)}`));
  if (perspectiva === 'global' && medias.global.media !== null) {
    fila.append(el('span', { class: 'm-global' }, 'Global: ', el('strong', {}, formatearNota(medias.global.media)), ` · ${medias.global.valoraciones}`));
  }
  return fila;
}

export function chipVariedad(variedad, { pequeno = true } = {}) {
  const clases = ['chip', 'chip--info', pequeno ? 'chip--pequeno' : '', variedad.vegana ? 'chip--vegana' : ''].join(' ');
  return el('span', { class: clases }, variedad.vegana ? '🌿 ' : '', variedad.nombre);
}

export function nombreVariedadCorto(variedad) {
  return variedad.nombre;
}

/** Tarjeta de visita reutilizada en ficha e historial. */
export function tarjetaVisita(d, { mostrarBar = false, alEditar = null, alRetirar = null } = {}) {
  const detalles = [];
  if (d.tipoCuajado) detalles.push(el('span', { class: 'chip chip--info chip--pequeno' }, `🔥 ${TIPO_CUAJADO[d.tipoCuajado]}`));
  if (d.sal) detalles.push(el('span', { class: 'chip chip--info chip--pequeno', title: `Sal: ${SAL[d.sal]}` }, `🧂 ${SAL[d.sal]} `, el('span', { class: 'sal-chispas', 'aria-hidden': 'true' }, SAL_CHISPAS[d.sal])));
  if (d.tamano) detalles.push(el('span', { class: 'chip chip--info chip--pequeno' }, `📏 ${TAMANO[d.tamano]}`));
  if (d.precio !== null && d.precio !== undefined) detalles.push(el('span', { class: 'chip chip--info chip--pequeno' }, `💶 ${formatearPrecio(d.precio)}${d.formato ? ` · ${FORMATO[d.formato]}` : ''}`));
  else if (d.formato) detalles.push(el('span', { class: 'chip chip--info chip--pequeno' }, `🍽️ ${FORMATO[d.formato]}`));
  if (d.acompanamientos?.length) detalles.push(el('span', { class: 'chip chip--info chip--pequeno' }, `☕ ${d.acompanamientos.map((a) => ACOMPANAMIENTOS[a] || a).join(' + ')}`));
  if (d.integracion !== null && d.integracion !== undefined) detalles.push(el('span', { class: 'chip chip--info chip--pequeno' }, `🧩 Integración ${formatearNotaCorta(d.integracion)}`));
  if (d.origen && d.origen.startsWith('importacion')) detalles.push(el('span', { class: 'chip chip--info chip--pequeno' }, '📥 Importada'));

  const criterios = el('div', { class: 'visita__criterios' },
    (d.versionNota === 2 ? ASPECTOS : CRITERIOS).filter((c) => d.criterios[c.clave] != null).map((c) => el('span', {}, `${c.etiqueta} `, el('b', {}, formatearNotaCorta(d.criterios[c.clave])))));

  const acciones = d.esMia && (alEditar || alRetirar)
    ? el('div', { class: 'visita__acciones' },
      alEditar ? el('button', { type: 'button', class: 'boton boton--pequeno boton--fantasma', onclick: () => alEditar(d) }, '✏️ Editar') : null,
      alRetirar ? el('button', { type: 'button', class: 'boton boton--pequeno boton--peligro', onclick: () => alRetirar(d) }, 'Retirar') : null)
    : null;

  return el('article', { class: `visita${d.esMia ? ' visita--mia' : ''}`, 'aria-label': `Visita de ${d.esMia ? 'ti' : d.autor.nombre} el ${formatearFecha(d.fecha)}` },
    el('div', { class: 'visita__cabecera' },
      el('div', { class: 'visita__nota', title: 'Nota de la visita' }, formatearNota(d.nota), el('small', {}, d.versionNota === 2 ? 'general' : 'histórica')),
      el('div', { style: { flex: '1 1 auto', minWidth: '0' } },
        el('div', { class: 'visita__quien' }, d.esMia ? 'Tú' : d.autor.nombre, el('span', { class: 'visita__meta' }, ` · ${formatearFecha(d.fecha)}`)),
        el('div', { class: 'visita__meta' },
          mostrarBar ? [el('a', { href: `#/bar/${encodeURIComponent(d.bar.id)}` }, d.bar.nombre), d.bar.zona ? ` · ${d.bar.zona}` : '', ' · '] : null,
          d.variedad.vegana ? '🌿 ' : '', d.variedad.nombre))),
    d.versionNota === 1 ? el('p', { class: 'pista metodo-historico' }, 'Histórica · media de los cinco criterios originales') : null,
    (criterios.childElementCount || detalles.length) ? el('details', { class: 'visita-extra' }, el('summary', {}, 'Ver detalles de la visita'), criterios, detalles.length ? el('div', { class: 'visita__detalles' }, detalles) : null) : null,
    d.comentario ? el('p', { class: 'visita__comentario' }, `“${d.comentario}”`, d.comentarioPrivado ? el('span', { class: 'chip chip--privado chip--pequeno', style: { marginLeft: '.4rem' } }, 'solo lo ves tú') : null) : null,
    acciones);
}

/** Diálogo de confirmación accesible; devuelve el foco al cerrarse. */
export function confirmar({ titulo, texto, aceptar = 'Sí, adelante', cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolver) => {
    const anterior = document.activeElement;
    const dialogo = el('dialog', { class: 'dialogo', 'aria-labelledby': 'dialogo-titulo' });
    const botonAceptar = el('button', { type: 'button', class: `boton ${peligro ? 'boton--peligro' : ''}` }, aceptar);
    const botonCancelar = el('button', { type: 'button', class: 'boton boton--fantasma' }, cancelar);
    dialogo.append(el('h2', { id: 'dialogo-titulo' }, titulo), texto ? el('p', {}, texto) : null, el('div', { class: 'fila-botones' }, botonCancelar, botonAceptar));
    const cerrar = (valor) => {
      dialogo.close();
      dialogo.remove();
      anterior?.focus?.();
      resolver(valor);
    };
    botonAceptar.addEventListener('click', () => cerrar(true));
    botonCancelar.addEventListener('click', () => cerrar(false));
    dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(false); });
    document.body.append(dialogo);
    dialogo.showModal();
    botonCancelar.focus();
  });
}

export function encabezado(titulo, { subtitulo = null, acciones = null, ambito = null } = {}) {
  return el('div', { class: 'seccion__cabecera' },
    el('div', {}, el('h1', {}, titulo), subtitulo ? el('p', { class: 'subtitulo' }, subtitulo) : null, ambito ? el('div', { style: { marginTop: '.3rem' } }, textoAmbito(ambito)) : null),
    acciones);
}

export function ingredienteConEmoji(nombre) {
  return `${EMOJI_INGREDIENTE[nombre] ? `${EMOJI_INGREDIENTE[nombre]} ` : ''}${nombre}`;
}

export function descripcionVariedad(v) {
  return `${v.vegana ? 'vegana, ' : ''}${CEBOLLA_CORTA[v.cebolla] || ''}${v.ingredientes?.length ? `, ${v.ingredientes.join(', ')}` : ''}`;
}

export { formatearNota, formatearNotaCorta, formatearFecha, animoPorNota, vaciar };
