/* LINE booking offline shell only. Never cache personal data, API, LINE OAuth or LIFF callback URLs. */
const CACHE_PREFIX="line-booking-safe-static-";
const CACHE_NAME=CACHE_PREFIX+"7809d121174ca48c7a3cde67951c5c28006a2260";
const STATIC_ASSETS=["./offline.html","./booking-theme.css","./monster-world.css","./monster-mascot.svg","./line-app-icon.svg","./pwa-icon-192.png","./pwa-icon-512.png"];

self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(STATIC_ASSETS);
  await self.skipWaiting();
 })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const all=await caches.keys();
  await Promise.all(all.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME)
   .map(name=>caches.delete(name)));
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 const scope=new URL(self.registration.scope);
 if(!url.pathname.startsWith(scope.pathname))return;
 const relative=url.pathname.slice(scope.pathname.length);
 // Only these specific non-sensitive resources are cached.
 if(["offline.html","booking-theme.css","monster-world.css","monster-mascot.svg","line-app-icon.svg","pwa-icon-192.png","pwa-icon-512.png"].includes(relative)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE_NAME);
   const cached=await cache.match(request,{ignoreSearch:true});
   if(cached)return cached;
   return fetch(request);
  })());
  return;
 }
 // All app HTML, OAuth callbacks, Supabase REST/RPC and LINE URLs are network-only.
 // If navigation fails, offer a generic help page; never replay stale customer data.
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).catch(async()=>{
   const cache=await caches.open(CACHE_NAME);
   return await cache.match("./offline.html")||Response.error();
  }));
 }
});
