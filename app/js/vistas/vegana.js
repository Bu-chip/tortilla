import { render as renderBares } from './bares.js';

export async function render(cont, params) {
  const filtros = new URLSearchParams(params);
  filtros.set('vegana', '1');
  return renderBares(cont, filtros);
}
