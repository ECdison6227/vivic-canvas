/* Cross-device metadata sync and acknowledged display control. No account content or credentials are stored. */
(() => {
  'use strict';
  if (window.__vivicSpaceBridge) return;
  window.__vivicSpaceBridge = true;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const api = async (path, body) => {
    const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw Error('Vivic connection unavailable');
    return data;
  };
  let account = null, context = null, checking = false;
  const runtime = () => window.__vivicRemoteRuntime;
  const sleeping = () => document.documentElement.getAttribute('data-vivic-screensaver-active') === 'true';
  async function check() {
    if (checking || !runtime() || !document.querySelector('[data-vivic-command-input],.vivic-display-root')) return;
    checking = true;
    try {
      const session = await api('/api/space/session');
      if (!session.authenticated) { context?.stop(); context = null; account = null; return; }
      if (session.user.id !== account) { context?.stop(); account = session.user.id; context = start(account, session.device?.id); }
    } catch { /* Existing UI owns session errors. */ } finally { checking = false; }
  }
  function start(accountId, deviceId) {
    const tabId = crypto.randomUUID(), displayId = crypto.randomUUID();
    const channel = new BroadcastChannel('vivic-events-' + accountId);
    const candidates = new Map(); const seen = new Set(); let stopped = false, leader = false, streamAbort = null;
    let queued = true, refreshing = false;
    const post = message => channel.postMessage({ ...message, accountId });
    async function refresh() {
      if (!queued || refreshing || stopped) return;
      const config = runtime(); if (!config) return;
      refreshing = true;
      try {
        const host = await config.getControlHost(); const snapshot = host.getSnapshot();
        if (!snapshot.ready || snapshot.ownerMode !== 'owner' || !snapshot.activeCanvasId) return;
        const active = document.activeElement;
        if (active?.matches('input,textarea,select,[contenteditable=true]')) return;
        const meta = snapshot.canvases.find(item => item.id === snapshot.activeCanvasId);
        const cached = await config.createOwnerDB().getCanvas(snapshot.activeCanvasId);
        // A higher local version may still be in the autosave debounce or awaiting a receipt.
        // Preserve it and retry after the existing writer finishes; never advance its expected version.
        if (!cached || meta && meta.version > cached.version) return;
        const latest = await api('/api/space/spaces');
        const changed = latest.spaces.some(space => config.getOwnerServerVersion(space.id) !== space.version)
          || snapshot.canvases.some(canvas => !latest.spaces.some(space => space.id === canvas.id));
        if (!changed) { queued = false; return; }
        config.invalidateOwnerDB(); await host.refreshFromStorage(); queued = false;
      } catch { /* Keep pending drafts and retry; do not force a stale save. */ }
      finally { refreshing = false; }
    }
    async function presence() {
      if (stopped || location.pathname !== '/display') return;
      try {
        const host = await runtime().getControlHost(); const spaceId = new URLSearchParams(location.search).get('canvasId') || host.getSnapshot().activeCanvasId;
        if (spaceId) await api('/api/space/display/presence', { displayId, spaceId, sleeping: sleeping() });
      } catch { /* A disconnected display simply expires server-side. */ }
    }
    async function command(event) {
      if (location.pathname !== '/display' || event.displayId !== displayId || seen.has(event.commandId)) return;
      seen.add(event.commandId); if (seen.size > 100) seen.delete(seen.values().next().value);
      let ok = false;
      try {
        const host = await runtime().getControlHost();
        if (event.spaceId && host.getSnapshot().activeCanvasId !== event.spaceId && host.getSnapshot().ownerMode === 'owner') {
          host.switchCanvas(event.spaceId); await sleep(120);
        }
        if (event.spaceId && runtime().getDisplayRuntime && runtime().getDisplayStatus?.()?.canvasId !== event.spaceId) {
          const next = new URL(location.href); next.searchParams.set('canvasId', event.spaceId); history.replaceState(history.state, '', next);
          await runtime().getDisplayRuntime(event.spaceId);
        }
        queued = true; await refresh();
        if (event.command === 'sleep' || event.command === 'wake') {
          const desired = event.command === 'sleep';
          window.dispatchEvent(new CustomEvent('vivic:remote-screen', { detail: { sleeping: desired } }));
          const deadline = Date.now() + 1800;
          while (sleeping() !== desired && Date.now() < deadline) await sleep(40);
          ok = sleeping() === desired;
        } else if (event.command === 'focus') {
          window.dispatchEvent(new CustomEvent('vivic:remote-screen', { detail: { sleeping: false } }));
          if (host.getSnapshot().ownerMode === 'owner') {
            const result = host.dispatch({ schemaVersion: '0.6', requestId: event.commandId, canvasId: event.spaceId,
              actions: [{ type: 'card.focus', targetId: event.cardId }] }); ok = result.ok;
          } else {
            const readyBy = Date.now() + 1400;
            while (!runtime().getDisplayStatus?.()?.canInteract && Date.now() < readyBy) await sleep(40);
            ok = runtime().requestCardFocus(event.cardId);
          }
          if (ok) {
            const deadline = Date.now() + 1400;
            while (runtime().canvasStore?.getState().focus?.cardId !== event.cardId && Date.now() < deadline) await sleep(40);
            ok = runtime().canvasStore?.getState().focus?.cardId === event.cardId;
          }
        } else if (event.command === 'switch-space') ok = host.getSnapshot().activeCanvasId === event.spaceId;
      } catch { ok = false; }
      try { await api('/api/space/display/ack', { commandId: event.commandId, displayId, ok, sleeping: sleeping(),
        ...(ok ? {} : { message: '大屏暂时无法完成操作，请先处理电脑上未保存的修改。' }) }); } catch { /* Requester reports an unconfirmed result. */ }
      await presence();
    }
    function receive(event) {
      if (event.type === 'ready' || event.type === 'space.changed' && (!event.sourceDeviceId || event.sourceDeviceId !== deviceId)) { queued = true; void refresh(); }
      if (event.type === 'display.command' && event.spaceId && ['focus', 'switch-space'].includes(event.command)) {
        void (async () => { try {
          const host = await runtime().getControlHost();
          if (host.getSnapshot().ownerMode === 'owner' && host.getSnapshot().activeCanvasId !== event.spaceId) {
            queued = true; await refresh(); host.switchCanvas(event.spaceId);
          }
        } catch {} })();
      }
      if (event.type === 'display.command') void command(event);
    }
    async function stream() {
      if (streamAbort || stopped || !leader) return;
      const controller = new AbortController(); streamAbort = controller;
      try {
        const response = await fetch('/api/space/events', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/event-stream' }, signal: controller.signal });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
        while (!stopped && leader) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }); if (buffer.length > 131072) throw Error('stream-limit');
          let split;
          while ((split = buffer.indexOf('\n\n')) >= 0) {
            const packet = buffer.slice(0, split); buffer = buffer.slice(split + 2);
            const text = packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
            if (text) { const event = JSON.parse(text); receive(event); post({ kind: 'event', event }); }
          }
        }
      } catch { /* Reconnection is metadata-only; mutations are never replayed. */ }
      finally { if (streamAbort === controller) streamAbort = null; }
    }
    function election() {
      const now = Date.now(); candidates.set(tabId, now); post({ kind: 'candidate', tabId, at: now });
      for (const [id, at] of candidates) if (now - at > 6500) candidates.delete(id);
      const next = [...candidates.keys()].sort()[0] === tabId;
      if (!next && leader) streamAbort?.abort(); leader = next;
      if (leader) void stream();
    }
    channel.onmessage = ({ data }) => {
      if (data.accountId !== accountId || stopped) return;
      if (data.kind === 'candidate') candidates.set(data.tabId, data.at);
      if (data.kind === 'event') receive(data.event);
    };
    const timer = setInterval(() => { election(); void refresh(); }, 1500);
    const displayTimer = setInterval(presence, 3000);
    const screenChanged = () => void presence(); window.addEventListener('vivic:screensaver-change', screenChanged);
    setTimeout(election, 250); void presence();
    return { stop() { stopped = true; clearInterval(timer); clearInterval(displayTimer); streamAbort?.abort(); channel.close(); window.removeEventListener('vivic:screensaver-change', screenChanged); } };
  }
  window.addEventListener('vivic:runtime-ready', check);
  window.addEventListener('pageshow', check); window.addEventListener('focus', check);
  const timer = setInterval(check, 5000); window.addEventListener('pagehide', () => { clearInterval(timer); context?.stop(); }, { once: true });
  void check();
})();
