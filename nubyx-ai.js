(() => {
  const AI_COMMANDS = [
    { label: 'Abrir Drive', hint: 'Acessar seus arquivos privados', action: () => openModule('drive') },
    { label: 'Abrir Store', hint: 'Ver apps e serviços web', action: () => openModule('store') },
    { label: 'Ver arquivos', hint: 'Pesquisar no NUBYX Drive', action: () => openModule('drive') }
  ];

  const normalize = (value = '') => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  function aiEscape(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  async function getContext() {
    const [files, apps] = await Promise.all([
      typeof listDriveFiles === 'function' ? listDriveFiles() : Promise.resolve([]),
      typeof listInstalledApps === 'function' ? listInstalledApps() : Promise.resolve([])
    ]);
    return { files: files || [], apps: apps || [] };
  }

  function renderAnswer(title, text, items = []) {
    const answer = document.querySelector('#aiAnswer');
    if (!answer) return;
    answer.innerHTML = `
      <div class="ai-answer-head"><span>✦</span><div><b>${aiEscape(title)}</b><small>NUBYX AI · processamento local</small></div></div>
      <p>${aiEscape(text)}</p>
      ${items.length ? `<div class="ai-results">${items.map((item) => `
        <button class="ai-result" data-ai-target="${aiEscape(item.target || '')}">
          <span>${aiEscape(item.icon || '◇')}</span><div><b>${aiEscape(item.title)}</b><small>${aiEscape(item.subtitle || '')}</small></div>
        </button>`).join('')}</div>` : ''}`;

    answer.querySelectorAll('[data-ai-target]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.aiTarget;
        if (target === 'drive') openModule('drive');
        if (target === 'store') openModule('store');
      });
    });
  }

  async function runQuery(rawQuery) {
    const query = normalize(rawQuery);
    if (!query) return;

    if (query.includes('abrir drive') || query === 'drive') {
      renderAnswer('Abrindo o Drive', 'Vou levar você ao seu espaço privado de arquivos.');
      setTimeout(() => openModule('drive'), 250);
      return;
    }

    if (query.includes('abrir store') || query === 'store' || query.includes('loja')) {
      renderAnswer('Abrindo a Store', 'Vou abrir o catálogo de PWAs e serviços web compatíveis.');
      setTimeout(() => openModule('store'), 250);
      return;
    }

    const { files, apps } = await getContext();

    if (query.includes('arquivo') || query.includes('pdf') || query.includes('documento') || query.includes('imagem')) {
      const terms = query.split(/\s+/).filter((term) => term.length > 2 && !['arquivo','arquivos','documento','documentos','mostrar','buscar','procure','meus'].includes(term));
      const matches = files.filter((file) => {
        const haystack = normalize(`${file.name || ''} ${file.mime_type || ''}`);
        return terms.length ? terms.every((term) => haystack.includes(term)) : true;
      }).slice(0, 6);

      if (!matches.length) {
        renderAnswer('Nenhum arquivo encontrado', 'Não encontrei arquivos compatíveis com essa busca no seu NUBYX Drive.');
        return;
      }

      renderAnswer('Arquivos encontrados', `Encontrei ${matches.length} resultado${matches.length === 1 ? '' : 's'} no seu Drive.`, matches.map((file) => ({
        icon: '◫', title: file.name || 'Arquivo', subtitle: file.mime_type || 'arquivo', target: 'drive'
      })));
      return;
    }

    if (query.includes('app') || query.includes('instalado') || query.includes('aplicativo')) {
      if (!apps.length) {
        renderAnswer('Nenhum app extra instalado', 'Sua Store não possui apps extras instalados neste perfil.', [{ icon: '⊞', title: 'Abrir NUBYX Store', subtitle: 'Explorar catálogo', target: 'store' }]);
        return;
      }
      renderAnswer('Apps instalados', `Você possui ${apps.length} app${apps.length === 1 ? '' : 's'} extra${apps.length === 1 ? '' : 's'} no seu ambiente.`, apps.slice(0, 6).map((app) => ({
        icon: app.icon || '⊞', title: app.app_name || app.app_key || 'App', subtitle: 'Instalado no NUBYX', target: 'store'
      })));
      return;
    }

    if (query.includes('segur') || query.includes('privacidade')) {
      const cloud = typeof currentProfile !== 'undefined' && currentProfile?.mode === 'supabase';
      renderAnswer('Estado de segurança', cloud
        ? 'Sua sessão está autenticada. Drive e apps usam isolamento por usuário preparado com RLS no Supabase.'
        : 'Você está no modo demonstração. Os dados ficam somente neste dispositivo e não são sincronizados com uma conta real.');
      return;
    }

    renderAnswer('Posso agir dentro do NUBYX', 'Nesta etapa eu opero localmente e só executo ações permitidas. Tente “abrir Drive”, “mostrar meus arquivos”, “apps instalados” ou “estado de segurança”.');
  }

  async function renderNubyxAI() {
    const panel = document.querySelector('#panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="panel-title ai-title"><div><span class="eyebrow">NUBYX AI</span><h3>Comando central do seu ambiente</h3><small>Assistente local seguro · nenhuma ação destrutiva automática</small></div><span class="ai-status">● LOCAL CORE</span></div>
      <div class="ai-shell">
        <form id="aiForm" class="ai-command"><span>✦</span><input id="aiInput" autocomplete="off" placeholder="Ex.: mostrar meus arquivos, abrir Store, estado de segurança" aria-label="Comando para NUBYX AI"><button class="primary" type="submit">Executar</button></form>
        <div class="ai-suggestions">${AI_COMMANDS.map((command) => `<button type="button" data-ai-command="${aiEscape(command.label)}"><b>${aiEscape(command.label)}</b><small>${aiEscape(command.hint)}</small></button>`).join('')}</div>
        <section id="aiAnswer" class="ai-answer"><div class="ai-answer-head"><span>✦</span><div><b>NUBYX AI pronto</b><small>Camada local de inteligência</small></div></div><p>Posso pesquisar arquivos, conferir apps, abrir módulos e explicar o estado de segurança sem enviar seus dados para um modelo externo.</p></section>
      </div>`;

    document.querySelector('#aiForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      runQuery(document.querySelector('#aiInput')?.value || '');
    });

    panel.querySelectorAll('[data-ai-command]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.querySelector('#aiInput');
        if (input) input.value = button.dataset.aiCommand || '';
        runQuery(button.dataset.aiCommand || '');
      });
    });
  }

  document.querySelectorAll('[data-open="ai"], [data-app="ai"]').forEach((button) => {
    button.addEventListener('click', () => setTimeout(renderNubyxAI, 0));
  });

  window.NUBYX_AI = { render: renderNubyxAI, run: runQuery };
})();