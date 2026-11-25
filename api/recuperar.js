const {randomBytes}=require('node:crypto');
const {initializeApp,getApps,cert}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const projectId='jovenes-que-unen-al-barrio';
module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).end();
  if(!process.env.FIREBASE_ADMIN_JSON)return res.status(503).json({error:'Falta activar la recuperación en Vercel. Tu usuario y contraseña siguen iguales.'});
  try{
    const app=getApps()[0]||initializeApp({credential:cert(JSON.parse(process.env.FIREBASE_ADMIN_JSON)),projectId});
    const auth=getAuth(app),db=getFirestore(app);
    const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if(!token)return res.status(401).end();
    const caller=await auth.verifyIdToken(token,true);
    const {sede,person}=req.body||{};
    if(!['','mujer','atencion-ciudadana'].includes(sede)||typeof person!=='string'||!/^[-\w]{1,128}$/.test(person)||person==='ADMIN')return res.status(400).end();
    const base=sede?'dependencias/'+sede+'/':'';
    // Confirmar con las reglas vigentes que el solicitante puede leer el expediente.
    const permiso=await fetch('https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents/'+base+'participantes/'+person,{headers:{Authorization:'Bearer '+token}});
    if(!permiso.ok)return res.status(403).end();
    const scope=db.collection(base+'accesos'),perfil=db.doc(base+'participantes/'+person);
    const coordinador=scope.doc(caller.uid);
    const role=(await coordinador.get()).data();
    if(role?.participante!=='ADMIN'||!role.activo||!role.listo)return res.status(403).end();
    const ficha=(await perfil.get()).data();
    if(!ficha?.activo)return res.status(409).end();
    const usuario=ficha.usuario;
    const email=usuario+(sede?'@'+sede:'@')+(sede?'.':'')+'acceso.imju.invalid';
    const original=await auth.getUserByEmail(email);
    const originalRef=scope.doc(original.uid);
    if(original.disabled||original.uid===caller.uid)return res.status(409).end();
    const clave=randomBytes(12).toString('base64url');
    // Deshabilitar el acceso al expediente antes de cambiar la contraseña.
    await db.runTransaction(async tx=>{
      const [actual,cuenta,admin]=await Promise.all([tx.get(perfil),tx.get(originalRef),tx.get(coordinador)]);
      if(!actual.data()?.activo||actual.data().usuario!==usuario||cuenta.data()?.participante!==person||admin.data()?.participante!=='ADMIN'||!admin.data()?.activo||!admin.data()?.listo)throw Error('estado');
      tx.update(originalRef,{listo:false});
    });
    await auth.updateUser(original.uid,{password:clave});
    await db.runTransaction(async tx=>{
      const [actual,origen,activas,admin]=await Promise.all([tx.get(perfil),tx.get(originalRef),tx.get(scope.where('participante','==',person).where('activo','==',true)),tx.get(coordinador)]);
      if(!actual.data()?.activo||actual.data().usuario!==usuario||origen.data()?.participante!==person||admin.data()?.participante!=='ADMIN'||!admin.data()?.activo||!admin.data()?.listo)throw Error('estado');
      for(const doc of activas.docs)if(doc.id!==original.uid)tx.update(doc.ref,{activo:false,suspendidoPorPadron:false});
      tx.update(originalRef,{activo:true,listo:false,suspendidoPorPadron:false});
      tx.update(perfil,{usuarioAcceso:usuario});
    });
    res.json({usuario,clave});
  }catch(err){
    res.status(409).json({error:err.code==='auth/user-not-found'?'El usuario original no está asociado a una cuenta de acceso. Revisa si vinculó su correo personal.':'No se completó la recuperación. Actualiza el perfil y vuelve a intentar.'});
  }
};
