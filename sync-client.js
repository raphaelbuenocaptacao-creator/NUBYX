(() => {
  const DEVICE_KEY_STORAGE = 'nubyx_device_key';
  const HEARTBEAT_MS = 60_000;
  const BOOT_POLL_MS = 2_000;
  let activeUserId = null;
  let activeDeviceId = null;
  let channel = null;
  let heartbeatTimer = null;
  let schemaBlocked = false;

  function getDeviceKey(){
    let key = localStorage.getItem(DEVICE_KEY_STORAGE);
    if(!key){
      key = crypto.randomUUID().replace(/-/g, '');
      localStorage.setItem(DEVICE_KEY_STORAGE, key);
    }
    return key;
  }

  function deviceName(){
    const ua = navigator.userAgent || '';
    if(/Android/i.test(ua)) return 'NUBYX · Android browser';
    if(/iPhone|iPad|iPod/i.test(ua)) return 'NUBYX · iOS browser';
    if(/Windows/i.test(ua)) return 'NUBYX · Windows';
    if(/Macintosh|Mac OS X/i.test(ua)) return 'NUBYX · macOS';
    if(/Linux/i.test(ua)) return 'NUBYX · Linux';
    return 'NUBYX · Web device';
  }

  function setSyncUi(state, detail){
    const stateEl = document.querySelector('#syncState');
    const detailEl = document.querySelector('#syncDetail');
    if(stateEl) stateEl.textContent = state;
    if(detailEl) detailEl.textContent = detail;
  }

  function isSchemaMissing(error){
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === '42P01' || code === 'PGRST205' || message.includes('user_devices') && message.includes('not found');
  }

  async function registerDevice(){
    if(schemaBlocked || !supabaseClient || currentProfile?.mode !== 'supabase' || !currentProfile?.userId) return null;
    const userId = currentProfile.userId;
    const payload = {
      user_id: userId,
      device_key: getDeviceKey(),
      device_name: deviceName(),
      platform: navigator.userAgentData?.platform || navigator.platform || null,
      user_agent: (navigator.userAgent || '').slice(0, 1000),
      last_seen_at: new Date().toISOString()
    };

    const { data, error } = await supabaseClient
      .from('user_devices')
      .upsert(payload, { onConflict: 'user_id,device_key' })
      .select('id,last_seen_at')
      .single();

    if(error){
      console.warn('NUBYX Continuity device registration failed', error);
      if(isSchemaMissing(error)){
        schemaBlocked = true;
        setSyncUi('Pendente', 'migration 002 não aplicada');
      } else {
        setSyncUi('Limitada', 'não foi possível registrar dispositivo');
      }
      return null;
    }

    activeUserId = userId;
    activeDeviceId = data.id;
    setSyncUi('Conectada', 'dispositivo registrado');
    return data;
  }

  async function heartbeat(){
    if(!activeDeviceId || !supabaseClient || currentProfile?.mode !== 'supabase' || currentProfile?.userId !== activeUserId) return;
    const { error } = await supabaseClient
      .from('user_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', activeDeviceId)
      .eq('user_id', activeUserId);
    if(error) console.warn('NUBYX Continuity heartbeat failed', error);
  }

  async function subscribe(){
    if(!supabaseClient || !activeUserId || channel) return;
    channel = supabaseClient
      .channel(`nubyx-continuity-${activeUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sync_events',
        filter: `user_id=eq.${activeUserId}`
      }, payload => {
        const event = payload?.new;
        if(!event || event.device_id === activeDeviceId) return;
        window.dispatchEvent(new CustomEvent('nubyx:sync-event', { detail: event }));
        setSyncUi('Atualizada', `evento ${event.channel || 'workspace'} recebido`);
      })
      .subscribe(status => {
        if(status === 'SUBSCRIBED') setSyncUi('Conectada', 'Realtime protegido por NUBYX ID');
      });
  }

  async function stop(){
    if(heartbeatTimer){ clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if(channel && supabaseClient){
      try { await supabaseClient.removeChannel(channel); } catch {}
    }
    channel = null;
    activeUserId = null;
    activeDeviceId = null;
  }

  async function boot(){
    if(currentProfile?.mode !== 'supabase' || !supabaseClient || !currentProfile?.userId){
      if(activeUserId) await stop();
      return;
    }
    if(activeUserId === currentProfile.userId || schemaBlocked) return;

    setSyncUi('Conectando', 'registrando este dispositivo');
    const registered = await registerDevice();
    if(!registered) return;
    await subscribe();
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  }

  setInterval(boot, BOOT_POLL_MS);
  window.addEventListener('online', boot);
  window.addEventListener('offline', () => {
    if(currentProfile?.mode === 'supabase') setSyncUi('Offline', 'alterações aguardam conexão');
  });

  window.NUBYX_CONTINUITY = {
    get deviceId(){ return activeDeviceId; },
    get userId(){ return activeUserId; },
    refresh: boot
  };
})();
