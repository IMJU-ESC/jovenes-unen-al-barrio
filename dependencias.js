import {doc} from './firebase-sdk-11.10.0.js';

export const dependencias=new Map([
  ['mujer','Instituto de la Mujer'],
  ['atencion-ciudadana','Atención Ciudadana']
]);
export const dependencia=new URLSearchParams(location.search).get('dependencia')||'';
if(dependencia&&!dependencias.has(dependencia))throw Error('Dependencia desconocida.');
export const nombreDependencia=dependencias.get(dependencia)||'IMJU Escuinapa';
export const dominioUsuario=dependencia?'@'+dependencia+'.acceso.imju.invalid':'@acceso.imju.invalid';
export function espacio(db){
  return dependencia?doc(db,'dependencias',dependencia):db;
}
export function enlace(ruta){
  const url=new URL(ruta,location.href);
  if(dependencia)url.searchParams.set('dependencia',dependencia);
  if(new URLSearchParams(location.search).get('red')==='movil')url.searchParams.set('red','movil');
  return url.href;
}

export const prefijoQR=dependencia?'IMJU-JB:2:'+dependencia+':':'IMJU-JB:1:';
