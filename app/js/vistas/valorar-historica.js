import { el, debounce } from '../dom.js';
import { api, ErrorApi, mensajeDeError, esErrorRecuperable } from '../api.js';
import { persona } from '../estado.js';
import { navegar } from '../router.js';
import { crearNotaControl, medidorMmm, porcionJugosa } from '../componentes/nota-control.js';
import { grupoChips } from '../componentes/chips.js';
import { selectorBar } from '../componentes/selector-bar.js';
import { leerBorrador, guardarBorrador, borrarBorrador } from '../borradores.js';
import { formatearNota, notaDeVisita, fechaLocalHoy, formatearFecha } from '../formato.js';
import { tortilla, animoPorNota } from '../tortilla.js';
import { aviso, cargando, toast } from '../ui.js';
import { CRITERIOS, CEBOLLA, TIPO_CUAJADO, SAL, SAL_CHISPAS, TAMANO, FORMATO, ACOMPANAMIENTOS, INGREDIENTES, EMOJI_INGREDIENTE, TEXTOS } from '../etiquetas.js';

function formularioVacio() {
  return {
    opId: crypto.randomUUID(),
    editandoId: null,
    bar: null,
    nuevoBar: null,
    variedad: { cebolla: null, vegana: false, ingredientes: [] },
    fecha: fechaLocalHoy(),
    criterios: { patata: null, jugosidad: null, cuajado: null, sabor: null, presentacion: null },
    integracion: null,
    tipoCuajado: null,
    sal: null,
    tamano: null,
    formato: null,
    precio: '',
    acompanamientos: [],
    comentario: '',
    comentarioPrivado: false,
  };
}

function desdeDegustacion(d) {
  return {
    ...formularioVacio(),
    opId: d.opId || crypto.randomUUID(),
    editandoId: d.id,
    bar: d.bar,
    variedad: { cebolla: d.variedad.cebolla, vegana: d.variedad.vegana, ingredientes: [...d.variedad.ingredientes] },
    fecha: d.fecha,
    criterios: { ...d.criterios },
    integracion: d.integracion,
    tipoCuajado: d.tipoCuajado,
    sal: d.sal,
    tamano: d.tamano,
    formato: d.formato,
    precio: d.precio === null || d.precio === undefined ? '' : String(d.precio).replace('.', ','),
    acompanamientos: [...(d.acompanamientos || [])],
    comentario: d.comentario || '',
    comentarioPrivado: d.comentarioPrivado,
  };
}

export async function render(cont, params) {
  const yo = persona();
  const editarId = params.get('editar');
  const barId = params.get('bar');
  let f;
  let borradorPendiente = null;
  let borradorRecuperado = false;

  if (editarId) {
    cont.append(cargando('Cargando tu valoración…'));
    try {
      const { degustacion } = await api.get(`/api/degustaciones/${encodeURIComponent(editarId)}`);
      cont.replaceChildren();
      if (!degustacion.esMia) {
        cont.append(aviso('error', 'Solo puedes editar tus propias valoraciones.'));
        return;
      }
      f = desdeDegustacion(degustacion);
    } catch (error) {
      cont.replaceChildren(aviso('error', mensajeDeError(error, 'No se ha encontrado esa valoración.')));
      return;
    }
  } else {
    const borrador = leerBorrador(yo.id);
    if (borrador && !barId) {
      f = { ...formularioVacio(), ...borrador, editandoId: null };
      borradorRecuperado = true;
    } else {
      f = formularioVacio();
      if (borrador) borradorPendiente = borrador;
      if (barId) {
        try { f.bar = (await api.get(`/api/bares/${encodeURIComponent(barId)}`)).bar; } catch { /* se elegirá a mano */ }
      }
      if (params.get('vegana') === '1') f.variedad.vegana = true;
    }
  }
  construir(cont, f, { yo, borradorRecuperado, borradorPendiente });
}

function construir(cont, f, { yo, borradorRecuperado, borradorPendiente }) {
  const modoEdicion = !!f.editandoId;
  const guardarBorradorAhora = () => (modoEdicion ? false : guardarBorrador(yo.id, f));
  const guardarBorradorLuego = guardarBorradorAhora;
  const cambio = () => { guardarBorradorLuego(); actualizarNotaVisita(); };

  cont.replaceChildren();
  const zonaAvisos = el('div', { 'aria-live': 'polite' });
  cont.append(
    el('p', { style: { marginBottom: '.4rem' } }, modoEdicion ? el('a', { href: `#/bar/${encodeURIComponent(f.bar.id)}` }, '← Volver a la ficha') : el('a', { href: '#/' }, '← Inicio')),
    el('h1', {}, modoEdicion ? 'Corregir valoración' : '⭐ Puntúa esta tortilla'),
    el('p', { class: 'subtitulo', style: { marginBottom: '.75rem' } }, modoEdicion ? `Visita del ${formatearFecha(f.fecha)}. Corregir no crea otra visita.` : 'Cada visita cuenta. Si repites bar, será una degustación nueva.'),
    zonaAvisos);

  if (borradorRecuperado) {
    zonaAvisos.append(aviso('info', 'Hemos recuperado tu valoración sin terminar.', { acciones: el('button', { type: 'button', class: 'boton boton--pequeno boton--fantasma', onclick: () => { borrarBorrador(yo.id); navegar('/valorar', { reemplazar: true }); } }, 'Descartar y empezar de cero') }));
  } else if (borradorPendiente) {
    zonaAvisos.append(aviso('info', `Tienes una valoración sin terminar${borradorPendiente.bar ? ` de ${borradorPendiente.bar.nombre}` : ''}.`, { acciones: [
      el('button', { type: 'button', class: 'boton boton--pequeno', onclick: () => navegar('/valorar', { reemplazar: true }) }, 'Recuperarla'),
      el('button', { type: 'button', class: 'boton boton--pequeno boton--fantasma', onclick: () => { borrarBorrador(yo.id); zonaAvisos.replaceChildren(); toast('Borrador descartado.'); } }, 'Descartarla'),
    ] }));
  }

  /* 1. Dónde */
  const selector = selectorBar({ inicial: { bar: f.bar, nuevoBar: f.nuevoBar }, alCambiar: ({ bar, nuevoBar }) => { f.bar = bar; f.nuevoBar = nuevoBar; cambio(); } });
  const zonaConflicto = el('div', {});

  /* 2. Qué tortilla */
  const chipsCebolla = grupoChips({ nombre: 'Cebolla', valor: f.variedad.cebolla, permitirVacio: false, opciones: [
    { valor: 'con', etiqueta: CEBOLLA.con, emoji: '🧅' }, { valor: 'sin', etiqueta: CEBOLLA.sin, emoji: '🚫' }, { valor: 'no_se', etiqueta: CEBOLLA.no_se, emoji: '🤷' },
  ], alCambiar: (v) => { f.variedad.cebolla = v; cambio(); } });
  const chipVegana = grupoChips({ nombre: 'Receta vegana', valor: f.variedad.vegana ? 'si' : null, opciones: [{ valor: 'si', etiqueta: 'Receta vegana (sin huevo)', emoji: '🌿', clase: 'chip--vegana' }], alCambiar: (v) => { f.variedad.vegana = v === 'si'; cambio(); } });
  const otro = el('input', { type: 'text', id: 'otro-ingrediente', maxlength: '30', placeholder: 'Otro ingrediente y pulsa Intro', autocomplete: 'off' });
  const chipsIngredientes = grupoChips({ nombre: 'Ingredientes añadidos', multiple: true, valor: f.variedad.ingredientes, opciones: [
    ...INGREDIENTES.map((i) => ({ valor: i, etiqueta: i, emoji: EMOJI_INGREDIENTE[i] })),
    ...f.variedad.ingredientes.filter((i) => !INGREDIENTES.includes(i)).map((i) => ({ valor: i, etiqueta: i, emoji: '✨' })),
  ], alCambiar: (v) => { f.variedad.ingredientes = v; cambio(); } });
  const anadirOtro = () => {
    const valor = otro.value.trim().toLowerCase();
    if (!valor) return;
    if (!f.variedad.ingredientes.includes(valor)) {
      f.variedad.ingredientes = [...f.variedad.ingredientes, valor];
      chipsIngredientes.anadir({ valor, etiqueta: valor });
      chipsIngredientes.establecer(f.variedad.ingredientes);
      cambio();
    }
    otro.value = '';
  };
  otro.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); anadirOtro(); } });

  /* 3. Cuándo */
  const fecha = el('input', { type: 'date', id: 'fecha-visita', value: f.fecha, max: fechaLocalHoy(), required: true });
  fecha.addEventListener('change', () => { f.fecha = fecha.value; cambio(); });

  /* 4. Las cinco notas */
  const chipsTipoCuajado = grupoChips({ nombre: 'Cómo estaba de cuajada', valor: f.tipoCuajado, opciones: Object.entries(TIPO_CUAJADO).map(([valor, etiqueta]) => ({ valor, etiqueta })), alCambiar: (v) => { f.tipoCuajado = v; cambio(); } });
  const controles = {};
  const decoradores = { sabor: medidorMmm(), jugosidad: porcionJugosa() };
  for (const c of CRITERIOS) {
    controles[c.clave] = crearNotaControl({ clave: c.clave, etiqueta: c.etiqueta, emoji: c.emoji, ayuda: c.ayuda, valor: f.criterios[c.clave], decorador: decoradores[c.clave] || null, alCambiar: (v) => { f.criterios[c.clave] = v; cambio(); } });
  }
  const notaVisita = el('div', { class: 'nota-visita nota-visita--pendiente', 'aria-live': 'polite' });
  function actualizarNotaVisita() {
    const nota = notaDeVisita(f.criterios);
    if (nota === null) {
      const falta = CRITERIOS.find((c) => f.criterios[c.clave] === null);
      notaVisita.className = 'nota-visita nota-visita--pendiente';
      notaVisita.replaceChildren(el('div', { class: 'nota-visita__n' }, `Te falta puntuar ${falta.etiqueta.toLowerCase()}`), el('div', { class: 'nota-visita__l' }, 'Nota de la visita'));
      return;
    }
    notaVisita.className = 'nota-visita';
    notaVisita.replaceChildren(el('div', { class: 'nota-visita__n' }, formatearNota(nota), ' ', el('span', { 'aria-hidden': 'true' }, { triste: '💀', meh: '😐', feliz: '🙂', mmm: '😋', fiesta: '👑' }[animoPorNota(nota)])), el('div', { class: 'nota-visita__l' }, 'Nota de la visita · media de las cinco notas'));
  }
  actualizarNotaVisita();

  /* 5. Detalles opcionales */
  const integracion = crearNotaControl({ clave: 'integracion', etiqueta: 'Integración de ingredientes', emoji: '🧩', ayuda: '¿Qué tal encajan la patata, el huevo y el resto? Se muestra aparte; no entra en la nota de la visita.', valor: f.integracion, opcional: true, alCambiar: (v) => { f.integracion = v; cambio(); } });
  const chipsSal = grupoChips({ nombre: 'Punto de sal', valor: f.sal, opciones: Object.entries(SAL).map(([valor, etiqueta]) => ({ valor, etiqueta, extra: el('span', { class: 'sal-chispas', 'aria-hidden': 'true' }, ` ${SAL_CHISPAS[valor]}`) })), alCambiar: (v) => { f.sal = v; cambio(); } });
  const chipsTamano = grupoChips({ nombre: 'Tamaño de la ración', valor: f.tamano, opciones: Object.entries(TAMANO).map(([valor, etiqueta]) => ({ valor, etiqueta })), alCambiar: (v) => { f.tamano = v; cambio(); } });
  const chipsFormato = grupoChips({ nombre: 'Qué pediste', valor: f.formato, opciones: Object.entries(FORMATO).map(([valor, etiqueta]) => ({ valor, etiqueta })), alCambiar: (v) => { f.formato = v; cambio(); } });
  const precio = el('input', { type: 'text', id: 'precio', inputmode: 'decimal', value: f.precio, placeholder: '2,50', autocomplete: 'off' });
  precio.addEventListener('input', () => { f.precio = precio.value; cambio(); });
  const chipsAcomp = grupoChips({ nombre: 'Acompañamientos', multiple: true, valor: f.acompanamientos, opciones: Object.entries(ACOMPANAMIENTOS).map(([valor, etiqueta]) => ({ valor, etiqueta, emoji: { pan: '🥖', cafe: '☕', bebida: '🥤' }[valor] })), alCambiar: (v) => { f.acompanamientos = v; cambio(); } });
  const comentario = el('textarea', { id: 'comentario', maxlength: '600', placeholder: 'Algo que recordar: la cocinera, la hora, el pan…' }, f.comentario);
  comentario.addEventListener('input', () => { f.comentario = comentario.value; cambio(); });
  const privado = el('input', { type: 'checkbox', id: 'comentario-privado', checked: f.comentarioPrivado ? true : null });
  privado.addEventListener('change', () => { f.comentarioPrivado = privado.checked; cambio(); });

  /* Guardar */
  const zonaError = el('div', { 'aria-live': 'assertive' });
  const botonGuardar = el('button', { type: 'submit', class: 'boton boton--marron boton--bloque boton--grande' }, modoEdicion ? '💾 Guardar la corrección' : '🏆 Guardar valoración');

  const form = el('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('section', { class: 'bloque-formulario', 'aria-labelledby': 'b1' }, el('h2', { id: 'b1' }, el('span', { class: 'num', 'aria-hidden': 'true' }, '1'), '¿Dónde?'), selector.elemento, zonaConflicto),
    el('section', { class: 'bloque-formulario', 'aria-labelledby': 'b2' }, el('h2', { id: 'b2' }, el('span', { class: 'num', 'aria-hidden': 'true' }, '2'), '¿Qué tortilla?'),
      el('div', { class: 'campo' }, el('span', { class: 'campo__etiqueta' }, '🧅 Cebolla'), chipsCebolla.elemento),
      el('div', { class: 'campo' }, el('span', { class: 'campo__etiqueta' }, '🌿 Receta'), chipVegana.elemento, el('p', { class: 'campo__ayuda' }, 'Vegana es la receta; los ingredientes van aparte y pueden combinarse.')),
      el('div', { class: 'campo' }, el('label', { for: 'otro-ingrediente' }, '✨ Ingredientes añadidos'), chipsIngredientes.elemento, el('div', { class: 'campo-inline', style: { marginTop: '.5rem' } }, otro, el('button', { type: 'button', class: 'boton boton--pequeno boton--fantasma', onclick: anadirOtro }, 'Añadir')))),
    el('section', { class: 'bloque-formulario', 'aria-labelledby': 'b3' }, el('h2', { id: 'b3' }, el('span', { class: 'num', 'aria-hidden': 'true' }, '3'), '¿Cuándo?'),
      el('div', { class: 'campo' }, el('label', { for: 'fecha-visita' }, 'Fecha de la visita'), fecha, el('p', { class: 'campo__ayuda' }, 'Si la registras después, cámbiala al día que la probaste.'))),
    el('section', { class: 'bloque-formulario', 'aria-labelledby': 'b4' }, el('h2', { id: 'b4' }, el('span', { class: 'num', 'aria-hidden': 'true' }, '4'), 'Los cinco criterios originales'),
      el('p', { class: 'pista', style: { marginBottom: '.7rem' } }, 'De 1 a 10, en medios puntos. Nada viene puntuado de antemano: lo que no toques queda sin nota.'),
      controles.patata.elemento,
      controles.jugosidad.elemento,
      el('div', { class: 'campo', style: { marginBottom: '.5rem' } }, el('span', { class: 'campo__etiqueta' }, '🔥 ¿Cómo estaba de cuajada? (dato, no nota)'), chipsTipoCuajado.elemento),
      controles.cuajado.elemento,
      controles.sabor.elemento,
      controles.presentacion.elemento,
      notaVisita),
    el('section', { class: 'bloque-formulario', 'aria-labelledby': 'b5' }, el('h2', { id: 'b5' }, el('span', { class: 'num', 'aria-hidden': 'true' }, '5'), 'Detalles opcionales'),
      el('details', { class: 'detalles', open: (f.integracion !== null || f.sal || f.tamano || f.formato || f.precio || f.acompanamientos.length || f.comentario) ? true : null },
        el('summary', {}, '🧂 Sal, tamaño, precio, acompañamientos y notas'),
        integracion.elemento,
        el('div', { class: 'campo' }, el('span', { class: 'campo__etiqueta' }, '🧂 Punto de sal'), chipsSal.elemento, el('p', { class: 'campo__ayuda' }, 'Describe, no premia: más chispas no es mejor.')),
        el('div', { class: 'campo' }, el('span', { class: 'campo__etiqueta' }, '📏 Tamaño de la ración'), chipsTamano.elemento),
        el('div', { class: 'campo' }, el('span', { class: 'campo__etiqueta' }, '🍽️ Qué pediste'), chipsFormato.elemento),
        el('div', { class: 'campo' }, el('label', { for: 'precio' }, '💶 Precio (€)'), precio, el('p', { class: 'campo__ayuda' }, 'Lo que pagaste por ese formato. Si no lo sabes, déjalo vacío: no es cero.')),
        el('div', { class: 'campo' }, el('span', { class: 'campo__etiqueta' }, '☕ Acompañamientos'), chipsAcomp.elemento, el('p', { class: 'campo__ayuda' }, 'Pan y café no cambian la nota de la tortilla.')),
        el('div', { class: 'campo' }, el('label', { for: 'comentario' }, '📝 Comentario'), comentario),
        el('label', { class: 'casilla', for: 'comentario-privado' }, privado, 'Solo para mí (los demás no lo verán)'))),
    el('div', { class: 'acciones-fijas' }, zonaError, botonGuardar, modoEdicion ? el('div', { style: { marginTop: '.5rem', textAlign: 'center' } }, el('a', { class: 'enlace', href: `#/bar/${encodeURIComponent(f.bar.id)}` }, 'Cancelar')) : null));
  cont.append(form);

  function mostrarError(mensaje, { reintentar = false, enfocar = null } = {}) {
    zonaError.replaceChildren(aviso('error', mensaje, { acciones: reintentar ? el('button', { type: 'button', class: 'boton boton--pequeno', onclick: guardar }, 'Reintentar') : null }));
    if (enfocar) enfocar();
    else zonaError.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function validar() {
    const { bar, nuevoBar } = selector.obtener();
    if (!bar && !(nuevoBar && nuevoBar.nombre.trim().length >= 2)) return { mensaje: 'Elige el bar o crea uno nuevo con su nombre.', enfocar: () => selector.enfocar() };
    if (!f.variedad.cebolla) return { mensaje: 'Dinos si llevaba cebolla (o marca «No me fijé»).', enfocar: () => chipsCebolla.enfocar() };
    if (!f.fecha) return { mensaje: 'Falta la fecha de la visita.', enfocar: () => fecha.focus() };
    for (const c of CRITERIOS) {
      if (f.criterios[c.clave] === null) {
        controles[c.clave].marcarError(true);
        return { mensaje: `Te falta puntuar ${c.etiqueta.toLowerCase()}.`, enfocar: () => { controles[c.clave].elemento.scrollIntoView({ block: 'center', behavior: 'smooth' }); controles[c.clave].enfocar(); } };
      }
    }
    if (f.precio !== '' && (!Number.isFinite(Number(String(f.precio).replace(',', '.'))) || Number(String(f.precio).replace(',', '.')) <= 0)) return { mensaje: 'El precio debe ser un importe mayor que cero, o dejarlo vacío.', enfocar: () => precio.focus() };
    return null;
  }

  function cuerpoPeticion(barId) {
    return {
      barId,
      variedad: { ...f.variedad },
      fecha: f.fecha,
      criterios: { ...f.criterios },
      integracion: f.integracion,
      tipoCuajado: f.tipoCuajado,
      sal: f.sal,
      tamano: f.tamano,
      formato: f.formato,
      precio: f.precio === '' ? null : Number(String(f.precio).replace(',', '.')),
      acompanamientos: f.acompanamientos,
      comentario: f.comentario.trim() || null,
      comentarioPrivado: f.comentarioPrivado,
    };
  }

  async function guardar(forzarBar = false) {
    zonaError.replaceChildren();
    const problema = validar();
    if (problema) { mostrarError(problema.mensaje, { enfocar: problema.enfocar }); return; }
    botonGuardar.disabled = true;
    botonGuardar.textContent = 'Guardando…';
    try {
      const { bar, nuevoBar } = selector.obtener();
      guardarBorradorAhora();
      const cuerpo = { ...cuerpoPeticion(bar?.id || null), nuevoBar: bar ? null : nuevoBar, forzarBar, versionNota: 1 };
      const resultado = modoEdicion
        ? await api.patch(`/api/degustaciones/${encodeURIComponent(f.editandoId)}`, cuerpo)
        : await api.post('/api/degustaciones', { opId: f.opId, ...cuerpo });
      if (!modoEdicion) borrarBorrador(yo.id);
      celebrar(resultado.degustacion, { repetida: !!resultado.repetida });
    } catch (error) {
      if (error instanceof ErrorApi && error.estado === 409) {
        zonaConflicto.replaceChildren(aviso('nota', error.message, { acciones: [
          ...(error.datos.sugerencias || []).map((b) => el('button', { type: 'button', class: 'boton boton--pequeno', onclick: () => { selector.establecerBar(b); zonaConflicto.replaceChildren(); guardar(); } }, `Usar «${b.nombre}»${b.zona ? ` (${b.zona})` : ''}`)),
          el('button', { type: 'button', class: 'boton boton--pequeno boton--fantasma', onclick: () => guardar(true) }, 'Es otro distinto: crearlo'),
        ] }));
        zonaConflicto.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      else if (error instanceof ErrorApi && error.estado === 400) {
        const control = error.campo && controles[error.campo];
        control?.marcarError(true);
        mostrarError(error.message, { enfocar: control ? () => { control.elemento.scrollIntoView({ block: 'center' }); control.enfocar(); } : null });
      } else if (esErrorRecuperable(error)) {
        const conservado = modoEdicion ? true : guardarBorradorAhora();
        mostrarError(conservado ? (modoEdicion ? 'No se ha podido guardar la corrección. Lo escrito sigue en pantalla: puedes reintentar.' : TEXTOS.errorGuardado) : TEXTOS.errorGuardadoSinBorrador, { reintentar: true });
      } else {
        mostrarError(mensajeDeError(error), { reintentar: true });
      }
    } finally {
      botonGuardar.disabled = false;
      botonGuardar.textContent = modoEdicion ? '💾 Guardar la corrección' : '🏆 Guardar valoración';
    }
  }

  function celebrar(d, { repetida }) {
    const titulo = el('h2', { tabindex: '-1' }, modoEdicion ? 'Valoración corregida. Las medias ya están al día.' : TEXTOS.guardado);
    cont.replaceChildren(el('div', { class: 'celebracion' },
      tortilla({ animo: 'fiesta', tamano: 180, clase: 'tortilla--rebota' }),
      titulo,
      repetida ? el('p', { class: 'pista' }, 'Esta valoración ya se había guardado antes; no la hemos duplicado.') : null,
      el('div', { class: 'nota-grande' }, formatearNota(d.nota)),
      el('p', {}, el('strong', {}, d.bar.nombre), ` · ${d.variedad.vegana ? '🌿 ' : ''}${d.variedad.nombre} · ${formatearFecha(d.fecha)}`),
      el('div', { class: 'fila-botones', style: { justifyContent: 'center' } },
        el('a', { class: 'boton', href: `#/bar/${encodeURIComponent(d.bar.id)}` }, 'Ver la ficha del bar'),
        el('a', { class: 'boton boton--fantasma', href: '#/valorar', onclick: (e) => { e.preventDefault(); navegar('/valorar', { reemplazar: true }); } }, 'Puntuar otra tortilla'),
        el('a', { class: 'boton boton--fantasma', href: '#/historial' }, 'Ir al historial'))));
    window.scrollTo({ top: 0 });
    titulo.focus();
  }
}
