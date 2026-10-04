const CACHE='ctrl-study-shell-v2';
const SHELL=['./','index.html','assets/css/style.css','assets/js/app.js','assets/js/activity.js','assets/js/model.js','assets/js/i18n.js','assets/icons/icon.svg','assets/icons/lesson.svg','assets/icons/icon-192.png','assets/icons/icon-512.png','manifest.json'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ctrl-study-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const relative=url.pathname.slice(scope.pathname.length);
  // Library files must not fall back independently: mixed revisions could restore revoked approvals.
  if(relative.startsWith('data/')||relative.startsWith('admin/'))return;
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('index.html',scope))));return;}
  if(!SHELL.includes(relative))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response}).catch(()=>caches.match(event.request)));
});
