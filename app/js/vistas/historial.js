import { el, debounce } from '../dom.js';
import { api, mensajeDeError } from '../api.js';
import { navegar, ruta as construirRuta } from '../router.js';
import { segmentado } from '../componentes/chips.js';
import { encabezado, tarjetaVisita, estadoVacio, aviso, cargando, confirmar, toast, formatearFecha } from '../ui.js';
import { plural } from '../formato.js';

export async function render(cont, params) {
  const filtros = { solo: params.get('solo') === 'todas' ? 'todas' : 'mias', q: params.get('q') || '' };
  const pestanas = segmentado({ nombre: 'Qué visitas ver', valor: filtros.solo, opciones: [{ valor: 'mias', etiqueta: 'Mis visitas' }, { valor: 'todas', etiqueta: 'Todo el grupo' }], alCambiar: (v) => { filtros.solo = v; refrescar(); } });
  const entrada = el('input', { type: 'search', id: 'historial-q', class: 'entrada', placeholder: 'Bar, zona o persona', value: filtros.q, autocomplete: 'off' });
  entrada.addEventListener('input', debounce(() => { filtros.q = entrada.value; refrescar(); }, 250));
  const resumen = el('p', { class: 'pista', 'aria-live': 'polite' });
  let limite = 40;
  let revision = 0;
  const mas = el('button', { class: 'boton boton--fantasma', hidden: true, onclick: () => refrescar(true) }, 'Ver visitas anteriores');
  const lista = el('div', { class: 'lista', 'aria-live': 'polite' });

  cont.append(
    encabezado('Historial', { subtitulo: 'Todas las visitas, también las repetidas. Puedes corregir o retirar las tuyas.' }),
    el('div', { class: 'tarjeta', style: { marginTop: '.75rem' } },
      el('div', { class: 'campo' }, pestanas.elemento),
      el('div', { class: 'campo', style: { marginBottom: 0 } }, el('label', { for: 'historial-q' }, 'Buscar'), entrada)),
    el('div', { class: 'seccion' }, resumen, el('div', { style: { marginTop: '.6rem' } }, lista, mas)));

  async function refrescar(ampliar = false) {
    const turno = ++revision;
    const offset = ampliar ? lista.querySelectorAll('article.visita').length : 0;
    mas.disabled = true;
    history.replaceState(null, '', construirRuta('/historial', { solo: filtros.solo === 'mias' ? '' : filtros.solo, q: filtros.q }));
    if (!ampliar) lista.replaceChildren(cargando());
    try {
      const r = await api.get(`/api/degustaciones?solo=${filtros.solo}&q=${encodeURIComponent(filtros.q)}&limite=${limite}&offset=${offset}`);
      if (turno !== revision) return;
      mas.hidden = r.degustaciones.length < limite;
      resumen.textContent = filtros.solo === 'mias'
        ? `${r.resumen.visitas} ${plural(r.resumen.visitas, 'visita tuya', 'visitas tuyas')} en ${r.resumen.bares} ${plural(r.resumen.bares, 'bar', 'bares')} · Ámbito: ${r.ambito.etiqueta}`
        : `${offset + r.degustaciones.length} ${plural(r.degustaciones.length, 'visita', 'visitas')} visibles · Ámbito: ${r.ambito.etiqueta}`;
      if (!ampliar) lista.replaceChildren();
      if (!r.degustaciones.length && !ampliar) {
        lista.append(estadoVacio({
          titulo: filtros.q ? 'Nada coincide con esa búsqueda' : filtros.solo === 'mias' ? 'Todavía no has puntuado ninguna tortilla' : 'Todavía no hay visitas en el grupo',
          texto: filtros.q ? 'Prueba con otro nombre.' : 'Cuando puntúes, aparecerá aquí con su fecha y su nota.',
          accion: filtros.q ? null : el('a', { class: 'boton boton--pequeno', href: '#/valorar' }, '⭐ Puntuar una tortilla'),
        }));
        return;
      }
      lista.append(...r.degustaciones.map((d) => tarjetaVisita(d, {
        mostrarBar: true,
        alEditar: (v) => navegar(`/valorar?editar=${encodeURIComponent(v.id)}`),
        alRetirar: async (v) => {
          const ok = await confirmar({ titulo: '¿Retirar esta valoración?', texto: `Dejará de contar en las medias. ${v.bar.nombre}, ${formatearFecha(v.fecha)}.`, aceptar: 'Sí, retirarla', peligro: true });
          if (!ok) return;
          try { await api.del(`/api/degustaciones/${encodeURIComponent(v.id)}`); toast('Valoración retirada. Ya no cuenta en las medias.'); refrescar(); }
          catch (error) { toast(mensajeDeError(error)); }
        },
      })));
    } catch (error) {
      if (turno !== revision) return;
      lista.replaceChildren(aviso('error', mensajeDeError(error), { acciones: el('button', { type: 'button', class: 'boton boton--pequeno', onclick: refrescar }, 'Reintentar') }));
    } finally { if (turno === revision) mas.disabled = false; }
  }

  await refrescar();
}
