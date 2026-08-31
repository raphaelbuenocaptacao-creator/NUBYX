(() => {
  const DB_NAME = 'nubyx-continuity';
  const DB_VERSION = 1;
  const STORE_NAME = 'outbox';
  const MAX_QUEUE_PER_USER = 100;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  let flushing = false;
  let sessionGeneration = 0;
  let lastKnownUserId = null;

  function currentUserId(){
    const userId = currentProfile?.mode === 'supabase' ? currentProfile?.userId || null : null;
    if(userId) lastKnownUserId = userId;
    return userId;
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

  async function purgeForeignUsers(activeUserId){
    if(!activeUserId) return 0;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      let removed = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if(!cursor) return;
        if(cursor.value?.user_id !== activeUserId){
          cursor.delete();
          removed += 1;
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {
        db.close();
        if(removed){
          window.dispatchEvent(new CustomEvent('nubyx:sync-queue-purged', { detail: { count: removed, reason: 'foreign_user' } }));
        }
        resolve(removed);
      };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('NUBYX outbox purge aborted')); };
    });
  }

  async function prune(userId){
    const now = Date.now();
    const rows = await listForUser(userId);
    const expired = rows.filter(row => now - row.created_at > MAX_AGE_MS);
    const active = rows.filter(row => now - row.created_at <= MAX_AGE_MS);
    const overflow = active.slice(0, Math.max(0, active.length - MAX_QUEUE_PER_USER));
    for(const row of [...expired, ...overflow]) await remove(row.id);
  }

  function sessionStillMatches(userId, generation){
    return generation === sessionGeneration && currentUserId() === userId;
  }

  async function enqueue(userId, channelName, entityKey, eventType, payload, clientEventKey, generation){
    if(!sessionStillMatches(userId, generation)) return false;
    await purgeForeignUsers(userId);
    if(!sessionStillMatches(userId, generation)) return false;
    await prune(userId);
    if(!sessionStillMatches(userId, generation)) return false;

    const existing = (await listForUser(userId)).find(row => row.client_event_key === clientEventKey);
    if(existing){
      window.dispatchEvent(new CustomEvent('nubyx:sync-queued', {
        detail: { channel: existing.channel, entityKey: existing.entity_key, deduplicated: true }
      }));
      return true;
    }

    if(!sessionStillMatches(userId, generation)) return false;
    await withStore('readwrite', store => {
      if(!sessionStillMatches(userId, generation)) return;
      store.add({
        user_id: userId,
        channel: channelName,
        entity_key: entityKey,
        event_type: eventType,
        payload,
        client_event_key: clientEventKey,
        created_at: Date.now()
      });
    });
    if(!sessionStillMatches(userId, generation)){
      await purgeUser(userId);
      return false;
    }
    await prune(userId);
    window.dispatchEvent(new CustomEvent('nubyx:sync-queued', { detail: { channel: channelName, entityKey } }));
    return true;
  }

  async function flush(){
    const continuity = window.NUBYX_CONTINUITY;
    const userId = currentUserId();
    const generation = sessionGeneration;
    if(flushing || !navigator.onLine || !userId || !continuity?.ready || typeof continuity.__publishOnline !== 'function') return;
    flushing = true;
    try {
      await purgeForeignUsers(userId);
      if(generation !== sessionGeneration || currentUserId() !== userId) return;
      await prune(userId);
      const rows = await listForUser(userId);
      let sent = 0;
      for(const row of rows){
        if(generation !== sessionGeneration || currentUserId() !== userId || !navigator.onLine) break;
        const result = await continuity.__publishOnline(
          row.channel,
          row.entity_key,
          row.event_type,
          row.payload,
          { clientEventKey: row.client_event_key }
        );
        if(generation !== sessionGeneration || currentUserId() !== userId) break;
        if(result?.ok){
          await remove(row.id);
          sent += 1;
          continue;
        }
        if(['schema_missing','not_authenticated','device_unavailable'].includes(result?.reason)) break;
        break;
      }
      if(sent && generation === sessionGeneration && currentUserId() === userId){
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
      const generation = sessionGeneration;
      const clientEventKey = options?.clientEventKey || continuity.createEventKey();
      if(!userId) return publishOnline(channelName, entityKey, eventType, payload, { ...options, clientEventKey });

      if(!navigator.onLine){
        const queued = await enqueue(userId, channelName, entityKey, eventType, payload, clientEventKey, generation);
        return queued
          ? { ok: true, queued: true, reason: 'offline', clientEventKey }
          : { ok: false, queued: false, reason: 'session_changed', clientEventKey };
      }

      const result = await publishOnline(channelName, entityKey, eventType, payload, { ...options, clientEventKey });
      if(!result?.ok && result?.reason === 'publish_failed' && !navigator.onLine){
        const queued = await enqueue(userId, channelName, entityKey, eventType, payload, clientEventKey, generation);
        return queued
          ? { ok: true, queued: true, reason: 'offline', clientEventKey }
          : { ok: false, queued: false, reason: 'session_changed', clientEventKey };
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
    sessionGeneration += 1;
    const userId = event?.detail?.userId || lastKnownUserId || null;
    lastKnownUserId = null;
    purgeUser(userId).catch(error => console.warn('NUBYX Continuity queue purge failed', error));
  });
})();
