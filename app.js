const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const auth = $('#auth');
const os = $('#os');
const toast = $('#toast');
const config = window.NUBYX_CONFIG || {};
let deferredPrompt = null;
let supabaseClient = null;
let currentProfile = null;

const STORE_CATALOG = [
  {key:'calendar', name:'Calendário', icon:'◫', url:'https://calendar.google.com', description:'Agenda e compromissos em um só lugar.'},
  {key:'docs', name:'Documentos', icon:'▤', url:'https://docs.google.com', description:'Crie e edite documentos na nuvem.'},
  {key:'sheets', name:'Planilhas', icon:'▦', url:'https://sheets.google.com', description:'Planilhas e dados no seu workspace.'},
  {key:'notion', name:'Notion', icon:'N', url:'https://www.notion.so', description:'Notas, projetos e bases de conhecimento.'},
  {key:'figma', name:'Figma', icon:'F', url:'https://www.figma.com', description:'Design colaborativo diretamente no navegador.'},
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

function getDemoApps(){
  try { return JSON.parse(localStorage.getItem('nubyx_demo_apps') || '[]'); }
  catch { return []; }
}

function setDemoApps(apps){
  localStorage.setItem('nubyx_demo_apps', JSON.stringify(apps));
}

async function listInstalledApps(){
  if(currentProfile?.mode === 'supabase' && supabaseClient){
    const { data, error } = await supabaseClient
      .from('user_apps')
      .select('app_key,app_name,app_url,icon,position')
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
  if(currentProfile.mode === 'supabase' && supabaseClient){
    const { error } = await supabaseClient.from('user_apps').delete().eq('app_key', appKey);
    if(error){ console.error(error); return showToast('Falha ao remover app.'); }
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
  drive: ['NUBYX DRIVE','Seus arquivos na nuvem','Uploads privados, pastas, recentes e compartilhamentos entrarão aqui com Supabase Storage.'],
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
  const data=panelContent[key]||panelContent.home;
  $('#panel').innerHTML = `<div class="panel-title"><div><span class="eyebrow">${data[0]}</span><h3>${data[1]}</h3></div><button class="ghost">Em construção</button></div><div class="activity"><div class="activity-icon">✦</div><div><b>${data[1]}</b><small>${data[2]}</small></div><span>v0.3</span></div><div class="activity"><div class="activity-icon">●</div><div><b>Estado do módulo</b><small>Interface preparada para a próxima camada funcional.</small></div><span>Ativo</span></div>`;
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
