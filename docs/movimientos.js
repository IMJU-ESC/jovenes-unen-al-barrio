import {collection,doc,query,where,getDocsFromServer,runTransaction,increment} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const caps={actividad:80,aprendizaje:10};
const key=r=>r?JSON.stringify([r.fecha,r.titulo,r.horas,r.estado,r.categoria,r.nota||'',r.tipo]):null;

export const limiteFaltas=4;
async function contarFaltas(person){
  const faltas=await getDocsFromServer(query(collection(person,'registros'),where('estado','==','falta')));
  return faltas.size;
}
function estadoAsistencia(profile,total){
  const baja=total>=limiteFaltas;
  const automatic=Boolean(profile.bajaPorFaltas||profile.activo)&&baja;
  return {faltasAcumuladas:total,bajaPorFaltas:automatic,activo:!baja&&Boolean(profile.activo||profile.bajaPorFaltas)};
}
export async function prepararAsistencia(db,profile,admin){
  if(Number.isInteger(profile.faltasAcumuladas))return profile;
  const ref=doc(db,'participantes',profile.id);
  if(!admin)return {...profile,...estadoAsistencia(profile,await contarFaltas(ref))};
  const data=await runTransaction(db,async tx=>{
    const current=(await tx.get(ref)).data();
    if(!current)throw Error('El expediente cambió. Actualiza el panel.');
    if(Number.isInteger(current.faltasAcumuladas))return current;
    const estado=estadoAsistencia(current,await contarFaltas(ref));
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
      const latest=(await tx.get(doc(db,'actividades',activity.id))).data();
      if(!latest||['fecha','horas','categoria','titulo'].some(k=>latest[k]!==activity[k]))throw Error('La actividad cambió. Actualiza el panel antes de registrar.');
    }
    const plans=await Promise.all(changes.map(async c=>{
      const person=doc(db,'participantes',c.person), record=doc(collection(person,'registros'),c.id);
      const [profile,current]=await Promise.all([tx.get(person),tx.get(record)]);
      if(!profile.exists()||(!profile.data().activo&&!c.prior))throw Error('Participante inactivo o sin expediente.');
      const old=current.data();
      if(scan&&old)return {existing:old};
      if(key(old)!==key(c.prior))throw Error('Cambió un registro desde que abriste la lista. Actualiza y revisa antes de guardar.');
      if(c.next){
        const r=c.next,month=r.fecha.slice(0,7);
        if(!(r.categoria in caps)||!Number.isInteger(r.horas)||r.horas<0||r.horas>24)throw Error('Revisa la categoría y las horas.');
        if(r.estado==='presente'&&r.horas>0){
          const rows=await getDocsFromServer(query(collection(person,'registros'),where('fecha','>=',month+'-01'),where('fecha','<=',month+'-31')));
          let total=r.horas;
          for(const d of rows.docs){const v=d.data();if(d.id!==record.id&&v.categoria===r.categoria&&v.estado==='presente')total+=Number(v.horas)}
          if(total>caps[r.categoria])throw Error(profile.data().nombre+' superaría el máximo mensual de '+caps[r.categoria]+' horas de '+r.categoria+'.');
        }
      }
      const data=profile.data();
      const total=Number.isInteger(data.faltasAcumuladas)?data.faltasAcumuladas:await contarFaltas(person);
      const cambio=Number(c.next?.estado==='falta')-Number(old?.estado==='falta');
      return {person,record,next:c.next,estado:estadoAsistencia(data,total+cambio)};
    }));
    for(const p of plans){
      if(p.existing)continue;
      if(p.next)tx.set(p.record,p.next,{merge:true});else tx.delete(p.record);
      tx.update(p.person,{...p.estado,revisionHoras:increment(1)});
    }
    return plans.map(p=>p.existing||null);
  });
}
