import {GET,POST,PATCH} from '../app/api/[...path]/route';
export default {
 async fetch(request:Request,env:{ASSETS:Fetcher}) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(request.method!=='GET'){
   const origin=request.headers.get('Origin');
   if(origin&&origin!==url.origin)return Response.json({error:'Origen no autorizado.'},{status:403});
  }
  if(Number(request.headers.get('content-length')||0)>350000)return Response.json({error:'La imagen supera el límite. Comprímela antes de enviarla.'},{status:413});
  const handler={GET,POST,PATCH}[request.method as 'GET'|'POST'|'PATCH'];
  if(!handler)return new Response('Método no permitido',{status:405});
  const response=await handler(request,{params:Promise.resolve({path:url.pathname.slice(5).split('/')})});
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy','same-origin');
  response.headers.set('X-Frame-Options','DENY');
  return response;
 }
};
