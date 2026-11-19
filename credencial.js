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
export function decode(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true}), pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  return window.jsQR(pixels.data,canvas.width,canvas.height)?.data;
}

// Doce píxeles por milímetro, tanto para la vista previa como para el archivo impreso.
const width=1020, height=1380;
const logoFiles=['sspc','escudo','municipio','imju'];

function drawName(ctx,name){
  const words=name.trim().split(/\s+/);
  let size=62, lines=[];
  while(size>=32){
    ctx.font='bold '+size+'px sans-serif';lines=[''];
    for(const word of words){
      const i=lines.length-1,joined=[lines[i],word].filter(Boolean).join(' ');
      if(lines[i]&&ctx.measureText(joined).width>580)lines.push(word);else lines[i]=joined;
    }
    if(lines.length<=3)break;
    size-=2;
  }
  if(lines.length>3)lines=[lines[0],lines[1],lines.slice(2).join(' ')];
  lines.forEach((line,i)=>ctx.fillText(line,353,548+i*(size+4),580));
}
export async function renderBadge(person,qr){
  const [code,logos,photo]=await Promise.all([
    loadImage(qr),Promise.all(logoFiles.map(file=>loadImage('./'+file+'.webp'))),
    person.foto?loadImage(person.foto):null
  ]);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  logos.forEach((logo,i)=>{
    const scale=Math.min(163/logo.width,143/logo.height);
    const w=logo.width*scale,h=logo.height*scale;
    ctx.drawImage(logo,(i+.5)*width/4-w/2,97-h/2,w,h);
  });
  // Bandas curvas inspiradas en las líneas de una cancha del barrio.
  ctx.fillStyle='#302347';ctx.fillRect(0,186,width,235);
  ctx.save();ctx.beginPath();ctx.rect(0,186,width,235);ctx.clip();
  for(const [radius,color] of [[214,'#e7a28d'],[169,'#bcabd9'],[124,'#dbea99']]){
    ctx.beginPath();ctx.arc(1038,421,radius,0,Math.PI*2);ctx.lineWidth=27;ctx.strokeStyle=color;ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle='#dbea99';ctx.font='bold 27px sans-serif';ctx.fillText('IMJU   /   ESCUINAPA',55,245);
  ctx.fillStyle='#ffffff';ctx.font='bold 62px sans-serif';ctx.fillText('Jóvenes que',55,314);
  ctx.fillText('Unen al Barrio',55,383);
  ctx.fillStyle='#f8f6f0';ctx.fillRect(0,421,width,487);
  ctx.fillStyle='#51415e';ctx.font='bold 23px sans-serif';ctx.fillText('CREDENCIAL DE PARTICIPANTE',353,475);
  ctx.save();ctx.beginPath();ctx.roundRect(55,475,248,248,38);ctx.clip();
  if(photo){
    const crop=Math.min(photo.width,photo.height);
    ctx.drawImage(photo,(photo.width-crop)/2,(photo.height-crop)/2,crop,crop,55,475,248,248);
  }else{
    ctx.fillStyle='#edf1df';ctx.fillRect(55,475,248,248);ctx.fillStyle='#6a273b';ctx.font='bold 72px Georgia,serif';ctx.textAlign='center';
    ctx.fillText(person.nombre.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join(''),179,626);ctx.textAlign='left';
  }
  ctx.restore();ctx.fillStyle='#302347';drawName(ctx,person.nombre);
  ctx.font='31px sans-serif';ctx.fillText([person.comunidad,person.generacion].filter(Boolean).join(' · '),353,725,600);
  ctx.fillStyle='#efeae3';ctx.fillRect(55,779,910,2);
  ctx.fillStyle='#54504b';ctx.font='27px sans-serif';ctx.fillText('Usuario del padrón',55,836);
  ctx.font='bold 38px sans-serif';ctx.fillStyle='#292320';ctx.fillText(person.usuario||'Sin registrar',55,887,900);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(code,50,944,363,363);ctx.imageSmoothingEnabled=true;
  ctx.strokeStyle='#aaaaa3';ctx.lineWidth=2;ctx.setLineDash([10,8]);ctx.beginPath();ctx.roundRect(482,945,480,354,20);ctx.stroke();ctx.setLineDash([]);
  ctx.textAlign='center';ctx.fillStyle='#56534d';ctx.font='25px sans-serif';
  ctx.fillText('QR de asistencia',232,1342);ctx.fillText('Sello del IMJU',722,1342);
  if(!person.activo){ctx.fillStyle='#6a273b';ctx.font='bold 27px sans-serif';ctx.textAlign='right';ctx.fillText('INACTIVO',958,837)}
  ctx.fillStyle='#302347';ctx.fillRect(0,1364,width,16);
  return canvas;
}
function saveBlob(blob,name){
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function encodeCanvas(canvas,type,quality){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo crear el archivo.')),type,quality));
}
export async function saveBadge(canvas,person,format){
  const filename='Credencial-'+String(person.usuario||person.id).replace(/[^\w.-]/g,'-');
  if(format==='png'){saveBlob(await encodeCanvas(canvas,'image/png'),filename+'.png');return}
  const jpeg=new Uint8Array(await (await encodeCanvas(canvas,'image/jpeg',.98)).arrayBuffer());
  // Página carta en puntos PDF. Imagen a escala física y marcas fuera del gafete.
  const mm=72/25.4,w=85*mm,h=115*mm,x=(612-w)/2,y=(792-h)/2;
  const lines=['q',w+' 0 0 '+h+' '+x+' '+y+' cm','/Badge Do','Q','0.45 G 0.4 w'];
  for(const [cx,dx] of [[x,-1],[x+w,1]])for(const [cy,dy] of [[y,-1],[y+h,1]]){
    lines.push((cx+dx*3)+' '+cy+' m '+(cx+dx*12)+' '+cy+' l S',cx+' '+(cy+dy*3)+' m '+cx+' '+(cy+dy*12)+' l S');
  }
  const content=lines.join('\n')+'\n',chunks=[],offsets=[0];let length=0;
  function append(value){const chunk=typeof value==='string'?new TextEncoder().encode(value):value;chunks.push(chunk);length+=chunk.length}
  function object(id,...parts){offsets[id]=length;append(id+' 0 obj\n');parts.forEach(append);append('\nendobj\n')}
  append('%PDF-1.4\n');
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Badge 4 0 R >> >> /Contents 5 0 R >>');
  object(4,'<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n',jpeg,'\nendstream');
  object(5,'<< /Length '+content.length+' >>\nstream\n',content,'endstream');
  const xref=length;append('xref\n0 6\n0000000000 65535 f \n');
  offsets.slice(1).forEach(offset=>append(String(offset).padStart(10,'0')+' 00000 n \n'));
  append('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  saveBlob(new Blob(chunks,{type:'application/pdf'}),filename+'.pdf');
}
