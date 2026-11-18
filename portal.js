import {accountForms,awaitActivation,linkEmail,bindProfile} from './cuentas.js';
import {manageRoster} from './padron.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,updatePassword} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,getDocs,setDoc,updateDoc,runTransaction,query,where} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const app=initializeApp(await (await fetch('./firebase-web.json')).json());
const auth=getAuth(app), db=getFirestore(app);
const el=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mazatlan'}).format(new Date());
const content=el('content');
let selectedMonth=stamp().slice(0,7),people=[],activities=[],records=[],access=null,stream=null,frame=0,revision=0;
function stopCamera(){cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());stream=null}
function notice(s){el('notice').textContent=s}
function report(e){notice(e.code==='auth/invalid-credential'?'Revisa tu usuario y contraseña.':e.code==='permission-denied'?'Tu cuenta no tiene acceso a estos datos.':e.message||'No se pudo completar la operación.')}
async function action(fn,button){if(button?.disabled)return;if(button)button.disabled=true;notice('');try{await fn()}catch(e){report(e)}finally{if(button)button.disabled=false}}
function form(id,fn){el(id).onsubmit=e=>{e.preventDefault();const f=e.currentTarget;action(()=>fn(Object.fromEntries(new FormData(f))),f.querySelector('button[type=submit],button:not([type])'))}}
function field(label,name,type='text',extra=''){return '<label>'+label+'<input name="'+name+'" type="'+type+'" '+extra+' required></label>'}
function select(label,name,options){return '<label>'+label+'<select name="'+name+'" required>'+options+'</select></label>'}
function opts(xs,label){return xs.map(x=>'<option value="'+escape(x.id)+'">'+escape(label(x))+'</option>').join('')}
function snapshot(s){return s.docs.map(d=>({...d.data(),id:d.id}))}
function sum(rs){return rs.reduce((n,r)=>n+(r.estado==='presente'?Number(r.horas):0),0)}
function rowTable(rs){return '<div class="scroll"><table><thead><tr><th>Fecha</th><th>Participante</th><th>Actividad</th><th>Estado</th><th>Horas</th></tr></thead><tbody>'+rs.map(r=>'<tr>'+[r.fecha,people.find(p=>p.id===r.person)?.nombre,r.titulo,r.estado,r.horas].map(x=>'<td>'+escape(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'}
accountForms(auth,form,notice);
form('loginForm',async d=>{await signInWithEmailAndPassword(auth,d.user.trim().toLowerCase()+(d.user.includes('@')?'':'@acceso.imju.invalid'),d.pass);el('loginForm').reset()});
el('logout').onclick=()=>action(()=>signOut(auth));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera()});
onAuthStateChanged(auth,user=>{revision++;stopCamera();content.replaceChildren();people=[];activities=[];records=[];access=null;notice('');el('login').hidden=!!user;el('account').hidden=!user;if(user)action(()=>load(user))});
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
 people=list.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));activities=agenda.sort((a,b)=>a.fecha.localeCompare(b.fecha));records=rows.sort((a,b)=>b.fecha.localeCompare(a.fecha));draw(admin)
}
function draw(admin){
 stopCamera();const rs=records.filter(r=>r.fecha.startsWith(selectedMonth)),agenda=activities.filter(a=>a.fecha.startsWith(selectedMonth));
 content.innerHTML='<h2>'+escape(admin?'Panel de coordinación':people[0]?.nombre)+'</h2><label>Mes de consulta<input id="month" type="month" value="'+escape(selectedMonth)+'"></label><div class="metrics"><b>'+sum(rs)+' h acreditadas</b><b>'+rs.filter(r=>r.estado==='falta').length+' faltas</b></div>';
 el('month').onchange=e=>{if(e.target.value){selectedMonth=e.target.value;action(()=>load(auth.currentUser))}};
 if(admin)adminPanel(agenda,rs);else if(people[0])pass(people[0]);
 linkEmail(auth.currentUser,content,form,notice);
 if(admin)bindProfile(db,content,people,form,notice);
 content.insertAdjacentHTML('beforeend','<section class="card"><h3>Calendario</h3>'+ (agenda.map(a=>'<p><strong>'+escape(a.fecha)+' · '+escape(a.titulo)+'</strong><br>'+escape([a.hora,a.lugar,a.descripcion].filter(Boolean).join(' · '))+'</p>').join('')||'<p>Sin actividades este mes.</p>')+'</section><section class="card"><h3>Historial del mes</h3>'+rowTable(rs)+'</section>')
}
function pass(p){const qr=window.qrcode(0,'M');qr.addData('IMJU-JB:1:'+p.id);qr.make();const src=qr.createDataURL(8,32);content.insertAdjacentHTML('beforeend','<section class="card"><h3>Mi gafete digital</h3>'+(p.foto?'<img class="photo" alt="Mi fotografía" src="'+escape(p.foto)+'">':'')+'<p>'+escape(p.nombre)+' · '+escape(p.comunidad)+'</p><img class="qr" alt="QR individual de asistencia" src="'+src+'"><p><a href="'+src+'" download="gafete-qr.gif">Descargar mi QR</a></p></section>')}
function adminPanel(agenda,rs){
 const persons=opts(people.filter(p=>p.activo),p=>p.nombre),events=opts(agenda,a=>a.fecha+' · '+a.titulo);
 content.insertAdjacentHTML('beforeend','<section class="card"><h3>Participantes</h3><p><a href="./entrega.html">Preparar mensajes de acceso</a></p><details><summary>Ver padrón ('+people.length+')</summary>'+people.map(p=>'<p>'+escape(p.nombre)+' · '+sum(rs.filter(r=>r.person===p.id))+' h</p>').join('')+'</details><button id="csv">Descargar reporte mensual</button></section><form id="attendance"><h3>Registrar asistencia</h3>'+select('Actividad','activity',events)+select('Participante','person',persons)+select('Estado','state','<option value="presente">Presente</option><option value="justificada">Falta justificada</option><option value="falta">Falta injustificada</option>')+'<button type="submit">Guardar asistencia</button><button type="button" id="scan" class="light">Escanear gafete QR</button><button type="button" id="stop" hidden>Detener cámara</button><video id="video" playsinline muted hidden></video></form><details><summary>Asignar horas manuales</summary><form id="manual">'+select('Participante','person',persons)+field('Fecha','date','date','value="'+stamp()+'"')+field('Motivo','reason')+category()+field('Horas','hours','number','min="1" max="24"')+'<button>Asignar horas</button></form></details><details><summary>Crear actividad</summary><form id="newact">'+field('Título','title')+field('Fecha','date','date','value="'+stamp()+'"')+category()+field('Horas','hours','number','min="0" max="24"')+'<label>Lugar<input name="place"></label><label>Descripción<textarea name="description"></textarea></label><button>Agregar al calendario</button></form></details>');
 const reload=async msg=>{await load(auth.currentUser);notice(msg)};
 const tools=document.createElement('section');el('attendance').before(tools);manageRoster(tools,{app,db,people,reload,onError:report});
 form('newact',async d=>{await setDoc(doc(collection(db,'actividades')),{titulo:d.title.trim(),fecha:d.date,categoria:d.cat,horas:Number(d.hours),lugar:d.place.trim(),descripcion:d.description.trim()});await reload('Actividad guardada.')});
 let pendingManual=crypto.randomUUID();form('manual',async d=>{await setDoc(doc(db,'participantes',d.person,'registros',pendingManual),{titulo:d.reason.trim(),fecha:d.date,categoria:d.cat,estado:'presente',horas:Number(d.hours),tipo:'manual'});await reload('Horas guardadas.')});
 form('attendance',async d=>{await mark(d.person,d.activity,d.state,false);await reload('Asistencia guardada.')});
 el('csv').onclick=()=>downloadCsv(rs);el('scan').onclick=e=>action(async()=>{let choice=el('attendance').elements.activity.value;if(!choice)throw Error('Selecciona una actividad.');await scan(choice,reload)},e.currentTarget);
 el('stop').onclick=()=>{stopCamera();el('stop').hidden=true;el('video').hidden=true}
}
function category(){return select('Tipo de horas','cat','<option value="actividad">Actividad</option><option value="aprendizaje">Aprendizaje</option>')}
async function mark(person,activity,state,qr){
 const p=people.find(p=>p.id===person&&p.activo),a=activities.find(a=>a.id===activity);if(!p||!a)throw Error('Participante o actividad sin identificar.');
 const ref=doc(db,'participantes',p.id,'registros',a.id);
 await runTransaction(db,async tx=>{const prev=await tx.get(ref);if(qr&&prev.exists()){if(prev.data().estado==='presente')return;throw Error('Ya hay una falta registrada. Revisa el registro manualmente.')}tx.set(ref,{titulo:a.titulo,fecha:a.fecha,categoria:a.categoria,horas:state==='presente'?a.horas:0,estado:state,tipo:'actividad',nota:prev.data()?.nota||''})})
}
async function scan(activity,reload){
 stopCamera();const video=el('video');stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});el('stop').hidden=false;video.hidden=false;video.srcObject=stream;await video.play();
 const c=document.createElement('canvas'),ctx=c.getContext('2d',{willReadFrequently:true});const tick=()=>{if(!stream)return;if(video.readyState>=2){c.width=video.videoWidth;c.height=video.videoHeight;ctx.drawImage(video,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height);const code=window.jsQR(pixels.data,c.width,c.height);
 if(code){stopCamera();video.hidden=true;el('stop').hidden=true;action(async()=>{if(!code.data.startsWith('IMJU-JB:1:'))throw Error('QR ajeno al programa.');const id=code.data.slice('IMJU-JB:1:'.length);await mark(id,activity,'presente',true);await reload('Asistencia confirmada para '+people.find(p=>p.id===id).nombre+'.')});return}}
 frame=requestAnimationFrame(tick)};tick()
}
function downloadCsv(rs){const quote=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};const head=['joven','usuario','comunidad','generacion','telefono','dependencia','actividad','tipo_horas','fecha','asistencia','horas','observaciones'];const data=rs.map(r=>{const p=people.find(p=>p.id===r.person);return [p.nombre,p.usuario,p.comunidad,p.generacion,p.telefono,p.dependencia,r.titulo,r.categoria,r.fecha,r.estado,r.horas,r.nota]});const blob=new Blob(['\ufeff'+[head,...data].map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='IMJU-'+selectedMonth+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),5000)}
