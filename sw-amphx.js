/* TIENDA AMPHX - app shell offline; nunca intercepta solicitudes a Supabase. */
const VERSION='amphx-caja-offline-v2';
const HOME='./caja-real.html';
const JS_MODULE='https://esm.sh/@supabase/supabase-js@2.57.0';
const SCANNER='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
const MANIFEST='./manifest-amphx.webmanifest';
async function cacheResource(cache,request){
  try {
    const response=await fetch(request);
    if(response && (response.ok || response.type==='opaque'))await cache.put(request,response.clone());
  } catch (_) {}
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(VERSION);
    await Promise.all([
      cacheResource(cache,new Request(HOME,{cache:'reload'})),
      cacheResource(cache,new Request(MANIFEST,{cache:'reload'})),
      cacheResource(cache,new Request(JS_MODULE,{mode:'cors'})),
      cacheResource(cache,new Request(SCANNER,{mode:'no-cors'}))
    ]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys()){
      if(name.startsWith('amphx-caja-offline-')&&name!==VERSION)await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const u=new URL(event.request.url);
  // No almacenar tokens, respuestas de autenticación, inventario en vivo ni operaciones de venta.
  if(u.hostname.endsWith('.supabase.co'))return;
  const own=u.origin===self.location.origin && u.pathname.endsWith('/caja-real.html');
  const dependency=u.hostname==='esm.sh'||u.hostname.endsWith('.esm.sh')||u.hostname==='unpkg.com';
  const manifest=u.origin===self.location.origin && u.pathname.endsWith('/manifest-amphx.webmanifest');
  if(!own&&!dependency&&!manifest)return;
  event.respondWith((async()=>{
    const cache=await caches.open(VERSION);
    if(own){
      const key=new Request(HOME);
      try {
        const response=await fetch(event.request);
        if(response.ok)await cache.put(key,response.clone());
        return response;
      }catch(e){
        return await cache.match(key)||Response.error();
      }
    }
    const cached=await cache.match(event.request);
    if(cached)return cached;
    try {
      const response=await fetch(event.request);
      if(response.ok||response.type==='opaque')await cache.put(event.request,response.clone());
      return response;
    }catch(e){return Response.error();}
  })());
});