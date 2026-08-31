(() => {
  const MAX_SYNC_PAYLOAD_BYTES = 64 * 1024;
  const encoder = new TextEncoder();

  function measurePayload(payload){
    if(payload == null) return 2;
    if(typeof payload !== 'object' || Array.isArray(payload)){
      throw new TypeError('NUBYX sync payload must be a JSON object.');
    }
    const serialized = JSON.stringify(payload);
    if(typeof serialized !== 'string'){
      throw new TypeError('NUBYX sync payload must be JSON serializable.');
    }
    return encoder.encode(serialized).byteLength;
  }

  function install(){
    const continuity = window.NUBYX_CONTINUITY;
    if(!continuity || continuity.__payloadLimitInstalled || typeof continuity.publish !== 'function') return false;

    const publish = continuity.publish.bind(continuity);
    Object.defineProperty(continuity, '__payloadLimitInstalled', { value: true, enumerable: false });

    continuity.publish = async (channelName, entityKey, eventType = 'upsert', payload = {}, options = {}) => {
      const bytes = measurePayload(payload);
      if(bytes > MAX_SYNC_PAYLOAD_BYTES){
        window.dispatchEvent(new CustomEvent('nubyx:sync-payload-rejected', {
          detail: { channel: channelName, entityKey: String(entityKey || ''), bytes, maxBytes: MAX_SYNC_PAYLOAD_BYTES }
        }));
        return { ok: false, reason: 'payload_too_large', bytes, maxBytes: MAX_SYNC_PAYLOAD_BYTES };
      }
      return publish(channelName, entityKey, eventType, payload, options);
    };
    return true;
  }

  const installer = setInterval(() => {
    if(install()) clearInterval(installer);
  }, 100);
})();
