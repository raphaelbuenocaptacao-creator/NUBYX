(() => {
  const DB_NAME = 'nubyx-continuity';
  const DB_VERSION = 1;
  const STORE_NAME = 'outbox';
  const MAX_QUEUE_PER_USER = 100;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  let flushing = false;

  function currentUserId(){
    return currentProfile?.mode === 'supabase' ? currentProfile?.userId || null : null;
  }

  function openDb(){
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if(!db.objectStoreNames.contains(STORE_NAME)){
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('user_created', ['user_id', 'created_at'], { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, callback){
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try { result = callback(store); } catch(error){ db.close(); reject(error); return; }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('NUBYX outbox transaction aborted')); };
    });
  }

  async function listForUser(userId){
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('user_created');
      const range = IDBKeyRange.bound([userId, 0], [userId, Number.MAX_SAFE_INTEGER]);
      const request = index.getAll(range);
      request.onsuccess = () => resolve((request.result || []).sort((a,b) => a.created_at - b.created_at));
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  }

  async function remove(id){
    await withStore('readwrite', store => store.delete(id));
  }

  async function purgeUser(userId){
    if(!userId) return 0;
    const rows = await listForUser(userId);
    for(const row of rows) await remove(row.id);
    if(rows.length){
      window.dispatchEvent(new CustomEvent('nubyx:sync-queue-purged', { detail: { count: rows.length } }));
    }
    return rows.length;
  }

  async function prune(userId){
    const now = Date.now();
    const rows = await listForUser(userId);
    const expired = rows.filter(row => now - row.created_at > MAX_AGE_MS);
    const active = rows.filter(row => now - row.created_at <= MAX_AGE_MS);
    const overflow = active.slice(0, Math.max(0, active.length - MAX_QUEUE_PER_USER));
    for(const row of [...expired, ...overflow]) await remove(row.id);
  }

  async function enqueue(userId, channelName, entityKey, eventType, payload, clientEventKey){
    await prune(userId);
    await withStore('readwrite', store => store.add({
      user_id: userId,
      channel: channelName,
      entity_key: entityKey,
      event_type: eventType,
      payload,
      client_event_key: clientEventKey,
      created_at: Date.now()
    }));
    await prune(userId);
    window.dispatchEvent(new CustomEvent('nubyx:sync-queued', { detail: { channel: channelName, entityKey } }));
  }

  async function flush(){
    const continuity = window.NUBYX_CONTINUITY;
    const userId = currentUserId();
    if(flushing || !navigator.onLine || !userId || !continuity?.ready || typeof continuity.__publishOnline !== 'function') return;
    flushing = true;
    try {
      await prune(userId);
      const rows = await listForUser(userId);
      let sent = 0;
      for(const row of rows){
        if(currentUserId() !== userId || !navigator.onLine) break;
        const result = await continuity.__publishOnline(
          row.channel,
          row.entity_key,
          row.event_type,
          row.payload,
          { clientEventKey: row.client_event_key }
        );
        if(result?.ok){
          await remove(row.id);
          sent += 1;
          continue;
        }
        if(['schema_missing','not_authenticated','device_unavailable'].includes(result?.reason)) break;
        break;
      }
      if(sent){
        window.dispatchEvent(new CustomEvent('nubyx:sync-flushed', { detail: { count: sent } }));
      }
    } catch(error){
      console.warn('NUBYX Continuity offline queue flush failed', error);
    } finally {
      flushing = false;
    }
  }

  function install(){
    const continuity = window.NUBYX_CONTINUITY;
    if(!continuity || continuity.__offlineQueueInstalled) return false;
    const publishOnline = continuity.publish.bind(continuity);
    Object.defineProperty(continuity, '__publishOnline', { value: publishOnline, enumerable: false });
    Object.defineProperty(continuity, '__offlineQueueInstalled', { value: true, enumerable: false });

    continuity.publish = async (channelName, entityKey, eventType = 'upsert', payload = {}, options = {}) => {
      const userId = currentUserId();
      const clientEventKey = options?.clientEventKey || continuity.createEventKey();
      if(!userId) return publishOnline(channelName, entityKey, eventType, payload, { ...options, clientEventKey });

      if(!navigator.onLine){
        await enqueue(userId, channelName, entityKey, eventType, payload, clientEventKey);
        return { ok: true, queued: true, reason: 'offline', clientEventKey };
      }

      const result = await publishOnline(channelName, entityKey, eventType, payload, { ...options, clientEventKey });
      if(!result?.ok && result?.reason === 'publish_failed' && !navigator.onLine){
        await enqueue(userId, channelName, entityKey, eventType, payload, clientEventKey);
        return { ok: true, queued: true, reason: 'offline', clientEventKey };
      }
      return result;
    };
    return true;
  }

  const installer = setInterval(() => {
    if(install()){
      clearInterval(installer);
      flush();
    }
  }, 250);

  window.addEventListener('online', () => setTimeout(flush, 400));
  window.addEventListener('nubyx:sync-published', flush);
  window.addEventListener('nubyx:sync-flush-request', flush);
  window.addEventListener('nubyx:session-ended', event => {
    const userId = event?.detail?.userId || null;
    purgeUser(userId).catch(error => console.warn('NUBYX Continuity queue purge failed', error));
  });
})();
