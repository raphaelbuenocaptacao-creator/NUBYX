const CACHE_NAME='nubyx-v0.6.1-runtime-config';
const STATIC_ASSETS=['./','./index.html','./styles.css','./future.css','./drive.css','./ai.css','./app.js','./nubyx-ai.js','./manifest.webmanifest','./icon-192.svg','./icon-512.svg','./icon-512-maskable.svg'];
const PRIVATE_PATH_RE=/\/(api|auth|login|logout|admin|session|sessions|token|tokens|account|profile|me)(\/|$)/i;
const RUNTIME_CONFIG_RE=/\/config\.js$/i;

function canCache(request){
  if(request.method!=='GET'||request.headers.has('authorization')) return false;
  const url=new URL(request.url);
  return url.origin===self.location.origin&&!PRIVATE_PATH_RE.test(url.pathname)&&!RUNTIME_CONFIG_RE.test(url.pathname);
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  // Runtime environment/auth configuration must always come from the network.
  // This prevents a previously cached Supabase project configuration from
  // surviving an environment switch or credential rotation.
  if(request.method==='GET'&&url.origin===self.location.origin&&RUNTIME_CONFIG_RE.test(url.pathname)){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }

  if(!canCache(request)) return;

  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok&&response.type==='basic') caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));
      return response;
    }).catch(()=>caches.match(request).then(hit=>hit||caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{
    if(response.ok&&response.type==='basic') caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));
    return response;
  })));
});
