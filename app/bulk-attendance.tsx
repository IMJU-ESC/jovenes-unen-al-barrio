"use client";

import {compressImage} from "../lib/compress-image";
import { useEffect, useRef, useState } from "react";

type Activity = {id:string;title:string;date:string;category:string;hours:number;evidence?:{id:string;url:string;caption:string}[]};
type Prior = {id:string;status:string;hours:number;note:string;markedAt:string};
type Row = {id:string;name:string;community:string;photoKey?:string;active:number;status:string;hours:string;note:string;expected:Prior|null};
type RosterResponse = {activity:{date:string;category:string};people:(Omit<Row,"hours"|"expected">&{hours:number|null;attendanceId:string|null;markedAt:string})[]};
type Photo = {id:string;file:File;preview:string;state:"pending"|"uploading"|"done"|"error";error?:string};
type Props = {activities:Activity[];month:string;activityId:string;onActivityChange:(id:string)=>void;onSaved:()=>Promise<void>;onStateChange:(state:{pending:boolean;working:boolean})=>void};

async function request<T={ok:boolean}>(path:string, body?:unknown, signal?:AbortSignal):Promise<T>{
 const response=await fetch("/api/"+path,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,signal});
 const data=await response.json() as T&{error?:string};
 if(!response.ok)throw Error(data.error||"No se pudo completar la solicitud.");
 return data;
}
function changed(row:Row){
 if(!row.expected)return row.status!=="pending";
 return row.status!==row.expected.status||Number(row.hours)!==row.expected.hours||row.note!==row.expected.note;
}
export default function BulkAttendance({activities,month,activityId,onActivityChange,onSaved,onStateChange}:Props){
 const [view,setView]=useState("lista");
 const [rows,setRows]=useState<Row[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [query,setQuery]=useState("");
 const [commonHours,setCommonHours]=useState("2");
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [photos,setPhotos]=useState<Photo[]>([]);
 const [caption,setCaption]=useState("");
 const [uploading,setUploading]=useState(false);
 const [activityVersion,setActivityVersion]=useState<{date:string;category:string}|null>(null);
 const retry=useRef<{key:string;payload:unknown}|null>(null);
 const previews=useRef(new Set<string>());
 const activity=activities.find(a=>a.id===activityId);
 const dirty=rows.filter(changed);
 const pendingPhotos=photos.some(p=>p.state!=="done");
 const locked=busy||uploading;
 useEffect(()=>{onStateChange({pending:dirty.length>0||pendingPhotos,working:locked})},[dirty.length,pendingPhotos,locked]);
 const load=async(signal?:AbortSignal)=>{
  const result=await request<RosterResponse>("activity-roster?activityId="+encodeURIComponent(activityId),undefined,signal);
  if(signal?.aborted)return;
  setActivityVersion(result.activity);
  setRows(result.people.map(p=>({...p,status:p.status||"pending",hours:String(p.hours??0),note:p.note||"",
   expected:p.attendanceId?{id:p.attendanceId,status:p.status,hours:p.hours??0,note:p.note,markedAt:p.markedAt}:null})));
  setSelected([]);retry.current=null;
 };
 useEffect(()=>{
  const controller=new AbortController();
  setRows([]);setSelected([]);setMessage("");setQuery("");setActivityVersion(null);
  setCommonHours(String(activities.find(a=>a.id===activityId)?.hours??0));
  for(const url of previews.current)URL.revokeObjectURL(url);
  previews.current.clear();setPhotos([]);setCaption("");
  if(activityId){setLoading(true);load(controller.signal).catch(e=>{if(!controller.signal.aborted)setMessage(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})}
  return ()=>controller.abort();
 },[activityId]);
 useEffect(()=>()=>{for(const url of previews.current)URL.revokeObjectURL(url)},[]);
 useEffect(()=>{
  const warn=(e:BeforeUnloadEvent)=>{if(dirty.length||pendingPhotos||locked){e.preventDefault();e.returnValue=""}};
  window.addEventListener("beforeunload",warn);return ()=>window.removeEventListener("beforeunload",warn);
 },[dirty.length,pendingPhotos,locked]);
 const chooseActivity=(id:string)=>{
  if((dirty.length||pendingPhotos)&&!window.confirm("Hay cambios o fotos pendientes. ¿Descartarlos y cambiar de actividad?"))return;
  onActivityChange(id);
 };
 const visible=rows.filter(r=>(r.name+" "+r.community).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const update=(id:string,patch:Partial<Row>)=>setRows(old=>old.map(r=>r.id===id?{...r,...patch}:r));
 const apply=(status:string)=>{
  if(status==="presente"&&(!Number.isInteger(Number(commonHours))||Number(commonHours)<0||Number(commonHours)>24)){setMessage("Escribe de 0 a 24 horas enteras.");return}
  setRows(old=>old.map(r=>selected.includes(r.id)?{...r,status,hours:status==="presente"?commonHours:"0"}:r));
 };
 const save=async()=>{
  if(!activityVersion||!dirty.length)return;
  if(dirty.some(r=>r.status==="presente"&&(!r.hours.trim()||!Number.isInteger(Number(r.hours))||Number(r.hours)<0||Number(r.hours)>24))){setMessage("Revisa las horas de los presentes (0 a 24).");return}
  const removals=dirty.filter(r=>r.expected&&r.status==="pending").length;
  if(removals&&!window.confirm("Se eliminarán "+removals+" registros y sus horas o faltas de esta actividad. ¿Guardar?"))return;
  const data={activityId,activityDate:activityVersion.date,activityCategory:activityVersion.category,changes:dirty.map(r=>({studentId:r.id,status:r.status,hours:r.status==="presente"?Number(r.hours):0,note:r.note,expected:r.expected}))};
  const key=JSON.stringify(data);
  if(retry.current?.key!==key)retry.current={key,payload:{...data,requestId:crypto.randomUUID()}};
  setBusy(true);setMessage("");
  try{
   await request("attendance-batch",retry.current.payload);
   setMessage("Lista guardada. Las horas y faltas están actualizadas.");
   await load();await onSaved();
  }catch(e){setMessage(e instanceof Error?e.message:"No se pudo guardar. Puedes reintentar.")}
  finally{setBusy(false)}
 };
 const addPhotos=(files:FileList|null)=>{
  if(!files)return;
  const incoming:Photo[]=[];const errors:string[]=[];
  for(const file of Array.from(files)){
   if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>25*1024*1024){errors.push(file.name);continue}
   const preview=URL.createObjectURL(file);previews.current.add(preview);
   incoming.push({id:crypto.randomUUID(),file,preview,state:"pending"});
  }
  setPhotos(old=>[...old,...incoming]);
  if(errors.length)setMessage("Revisa estos archivos: "+errors.join(", ")+". Usa JPG, PNG o WebP de hasta 25 MB; se comprimen automáticamente.");
 };
 const upload=async()=>{
  setUploading(true);setMessage("");
  let ok=0,failed=0;
  for(const photo of photos.filter(p=>p.state!=="done")){
   setPhotos(old=>old.map(p=>p.id===photo.id?{...p,state:"uploading",error:undefined}:p));
   try{
    const form=new FormData();form.set("kind","evidence");form.set("activityId",activityId);form.set("uploadId",photo.id);form.set("caption",caption);form.set("file",await compressImage(photo.file));
    const response=await fetch("/api/upload",{method:"POST",body:form});const result=await response.json() as {error?:string};
    if(!response.ok)throw Error(result.error||"No se pudo subir.");
    setPhotos(old=>old.map(p=>p.id===photo.id?{...p,state:"done"}:p));ok++;
   }catch(e){failed++;setPhotos(old=>old.map(p=>p.id===photo.id?{...p,state:"error",error:e instanceof Error?e.message:"No se pudo subir."}:p))}
  }
  setUploading(false);setMessage(ok+" fotos subidas. "+(failed?failed+" pendientes de reintentar.":""));
  await onSaved();
 };
 return <section className="bulk-roster">
 <div className="welcome-row"><div><h1>Lista y evidencias</h1><p>Elige la actividad, marca al grupo y guarda sus registros.</p></div></div>
 <label className="card bulk-picker">Actividad<select disabled={locked} value={activityId} onChange={e=>chooseActivity(e.target.value)}><option value="">Selecciona una actividad</option>{activities.filter(a=>a.date.startsWith(month)||a.id===activityId).map(a=><option key={a.id} value={a.id}>{a.date} · {a.title}</option>)}</select></label>
 {message&&<p className="notice-banner" role="status">{message}</p>}
 {loading&&<p role="status">Cargando lista…</p>}
 {activity&&!loading&&activityVersion&&<>
 <div className="section-switch" role="group" aria-label="Vista de la actividad"><button aria-pressed={view==="lista"} onClick={()=>setView("lista")}>Lista de asistencia</button><button aria-pressed={view==="fotos"} onClick={()=>setView("fotos")}>Evidencias {photos.length?`(${photos.length})`:""}</button></div>
 <section hidden={view!=="lista"} className="card bulk-controls"><h2>{activity.title}</h2><p>{activity.date} · {activity.category==="aprendizaje"?"Aprendizaje":"Actividades"} · {dirty.length} cambios pendientes</p>
 <div className="bulk-summary">{[["presente","Presentes"],["falta","Injustificadas"],["justificada","Justificadas"],["pending","Pendientes"]].map(([value,label])=><span key={value}>{label} <b>{rows.filter(r=>r.status===value).length}</b></span>)}</div>
 <label>Buscar joven o comunidad<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <div className="bulk-selection"><button className="outline" disabled={locked} onClick={()=>setSelected([...new Set([...selected,...visible.map(r=>r.id)])])}>Seleccionar visibles ({visible.length})</button><button className="text-button" disabled={locked} onClick={()=>setSelected([])}>Quitar selección</button><strong>{selected.length} seleccionados</strong></div>
 <fieldset disabled={locked||!selected.length}><legend>Aplicar a los seleccionados</legend>
 <label>Horas por joven<input type="number" min="0" max="24" step="1" value={commonHours} onChange={e=>setCommonHours(e.target.value)}/></label>
 <div className="bulk-actions"><button className="primary" onClick={()=>apply("presente")}>Presentes + horas</button><button className="outline" onClick={()=>apply("falta")}>Falta injustificada</button><button className="outline" onClick={()=>apply("justificada")}>Falta justificada</button><button className="text-button" onClick={()=>apply("pending")}>Quitar registro</button></div>
 </fieldset><small>Las filas pendientes no cuentan como faltas. Las faltas tienen 0 horas.</small>
 </section>
 <div hidden={view!=="lista"}><div className="roster-grid">{visible.map(row=><article className={"card roster-row "+(selected.includes(row.id)?"is-selected":"")} key={row.id}>
 <label className="roster-person"><input type="checkbox" disabled={locked} checked={selected.includes(row.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,row.id]:old.filter(id=>id!==row.id))}/>{row.photoKey&&<img src={"/api/media?key="+encodeURIComponent(row.photoKey)} alt=""/>}<span><strong>{row.name}</strong><small>{row.community}{!row.active?" · Inactivo":""}</small></span></label>
 <div className="roster-fields"><label>Asistencia<select disabled={locked} value={row.status} onChange={e=>update(row.id,{status:e.target.value,hours:e.target.value==="presente"?(Number(row.hours)>0?row.hours:commonHours):"0"})}><option value="pending">Pendiente / sin registro</option><option value="presente">Presente</option><option value="falta">Falta injustificada</option><option value="justificada">Falta justificada</option></select></label>
 <label>Horas<input type="number" min="0" max="24" step="1" disabled={locked||row.status!=="presente"} value={row.hours} onChange={e=>update(row.id,{hours:e.target.value})}/></label></div>
 <details className="row-note"><summary>Observación o justificación {row.note?"· Capturada":""}</summary><label>Nota del registro<input maxLength={240} disabled={locked||row.status==="pending"} value={row.note} onChange={e=>update(row.id,{note:e.target.value})} placeholder="Opcional"/></label></details>
 {changed(row)&&<small className="pending-label">Cambio pendiente de guardar</small>}
 </article>)}</div>
 {!visible.length&&<p>No hay jóvenes para esta búsqueda.</p>}
 <div className="bulk-save"><button className="primary" disabled={locked||!dirty.length} onClick={()=>void save()}>{busy?"Guardando…":"Guardar lista ("+dirty.length+")"}</button><button className="outline" disabled={locked} onClick={()=>{if(!dirty.length||window.confirm("¿Descartar cambios y recargar la lista guardada?"))void load().then(()=>setMessage("Lista actualizada.")).catch(e=>setMessage(e.message))}}>Recargar lista</button></div>
 </div><section hidden={view!=="fotos"} className="card bulk-evidence"><h2>Evidencias de esta actividad</h2><p>Selecciona varias fotografías. JPG, PNG o WebP, hasta 25 MB; se comprimen automáticamente por imagen.</p>
 <label>Descripción de las fotos<input maxLength={200} disabled={uploading} value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Ej. Participación en el taller"/></label>
 <label className="upload-button">Seleccionar fotografías<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked} onChange={e=>{addPhotos(e.target.files);e.target.value=""}}/></label>
 <div className="upload-grid">{photos.map(p=><div key={p.id}><img src={p.preview} alt={p.file.name}/><small>{p.file.name}</small><strong>{p.state==="done"?"Subida":p.state==="uploading"?"Subiendo…":p.state==="error"?"Error":"Pendiente"}</strong>{p.error&&<small role="alert">{p.error}</small>}{p.state!=="done"&&<button disabled={locked} className="text-button" onClick={()=>{URL.revokeObjectURL(p.preview);previews.current.delete(p.preview);setPhotos(old=>old.filter(x=>x.id!==p.id))}}>Quitar</button>}</div>)}</div>
 <button className="primary" disabled={locked||!pendingPhotos} onClick={()=>void upload()}>{uploading?"Subiendo fotografías…":"Subir fotos pendientes"}</button>
 {!!activity.evidence?.length&&<><h3>Evidencias guardadas ({activity.evidence.length})</h3><div className="evidence-strip">{activity.evidence.map(e=><div key={e.id}><a href={e.url} target="_blank" rel="noreferrer"><img src={e.url} alt={e.caption||"Evidencia de la actividad"}/></a><a className="small-link" href={e.url} download={"evidencia-"+e.id+".webp"}>Descargar</a><button className="small-link" disabled={locked} onClick={async()=>{if(!confirm("¿Eliminar esta evidencia? Descárgala primero si necesitas conservarla. Esta acción no cambia las horas ni la asistencia."))return;setUploading(true);try{await request("evidence-delete",{id:e.id});await onSaved();setMessage("Evidencia eliminada. Espacio liberado.")}catch(error){setMessage(error instanceof Error?error.message:"No se pudo eliminar.")}finally{setUploading(false)}}}>Eliminar</button></div>)}</div></>}
 </section>
 </>}
 </section>;
}
