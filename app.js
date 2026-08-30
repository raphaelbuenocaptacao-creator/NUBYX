const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const auth = $('#auth');
const os = $('#os');
const toast = $('#toast');
const config = window.NUBYX_CONFIG || {};
let deferredPrompt = null;
let supabaseClient = null;
let currentProfile = null;

const DRIVE_BUCKET = 'nubyx-user-files';
const DRIVE_MAX_FILE_BYTES = 25 * 1024 * 1024;
const STORE_CATALOG = [
  {key:'calendar', name:'Calendário', icon:'◫', url:'https://calendar.google.com', description:'Agenda e compromissos em um só lugar.'},
  {key:'docs', name:'Documentos', icon:'▤', url:'https://docs.google.com', description:'Crie e edite documentos na nuvem.'},
  {key:'sheets', name:'Planilhas', icon:'▦', url:'https://sheets.google.com', description:'Planilhas e dados no seu workspace.'},
  {key:'notion', name:'Notion', icon:'N', url:'https://www.notion.so', description:'Notas, projetos e bases de conhecimento.'},
  {key:'figma', name:'F', icon:'F', url:'https://www.figma.com', description:'Design colaborativo diretamente no navegador.'},
  {key:'github', name:'GitHub', icon:'⌘', url:'https://github.com', description:'Código, projetos e colaboração.'}
];

function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(()=>toast.classList.remove('show'), 2600);
}

function formatClock(){
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  $('#clock').textContent = time;
  $('#phoneClock').textContent = time;
  $('#today').textContent = now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
}
setInterval(formatClock,1000); formatClock();

function setConnectionState(mode){
  const isCloud = mode === 'supabase';
  $('#cloudStatus').textContent = isCloud ? 'Supabase conectado' : 'Modo demonstração';
  $('#workspaceStatus').textContent = isCloud ? 'Online · sessão autenticada' : 'Demo · dados apenas neste dispositivo';
  $('#syncState').textContent = isCloud ? 'Ativa' : 'Local';
  $('#syncDetail').textContent = isCloud ? 'conta NUBYX ID' : 'modo demonstração';
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>'"]/g, char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[char]);
}

function formatBytes(bytes=0){
  if(!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return '0 B';
  const units=['B','KB','MB','GB','TB'];
  const i=Math.min(Math.floor(Math.log(Number(bytes))/Math.log(1024)),units.length-1);
  return `${(Number(bytes)/Math.pow(1024,i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function getDemoApps(){
  try { return JSON.parse(localStorage.getItem('nubyx_demo_apps') || '[]'); }
  catch { return []; }
}

function setDemoApps(apps){
  localStorage.setItem('nubyx_demo_apps', JSON.stringify(apps));
}

async function publishStoreSync(app, eventType){
  if(currentProfile?.mode !== 'supabase') return;
  const continuity = window.NUBYX_CONTINUITY;
  if(!continuity?.publish) return;
  const payload = eventType === 'delete' ? {} : {
    app_key: app.key,
    app_name: app.name,
    app_url: app.url,
    icon: app.icon
  };
  const result = await continuity.publish('apps', app.key, eventType, payload);
  if(!result?.ok && result?.reason !== 'schema_missing'){
    console.warn('NUBYX Store change saved, but Continuity event was not published.', result);
  }
}

async function listInstalledApps(){
  if(currentProfile?.mode === 'supabase' && supabaseClient){
    const { data, error } = await supabaseClient
      .from('user_apps')
      .select('app_key,app_name,app_url,icon,position')
      .eq('user_id', currentProfile.userId)
      .order('position', {ascending:true});
    if(error){ console.error(error); showToast('Não foi possível sincronizar seus apps.'); return []; }
    return data || [];
  }
  return getDemoApps();
}

async function installApp(app){
  if(!currentProfile) return;
  if(currentProfile.mode === 'supabase' && supabaseClient){
    const installed = await listInstalledApps();
    if(installed.some(item=>item.app_key===app.key)) return showToast(`${app.name} já está instalado.`);
    const { error } = await supabaseClient.from('user_apps').insert({
      user_id: currentProfile.userId,
      app_key: app.key,
      app_name: app.name,
      app_url: app.url,
      icon: app.icon,
      position: installed.length
    });
    if(error){ console.error(error); return showToast('Falha ao instalar app.'); }
    await publishStoreSync(app, 'upsert');
  } else {
    const installed = getDemoApps();
    if(installed.some(item=>item.app_key===app.key)) return showToast(`${app.name} já está instalado.`);
    installed.push({app_key:app.key, app_name:app.name, app_url:app.url, icon:app.icon, position:installed.length});
    setDemoApps(installed);
  }
  showToast(`${app.name} instalado no NUBYX`);
  renderStore();
  refreshInstalledCount();
}

async function uninstallApp(appKey){
  if(!currentProfile) return;
  const app = STORE_CATALOG.find(item=>item.key===appKey) || {key: appKey};
  if(currentProfile.mode === 'supabase' && supabaseClient){
    const { error } = await supabaseClient
      .from('user_apps')
      .delete()
      .eq('user_id', currentProfile.userId)
      .eq('app_key', appKey);
    if(error){ console.error(error); return showToast('Falha ao remover app.'); }
    await publishStoreSync(app, 'delete');
  } else {
    setDemoApps(getDemoApps().filter(item=>item.app_key!==appKey));
  }
  showToast('App removido do NUBYX');
  renderStore();
  refreshInstalledCount();
}

async function refreshInstalledCount(){
  const custom = await listInstalledApps();
  $('#installedCount').textContent = 8 + custom.length;
}

async function renderStore(){
  const installed = await listInstalledApps();
  const installedKeys = new Set(installed.map(item=>item.app_key));
  $('#panel').innerHTML = `<div class="panel-title"><div><span class="eyebrow">NUBYX STORE</span><h3>Apps para seu ambiente</h3></div><span class="ghost">${installed.length} extras</span></div>
    <div class="store-grid">${STORE_CATALOG.map(app=>{
      const has = installedKeys.has(app.key);
      return `<article class="store-card"><div class="store-icon">${app.icon}</div><div><b>${app.name}</b><small>${app.description}</small></div><button class="${has?'ghost':'primary store-action'}" data-store-key="${app.key}" data-store-action="${has?'remove':'install'}">${has?'Remover':'Instalar'}</button></article>`;
    }).join('')}</div>
    <p class="fine">A NUBYX Store instala atalhos e PWAs/serviços web compatíveis. Ela não executa APKs Android dentro do PWA.</p>`;

  $$('[data-store-key]').forEach(btn=>btn.addEventListener('click',()=>{
    const app = STORE_CATALOG.find(item=>item.key===btn.dataset.storeKey);
    if(!app) return;
    btn.dataset.storeAction === 'remove' ? uninstallApp(app.key) : installApp(app);
  }));
}

function openDemoDriveDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('nubyx-demo-drive',1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('files')) db.createObjectStore('files',{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function demoDriveAction(mode, value){
  const db=await openDemoDriveDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('files',mode === 'list' || mode === 'get' ? 'readonly' : 'readwrite');
    const store=tx.objectStore('files');
    const request=mode === 'list' ? store.getAll() : mode === 'get' ? store.get(value) : mode === 'put' ? store.put(value) : store.delete(value);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    tx.oncomplete=()=>db.close();
  });
}

async function listDriveFiles(){
  if(currentProfile?.mode === 'supabase' && supabaseClient){
    const {data,error}=await supabaseClient
      .from('files_meta')
      .select('id,name,mime_type,size_bytes,storage_path,created_at')
      .eq('user_id', currentProfile.userId)
      .eq('folder','/')
      .order('created_at',{ascending:false});
    if(error){ console.error(error); showToast('Falha ao carregar o Drive.'); return []; }
    return data || [];
  }
  try{
    const files=await demoDriveAction('list');
    return (files || []).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  }catch(err){ console.error(err); return []; }
}

function safeStorageName(name){
  return String(name || 'arquivo').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120) || 'arquivo';
}

async function uploadDriveFiles(fileList){
  if(!currentProfile || !fileList?.length) return;
  const files=[...fileList];
  for(const file of files){
    if(file.size > DRIVE_MAX_FILE_BYTES){ showToast(`${file.name}: limite de 25 MB.`); continue; }
    const id=crypto.randomUUID();
    if(currentProfile.mode === 'supabase' && supabaseClient){
      const path=`${currentProfile.userId}/${id}-${safeStorageName(file.name)}`;
      const {error:uploadError}=await supabaseClient.storage.from(DRIVE_BUCKET).upload(path,file,{upsert:false,contentType:file.type || 'application/octet-stream'});
      if(uploadError){ console.error(uploadError); showToast(`Falha ao enviar ${file.name}.`); continue; }
      const {error:metaError}=await supabaseClient.from('files_meta').insert({
        id,user_id:currentProfile.userId,storage_path:path,name:file.name,mime_type:file.type || null,size_bytes:file.size,folder:'/'
      });
      if(metaError){
        console.error(metaError);
        await supabaseClient.storage.from(DRIVE_BUCKET).remove([path]);
        showToast(`Falha ao registrar ${file.name}; upload revertido.`);
        continue;
      }
    }else{
      try{
        await demoDriveAction('put',{id,name:file.name,mime_type:file.type || null,size_bytes:file.size,created_at:new Date().toISOString(),blob:file});
      }catch(err){ console.error(err); showToast(`Falha ao salvar ${file.name} localmente.`); continue; }
    }
  }
  showToast('NUBYX Drive atualizado');
  renderDrive();
}

async function downloadDriveFile(id){
  const files=await listDriveFiles();
  const file=files.find(item=>item.id===id);
  if(!file) return showToast('Arquivo não encontrado.');
  if(currentProfile.mode === 'supabase' && supabaseClient){
    const {data,error}=await supabaseClient.storage.from(DRIVE_BUCKET).createSignedUrl(file.storage_path,60);
    if(error || !data?.signedUrl){ console.error(error); return showToast('Não foi possível abrir o arquivo.'); }
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }else{
    const local=await demoDriveAction('get',id);
    if(!local?.blob) return showToast('Arquivo local indisponível.');
    const url=URL.createObjectURL(local.blob);
    const a=document.createElement('a'); a.href=url; a.download=local.name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}

async function deleteDriveFile(id){
  const files=await listDriveFiles();
  const file=files.find(item=>item.id===id);
  if(!file) return;
  if(currentProfile.mode === 'supabase' && supabaseClient){
    const {error:storageError}=await supabaseClient.storage.from(DRIVE_BUCKET).remove([file.storage_path]);
    if(storageError){ console.error(storageError); return showToast('Falha ao remover arquivo do Storage.'); }
    const {error:metaError}=await supabaseClient
      .from('files_meta')
      .delete()
      .eq('user_id', currentProfile.userId)
      .eq('id',id);
    if(metaError){ console.error(metaError); return showToast('Arquivo removido, mas metadados precisam de reconciliação.'); }
  }else{
    await demoDriveAction('delete',id);
  }
  showToast('Arquivo removido do NUBYX Drive');
  renderDrive();
}

async function renderDrive(){
  $('#panel').innerHTML='<div class="panel-title"><div><span class="eyebrow">NUBYX DRIVE</span><h3>Carregando seu espaço privado...</h3></div></div>';
  const files=await listDriveFiles();
  const used=files.reduce((sum,file)=>sum+Number(file.size_bytes || 0),0);
  const mode=currentProfile?.mode === 'supabase' ? 'Nuvem privada · RLS por usuário' : 'Demo local · IndexedDB neste dispositivo';
  $('#panel').innerHTML=`<div class="panel-title"><div><span class="eyebrow">NUBYX DRIVE</span><h3>Seus arquivos</h3><small class="drive-mode">${mode}</small></div><label class="primary drive-upload">+ Upload<input id="driveFileInput" type="file" multiple hidden></label></div>
    <div class="drive-summary"><span>${files.length} arquivo${files.length===1?'':'s'}</span><span>${formatBytes(used)} usados</span><span>Limite por arquivo: 25 MB</span></div>
    <div class="drive-list">${files.length ? files.map(file=>`<article class="drive-row"><div class="drive-file-icon">◫</div><div class="drive-file-meta"><b title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</b><small>${escapeHtml(file.mime_type || 'arquivo')} · ${formatBytes(file.size_bytes)}</small></div><button class="ghost" data-drive-open="${file.id}">Abrir</button><button class="ghost danger" data-drive-delete="${file.id}">Remover</button></article>`).join('') : '<div class="drive-empty"><span>◇</span><b>Seu Drive está vazio</b><small>Envie um arquivo para começar. No modo demo ele fica somente neste dispositivo.</small></div>'}</div>`;
  $('#driveFileInput')?.addEventListener('change',e=>uploadDriveFiles(e.target.files));
  $$('[data-drive-open]').forEach(btn=>btn.addEventListener('click',()=>downloadDriveFile(btn.dataset.driveOpen)));
  $$('[data-drive-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteDriveFile(btn.dataset.driveDelete)));
}

function enterOS(profile={email:'demo@nubyx.cloud', mode:'demo'}){
  currentProfile = profile;
  if(profile.mode === 'demo'){
    const demoSession = { ...profile, expiresAt: Date.now() + (8 * 60 * 60 * 1000) };
    localStorage.setItem('nubyx_demo_session', JSON.stringify(demoSession));
    currentProfile = demoSession;
  }
  setConnectionState(profile.mode);
  auth.classList.add('hidden');
  os.classList.remove('hidden');
  refreshInstalledCount();
  showToast(profile.mode === 'supabase' ? 'NUBYX ID autenticado' : 'Modo demonstração iniciado');
}

async function exitOS(){
  localStorage.removeItem('nubyx_demo_session');
  currentProfile = null;
  if(supabaseClient) await supabaseClient.auth.signOut();
  os.classList.add('hidden');
  auth.classList.remove('hidden');
}

async function initSupabase(){
  const enabled = Boolean(config.authEnabled && config.supabaseUrl && config.supabaseAnonKey);
  if(!enabled){
    $('#authStatus').textContent = 'Supabase ainda não configurado. Login real bloqueado por segurança; o modo demonstração continua disponível.';
    return false;
  }

  try{
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
    $('#authStatus').textContent = 'NUBYX ID protegido por Supabase Auth.';

    const { data } = await supabaseClient.auth.getSession();
    if(data?.session?.user){
      enterOS({email:data.session.user.email, userId:data.session.user.id, mode:'supabase'});
    }

    supabaseClient.auth.onAuthStateChange((_event, session)=>{
      if(session?.user) enterOS({email:session.user.email, userId:session.user.id, mode:'supabase'});
    });
    return true;
  }catch(err){
    console.error('NUBYX Auth init failed', err);
    $('#authStatus').textContent = 'Falha ao carregar autenticação em nuvem. O modo demonstração permanece isolado.';
    return false;
  }
}

async function authenticate(action){
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if(!email || password.length < 6) return showToast('Confira e-mail e senha.');
  if(!supabaseClient) return showToast('Login real ainda não configurado. Use a demonstração.');

  const method = action === 'signup' ? 'signUp' : 'signInWithPassword';
  const { data, error } = await supabaseClient.auth[method]({ email, password });
  if(error) return showToast(error.message || 'Não foi possível autenticar.');

  if(action === 'signup' && !data.session){
    showToast('Conta criada. Confirme seu e-mail para entrar.');
    return;
  }

  if(data?.user) enterOS({email:data.user.email, userId:data.user.id, mode:'supabase'});
}

$('#loginForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  authenticate('signin');
});
$('#signupBtn').addEventListener('click',()=>authenticate('signup'));
$('#demoBtn').addEventListener('click',()=>enterOS());
$('#logoutBtn').addEventListener('click', exitOS);

const panelContent = {
  home: ['CONTINUIDADE','Continue de onde parou','Projetos, notas e ações recentes sincronizadas neste ambiente.'],
  ai: ['NUBYX AI','Inteligência dentro do sistema','Busque arquivos, organize conteúdo e execute ações assistidas com permissões do usuário.'],
  vault: ['NUBYX VAULT','Seu espaço protegido','Uma camada extra de autenticação para documentos e arquivos sensíveis.'],
  notes: ['NOTAS','Notas rápidas','Crie e sincronize anotações no seu ambiente NUBYX.'],
  files: ['ARQUIVOS','Gerenciador de arquivos','Navegue por documentos, imagens e pastas do seu NUBYX Drive.'],
  settings: ['AJUSTES','Personalize seu NUBYX','Tema, papel de parede, sessão, privacidade e preferências.'],
  browser: ['NAVEGADOR','Web dentro do NUBYX','Atalhos e serviços compatíveis com navegação segura.']
};

function openModule(key){
  $$('.dock button[data-open]').forEach(b=>b.classList.toggle('active', b.dataset.open===key));
  if(key === 'store'){
    renderStore();
    showToast('NUBYX Store aberta');
    return;
  }
  if(key === 'drive' || key === 'files'){
    renderDrive();
    showToast('NUBYX Drive aberto');
    return;
  }
  const data=panelContent[key]||panelContent.home;
  $('#panel').innerHTML = `<div class="panel-title"><div><span class="eyebrow">${data[0]}</span><h3>${data[1]}</h3></div><button class="ghost">Em construção</button></div><div class="activity"><div class="activity-icon">✦</div><div><b>${data[1]}</b><small>${data[2]}</small></div><span>v0.4</span></div><div class="activity"><div class="activity-icon">●</div><div><b>Estado do módulo</b><small>Interface preparada para a próxima camada funcional.</small></div><span>Ativo</span></div>`;
  showToast(`${data[1]} aberto`);
}
$$('[data-open]').forEach(b=>b.addEventListener('click',()=>openModule(b.dataset.open)));
$$('[data-app]').forEach(b=>b.addEventListener('click',()=>openModule(b.dataset.app)));

window.addEventListener('beforeinstallprompt',(e)=>{
  e.preventDefault(); deferredPrompt=e; $('#installBtn').classList.remove('hidden');
});
$('#installBtn').addEventListener('click',async()=>{
  if(!deferredPrompt) return showToast('Instalação disponível pelo menu do navegador.');
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $('#installBtn').classList.add('hidden');
});
window.addEventListener('appinstalled',()=>showToast('NUBYX instalado neste dispositivo'));

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

try{
  const saved=JSON.parse(localStorage.getItem('nubyx_demo_session')||'null');
  if(saved && saved.mode === 'demo' && saved.expiresAt > Date.now()) enterOS(saved);
  else localStorage.removeItem('nubyx_demo_session');
}catch{ localStorage.removeItem('nubyx_demo_session'); }

initSupabase();