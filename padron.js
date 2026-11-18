import {initializeApp,deleteApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {initializeAuth,inMemoryPersistence,createUserWithEmailAndPassword,signInWithEmailAndPassword} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {doc,runTransaction,updateDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const fields = [
  ['nombre','Nombre completo'], ['comunidad','Comunidad'], ['generacion','Generación'],
  ['telefono','Teléfono'], ['dependencia','Dependencia']
];
function input(form, label, name, required=false) {
  const wrapper=document.createElement('label'), element=document.createElement('input');
  wrapper.textContent=label;
  element.name=name;
  element.required=required;
  element.maxLength=140;
  wrapper.append(element);
  form.append(wrapper);
  return element;
}
function section(root,title) {
  const panel=document.createElement('details'), summary=document.createElement('summary'), form=document.createElement('form');
  summary.textContent=title;
  panel.append(summary,form);
  root.append(panel);
  return form;
}
function submit(form,label,handler,onError) {
  const button=document.createElement('button');
  button.textContent=label;
  form.append(button);
  form.onsubmit=async event=>{
    event.preventDefault();
    if(button.disabled)return;
    button.disabled=true;
    try{await handler()}catch(e){onError(e)}finally{button.disabled=false}
  };
}
export function manageRoster(root,{app,db,people,reload,onError}) {
  const edit=section(root,'Actualizar datos de un participante');
  const picker=document.createElement('select'),label=document.createElement('label');
  label.textContent='Participante';label.append(picker);edit.append(label);
  for(const p of people)picker.add(new Option(p.nombre+' · '+p.usuario,p.id));
  const inputs=new Map(fields.map(([k,title])=>[k,input(edit,title,k,k==='nombre')]));
  function fill(){
    const p=people.find(x=>x.id===picker.value);
    for(const [k,node] of inputs)node.value=p?.[k]||'';
  }
  picker.onchange=fill;fill();
  submit(edit,'Guardar cambios',async()=>{
    const p=people.find(x=>x.id===picker.value);
    if(!p)throw Error('Selecciona un participante.');
    const changes={};
    for(const [k,node] of inputs)if(node.value.trim()!==(p[k]||''))changes[k]=node.value.trim();
    if(changes.nombre==='')throw Error('Escribe el nombre completo.');
    if(Object.keys(changes).length)await updateDoc(doc(db,'participantes',p.id),changes);
    await reload('Datos guardados.');
  },onError);
  const create=section(root,'Dar de alta a un joven');
  const user=input(create,'Usuario nuevo (letras, números, punto y guion)','usuario',true);
  user.pattern='[a-z0-9][a-z0-9._\\-]{2,31}';
  const profile=new Map(fields.map(([k,title])=>[k,input(create,title,k,k==='nombre')]));
  const temp=input(create,'Clave temporal para entregar en privado','temporal');
  temp.value=Array.from(crypto.getRandomValues(new Uint8Array(14)),b=>b.toString(16).padStart(2,'0')).join('');
  temp.readOnly=true;
  const saved=input(create,'Ya guardé el usuario y su clave para entregarlos','guardado',true);
  saved.type='checkbox';saved.style.width='auto';
  submit(create,'Crear cuenta y expediente',async()=>{
    const name=user.value.trim().toLowerCase();
    if(people.some(p=>p.usuario===name)||name==='coordinacion')throw Error('Ese usuario ya existe.');
    const data=Object.fromEntries([...profile].map(([k,v])=>[k,v.value.trim()]));
    if(!data.nombre)throw Error('Escribe el nombre completo.');
    const secondary=initializeApp(app.options,'alta-'+crypto.randomUUID());
    try{
      const aux=initializeAuth(secondary,{persistence:inMemoryPersistence});
      const email=name+'@acceso.imju.invalid';
      let credential;
      try{credential=await createUserWithEmailAndPassword(aux,email,temp.value)}
      catch(e){
        if(e.code!=='auth/email-already-in-use')throw e;
        try{credential=await signInWithEmailAndPassword(aux,email,temp.value)}
        catch{throw Error('Ese usuario ya está reservado. Elige otro.')}
      }
      const uid=credential.user.uid;
      await runTransaction(db,async tx=>{
        const ref=doc(db,'accesos',uid);
        if((await tx.get(ref)).exists())throw Error('La cuenta ya fue dada de alta. Actualiza el padrón.');
        tx.set(doc(db,'participantes',uid),{...data,usuario:name,activo:true});
        tx.set(ref,{participante:uid,activo:true,listo:false});
      });
    }finally{await deleteApp(secondary)}
    await reload('Cuenta creada. El joven ya puede entrar con su clave temporal.');
  },onError);
}
