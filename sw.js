const CACHE_NAME='nubyx-v0.7.7-ai-session-privacy';
const STATIC_ASSETS=new Set(['./','./index.html','./styles.css','./future.css','./drive.css','./ai.css','./app.js','./connectivity.js','./launcher.js','./session-guard.js','./sync-client.js','./sync-offline-queue.js','./sync-ui.js','./nubyx-ai.js','./pwa-launch.js','./manifest.webmanifest','./icon-192.svg','./icon-512.svg','./icon-512-maskable.svg']);
const PRIVATE_PATH_RE=/\/(api|auth|login|logout|admin|session|sessions|token|tokens|account|profile|me)(\/|$)/i;
const RUNTIME_CONFIG_RE=/\/config\.js$/i;
const SENSITIVE_QUERY_RE=/^(token|access_token|refresh_token|password|passwd|secret|session|auth|authorization|api_key|apikey|key)$/i;

function hasSensitiveQuery(url){
  for(const key of url.searchParams.keys()) if(SENSITIVE_QUERY_RE.test(key)) return true;
  return false;
}

function relativeKey(url){
  const scopePath=new URL(self.registration.scope).pathname;
  let path=url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : url.pathname;
  path=path.replace(/^\//,'');
  return path ? `./${path}` : './';
}

function isAllowedShellRequest(request){
  if(request.method!=='GET'||request.headers.has('authorization')) return false;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||PRIVATE_PATH_RE.test(url.pathname)||RUNTIME_CONFIG_RE.test(url.pathname)||hasSensitiveQuery(url)||url.search) return false;
  return STATIC_ASSETS.has(relativeKey(url));
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll([...STATIC_ASSETS])));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await Promise.all((await caches.keys()).filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)));
    if(self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(request.method==='GET'&&url.origin===self.location.origin&&RUNTIME_CONFIG_RE.test(url.pathname)){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }

  if(request.mode==='navigate'){
    if(request.method!=='GET'||url.origin!==self.location.origin||PRIVATE_PATH_RE.test(url.pathname)||hasSensitiveQuery(url)) return;
    event.respondWith((async()=>{
      try{
        const preload=await event.preloadResponse;
        if(preload) return preload;
        return await fetch(request,{cache:'no-store'});
      }catch{
        return caches.match('./index.html');
      }
    })());
    return;
  }

  if(!isAllowedShellRequest(request)) return;
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request,{cache:'no-store'})));
});