import { svg } from './dom.js';

const TEXTURA = `
  <ellipse cx="140" cy="128" rx="28" ry="22" fill="#F0B830" opacity="0.55"/>
  <ellipse cx="205" cy="126" rx="22" ry="18" fill="#F0B830" opacity="0.5"/>
  <ellipse cx="120" cy="205" rx="20" ry="15" fill="#F0B830" opacity="0.45"/>
  <ellipse cx="225" cy="205" rx="24" ry="16" fill="#EAA820" opacity="0.4"/>
  <ellipse cx="170" cy="240" rx="18" ry="12" fill="#EAA820" opacity="0.35"/>`;

const CARAS = {
  feliz: `
    <circle cx="145" cy="155" r="14" fill="#5C3A1E"/><circle cx="195" cy="155" r="14" fill="#5C3A1E"/>
    <circle cx="149" cy="151" r="5" fill="#fff"/><circle cx="199" cy="151" r="5" fill="#fff"/>
    <path d="M135 185 Q170 215 205 185" stroke="#5C3A1E" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  mmm: `
    <path d="M131 158 Q145 141 159 158" stroke="#5C3A1E" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M181 158 Q195 141 209 158" stroke="#5C3A1E" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M148 188 Q170 208 192 188" stroke="#5C3A1E" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M160 191 q10 12 20 0 z" fill="#F2A7C3"/>`,
  wow: `
    <circle cx="145" cy="152" r="16" fill="#5C3A1E"/><circle cx="195" cy="152" r="16" fill="#5C3A1E"/>
    <circle cx="150" cy="147" r="6" fill="#fff"/><circle cx="200" cy="147" r="6" fill="#fff"/>
    <ellipse cx="170" cy="197" rx="13" ry="17" fill="#5C3A1E"/><ellipse cx="170" cy="204" rx="8" ry="7" fill="#F2A7C3"/>`,
  meh: `
    <ellipse cx="145" cy="156" rx="14" ry="6" fill="#5C3A1E"/><ellipse cx="195" cy="156" rx="14" ry="6" fill="#5C3A1E"/>
    <path d="M142 196 L198 196" stroke="#5C3A1E" stroke-width="6" stroke-linecap="round"/>`,
  triste: `
    <circle cx="145" cy="160" r="12" fill="#5C3A1E"/><circle cx="195" cy="160" r="12" fill="#5C3A1E"/>
    <circle cx="148" cy="156" r="4" fill="#fff"/><circle cx="198" cy="156" r="4" fill="#fff"/>
    <path d="M128 136 L158 146" stroke="#5C3A1E" stroke-width="5" stroke-linecap="round"/>
    <path d="M212 136 L182 146" stroke="#5C3A1E" stroke-width="5" stroke-linecap="round"/>
    <path d="M140 207 Q170 184 200 207" stroke="#5C3A1E" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  fiesta: `
    <path d="M145 136 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1z" fill="#5C3A1E"/>
    <path d="M195 136 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1z" fill="#5C3A1E"/>
    <path d="M128 180 Q170 236 212 180 Z" fill="#5C3A1E"/><path d="M142 192 Q170 218 198 192 Z" fill="#F2A7C3"/>`,
  duda: `
    <circle cx="145" cy="156" r="14" fill="#5C3A1E"/><circle cx="195" cy="156" r="10" fill="#5C3A1E"/>
    <circle cx="149" cy="152" r="5" fill="#fff"/><circle cx="198" cy="153" r="3.5" fill="#fff"/>
    <path d="M182 132 Q196 121 210 132" stroke="#5C3A1E" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M140 196 Q152 186 164 196 T188 196" stroke="#5C3A1E" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  guino: `
    <circle cx="145" cy="155" r="14" fill="#5C3A1E"/><circle cx="149" cy="151" r="5" fill="#fff"/>
    <path d="M181 156 Q195 144 209 156" stroke="#5C3A1E" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M135 185 Q170 215 205 185" stroke="#5C3A1E" stroke-width="6" fill="none" stroke-linecap="round"/>`,
};

export const ANIMOS = Object.keys(CARAS);

const DESCRIPCIONES = {
  feliz: 'tortilla contenta', mmm: 'tortilla saboreando', wow: 'tortilla sorprendida', meh: 'tortilla indiferente',
  triste: 'tortilla triste', fiesta: 'tortilla de celebración', duda: 'tortilla con dudas', guino: 'tortilla guiñando',
};

export function animoPorNota(nota) {
  if (nota === null || nota === undefined) return 'duda';
  if (nota < 4) return 'triste';
  if (nota < 5.5) return 'meh';
  if (nota < 7.5) return 'feliz';
  if (nota < 9) return 'mmm';
  return 'fiesta';
}

/** La tortilla protagonista, heredada del HTML original, con varias expresiones. */
export function tortilla({ animo = 'feliz', tamano = 200, clase = '', decorativa = true } = {}) {
  const cara = CARAS[animo] || CARAS.feliz;
  const accesibilidad = decorativa ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${DESCRIPCIONES[animo] || 'tortilla'}"`;
  return svg(`
<svg class="tortilla ${clase}" viewBox="0 0 340 340" width="${tamano}" height="${tamano}" xmlns="http://www.w3.org/2000/svg" ${accesibilidad}>
  <ellipse class="tortilla__sombra" cx="175" cy="315" rx="120" ry="14" fill="rgba(92,58,30,0.12)"/>
  <g class="tortilla__cuerpo">
    <ellipse cx="170" cy="170" rx="155" ry="148" fill="#E8A800"/>
    <ellipse cx="170" cy="166" rx="148" ry="140" fill="#F9C846"/>
    <ellipse cx="170" cy="164" rx="118" ry="112" fill="#FDD86A"/>
    ${TEXTURA}
    <g class="tortilla__cara">${cara}</g>
    <circle cx="124" cy="180" r="16" fill="#F2A7C3" opacity="0.5"/>
    <circle cx="216" cy="180" r="16" fill="#F2A7C3" opacity="0.5"/>
  </g>
</svg>`);
}

/** Porción vista de lado, para el gesto de jugosidad: se hunde al pulsar y recupera su forma. */
export function porcion({ clase = '' } = {}) {
  return svg(`
<svg class="porcion ${clase}" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <ellipse cx="100" cy="106" rx="92" ry="10" fill="#EDE4D6"/>
  <ellipse cx="100" cy="104" rx="84" ry="7" fill="#FFFDF7"/>
  <g class="porcion__cuerpo">
    <path d="M22 98 L58 34 Q100 16 142 34 L178 98 Z" fill="#F9C846" stroke="#E8A800" stroke-width="4" stroke-linejoin="round"/>
    <path d="M58 34 Q100 16 142 34" stroke="#E8A800" stroke-width="9" fill="none" stroke-linecap="round"/>
    <ellipse cx="80" cy="66" rx="12" ry="8" fill="#F0B830" opacity="0.6"/>
    <ellipse cx="118" cy="58" rx="10" ry="7" fill="#F0B830" opacity="0.5"/>
    <ellipse cx="104" cy="82" rx="14" ry="8" fill="#FDD86A" opacity="0.9"/>
    <path class="porcion__gota" d="M100 98 q-7 12 0 20 q7 -8 0 -20 z" fill="#FDD86A" stroke="#E8A800" stroke-width="2"/>
  </g>
</svg>`);
}
