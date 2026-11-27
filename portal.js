import {prefijoQR} from './dependencias.js';
import {espacio,dependencia,nombreDependencia,dominioUsuario,enlace} from './dependencias.js';
import {acumularHoras,mostrarAvance} from './avance-horas.js?v=horas4';
import {browserLocalPersistence,browserSessionPersistence,collection,doc,getDoc,getDocs,getDocsFromServer,indexedDBLocalPersistence,initializeApp,initializeAuth,initializeFirestore,onAuthStateChanged,query,runTransaction,setDoc,signInWithEmailAndPassword,signOut,updateDoc,updatePassword,where} from './firebase-sdk-11.10.0.js';
import {icon,navigation} from './navegacion.js?v=barrio13';
import {cargarQR,decode,imageCanvas,renderBadge,saveBadge,badgeQR,saveRosterBadges} from './credencial.js?v=logos1';
import {saveRows,prepararAsistencia,limiteFaltas} from './movimientos.js?v=eventos15';
import {accountForms,awaitActivation,linkEmail,bindProfile} from './cuentas.js?v=acceso14';
import {manageRoster,cambiarEstado,cambiarClaveDeAlta} from './padron.js?v=alta10';

const app=initializeApp(await (await fetch('./firebase-web.json')).json());
const auth=initializeAuth(app,{persistence:[indexedDBLocalPersistence,browserLocalPersistence,browserSessionPersistence]});
const redMovil=new URLSearchParams(location.search).get('red')==='movil';
const db=initializeFirestore(app,redMovil?{experimentalForceLongPolling:true,experimentalLongPollingOptions:{timeoutSeconds:10}}:{});
if(dependencia){
  document.querySelector('#login .intro p').textContent=nombreDependencia;
  document.querySelector('#register summary').textContent='Crear acceso con correo';
  document.title=nombreDependencia+' · Jóvenes Unen al Barrio';
  document.querySelector('#modoMovil a').href=enlace('./?red=movil');
}
const el=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mazatlan'}).format(new Date());
const content=el('content');
let selectedMonth=stamp().slice(0,7),people=[],activities=[],records=[],access=null,stream=null,frame=0,revision=0;
let profileId='', directoryQuery='';
let mostrarBajas=false;
let page='inicio', cameraVersion=0, selectedEvent='',lastScan='',dirty=false;
function stopCamera(){cameraVersion++;cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());stream=null}
function notice(s){el('notice').textContent=s}
function report(e){if(e.code==='auth/too-many-requests'){notice('Demasiados intentos. Espera antes de volver a entrar. Si tienes dudas sobre tu clave, pide ayuda a coordinación.');return}if(!navigator.onLine||['unavailable','auth/network-request-failed','deadline-exceeded'].includes(e.code)){notice('Se interrumpió la conexión. Comprueba tus datos móviles y vuelve a intentar.');return}notice(e.code==='auth/invalid-credential'?'Revisa tu usuario y contraseña.':e.code==='permission-denied'?'Tu cuenta no tiene acceso a estos datos.':e.message||'No se pudo completar la operación.')}
async function action(fn,button){if(button?.disabled)return;if(button)button.disabled=true;notice('');try{await fn()}catch(e){report(e)}finally{if(button)button.disabled=false}}
function form(id,fn){el(id).onsubmit=e=>{e.preventDefault();const f=e.currentTarget;action(()=>fn(Object.fromEntries(new FormData(f))),f.querySelector('button[type=submit],button:not([type])'))}}
function field(label,name,type='text',extra=''){return '<label>'+label+'<input name="'+name+'" type="'+type+'" '+extra+' required></label>'}
function select(label,name,options){return '<label>'+label+'<select name="'+name+'" required>'+options+'</select></label>'}
function opts(xs,label){return xs.map(x=>'<option value="'+escape(x.id)+'">'+escape(label(x))+'</option>').join('')}
function snapshot(s){return s.docs.map(d=>({...d.data(),id:d.id}))}
function sum(rs){return rs.reduce((n,r)=>n+(r.estado==='presente'?Number(r.horas):0),0)}
accountForms(auth,form,notice);
form('loginForm',async d=>{await signInWithEmailAndPassword(auth,d.user.trim().toLowerCase()+(d.user.includes('@')?'':dominioUsuario),d.pass);el('loginForm').reset()});
const claveDialogo=el('claveDialogo'),claveForm=el('claveForm'),abrirClave=el('abrirClave');
function cerrarCambioClave(){
  if(claveDialogo.open)claveDialogo.close();
  claveForm.reset();
  el('claveEstado').textContent='';
}
abrirClave.onclick=()=>{
  if(!auth.currentUser||!access?.listo)return;
  const {actual,nueva}=claveForm.elements;
  const coordinador=access.participante==='ADMIN';
  actual.disabled=coordinador;
  actual.closest('label').hidden=coordinador;
  claveDialogo.showModal();
  (coordinador?nueva:actual).focus();
};
el('cancelarClave').onclick=cerrarCambioClave;
claveDialogo.onclose=()=>{claveForm.reset();el('claveEstado').textContent=''};
claveDialogo.oncancel=e=>{if(claveForm.elements.guardar.disabled)e.preventDefault()};
claveForm.onsubmit=async e=>{
  e.preventDefault();
  const {actual,nueva,repetir,guardar}=claveForm.elements;
  const estado=el('claveEstado'),user=auth.currentUser;
  if(guardar.disabled||!user?.email)return;
  if(nueva.value!==repetir.value){estado.textContent='Las contraseñas nuevas deben coincidir.';repetir.focus();return}
  if(access?.participante!=='ADMIN'&&actual.value===nueva.value){estado.textContent='Elige una contraseña diferente de la actual.';nueva.focus();return}
  guardar.disabled=el('cancelarClave').disabled=true;
  estado.textContent='Guardando tu contraseña…';
  const nuevaClave=nueva.value;
  try{
    let titular=user;
    if(access?.participante!=='ADMIN'){
      const sesion=await signInWithEmailAndPassword(auth,user.email,actual.value);
      titular=sesion.user;
    }
    if(titular.uid!==user.uid||auth.currentUser?.uid!==user.uid)throw Error();
    await updatePassword(titular,nuevaClave);
    cerrarCambioClave();
    notice('Contraseña actualizada. En tu próximo ingreso usa tu mismo usuario y la nueva contraseña.');
  }catch(error){
    const mensajes={'auth/requires-recent-login':'Vuelve a iniciar sesión y abre Cambiar mi contraseña otra vez. Si olvidaste tu clave, usa Olvidé mi contraseña en la pantalla de ingreso.','auth/invalid-credential':'Revisa tu contraseña actual.','auth/wrong-password':'Revisa tu contraseña actual.','auth/too-many-requests':'Hubo demasiados intentos. Espera antes de volver a probar.','auth/network-request-failed':'Revisa tu conexión y vuelve a intentar.','auth/weak-password':'Elige una contraseña más segura.','auth/password-does-not-meet-requirements':'Elige una contraseña más segura.'};
    estado.textContent=mensajes[error.code]||'No se pudo confirmar el cambio. Vuelve a intentarlo.';
  }finally{guardar.disabled=el('cancelarClave').disabled=false}
};
el('logout').onclick=()=>{if(guard())action(()=>signOut(auth))};

onAuthStateChanged(auth,user=>{cerrarCambioClave();abrirClave.hidden=true;revision++;page='inicio';profileId='';directoryQuery='';dirty=false;lastScan='';selectedEvent='';stopCamera();content.replaceChildren();people=[];activities=[];records=[];access=null;notice('');el('login').hidden=!!user;el('account').hidden=!user;if(user){content.innerHTML='<p role="status" class="card">Cargando tu panel…</p>'+(redMovil?'':'<a href="'+escape(enlace('./?red=movil'))+'">¿Tarda en abrir? Probar conexión móvil</a>');action(async()=>{try{await load(user)}catch(err){if(auth.currentUser?.uid===user.uid){content.innerHTML='<button id="retry">Volver a cargar mi panel</button>'+(redMovil?'':'<a href="'+escape(enlace('./?red=movil'))+'">Probar conexión móvil</a>');el('retry').onclick=()=>action(()=>load(user))}throw err}})}});
async function load(user){
 const seq=++revision;stopCamera();const s=await getDoc(doc(espacio(db),'accesos',user.uid));if(seq!==revision)return;
 if(!s.exists()){awaitActivation({user,db,content,notice,action,refresh:()=>load(user)});return}
 if(!s.data().activo)throw Error('Solicita a coordinación la activación de tu cuenta.');
 access=s.data();
 if(!access.listo){content.innerHTML='<form id="rotate"><h2>Elige tu contraseña personal</h2>'+field('Nueva contraseña (mínimo 10 caracteres)','a','password','minlength="10" autocomplete="new-password"')+field('Repite la contraseña','b','password','autocomplete="new-password"')+'<button>Guardar y entrar</button></form>';form('rotate',async d=>{if(d.a!==d.b)throw Error('Las contraseñas deben coincidir.');await updatePassword(user,d.a);await updateDoc(s.ref,{listo:true});await load(user)});return}
 abrirClave.hidden=false;
 const admin=access.participante==='ADMIN';
 const [list,agenda]=await Promise.all([admin?getDocs(collection(espacio(db),'participantes')).then(snapshot):getDoc(doc(espacio(db),'participantes',access.participante)).then(d=>d.exists()?[{...d.data(),id:d.id}]:[]),getDocs(collection(espacio(db),'actividades')).then(snapshot)]);
 if(seq!==revision)return;
 if(admin){
   await sincronizarEscaneos();
   const locales=pendientesLocales();
   const vencidas=agenda.filter(a=>!locales.some(k=>k.startsWith(colaPrefijo()+encodeURIComponent(a.id)+':'))&&!a.listaCerrada&&a.fecha<stamp()&&(a.cierreAutomatico||a.fecha>='2026-11-19')).sort((a,b)=>a.fecha.localeCompare(b.fecha));
   for(const a of vencidas){
     if(seq!==revision)return;
     await cerrarLista(a,list);a.listaCerrada=true;
   }
   if(vencidas.length)list.splice(0,list.length,...snapshot(await getDocsFromServer(collection(espacio(db),'participantes'))));
 }
 const visibles=admin?list.filter(p=>!p.muestra):list;
 const rows=(await Promise.all(visibles.map(async p=>snapshot(await getDocs(query(collection(espacio(db),'participantes',p.id,'registros'),where('fecha','>=',selectedMonth+'-01'),where('fecha','<=',selectedMonth+'-31')))).map(r=>({...r,person:p.id}))))).flat();
 if(seq!==revision)return;
 const prepared=await Promise.all(visibles.map(p=>prepararAsistencia(db,p,admin)));
 if(seq!==revision)return;
 people=prepared.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));activities=agenda.sort((a,b)=>a.fecha.localeCompare(b.fecha));records=rows.sort((a,b)=>b.fecha.localeCompare(a.fecha));draw(admin)
}
function downloadCsv(rs){const quote=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};const head=['joven','usuario','comunidad','generacion','telefono','dependencia','actividad','tipo_horas','fecha','asistencia','horas','total_actividades_de_80','total_aprendizaje_de_10','total_programa_de_90','observaciones'];const data=rs.map(r=>{const p=people.find(p=>p.id===r.person);return [p.nombre,p.usuario,p.comunidad,p.generacion,p.telefono,p.dependencia,r.titulo,r.categoria,r.fecha,r.tipo==='manual'?'asignacion_manual':r.estado,r.horas,...['actividad','aprendizaje'].map(c=>sum(rs.filter(x=>x.person===r.person&&x.categoria===c))),sum(rs.filter(x=>x.person===r.person)),r.nota||(r.tipo==='manual'?r.titulo:'')]});const blob=new Blob(['\ufeff'+[head,...data].map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='IMJU-'+selectedMonth+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),5000)}

const adminPages={inicio:'Inicio',qr:'Escanear QR',lista:'Pasar lista',padron:'Directorio de jóvenes',agenda:'Actividades',horas:'Horas e historial',cuenta:'Accesos'};
const memberPages={inicio:'Inicio',gafete:'Mi gafete',agenda:'Calendario',horas:'Mis horas',cuenta:'Mi cuenta'};
const categories='<option value="actividad">Actividad</option><option value="aprendizaje">Aprendizaje</option>';
const states='<option value="presente">Presente</option><option value="justificada">Falta justificada</option><option value="falta">Falta injustificada</option><option value="no_aplica">No aplica</option>';
const labelState=s=>({presente:'Presente',falta:'Falta injustificada',justificada:'Falta justificada',no_aplica:'No aplica'})[s]||s;
const initials=s=>s.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('');
const fullDate=d=>new Date(d+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long'});
function avatar(p){return p.foto?'<img class="avatar" loading="lazy" decoding="async" src="'+escape(p.foto)+'" alt="">':'<span class="avatar fallback">'+escape(initials(p.nombre))+'</span>'}
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
  content.innerHTML='<div class="desk">'+navigation(pages,page,admin)+'<section class="workspace"><div class="view-head"><div><p class="kicker">'+(admin?'Coordinación · '+escape(nombreDependencia)+'':'Mi participación · '+escape(nombreDependencia)+'')+'</p><h2 id="viewTitle" tabindex="-1">'+icon(page)+escape(pages[page])+'</h2></div>'+monthControl+'</div><div id="view"></div></section></div>';
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
    if(admin){view.insertAdjacentHTML('beforeend','<a class="action-link" href="'+escape(enlace('./entrega.html'))+'">Preparar mensajes de acceso</a><section class="card"><h3>Respaldo del programa</h3><p>Descarga el padrón, las fotos disponibles, las actividades y el historial de todos los meses en un archivo privado.</p><button id="backup">Descargar respaldo JSON</button></section>');
    el('backup').onclick=e=>action(async()=>{
      const getAll=async ref=>(await getDocsFromServer(ref)).docs.map(d=>({...d.data(),id:d.id}));
      const [participants,events]=await Promise.all([getAll(collection(espacio(db),'participantes')),getAll(collection(espacio(db),'actividades'))]);
      const profiles=await Promise.all(participants.map(async p=>({...p,registros:await getAll(collection(espacio(db),'participantes',p.id,'registros'))})));
      const file=new Blob([JSON.stringify({version:1,fecha:new Date().toISOString(),participantes:profiles,actividades:events})],{type:'application/json'});
      const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download='IMJU-respaldo-'+stamp()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
    },e.currentTarget);bindProfile(db,view,people,form,notice)}
  }
  if(!admin&&people[0]){
    const p=people[0],mes=selectedMonth;
    const count=p.faltasPorMes[mes]||0;
    if(count){
      const warning=document.createElement('aside');warning.className='session-target';warning.setAttribute('role','status');
      const periodo=new Date(mes+'-15T12:00:00').toLocaleString('es-MX',{month:'long',year:'numeric'});
      warning.textContent=(p.activo?'':'Tu expediente está inactivo. ')+count+' falta'+(count===1?' injustificada':'s injustificadas')+' en '+periodo+'. '+(count>=limiteFaltas?'Coordinación puede revisar tu baja.':count===limiteFaltas-1?'Una falta más este mes permite a coordinación revisar tu baja.':'A partir de cuatro en el mismo mes, coordinación puede revisar tu baja.');
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
  const hero='<section class="task-hero"><div><h3>'+escape(admin?'Registro de asistencia':people[0]?.nombre||'Mi participación')+'</h3><p>'+(admin?'Escanea el gafete de cada joven al llegar a la actividad.':'Ten tu credencial a la mano para registrar tu asistencia.')+'</p><button data-open="'+mainTask+'">'+icon(mainTask)+(admin?'Escanear gafete':'Mostrar mi gafete')+'</button></div><div class="ilustracion-barrio" aria-hidden="true"><svg viewBox="0 0 240 120" fill="none"><circle cx="177" cy="34" r="25" fill="var(--sol)"/><g stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 95 38 69l32 26 40-38 44 38 29-19 48 19M24 97V72l19-14 19 14v25m-25 0V82h12v15M90 95V50h30v45m-22-36h5m6 0h5m-16 9h5m6 0h5M146 95V66l16-12 16 12v29m-18-14h8M198 95V71l11-8 13 8v24"/><path d="M0 104q20-8 40 0t40 0t40 0t40 0t40 0t40 0M0 113q20-8 40 0t40 0t40 0t40 0t40 0t40 0"/></g></svg></div></section>';
  const actions='<div class="task-grid">'+shortcuts.map(([id,label])=>'<button data-open="'+id+'"><span class="task-icon">'+icon(id)+'</span>'+label+icon('flecha')+'</button>').join('')+'</div>';
  const metrics=(admin?metric(people.filter(p=>p.activo).length,'Jóvenes activos'):'')+metric(sum(records)+' h','Horas acreditadas')+metric(activity+' h','Actividad')+metric(learning+' h','Aprendizaje');
  const absences=records.filter(r=>r.estado==='falta').length+' injustificadas · '+records.filter(r=>r.estado==='justificada').length+' justificadas';
  view.innerHTML=hero+actions+'<div class="overview"><section class="card totals"><h3>Balance del mes</h3><div class="metrics">'+metrics+'</div><p class="absence">Faltas · '+absences+'</p></section><section class="card"><h3>Próximas actividades</h3>'+(upcoming.length?agendaList(upcoming.slice(0,3)):'<p class="empty">Sin actividades pendientes en el mes seleccionado.</p>')+'<button class="text-button" data-open="agenda">Ver calendario completo '+icon('flecha')+'</button></section></div>';
  if(!admin && monthly.length){
    const recientes=monthly.filter(a=>a.fecha<=stamp()).slice(-3).reverse();
    if(recientes.length)view.insertAdjacentHTML('beforeend','<section class="card"><h3>Mi asistencia reciente</h3>'+agendaList(recientes)+'<button class="text-button" data-open="agenda">Ver todas mis actividades</button></section>');
  }
  view.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{navigate(b.dataset.open);if(b.dataset.open==='horas'&&admin)openManual()});
}
const asistenciaVisual={
  pendiente:['Pendiente','◷'], presente:['Asistencia','✓'], falta:['Falta injustificada','×'],
  justificada:['Falta justificada','◆'], no_aplica:['No aplica','—'], cerrada:['Lista cerrada','▣'],
  abierta:['Lista abierta','○'], proxima:['Programada','◷'], sin_registro:['Sin registro','—']
};
function etiqueta(tipo,texto){
  const [nombre,marca]=asistenciaVisual[tipo]||asistenciaVisual.sin_registro;
  return '<span class="asistencia-chip" data-tono="'+escape(tipo)+'"><span aria-hidden="true">'+marca+'</span>'+escape(texto||nombre)+'</span>';
}
function estadoPersonal(a,p,r){
  if(r)return r.estado;
  if(a.listaCerrada||!p||!convocado(p,a))return 'sin_registro';
  return a.fecha>stamp()?'proxima':'pendiente';
}
function pendientesEvento(a){
  if(a.listaCerrada)return 0;
  const registrados=new Set(records.filter(r=>r.tipo!=='manual'&&r.id===a.id).map(r=>r.person));
  return people.filter(p=>convocado(p,a)&&!registrados.has(p.id)).length;
}
function estadoLista(a){
  if(a.listaCerrada)return etiqueta('cerrada');
  if(a.fecha>stamp())return etiqueta('proxima');
  const n=pendientesEvento(a);
  return etiqueta('abierta')+etiqueta(n?'pendiente':'presente',n?n+' pendiente'+(n===1?'':'s'):'Sin pendientes');
}
function estadoAgenda(a){
  if(access.participante==='ADMIN')return estadoLista(a);
  const r=records.find(r=>r.id===a.id&&r.person===people[0]?.id&&r.tipo!=='manual');
  return etiqueta(estadoPersonal(a,people[0],r))+(a.listaCerrada?etiqueta('cerrada'):'');
}
function agendaList(list){
  return list.length?list.map(a=>'<article class="event"><time datetime="'+escape(a.fecha)+'"><b>'+escape(a.fecha.slice(8))+'</b>'+escape(new Date(a.fecha+'T12:00:00').toLocaleString('es-MX',{month:'short'}))+'</time><div><strong>'+escape(a.titulo)+'</strong><div class="estado-linea">'+estadoAgenda(a)+'</div><p>'+escape([a.hora,a.lugar,a.categoria,a.horas+' h'].filter(Boolean).join(' · '))+'</p>'+(a.descripcion?'<p>'+escape(a.descripcion)+'</p>':'')+'</div></article>').join(''):'<p class="empty">Sin actividades programadas en este mes.</p>';
}
function badge(view,p,showFields=true){
  view.innerHTML='<section class="gafete-panel"><div class="gafete-preview" aria-live="polite">Preparando la credencial…</div><div class="gafete-actions"><h3>Credencial individual</h3><p>Gafete de 8.5 × 11.5 cm con vigencia de octubre de 2026 a octubre de 2027. Coloca el sello sobre el borde de la foto, dejando visible el rostro. Imprime el PDF en hoja carta al 100 % y recorta por las marcas.</p><button class="pdf" disabled>'+icon('descargar')+'Descargar PDF para imprimir</button><button class="png light" disabled>'+icon('foto')+'Guardar imagen para celular</button><a class="action-link" hidden download="QR-IMJU.gif">Descargar solo el QR</a></div></section>'+(showFields?'<section class="card"><h3>Mi expediente</h3>'+personFields(p)+'</section>':'');
  const preview=view.querySelector('.gafete-preview'),pdf=view.querySelector('.pdf'),png=view.querySelector('.png');
  cargarQR('qrcode').then(()=>{
    const url=badgeQR(p),link=view.querySelector('a[download]');
    if(preview.isConnected){link.href=url;link.hidden=false}
    return renderBadge(p,url);
  }).then(canvas=>{
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
function personFields(p){return '<dl>'+[['Comunidad',p.comunidad],['Generación',p.generacion],['Teléfono',p.telefono],['Dependencia',p.dependencia],...([['Tipo de teléfono',p.tipoTelefono],['Clave de origen',p.claveLocal],['Categoría del padrón',p.categoriaPadron],['Domicilio',p.domicilio],['Colonia',p.colonia]].filter(([,v])=>v)),['Usuario',p.usuario],['Estado',p.bajaPorFaltas?'Baja por faltas':p.activo?'Activo':'Inactivo'],['Faltas injustificadas · '+selectedMonth,String(p.faltasPorMes?.[selectedMonth]||0)]].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+escape(v||'Pendiente')+'</dd></div>').join('')+'</dl>'}
function convocado(p,a){return p.activo&&!p.muestra&&(!p.fechaAlta||p.fechaAlta<=a.fecha)}
async function cerrarLista(a,list){
  const candidatos=list.filter(p=>convocado(p,a));
  for(let i=0;i<candidatos.length;i+=8){
    const changes=candidatos.slice(i,i+8).map(p=>({person:p.id,id:a.id,prior:null,next:attendanceRow(a,'falta',0,'Sin registro al cierre de la actividad.')}));
    await saveRows(db,changes,a,'cierre');
  }
  const ref=doc(espacio(db),'actividades',a.id);
  await runTransaction(db,async tx=>{
    const current=(await tx.get(ref)).data();
    if(!current||current.fecha!==a.fecha)throw Error('La actividad cambió. Actualiza el panel.');
    if(!current.listaCerrada)tx.update(ref,{listaCerrada:true});
  });
}
async function actividadesDelPerfil(root,p,reload){
  root.innerHTML='<h3 tabindex="-1">Pasar lista individual</h3><p role="status">Cargando actividades…</p>';
  let historial;
  try{
    historial=snapshot(await getDocsFromServer(collection(espacio(db),'participantes',p.id,'registros')));
  }catch(error){
    if(!root.isConnected)return;
    root.querySelector('p').textContent='No se pudo cargar el historial de este joven.';
    const retry=document.createElement('button');
    retry.textContent='Volver a intentar';retry.onclick=()=>actividadesDelPerfil(root,p,reload);root.append(retry);
    return;
  }
  if(!root.isConnected)return;
  const porEvento=new Map(historial.filter(r=>r.tipo!=='manual').map(r=>[r.id,r]));
  root.querySelector('p').textContent=activities.length?'Asistencia de '+p.nombre+' · Todos los meses':'Aún no hay actividades publicadas.';
  for(const a of [...activities].reverse()){
    const previo=porEvento.get(a.id),row=document.createElement('article');row.className='event';
    const editable=Boolean(previo)||p.activo;
    const estado=etiqueta(estadoPersonal(a,p,previo))+(a.listaCerrada?etiqueta('cerrada'):'');
    row.innerHTML='<div><strong>'+escape(a.titulo)+'</strong><p>'+escape(fullDate(a.fecha)+' de '+a.fecha.slice(0,4))+'</p><div class="estado-linea">'+estado+'</div>'+(editable?'<button type="button" class="light">'+(previo?'Corregir registro':'Registrar asistencia')+'</button>':'')+'</div>';
    root.append(row);
    if(!editable)continue;
    row.querySelector('button').onclick=e=>action(async()=>{
      const futuro=a.fecha>stamp();
      const opciones=futuro?'<option value="no_aplica">No aplica</option>':'<option value="">Elige un estado</option>'+states;
      const datos=solicitar(root,'Registro individual','<p>'+escape(p.nombre)+' · '+escape(a.titulo)+' · '+escape(fullDate(a.fecha))+'</p><label>Asistencia<select name="estado" required>'+opciones+'</select></label><label><span class="nota-label">Observaciones</span><input name="note" maxlength="240"></label>'+adjunto,'Guardar registro',async f=>{
        const state=f.elements.estado.value,note=f.elements.note.value.trim();
        if(state==='justificada'&&!note)throw Error('Escribe la razón de la falta.');
        const next=attendanceRow(a,state,previo?.estado==='presente'?previo.horas:a.horas,note);
        next.evidencia=state==='justificada'?await evidencia(f.elements.evidencia,previo?.evidencia):'';
        return next;
      });
      const f=root.querySelector('dialog form');
      if(previo&&!futuro)f.elements.estado.value=previo.estado;
      f.elements.note.value=previo?.nota==='Sin registro al cierre de la actividad.'?'':previo?.nota||'';
      f.elements.estado.onchange=()=>ajustarJustificante(f,f.elements.estado.value);f.elements.estado.onchange();
      const next=await datos;if(!next)return;
      await saveRows(db,[{person:p.id,id:a.id,prior:previo,next}],a);
      await reload('Registro guardado · '+labelState(next.estado));
    },e.currentTarget);
  }
}
function avisoFaltas(p,mes){
  const n=p.faltasPorMes?.[mes]||0;
  const nivel=n>=limiteFaltas?'falta':n===limiteFaltas-1?'pendiente':'sin_registro';
  const detalle=!p.activo?' · Inactivo':n>=limiteFaltas?' · Revisar baja':n===limiteFaltas-1?' · A una del límite':'';
  return etiqueta(nivel,n+(n===1?' falta injustificada':' faltas injustificadas')+detalle);
}
// Las tarjetas comparten la consulta mientras se usa la misma versión del expediente.
const avancesDirectorio=new WeakMap();
function horasDelPrograma(persona){
  if(!avancesDirectorio.has(persona)){
    const ref=collection(espacio(db),'participantes',persona.id,'registros');
    const lectura=getDocsFromServer(query(ref,where('estado','==','presente')))
      .then(resultado=>acumularHoras(resultado.docs.map(d=>d.data())))
      .catch(error=>{avancesDirectorio.delete(persona);throw error});
    avancesDirectorio.set(persona,lectura);
  }
  return avancesDirectorio.get(persona);
}
function directory(view,reload){
  const person=people.find(p=>p.id===profileId);
  if(person){
    view.innerHTML='<button class="light" id="backDirectory">← Volver al directorio</button><section class="profile-head">'+avatar(person)+'<div><h3>'+escape(person.nombre)+'</h3><p>Usuario · <strong>'+escape(person.usuarioAcceso||person.usuario)+'</strong></p></div></section><div class="quick profile-controls"><button id="profileEdit">Editar expediente</button><button class="light" id="profileAccess" '+(person.activo?'':'disabled')+'>Generar contraseña temporal</button><button id="profileHours" '+(person.activo?'':'disabled')+'>Sumar horas</button><button class="light" data-task="qr">Escanear QR</button><button type="button" id="profileAttendance">Pasar lista individual</button></div><section id="perfilAsistencia" class="card"></section><section class="card"><h3>Datos del joven</h3>'+personFields(person)+'<p><strong>'+sum(records.filter(r=>r.person===person.id))+' h</strong> acreditadas en el mes seleccionado</p></section><div id="profileBadge"></div><section id="profileEditor" hidden></section>';
    const mes=selectedMonth;
    const periodo=new Date(mes+'-15T12:00:00').toLocaleString('es-MX',{month:'long',year:'numeric'});
    el('perfilAsistencia').insertAdjacentHTML('beforebegin','<section class="card"><h3>Faltas de '+escape(periodo)+'</h3>'+avisoFaltas(person,mes)+(person.activo&&(person.faltasPorMes?.[mes]||0)>=limiteFaltas?' <button id="bajaMensual">Dar de baja por faltas</button>':'')+'</section>');
    const baja=el('bajaMensual');
    if(baja)baja.onclick=()=>action(async()=>{
      if(!guard()||!confirm('¿Dar de baja a '+person.nombre+' por '+person.faltasPorMes[mes]+' faltas injustificadas en '+periodo+'? Se desactivará su acceso y se conservará su historial.'))return;
      await cambiarEstado(db,person,false,{},mes);
      await reload('Baja registrada.');
    },baja);
    const statusButton=document.createElement('button');
    statusButton.type='button';statusButton.className='light';
    statusButton.textContent=person.activo?'Dar de baja':'Reactivar joven';
    view.querySelector('.profile-controls').append(statusButton);
    statusButton.onclick=()=>action(async()=>{
      const habilitar=!person.activo;
      const mensaje=habilitar?'Volverá al padrón activo y al pase de lista.':'Se suspenderá su acceso y saldrá del pase de lista. Su historial seguirá en Dados de baja.';
      if(!guard()||!confirm(statusButton.textContent+' · '+person.nombre+'? '+mensaje))return;
      await cambiarEstado(db,person,habilitar);
      mostrarBajas=!habilitar;profileId='';directoryQuery='';
      await reload(habilitar?'Joven reactivado.':'Joven dado de baja.');
    },statusButton);
    const attendance=el('perfilAsistencia');
    actividadesDelPerfil(attendance,person,reload);
    el('profileAttendance').onclick=()=>{attendance.querySelector('h3').focus();attendance.scrollIntoView({block:'start'})};
    badge(el('profileBadge'),person,false);
    const editor=el('profileEditor');
    el('profileEdit').onclick=()=>{
      if(!editor.childElementCount)manageRoster(editor,{app,db,people:[person],reload,onError:report,editOnly:true});
      editor.hidden=false;editor.querySelector('details').open=true;editor.scrollIntoView({block:'center'});editor.querySelector('input[name=nombre]').focus();
      editor.oninput=()=>{dirty=true};
    };
    el('profileAccess').onclick=e=>action(async()=>{
      if(!confirm('¿Confirmaste la identidad de '+person.nombre+'? Recibirá una contraseña temporal para su usuario de siempre.'))return;
      const boton=el('profileAccess');
      const respuesta=await fetch('/api/recuperar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await auth.currentUser.getIdToken()},body:JSON.stringify({sede:dependencia,person:person.id})});
      const datos=await respuesta.json().catch(()=>({}));
      if(!respuesta.ok||!datos.clave)throw Error(datos.error||'Recuperación disponible desde el portal de Vercel. Revisa tu sesión.');
      const {usuario,clave}=datos;
      person.usuarioAcceso=usuario;
      if(!boton.isConnected)return;
      view.querySelector('.profile-head p strong').textContent=usuario;
      const panel=document.createElement('section');panel.className='card';
      panel.innerHTML='<h3>Nuevo acceso listo</h3><label>Mensaje privado para el joven<textarea readonly rows="8"></textarea></label><button type="button">Copiar mensaje</button>';
      const mensaje=panel.querySelector('textarea');
      mensaje.value='Hola, '+person.nombre+'. Tu usuario sigue siendo el mismo. Te compartimos tu contraseña temporal para entrar a Jóvenes Unen al Barrio.\n\n'+enlace('./')+'\nUsuario: '+usuario+'\nContraseña temporal: '+clave+'\n\nEntra con estos datos y elige tu contraseña personal.';
      panel.querySelector('button').onclick=async()=>{try{await navigator.clipboard.writeText(mensaje.value);notice('Mensaje copiado para enviar en privado.')}catch{mensaje.focus();mensaje.select();notice('Selecciona Copiar para guardar el mensaje.')}};
      boton.closest('.profile-controls').after(panel);
      boton.hidden=true;panel.scrollIntoView({block:'center'});mensaje.focus();
    },e.currentTarget);
    el('profileHours').onclick=()=>{navigate('horas');if(page==='horas')openManual(person.id)};
    view.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>navigate(b.dataset.task));
    el('backDirectory').onclick=()=>{if(!guard())return;dirty=false;profileId='';draw(true);el('findPerson').focus()};
    return;
  }
  view.innerHTML='<label>Buscar joven<input type="search" id="findPerson" placeholder="Nombre, usuario o comunidad"></label><label>Faltas del mes<select id="riesgoMes"><option value="">Todos los jóvenes</option><option value="3">A una del límite (3)</option><option value="4">Revisar baja (4 o más)</option></select></label><button hidden type="button" id="reintentarHoras">Reintentar carga de horas</button><div id="cards" class="people-grid"></div><div id="rosterTools"></div>';
  view.insertAdjacentHTML('afterbegin','<section class="card"><h3>Gafetes del padrón</h3><p>Cuatro por hoja carta, de 8.5 × 11.5 cm. Imprime al 100 %. Los inactivos aparecen identificados.</p><button id="printRoster">Descargar todos los gafetes</button><span role="status" id="printProgress"></span></section>');
  const print=el('printRoster'),progress=el('printProgress');
  print.disabled=!people.length;
  print.onclick=()=>action(async()=>{
    try{await saveRosterBadges(people,(n,total)=>{progress.textContent=' Preparando '+n+' de '+total+'…'})}
    finally{progress.textContent=''}
  },print);
  manageRoster(el('rosterTools'),{app,db,people,reload,onError:report,createOnly:true});
  const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const grupos=document.createElement('div');
  grupos.className='quick roster-tabs';grupos.setAttribute('role','group');grupos.setAttribute('aria-label','Estado del padrón');
  view.prepend(grupos);
  for(const bajas of [false,true]){
    const boton=document.createElement('button');
    boton.type='button';boton.setAttribute('aria-pressed',String(bajas===mostrarBajas));
    boton.className=bajas===mostrarBajas?'':'light';
    boton.textContent=(bajas?'Dados de baja':'Activos')+' ('+people.filter(p=>Boolean(p.activo)!==bajas).length+')';
    boton.onclick=()=>{mostrarBajas=bajas;directoryQuery='';directory(view,reload)};
    grupos.append(boton);
  }
  el('riesgoMes').closest('label').hidden=mostrarBajas;
  const search=el('findPerson');search.value=directoryQuery;
  function filter(){
    directoryQuery=search.value;
    const nivel=el('riesgoMes').value;
    const matches=people.filter(p=>Boolean(p.activo)!==mostrarBajas).filter(p=>!nivel||(p.activo&&(nivel==='3'?p.faltasPorMes?.[selectedMonth]===3:p.faltasPorMes?.[selectedMonth]>=limiteFaltas))).filter(p=>fold([p.nombre,p.usuario,p.comunidad].join(' ')).includes(fold(directoryQuery)));
    el('cards').innerHTML=matches.map(p=>'<button type="button" class="directory-person" data-person="'+escape(p.id)+'">'+avatar(p)+'<span><strong>'+escape(p.nombre)+'</strong><small>Usuario · '+escape(p.usuario)+'</small><small>'+escape(p.comunidad||'Comunidad pendiente')+' · '+sum(records.filter(r=>r.person===p.id))+' h este mes</small>'+avisoFaltas(p,selectedMonth)+'<span class="avance-horas">Cargando horas del programa…</span>'+'</span><b aria-hidden="true">›</b></button>').join('')||'<p>No se encontraron participantes.</p>';
    const tarjetas=[...el('cards').querySelectorAll('[data-person]')];
    async function cargar(){
      while(tarjetas.length){
        const tarjeta=tarjetas.shift();
        if(!tarjeta.isConnected)return;
        const persona=people.find(p=>p.id===tarjeta.dataset.person);
        const zona=tarjeta.querySelector('.avance-horas');
        try{
          const horas=await horasDelPrograma(persona);
          if(tarjeta.isConnected)zona.innerHTML=mostrarAvance(horas);
        }catch{
          if(tarjeta.isConnected){
            zona.textContent='Horas pendientes de consulta.';
            el('reintentarHoras').hidden=false;
          }
        }
      }
    }
    el('reintentarHoras').hidden=true;
    for(let i=0;i<Math.min(4,matches.length);i++)void cargar();
    el('cards').querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{
      if(!guard())return;dirty=false;profileId=b.dataset.person;draw(true);el('backDirectory').focus();window.scrollTo(0,0);
    });
  }
  el('reintentarHoras').onclick=filter;filter();search.oninput=filter;el('riesgoMes').onchange=filter;
}
function activityInputs(){
  return field('Nombre de la actividad','title')+field('Fecha','date','date')+'<label>Hora<input name="time" type="time"></label><label>Lugar<input name="place"></label>'+select('Tipo de horas','category',categories)+field('Horas por joven','hours','number','min="0" max="24" step="1"')+'<label>Descripción<textarea name="description"></textarea></label>';
}
function activityData(d){if(!d.title.trim())throw Error('Escribe el nombre de la actividad.');return {titulo:d.title.trim(),fecha:d.date,hora:d.time,lugar:d.place.trim(),categoria:d.category,horas:Number(d.hours),descripcion:d.description.trim()}}
function fotosActividad(a){
  return (Array.isArray(a.evidencias)?a.evidencias:[]).filter(f=>typeof f==='string'&&f.startsWith('data:image/'));
}
async function comprimirEvidencia(file){
  const canvas=await imageCanvas(file,768);
  const jpeg=canvas.toDataURL('image/jpeg',0.64);
  const webp=canvas.toDataURL('image/webp',0.66);
  return webp.startsWith('data:image/webp;')&&webp.length<jpeg.length?webp:jpeg;
}
function albumActividad(a,fotos){
  const album=document.createElement('details');
  album.className='album-actividad';
  album.innerHTML='<summary><span>'+escape(fullDate(a.fecha))+'</span><strong>'+escape(a.titulo)+'</strong><small>'+fotos.length+' foto'+(fotos.length===1?'':'s')+'</small></summary>';
  let posicion=0;
  album.ontoggle=()=>{
    album.querySelector('figure')?.remove();
    if(!album.open)return;
    const figure=document.createElement('figure');
    const img=new Image();img.decoding='async';
    const pie=document.createElement('figcaption');
    const indicador=document.createElement('span');indicador.setAttribute('aria-live','polite');
    const anterior=document.createElement('button'),siguiente=document.createElement('button');
    anterior.textContent='Anterior';siguiente.textContent='Siguiente';
    function mostrar(){
      img.src=fotos[posicion];img.alt='Evidencia '+(posicion+1)+' de '+a.titulo;
      indicador.textContent=(posicion+1)+' de '+fotos.length;
      anterior.disabled=posicion===0;siguiente.disabled=posicion===fotos.length-1;
    }
    anterior.onclick=()=>{posicion--;mostrar()};siguiente.onclick=()=>{posicion++;mostrar()};
    if(fotos.length>1)pie.append(anterior,indicador,siguiente);else pie.append(indicador);
    figure.append(img,pie);album.append(figure);mostrar();
  };
  return album;
}
function controlesDeEvento(item,a,reload){
  const panel=document.createElement('details');
  panel.innerHTML='<summary>¿A quién no le aplica?</summary><p>Marca a quienes están exentos. Si ya tenían falta, se descontará al guardar.</p><label>Buscar joven<input type="search" placeholder="Nombre o usuario"></label><div class="event-exemptions"></div><button type="button">Guardar selección</button>';
  item.append(panel);
  panel.addEventListener('toggle',()=>{
    if(!panel.open||panel.dataset.ready)return;
    panel.dataset.ready='1';
    const list=panel.querySelector('.event-exemptions');
    const entries=[];
    for(const person of people.filter(p=>convocado(p,a))){
      const prior=records.find(r=>r.person===person.id&&r.id===a.id&&r.tipo!=='manual');
      const row=document.createElement('label'),box=document.createElement('input');
      box.type='checkbox';box.checked=prior?.estado==='no_aplica';
      row.style.cssText='display:flex;gap:.65rem;align-items:center;padding:.45rem 0';
      box.style.width='auto';row.append(box,document.createTextNode(person.nombre+' · '+(prior?labelState(prior.estado):'Pendiente')));list.append(row);
      entries.push({person,prior,box,row});
    }
    list.style.cssText='max-height:48vh;overflow:auto';
    if(!entries.length)list.textContent='Sin jóvenes convocados para esta actividad.';
    const normalizar=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    panel.querySelector('[type=search]').oninput=e=>{for(const {person,row} of entries)row.style.display=normalizar(person.nombre+' '+person.usuario).includes(normalizar(e.target.value.trim()))?'flex':'none'};
    const button=panel.querySelector('button');
    button.onclick=()=>action(async()=>{
      const changes=entries.filter(({prior,box})=>box.checked!==(prior?.estado==='no_aplica')).map(({person,prior,box})=>({
        person:person.id,id:a.id,prior,next:box.checked?attendanceRow(a,'no_aplica',0,''):a.listaCerrada?attendanceRow(a,'falta',0,'Sin registro al cierre de la actividad.'):null
      }));
      if(!changes.length){notice('La selección ya está guardada.');return}
      if(!confirm('¿Actualizar '+changes.length+' registro(s) de «'+a.titulo+'»? Marcar No aplica reemplaza la asistencia o falta anterior. Quitar la exención deja al joven '+(a.listaCerrada?'con falta porque la lista está cerrada.':'pendiente de registro.')))return;
      await saveRows(db,changes,a,'exenciones');
      await reload('Exenciones guardadas.');
    },button);
  });
  const remove=document.createElement('button');remove.type='button';remove.className='light';remove.textContent='Eliminar actividad';item.append(remove);
  remove.onclick=()=>action(async()=>{
    if(!confirm('¿Eliminar definitivamente «'+a.titulo+'»? También se eliminarán sus evidencias, asistencias, horas y faltas.'))return;
    const profiles=await getDocsFromServer(collection(espacio(db),'participantes'));
    const event=doc(espacio(db),'actividades',a.id);
    await runTransaction(db,async tx=>{
      const current=await tx.get(event);
      if(!current.exists())return;
      if(current.data().titulo!==a.titulo)throw Error('La actividad cambió. Actualiza el panel.');
      const rows=await Promise.all(profiles.docs.map(p=>tx.get(doc(p.ref,'registros',a.id))));
      const affected=rows.filter(r=>r.exists()&&r.data().tipo!=='manual');
      const owners=await Promise.all(affected.map(r=>tx.get(r.ref.parent.parent)));
      affected.forEach((r,i)=>{
        tx.delete(r.ref);
        if(!owners[i].exists())return;
        const profile=owners[i].data(),update={revisionHoras:(profile.revisionHoras||0)+1};
        if(r.data().estado==='falta'&&profile.faltasPorMes){
          const counts={...profile.faltasPorMes},month=r.data().fecha.slice(0,7);
          if(counts[month]>1)counts[month]--;else delete counts[month];
          update.faltasPorMes=counts;
        }
        tx.update(owners[i].ref,update);
      });
      tx.delete(event);
    });
    await reload('Actividad eliminada.');
  },remove);
}
function calendar(view,monthly,admin,reload){
  view.innerHTML='<div class="agenda-menu" role="group" aria-label="Vista de actividades"><button type="button" aria-pressed="true">'+icon('agenda')+'Actividades</button><button type="button" aria-pressed="false">'+icon('foto')+'Evidencias</button></div><div class="agenda-eventos"></div><section class="agenda-albumes" hidden><h3>Evidencias del mes</h3></section>';
  const eventos=view.querySelector('.agenda-eventos'),albumes=view.querySelector('.agenda-albumes');
  const botones=[...view.querySelectorAll('.agenda-menu button')];
  let preparado=false;
  function cambiar(fotos){
    eventos.hidden=fotos;albumes.hidden=!fotos;
    botones.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===Number(fotos))));
    if(fotos&&!preparado){
      for(const a of [...monthly].reverse()){
        const imagenes=fotosActividad(a);
        if(imagenes.length)albumes.append(albumActividad(a,imagenes));
      }
      if(!albumes.querySelector('details'))albumes.insertAdjacentHTML('beforeend','<p class="card">Todavía no hay fotos de actividades en el mes seleccionado.</p>');
      preparado=true;
    }
  }
  botones[0].onclick=()=>cambiar(false);botones[1].onclick=()=>cambiar(true);
  if(admin){
    eventos.innerHTML='<details><summary>Crear actividad</summary><form id="newact">'+activityInputs()+'<button>Publicar actividad</button></form></details>';
    el('newact').elements.date.value=stamp();
    form('newact',async d=>{await setDoc(doc(collection(espacio(db),'actividades')),{...activityData(d),cierreAutomatico:true});selectedMonth=d.date.slice(0,7);await reload('Actividad publicada.')});
  }
  for(const a of monthly){
    const item=document.createElement('section');item.className='card';item.innerHTML=agendaList([a]);eventos.append(item);
    if(fotosActividad(a).length){
      const link=document.createElement('button');link.type='button';link.className='light';link.textContent='Ver fotos de la actividad';
      link.onclick=()=>{
        cambiar(true);
        const album=albumes.querySelectorAll('details')[[...monthly].reverse().filter(x=>fotosActividad(x).length).findIndex(x=>x.id===a.id)];
        album.open=true;album.querySelector('summary').focus();
      };item.append(link);
    }
    if(!admin)continue;
    const edit=document.createElement('details');
    edit.innerHTML='<summary>Editar actividad o agregar evidencia</summary><form>'+activityInputs()+'<label>Fotografía de evidencia<input type="file" name="evidence" accept="image/jpeg,image/png,image/webp"></label><button>Guardar cambios</button></form>';item.append(edit);
    const f=edit.querySelector('form');for(const [k,v] of Object.entries({title:a.titulo,date:a.fecha,time:a.hora,place:a.lugar,category:a.categoria,hours:a.horas,description:a.descripcion}))f.elements[k].value=v??'';
    f.onsubmit=e=>{e.preventDefault();action(async()=>{
      const data=activityData(Object.fromEntries(new FormData(f))), file=f.elements.evidence.files[0];
      const photo=file?await comprimirEvidencia(file):null;
      // Las participaciones guardadas conservan la fecha, categoría y horas acreditadas.
      await runTransaction(db,async tx=>{
        const ref=doc(espacio(db),'actividades',a.id),current=(await tx.get(ref)).data();
        if(!current)throw Error('La actividad ya no existe.');
        const updates={};
        for(const [k,v] of Object.entries(data))if(v!==(a[k]??'')){if(current[k]!==a[k])throw Error('Otro coordinador modificó la actividad. Actualiza el panel.');updates[k]=v}
        if(photo){const images=[...(current.evidencias||[]),photo];if(JSON.stringify(images).length>780000)throw Error('Esta actividad alcanzó el espacio para fotografías.');updates.evidencias=images}
        if(Object.keys(updates).length)tx.update(ref,updates);
      });selectedMonth=data.fecha.slice(0,7);await reload('Actividad actualizada.');
    },f.querySelector('button'))};
    controlesDeEvento(item,a,reload);
  }
  if(!monthly.length)eventos.insertAdjacentHTML('beforeend',agendaList([]));
}
function attendanceView(view,monthly,reload,scanner){
  const options=monthly.filter(a=>a.fecha<=stamp());
  if(!options.some(a=>a.id===selectedEvent))selectedEvent=options.find(a=>a.fecha===stamp())?.id||(options.length===1?options[0].id:'');
  view.innerHTML='<section class="card"><label>Actividad<select id="pickEvent"><option value="">Elige la actividad</option>'+opts(options,a=>fullDate(a.fecha)+' · '+a.titulo+' · '+(a.listaCerrada?'Cerrada':'Abierta · Pendientes: '+pendientesEvento(a)))+'</select></label><div id="sessionTools"></div></section>';
  if(!scanner){
    view.insertAdjacentHTML('afterbegin','<button type="button" id="chooseIndividual">Pasar lista individual</button>');
    el('chooseIndividual').onclick=()=>navigate('padron');
  }
  const picker=el('pickEvent');picker.value=selectedEvent;
  picker.onchange=()=>{if(!guard()){picker.value=selectedEvent;return}dirty=false;selectedEvent=picker.value;lastScan='';draw(true)};
  const a=options.find(a=>a.id===selectedEvent),root=el('sessionTools');
  if(!a){root.textContent=options.length?'Selecciona la actividad que vas a registrar.':'Sin actividades para registrar hasta hoy en el mes elegido.';return}
  root.innerHTML='<div class="session-target"><strong>'+escape(a.titulo)+'</strong><p>'+escape([fullDate(a.fecha),a.horas+' h',a.categoria,a.lugar].filter(Boolean).join(' · '))+'</p></div>';
  const changeMode=document.createElement('button');
  changeMode.className='light';changeMode.type='button';
  changeMode.textContent=scanner?'Pasar lista para esta actividad':'Escanear QR para esta actividad';
  changeMode.onclick=()=>navigate(scanner?'lista':'qr');
  root.querySelector('.session-target').insertAdjacentHTML('beforeend','<div class="estado-linea" id="estadoLista" aria-live="polite">'+estadoLista(a)+'</div>');
  root.querySelector('.session-target').append(changeMode);
  if(!a.listaCerrada){
    const close=document.createElement('button');close.className='light';close.textContent='Cerrar lista';
    close.onclick=()=>action(async()=>{
      if(pendientesLocales().some(k=>k.startsWith(colaPrefijo()+encodeURIComponent(a.id)+':')))throw Error('Sincroniza los escaneos pendientes antes de cerrar esta actividad.');
      if(!guard()||!confirm('¿Cerrar '+a.titulo+'? Cada participante activo pendiente recibirá una falta injustificada. Revisa primero a quién corresponde No aplica.'))return;
      await cerrarLista(a,people);await reload('Lista cerrada. Se registraron las faltas pendientes.');
    },close);
    root.querySelector('.session-target').append(close);
    if(a.cierreAutomatico||a.fecha>='2026-11-19')root.querySelector('.session-target').insertAdjacentHTML('beforeend','<p>Los pendientes pasan a falta al cerrar la lista o cuando coordinación vuelva a cargar el panel después del día del evento.</p>');
  }else root.querySelector('.session-target').insertAdjacentHTML('beforeend','<p>Lista cerrada · Puedes corregir los registros desde el perfil.</p>');
  if(scanner&&a.listaCerrada)return;
  if(scanner){scannerTools(root,a,reload);pendingAttendance(root,a,reload)}else roster(root,a,reload);
}
// Las decisiones se resuelven al pulsar un botón, cancelar o abandonar la vista.
function solicitar(root,titulo,contenido,texto,leer){
  const box=document.createElement('dialog');
  box.className='decision';box.setAttribute('aria-label',titulo);
  box.innerHTML='<form><h3>'+escape(titulo)+'</h3>'+contenido+'<p role="status"></p><div class="quick"><button type="button" class="light" autofocus>Cancelar</button><button type="submit">'+escape(texto)+'</button></div></form>';
  root.append(box);
  const f=box.querySelector('form');
  return new Promise(resolve=>{
    let done=false;
    function finish(value){
      if(done)return;
      done=true;observer.disconnect();document.removeEventListener('visibilitychange',hidden);
      if(box.open)box.close();box.remove();resolve(value);
    }
    function hidden(){if(document.hidden&&['Confirmar asistencia','Confirmar mi asistencia'].includes(texto))finish(null)}
    const observer=new MutationObserver(()=>{if(!box.isConnected)finish(null)});
    observer.observe(content,{childList:true,subtree:true});
    document.addEventListener('visibilitychange',hidden);
    box.oncancel=e=>{e.preventDefault();finish(null)};
    f.querySelector('button').onclick=()=>finish(null);
    f.onsubmit=async e=>{
      e.preventDefault();const submit=f.querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;
      try{finish(await leer(f))}catch(err){f.querySelector('[role=status]').textContent=err.message;submit.disabled=false}
    };
    box.showModal();
  });
}
const adjunto='<label class="justificante">Foto de evidencia (opcional)<input name="evidencia" type="file" accept="image/*"></label>';
async function evidencia(input,previous=''){
  if(!input.files.length)return previous;
  const c=await imageCanvas(input.files[0],1100);
  for(const quality of [.78,.55,.35]){
    const url=c.toDataURL('image/jpeg',quality);
    if(url.length<=85000)return url;
  }
  const mini=document.createElement('canvas');mini.width=Math.max(1,Math.round(c.width*.65));mini.height=Math.max(1,Math.round(c.height*.65));
  mini.getContext('2d').drawImage(c,0,0,mini.width,mini.height);
  const url=mini.toDataURL('image/jpeg',.5);
  if(url.length>85000)throw Error('Selecciona una foto más pequeña.');
  return url;
}
function ajustarJustificante(row,state){
  row.querySelector('.justificante').hidden=state!=='justificada';
  row.querySelector('.nota-label').textContent=state==='justificada'?'Razón de la falta':'Observaciones';
}
function pendingAttendance(root,a,reload){
  el('estadoLista').innerHTML=estadoLista(a);
  el('pickEvent').selectedOptions[0].textContent=fullDate(a.fecha)+' · '+a.titulo+' · '+(a.listaCerrada?'Cerrada':'Abierta · Pendientes: '+pendientesEvento(a));
  const saved=new Set(records.filter(r=>r.id===a.id).map(r=>r.person));
  const pending=people.filter(p=>!a.listaCerrada&&convocado(p,a)&&!saved.has(p.id));
  const section=document.createElement('section');
  section.className='scan-pending';
  section.innerHTML='<h3>Pendientes de asistencia · '+pending.length+'</h3>';
  if(!pending.length)section.insertAdjacentHTML('beforeend','<p>Todos los participantes activos tienen registro para este evento.</p>');
  for(const p of pending){
    const row=document.createElement('div');row.className='event';
    row.innerHTML='<div>'+identidadLista(p)+etiqueta('pendiente')+'<div class="quick"><button type="button" data-state="falta">Marcar falta</button><button type="button" class="light" data-state="justificada">Justificar falta</button><button type="button" class="light" data-state="no_aplica">No aplica</button></div></div>';
    row.querySelectorAll('button').forEach(button=>button.onclick=()=>action(async()=>{
      const state=button.dataset.state;
      const warning=state==='falta'&&p.faltasPorMes?.[a.fecha.slice(0,7)]===limiteFaltas-1?' Esta cuarta falta permitirá a coordinación revisar la baja.':'';
      let motivo='',foto='';
      if(state==='justificada'){
        const datos=await solicitar(root,'Justificar falta','<p>'+escape(p.nombre)+' · '+escape(a.titulo)+'</p><label>Razón de la falta<textarea name="razon" maxlength="240" required></textarea></label>'+adjunto,'Guardar justificación',async f=>{
          const razon=f.elements.razon.value.trim();
          if(!razon)throw Error('Escribe la razón.');
          return {razon,foto:await evidencia(f.elements.evidencia)};
        });
        if(!datos||!root.isConnected)return;
        motivo=datos.razon;foto=datos.foto;
      }else if(!confirm('¿Registrar '+labelState(state).toLowerCase()+' para '+p.nombre+' en '+a.titulo+'?'+warning))return;
      const next=attendanceRow(a,state,0,motivo);if(foto)next.evidencia=foto;
      await saveRows(db,[{person:p.id,id:a.id,prior:null,next}],a);
      if(!root.isConnected)return;
      records=records.filter(r=>r.id!==a.id||r.person!==p.id);
      records.unshift({...next,id:a.id,person:p.id});
      lastScan=p.nombre+' · '+labelState(state);
      el('scanResult').textContent=lastScan;
      pendingAttendance(root,a,reload);
      const fresh=await getDoc(doc(espacio(db),'participantes',p.id));
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
function colaPrefijo(){
  return 'jub:asistencia:1:'+dependencia+':'+auth.currentUser.uid+':';
}
function pendientesLocales(){
  const prefijo=colaPrefijo();
  return Object.keys(localStorage).filter(k=>k.startsWith(prefijo));
}
let sincronizando=false;
async function sincronizarEscaneos(){
  if(sincronizando||!navigator.onLine||!auth.currentUser||access?.participante!=='ADMIN')return;
  sincronizando=true;
  const uid=auth.currentUser.uid;
  try{
    for(const key of pendientesLocales()){
      if(auth.currentUser?.uid!==uid)break;
      const dato=JSON.parse(localStorage.getItem(key));
      if(!dato)continue;
      try{
        const a=dato.actividad;
        const next=attendanceRow(a,'presente',a.horas,'');
        const [previo]=await saveRows(db,[{person:dato.person,id:a.id,prior:null,next}],a,true);
        if(auth.currentUser?.uid!==uid)break;
        localStorage.removeItem(key);
        if(a.fecha.startsWith(selectedMonth)){
          records=records.filter(r=>r.id!==a.id||r.person!==dato.person);
          records.unshift({...(previo||next),id:a.id,person:dato.person});
        }
        window.dispatchEvent(new CustomEvent('jub-sync',{detail:{evento:a.id,person:dato.person,estado:previo?labelState(previo.estado):'Asistencia guardada'}}));
      }catch(error){
        if(error.code==='actividad-eliminada'){localStorage.removeItem(key);continue}
        const msg=['unavailable','deadline-exceeded'].includes(error.code)?'Esperando conexión':error.message;
        window.dispatchEvent(new CustomEvent('jub-sync',{detail:{evento:dato.actividad.id,person:dato.person,estado:'Pendiente · '+msg}}));
        if(!navigator.onLine||error.code==='unavailable')break;
      }
    }
  }finally{sincronizando=false}
}
window.addEventListener('online',()=>sincronizarEscaneos().catch(report));
setInterval(()=>{if(!document.hidden)sincronizarEscaneos().catch(report)},30000);
function scannerTools(root,a,reload){
  root.insertAdjacentHTML('beforeend','<video id="video" muted playsinline hidden></video><div class="quick"><button id="scan">'+icon('camara')+'Activar cámara</button><button class="light" id="stop" hidden>'+icon('pausa')+'Detener cámara</button><label class="action-link">Leer imagen del QR<input class="file-picker" id="qrFile" type="file" accept="image/*"></label></div><p id="scanResult" role="status"></p>');
  const video=el('video'),start=el('scan'),stop=el('stop'),file=el('qrFile'),result=el('scanResult');
  result.textContent='Escanea el gafete y confirma la identidad.';
  const barra=document.createElement('div');barra.className='scan-station';
  barra.innerHTML='<button type="button" class="station-open">'+icon('pc')+'Recepción en PC</button><button type="button" class="light sincronizar">'+icon('sincronizar')+'Sincronizar</button><span class="cola" role="status"></span>';
  root.prepend(barra);
  const revisionCola=document.createElement('details');revisionCola.className='revision-cola';
  revisionCola.innerHTML='<summary>Ver registros pendientes</summary><div></div>';
  barra.after(revisionCola);
  const estadoCola=()=>{
    const keys=pendientesLocales(),lista=revisionCola.querySelector('div');lista.replaceChildren();
    const cola=barra.querySelector('.cola');
    cola.dataset.pendiente=String(keys.length>0||!navigator.onLine);
    cola.innerHTML=icon(keys.length||!navigator.onLine?'horas':'listo')+'<span>'+(navigator.onLine?'':'Sin conexión · ')+(keys.length?keys.length+' pendientes de subir':'Sin pendientes de subir')+'</span>';
    revisionCola.hidden=!keys.length;
    for(const key of keys){
      const item=JSON.parse(localStorage.getItem(key));if(!item)continue;
      const fila=document.createElement('p'),quitar=document.createElement('button');
      const nombre=people.find(p=>p.id===item.person)?.nombre||'Participante';
      fila.textContent=nombre+' · '+item.actividad.titulo+' ';
      quitar.type='button';quitar.className='light';quitar.textContent='Descartar pendiente';
      quitar.onclick=()=>{if(confirm('¿Descartar el registro local de '+nombre+' para '+item.actividad.titulo+'?')){localStorage.removeItem(key);estadoCola()}};
      fila.append(quitar);lista.append(fila);
    }
  };
  estadoCola();
  barra.querySelector('.sincronizar').onclick=()=>action(sincronizarEscaneos);
  const lector=document.createElement('form');lector.className='lector-usb';
  lector.innerHTML='<label>Lector QR de escritorio<input autocomplete="off" maxlength="180" placeholder="Escanea con tu lector USB"></label><button>Revisar gafete</button>';
  root.insertBefore(lector,result);
  let leyendo=false;
  lector.onsubmit=async e=>{e.preventDefault();if(leyendo)return;leyendo=true;const input=lector.querySelector('input'),code=input.value.trim();input.value='';try{if(code)await register(code)}finally{leyendo=false;input.focus()}};
  let continuarCamara=false;
  let indicador;
  function estadoCamara(texto){
    if(indicador)indicador.textContent=texto;
  }
  barra.querySelector('.station-open').onclick=()=>{
    const mesa=document.createElement('dialog');mesa.className='mesa-entrada';
    mesa.setAttribute('aria-labelledby','puestoTitulo');
    mesa.innerHTML='<header class="puesto-top"><strong>Recepción de asistencia</strong><button type="button" class="light">Cerrar puesto y sesión</button></header><main class="puesto-main"><section class="puesto-guia"><div class="puesto-icono" aria-hidden="true">'+icon('qr')+'</div><p class="puesto-actividad">'+escape(a.titulo)+' · '+escape(fullDate(a.fecha))+'</p><h2 id="puestoTitulo">Muestra tu código QR</h2><ol class="puesto-pasos"><li>Coloca tu gafete frente a la cámara o pásalo por el lector.</li><li>Revisa tu nombre y toca <strong>Confirmar mi asistencia</strong>.</li></ol></section></main>';
    document.body.append(mesa);mesa.querySelector('main').append(root);mesa.showModal();
    const marco=document.createElement('section');
    marco.className='puesto-visor';
    marco.innerHTML='<div class="visor-etiqueta">'+icon('camara')+'<span role="status"></span></div>';
    root.insertBefore(marco,video);marco.append(video);
    indicador=marco.querySelector('span');
    continuarCamara=true;
    if(stream)estadoCamara('Cámara encendida');
    else if(!start.disabled)start.click();
    else estadoCamara('Conectando cámara…');
    const input=lector.querySelector('input');
    input.placeholder='Esperando tu credencial…';
    input.setAttribute('inputmode','none');
    lector.querySelector('label').firstChild.textContent='Lector de credenciales';
    function enfocarLector(){
      if(mesa.open&&!mesa.querySelector('dialog[open]'))input.focus({preventScroll:true});
    }
    mesa.addEventListener('click',()=>setTimeout(enfocarLector,0));
    enfocarLector();
    const salir=()=>{continuarCamara=false;idle();action(async()=>{await signOut(auth);mesa.remove()})};
    mesa.querySelector('.puesto-top button').onclick=salir;mesa.oncancel=e=>{e.preventDefault()};
  };
  let esperaPuesto;
  function mostrarResultado(texto,tipo){
    result.textContent=texto;
    if(!root.closest('.mesa-entrada'))return;
    clearTimeout(esperaPuesto);
    result.dataset.tipo=tipo;
    esperaPuesto=setTimeout(()=>{
      result.textContent='Listo para el siguiente gafete.';
      delete result.dataset.tipo;
    },9000);
  }
  const actualizar=e=>{
    if(!root.isConnected||!auth.currentUser){window.removeEventListener('jub-sync',actualizar);return}
    estadoCola();if(e.detail.evento!==a.id)return;
    const persona=people.find(p=>p.id===e.detail.person);
    mostrarResultado((persona?.nombre||'Registro')+' · '+e.detail.estado,['Asistencia guardada','Presente'].includes(e.detail.estado)?'ok':'aviso');
    if(!root.closest('.mesa-entrada'))pendingAttendance(root,a,reload);
  };
  window.addEventListener('jub-sync',actualizar);
  window.addEventListener('online',estadoCola);window.addEventListener('offline',estadoCola);
  const limpiar=new MutationObserver(()=>{
    if(root.isConnected)return;
    window.removeEventListener('jub-sync',actualizar);window.removeEventListener('online',estadoCola);window.removeEventListener('offline',estadoCola);limpiar.disconnect();
  });
  limpiar.observe(document.body,{childList:true,subtree:true});
  cargarQR('jsQR').then(()=>{if(result.isConnected&&!lastScan&&!stream)result.textContent='Escáner listo. Puedes seguir en esta pantalla si pierdes señal.'}).catch(()=>{if(result.isConnected)result.textContent='Activa la cámara con conexión para preparar el lector QR.'});
  if(lastScan)start.textContent='Escanear siguiente joven';
  function idle(){stopCamera();video.srcObject=null;video.hidden=true;stop.hidden=true;start.disabled=false;file.disabled=false}
  let revisandoGafete=false;
  async function register(code){
    if(revisandoGafete)return;
    revisandoGafete=true;
    try{
      const person=code.startsWith(prefijoQR)&&people.find(p=>p.id===code.slice(prefijoQR.length)&&p.activo);
      if(!person)throw Error('El QR no corresponde a un participante activo.');
      
      const version=cameraVersion;
      const puesto=!!root.closest('.mesa-entrada');
      const confirmed=await solicitar(root,puesto?'¿Este es tu gafete?':'Confirmar asistencia',avatar(person)+'<h4>'+escape(person.nombre)+'</h4><p>Usuario · '+escape(person.usuario)+'</p><p>'+escape(a.titulo)+' · '+escape(fullDate(a.fecha))+' · '+escape(a.horas)+' h</p>',puesto?'Confirmar mi asistencia':'Confirmar asistencia',()=>true);
      if(!confirmed||!root.isConnected||version!==cameraVersion){mostrarResultado('Lectura cancelada. Puedes volver a pasar tu gafete.','aviso');return}
      const key=colaPrefijo()+encodeURIComponent(a.id)+':'+encodeURIComponent(person.id);
      const actividad={id:a.id,fecha:a.fecha,titulo:a.titulo,horas:a.horas,categoria:a.categoria};
      try{localStorage.setItem(key,JSON.stringify({actividad,person:person.id}))}catch{throw Error('No se guardó la asistencia. Revisa el espacio disponible en este dispositivo.')}
      mostrarResultado(person.nombre+' · Guardado en este dispositivo. Pendiente de subir.','aviso');
      estadoCola();
      if(puesto)sincronizarEscaneos().catch(report);else await sincronizarEscaneos();
    }catch(e){mostrarResultado(e.message,'aviso')}
    finally{revisandoGafete=false;if(root.closest('.mesa-entrada'))lector.querySelector('input').focus({preventScroll:true})}
  }
  start.onclick=async()=>{
    idle();const version=cameraVersion;
    continuarCamara=!!root.closest('.mesa-entrada');
    estadoCamara('Conectando cámara…');
    start.disabled=file.disabled=true;stop.hidden=false;
    try{
      await cargarQR('jsQR');
      if(version!==cameraVersion||!video.isConnected)return;
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Cámara no disponible.');
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(version!==cameraVersion||!video.isConnected){media.getTracks().forEach(t=>t.stop());return}
      stream=media;video.srcObject=media;video.hidden=false;await video.play();
      if(version!==cameraVersion)return;
      estadoCamara('Cámara encendida · Lista para leer');
      media.getVideoTracks()[0]?.addEventListener('ended',()=>{if(version===cameraVersion){idle();estadoCamara('Cámara desconectada · Toca Activar cámara')}},{once:true});
      result.textContent='Centra el QR. Al confirmar el nombre, acerca el siguiente gafete.';
      const c=document.createElement('canvas'),ctx=c.getContext('2d',{willReadFrequently:true});let last=0;
      let previousCode='',lastSeen=0;
      async function tick(now){
        if(version!==cameraVersion)return;
        if(!document.hidden&&!root.querySelector('dialog[open]')&&video.readyState>=2&&now-last>=200){
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
    }catch(e){if(version===cameraVersion){idle();continuarCamara=false;estadoCamara('Cámara no disponible · Usa el lector o vuelve a activarla');result.textContent=e.message?.includes('módulo QR')?e.message:'No se pudo usar la cámara. Revisa el permiso del navegador o pulsa Leer imagen del QR.'}}
  };
  stop.onclick=()=>{continuarCamara=false;idle();estadoCamara('Cámara pausada · Toca Activar cámara')};
  file.onchange=async()=>{
    const image=file.files[0];file.value='';if(!image)return;idle();const version=cameraVersion;
    start.disabled=file.disabled=true;
    try{await cargarQR('jsQR');const code=decode(await imageCanvas(image,1600),true);if(version!==cameraVersion)return;if(!code)throw Error('No se encontró un QR. Prueba con una imagen nítida del código completo.');await register(code)}
    catch(e){result.textContent=e.message}
    finally{if(version===cameraVersion)start.disabled=file.disabled=false}
  };
  document.onvisibilitychange=()=>{
    if(!video.isConnected)return;
    if(document.hidden&&(stream||!stop.hidden)){
      idle();estadoCamara('Cámara en pausa');
    }else if(!document.hidden&&continuarCamara&&root.closest('.mesa-entrada[open]')&&!stream&&!start.disabled){
      start.click();
    }
  };
}
function identidadLista(p){
  return '<div class="identidad-lista">'+avatar(p)+'<div><strong>'+escape(p.nombre)+'</strong><small>'+escape(p.usuario||'')+'</small></div></div>';
}
function roster(root,a,reload){
  const prior=new Map(records.filter(r=>r.id===a.id).map(r=>[r.person,r]));
  const active=people.filter(p=>p.activo);
  root.insertAdjacentHTML('beforeend','<label>Buscar joven<input type="search" id="rosterSearch" placeholder="Nombre, apellido o usuario" autocomplete="off" enterkeyhint="search"></label><label>Mostrar<select id="rosterFilter"><option value="">Todos los estados</option>'+Object.entries(asistenciaVisual).filter(([k])=>['pendiente','presente','falta','justificada','no_aplica','sin_registro'].includes(k)).map(([k,[v]])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><p id="rosterCount" role="status"></p><form id="bulk"><div class="quick"><button type="button" class="light" id="allPresent">Marcar pendientes como presentes</button></div><div id="group"></div><button>Guardar lista</button></form>');
  const normalize=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  for(const p of active){
    const r=prior.get(p.id), row=document.createElement('div');row.className='list-row';row.dataset.id=p.id;
    row.dataset.estado=estadoPersonal(a,p,r);
    row.dataset.search=normalize([p.nombre,p.usuario].join(' '));
    row.innerHTML=identidadLista(p)+'<div class="fila-estado">'+etiqueta(row.dataset.estado)+'</div><div>'+avisoFaltas(p,a.fecha.slice(0,7))+'</div><label>Asistencia<select name="state"><option value="">Sin registrar</option>'+states+'</select></label><label>Horas<input type="number" name="hours" min="0" max="24" step="1"></label><label><span class="nota-label">Observaciones</span><input name="note" maxlength="240"></label>'+adjunto;
    const state=row.querySelector('select'),hours=row.querySelector('[name=hours]');state.value=r?.estado||'';hours.value=r?.horas??a.horas;hours.disabled=state.value!=='presente';row.querySelector('[name=note]').value=r?.nota||'';
    ajustarJustificante(row,state.value);
    state.onchange=()=>{
      const estado=state.value||estadoPersonal(a,p,null);
      row.querySelector('.fila-estado').innerHTML=etiqueta(estado)+(state.value!==(r?.estado||'')?' <small>Sin guardar</small>':'');
      ajustarJustificante(row,state.value);hours.disabled=state.value!=='presente';hours.value=hours.disabled?0:(r?.estado==='presente'?r.horas:a.horas)};
    el('group').append(row);
  }
  const search=el('rosterSearch'),group=el('group'),bulkButton=el('allPresent');
  function filterRoster(){
    const words=normalize(search.value).trim().split(/\s+/).filter(Boolean);
    let shown=0;
    for(const row of group.children){
      const filtro=el('rosterFilter').value;
      const matches=(!filtro||row.dataset.estado===filtro)&&words.every(word=>row.dataset.search.includes(word));
      row.hidden=!matches;
      row.style.display=matches?'':'none';
      if(matches)shown++;
    }
    el('rosterCount').textContent=shown?shown+' de '+active.length+' jóvenes':'Sin coincidencias';
    bulkButton.disabled=!shown;
    bulkButton.textContent=words.length?'Marcar pendientes visibles como presentes':'Marcar pendientes como presentes';
  }
  el('rosterFilter').onchange=filterRoster;
  search.oninput=filterRoster;
  filterRoster();
  el('allPresent').onclick=()=>{for(const select of group.querySelectorAll('.list-row:not([hidden]) select'))if(!select.value){select.value='presente';select.onchange();dirty=true}};
  form('bulk',async()=>{
    const changes=[];
    for(const row of el('group').children){
      const id=row.dataset.id,r=prior.get(id),s=row.querySelector('select').value;
      if(!s){if(r)throw Error('Para corregir o eliminar un registro usa Horas e historial.');continue}
      const h=Number(row.querySelector('[name=hours]').value),note=row.querySelector('[name=note]').value.trim();
      const input=row.querySelector('[name=evidencia]');
      if(r&&r.estado===s&&r.horas===h&&(r.nota||'')===note&&!(s==='justificada'&&input.files.length))continue;
      if(s==='justificada'&&!note)throw Error('Escribe la razón de la falta de '+row.querySelector('strong').textContent+'.');
      const next=attendanceRow(a,s,h,note);
      next.evidencia=s==='justificada'?await evidencia(input,r?.evidencia):'';
      changes.push({person:id,id:a.id,prior:r,next});
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
    item.innerHTML='<div><strong>'+escape(r.titulo)+'</strong><p>'+escape([admin?people.find(p=>p.id===r.person)?.nombre:'',fullDate(r.fecha),r.categoria,r.tipo==='manual'?'Asignación directa':''].filter(Boolean).join(' · '))+'</p>'+etiqueta(r.estado)+(r.nota?'<small>'+escape(r.nota)+'</small>':'')+'</div><b>'+escape(r.horas)+' h</b>';
    if(r.estado==='justificada'&&r.evidencia){
      const panel=document.createElement('details'),summary=document.createElement('summary'),image=document.createElement('img');
      summary.textContent='Ver foto de evidencia';image.alt='Evidencia de la falta justificada';image.loading='lazy';image.style.maxWidth='100%';image.src=r.evidencia;
      panel.append(summary,image);item.append(panel);
    }
    if(admin){
      const edit=document.createElement('details');edit.innerHTML='<summary>Corregir registro</summary><form>'+select('Estado','state',states)+field('Horas','hours','number','min="0" max="24" step="1"')+'<label><span class="nota-label">Observaciones</span><input name="note" maxlength="240"></label>'+adjunto+'<button>Guardar corrección</button><button type="button" class="light">Eliminar registro</button></form>';item.append(edit);
      const f=edit.querySelector('form');f.elements.state.value=r.estado;f.elements.state.disabled=r.tipo==='manual';f.elements.hours.value=r.horas;f.elements.note.value=r.nota||'';
      ajustarJustificante(f,r.estado);f.elements.state.onchange=()=>ajustarJustificante(f,f.elements.state.value);
      const buttons=f.querySelectorAll('button');
      f.onsubmit=e=>{e.preventDefault();action(async()=>{const {id,person,...data}=r;data.estado=f.elements.state.value;data.horas=data.estado==='presente'?Number(f.elements.hours.value):0;data.nota=f.elements.note.value.trim();
        if(data.estado==='justificada'&&!data.nota)throw Error('Escribe la razón de la falta.');
        data.evidencia=data.estado==='justificada'?await evidencia(f.elements.evidencia,r.evidencia):'';
        await saveRows(db,[{person,id,prior:r,next:data}]);await reload('Registro corregido.')},buttons[0])};
      buttons[1].onclick=()=>{if(confirm('¿Eliminar este registro de '+r.horas+' horas del historial?'))action(async()=>{await saveRows(db,[{person:r.person,id:r.id,prior:r,next:null}]);await reload('Registro eliminado.')},buttons[1])};
    }
    history.append(item);
  }
}
