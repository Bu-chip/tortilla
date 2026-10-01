import { ErrorHttp } from '../http.js';

export const ETIQUETAS = {
  patata: 'la patata',
  jugosidad: 'la jugosidad',
  cuajado: 'el cuajado',
  sabor: 'el sabor',
  presentacion: 'la presentación',
  integracion: 'la integración de ingredientes',
};

export function errorValidacion(campo, mensaje) {
  return new ErrorHttp(400, mensaje, { campo });
}

function estaVacio(valor) {
  return valor === undefined || valor === null || valor === '';
}

/** Nota de 1 a 10 en pasos de 0,5. Rechaza 0, 11, vacío y valores como 7,3. */
export function nota(valor, campo, { opcional = false } = {}) {
  if (estaVacio(valor)) {
    if (opcional) return null;
    throw errorValidacion(campo, `Te falta puntuar ${ETIQUETAS[campo] || campo}.`);
  }
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n < 1 || n > 10 || (n * 2) % 1 !== 0) {
    throw errorValidacion(campo, `${capitalizar(ETIQUETAS[campo] || campo)} debe ser una nota de 1 a 10 en pasos de 0,5.`);
  }
  return n;
}

export function fecha(valor, campo = 'fecha') {
  if (estaVacio(valor)) throw errorValidacion(campo, 'Falta la fecha de la visita.');
  const texto = String(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) throw errorValidacion(campo, 'La fecha debe tener el formato AAAA-MM-DD.');
  const [a, m, d] = texto.split('-').map(Number);
  const fechaObj = new Date(Date.UTC(a, m - 1, d));
  if (fechaObj.getUTCFullYear() !== a || fechaObj.getUTCMonth() !== m - 1 || fechaObj.getUTCDate() !== d) {
    throw errorValidacion(campo, 'La fecha no existe en el calendario.');
  }
  if (a < 2000) throw errorValidacion(campo, 'La fecha es demasiado antigua.');
  const limite = new Date(Date.now() + 2 * 86_400_000);
  if (fechaObj.getTime() > limite.getTime()) throw errorValidacion(campo, 'La fecha no puede estar en el futuro.');
  return texto;
}

export function texto(valor, campo, { max = 200, min = 0, opcional = false } = {}) {
  if (estaVacio(valor)) {
    if (opcional) return null;
    throw errorValidacion(campo, `Falta el campo ${campo}.`);
  }
  if (typeof valor !== 'string') throw errorValidacion(campo, `El campo ${campo} debe ser texto.`);
  const limpio = valor.replace(/\s+/g, ' ').trim();
  if (limpio.length < min) throw errorValidacion(campo, `El campo ${campo} es demasiado corto.`);
  if (limpio.length > max) throw errorValidacion(campo, `El campo ${campo} es demasiado largo (máximo ${max} caracteres).`);
  if (!limpio && !opcional) throw errorValidacion(campo, `Falta el campo ${campo}.`);
  return limpio || null;
}

export function opcion(valor, campo, permitidas, { opcional = true } = {}) {
  if (estaVacio(valor)) {
    if (opcional) return null;
    throw errorValidacion(campo, `Falta elegir ${campo}.`);
  }
  if (!permitidas.includes(valor)) throw errorValidacion(campo, `El valor de ${campo} no es válido.`);
  return valor;
}

export function precio(valor, campo = 'precio') {
  if (estaVacio(valor)) return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 1000) throw errorValidacion(campo, 'El precio debe ser un importe mayor que cero.');
  return Math.round(n * 100) / 100;
}

export function listaDeTextos(valor, campo, { max = 8, maxLargo = 30, permitidas = null } = {}) {
  if (estaVacio(valor)) return [];
  if (!Array.isArray(valor)) throw errorValidacion(campo, `El campo ${campo} debe ser una lista.`);
  const limpios = [];
  for (const elemento of valor) {
    if (typeof elemento !== 'string') throw errorValidacion(campo, `El campo ${campo} contiene un valor no válido.`);
    const limpio = elemento.trim().toLowerCase();
    if (!limpio) continue;
    if (limpio.length > maxLargo) throw errorValidacion(campo, `Un elemento de ${campo} es demasiado largo.`);
    if (permitidas && !permitidas.includes(limpio)) throw errorValidacion(campo, `«${elemento}» no es una opción válida de ${campo}.`);
    if (!limpios.includes(limpio)) limpios.push(limpio);
  }
  if (limpios.length > max) throw errorValidacion(campo, `Demasiados elementos en ${campo} (máximo ${max}).`);
  return limpios;
}

export function coordenada(valor, campo, minimo, maximo) {
  if (estaVacio(valor)) return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < minimo || n > maximo) throw errorValidacion(campo, `La coordenada ${campo} no es válida.`);
  return n;
}

export function booleano(valor) {
  return valor === true || valor === 1 || valor === '1' || valor === 'true';
}

function capitalizar(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
