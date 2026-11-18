import {createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,verifyBeforeUpdateEmail} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {collection,doc,getDocs,query,runTransaction,where} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const alias='@acceso.imju.invalid';
const idPattern=/^[a-zA-Z0-9]{20,64}$/;
function realEmail(value){
  const email=value.trim().toLowerCase();
  if(email.endsWith('.invalid'))throw Error('Escribe un correo en el que puedas recibir mensajes.');
  return email;
}
export function accountForms(auth,form,notice){
  auth.languageCode='es';
  function openSection(){
    if(['#register','#recovery'].includes(location.hash)){
      const section=document.querySelector(location.hash);
      section.open=true;
    }
  }
  openSection();
  window.addEventListener('hashchange',openSection);
  form('resetForm',async({email})=>{
    try{await sendPasswordResetEmail(auth,realEmail(email))}
    catch(e){if(e.code!=='auth/user-not-found')throw e}
    notice('Si ese correo tiene una cuenta, recibirás un enlace. Revisa también el correo no deseado.');
  });
  form('signupForm',async({email,password})=>{
    const {user}=await createUserWithEmailAndPassword(auth,realEmail(email),password);
    document.getElementById('signupForm').reset();
    await sendEmailVerification(user);
    notice('Enviamos un enlace de verificación a tu correo.');
  });
}
export function awaitActivation({user,db,content,notice,action,refresh}){
  content.replaceChildren();
  if(!user.email||user.email.endsWith(alias)){
    content.textContent='Pide a coordinación que revise la activación de tu usuario.';
    return;
  }
  if(!user.emailVerified){
    content.innerHTML='<h2>Verifica tu correo</h2><p>Abre el mensaje de Firebase y confirma tu dirección. Revisa también el correo no deseado.</p><button id="verified">Ya verifiqué mi correo</button><button class="light" id="resend">Reenviar verificación</button>';
    document.getElementById('verified').onclick=e=>action(async()=>{
      await user.reload();await user.getIdToken(true);
      if(!user.emailVerified)throw Error('La verificación todavía está pendiente.');
      await refresh();
    },e.target);
    document.getElementById('resend').onclick=e=>action(async()=>{await sendEmailVerification(user);notice('Correo de verificación enviado.')},e.target);
    return;
  }
  content.innerHTML='<h2>Vincula tu acceso</h2><p>Para recuperar tu expediente, muestra esta pantalla a coordinación y acredita tu identidad.</p><p id="identity"></p><label>Identificador de tu cuenta<input readonly id="ownUid"></label><button id="check">Revisar mi acceso</button><details><summary>Activar mi usuario maestro</summary><p>Solo el propietario de Firebase puede autorizar este acceso. Abre las reglas del proyecto y copia su texto completo en este recuadro. Después pulsa «Preparar reglas», copia el resultado en Firebase y pulsa <strong>Publicar</strong>.</p><p><a target="_blank" rel="noopener noreferrer" href="https://console.firebase.google.com/project/jovenes-que-unen-al-barrio/firestore/rules">Abrir reglas de Firebase</a></p><label>Reglas actuales de Firebase<textarea id="currentRules" rows="5"></textarea></label><button id="prepare">Preparar reglas</button><div id="prepared" hidden><label>Reglas para publicar<textarea id="resultRules" rows="5" readonly></textarea></label><button id="copyRules">Copiar reglas preparadas</button></div><button id="activate">Activar mi usuario maestro</button></details>';
  document.getElementById('identity').textContent=user.email;
  document.getElementById('ownUid').value=user.uid;
  document.getElementById('check').onclick=e=>action(refresh,e.target);
  if(!idPattern.test(user.uid)){document.getElementById('activate').disabled=true;return}
  const current=document.getElementById('currentRules'), result=document.getElementById('resultRules'), prepared=document.getElementById('prepared');
  current.oninput=()=>{prepared.hidden=true;result.value=''};
  document.getElementById('prepare').onclick=e=>action(async()=>{
    result.value=prepareRules(current.value,user.uid);
    prepared.hidden=false;
  },e.target);
  document.getElementById('copyRules').onclick=e=>action(async()=>{
    try{await navigator.clipboard.writeText(result.value);notice('Reglas copiadas. Pégalas en Firebase y pulsa Publicar.')}
    catch{result.select();notice('Usa Copiar sobre el texto seleccionado.')}
  },e.target);
  document.getElementById('activate').onclick=e=>action(async()=>{
    const ref=doc(db,'accesos',user.uid);
    try{await runTransaction(db,async tx=>{
      const account=await tx.get(ref);
      if(account.exists())throw Error('Esta cuenta ya tiene un acceso. Pulsa Revisar mi acceso.');
      tx.set(ref,{participante:'ADMIN',activo:true,listo:true});
    })}catch(err){if(err.code==='permission-denied')throw Error('Firebase aún no ha autorizado esta cuenta como maestra. Comprueba que publicaste la condición de esta cuenta.');throw err}
    await refresh();
  },e.target);
}
export function linkEmail(user,root,form,notice){
  if(!user.email?.endsWith(alias))return;
  root.insertAdjacentHTML('beforeend','<details><summary>Vincular mi correo de recuperación</summary><form id="linkEmail"><label>Mi correo personal<input name="email" type="email" autocomplete="email" required></label><p>Después de confirmar el enlace en tu buzón, inicia sesión con ese correo y tu contraseña actual.</p><button>Verificar mi correo</button></form></details>');
  form('linkEmail',async({email})=>{
    try{await verifyBeforeUpdateEmail(user,realEmail(email))}
    catch(e){if(e.code==='auth/requires-recent-login')throw Error('Cierra sesión y vuelve a entrar antes de vincular el correo.');throw e}
    notice('Revisa tu buzón y confirma el cambio. Después podrás recuperar tu contraseña con ese correo.');
  });
}
export function bindProfile(db,root,people,form,notice){
  root.insertAdjacentHTML('beforeend','<details><summary>Recuperar el acceso de un joven sin correo vinculado</summary><form id="bindProfile"><p>Verifica la identidad del joven y copia el identificador de la pantalla «Vincula tu acceso» de su cuenta nueva. Al guardar, su cuenta anterior perderá acceso al expediente.</p><label>Expediente<select id="bindPerson" name="person" required></select></label><label>Identificador de la nueva cuenta verificada<input name="uid" required pattern="[a-zA-Z0-9]{20,64}"></label><label><input type="checkbox" required style="width:auto"> Confirmé la identidad y comprobé el identificador en la pantalla del joven.</label><button>Vincular expediente</button></form></details>');
  const select=document.getElementById('bindPerson');
  select.add(new Option('Selecciona un expediente',''));
  for(const p of people.filter(p=>p.activo))select.add(new Option(p.nombre+' · '+p.usuario,p.id));
  form('bindProfile',async({person,uid})=>{
    const ref=doc(db,'accesos',uid), personRef=doc(db,'participantes',person);
    const matches=await getDocs(query(collection(db,'accesos'),where('participante','==',person)));
    const previous=matches.docs.filter(s=>s.data().activo);
    if(previous.length!==1)throw Error('El expediente debe tener exactamente un acceso activo. Revisa el padrón.');
    await runTransaction(db,async tx=>{
      const [profile,prior,next]=await Promise.all([tx.get(personRef),tx.get(previous[0].ref),tx.get(ref)]);
      if(!profile.data()?.activo||!prior.data()?.activo||prior.data()?.participante!==person)throw Error('El acceso cambió. Vuelve a revisar el expediente.');
      if(next.exists())throw Error('Ese identificador ya tiene un acceso asignado.');
      tx.update(previous[0].ref,{activo:false});
      tx.set(ref,{participante:person,activo:true,listo:true});
    });
    document.getElementById('bindProfile').reset();
    notice('Expediente vinculado. Pide al joven que pulse Revisar mi acceso.');
  });
}

function prepareRules(source,uid){
  if(!idPattern.test(uid))throw Error('Identificador inválido.');
  const pattern=/(function\s+admin\s*\(\s*\)\s*\{\s*return\s+)([^;{}]+)(;\s*\})/g;
  const matches=[...source.matchAll(pattern)];
  if(matches.length!==1||!source.includes('service cloud.firestore')||!source.includes('match /accesos/{uid}')){
    throw Error('Copia las reglas completas de Firestore del proyecto. No se identificó la función de coordinación.');
  }
  const condition="(request.auth != null && request.auth.uid == '"+uid+"' && request.auth.token.email_verified == true)";
  if(matches[0][2].includes(condition))return source;
  return source.replace(pattern,(_,start,expression,end)=>start+expression.trimEnd()+'\n        || '+condition+end);
}
