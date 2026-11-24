// Sólo recursos públicos del programa. Los datos de Firebase se consultan directamente.
const scope=new URL(self.registration.scope);
const prefix='imju-acceso-'+scope.pathname+'-';
const cacheName=prefix+'visual24';
const paths=['index.html','portal.css?v=visual24','portal.js?v=visual24','firebase-sdk-11.10.0.js','firebase-web.json','credencial.js','cuentas.js?v=red1','movimientos.js?v=red1','padron.js?v=red1','navegacion.js','patio.webp','insignia.svg','portal.webmanifest','qrcode.js','jsQR.js','sspc.webp','escudo.webp','municipio.webp','imju.webp'];
const allowed=new Set(paths.map(path=>new URL(path,scope).pathname));
const index=new URL('index.html',scope).href;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(paths.map(path=>new Request(new URL(path,scope),{cache:'reload'})))));
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
