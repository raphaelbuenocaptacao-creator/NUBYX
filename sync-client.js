(() => {
  const DEVICE_KEY_STORAGE = 'nubyx_device_key';
  const HEARTBEAT_MS = 60_000;
  const BOOT_POLL_MS = 2_000;
  const REPLAY_LIMIT = 500;
  const ALLOWED_CHANNELS = new Set(['workspace','apps','files','profile','settings']);
  const ALLOWED_EVENT_TYPES = new Set(['upsert','delete']);
  let activeUserId = null;
  let activeDeviceId = null;
  let channel = null;
  let heartbeatTimer = null;
  let schemaBlocked = false;
  let replayRunning = false;
  const cursors = new Map();

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
    return code === '42P01' || code === 'PGRST205' ||
      message.includes('user_devices') && message.includes('not found') ||
      message.includes('sync_events') && message.includes('not found') ||
      message.includes('sync_cursors') && message.includes('not found');
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

  async function loadCursors(){
    if(!activeUserId || !activeDeviceId || !supabaseClient) return false;
    const { data, error } = await supabaseClient
      .from('sync_cursors')
      .select('channel,last_event_id')
      .eq('user_id', activeUserId)
      .eq('device_id', activeDeviceId);

    if(error){
      console.warn('NUBYX Continuity cursor load failed', error);
      if(isSchemaMissing(error)){
        schemaBlocked = true;
        setSyncUi('Pendente', 'migration 004 não aplicada');
      } else {
        setSyncUi('Limitada', 'checkpoints indisponíveis');
      }
      return false;
    }

    cursors.clear();
    for(const name of ALLOWED_CHANNELS) cursors.set(name, 0);
    for(const row of data || []){
      if(ALLOWED_CHANNELS.has(row.channel)) cursors.set(row.channel, Number(row.last_event_id) || 0);
    }
    return true;
  }

  async function persistCursor(channelName, eventId){
    const next = Number(eventId) || 0;
    const current = cursors.get(channelName) || 0;
    if(!next || next <= current || !activeUserId || !activeDeviceId) return;

    cursors.set(channelName, next);
    const { error } = await supabaseClient
      .from('sync_cursors')
      .upsert({
        user_id: activeUserId,
        device_id: activeDeviceId,
        channel: channelName,
        last_event_id: next,
        updated_at: new Date().toISOString()
      }, { onConflict: 'device_id,channel' });

    if(error){
      console.warn('NUBYX Continuity cursor persist failed', error);
      if(isSchemaMissing(error)){
        schemaBlocked = true;
        setSyncUi('Pendente', 'migration 004 não aplicada');
      }
    }
  }

  async function processEvent(event, source = 'realtime'){
    if(!event || event.user_id !== activeUserId || !ALLOWED_CHANNELS.has(event.channel)) return;
    const eventId = Number(event.id) || 0;
    if(!eventId || eventId <= (cursors.get(event.channel) || 0)) return;

    if(event.device_id !== activeDeviceId){
      window.dispatchEvent(new CustomEvent('nubyx:sync-event', { detail: { ...event, source } }));
    }
    await persistCursor(event.channel, eventId);
  }

  async function replayMissedEvents(){
    if(replayRunning || schemaBlocked || !activeUserId || !activeDeviceId || !supabaseClient) return;
    replayRunning = true;
    try {
      let replayed = 0;
      for(const channelName of ALLOWED_CHANNELS){
        let hasMore = true;
        while(hasMore && !schemaBlocked){
          const afterId = cursors.get(channelName) || 0;
          const { data, error } = await supabaseClient
            .from('sync_events')
            .select('id,user_id,device_id,channel,entity_key,event_type,version,payload,created_at')
            .eq('user_id', activeUserId)
            .eq('channel', channelName)
            .gt('id', afterId)
            .order('id', { ascending: true })
            .limit(REPLAY_LIMIT);

          if(error){
            console.warn('NUBYX Continuity replay failed', error);
            if(isSchemaMissing(error)){
              schemaBlocked = true;
              setSyncUi('Pendente', 'migration 002/004 não aplicada');
            } else {
              setSyncUi('Limitada', 'histórico não pôde ser retomado');
            }
            return;
          }

          const rows = data || [];
          for(const event of rows){
            await processEvent(event, 'replay');
            replayed += 1;
          }
          hasMore = rows.length === REPLAY_LIMIT;
        }
      }
      setSyncUi('Sincronizada', replayed ? `${replayed} eventos recuperados` : 'continuidade em dia');
    } finally {
      replayRunning = false;
    }
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

    await persistCursor(channelName, data.id);
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
        processEvent(event, 'realtime').catch(error => console.warn('NUBYX Continuity realtime processing failed', error));
      })
      .subscribe(status => {
        if(status === 'SUBSCRIBED'){
          setSyncUi('Conectada', 'Realtime protegido por NUBYX ID');
          replayMissedEvents().catch(error => console.warn('NUBYX Continuity replay bootstrap failed', error));
        }
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
    replayRunning = false;
    cursors.clear();
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
    const cursorReady = await loadCursors();
    if(!cursorReady) return;
    await subscribe();
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  }

  setInterval(boot, BOOT_POLL_MS);
  window.addEventListener('online', () => {
    boot().then(() => replayMissedEvents()).catch(error => console.warn('NUBYX Continuity reconnect failed', error));
  });
  window.addEventListener('offline', () => {
    if(currentProfile?.mode === 'supabase') setSyncUi('Offline', 'alterações aguardam conexão');
  });

  window.NUBYX_CONTINUITY = {
    get deviceId(){ return activeDeviceId; },
    get userId(){ return activeUserId; },
    get ready(){ return Boolean(activeUserId && activeDeviceId && !schemaBlocked); },
    get checkpoints(){ return Object.fromEntries(cursors); },
    refresh: async () => { await boot(); await replayMissedEvents(); },
    publish
  };
})();
