import {nombreDependencia,enlace} from './dependencias.js';
'use strict';
document.querySelector('a[href="./"]').href=enlace('./');
const file=document.querySelector('#archivo'), person=document.querySelector('#persona');
const message=document.querySelector('#mensaje'), result=document.querySelector('#resultado'), copy=document.querySelector('#copiar');
const download=document.querySelector('#descargar');
let rows=new Map(), sequence=0;
function clear(){
  sequence++;
  rows.clear();
  person.replaceChildren(new Option('Selecciona un usuario',''));
  download.disabled=person.disabled=copy.disabled=true;
  message.value=result.textContent='';
}
function issued(csv){
  const [header,...lines]=csv.replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/);
  if(header!=='usuario,clave_temporal,uid,estado,fecha_clave_original')throw Error('Selecciona el CSV original de accesos del IMJU.');
  const available=new Map();
  for(const line of lines){
    const fields=line.split(',');
    if(fields.length!==5)throw Error('Revisa el formato del archivo.');
    const [user,password,uid,status]=fields;
    if(status!=='emitida'||user==='coordinacion')continue;
    if(!user||!password||!uid||available.has(user))throw Error('Hay un acceso incompleto o duplicado. Revisa el archivo original.');
    available.set(user,password);
  }
  return available;
}
file.onchange=async()=>{
  clear();
  const current=sequence;
  if(!file.files.length)return;
  try{
    const parsed=issued(await file.files[0].text());
    if(current!==sequence)return;
    rows=parsed;
    for(const user of [...rows.keys()].sort())person.add(new Option(user,user));
    download.disabled=person.disabled=!rows.size;
    result.textContent='Participantes con clave emitida en este archivo: '+rows.size+'.';
  }catch(e){if(current===sequence)result.textContent=e.message}
};
function messageFor(user){
  return [
    'Hola, te escribimos de '+nombreDependencia+'. Este es tu acceso individual a Jóvenes que Unen al Barrio.',
    'Entra en '+enlace('./'),
    'Usuario: '+user,'Contraseña temporal: '+rows.get(user),'',
    'La primera vez, elige una contraseña personal de al menos 10 caracteres. En Inicio, toca «Mostrar mi gafete» para presentar tu QR. También puedes consultar tus horas y próximas actividades.',
    'Si ya cambiaste tu contraseña, entra con la que elegiste. Si necesitas ayuda, responde a coordinación.'
  ].join('\n');
}
person.onchange=()=>{
  copy.disabled=!rows.has(person.value);
  message.value=copy.disabled?'':messageFor(person.value);
};
download.onclick=()=>{
  const blocks=[...rows.keys()].sort().map(user=>'Para '+user+'\n\n'+messageFor(user));
  const blob=new Blob(['\uFEFF'+blocks.join('\n\n────────────────────────\n\n')],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='Mensajes_individuales_IMJU_privados.txt';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
};
copy.onclick=async()=>{
  try{await navigator.clipboard.writeText(message.value);result.textContent='Mensaje copiado. Verifica el destinatario antes de enviarlo.'}
  catch{message.select();result.textContent='Copia el mensaje seleccionado con el menú de tu dispositivo.'}
};
window.addEventListener('pagehide',()=>{clear();file.value=''});
clear();
