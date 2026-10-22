(() => {
  if (window.__frictionLayerFocusOverlayLoaded) return;
  window.__frictionLayerFocusOverlayLoaded = true;

  const STORAGE_KEY = 'flFocusOverlaySession_v1';
  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.info('[FrictionLayer Focus]', ...args); };
  const PAGE_SOURCE = 'frictionlayer-focus-session';
  const OVERLAY_SOURCE = 'frictionlayer-focus-overlay';
  let session = null;
  let host = null;
  let shadow = null;
  let tick = null;

  const validState = (s) => s && ['running', 'paused', 'complete'].includes(s.status)
    && Number.isFinite(Number(s.durationMinutes)) && Number(s.durationMinutes) > 0;

  function remainingMs(s = session) {
    if (!s) return 0;
    if (s.status === 'running') return Math.max(0, Number(s.endAt || 0) - Date.now());
    return Math.max(0, Number(s.remainingMs || 0));
  }
  function fmt(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function postControl(next) {
    window.postMessage({ source: OVERLAY_SOURCE, type: 'state', state: next }, '*');
  }
  function sendToPage(next) {
    window.postMessage({ source: OVERLAY_SOURCE, type: 'state', state: next }, '*');
  }
  function ensureUI() {
    if (host || !document.documentElement) return;
    host = document.createElement('div');
    host.id = 'frictionlayer-focus-overlay-host';
    host.style.cssText = 'all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647;';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{all:initial} *{box-sizing:border-box}
        .panel{width:258px;background:#0b1728;color:#eaf2ff;border:1px solid rgba(94,234,212,.38);border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.38);font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden;}
        .top{display:flex;align-items:center;gap:8px;padding:12px 13px 8px;}
        .logo{width:24px;height:24px;border-radius:8px;background:#123a42;display:grid;place-items:center;color:#5eead4;font-weight:800;font-size:15px}
        .brand{font-weight:750;letter-spacing:.1px;flex:1}.minimize{border:0;background:transparent;color:#9eafc5;font-size:18px;cursor:pointer;padding:2px 4px}
        .meta{padding:0 14px;color:#9eafc5;font-size:11px;letter-spacing:.6px;text-transform:uppercase}
        .time{font-size:38px;font-weight:750;letter-spacing:-1.5px;text-align:center;color:#5eead4;padding:6px 0 0;font-variant-numeric:tabular-nums}
        .status{text-align:center;color:#b7c6d9;font-size:11px;padding-bottom:12px}
        .actions{display:flex;gap:8px;padding:0 12px 12px}
        button.action{flex:1;border:1px solid #33465e;border-radius:9px;background:#16263b;color:#eaf2ff;padding:9px 8px;font:600 12px system-ui;cursor:pointer}
        button.primary{background:#0f766e;border-color:#14b8a6;color:white}button.action:focus-visible,.minimize:focus-visible{outline:2px solid #5eead4;outline-offset:2px}
        .bar{height:3px;background:#1e3346}.bar span{display:block;height:100%;background:#14b8a6;transition:width .25s linear}
        .collapsed{width:176px}.collapsed .details{display:none}.collapsed .top{padding-bottom:12px}
        .complete .time{font-size:23px;letter-spacing:0;padding:12px 8px 4px;color:#5eead4}
        .complete .status{padding-bottom:12px}
      </style>
      <section class="panel" role="region" aria-label="FrictionLayer floating focus timer">
        <div class="top"><span class="logo">F</span><span class="brand">FrictionLayer Focus</span><button class="minimize" aria-label="Minimize timer" title="Minimize">−</button></div>
        <div class="details"><div class="meta"></div><div class="time" aria-live="off">25:00</div><div class="status">SESSION IN PROGRESS</div>
          <div class="actions"><button class="action primary toggle">Pause</button><button class="action end">End</button></div><div class="bar"><span></span></div>
        </div>
      </section>`;
    (document.documentElement || document.body).appendChild(host);
    log('Overlay host mounted on', location.origin);
    shadow.querySelector('.minimize').addEventListener('click', () => {
      const panel = shadow.querySelector('.panel');
      const collapsed = panel.classList.toggle('collapsed');
      shadow.querySelector('.minimize').textContent = collapsed ? '+' : '−';
      shadow.querySelector('.minimize').setAttribute('aria-label', collapsed ? 'Expand timer' : 'Minimize timer');
    });
    shadow.querySelector('.toggle').addEventListener('click', toggleSession);
    shadow.querySelector('.end').addEventListener('click', endSession);
  }
  function render() {
    if (!session || !['running', 'paused', 'complete'].includes(session.status)) {
      if (host) host.remove();
      host = null; shadow = null;
      if (tick) clearInterval(tick);
      tick = null;
      return;
    }
    ensureUI();
    if (!shadow) return;
    const panel = shadow.querySelector('.panel');
    const left = remainingMs();
    const duration = Math.max(1, Number(session.durationMinutes) * 60000);
    const running = session.status === 'running';
    const complete = session.status === 'complete';
    panel.classList.toggle('complete', complete);
    shadow.querySelector('.meta').textContent = session.activity || 'Focus session';
    shadow.querySelector('.time').textContent = complete ? 'Session complete' : fmt(left);
    shadow.querySelector('.status').textContent = complete ? 'Well done. Take a breath.' : running ? 'FOCUS SESSION IN PROGRESS' : 'SESSION PAUSED';
    shadow.querySelector('.toggle').textContent = running ? 'Pause' : 'Resume';
    shadow.querySelector('.toggle').disabled = complete;
    shadow.querySelector('.end').textContent = complete ? 'Dismiss' : 'End session';
    shadow.querySelector('.bar span').style.width = `${Math.max(0, Math.min(100, (left / duration) * 100))}%`;
    if (tick) clearInterval(tick);
    tick = null;
    if (running) tick = setInterval(checkExpiry, 250);
  }
  function persist(next, syncPage = true) {
    session = next;
    if (session) chrome.storage.local.set({ [STORAGE_KEY]: session });
    else chrome.storage.local.remove(STORAGE_KEY);
    // The service worker applies the session customization temporarily and restores
    // the user's previous filter settings when this session completes or is ended.
    chrome.runtime.sendMessage({ type: 'FL_FOCUS_SESSION_STATE', state: session ? { ...session } : null }, () => void chrome.runtime.lastError);
    if (syncPage) sendToPage(session ? { ...session } : null);
    render();
  }
  function checkExpiry() {
    if (!session || session.status !== 'running') return;
    if (remainingMs() <= 0) {
      session = { ...session, status: 'complete', remainingMs: 0, completedAt: Date.now() };
      // Keep customization only for the active session, never in completed state.
      delete session.customization;
      persist(session);
    } else if (shadow) {
      shadow.querySelector('.time').textContent = fmt(remainingMs());
      const duration = Math.max(1, Number(session.durationMinutes) * 60000);
      shadow.querySelector('.bar span').style.width = `${Math.max(0, Math.min(100, (remainingMs() / duration) * 100))}%`;
    }
  }
  function toggleSession() {
    if (!session || session.status === 'complete') return;
    if (session.status === 'running') {
      const left = remainingMs();
      persist({ ...session, status: 'paused', remainingMs: left, endAt: null });
    } else {
      const left = Math.max(0, Number(session.remainingMs || 0));
      persist({ ...session, status: 'running', remainingMs: left, endAt: Date.now() + left });
    }
  }
  function endSession() {
    if (!session) return;
    if (session.status !== 'complete' && !window.confirm('End this focus session?')) return;
    // Explicitly tell the website to stop/reset its own timer before clearing
    // extension state and restoring the user's normal filtering preferences.
    window.postMessage({ source: OVERLAY_SOURCE, type: 'end-session' }, '*');
    persist(null);
  }
  // Receive session updates relayed by the service worker. This is what lets
  // an overlay on another tab control the timer on the FrictionLayer website.
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'FL_FOCUS_SESSION_SYNC') return;
    window.postMessage({
      source: OVERLAY_SOURCE,
      type: 'state',
      state: message.state ? { ...message.state } : null
    }, '*');
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== PAGE_SOURCE || event.data.type !== 'state') return;
    const incoming = event.data.state;
    if (validState(incoming)) {
      log('Received focus session from FrictionLayer website', incoming.status);
      const normalized = { ...incoming };
      if (normalized.status === 'running' && !Number.isFinite(Number(normalized.endAt))) {
        normalized.endAt = Date.now() + Math.max(0, Number(normalized.remainingMs || 0));
      }
      persist(normalized, false);
    } else if (incoming === null) {
      persist(null, false);
    }
  });
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    const stored = result && result[STORAGE_KEY];
    if (validState(stored)) {
      log('Restored saved focus session', stored.status);
      session = stored;
      render();
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue;
    session = validState(next) ? next : null;
    render();
  });
})();
