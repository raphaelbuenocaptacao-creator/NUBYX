const CACHE_NAME='nubyx-v0.6.4-continuity-ui';
const STATIC_ASSETS=new Set(['./','./index.html','./styles.css','./future.css','./drive.css','./ai.css','./app.js','./sync-client.js','./sync-ui.js','./nubyx-ai.js','./manifest.webmanifest','./icon-192.svg','./icon-512.svg','./icon-512-maskable.svg']);
const PRIVATE_PATH_RE=/\/(api|auth|login|logout|admin|session|sessions|token|tokens|account|profile|me)(\/|$)/i;
const RUNTIME_CONFIG_RE=/\/config\.js$/i;

function relativeKey(url){
  const scopePath=new URL(self.registration.scope).pathname;
  let path=url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : url.pathname;
  path=path.replace(/^\//,'');
  return path ? `./${path}` : './';
}

function isAllowedShellRequest(request){
  if(request.method!=='GET'||request.headers.has('authorization')) return false;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||PRIVATE_PATH_RE.test(url.pathname)||RUNTIME_CONFIG_RE.test(url.pathname)) return false;
  return STATIC_ASSETS.has(relativeKey(url));
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll([...STATIC_ASSETS])));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(request.method==='GET'&&url.origin===self.location.origin&&RUNTIME_CONFIG_RE.test(url.pathname)){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }

  if(request.mode==='navigate'){
    if(request.method!=='GET'||url.origin!==self.location.origin||PRIVATE_PATH_RE.test(url.pathname)) return;
    event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>caches.match('./index.html')));
    return;
  }

  if(!isAllowedShellRequest(request)) return;
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request,{cache:'no-store'})));
});
