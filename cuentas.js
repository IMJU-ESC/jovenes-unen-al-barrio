import {espacio,dependencia,dominioUsuario} from './dependencias.js';
import {collection,createUserWithEmailAndPassword,doc,getDocs,query,runTransaction,sendEmailVerification,sendPasswordResetEmail,verifyBeforeUpdateEmail,where} from './firebase-sdk-11.10.0.js';

const alias=dominioUsuario;
function realEmail(value){
  const email=value.trim().toLowerCase();
  if(email.endsWith('.invalid'))throw Error('Escribe un correo en el que puedas recibir mensajes.');
  return email;
}
export function accountForms(auth,form,notice){
  auth.languageCode='es';
  function openSection(){
    const coord=!dependencia&&location.hash==='#coordinacion';
    document.getElementById('register').hidden=coord;
    document.getElementById('recovery').hidden=coord;
    const username=document.getElementById('loginForm').elements.user;
    if(coord)username.value='coordinacion';
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
    const address=realEmail(email);
    let credential;
    try{credential=await createUserWithEmailAndPassword(auth,address,password)}
    catch(error){
      if(error.code!=='auth/email-already-in-use')throw error;
      document.getElementById('signupForm').reset();
      document.getElementById('register').open=false;
      const login=document.getElementById('loginForm');
      login.elements.user.value=address;
      login.elements.pass.value='';
      document.getElementById('resetForm').elements.email.value=address;
      document.getElementById('recovery').open=true;
      login.elements.pass.focus();
      notice('Ese correo ya tiene cuenta. Ingresa con tu contraseña o pulsa «Enviar enlace de recuperación».');
      return;
    }
    const {user}=credential;
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
  content.innerHTML='<h2>Vincula tu acceso</h2><p>Para recuperar tu expediente, muestra esta pantalla a coordinación y acredita tu identidad.</p><p id="identity"></p><label>Identificador de tu cuenta<input readonly id="ownUid"></label><button id="check">Revisar mi acceso</button>';
  document.getElementById('identity').textContent=user.email;
  document.getElementById('ownUid').value=user.uid;
  document.getElementById('check').onclick=e=>action(refresh,e.target);
}
export function linkEmail(user,root,form,notice){
  if(!user.email?.endsWith(alias))return;
  root.insertAdjacentHTML('beforeend','<details><summary>Vincular mi correo de recuperación</summary><form id="linkEmail"><label>Mi correo personal<input name="email" type="email" autocomplete="email" required></label><p>Después de confirmar el enlace en tu buzón, inicia sesión con ese correo y tu contraseña actual.</p><button>Verificar mi correo</button></form></details>');
  form('linkEmail',async({email})=>{
    try{await verifyBeforeUpdateEmail(user,realEmail(email))}
    catch(e){if(e.code==='auth/email-already-in-use')throw Error('Ese correo ya tiene otra cuenta. Si es tuya, entra con ese correo y pide a coordinación que revise la vinculación de tu expediente.');if(e.code==='auth/requires-recent-login')throw Error('Cierra sesión y vuelve a entrar antes de vincular el correo.');throw e}
    notice('Revisa tu buzón y confirma el cambio. Después podrás recuperar tu contraseña con ese correo.');
  });
}
export function bindProfile(db,root,people,form,notice){
  root.insertAdjacentHTML('beforeend','<details><summary>Recuperar el acceso de un joven sin correo vinculado</summary><form id="bindProfile"><p>Verifica la identidad del joven y copia el identificador de la pantalla «Vincula tu acceso» de su cuenta nueva. Al guardar, su cuenta anterior perderá acceso al expediente.</p><label>Expediente<select id="bindPerson" name="person" required></select></label><label>Identificador de la nueva cuenta verificada<input name="uid" required pattern="[a-zA-Z0-9]{20,64}"></label><label><input type="checkbox" required style="width:auto"> Confirmé la identidad y comprobé el identificador en la pantalla del joven.</label><button>Vincular expediente</button></form></details>');
  const select=document.getElementById('bindPerson');
  select.add(new Option('Selecciona un expediente',''));
  for(const p of people.filter(p=>p.activo))select.add(new Option(p.nombre+' · '+p.usuario,p.id));
  form('bindProfile',async({person,uid})=>{
    const ref=doc(espacio(db),'accesos',uid), personRef=doc(espacio(db),'participantes',person);
    const matches=await getDocs(query(collection(espacio(db),'accesos'),where('participante','==',person)));
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
