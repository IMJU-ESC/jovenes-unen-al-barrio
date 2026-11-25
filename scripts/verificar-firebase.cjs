const {initializeApp,cert}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
async function verificar(){
  if(process.env.VERCEL_ENV!=='production')return;
  const credencial=JSON.parse(process.env.FIREBASE_ADMIN_JSON);
  if(credencial.project_id!=='jovenes-que-unen-al-barrio')throw Error();
  const app=initializeApp({credential:cert(credencial)});
  await Promise.all([
    getAuth(app).getUsers([{uid:'verificacion-de-conexion'}]),
    getFirestore(app).doc('accesos/verificacion-de-conexion').get()
  ]);
  console.log('Conexion con Firebase Auth y Firestore verificada.');
}
verificar().then(()=>process.exit(0)).catch(()=>{console.error('Revisa FIREBASE_ADMIN_JSON y los permisos de Auth y Firestore.');process.exit(1)});
