export const ASPECTOS = [
  { clave: 'sabor', etiqueta: 'Sabor', ayuda: 'Sabor y aroma. Ese mmmm.' },
  { clave: 'patata', etiqueta: 'Patata', ayuda: 'Cocción, corte y consistencia.' },
  { clave: 'textura', etiqueta: 'Textura', ayuda: 'Cómo se siente el conjunto al comerlo.' },
  { clave: 'equilibrio', etiqueta: 'Equilibrio', ayuda: 'Proporción e integración de los ingredientes.' },
  { clave: 'presentacion', etiqueta: 'Aspecto', ayuda: 'La tortilla y su corte, no la vajilla del bar.' },
];

export const CRITERIOS = [
  { clave: 'patata', etiqueta: 'Patata', emoji: '🥔', ayuda: 'Corte, punto y sabor de la patata.' },
  { clave: 'jugosidad', etiqueta: 'Jugosidad', emoji: '💧', ayuda: 'Cuánto te ha gustado lo jugosa que estaba (no si era seca o no).' },
  { clave: 'cuajado', etiqueta: 'Cuajado', emoji: '🔥', ayuda: 'Cuánto te ha gustado su punto de cuajado, sea el que sea.' },
  { clave: 'sabor', etiqueta: 'Sabor', emoji: '😋', ayuda: 'El medidor de mmmm.' },
  { clave: 'presentacion', etiqueta: 'Presentación', emoji: '🍽️', ayuda: 'Cómo llega al plato.' },
];

export const CEBOLLA = { con: 'Con cebolla', sin: 'Sin cebolla', no_se: 'No me fijé' };
export const CEBOLLA_CORTA = { con: 'con cebolla', sin: 'sin cebolla', no_se: 'cebolla sin confirmar' };
export const TIPO_CUAJADO = { poco: 'Poco cuajada', medio: 'Punto medio', bien: 'Bien cuajada' };
export const SAL = { sosa: 'Sosa', a_punto: 'A punto', salada: 'Salada' };
export const SAL_CHISPAS = { sosa: '·', a_punto: '✦ ✦', salada: '✦ ✦ ✦ ✦' };
export const TAMANO = { pequena: 'Pequeña', media: 'Media', generosa: 'Generosa' };
export const FORMATO = { pincho: 'Pincho', racion: 'Ración', entera: 'Tortilla entera', conjunto: 'Conjunto con pan o café' };
export const ACOMPANAMIENTOS = { pan: 'Pan', cafe: 'Café', bebida: 'Bebida' };
export const INGREDIENTES = ['pimiento', 'chorizo', 'bacalao', 'calabacín', 'jamón', 'queso', 'setas', 'espinacas'];
export const EMOJI_INGREDIENTE = { pimiento: '🫑', chorizo: '🌶️', bacalao: '🐟', calabacín: '🥒', jamón: '🍖', queso: '🧀', setas: '🍄', espinacas: '🥬' };

export const TEXTOS = {
  invitacion: 'Esa tortilla merece una nota',
  tuMedia: 'Tu media',
  losDemas: 'Los demás',
  sinMediaPropia: 'Aún no has puntuado',
  sinOtras: 'Todavía no hay otras valoraciones',
  primeraVisita: 'Todavía no la has probado',
  guardado: 'Valoración guardada. Otra tortilla para recordar.',
  errorGuardado: 'No se ha podido guardar. Hemos conservado tu valoración para que puedas reintentar.',
  errorGuardadoSinBorrador: 'No se ha podido guardar. Revisa la conexión y vuelve a intentarlo; lo escrito sigue en pantalla.',
  demo: 'Datos de demostración',
  batalla: '¿De qué lado estás?',
};
