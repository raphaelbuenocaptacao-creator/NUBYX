(() => {
  const AI_COMMANDS = [
    { label: 'Abrir Drive', hint: 'Acessar seus arquivos privados', action: () => openModule('drive') },
    { label: 'Abrir Store', hint: 'Ver apps e serviços web', action: () => openModule('store') },
    { label: 'Ver arquivos', hint: 'Pesquisar no NUBYX Drive', action: () => openModule('drive') }
  ];
  const MAX_QUERY_CHARS = 512;
  const MAX_SEARCH_TERMS = 8;
  const MAX_CONTEXT_ITEMS = 500;
  const CONTEXT_TIMEOUT_MS = 7000;

  let querySequence = 0;

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

  function sessionFingerprint() {
    try {
      const profile = typeof currentProfile !== 'undefined' ? currentProfile : null;
      if (!profile) return 'signed-out';

      const mode = profile.mode || 'unknown';
      const stableUserId = profile.userId || profile.id || profile.user_id || '';

      // Real cloud sessions must be bound to an immutable account identifier.
      // Never fall back to email for Supabase: it is mutable and may be reused across session transitions.
      if (mode === 'supabase' && !stableUserId) return 'unavailable';

      // Demo/local profiles are device-local and currently use a synthetic email identity.
      const localIdentity = stableUserId || profile.sessionId || profile.demoId || (mode !== 'supabase' ? profile.email : '') || '';
      if (!localIdentity) return 'unavailable';

      return `${mode}:${localIdentity}`;
    } catch (_) {
      return 'unavailable';
    }
  }

  function hasActiveSession(fingerprint = sessionFingerprint()) {
    return fingerprint !== 'signed-out' && fingerprint !== 'unavailable';
  }

  function isFreshQuery(sequence, fingerprint) {
    return sequence === querySequence && fingerprint === sessionFingerprint() && hasActiveSession(fingerprint);
  }

  function safeOpenModule(target, sequence, fingerprint, delay = 250) {
    setTimeout(() => {
      if (isFreshQuery(sequence, fingerprint)) openModule(target);
    }, delay);
  }

  function normalizeContext(value, source) {
    if (!Array.isArray(value)) {
      console.warn(`NUBYX AI ignored an invalid ${source} context payload.`);
      return [];
    }
    if (value.length > MAX_CONTEXT_ITEMS) {
      console.warn(`NUBYX AI limited ${source} context to ${MAX_CONTEXT_ITEMS} items.`);
    }
    return value.slice(0, MAX_CONTEXT_ITEMS).filter((item) => item && typeof item === 'object');
  }

  function withContextTimeout(promise, source) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${source}_context_timeout`)), CONTEXT_TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
  }

  async function getDriveContext() {
    if (typeof listDriveFiles !== 'function') return [];
    return normalizeContext(await withContextTimeout(listDriveFiles(), 'drive'), 'Drive');
  }

  async function getStoreContext() {
    if (typeof listInstalledApps !== 'function') return [];
    return normalizeContext(await withContextTimeout(listInstalledApps(), 'store'), 'Store');
  }

  function renderAnswer(title, text, items = [], expectedFingerprint = sessionFingerprint()) {
    const activeFingerprint = sessionFingerprint();
    if (!hasActiveSession(expectedFingerprint) || expectedFingerprint !== activeFingerprint) return;

    const answer = document.querySelector('#aiAnswer');
    if (!answer) return;

    answer.innerHTML = `
      <div class="ai-answer-head"><span>✦</span><div><b>${aiEscape(title)}</b><small>NUBYX AI · processamento local</small></div></div>
      <p>${aiEscape(text)}</p>
      ${items.length ? `<div class="ai-results">${items.map((item) => `
        <button class="ai-result" data-ai-target="${aiEscape(item.target || '')}" data-ai-resource-id="${aiEscape(item.resourceId || '')}">
          <span>${aiEscape(item.icon || '◇')}</span><div><b>${aiEscape(item.title)}</b><small>${aiEscape(item.subtitle || '')}</small></div>
        </button>`).join('')}</div>` : ''}`;

    answer.querySelectorAll('[data-ai-target]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (expectedFingerprint !== sessionFingerprint() || !hasActiveSession(expectedFingerprint)) return;
        const target = button.dataset.aiTarget;
        if (target === 'drive') openModule('drive');
        if (target === 'store') openModule('store');
        if (target === 'drive-file') {
          const resourceId = button.dataset.aiResourceId || '';
          if (!resourceId || typeof downloadDriveFile !== 'function') return;
          button.disabled = true;
          try {
            if (expectedFingerprint === sessionFingerprint() && hasActiveSession(expectedFingerprint)) {
              await downloadDriveFile(resourceId);
            }
          } finally {
            if (expectedFingerprint === sessionFingerprint()) button.disabled = false;
          }
        }
      });
    });
  }

  function clearSessionScopedAI() {
    querySequence += 1;
    const input = document.querySelector('#aiInput');
    if (input) input.value = '';
    const answer = document.querySelector('#aiAnswer');
    if (answer) {
      answer.innerHTML = '<div class="ai-answer-head"><span>✦</span><div><b>NUBYX AI bloqueada</b><small>NUBYX ID · sessão encerrada</small></div></div><p>O contexto da sessão anterior foi removido deste painel. Entre novamente para consultar seus dados.</p>';
    }
  }

  async function runQuery(rawQuery) {
    const raw = String(rawQuery ?? '');
    if (!raw.trim()) return;

    const sequence = ++querySequence;
    const fingerprint = sessionFingerprint();
    if (!hasActiveSession(fingerprint)) {
      clearSessionScopedAI();
      return;
    }

    const respond = (title, text, items = []) => renderAnswer(title, text, items, fingerprint);

    if (raw.length > MAX_QUERY_CHARS) {
      respond('Comando muito longo', `Para manter o NUBYX AI rápido e seguro, use até ${MAX_QUERY_CHARS} caracteres por comando.`);
      return;
    }

    const query = normalize(raw);
    if (!query) return;

    if (query.includes('abrir drive') || query === 'drive') {
      respond('Abrindo o Drive', 'Vou levar você ao seu espaço privado de arquivos.');
      safeOpenModule('drive', sequence, fingerprint);
      return;
    }

    if (query.includes('abrir store') || query === 'store' || query.includes('loja')) {
      respond('Abrindo a Store', 'Vou abrir o catálogo de PWAs e serviços web compatíveis.');
      safeOpenModule('store', sequence, fingerprint);
      return;
    }

    if (query.includes('segur') || query.includes('privacidade')) {
      const cloud = typeof currentProfile !== 'undefined' && currentProfile?.mode === 'supabase';
      respond('Estado de segurança', cloud
        ? 'Sua sessão está autenticada. Drive e apps usam isolamento por usuário preparado com RLS no Supabase.'
        : 'Você está no modo demonstração. Os dados ficam somente neste dispositivo e não são sincronizados com uma conta real.');
      return;
    }

    if (query.includes('arquivo') || query.includes('pdf') || query.includes('documento') || query.includes('imagem')) {
      let files;
      try {
        files = await getDriveContext();
      } catch (_) {
        if (isFreshQuery(sequence, fingerprint)) {
          respond('Drive indisponível', 'Não consegui consultar seu Drive com segurança agora. Sua sessão não foi alterada; tente novamente.');
        }
        return;
      }
      if (!isFreshQuery(sequence, fingerprint)) return;

      const terms = query.split(/\s+/)
        .filter((term) => term.length > 2 && !['arquivo','arquivos','documento','documentos','mostrar','buscar','procure','meus'].includes(term))
        .slice(0, MAX_SEARCH_TERMS);
      const matches = files.filter((file) => {
        const haystack = normalize(`${file.name || ''} ${file.mime_type || ''}`);
        return terms.length ? terms.every((term) => haystack.includes(term)) : true;
      }).slice(0, 6);

      if (!matches.length) {
        respond('Nenhum arquivo encontrado', 'Não encontrei arquivos compatíveis com essa busca no seu NUBYX Drive.');
        return;
      }

      respond('Arquivos encontrados', `Encontrei ${matches.length} resultado${matches.length === 1 ? '' : 's'} no seu Drive. Toque em um resultado para abrir o arquivo com o fluxo seguro do NUBYX Drive.`, matches.map((file) => ({
        icon: '◫', title: file.name || 'Arquivo', subtitle: `${file.mime_type || 'arquivo'} · abrir com segurança`, target: 'drive-file', resourceId: file.id || ''
      })));
      return;
    }

    if (query.includes('app') || query.includes('instalado') || query.includes('aplicativo')) {
      let apps;
      try {
        apps = await getStoreContext();
      } catch (_) {
        if (isFreshQuery(sequence, fingerprint)) {
          respond('Store indisponível', 'Não consegui consultar seus apps com segurança agora. Sua sessão não foi alterada; tente novamente.');
        }
        return;
      }
      if (!isFreshQuery(sequence, fingerprint)) return;

      if (!apps.length) {
        respond('Nenhum app extra instalado', 'Sua Store não possui apps extras instalados neste perfil.', [{ icon: '⊞', title: 'Abrir NUBYX Store', subtitle: 'Explorar catálogo', target: 'store' }]);
        return;
      }
      respond('Apps instalados', `Você possui ${apps.length} app${apps.length === 1 ? '' : 's'} extra${apps.length === 1 ? '' : 's'} no seu ambiente.`, apps.slice(0, 6).map((app) => ({
        icon: app.icon || '⊞', title: app.app_name || app.app_key || 'App', subtitle: 'Instalado no NUBYX', target: 'store'
      })));
      return;
    }

    respond('Posso agir dentro do NUBYX', 'Nesta etapa eu opero localmente e só executo ações permitidas. Tente “abrir Drive”, “mostrar meus arquivos”, “apps instalados” ou “estado de segurança”.');
  }

  async function renderNubyxAI() {
    const panel = document.querySelector('#panel');
    if (!panel) return;
    const fingerprint = sessionFingerprint();
    if (!hasActiveSession(fingerprint)) {
      panel.innerHTML = '<div class="panel-title ai-title"><div><span class="eyebrow">NUBYX AI</span><h3>Entre com seu NUBYX ID</h3><small>O assistente só acessa contexto dentro de uma sessão válida.</small></div><span class="ai-status">● BLOQUEADO</span></div>';
      return;
    }

    querySequence += 1;
    panel.innerHTML = `
      <div class="panel-title ai-title"><div><span class="eyebrow">NUBYX AI</span><h3>Comando central do seu ambiente</h3><small>Assistente local seguro · nenhuma ação destrutiva automática</small></div><span class="ai-status">● LOCAL CORE</span></div>
      <div class="ai-shell">
        <form id="aiForm" class="ai-command"><span>✦</span><input id="aiInput" maxlength="${MAX_QUERY_CHARS}" autocomplete="off" placeholder="Ex.: mostrar meus arquivos, abrir Store, estado de segurança" aria-label="Comando para NUBYX AI"><button class="primary" type="submit">Executar</button></form>
        <div class="ai-suggestions">${AI_COMMANDS.map((command) => `<button type="button" data-ai-command="${aiEscape(command.label)}"><b>${aiEscape(command.label)}</b><small>${aiEscape(command.hint)}</small></button>`).join('')}</div>
        <section id="aiAnswer" class="ai-answer"><div class="ai-answer-head"><span>✦</span><div><b>NUBYX AI pronto</b><small>Camada local de inteligência</small></div></div><p>Posso pesquisar arquivos, conferir apps, abrir módulos e explicar o estado de segurança sem enviar seus dados para um modelo externo.</p></section>
      </div>`;

    document.querySelector('#aiForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (fingerprint !== sessionFingerprint()) return;
      runQuery(document.querySelector('#aiInput')?.value || '');
    });

    panel.querySelectorAll('[data-ai-command]').forEach((button) => {
      button.addEventListener('click', () => {
        if (fingerprint !== sessionFingerprint()) return;
        const input = document.querySelector('#aiInput');
        if (input) input.value = button.dataset.aiCommand || '';
        runQuery(button.dataset.aiCommand || '');
      });
    });
  }

  document.querySelectorAll('[data-open="ai"], [data-app="ai"]').forEach((button) => {
    button.addEventListener('click', () => setTimeout(renderNubyxAI, 0));
  });

  window.addEventListener('nubyx:session-ended', clearSessionScopedAI);
  window.addEventListener('nubyx:session-locked', clearSessionScopedAI);
  window.NUBYX_AI = { render: renderNubyxAI, run: runQuery };
})();