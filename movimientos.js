import {espacio} from './dependencias.js';
import {collection,doc,getDocsFromServer,increment,query,runTransaction,where} from './firebase-sdk-11.10.0.js';

const categorias=new Set(['actividad','aprendizaje']);
const key=r=>r?JSON.stringify([r.fecha,r.titulo,r.horas,r.estado,r.categoria,r.nota||'',r.evidencia||'',r.tipo]):null;

export const limiteFaltas=4;
async function contarFaltas(person){
  const faltas=await getDocsFromServer(query(collection(person,'registros'),where('estado','==','falta')));
  const meses={};
  for(const row of faltas.docs)ajustarMes(meses,row.data(),1);
  return meses;
}
function ajustarMes(meses,registro,delta){
  if(registro?.estado!=='falta')return;
  const mes=registro.fecha.slice(0,7);
  meses[mes]=(meses[mes]||0)+delta;
  if(!meses[mes])delete meses[mes];
}
export async function prepararAsistencia(db,profile,admin){
  if(profile.faltasPorMes)return profile;
  const ref=doc(espacio(db),'participantes',profile.id);
  if(!admin)return {...profile,faltasPorMes:await contarFaltas(ref)};
  const data=await runTransaction(db,async tx=>{
    const current=(await tx.get(ref)).data();
    if(!current)throw Error('El expediente cambió. Actualiza el panel.');
    if(current.faltasPorMes)return current;
    const estado={faltasPorMes:await contarFaltas(ref)};
    tx.update(ref,estado);return {...current,...estado};
  });
  return {...data,id:profile.id};
}

// El expediente versiona las escrituras que afectan el saldo mensual.
// Si otra sesión guarda horas al mismo tiempo, Firestore repite la lectura.
export async function saveRows(db,changes,activity=null,scan=false){
  if(!changes.length)return [];
  return runTransaction(db,async tx=>{
    if(activity){
      const latest=(await tx.get(doc(espacio(db),'actividades',activity.id))).data();
      if(!latest)throw Object.assign(Error('La actividad fue eliminada.'),{code:'actividad-eliminada'});
      if(scan==='exenciones'&&Boolean(latest.listaCerrada)!==Boolean(activity.listaCerrada))throw Error('Cambió el estado de la lista. Actualiza la actividad.');
      if(scan==='cierre'&&latest?.listaCerrada)return [];
      if(scan===true&&latest?.listaCerrada)throw Error('Lista cerrada. Revisa la asistencia desde el perfil.');
      if(!latest||['fecha','horas','categoria','titulo'].some(k=>latest[k]!==activity[k]))throw Error('La actividad cambió. Actualiza el panel antes de registrar.');
    }
    const plans=await Promise.all(changes.map(async c=>{
      const person=doc(espacio(db),'participantes',c.person), record=doc(collection(person,'registros'),c.id);
      const [profile,current]=await Promise.all([tx.get(person),tx.get(record)]);
      if(scan==='cierre'&&(!profile.exists()||!profile.data().activo||profile.data().muestra||profile.data().fechaAlta>activity.fecha))return {omitido:true};
      if(!profile.exists()||(!profile.data().activo&&!c.prior))throw Error('Participante inactivo o sin expediente.');
      const old=current.data();
      if((scan===true||scan==='cierre')&&old)return {existing:old};
      if(key(old)!==key(c.prior))throw Error('Cambió un registro desde que abriste la lista. Actualiza y revisa antes de guardar.');
      if(c.next){
        const r=c.next;
        if(!categorias.has(r.categoria)||!Number.isInteger(r.horas)||r.horas<0||r.horas>24)throw Error('Revisa la categoría y las horas.');

      }
      const data=profile.data();
      const meses={...(data.faltasPorMes||await contarFaltas(person))};
      ajustarMes(meses,old,-1);ajustarMes(meses,c.next,1);
      return {person,record,next:c.next,estado:{faltasPorMes:meses}};
    }));
    for(const p of plans){
      if(p.existing||p.omitido)continue;
      if(p.next)tx.set(p.record,p.next,{merge:scan!=='exenciones'});else tx.delete(p.record);
      tx.update(p.person,{...p.estado,revisionHoras:increment(1)});
    }
    return plans.map(p=>p.existing||null);
  });
}
