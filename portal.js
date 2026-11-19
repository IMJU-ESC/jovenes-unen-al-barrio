import {icon,navigation} from './navegacion.js';
import {decode,imageCanvas,renderBadge,saveBadge,badgeQR,saveRosterBadges} from './credencial.js';
import {saveRows,prepararAsistencia,limiteFaltas} from './movimientos.js';
import {accountForms,awaitActivation,linkEmail,bindProfile} from './cuentas.js';
import {manageRoster} from './padron.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,updatePassword} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,getDocs,getDocsFromServer,setDoc,updateDoc,runTransaction,query,where} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const app=initializeApp(await (await fetch('./firebase-web.json')).json());
const auth=getAuth(app), db=getFirestore(app);
const el=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mazatlan'}).format(new Date());
const content=el('content');
let selectedMonth=stamp().slice(0,7),people=[],activities=[],records=[],access=null,stream=null,frame=0,revision=0;
let profileId='', directoryQuery='';
let page='inicio', cameraVersion=0, selectedEvent='',lastScan='',dirty=false;
function stopCamera(){cameraVersion++;cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());stream=null}
function notice(s){el('notice').textContent=s}
function report(e){notice(e.code==='auth/invalid-credential'?'Revisa tu usuario y contraseña.':e.code==='permission-denied'?'Tu cuenta no tiene acceso a estos datos.':e.message||'No se pudo completar la operación.')}
async function action(fn,button){if(button?.disabled)return;if(button)button.disabled=true;notice('');try{await fn()}catch(e){report(e)}finally{if(button)button.disabled=false}}
function form(id,fn){el(id).onsubmit=e=>{e.preventDefault();const f=e.currentTarget;action(()=>fn(Object.fromEntries(new FormData(f))),f.querySelector('button[type=submit],button:not([type])'))}}
function field(label,name,type='text',extra=''){return '<label>'+label+'<input name="'+name+'" type="'+type+'" '+extra+' required></label>'}
function select(label,name,options){return '<label>'+label+'<select name="'+name+'" required>'+options+'</select></label>'}
function opts(xs,label){return xs.map(x=>'<option value="'+escape(x.id)+'">'+escape(label(x))+'</option>').join('')}
function snapshot(s){return s.docs.map(d=>({...d.data(),id:d.id}))}
function sum(rs){return rs.reduce((n,r)=>n+(r.estado==='presente'?Number(r.horas):0),0)}
accountForms(auth,form,notice);
form('loginForm',async d=>{await signInWithEmailAndPassword(auth,d.user.trim().toLowerCase()+(d.user.includes('@')?'':'@acceso.imju.invalid'),d.pass);el('loginForm').reset()});
el('logout').onclick=()=>{if(guard())action(()=>signOut(auth))};

onAuthStateChanged(auth,user=>{revision++;page='inicio';profileId='';directoryQuery='';dirty=false;lastScan='';selectedEvent='';stopCamera();content.replaceChildren();people=[];activities=[];records=[];access=null;notice('');el('login').hidden=!!user;el('account').hidden=!user;if(user){content.innerHTML='<p role="status" class="card">Cargando tu panel…</p>';action(async()=>{try{await load(user)}catch(err){if(auth.currentUser?.uid===user.uid){content.innerHTML='<button id="retry">Volver a cargar mi panel</button>';el('retry').onclick=()=>action(()=>load(user))}throw err}})}});
async function load(user){
 const seq=++revision;stopCamera();const s=await getDoc(doc(db,'accesos',user.uid));if(seq!==revision)return;
 if(!s.exists()){awaitActivation({user,db,content,notice,action,refresh:()=>load(user)});return}
 if(!s.data().activo)throw Error('Solicita a coordinación la activación de tu cuenta.');
 access=s.data();
 if(!access.listo){content.innerHTML='<form id="rotate"><h2>Elige tu contraseña personal</h2>'+field('Nueva contraseña (mínimo 10 caracteres)','a','password','minlength="10" autocomplete="new-password"')+field('Repite la contraseña','b','password','autocomplete="new-password"')+'<button>Guardar y entrar</button></form>';form('rotate',async d=>{if(d.a!==d.b)throw Error('Las contraseñas deben coincidir.');await updatePassword(user,d.a);await updateDoc(s.ref,{listo:true});await load(user)});return}
 const admin=access.participante==='ADMIN';
 const [list,agenda]=await Promise.all([admin?getDocs(collection(db,'participantes')).then(snapshot):getDoc(doc(db,'participantes',access.participante)).then(d=>d.exists()?[{...d.data(),id:d.id}]:[]),getDocs(collection(db,'actividades')).then(snapshot)]);
 const rows=(await Promise.all(list.map(async p=>snapshot(await getDocs(query(collection(db,'participantes',p.id,'registros'),where('fecha','>=',selectedMonth+'-01'),where('fecha','<=',selectedMonth+'-31')))).map(r=>({...r,person:p.id}))))).flat();
 if(seq!==revision)return;
 const prepared=await Promise.all(list.map(p=>prepararAsistencia(db,p,admin)));
 if(seq!==revision)return;
 people=prepared.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));activities=agenda.sort((a,b)=>a.fecha.localeCompare(b.fecha));records=rows.sort((a,b)=>b.fecha.localeCompare(a.fecha));draw(admin)
}
function downloadCsv(rs){const quote=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};const head=['joven','usuario','comunidad','generacion','telefono','dependencia','actividad','tipo_horas','fecha','asistencia','horas','total_actividades_de_80','total_aprendizaje_de_10','total_programa_de_90','observaciones'];const data=rs.map(r=>{const p=people.find(p=>p.id===r.person);return [p.nombre,p.usuario,p.comunidad,p.generacion,p.telefono,p.dependencia,r.titulo,r.categoria,r.fecha,r.tipo==='manual'?'asignacion_manual':r.estado,r.horas,...['actividad','aprendizaje'].map(c=>sum(rs.filter(x=>x.person===r.person&&x.categoria===c))),sum(rs.filter(x=>x.person===r.person)),r.nota||(r.tipo==='manual'?r.titulo:'')]});const blob=new Blob(['\ufeff'+[head,...data].map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='IMJU-'+selectedMonth+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),5000)}

const adminPages={inicio:'Inicio',qr:'Escanear QR',lista:'Pasar lista',padron:'Directorio de jóvenes',agenda:'Actividades',horas:'Horas e historial',cuenta:'Accesos'};
const memberPages={inicio:'Inicio',gafete:'Mi gafete',agenda:'Calendario',horas:'Mis horas',cuenta:'Mi cuenta'};
const categories='<option value="actividad">Actividad</option><option value="aprendizaje">Aprendizaje</option>';
const states='<option value="presente">Presente</option><option value="justificada">Falta justificada</option><option value="falta">Falta injustificada</option>';
const labelState=s=>({presente:'Presente',falta:'Falta injustificada',justificada:'Falta justificada'})[s]||s;
const initials=s=>s.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('');
const fullDate=d=>new Date(d+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long'});
function avatar(p){return p.foto?'<img class="avatar" src="'+escape(p.foto)+'" alt="">':'<span class="avatar fallback">'+escape(initials(p.nombre))+'</span>'}
function guard(){return !dirty||window.confirm('¿Salir y descartar los cambios pendientes?')}
function navigate(next){
  if(next===page){const menu=content.querySelector('.nav-more');if(menu)menu.open=false;return}
  if(!guard())return;
  if(next==='padron')profileId='';
  dirty=false;page=next;notice('');draw(access.participante==='ADMIN');
  el('viewTitle').focus();window.scrollTo(0,0);
}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
document.addEventListener('click',e=>{
  const menu=content.querySelector('.nav-more[open]');
  if(menu&&!menu.contains(e.target))menu.open=false;
});
document.addEventListener('keydown',e=>{
  const menu=content.querySelector('.nav-more[open]');
  if(menu&&e.key==='Escape'){menu.open=false;menu.querySelector('summary').focus()}
});
function draw(admin){
  stopCamera();
  const pages=admin?adminPages:memberPages;
  if(!(page in pages))page='inicio';
  const monthly=activities.filter(a=>a.fecha?.startsWith(selectedMonth));
  const monthControl=['cuenta','gafete'].includes(page)?'':'<label class="month">Mes de consulta<input id="month" type="month" value="'+escape(selectedMonth)+'"></label>';
  content.innerHTML='<div class="desk">'+navigation(pages,page,admin)+'<section class="workspace"><div class="view-head"><div><p class="kicker">'+(admin?'Coordinación · IMJU':'Mi participación · IMJU')+'</p><h2 id="viewTitle" tabindex="-1">'+pages[page]+'</h2></div>'+monthControl+'</div><div id="view"></div></section></div>';
  content.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
  if(el('month'))el('month').onchange=e=>{
    const value=e.target.value;
    if(!value||!guard()){e.target.value=selectedMonth;return}
    dirty=false;selectedMonth=value;selectedEvent='';lastScan='';
    action(async()=>{await load(auth.currentUser)});
  };
  const view=el('view'), reload=async message=>{dirty=false;await load(auth.currentUser);notice(message)};
  if(page==='inicio')dashboard(view,admin,monthly);
  if(page==='gafete'&&people[0])badge(view,people[0]);
  if(page==='qr'||page==='lista')attendanceView(view,monthly,reload,page==='qr');
  if(page==='padron')directory(view,reload);
  if(page==='agenda')calendar(view,monthly,admin,reload);
  if(page==='horas')hours(view,admin,reload);
  if(page==='cuenta'){
    view.innerHTML='<section class="card"><h3>Cuenta actual</h3><p>'+escape(auth.currentUser.email)+'</p></section>';
    linkEmail(auth.currentUser,view,form,notice);
    if(admin){view.insertAdjacentHTML('beforeend','<a class="action-link" href="./entrega.html">Preparar mensajes de acceso</a><section class="card"><h3>Respaldo del programa</h3><p>Descarga el padrón, las fotos disponibles, las actividades y el historial de todos los meses en un archivo privado.</p><button id="backup">Descargar respaldo JSON</button></section>');
    el('backup').onclick=e=>action(async()=>{
      const getAll=async ref=>(await getDocsFromServer(ref)).docs.map(d=>({...d.data(),id:d.id}));
      const [participants,events]=await Promise.all([getAll(collection(db,'participantes')),getAll(collection(db,'actividades'))]);
      const profiles=await Promise.all(participants.map(async p=>({...p,registros:await getAll(collection(db,'participantes',p.id,'registros'))})));
      const file=new Blob([JSON.stringify({version:1,fecha:new Date().toISOString(),participantes:profiles,actividades:events})],{type:'application/json'});
      const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download='IMJU-respaldo-'+stamp()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
    },e.currentTarget);bindProfile(db,view,people,form,notice)}
  }
  if(!admin&&people[0]){
    const p=people[0],actual=stamp().slice(0,7);
    const mes=Object.keys(p.faltasPorMes).sort().find(m=>p.faltasPorMes[m]>=limiteFaltas)||actual;
    const count=p.faltasPorMes[mes]||0;
    if(count){
      const warning=document.createElement('aside');warning.className='session-target';warning.setAttribute('role','status');
      const periodo=new Date(mes+'-15T12:00:00').toLocaleString('es-MX',{month:'long',year:'numeric'});
      warning.textContent=(count>=3?'Baja por '+count+' faltas injustificadas en '+periodo+'.':count===2?'Tienes 2 faltas injustificadas en '+periodo+'. Una más este mes causa baja automática.':'Tienes una falta injustificada en '+periodo+'. La tercera del mismo mes causa baja automática.')+' Para aclaraciones, comunícate con coordinación.';
      view.prepend(warning);
    }
  }
  view.querySelectorAll('form').forEach(f=>f.addEventListener('input',()=>{dirty=true}));
}
function metric(value,label){return '<article class="metric"><strong>'+escape(value)+'</strong><span>'+label+'</span></article>'}
function dashboard(view,admin,monthly){
  const mainTask=admin?'qr':'gafete';
  const shortcuts=admin?[['lista','Pasar lista'],['padron','Buscar joven'],['horas','Sumar horas']]:[['horas','Ver mis horas'],['agenda','Ver calendario']];
  const activity=sum(records.filter(r=>r.categoria==='actividad')),learning=sum(records.filter(r=>r.categoria==='aprendizaje'));
  const upcoming=monthly.filter(a=>a.fecha>=stamp());
  const hero='<section class="task-hero"><div><h3>'+escape(admin?'Registro de asistencia':people[0]?.nombre||'Mi participación')+'</h3><p>'+(admin?'Escanea el gafete de cada joven al llegar a la actividad.':'Ten tu credencial a la mano para registrar tu asistencia.')+'</p><button data-open="'+mainTask+'">'+icon(mainTask)+(admin?'Escanear gafete':'Mostrar mi gafete')+'</button></div><img src="./patio.webp" alt=""></section>';
  const actions='<div class="task-grid">'+shortcuts.map(([id,label])=>'<button data-open="'+id+'"><span class="task-icon">'+icon(id)+'</span>'+label+icon('flecha')+'</button>').join('')+'</div>';
  const metrics=(admin?metric(people.filter(p=>p.activo).length,'Jóvenes activos'):'')+metric(sum(records)+' h','Horas acreditadas')+metric(activity+' h','Actividad')+metric(learning+' h','Aprendizaje');
  const absences=records.filter(r=>r.estado==='falta').length+' injustificadas · '+records.filter(r=>r.estado==='justificada').length+' justificadas';
  view.innerHTML=hero+actions+'<div class="overview"><section class="card totals"><h3>Balance del mes</h3><div class="metrics">'+metrics+'</div><p class="absence">Faltas · '+absences+'</p></section><section class="card"><h3>Próximas actividades</h3>'+(upcoming.length?agendaList(upcoming.slice(0,3)):'<p class="empty">Sin actividades pendientes en el mes seleccionado.</p>')+'<button class="text-button" data-open="agenda">Ver calendario completo '+icon('flecha')+'</button></section></div>';
  view.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{navigate(b.dataset.open);if(b.dataset.open==='horas'&&admin)openManual()});
}
function agendaList(list){
  return list.length?list.map(a=>'<article class="event"><time datetime="'+escape(a.fecha)+'"><b>'+escape(a.fecha.slice(8))+'</b>'+escape(new Date(a.fecha+'T12:00:00').toLocaleString('es-MX',{month:'short'}))+'</time><div><strong>'+escape(a.titulo)+'</strong><p>'+escape([a.hora,a.lugar,a.categoria,a.horas+' h'].filter(Boolean).join(' · '))+'</p>'+(a.descripcion?'<p>'+escape(a.descripcion)+'</p>':'')+'</div></article>').join(''):'<p class="empty">Sin actividades programadas en este mes.</p>';
}
function badge(view,p,showFields=true){
  const url=badgeQR(p);
  view.innerHTML='<section class="gafete-panel"><div class="gafete-preview" aria-live="polite">Preparando la credencial…</div><div class="gafete-actions"><h3>Credencial individual</h3><p>Gafete de 8.5 × 11.5 cm con vigencia de octubre de 2026 a octubre de 2027. Coloca el sello sobre el borde de la foto, dejando visible el rostro. Imprime el PDF en hoja carta al 100 % y recorta por las marcas.</p><button class="pdf" disabled>Descargar PDF para imprimir</button><button class="png light" disabled>Guardar imagen para celular</button><a class="action-link" href="'+url+'" download="QR-IMJU.gif">Descargar solo el QR</a></div></section>'+(showFields?'<section class="card"><h3>Mi expediente</h3>'+personFields(p)+'</section>':'');
  const preview=view.querySelector('.gafete-preview'),pdf=view.querySelector('.pdf'),png=view.querySelector('.png');
  renderBadge(p,url).then(canvas=>{
    if(!preview.isConnected)return;
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Credencial de '+p.nombre+' · '+p.usuario+' con QR y vigencia');
    preview.replaceChildren(canvas);
    for(const [button,format] of [[pdf,'pdf'],[png,'png']]){
      button.disabled=false;button.onclick=()=>action(()=>saveBadge(canvas,p,format),button);
    }
  }).catch(()=>{if(preview.isConnected)preview.textContent='No se pudo cargar la credencial. Actualiza la página para volver a intentarlo.'});
}
function openManual(person){
  const f=el('manual');if(!f)return;
  if(person)f.elements.person.value=person;
  f.closest('details').open=true;f.scrollIntoView({block:'center'});f.elements.hours.focus();
}
function personFields(p){return '<dl>'+[['Comunidad',p.comunidad],['Generación',p.generacion],['Teléfono',p.telefono],['Dependencia',p.dependencia],['Usuario',p.usuario],['Estado',p.bajaPorFaltas?'Baja por faltas':p.activo?'Activo':'Inactivo'],['Faltas injustificadas · '+selectedMonth,String(p.faltasPorMes?.[selectedMonth]||0)]].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+escape(v||'Pendiente')+'</dd></div>').join('')+'</dl>'}
function directory(view,reload){
  const person=people.find(p=>p.id===profileId);
  if(person){
    view.innerHTML='<button class="light" id="backDirectory">← Volver al directorio</button><section class="profile-head">'+avatar(person)+'<div><h3>'+escape(person.nombre)+'</h3><p>Usuario del padrón · <strong>'+escape(person.usuario)+'</strong></p></div></section><div class="quick profile-controls"><button id="profileEdit">Editar expediente</button><button class="light" id="profileAccess" '+(person.activo?'':'disabled')+'>Recuperar acceso</button><button id="profileHours" '+(person.activo?'':'disabled')+'>Sumar horas</button><button class="light" data-task="qr">Escanear QR</button><button class="light" data-task="lista">Pasar lista</button></div><section class="card"><h3>Datos del joven</h3>'+personFields(person)+'<p><strong>'+sum(records.filter(r=>r.person===person.id))+' h</strong> acreditadas en el mes seleccionado</p></section><div id="profileBadge"></div><section id="profileEditor" hidden></section>';
    badge(el('profileBadge'),person,false);
    const editor=el('profileEditor');
    el('profileEdit').onclick=()=>{
      if(!editor.childElementCount)manageRoster(editor,{app,db,people:[person],reload,onError:report,editOnly:true});
      editor.hidden=false;editor.querySelector('details').open=true;editor.scrollIntoView({block:'center'});editor.querySelector('input[name=nombre]').focus();
      editor.oninput=()=>{dirty=true};
    };
    el('profileAccess').onclick=()=>{
      navigate('cuenta');
      if(page!=='cuenta')return;
      const picker=el('bindPerson');
      picker.value=person.id;
      picker.closest('details').open=true;
      const uid=el('bindProfile').elements.uid;
      uid.focus();uid.scrollIntoView({block:'center'});
    };
    el('profileHours').onclick=()=>{navigate('horas');if(page==='horas')openManual(person.id)};
    view.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>navigate(b.dataset.task));
    el('backDirectory').onclick=()=>{if(!guard())return;dirty=false;profileId='';draw(true);el('findPerson').focus()};
    return;
  }
  view.innerHTML='<label>Buscar joven<input type="search" id="findPerson" placeholder="Nombre, usuario o comunidad"></label><div id="cards" class="people-grid"></div><div id="rosterTools"></div>';
  view.insertAdjacentHTML('afterbegin','<section class="card"><h3>Gafetes del padrón</h3><p>Cuatro por hoja carta, de 8.5 × 11.5 cm. Imprime al 100 %. Los inactivos aparecen identificados.</p><button id="printRoster">Descargar todos los gafetes</button><span role="status" id="printProgress"></span></section>');
  const print=el('printRoster'),progress=el('printProgress');
  print.disabled=!people.length;
  print.onclick=()=>action(async()=>{
    try{await saveRosterBadges(people,(n,total)=>{progress.textContent=' Preparando '+n+' de '+total+'…'})}
    finally{progress.textContent=''}
  },print);
  manageRoster(el('rosterTools'),{app,db,people,reload,onError:report,createOnly:true});
  const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const search=el('findPerson');search.value=directoryQuery;
  function filter(){
    directoryQuery=search.value;
    const matches=people.filter(p=>fold([p.nombre,p.usuario,p.comunidad].join(' ')).includes(fold(directoryQuery)));
    el('cards').innerHTML=matches.map(p=>'<button type="button" class="directory-person" data-person="'+escape(p.id)+'">'+avatar(p)+'<span><strong>'+escape(p.nombre)+'</strong><small>Usuario · '+escape(p.usuario)+'</small><small>'+escape(p.comunidad||'Comunidad pendiente')+' · '+sum(records.filter(r=>r.person===p.id))+' h</small></span><b aria-hidden="true">›</b></button>').join('')||'<p>No se encontraron participantes.</p>';
    el('cards').querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{
      if(!guard())return;dirty=false;profileId=b.dataset.person;draw(true);el('backDirectory').focus();window.scrollTo(0,0);
    });
  }
  filter();search.oninput=filter;
}
function activityInputs(){
  return field('Nombre de la actividad','title')+field('Fecha','date','date')+'<label>Hora<input name="time" type="time"></label><label>Lugar<input name="place"></label>'+select('Tipo de horas','category',categories)+field('Horas por joven','hours','number','min="0" max="24" step="1"')+'<label>Descripción<textarea name="description"></textarea></label>';
}
function activityData(d){if(!d.title.trim())throw Error('Escribe el nombre de la actividad.');return {titulo:d.title.trim(),fecha:d.date,hora:d.time,lugar:d.place.trim(),categoria:d.category,horas:Number(d.hours),descripcion:d.description.trim()}}
function calendar(view,monthly,admin,reload){
  if(admin){
    view.innerHTML='<details><summary>Crear actividad</summary><form id="newact">'+activityInputs()+'<button>Publicar actividad</button></form></details>';
    el('newact').elements.date.value=stamp();
    form('newact',async d=>{await setDoc(doc(collection(db,'actividades')),activityData(d));selectedMonth=d.date.slice(0,7);await reload('Actividad publicada.')});
  }
  for(const a of monthly){
    const item=document.createElement('section');item.className='card';item.innerHTML=agendaList([a]);view.append(item);
    if(a.evidencias?.length){const gallery=document.createElement('div');gallery.className='gallery';for(const e of a.evidencias){if(typeof e==='string'&&e.startsWith('data:image/')){const img=new Image();img.src=e;img.alt='Evidencia de '+a.titulo;gallery.append(img)}}item.append(gallery)}
    if(!admin)continue;
    const edit=document.createElement('details');
    edit.innerHTML='<summary>Editar actividad o agregar evidencia</summary><form>'+activityInputs()+'<label>Fotografía de evidencia<input type="file" name="evidence" accept="image/jpeg,image/png,image/webp"></label><button>Guardar cambios</button></form>';item.append(edit);
    const f=edit.querySelector('form');for(const [k,v] of Object.entries({title:a.titulo,date:a.fecha,time:a.hora,place:a.lugar,category:a.categoria,hours:a.horas,description:a.descripcion}))f.elements[k].value=v??'';
    f.onsubmit=e=>{e.preventDefault();action(async()=>{
      const data=activityData(Object.fromEntries(new FormData(f))), file=f.elements.evidence.files[0];
      const photo=file?(await imageCanvas(file,768)).toDataURL('image/jpeg',0.65):null;
      // Las participaciones guardadas conservan la fecha, categoría y horas acreditadas.
      await runTransaction(db,async tx=>{
        const ref=doc(db,'actividades',a.id),current=(await tx.get(ref)).data();
        if(!current)throw Error('La actividad ya no existe.');
        const updates={};
        for(const [k,v] of Object.entries(data))if(v!==(a[k]??'')){if(current[k]!==a[k])throw Error('Otro coordinador modificó la actividad. Actualiza el panel.');updates[k]=v}
        if(photo){const images=[...(current.evidencias||[]),photo];if(JSON.stringify(images).length>780000)throw Error('Esta actividad alcanzó el espacio para fotografías.');updates.evidencias=images}
        if(Object.keys(updates).length)tx.update(ref,updates);
      });selectedMonth=data.fecha.slice(0,7);await reload('Actividad actualizada.');
    },f.querySelector('button'))};
  }
  if(!monthly.length)view.insertAdjacentHTML('beforeend',agendaList([]));
}
function attendanceView(view,monthly,reload,scanner){
  const options=monthly.filter(a=>a.fecha<=stamp());
  if(!options.some(a=>a.id===selectedEvent))selectedEvent=options.find(a=>a.fecha===stamp())?.id||(options.length===1?options[0].id:'');
  view.innerHTML='<section class="card"><label>Actividad<select id="pickEvent"><option value="">Elige la actividad</option>'+opts(options,a=>fullDate(a.fecha)+' · '+a.titulo)+'</select></label><div id="sessionTools"></div></section>';
  const picker=el('pickEvent');picker.value=selectedEvent;
  picker.onchange=()=>{if(!guard()){picker.value=selectedEvent;return}dirty=false;selectedEvent=picker.value;lastScan='';draw(true)};
  const a=options.find(a=>a.id===selectedEvent),root=el('sessionTools');
  if(!a){root.textContent=options.length?'Selecciona la actividad que vas a registrar.':'Sin actividades para registrar hasta hoy en el mes elegido.';return}
  root.innerHTML='<div class="session-target"><strong>'+escape(a.titulo)+'</strong><p>'+escape([fullDate(a.fecha),a.horas+' h',a.categoria,a.lugar].filter(Boolean).join(' · '))+'</p></div>';
  const changeMode=document.createElement('button');
  changeMode.className='light';changeMode.type='button';
  changeMode.textContent=scanner?'Pasar lista para esta actividad':'Escanear QR para esta actividad';
  changeMode.onclick=()=>navigate(scanner?'lista':'qr');
  root.querySelector('.session-target').append(changeMode);
  if(scanner){scannerTools(root,a,reload);pendingAttendance(root,a,reload)}else roster(root,a,reload);
}
function pendingAttendance(root,a,reload){
  const saved=new Set(records.filter(r=>r.id===a.id).map(r=>r.person));
  const pending=people.filter(p=>p.activo&&!saved.has(p.id));
  const section=document.createElement('section');
  section.className='scan-pending';
  section.innerHTML='<h3>Pendientes de asistencia · '+pending.length+'</h3>';
  if(!pending.length)section.insertAdjacentHTML('beforeend','<p>Todos los participantes activos tienen registro para este evento.</p>');
  for(const p of pending){
    const row=document.createElement('div');row.className='event';
    row.innerHTML='<div><strong>'+escape(p.nombre)+'</strong><p>'+escape(p.usuario)+'</p><div class="quick"><button type="button" data-state="falta">Marcar falta</button><button type="button" class="light" data-state="justificada">Justificar falta</button></div></div>';
    row.querySelectorAll('button').forEach(button=>button.onclick=()=>action(async()=>{
      const state=button.dataset.state;
      const warning=state==='falta'&&p.faltasPorMes?.[a.fecha.slice(0,7)]===2?' Esta tercera falta del mes causa baja automática.':'';
      if(!confirm('¿Registrar '+labelState(state).toLowerCase()+' para '+p.nombre+' en '+a.titulo+'?'+warning))return;
      const next=attendanceRow(a,state,0,'');
      await saveRows(db,[{person:p.id,id:a.id,prior:null,next}],a);
      if(!root.isConnected)return;
      records=records.filter(r=>r.id!==a.id||r.person!==p.id);
      records.unshift({...next,id:a.id,person:p.id});
      lastScan=p.nombre+' · '+labelState(state);
      el('scanResult').textContent=lastScan;
      pendingAttendance(root,a,reload);
      const fresh=await getDoc(doc(db,'participantes',p.id));
      if(root.isConnected&&fresh.exists())Object.assign(p,fresh.data());
    },button));
    section.append(row);
  }
  const previous=root.querySelector('.scan-pending');
  if(previous)previous.replaceWith(section);else root.append(section);
}
function attendanceRow(a,status,hours,note){
  return {titulo:a.titulo,fecha:a.fecha,categoria:a.categoria,estado:status,horas:status==='presente'?Number(hours):0,tipo:'actividad',nota:note};
}
function scannerTools(root,a,reload){
  root.insertAdjacentHTML('beforeend','<video id="video" muted playsinline hidden></video><div class="quick"><button id="scan">Activar cámara</button><button class="light" id="stop" hidden>Detener cámara</button><label class="action-link">Leer imagen del QR<input class="file-picker" id="qrFile" type="file" accept="image/*"></label></div><p id="scanResult" role="status"></p>');
  const video=el('video'),start=el('scan'),stop=el('stop'),file=el('qrFile'),result=el('scanResult');
  result.textContent=lastScan||'Elige la cámara o una imagen del gafete. Se necesita conexión para guardar la asistencia.';
  if(lastScan)start.textContent='Escanear siguiente joven';
  function idle(){stopCamera();video.srcObject=null;video.hidden=true;stop.hidden=true;start.disabled=false;file.disabled=false}
  async function register(code){
    try{
      const person=code.startsWith('IMJU-JB:1:')&&people.find(p=>p.id===code.slice(10)&&p.activo);
      if(!person)throw Error('El QR no corresponde a un participante activo.');
      result.textContent='Registrando a '+person.nombre+'…';
      const [prior]=await saveRows(db,[{person:person.id,id:a.id,prior:null,next:attendanceRow(a,'presente',a.horas,'')}],a,true);
      if(!root.isConnected)return;
      records=records.filter(r=>r.id!==a.id||r.person!==person.id);
      records.unshift({...(prior||attendanceRow(a,'presente',a.horas,'')),id:a.id,person:person.id});
      lastScan=person.nombre+' · '+(prior?'Registro existente: '+labelState(prior.estado)+' · '+prior.horas+' h.':'Asistencia guardada · '+a.horas+' h.')+' '+a.titulo;
      result.textContent=lastScan;
      pendingAttendance(root,a,reload);
    }catch(e){result.textContent=e.message}
  }
  start.onclick=async()=>{
    idle();const version=cameraVersion;
    start.disabled=file.disabled=true;stop.hidden=false;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Cámara no disponible.');
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(version!==cameraVersion||!video.isConnected){media.getTracks().forEach(t=>t.stop());return}
      stream=media;video.srcObject=media;video.hidden=false;await video.play();
      result.textContent='Centra el QR. Al confirmar el nombre, acerca el siguiente gafete.';
      const c=document.createElement('canvas'),ctx=c.getContext('2d',{willReadFrequently:true});let last=0;
      let previousCode='',lastSeen=0;
      async function tick(now){
        if(version!==cameraVersion)return;
        if(video.readyState>=2&&now-last>=200){
          last=now;
          const scale=Math.min(1,800/Math.max(video.videoWidth,video.videoHeight));
          const w=Math.max(1,Math.round(video.videoWidth*scale)),h=Math.max(1,Math.round(video.videoHeight*scale));
          if(c.width!==w||c.height!==h){c.width=w;c.height=h}
          ctx.drawImage(video,0,0,w,h);
          const code=decode(c);
          if(code){
            const fresh=code!==previousCode||now-lastSeen>1500;
            previousCode=code;lastSeen=now;
            if(fresh){await register(code);lastSeen=performance.now()}
          }
        }
        if(version===cameraVersion)frame=requestAnimationFrame(tick);
      }
      frame=requestAnimationFrame(tick);
    }catch(e){if(version===cameraVersion){idle();result.textContent='No se pudo usar la cámara. Revisa el permiso del navegador o pulsa Leer imagen del QR.'}}
  };
  stop.onclick=idle;
  file.onchange=async()=>{
    const image=file.files[0];file.value='';if(!image)return;idle();const version=cameraVersion;
    start.disabled=file.disabled=true;
    try{const code=decode(await imageCanvas(image,1600),true);if(version!==cameraVersion)return;if(!code)throw Error('No se encontró un QR. Prueba con una imagen nítida del código completo.');await register(code)}
    catch(e){result.textContent=e.message}
    finally{if(version===cameraVersion)start.disabled=file.disabled=false}
  };
  document.onvisibilitychange=()=>{if(document.hidden&&video.isConnected&&(stream||!stop.hidden))idle()};
}
function roster(root,a,reload){
  const prior=new Map(records.filter(r=>r.id===a.id).map(r=>[r.person,r]));
  const active=people.filter(p=>p.activo||prior.has(p.id));
  root.insertAdjacentHTML('beforeend','<form id="bulk"><div class="quick"><button type="button" class="light" id="allPresent">Marcar pendientes como presentes</button></div><div id="group"></div><button>Guardar lista</button></form>');
  for(const p of active){
    const r=prior.get(p.id), row=document.createElement('div');row.className='list-row';row.dataset.id=p.id;
    row.innerHTML='<strong>'+escape(p.nombre)+'</strong><label>Asistencia<select name="state"><option value="">Sin registrar</option>'+states+'</select></label><label>Horas<input type="number" name="hours" min="0" max="24" step="1"></label><label>Observación<input name="note" maxlength="240"></label>';
    const state=row.querySelector('select'),hours=row.querySelector('[name=hours]');state.value=r?.estado||'';hours.value=r?.horas??a.horas;hours.disabled=state.value!=='presente';row.querySelector('[name=note]').value=r?.nota||'';
    state.onchange=()=>{hours.disabled=state.value!=='presente';hours.value=hours.disabled?0:(r?.estado==='presente'?r.horas:a.horas)};
    el('group').append(row);
  }
  el('allPresent').onclick=()=>{for(const select of el('group').querySelectorAll('select'))if(!select.value){select.value='presente';select.onchange();dirty=true}};
  form('bulk',async()=>{
    const changes=[];
    for(const row of el('group').children){
      const id=row.dataset.id,r=prior.get(id),s=row.querySelector('select').value;
      if(!s){if(r)throw Error('Para corregir o eliminar un registro usa Horas e historial.');continue}
      const h=Number(row.querySelector('[name=hours]').value),note=row.querySelector('[name=note]').value.trim();
      if(r&&r.estado===s&&r.horas===h&&(r.nota||'')===note)continue;
      changes.push({person:id,id:a.id,prior:r,next:attendanceRow(a,s,h,note)});
    }
    if(!changes.length){notice('La lista ya está al día.');return}
    await saveRows(db,changes,a);await reload('Lista guardada · '+changes.length+' registros actualizados.');
  });
}
function hours(view,admin,reload){
  if(admin){
    view.innerHTML='<details><summary>Asignar horas manuales</summary><form id="manual">'+select('Participante','person',opts(people.filter(p=>p.activo),p=>p.nombre))+field('Fecha','date','date','value="'+stamp()+'"')+select('Tipo de horas','category',categories)+field('Horas','hours','number','min="1" max="24" step="1"')+field('Motivo','reason')+'<button>Guardar horas</button></form></details><button id="csv" class="light">Descargar reporte mensual CSV</button>';
    const id=crypto.randomUUID();
    form('manual',async d=>{if(!d.reason.trim())throw Error('Escribe el motivo.');await saveRows(db,[{id,person:d.person,prior:null,next:{titulo:d.reason.trim(),fecha:d.date,categoria:d.category,estado:'presente',horas:Number(d.hours),tipo:'manual',nota:''}}]);selectedMonth=d.date.slice(0,7);await reload('Horas guardadas.')});
    el('csv').onclick=()=>downloadCsv(records);
  }
  view.insertAdjacentHTML('beforeend','<section class="card"><h3>Historial del mes</h3><div id="history"></div></section>');
  const history=el('history');
  if(!records.length)history.textContent='Este mes todavía no tiene registros.';
  for(const r of records){
    const item=document.createElement('article');item.className='history-item';
    item.innerHTML='<div><strong>'+escape(r.titulo)+'</strong><p>'+escape([admin?people.find(p=>p.id===r.person)?.nombre:'',fullDate(r.fecha),r.categoria,r.tipo==='manual'?'Asignación directa':'',labelState(r.estado)].filter(Boolean).join(' · '))+'</p>'+(r.nota?'<small>'+escape(r.nota)+'</small>':'')+'</div><b>'+escape(r.horas)+' h</b>';
    if(admin){
      const edit=document.createElement('details');edit.innerHTML='<summary>Corregir registro</summary><form>'+select('Estado','state',states)+field('Horas','hours','number','min="0" max="24" step="1"')+'<label>Observaciones<input name="note" maxlength="240"></label><button>Guardar corrección</button><button type="button" class="light">Eliminar registro</button></form>';item.append(edit);
      const f=edit.querySelector('form');f.elements.state.value=r.estado;f.elements.state.disabled=r.tipo==='manual';f.elements.hours.value=r.horas;f.elements.note.value=r.nota||'';
      const buttons=f.querySelectorAll('button');
      f.onsubmit=e=>{e.preventDefault();action(async()=>{const {id,person,...data}=r;data.estado=f.elements.state.value;data.horas=data.estado==='presente'?Number(f.elements.hours.value):0;data.nota=f.elements.note.value.trim();await saveRows(db,[{person,id,prior:r,next:data}]);await reload('Registro corregido.')},buttons[0])};
      buttons[1].onclick=()=>{if(confirm('¿Eliminar este registro de '+r.horas+' horas del historial?'))action(async()=>{await saveRows(db,[{person:r.person,id:r.id,prior:r,next:null}]);await reload('Registro eliminado.')},buttons[1])};
    }
    history.append(item);
  }
}
