(() => {
  const MAX_SYNC_PAYLOAD_BYTES = 64 * 1024;
  const MAX_SYNC_PAYLOAD_DEPTH = 32;
  const MAX_SYNC_PAYLOAD_NODES = 4096;
  const BLOCKED_SYNC_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const encoder = new TextEncoder();

  function inspectPayload(payload){
    if(payload == null) return { ok: true, bytes: 2 };
    if(typeof payload !== 'object' || Array.isArray(payload)){
      return { ok: false, reason: 'payload_not_object' };
    }

    const seen = new WeakSet();
    const stack = [{ value: payload, depth: 1 }];
    let nodes = 0;

    while(stack.length){
      const { value, depth } = stack.pop();
      if(value == null || typeof value !== 'object') continue;
      if(depth > MAX_SYNC_PAYLOAD_DEPTH) return { ok: false, reason: 'payload_too_deep' };
      if(seen.has(value)) return { ok: false, reason: 'payload_cyclic' };
      seen.add(value);
      nodes += 1;
      if(nodes > MAX_SYNC_PAYLOAD_NODES) return { ok: false, reason: 'payload_too_complex' };

      for(const key of Object.keys(value)){
        if(BLOCKED_SYNC_KEYS.has(key)){
          return { ok: false, reason: 'payload_unsafe_key' };
        }
        const child = value[key];
        if(
          typeof child === 'undefined' ||
          typeof child === 'bigint' ||
          typeof child === 'function' ||
          typeof child === 'symbol' ||
          (typeof child === 'number' && !Number.isFinite(child))
        ){
          return { ok: false, reason: 'payload_not_json_safe' };
        }
        if(child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
      }
    }

    let serialized;
    try {
      serialized = JSON.stringify(payload);
    } catch {
      return { ok: false, reason: 'payload_not_json_safe' };
    }
    if(typeof serialized !== 'string') return { ok: false, reason: 'payload_not_json_safe' };

    const bytes = encoder.encode(serialized).byteLength;
    if(bytes > MAX_SYNC_PAYLOAD_BYTES){
      return { ok: false, reason: 'payload_too_large', bytes };
    }
    return { ok: true, bytes };
  }

  if(!window.NUBYX_SYNC_PAYLOAD_INSPECT){
    Object.defineProperty(window, 'NUBYX_SYNC_PAYLOAD_INSPECT', {
      value: inspectPayload,
      configurable: false,
      writable: false,
      enumerable: false
    });
  }

  function install(){
    const continuity = window.NUBYX_CONTINUITY;
    if(!continuity || continuity.__payloadLimitInstalled || typeof continuity.publish !== 'function') return false;

    const publish = continuity.publish.bind(continuity);
    Object.defineProperty(continuity, '__payloadLimitInstalled', { value: true, enumerable: false });

    continuity.publish = async (channelName, entityKey, eventType = 'upsert', payload = {}, options = {}) => {
      const inspection = inspectPayload(payload);
      if(!inspection.ok){
        window.dispatchEvent(new CustomEvent('nubyx:sync-payload-rejected', {
          detail: {
            channel: channelName,
            entityKey: String(entityKey || ''),
            reason: inspection.reason,
            bytes: inspection.bytes || null,
            maxBytes: MAX_SYNC_PAYLOAD_BYTES,
            maxDepth: MAX_SYNC_PAYLOAD_DEPTH,
            maxNodes: MAX_SYNC_PAYLOAD_NODES
          }
        }));
        return {
          ok: false,
          reason: inspection.reason,
          bytes: inspection.bytes || null,
          maxBytes: MAX_SYNC_PAYLOAD_BYTES
        };
      }
      return publish(channelName, entityKey, eventType, payload, options);
    };
    return true;
  }

  const installer = setInterval(() => {
    if(install()) clearInterval(installer);
  }, 100);
})();
