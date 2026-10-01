import { el } from '../dom.js';

export function fuenteLugares(proveedor) {
  const photon = proveedor === 'photon';
  return el('span', {},
    el('a', { href: photon ? 'https://photon.komoot.io/' : 'https://www.geoapify.com/', target: '_blank', rel: 'noopener' }, photon ? 'Photon' : 'Geoapify'),
    ' · ', el('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, '© OpenStreetMap'));
}
