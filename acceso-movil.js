// Sólo recursos públicos del programa. Los datos de Firebase se consultan directamente.
const scope=new URL(self.registration.scope);
const prefix='imju-acceso-'+scope.pathname+'-';
const cacheName=prefix+'clave17';
const paths=['index.html','portal.css?v=aero16','portal.js?v=clave17','firebase-sdk-11.10.0.js','firebase-web.json','credencial.js?v=logos1','avance-horas.js?v=horas4','dependencias.js','marca.js?v=movil2','immujer-mini.webp','atencion-ciudadana-mini.webp','imju-mini.webp','escudo-mini.webp','municipio-mini.webp','sspc-mini.webp','cuentas.js?v=acceso14','movimientos.js?v=eventos15','padron.js?v=alta10','navegacion.js?v=barrio13','qrcode.js','jsQR.js'];
const allowed=new Set(paths.map(path=>new URL(path,scope).pathname));
const index=new URL('index.html',scope).href;
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(cacheName);
    await cache.addAll(paths.map(path=>new Request(new URL(path,scope),{cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==cacheName)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==scope.origin)return;
  const home=request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===new URL(index).pathname);
  if(!home&&!allowed.has(url.pathname))return;
  const key=home?index:request.url;
  const network=fetch(request);
  event.waitUntil(network.then(async response=>{
    if(response.ok&&!response.redirected){const copy=response.clone();await (await caches.open(cacheName)).put(key,copy)}
  }).catch(()=>{}));
  event.respondWith((async()=>{
    const cached=await (await caches.open(cacheName)).match(key);
    if(!cached)return network;
    const timeout=new Promise(resolve=>setTimeout(()=>resolve(cached),1600));
    return Promise.race([network.then(r=>r.ok?r:cached).catch(()=>cached),timeout]);
  })());
});
