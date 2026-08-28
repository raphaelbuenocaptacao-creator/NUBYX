(() => {
  const DEVICE_KEY_STORAGE = 'nubyx_device_key';
  const HEARTBEAT_MS = 60_000;
  const BOOT_POLL_MS = 2_000;
  const ALLOWED_CHANNELS = new Set(['workspace','apps','files','profile','settings']);
  const ALLOWED_EVENT_TYPES = new Set(['upsert','delete']);
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
    return code === '42P01' || code === 'PGRST205' || message.includes('user_devices') && message.includes('not found') || message.includes('sync_events') && message.includes('not found');
  }

  function normalizePayload(payload){
    if(payload == null) return {};
    if(typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('NUBYX sync payload must be a JSON object.');
    return JSON.parse(JSON.stringify(payload));
  }

  function validateEvent(channelName, entityKey, eventType){
    if(!ALLOWED_CHANNELS.has(channelName)) throw new TypeError(`Invalid NUBYX sync channel: ${channelName}`);
    if(!ALLOWED_EVENT_TYPES.has(eventType)) throw new TypeError(`Invalid NUBYX sync event type: ${eventType}`);
    const key = String(entityKey || '').trim();
    if(!key || key.length > 255) throw new TypeError('NUBYX sync entity key must have 1-255 characters.');
    return key;
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

  async function publish(channelName, entityKey, eventType = 'upsert', payload = {}){
    const key = validateEvent(channelName, entityKey, eventType);
    const safePayload = normalizePayload(payload);

    if(schemaBlocked) return { ok: false, reason: 'schema_missing' };
    if(currentProfile?.mode !== 'supabase' || !supabaseClient || !currentProfile?.userId){
      return { ok: false, reason: 'not_authenticated' };
    }

    if(activeUserId !== currentProfile.userId || !activeDeviceId){
      await boot();
    }
    if(!activeDeviceId) return { ok: false, reason: schemaBlocked ? 'schema_missing' : 'device_unavailable' };

    const event = {
      user_id: currentProfile.userId,
      device_id: activeDeviceId,
      channel: channelName,
      entity_key: key,
      event_type: eventType,
      version: Date.now(),
      payload: safePayload
    };

    const { data, error } = await supabaseClient
      .from('sync_events')
      .insert(event)
      .select('id,created_at')
      .single();

    if(error){
      console.warn('NUBYX Continuity publish failed', error);
      if(isSchemaMissing(error)){
        schemaBlocked = true;
        setSyncUi('Pendente', 'migration 002 não aplicada');
        return { ok: false, reason: 'schema_missing', error };
      }
      setSyncUi('Limitada', 'evento não sincronizado');
      return { ok: false, reason: 'publish_failed', error };
    }

    setSyncUi('Sincronizada', `${channelName} atualizado`);
    window.dispatchEvent(new CustomEvent('nubyx:sync-published', { detail: { ...event, ...data } }));
    return { ok: true, event: { ...event, ...data } };
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
    get ready(){ return Boolean(activeUserId && activeDeviceId && !schemaBlocked); },
    refresh: boot,
    publish
  };
})();
