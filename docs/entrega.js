'use strict';
const file=document.querySelector('#archivo'), person=document.querySelector('#persona');
const message=document.querySelector('#mensaje'), result=document.querySelector('#resultado'), copy=document.querySelector('#copiar');
let rows=new Map(), sequence=0;
function clear(){
  sequence++;
  rows.clear();
  person.replaceChildren(new Option('Selecciona un usuario',''));
  person.disabled=copy.disabled=true;
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
    person.disabled=!rows.size;
    result.textContent='Participantes con clave emitida en este archivo: '+rows.size+'.';
  }catch(e){if(current===sequence)result.textContent=e.message}
};
person.onchange=()=>{
  const user=person.value;
  copy.disabled=!rows.has(user);
  message.value=copy.disabled?'':[
    'Hola, te compartimos tu acceso individual a Jóvenes que Unen al Barrio.',
    'Portal: https://imju-esc.github.io/jovenes-unen-al-barrio/',
    'Usuario: '+user,'Clave temporal: '+rows.get(user),'',
    'Al entrar, elige una contraseña personal de al menos 10 caracteres y guárdala. En «Mi gafete digital», toca «Descargar mi QR» y conserva el archivo para registrar tu asistencia. Puedes consultar tus horas por mes. Si algún dato necesita corrección, avisa a coordinación del IMJU.'
  ].join('\n');
};
copy.onclick=async()=>{
  try{await navigator.clipboard.writeText(message.value);result.textContent='Mensaje copiado. Verifica el destinatario antes de enviarlo.'}
  catch{message.select();result.textContent='Copia el mensaje seleccionado con el menú de tu dispositivo.'}
};
window.addEventListener('pagehide',()=>{clear();file.value=''});
clear();
