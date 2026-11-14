/** Resize in the browser: originals and location metadata never leave the device. */
export async function compressImage(file:File,profile=false):Promise<File>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25*1024*1024)throw Error('Usa una imagen JPG, PNG o WebP de hasta 25 MB.');
 const bitmap=await createImageBitmap(file);
 try{
  const canvas=document.createElement('canvas');
  const cap=profile?100000:200000;
  let edge=profile?800:1600;
  for(let pass=0;pass<5;pass++){
   const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('No se pudo procesar la foto.');
   ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   for(const quality of [.82,.68,.5]){
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality));
    if(blob&&blob.size<=cap)return new File([blob],file.name.replace(/\.[^.]*$/,'')+(blob.type==='image/webp'?'.webp':'.png'),{type:blob.type});
   }
   edge=Math.round(edge*.72);
  }
  throw Error('No se pudo reducir esta foto. Elige una imagen de menor resolución.');
 }finally{bitmap.close()}
}
