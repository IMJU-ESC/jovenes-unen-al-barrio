import {Buffer} from 'node:buffer';
export const MEDIA_CAP=200*1024*1024;
export class MediaLimitError extends Error{}
/** Immutable files; SQLite triggers reserve capacity in the same transaction. */
export function freeMedia(db:D1Database){
 return {
  async get(key:string){
   const row=await db.prepare('SELECT data,content_type FROM media_files WHERE object_key=?').bind(key).first<{data:string;content_type:string}>();
   return row?{body:Buffer.from(row.data,'base64'),httpMetadata:{contentType:row.content_type}}:null;
  },
  async put(key:string,stream:ReadableStream,options:{httpMetadata:{contentType:string}}){
   const bytes=await new Response(stream).arrayBuffer();
   if(bytes.byteLength>200000)throw new MediaLimitError('La foto supera 200 KB. Vuelve a seleccionarla para comprimirla.');
   const data=Buffer.from(bytes).toString('base64');
   try{await db.prepare('INSERT INTO media_files(object_key,data,content_type,stored_bytes) VALUES(?,?,?,?) ON CONFLICT(object_key) DO NOTHING').bind(key,data,options.httpMetadata.contentType,data.length).run()}
   catch(error){if(String(error).includes('media_capacity'))throw new MediaLimitError('Se alcanzó el espacio reservado para fotos. Descarga y elimina evidencias antiguas para liberar espacio.');throw error}
  },
  async delete(key:string){await db.prepare('DELETE FROM media_files WHERE object_key=?').bind(key).run()}
 };
}
