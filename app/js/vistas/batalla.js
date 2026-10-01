import { el } from '../dom.js';
import { api, mensajeDeError } from '../api.js';
import { encabezado, aviso, cargando, toast, formatearNota, textoAmbito } from '../ui.js';
import { plural } from '../formato.js';
import { TEXTOS } from '../etiquetas.js';

export async function render(cont) {
  const cuerpo = el('div', {});
  cont.append(encabezado('Con o sin cebolla', { subtitulo: 'La batalla de siempre. Una preferencia por persona, y la puedes cambiar cuando quieras.' }), cuerpo);

  async function cargar() {
    cuerpo.replaceChildren(cargando('Contando lados…'));
    try { pintar(await api.get('/api/batalla')); }
    catch (error) { cuerpo.replaceChildren(aviso('error', mensajeDeError(error), { acciones: el('button', { type: 'button', class: 'boton boton--pequeno', onclick: cargar }, 'Reintentar') })); }
  }

  async function elegir(lado) {
    try { pintar(await api.put('/api/batalla', { lado })); toast(lado === 'con' ? 'Anotado: con cebolla. 🧅' : 'Anotado: sin cebolla. 🥚'); }
    catch (error) { toast(mensajeDeError(error)); }
  }

  function pintar(datos) {
    const { miLado, votos, degustaciones, ambito } = datos;
    const pctCon = votos.total ? Math.round((votos.con / votos.total) * 100) : 0;
    const pctSin = votos.total ? 100 - pctCon : 0;
    const boton = (lado, titulo, sub, emoji) => el('button', { type: 'button', class: 'chip chip--lado', 'aria-pressed': String(miLado === lado), onclick: () => elegir(lado) },
      el('span', { 'aria-hidden': 'true', style: { fontSize: '1.6rem' } }, emoji), titulo, el('small', {}, miLado === lado ? 'Tu lado' : sub));
    cuerpo.replaceChildren(
      el('div', { style: { marginBottom: '.5rem' } }, textoAmbito(ambito)),
      el('section', { class: 'tarjeta', 'aria-labelledby': 'lado-titulo' },
        el('h2', { id: 'lado-titulo' }, TEXTOS.batalla),
        el('p', { class: 'pista', style: { margin: '.3rem 0 .8rem' } }, 'Aquí se vota preferencia, no calidad. Nadie pierde puntos por su gusto.'),
        el('div', { class: 'batalla__lados' }, boton('con', 'Con cebolla', 'Equipo cebollista', '🧅'), boton('sin', 'Sin cebolla', 'Equipo purista', '🥚')),
        miLado ? el('div', { style: { marginTop: '.6rem' } }, el('button', { type: 'button', class: 'enlace', onclick: async () => { try { pintar(await api.del('/api/batalla')); toast('Voto retirado.'); } catch (error) { toast(mensajeDeError(error)); } } }, 'Retirar mi voto')) : null),
      el('section', { class: 'tarjeta', style: { marginTop: '.75rem' }, 'aria-labelledby': 'resultados-titulo' },
        el('h2', { id: 'resultados-titulo' }, 'Resultado en tu ámbito'),
        votos.total
          ? el('div', {},
            el('div', { class: 'batalla__barra', role: 'img', 'aria-label': `Con cebolla ${pctCon} por ciento, sin cebolla ${pctSin} por ciento` },
              el('span', { class: 'lado-con', style: { flex: `${votos.con} 1 0` } }, votos.con ? `🧅 ${pctCon}%` : ''),
              el('span', { class: 'lado-sin', style: { flex: `${votos.sin} 1 0` } }, votos.sin ? `🥚 ${pctSin}%` : '')),
            el('p', { class: 'pista', style: { marginTop: '.5rem' } }, `${votos.total} de ${votos.miembros} ${plural(votos.miembros, 'persona ha elegido lado', 'personas han elegido lado')}: ${votos.con} con cebolla, ${votos.sin} sin cebolla. Repetir degustaciones no añade votos.`))
          : el('p', { class: 'pista' }, 'Todavía nadie ha elegido lado. Sé la primera persona.')));
  }

  await cargar();
}
