import { ErrorHttp } from '../http.js';
import { notaDeVisita } from '../../app/js/formato.js';
import { booleano, fecha as validarFecha, listaDeTextos, nota, opcion, precio as validarPrecio, texto } from './validar.js';
import { CEBOLLA } from './variedades.js';

export const CRITERIOS = ['patata', 'jugosidad', 'cuajado', 'sabor', 'presentacion'];
export const ASPECTOS = ['sabor', 'patata', 'textura', 'equilibrio', 'presentacion'];
export const TIPOS_CUAJADO = ['poco', 'medio', 'bien'];
export const SAL = ['sosa', 'a_punto', 'salada'];
export const TAMANOS = ['pequena', 'media', 'generosa'];
export const FORMATOS = ['pincho', 'racion', 'entera', 'conjunto'];
export const ACOMPANAMIENTOS = ['pan', 'cafe', 'bebida'];

/** Valida el cuerpo de una degustación. La autoría nunca viene del cuerpo. */
export function validarDatosDegustacion(cuerpo = {}) {
  const criteriosEntrada = cuerpo.criterios && typeof cuerpo.criterios === 'object' ? cuerpo.criterios : cuerpo;
  const versionNota = cuerpo.versionNota ?? (cuerpo.notaGeneral !== undefined ? 2 : 1);
  if (![1, 2].includes(versionNota)) throw new ErrorHttp(400, 'Método de valoración no reconocido.');
  const criterios = {};
  for (const clave of (versionNota === 2 ? ASPECTOS : CRITERIOS)) criterios[clave] = nota(criteriosEntrada[clave], clave, { opcional: versionNota === 2 });
  const variedadEntrada = cuerpo.variedad && typeof cuerpo.variedad === 'object' ? cuerpo.variedad : {};
  if (versionNota === 2 && booleano(variedadEntrada.vegana) && Array.isArray(variedadEntrada.ingredientes)) {
    const animales = ['chorizo', 'jamón', 'jamon', 'bacalao', 'atún', 'atun', 'huevo'];
    if (variedadEntrada.ingredientes.some((i) => animales.includes(String(i).trim().toLowerCase()))) throw new ErrorHttp(400, 'Revisa la receta vegana: has marcado un ingrediente de origen animal. Si es una alternativa vegetal, indícalo en su nombre.', { campo: 'ingredientes' });
  }
  return {
    versionNota,
    notaGeneral: versionNota === 2 ? nota(cuerpo.notaGeneral, 'nota general') : null,
    barId: texto(cuerpo.barId, 'barId', { max: 64 }),
    variedad: {
      cebolla: opcion(variedadEntrada.cebolla ?? (versionNota === 2 ? 'no_se' : null), 'cebolla', CEBOLLA, { opcional: false }),
      vegana: booleano(variedadEntrada.vegana),
      ingredientes: listaDeTextos(variedadEntrada.ingredientes, 'ingredientes', { max: 8, maxLargo: 30 }),
    },
    fecha: validarFecha(cuerpo.fecha),
    criterios,
    integracion: versionNota === 2 ? null : nota(cuerpo.integracion, 'integracion', { opcional: true }),
    tipoCuajado: opcion(cuerpo.tipoCuajado, 'tipoCuajado', TIPOS_CUAJADO),
    sal: opcion(cuerpo.sal, 'sal', SAL),
    tamano: opcion(cuerpo.tamano, 'tamano', TAMANOS),
    formato: opcion(cuerpo.formato, 'formato', FORMATOS),
    precio: validarPrecio(cuerpo.precio),
    acompanamientos: listaDeTextos(cuerpo.acompanamientos, 'acompanamientos', { permitidas: ACOMPANAMIENTOS }),
    comentario: texto(cuerpo.comentario, 'comentario', { max: 600, opcional: true }),
    comentarioPrivado: booleano(cuerpo.comentarioPrivado),
  };
}


export function formatearDegustacion(fila, personaId) {
  if (!fila) return null;
  const esMia = fila.autor_id === personaId;
  const criterios = { patata: fila.patata, jugosidad: fila.jugosidad, cuajado: fila.cuajado, sabor: fila.sabor, presentacion: fila.presentacion };
  if (fila.version_nota === 2) { delete criterios.jugosidad; delete criterios.cuajado; criterios.textura = fila.textura; criterios.equilibrio = fila.equilibrio; }
  const observada = JSON.parse(fila.receta_observada || '{}');
  const privado = fila.comentario_privado === 1;
  return {
    id: fila.id,
    opId: esMia ? fila.op_id : undefined,
    grupo: { id: fila.grupo_id, nombre: fila.grupo_nombre },
    autor: { id: fila.autor_id, nombre: fila.autor_nombre },
    esMia,
    bar: { id: fila.bar_id, nombre: fila.bar_nombre, zona: fila.bar_zona, ciudad: fila.bar_ciudad, direccion: fila.bar_direccion },
    variedad: {
      id: fila.variedad_id,
      nombre: fila.variedad_nombre || 'Receta sin identificar',
      cebolla: fila.variedad_cebolla || observada.cebolla || 'no_se',
      vegana: fila.variedad_id ? fila.variedad_vegana === 1 : !!observada.vegana,
      ingredientes: fila.variedad_id ? JSON.parse(fila.variedad_ingredientes || '[]') : (observada.ingredientes || []),
    },
    fecha: fila.fecha,
    criterios,
    versionNota: fila.version_nota,
    notaGeneral: fila.nota_general,
    nota: fila.version_nota === 2 ? fila.nota_general : notaDeVisita(criterios),
    integracion: fila.integracion,
    tipoCuajado: fila.tipo_cuajado,
    sal: fila.sal,
    tamano: fila.tamano,
    formato: fila.formato,
    precio: fila.precio,
    acompanamientos: JSON.parse(fila.acompanamientos || '[]'),
    comentario: privado && !esMia ? null : fila.comentario,
    comentarioPrivado: privado,
    origen: fila.origen,
    retiradaEn: fila.retirada_en,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

