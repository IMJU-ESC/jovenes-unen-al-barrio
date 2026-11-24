import {espacio,dominioUsuario} from './dependencias.js';
import {limiteFaltas} from './movimientos.js?v=sedes1';
import {collection,createUserWithEmailAndPassword,deleteApp,doc,getDocsFromServer,inMemoryPersistence,initializeApp,initializeAuth,query,runTransaction,signInWithEmailAndPassword,updateDoc,where} from './firebase-sdk-11.10.0.js';
import {imageCanvas} from './credencial.js?v=sedes1';

const fields = [
  ['nombre','Nombre completo'], ['comunidad','Comunidad'], ['generacion','Generación'],
  ['telefono','Teléfono'], ['dependencia','Dependencia'], ['tipoTelefono','Tipo de teléfono'],
  ['claveLocal','Clave de origen'], ['categoriaPadron','Categoría del padrón'], ['domicilio','Domicilio'], ['colonia','Colonia']
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
function photoField(form){
  const element=input(form,'Fotografía del participante','foto');
  element.type='file';element.accept='image/jpeg,image/png,image/webp';return element;
}
async function profilePhoto(element){
  return (await imageCanvas(element.files[0],560)).toDataURL('image/jpeg',0.72);
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
export async function cambiarEstado(db,p,enabled,changes={},mes=''){
  const profileRef=doc(espacio(db),'participantes',p.id);
  const accounts=await getDocsFromServer(query(collection(espacio(db),'accesos'),where('participante','==',p.id)));
  await runTransaction(db,async tx=>{
    const profile=await tx.get(profileRef);
    if(!profile.exists())throw Error('El expediente ya no existe.');
    if(mes && (profile.data().faltasPorMes?.[mes]||0)<limiteFaltas)throw Error('El conteo cambió. Actualiza el perfil antes de decidir la baja.');
    if(profile.data()?.activo!==p.activo)throw Error('El estado cambió. Actualiza el panel.');
    const linked=await Promise.all(accounts.docs.map(account=>tx.get(account.ref)));
    const targets=linked.filter(a=>a.data()?.participante===p.id&&(enabled?a.data().suspendidoPorPadron:a.data().activo));
    if(enabled&&targets.length>1)throw Error('Revisa la vinculación del expediente antes de reactivarlo.');
    for(const account of targets)tx.update(account.ref,{activo:enabled,suspendidoPorPadron:!enabled});
    tx.update(profileRef,{...changes,activo:enabled,bajaPorFaltas:false});
  });
}
export function manageRoster(root,{app,db,people,reload,onError,editOnly=false,createOnly=false}) {
  if(!createOnly){
    const edit=section(root,'Actualizar datos de un participante');
    const picker=document.createElement('select'),label=document.createElement('label');
    label.textContent='Participante';label.append(picker);edit.append(label);
    for(const p of people)picker.add(new Option(p.nombre+' · '+p.usuario,p.id));
    const inputs=new Map(fields.map(([k,title])=>[k,input(edit,title,k,k==='nombre')]));
    const editPhoto=photoField(edit);
    const active=input(edit,'Participante activo','activo');
    active.type='checkbox';active.style.width='auto';
    function fill(){
      editPhoto.value='';
      const p=people.find(x=>x.id===picker.value);
      active.checked=Boolean(p?.activo);
      for(const [k,node] of inputs)node.value=p?.[k]||'';
    }
    picker.onchange=fill;fill();
    submit(edit,'Guardar cambios',async()=>{
      const p=people.find(x=>x.id===picker.value);
      if(!p)throw Error('Selecciona un participante.');
      const changes={};
      for(const [k,node] of inputs)if(node.value.trim()!==(p[k]||''))changes[k]=node.value.trim();
      if(editPhoto.files[0])changes.foto=await profilePhoto(editPhoto);
      if(changes.nombre==='')throw Error('Escribe el nombre completo.');
      const profileRef=doc(espacio(db),'participantes',p.id);
      if(active.checked!==Boolean(p.activo)){
        const enabled=active.checked;
        if(!enabled&&!window.confirm('¿Desactivar el acceso de '+p.nombre+' y conservar su historial?'))return;
        await cambiarEstado(db,p,enabled,changes);
      }else if(Object.keys(changes).length)await updateDoc(profileRef,changes);
      await reload('Datos guardados.');
    },onError);
  }
  if(editOnly)return;
  const batch=section(root,'Importar altas preparadas');
  const file=document.createElement('input');file.type='file';file.accept='.json';file.required=true;
  const label=document.createElement('label');label.textContent='Archivo privado de altas';label.append(file);batch.append(label);
  submit(batch,'Registrar cuentas',async()=>{
    const rows=JSON.parse(await file.files[0].text());
    if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('Selecciona un archivo de altas válido.');
    const names=new Set(),fold=t=>String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    for(const r of rows){
      if(!r||!/^([a-z0-9][a-z0-9._-]{2,31})$/.test(r.usuario)||r.usuario==='coordinacion'||typeof r.claveTemporal!=='string'||r.claveTemporal.length<12||typeof r.nombre!=='string'||!r.nombre.trim()||names.has(r.usuario))throw Error('Hay datos incompletos o usuarios duplicados.');
      names.add(r.usuario);
      if(people.some(p=>p.usuario!==r.usuario&&fold(p.nombre)===fold(r.nombre)))throw Error('Ya existe un expediente a nombre de '+r.nombre+'. Revisa el directorio.');
    }
    for(const r of rows){
      const data=Object.fromEntries(fields.filter(([k])=>typeof r[k]==='string').map(([k])=>[k,r[k].trim()]));
      if(r.muestra===true)data.muestra=true;
      try{await alta(app,db,r.usuario,r.claveTemporal,data)}
      catch(e){throw Error('Revisa el alta de '+r.nombre+': '+e.message)}
    }
    await reload('Altas registradas. Los usuarios y claves iniciales están en tu archivo privado.');
  },onError);
  const create=section(root,'Dar de alta a un joven');
  const user=input(create,'Usuario nuevo (letras, números, punto y guion)','usuario',true);
  user.pattern='[a-z0-9][a-z0-9._\\-]{2,31}';
  const profile=new Map(fields.map(([k,title])=>[k,input(create,title,k,k==='nombre')]));
  const newPhoto=photoField(create);
  const temp=input(create,'Clave temporal para entregar en privado','temporal');
  temp.value=Array.from(crypto.getRandomValues(new Uint8Array(14)),b=>b.toString(16).padStart(2,'0')).join('');
  temp.readOnly=true;
  const saved=input(create,'Ya guardé el usuario y su clave para entregarlos','guardado',true);
  saved.type='checkbox';saved.style.width='auto';
  submit(create,'Crear cuenta y expediente',async()=>{
    const name=user.value.trim().toLowerCase();
    if(people.some(p=>p.usuario===name)||name==='coordinacion')throw Error('Ese usuario ya existe.');
    const data=Object.fromEntries([...profile].map(([k,v])=>[k,v.value.trim()]));
    if(newPhoto.files[0])data.foto=await profilePhoto(newPhoto);
    if(!data.nombre)throw Error('Escribe el nombre completo.');
    await alta(app,db,name,temp.value,data);
    await reload('Cuenta creada. El joven ya puede entrar con su clave temporal.');
  },onError);
}

async function alta(app,db,name,password,data){
    const secondary=initializeApp(app.options,'alta-'+crypto.randomUUID());
    try{
      const aux=initializeAuth(secondary,{persistence:inMemoryPersistence});
      const email=name+dominioUsuario;
      let credential;
      try{credential=await createUserWithEmailAndPassword(aux,email,password)}
      catch(e){
        if(e.code!=='auth/email-already-in-use')throw e;
        try{credential=await signInWithEmailAndPassword(aux,email,password)}
        catch{throw Error('Ese usuario ya está reservado. Elige otro.')}
      }
      const uid=credential.user.uid;
      await runTransaction(db,async tx=>{
        const ref=doc(espacio(db),'accesos',uid);
        const personRef=doc(espacio(db),'participantes',uid);
        const [access,person]=await Promise.all([tx.get(ref),tx.get(personRef)]);
        if(access.exists()||person.exists()){
          if(access.data()?.participante===uid&&person.data()?.usuario===name)return;
          throw Error('Ese usuario ya tiene otro expediente.');
        }
        tx.set(personRef,{...data,usuario:name,fechaAlta:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mazatlan'}).format(new Date()),activo:true,faltasPorMes:{},bajaPorFaltas:false});
        tx.set(ref,{participante:uid,activo:true,listo:false});
      });
    }finally{await deleteApp(secondary)}
}
