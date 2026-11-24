const metas=[['actividad','Asistencia social',80],['aprendizaje','Capacitación',10]];

export function acumularHoras(registros){
  const horas={actividad:0,aprendizaje:0};
  for(const r of registros){
    const valor=Number(r.horas);
    if(r.estado==='presente'&&Object.hasOwn(horas,r.categoria)&&Number.isFinite(valor)&&valor>0){
      horas[r.categoria]+=valor;
    }
  }
  return horas;
}

export function mostrarAvance(horas){
  const total=horas.actividad+horas.aprendizaje;
  const faltan=metas.reduce((n,[categoria,,meta])=>n+Math.max(0,meta-horas[categoria]),0);
  const filas=metas.map(([categoria,nombre,meta])=>{
    const valor=horas[categoria],pendientes=Math.max(0,meta-valor);
    return '<span class="rubro-horas"><span>'+nombre+' · '+valor+' / '+meta+' h</span>'+
      '<progress aria-label="'+nombre+'" max="'+meta+'" value="'+Math.min(meta,valor)+'"></progress>'+
      '<small>'+(pendientes?'Faltan '+pendientes+' h':'Meta cumplida')+'</small></span>';
  }).join('');
  return '<strong>'+total+' h acumuladas</strong><small>'+(faltan?'Faltan '+faltan+' h para cumplir ambas metas':'Meta de 90 h cumplida')+'</small>'+filas;
}
