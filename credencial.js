export async function loadImage(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}
export async function imageCanvas(file, edge) {
  if (!file || !file.type.startsWith('image/') || file.size > 12*1024*1024) throw Error('Selecciona una imagen de hasta 12 MB.');
  const url=URL.createObjectURL(file);
  try {
    const image=await loadImage(url), scale=Math.min(1,edge/Math.max(image.width,image.height));
    const c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(image.width*scale)); c.height=Math.max(1,Math.round(image.height*scale));
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);
    return c;
  } finally {URL.revokeObjectURL(url)}
}
export async function downloadBadge(person,qr) {
  const canvas=document.createElement('canvas');
  canvas.width=680;canvas.height=930;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,680,930);ctx.fillStyle='#692438';ctx.fillRect(0,0,680,142);
  ctx.textAlign='center';ctx.fillStyle='white';ctx.font='bold 37px Georgia';ctx.fillText('Jóvenes que Unen al Barrio',340,68);
  ctx.font='22px sans-serif';ctx.fillText('IMJU  ·  ESCUINAPA',340,110);
  if(person.foto){
    const photo=await loadImage(person.foto), size=Math.min(photo.width,photo.height);
    ctx.save();ctx.beginPath();ctx.arc(340,238,72,0,2*Math.PI);ctx.clip();
    ctx.drawImage(photo,(photo.width-size)/2,(photo.height-size)/2,size,size,268,166,144,144);ctx.restore();
  }else{
    ctx.fillStyle='#e4edc2';ctx.beginPath();ctx.arc(340,238,72,0,2*Math.PI);ctx.fill();
    ctx.fillStyle='#692438';ctx.font='bold 46px sans-serif';ctx.fillText(person.nombre.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join(''),340,255);
  }
  ctx.fillStyle='#292320';ctx.font='bold 32px sans-serif';ctx.fillText(person.nombre,340,366,620);
  ctx.font='23px sans-serif';ctx.fillText([person.comunidad,person.generacion].filter(Boolean).join(' · '),340,410,615);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(await loadImage(qr),135,440,410,410);
  ctx.font='20px sans-serif';ctx.fillText('Gafete individual de asistencia',340,888);
  const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='Gafete-'+person.usuario+'.png';a.click();
}
export function decode(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true}), pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  return window.jsQR(pixels.data,canvas.width,canvas.height)?.data;
}
