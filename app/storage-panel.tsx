'use client';
import {useEffect,useState} from 'react';
export default function StoragePanel(){
 const [usage,setUsage]=useState<{mode:string;bytes:number;limit:number}|null>(null);
 useEffect(()=>{let live=true;fetch('/api/storage').then(r=>r.ok?r.json():null).then(data=>{if(live)setUsage(data as {mode:string;bytes:number;limit:number}|null)}).catch(()=>{});return()=>{live=false}},[]);
 if(usage?.mode!=='free')return null;
 const percent=Math.min(100,Math.round(usage.bytes/usage.limit*100));
 return <section className="card" style={{marginTop:20}}><p className="eyebrow">ESPACIO PARA FOTOGRAFÍAS</p><h3>{(usage.bytes/1024/1024).toFixed(1)} de {usage.limit/1024/1024} MB</h3><progress value={usage.bytes} max={usage.limit} aria-label="Espacio usado para fotografías" style={{width:'100%'}}/><p>{percent>=80?'El espacio está por llenarse. Descarga y elimina evidencias antiguas desde Asistencia.':'Las fotos se comprimen automáticamente. Al llenarse el espacio, se detienen las nuevas cargas.'}</p></section>;
}
