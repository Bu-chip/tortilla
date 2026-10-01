import { api } from './api.js';
export async function descargarDatos(){
  const datos=await api.get('/api/exportar');
  const url=URL.createObjectURL(new Blob([JSON.stringify(datos,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`tortillas-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
