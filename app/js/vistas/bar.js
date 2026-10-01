import { el } from '../dom.js';
import { api, mensajeDeError } from '../api.js';
import { navegar, volverALista, ruta as construirRuta } from '../router.js';
import { tarjetaMedias, tarjetaVisita, estadoVacio, aviso, cargando, confirmar, toast, formatearNota, formatearFecha, textoAmbito } from '../ui.js';
import { estado } from '../estado.js';
import { plural } from '../formato.js';
import { TEXTOS } from '../etiquetas.js';
import { fuenteLugares } from '../componentes/fuente-lugares.js';

export async function render(cont, params, { id, signal }) {
  const filtro = { metodo: params.get('metodo') === 'historica' ? 'historica' : 'general', variedad: params.get('variedad') || null, desde: params.get('desde') || null, hasta: params.get('hasta') || null };
  const cabecera = el('div', {});
  const cuerpo = el('div', { 'aria-live': 'polite' });
  cont.append(cabecera, cuerpo);

  let revision = 0;
  async function cargar() {
    if (signal?.aborted) return;
    const turno = ++revision;
    cuerpo.replaceChildren(cargando('Calculando medias…'));
    const consulta = new URLSearchParams({ metodo: filtro.metodo });
    if (filtro.variedad) consulta.set('variedad', filtro.variedad);
    if (filtro.desde) consulta.set('desde', filtro.desde);
    if (filtro.hasta) consulta.set('hasta', filtro.hasta);
    history.replaceState(null, '', construirRuta(`/bar/${encodeURIComponent(id)}`, filtro));
    let datos;
    try {
      datos = await api.get(`/api/bares/${encodeURIComponent(id)}${consulta.toString() ? `?${consulta}` : ''}`);
    } catch (error) {
      if (signal?.aborted || turno !== revision) return;
      cuerpo.replaceChildren(error.estado === 404
        ? estadoVacio({ titulo: 'Ese bar no existe', texto: 'Puede que se haya escrito mal el enlace.', accion: el('a', { class: 'boton boton--pequeno', href: '#/bares' }, 'Ver todos los bares') })
        : aviso('error', mensajeDeError(error), { acciones: el('button', { type: 'button', class: 'boton boton--pequeno', onclick: cargar }, 'Reintentar') }));
      return;
    }
    if (!signal?.aborted && turno === revision) pintar(datos);
  }

  function pintar(datos) {
    const { bar, medias, mediasGenerales, variedades, visitas, ambito } = datos;
    const lugar = [bar.zona, bar.ciudad].filter(Boolean).join(' · ');
    const tieneVisitasPropias = visitas.some((v) => v.esMia);

    cabecera.replaceChildren(
      el('p', { style: { marginBottom: '.4rem' } }, el('a', { href: volverALista().href }, `← ${volverALista().texto}`)),
      el('div', { class: 'ficha__cabecera' },
        el('div', { style: { flex: '1 1 60%' } },
          el('h1', {}, bar.nombre, bar.esDemo ? el('span', { class: 'etiqueta-demo', style: { marginLeft: '.5rem', verticalAlign: 'middle' } }, 'demo') : null),
          el('div', { class: 'ficha__meta' },
            lugar ? el('span', {}, `📍 ${lugar}`) : el('span', {}, 'Sin zona indicada'),
            bar.direccion ? el('span', {}, bar.direccion) : null,
            bar.lat !== null && bar.lng !== null ? el('a', { href: `#/mapa?bar=${encodeURIComponent(bar.id)}` }, 'Ver en el mapa') : el('span', { class: 'pista' }, 'Ubicación pendiente')),
          el('div', { style: { marginTop: '.3rem' } }, textoAmbito(ambito)), bar.fuente ? el('p', { class: 'atribucion' }, fuenteLugares(bar.fuente)) : null),
        el('div', { class: 'fila-botones' },
          el('a', { class: 'boton', href: `#/valorar?bar=${encodeURIComponent(bar.id)}` }, tieneVisitasPropias ? 'Volver a puntuar' : 'Puntuar aquí'),
          (datos.puedeEditarBar ?? (estado.config.auth !== 'firebase')) ? el('button', { type: 'button', class: 'boton boton--pequeno boton--fantasma', onclick: () => editarBar(bar) }, 'Editar bar') : null)));

    const filtroActivo = datos.filtro.activo;
    const variedadFiltrada = filtro.variedad ? variedades.find((v) => v.id === filtro.variedad) : null;
    const descripcionFiltro = [
      variedadFiltrada ? `variedad «${variedadFiltrada.nombre}»` : null,
      filtro.desde ? `desde el ${formatearFecha(filtro.desde)}` : null,
      filtro.hasta ? `hasta el ${formatearFecha(filtro.hasta)}` : null,
    ].filter(Boolean).join(' · ');

    const bloqueMedias = el('section', { class: 'seccion', 'aria-label': 'Medias del bar' },
      filtroActivo ? aviso('nota', el('span', {}, 'Mostrando solo: ', el('strong', {}, descripcionFiltro), '. Ambas medias usan el mismo conjunto filtrado.'), { acciones: el('button', { type: 'button', class: 'boton boton--pequeno boton--fantasma', onclick: () => { filtro.variedad = null; filtro.desde = null; filtro.hasta = null; cargar(); } }, 'Quitar filtros') }) : null,
      el('div', { style: { marginTop: filtroActivo ? '.75rem' : 0 } }, tarjetaMedias(medias, { etiquetaFiltro: filtroActivo ? 'con el filtro' : null })),
      !tieneVisitasPropias ? el('p', { class: 'pista', style: { marginTop: '.5rem' } }, `${TEXTOS.primeraVisita}. Cuando la puntúes, tu media aparecerá aquí.`) : null,
      filtroActivo ? el('div', { class: 'tarjeta tarjeta--suave', style: { marginTop: '.75rem' } },
        el('h3', {}, 'Media general del bar (sin filtro)'),
        el('div', { class: 'medias--compactas', style: { marginTop: '.4rem' } },
          el('span', { class: 'm-tu' }, `Tu media: `, mediasGenerales.tu.media === null ? TEXTOS.sinMediaPropia : el('strong', {}, formatearNota(mediasGenerales.tu.media)), mediasGenerales.tu.media === null ? '' : ` · ${mediasGenerales.tu.visitas} ${plural(mediasGenerales.tu.visitas, 'visita', 'visitas')}`),
          el('span', { class: 'm-demas' }, `Los demás: `, mediasGenerales.demas.media === null ? TEXTOS.sinOtras : el('strong', {}, formatearNota(mediasGenerales.demas.media)), mediasGenerales.demas.media === null ? '' : ` · ${mediasGenerales.demas.valoraciones} ${plural(mediasGenerales.demas.valoraciones, 'valoración', 'valoraciones')}`))) : null);

    // Filtros: variedad y fechas
    const chipsVariedad = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por variedad' },
      el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!filtro.variedad), onclick: () => { filtro.variedad = null; cargar(); } }, 'Todas las variedades'),
      variedades.map((v) => el('button', { type: 'button', class: `chip ${v.vegana ? 'chip--vegana' : ''}`, 'aria-pressed': String(filtro.variedad === v.id), onclick: () => { filtro.variedad = filtro.variedad === v.id ? null : v.id; cargar(); } }, v.vegana ? '🌿 ' : '', v.nombre)));
    const desde = el('input', { type: 'date', id: 'filtro-desde', value: filtro.desde || '', max: filtro.hasta || undefined });
    const hasta = el('input', { type: 'date', id: 'filtro-hasta', value: filtro.hasta || '', min: filtro.desde || undefined });
    const formFechas = el('form', { class: 'filtro-fechas', onsubmit: (e) => { e.preventDefault(); if (desde.value && hasta.value && desde.value > hasta.value) { toast('«Desde» no puede ser posterior a «hasta».'); return; } filtro.desde = desde.value || null; filtro.hasta = hasta.value || null; cargar(); } },
      el('div', { class: 'campo' }, el('label', { for: 'filtro-desde' }, 'Desde'), desde),
      el('div', { class: 'campo' }, el('label', { for: 'filtro-hasta' }, 'Hasta'), hasta),
      el('button', { type: 'submit', class: 'boton boton--pequeno boton--fantasma' }, 'Aplicar fechas'));
    const bloqueFiltros = el('section', { class: 'seccion', 'aria-labelledby': 'filtros-titulo' },
      el('h2', { id: 'filtros-titulo' }, 'Ver por variedad o fechas'),
      el('p', { class: 'pista', style: { margin: '.3rem 0 .6rem' } }, 'El filtro se aplica por igual a «Tu media» y «Los demás». La media general del bar sigue visible.'),
      chipsVariedad,
      el('div', { style: { marginTop: '.75rem' } }, formFechas));

    // Variedades con sus medias
    const bloqueVariedades = el('section', { class: 'seccion', 'aria-labelledby': 'variedades-titulo' },
      el('h2', { id: 'variedades-titulo' }, 'Variedades de este bar'),
      variedades.length
        ? el('div', { class: 'lista', style: { marginTop: '.6rem' } }, variedades.map((v) => el('div', { class: 'variedad-fila' },
          el('div', {}, el('strong', {}, v.vegana ? '🌿 ' : '', v.nombre), v.ingredientes.length ? el('div', { class: 'pista' }, v.ingredientes.join(', ')) : null),
          el('div', { class: 'medias--compactas' },
            el('span', { class: 'm-tu' }, 'Tú: ', v.medias.tu.media === null ? '—' : el('strong', {}, formatearNota(v.medias.tu.media)), v.medias.tu.media === null ? '' : ` (${v.medias.tu.visitas})`),
            el('span', { class: 'm-demas' }, 'Los demás: ', v.medias.demas.media === null ? '—' : el('strong', {}, formatearNota(v.medias.demas.media)), v.medias.demas.media === null ? '' : ` (${v.medias.demas.valoraciones})`)))))
        : el('p', { class: 'pista' }, 'Todavía no hay variedades registradas: se crean al puntuar.'));

    // Visitas
    const bloqueVisitas = el('section', { class: 'seccion', 'aria-labelledby': 'visitas-titulo' },
      el('div', { class: 'seccion__cabecera' }, el('h2', { id: 'visitas-titulo' }, `Visitas (${visitas.length})`), el('span', { class: 'pista' }, 'Todas cuentan, también las repetidas')),
      visitas.length
        ? el('div', { class: 'lista' }, visitas.map((d) => tarjetaVisita(d, {
          alEditar: (v) => navegar(`/valorar?editar=${encodeURIComponent(v.id)}`),
          alRetirar: async (v) => {
            const ok = await confirmar({ titulo: '¿Retirar esta valoración?', texto: `Dejará de contar en tus medias y en las de los demás. Visita del ${formatearFecha(v.fecha)}.`, aceptar: 'Sí, retirarla', peligro: true });
            if (!ok) return;
            try { await api.del(`/api/degustaciones/${encodeURIComponent(v.id)}`); toast('Valoración retirada. Ya no cuenta en las medias.'); cargar(); }
            catch (error) { toast(mensajeDeError(error)); }
          },
        })))
        : estadoVacio({ titulo: filtroActivo ? 'Ninguna visita con ese filtro' : 'Todavía nadie ha puntuado aquí', texto: filtroActivo ? 'Prueba a quitar el filtro.' : '¿Te animas a estrenarlo?', accion: filtroActivo ? null : el('a', { class: 'boton boton--pequeno', href: `#/valorar?bar=${encodeURIComponent(bar.id)}` }, 'Puntuar aquí') }));

    const metodo = el('div', { class: 'metodo-medias' }, el('p', { class: 'eyebrow' }, filtro.metodo === 'historica' ? 'MEDIA HISTÓRICA · CINCO CRITERIOS' : 'NOTAS GENERALES'),
      datos.mediasHistoricas.global.valoraciones ? el('button', { class: 'enlace', onclick: () => { filtro.metodo = filtro.metodo === 'general' ? 'historica' : 'general'; cargar(); } }, filtro.metodo === 'general' ? 'Consultar las medias históricas' : 'Volver a las notas generales') : null);
    const detallesFicha = el('details', { class: 'detalle-visita', open: filtroActivo }, el('summary', {}, 'Explorar recetas y fechas'), bloqueFiltros, bloqueVariedades);
    cuerpo.replaceChildren(metodo, bloqueMedias, detallesFicha, bloqueVisitas);
  }

  function editarBar(bar) {
    const campos = {
      nombre: el('input', { type: 'text', id: 'editar-nombre', value: bar.nombre, required: true, maxlength: '80' }),
      zona: el('input', { type: 'text', id: 'editar-zona', value: bar.zona || '', maxlength: '80' }),
      ciudad: el('input', { type: 'text', id: 'editar-ciudad', value: bar.ciudad || '', maxlength: '80' }),
      direccion: el('input', { type: 'text', id: 'editar-direccion', value: bar.direccion || '', maxlength: '160' }),
      lat: el('input', { type: 'text', id: 'editar-lat', value: bar.lat ?? '', inputmode: 'decimal', placeholder: '43.2630' }),
      lng: el('input', { type: 'text', id: 'editar-lng', value: bar.lng ?? '', inputmode: 'decimal', placeholder: '-2.9350' }),
    };
    const error = el('div', { 'aria-live': 'assertive' });
    const form = el('form', { class: 'tarjeta', style: { marginTop: '.75rem' }, onsubmit: async (e) => {
      e.preventDefault();
      const cuerpoPeticion = {
        nombre: campos.nombre.value, zona: campos.zona.value, ciudad: campos.ciudad.value, direccion: campos.direccion.value,
        lat: campos.lat.value.trim() === '' ? null : Number(campos.lat.value.replace(',', '.')),
        lng: campos.lng.value.trim() === '' ? null : Number(campos.lng.value.replace(',', '.')),
      };
      try { await api.patch(`/api/bares/${encodeURIComponent(bar.id)}`, cuerpoPeticion); toast('Bar actualizado. Sus visitas siguen en su sitio.'); form.remove(); cargar(); }
      catch (err) { error.replaceChildren(aviso('error', mensajeDeError(err))); }
    } },
      el('h2', {}, 'Editar el bar'),
      el('p', { class: 'pista', style: { margin: '.3rem 0 .8rem' } }, 'Corregir el nombre o la zona no borra ni mueve ninguna visita.'),
      error,
      el('div', { class: 'campo' }, el('label', { for: 'editar-nombre' }, 'Nombre'), campos.nombre),
      el('div', { class: 'campo' }, el('label', { for: 'editar-zona' }, 'Barrio o zona'), campos.zona),
      el('div', { class: 'campo' }, el('label', { for: 'editar-ciudad' }, 'Ciudad'), campos.ciudad),
      el('div', { class: 'campo' }, el('label', { for: 'editar-direccion' }, 'Dirección'), campos.direccion),
      el('div', { class: 'campo-inline' },
        el('div', { class: 'campo', style: { flex: 1 } }, el('label', { for: 'editar-lat' }, 'Latitud'), campos.lat),
        el('div', { class: 'campo', style: { flex: 1 } }, el('label', { for: 'editar-lng' }, 'Longitud'), campos.lng)),
      el('p', { class: 'campo__ayuda', style: { marginBottom: '.8rem' } }, 'Las coordenadas son opcionales y sirven para situarlo en el mapa.'),
      el('div', { class: 'fila-botones' }, el('button', { type: 'submit', class: 'boton' }, 'Guardar cambios'), el('button', { type: 'button', class: 'boton boton--fantasma', onclick: () => form.remove() }, 'Cancelar')));
    cabecera.append(form);
    campos.nombre.focus();
  }

  await cargar();
}
