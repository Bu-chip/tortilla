import { el } from '../dom.js';
import { api, mensajeDeError } from '../api.js';
import { persona } from '../estado.js';
import { navegar } from '../router.js';
import { crearNotaControl, medidorMmm } from '../componentes/nota-control.js';
import { grupoChips } from '../componentes/chips.js';
import { selectorBar } from '../componentes/selector-bar.js';
import { leerBorrador, guardarBorrador, borrarBorrador } from '../borradores.js';
import { fechaLocalHoy, formatearFecha, formatearNotaCorta } from '../formato.js';
import { tortilla } from '../tortilla.js';
import { aviso, confirmar } from '../ui.js';
import { ASPECTOS, TIPO_CUAJADO, SAL, TAMANO, FORMATO, ACOMPANAMIENTOS, INGREDIENTES } from '../etiquetas.js';

const vacio = () => ({ versionNota: 2, opId: crypto.randomUUID(), bar: null, nuevoBar: null, notaGeneral: null,
  variedad: { cebolla: 'no_se', vegana: false, ingredientes: [] }, fecha: fechaLocalHoy(), criterios: {},
  tipoCuajado: null, sal: null, tamano: null, formato: null, precio: '', acompanamientos: [], comentario: '', comentarioPrivado: false });

export async function render(cont, params) {
  const yo = persona();
  const editar = params.get('editar');
  const claveBorrador = editar ? `${yo.id}:editar:${editar}` : yo.id;
  const borrador = leerBorrador(claveBorrador);
  let f = vacio();
  if (editar) {
    const { degustacion: d } = await api.get(`/api/degustaciones/${encodeURIComponent(editar)}`);
    if (!d.esMia) { cont.append(aviso('error', 'Solo puedes corregir tus propias visitas.')); return; }
    if (d.versionNota === 1) return (await import('./valorar-historica.js')).render(cont, params);
    f = { ...f, ...d, precio: d.precio ?? '', comentario: d.comentario ?? '' };
  } else if (params.get('bar')) {
    f.bar = (await api.get(`/api/bares/${encodeURIComponent(params.get('bar'))}`)).bar;
  }
  const empezar = () => construir(cont, f, { yo, editar, claveBorrador });
  if (borrador) {
    // El borrador anterior se decide antes de poder sobrescribirlo, incluso entrando desde otra ficha.
    cont.append(el('h1', {}, 'Te quedó una tortilla a medias'), el('p', { class: 'subtitulo' }, borrador.bar?.nombre || borrador.nuevoBar?.nombre || 'Valoración sin terminar'),
      el('div', { class: 'fila-botones' },
        el('button', { class: 'boton', onclick: async () => {
          if (!borrador.versionNota) return (await import('./valorar-historica.js')).render(cont, new URLSearchParams());
          f = { ...f, ...borrador }; empezar();
        } }, 'Continuar el borrador'),
        el('button', { class: 'boton boton--fantasma', onclick: async () => {
          if (await confirmar({ titulo: '¿Descartar este borrador?', texto: 'Se borrará la valoración que todavía no has guardado.', aceptar: 'Descartar y empezar' })) { borrarBorrador(claveBorrador); empezar(); }
        } }, 'Empezar otra')));
    return;
  }
  empezar();
}

function construir(cont, f, { yo, editar, claveBorrador }) {
  cont.replaceChildren();
  cont.classList.add('valorar-v2');
  let guardando = false;
  let terminada = false;
  const estadoBorrador = el('span', { class: 'pista' }, 'Solo se comparte al guardar');
  const cambio = () => {
    if (terminada) return;
    estadoBorrador.textContent = guardarBorrador(claveBorrador, f) ? 'Borrador guardado en este dispositivo' : 'Borrador solo en pantalla';
  };
  const errores = el('div', { 'aria-live': 'assertive' });
  const conflicto = el('div', {});
  const campo = (etiqueta, nodo, id) => el('div', { class: 'campo' }, id ? el('label', { for: id }, etiqueta) : el('span', { class: 'campo__etiqueta' }, etiqueta), nodo);
  const selector = selectorBar({ inicial: f, alCambiar: ({ bar, nuevoBar }) => { f.bar = bar; f.nuevoBar = nuevoBar; cambio(); } });
  const cebolla = grupoChips({ nombre: 'Cebolla', valor: f.variedad.cebolla, permitirVacio: false,
    opciones: [{ valor: 'con', etiqueta: 'Con cebolla' }, { valor: 'sin', etiqueta: 'Sin cebolla' }, { valor: 'no_se', etiqueta: 'No me fijé' }],
    alCambiar: (v) => { f.variedad.cebolla = v; cambio(); } });
  const vegana = el('input', { type: 'checkbox', id: 'receta-vegana', checked: f.variedad.vegana });
  vegana.addEventListener('change', () => { f.variedad.vegana = vegana.checked; cambio(); });
  const fecha = el('input', { type: 'date', id: 'fecha-visita', value: f.fecha, max: fechaLocalHoy(), required: true });
  fecha.addEventListener('change', () => { f.fecha = fecha.value; cambio(); });
  const general = crearNotaControl({ clave: 'general', etiqueta: 'Tu nota general', valor: f.notaGeneral,
    ayuda: '¿Cuánto te ha gustado, en conjunto?', alCambiar: (v) => { f.notaGeneral = v; cambio(); } });
  const aspectos = ASPECTOS.map((c) => crearNotaControl({ ...c, valor: f.criterios[c.clave], opcional: true,
    decorador: c.clave === 'sabor' ? medidorMmm() : null, alCambiar: (v) => { f.criterios[c.clave] = v; cambio(); } }).elemento);
  const ingredientesZona = el('div', {});
  const pintarIngredientes = () => {
    const opciones = [...new Set([...INGREDIENTES, ...f.variedad.ingredientes])].map((v) => ({ valor: v, etiqueta: v }));
    ingredientesZona.replaceChildren(grupoChips({ nombre: 'Ingredientes añadidos', multiple: true, valor: f.variedad.ingredientes, opciones,
      alCambiar: (v) => { f.variedad.ingredientes = v; cambio(); } }).elemento);
  };
  pintarIngredientes();
  const otro = el('input', { id: 'otro-ingrediente', placeholder: 'Otro ingrediente', maxlength: 30 });
  const anadir = () => {
    const v = otro.value.trim().toLowerCase();
    if (!v) return;
    if (!f.variedad.ingredientes.includes(v)) f.variedad.ingredientes.push(v);
    otro.value = ''; pintarIngredientes(); cambio();
  };
  otro.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } });
  const caracteristica = (nombre, clave, opciones, multiple = false) => campo(nombre, grupoChips({ nombre, valor: f[clave], multiple,
    opciones: Object.entries(opciones).map(([valor, etiqueta]) => ({ valor, etiqueta })), alCambiar: (v) => { f[clave] = v; cambio(); } }).elemento);
  const precio = el('input', { id: 'precio', inputmode: 'decimal', value: f.precio, placeholder: 'Ej. 2,50' });
  precio.addEventListener('input', () => { f.precio = precio.value; cambio(); });
  const comentario = el('textarea', { id: 'comentario', rows: 2, maxlength: 600, placeholder: 'Lo que querrás recordar…' }, f.comentario);
  comentario.addEventListener('input', () => { f.comentario = comentario.value; cambio(); });
  const privado = el('input', { id: 'comentario-privado', type: 'checkbox', checked: f.comentarioPrivado });
  privado.addEventListener('change', () => { f.comentarioPrivado = privado.checked; cambio(); });
  const boton = el('button', { type: 'submit', class: 'boton boton--marron boton--bloque boton--grande' }, editar ? 'Guardar corrección' : 'Guardar mi visita');
  const form = el('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('section', { class: 'contexto-visita' },
      el('h2', {}, 'El lugar'), selector.elemento, conflicto,
      el('div', { class: 'receta-rapida' }, el('h2', {}, 'La tortilla'), cebolla.elemento,
        el('details', { class: 'detalles receta-detalle', open: f.variedad.vegana || f.variedad.ingredientes.length > 0 },
          el('summary', {}, 'Vegana o con otros ingredientes'),
          el('label', { for: 'receta-vegana', class: 'casilla' }, vegana, 'Receta vegana'),
          ingredientesZona, campo('Añadir ingrediente', el('div', { class: 'campo-inline' }, otro, el('button', { type: 'button', class: 'boton boton--pequeno', onclick: anadir }, 'Añadir')), 'otro-ingrediente')))),
    el('section', { class: 'puntuacion-general' }, general.elemento),
    el('details', { class: 'detalle-visita', open: Object.values(f.criterios).some((v) => v !== null && v !== undefined) },
      el('summary', {}, 'Afinar los cinco aspectos', el('span', {}, 'Opcional')), el('p', { class: 'pista' }, 'Anota solo los que quieras. La nota general la eliges tú.'), aspectos),
    el('details', { class: 'detalle-visita', open: !!(f.comentario || f.precio || f.tipoCuajado || f.sal || f.tamano || f.formato || f.acompanamientos.length) },
      el('summary', {}, 'Guardar algún detalle', el('span', {}, 'Opcional')),
      campo('Fecha de la visita', fecha, 'fecha-visita'), caracteristica('Punto de cuajado', 'tipoCuajado', TIPO_CUAJADO),
      caracteristica('Punto de sal', 'sal', SAL), caracteristica('Tamaño', 'tamano', TAMANO), caracteristica('Qué pediste', 'formato', FORMATO),
      campo('Precio (€)', precio, 'precio'), caracteristica('Acompañamientos', 'acompanamientos', ACOMPANAMIENTOS, true),
      campo('Comentario', comentario, 'comentario'), el('label', { for: 'comentario-privado', class: 'casilla' }, privado, 'Este comentario, solo para mí')),
    el('div', { class: 'guardar-visita' }, errores, boton, estadoBorrador));
  cont.append(el('header', { class: 'valorar-titulo' }, el('div', {}, el('p', { class: 'eyebrow' }, editar ? 'CORREGIR UNA VISITA' : 'OTRA TORTILLA PARA RECORDAR'),
    el('h1', {}, '¿Qué tal estaba?'), el('p', { class: 'pista' }, editar ? formatearFecha(f.fecha) : 'Con una nota basta. Tú decides el detalle.')), tortilla({ animo: 'mmm', tamano: 76 })), form);

  async function guardar(forzar = false) {
    if (guardando) return;
    errores.replaceChildren();
    const errorCampo = (mensaje, nodo) => { errores.replaceChildren(aviso('error', mensaje)); nodo?.focus(); };
    if (!f.bar && !f.nuevoBar?.nombre?.trim()) { errorCampo('Elige el lugar de esta visita.'); selector.enfocar(); return; }
    if (f.notaGeneral === null) { errorCampo('Elige tu nota general.'); general.marcarError(); general.enfocar(); return; }
    if (!fecha.value || !fecha.validity.valid) { fecha.closest('details').open = true; errorCampo('Revisa la fecha de la visita.', fecha); return; }
    const precioNumero = String(f.precio).trim() === '' ? null : Number(String(f.precio).replace(',', '.'));
    if (precioNumero !== null && (!Number.isFinite(precioNumero) || precioNumero <= 0)) { precio.closest('details').open = true; errorCampo('Indica un precio mayor que cero o déjalo vacío.', precio); return; }
    guardando = true; boton.disabled = true; boton.textContent = 'Guardando…';
    try {
      const { bar: seleccionado, nuevoBar } = selector.obtener();
      const cuerpo = { versionNota: 2, opId: f.opId, barId: seleccionado?.id, nuevoBar, forzarBar: forzar, variedad: f.variedad,
        fecha: f.fecha, notaGeneral: f.notaGeneral, criterios: f.criterios, tipoCuajado: f.tipoCuajado,
        sal: f.sal, tamano: f.tamano, formato: f.formato, precio: precioNumero, acompanamientos: f.acompanamientos,
        comentario: f.comentario, comentarioPrivado: f.comentarioPrivado };
      const { degustacion: d } = editar ? await api.patch(`/api/degustaciones/${encodeURIComponent(editar)}`, cuerpo) : await api.post('/api/degustaciones', cuerpo);
      terminada = true; borrarBorrador(claveBorrador);
      const titulo = el('h1', { tabindex: -1 }, editar ? 'Visita corregida' : 'Una más para recordar.');
      cont.replaceChildren(el('section', { class: 'celebracion celebracion-v2' }, tortilla({ animo: 'fiesta', tamano: 112 }), titulo,
        el('p', { class: 'subtitulo' }, d.bar.nombre), el('div', { class: 'nota-grande' }, formatearNotaCorta(d.nota)),
        el('p', { class: 'pista' }, `Tu nota general · ${formatearFecha(d.fecha)}`),
        el('a', { class: 'boton boton--marron boton--grande', href: `#/bar/${encodeURIComponent(d.bar.id)}` }, 'Ver cómo queda en la ficha'),
        el('a', { class: 'enlace', href: `#/valorar?bar=${encodeURIComponent(d.bar.id)}`, onclick: (e) => { e.preventDefault(); navegar(`/valorar?bar=${encodeURIComponent(d.bar.id)}`, { reemplazar: true }); } }, 'Registrar otra visita aquí')));
      window.scrollTo({ top: 0 }); titulo.focus();
    } catch (error) {
      if (error.estado === 409 && error.datos?.sugerencias) {
        conflicto.replaceChildren(aviso('nota', error.message, { acciones: [
          ...error.datos.sugerencias.map((b) => el('button', { type: 'button', class: 'boton boton--pequeno', onclick: () => { selector.establecerBar(b); conflicto.replaceChildren(); guardar(); } }, `Usar ${b.nombre} · ${b.direccion || b.zona || ''}`)),
          el('button', { type: 'button', class: 'enlace', onclick: () => guardar(true) }, 'Es otro establecimiento: guardar por separado') ] }));
        conflicto.scrollIntoView({ block: 'center' });
      } else {
        const conservado = guardarBorrador(claveBorrador, f);
        errores.replaceChildren(aviso('error', `${mensajeDeError(error)} ${conservado ? 'Tu borrador está guardado.' : 'Lo escrito sigue en pantalla.'}`));
      }
    } finally { guardando = false; boton.disabled = false; boton.textContent = editar ? 'Guardar corrección' : 'Guardar mi visita'; }
  }
}
