const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const auth = $('#auth');
const os = $('#os');
const toast = $('#toast');
let deferredPrompt = null;

function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(()=>toast.classList.remove('show'), 2400);
}

function formatClock(){
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  $('#clock').textContent = time;
  $('#phoneClock').textContent = time;
  $('#today').textContent = now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
}
setInterval(formatClock,1000); formatClock();

function enterOS(profile={email:'demo@nubyx.cloud', mode:'demo'}){
  localStorage.setItem('nubyx_session', JSON.stringify(profile));
  auth.classList.add('hidden'); os.classList.remove('hidden');
  showToast('NUBYX iniciado com sucesso');
}
function exitOS(){
  localStorage.removeItem('nubyx_session');
  os.classList.add('hidden'); auth.classList.remove('hidden');
}

$('#loginForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const email=$('#email').value.trim();
  const password=$('#password').value;
  if(!email || password.length<6) return showToast('Confira e-mail e senha.');
  // MVP fallback: local session. Replace with Supabase Auth when config is present.
  enterOS({email, mode:'local-mvp'});
});
$('#demoBtn').addEventListener('click',()=>enterOS());
$('#logoutBtn').addEventListener('click', exitOS);

const panelContent = {
  home: ['CONTINUIDADE','Continue de onde parou','Projetos, notas e ações recentes sincronizadas neste ambiente.'],
  drive: ['NUBYX DRIVE','Seus arquivos na nuvem','Uploads privados, pastas, recentes e compartilhamentos entrarão aqui com Supabase Storage.'],
  store: ['NUBYX STORE','Apps para seu ambiente','Instale PWAs e serviços web compatíveis no seu NUBYX.'],
  ai: ['NUBYX AI','Inteligência dentro do sistema','Busque arquivos, organize conteúdo e execute ações assistidas com permissões do usuário.'],
  vault: ['NUBYX VAULT','Seu espaço protegido','Uma camada extra de autenticação para documentos e arquivos sensíveis.'],
  notes: ['NOTAS','Notas rápidas','Crie e sincronize anotações no seu ambiente NUBYX.'],
  files: ['ARQUIVOS','Gerenciador de arquivos','Navegue por documentos, imagens e pastas do seu NUBYX Drive.'],
  settings: ['AJUSTES','Personalize seu NUBYX','Tema, papel de parede, sessão, privacidade e preferências.'],
  browser: ['NAVEGADOR','Web dentro do NUBYX','Atalhos e serviços compatíveis com navegação segura.']
};
function openModule(key){
  const data=panelContent[key]||panelContent.home;
  $$('.dock button[data-open]').forEach(b=>b.classList.toggle('active', b.dataset.open===key));
  $('#panel').innerHTML = `<div class="panel-title"><div><span class="eyebrow">${data[0]}</span><h3>${data[1]}</h3></div><button class="ghost">Em construção</button></div><div class="activity"><div class="activity-icon">✦</div><div><b>${data[1]}</b><small>${data[2]}</small></div><span>v0.1</span></div><div class="activity"><div class="activity-icon">●</div><div><b>Estado do módulo</b><small>Interface preparada para a próxima camada funcional.</small></div><span>Ativo</span></div>`;
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
  const saved=JSON.parse(localStorage.getItem('nubyx_session')||'null');
  if(saved) enterOS(saved);
}catch{}
