(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const KEY = "frictionLayerFocusSession_v1";
  const FULL_CIRCLE = 2 * Math.PI * 126;
  const ring = $("#timer-ring-progress");
  const timeNode = $("#timer-time");
  const statusNode = $("#timer-status");
  const subtitleNode = $("#timer-subtitle");
  const activityTag = $("#timer-activity-tag");
  const pauseButton = $("#timer-pause");
  const pauseLabel = $("#pause-label");
  const pauseIcon = $("#pause-icon");
  const endButton = $("#timer-end");
  const startButton = $("#focus-start");
  const customField = $("#custom-duration-field");
  const customInput = $("#custom-minutes");
  const footerText = $("#timer-footer-text");
  const remainingLabel = $("#timer-remaining-label");
  const liveDot = $("#timer-live-dot");
  let selectedMinutes = 25;
  let selectedActivity = "Study";
  let state = readState();
  let tickHandle = null;

  if (ring) {
    ring.style.strokeDasharray = String(FULL_CIRCLE);
    ring.style.strokeDashoffset = "0";
  }
  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
    catch { return null; }
  }
  function broadcastState() {
    // The companion Chrome extension listens for this event and displays the floating timer.
    // Website/extension integration uses a small, explicit postMessage protocol.
    window.postMessage({ source: "frictionlayer-focus-session", type: "state", state: state ? { ...state } : null }, "*");
  }
  function saveState() {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
    broadcastState();
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "frictionlayer-focus-overlay") return;
    // The overlay sends an explicit end command so the website timer is reset
    // immediately, even if an extension storage update races with the page sync.
    if (event.data.type !== "state" && event.data.type !== "end-session") return;
    const incoming = event.data.type === "end-session" ? null : event.data.state;
    if (incoming && ["running", "paused", "complete"].includes(incoming.status)) {
      state = { ...incoming };
      localStorage.setItem(KEY, JSON.stringify(state));
      selectedMinutes = state.customDuration ? 0 : Number(state.durationMinutes || selectedMinutes);
      selectedActivity = state.activity || selectedActivity;
      setSelectionButtons();
      if (state.status === "running") startTicking();
      else { if (tickHandle) clearInterval(tickHandle); tickHandle = null; }
      updateDisplay();
    } else if (incoming === null) {
      state = null;
      localStorage.removeItem(KEY);
      if (tickHandle) clearInterval(tickHandle);
      tickHandle = null;
      startButton.disabled = false;
      pauseButton.disabled = true;
      endButton.disabled = true;
      statusNode.textContent = "SESSION ENDED";
      subtitleNode.textContent = "Ready for your next session?";
      liveDot.classList.remove("is-running", "is-paused");
      timeNode.textContent = fmt((selectedMinutes || Number(customInput.value) || 40) * 60_000);
      ring.style.strokeDashoffset = "0";
      footerText.textContent = "Session ended. You can start again whenever you're ready.";
      startButton.textContent = "Start focus session ↗";
      activityTag.textContent = selectedActivity.toUpperCase();
      remainingLabel.textContent = `${selectedMinutes || Number(customInput.value) || 40} minutes planned`;
    }
  });
  function fmt(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  function durationMs() { return (state?.durationMinutes || selectedMinutes) * 60_000; }
  function remainingMs() {
    if (!state) return selectedMinutes * 60_000;
    if (state.status === "running") return Math.max(0, state.endAt - Date.now());
    return Math.max(0, state.remainingMs ?? state.durationMinutes * 60_000);
  }
  function setSelectionButtons() {
    $$(".duration-option").forEach(btn => {
      const selected = btn.dataset.minutes === "custom" ? selectedMinutes === 0 : Number(btn.dataset.minutes) === selectedMinutes;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", String(selected));
    });
    $$(".activity-option").forEach(btn => {
      const selected = btn.dataset.activity === selectedActivity;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", String(selected));
    });
    customField.hidden = selectedMinutes !== 0;
  }
  function updateDisplay() {
    if (!timeNode || !state) return;
    let left = remainingMs();
    if (state.status === "running" && left <= 0) {
      state.status = "complete";
      state.remainingMs = 0;
      state.completedAt = Date.now();
      // Session-only choices must not remain attached to a completed timer.
      delete state.customization;
      saveState();
      left = 0;
      if (tickHandle) clearInterval(tickHandle);
      tickHandle = null;
    }
    const duration = durationMs();
    timeNode.textContent = fmt(left);
    const progress = duration > 0 ? Math.min(1, Math.max(0, left / duration)) : 1;
    ring.style.strokeDashoffset = String(FULL_CIRCLE * (1 - progress));
    activityTag.textContent = (state.activity || "Study").toUpperCase();
    remainingLabel.textContent = `${state.durationMinutes} minute${state.durationMinutes === 1 ? "" : "s"} planned`;
    const running = state.status === "running";
    const paused = state.status === "paused";
    const ready = state.status === "ready";
    const complete = state.status === "complete";
    statusNode.textContent = running ? "SESSION IN PROGRESS" : paused ? "SESSION PAUSED" : complete ? "SESSION COMPLETE" : "READY WHEN YOU ARE";
    subtitleNode.textContent = running ? "Stay with the moment" : paused ? "Take your time" : complete ? "You made time for what matters." : "Ready to begin";
    liveDot.classList.toggle("is-running", running);
    liveDot.classList.toggle("is-paused", paused);
    pauseButton.disabled = !(running || paused);
    pauseLabel.textContent = paused ? "Resume" : "Pause";
    pauseIcon.textContent = paused ? "▶" : "Ⅱ";
    endButton.disabled = !(running || paused || ready);
    startButton.textContent = running ? "Session in progress" : paused ? "Resume focus session" : complete ? "Start another session" : "Start focus session ↗";
    startButton.disabled = running;
    footerText.textContent = running ? "You're doing great. Keep going." : paused ? "Paused — resume when ready." : complete ? "Session complete. Take a breath." : "Your time, your terms.";
    $("#timer-pause").setAttribute("aria-label", paused ? "Resume focus session" : "Pause focus session");
    if (complete) {
      footerText.textContent = `Completed ${state.durationMinutes} minutes of ${state.activity || "focus"}.`;
      startButton.disabled = false;
    }
  }
  function startTicking() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = window.setInterval(updateDisplay, 250);
  }
  function startSession() {
    let minutes = selectedMinutes;
    if (minutes === 0) {
      minutes = Number(customInput.value);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
        customInput.setCustomValidity("Choose a duration from 1 to 180 minutes.");
        customInput.reportValidity();
        return;
      }
      customInput.setCustomValidity("");
    }
    let customization = null;
    try {
      const draft = JSON.parse(sessionStorage.getItem("frictionLayerFocusCustomizationDraft_v1") || "null");
      if (draft && Date.now() - Number(draft.createdAt || 0) < 6 * 60 * 60 * 1000) customization = draft;
      sessionStorage.removeItem("frictionLayerFocusCustomizationDraft_v1");
    } catch {
      sessionStorage.removeItem("frictionLayerFocusCustomizationDraft_v1");
    }
    state = { status: "running", durationMinutes: minutes, customDuration: selectedMinutes === 0, activity: selectedActivity, customization, startedAt: Date.now(), endAt: Date.now() + minutes * 60_000, remainingMs: minutes * 60_000 };
    saveState();
    startTicking();
    updateDisplay();
  }
  $$(".duration-option").forEach(btn => btn.addEventListener("click", () => {
    if (state && ["running", "paused"].includes(state.status)) return;
    if (btn.dataset.minutes === "custom") selectedMinutes = 0;
    else selectedMinutes = Number(btn.dataset.minutes);
    setSelectionButtons();
    timeNode.textContent = fmt((selectedMinutes || Number(customInput.value) || 40) * 60_000);
    remainingLabel.textContent = `${selectedMinutes || Number(customInput.value) || 40} minutes planned`;
  }));
  customInput.addEventListener("input", () => {
    if (selectedMinutes === 0 && !(state && ["running", "paused"].includes(state.status))) {
      const n = Math.min(180, Math.max(1, Number(customInput.value) || 1));
      timeNode.textContent = fmt(n * 60_000);
      remainingLabel.textContent = `${n} minutes planned`;
    }
  });
  $$(".activity-option").forEach(btn => btn.addEventListener("click", () => {
    if (state && ["running", "paused"].includes(state.status)) return;
    selectedActivity = btn.dataset.activity;
    setSelectionButtons();
  }));
  startButton.addEventListener("click", () => {
    if (state?.status === "paused") {
      state.status = "running";
      state.endAt = Date.now() + state.remainingMs;
      saveState(); startTicking(); updateDisplay();
    } else startSession();
  });
  pauseButton.addEventListener("click", () => {
    if (!state) return;
    if (state.status === "running") {
      state.remainingMs = Math.max(0, state.endAt - Date.now());
      state.status = "paused";
      saveState();
      if (tickHandle) clearInterval(tickHandle);
      tickHandle = null;
    } else if (state.status === "paused") {
      state.status = "running";
      state.endAt = Date.now() + state.remainingMs;
      saveState(); startTicking();
    }
    updateDisplay();
  });
  endButton.addEventListener("click", () => {
    if (!state) return;
    const active = ["running", "paused"].includes(state.status);
    if (active && !window.confirm("End this focus session now?")) return;
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    state = null;
    saveState();
    startButton.disabled = false;
    pauseButton.disabled = true;
    endButton.disabled = true;
    statusNode.textContent = "SESSION ENDED";
    subtitleNode.textContent = "Ready for your next session?";
    liveDot.classList.remove("is-running", "is-paused");
    timeNode.textContent = fmt((selectedMinutes || Number(customInput.value) || 40) * 60_000);
    ring.style.strokeDashoffset = "0";
    footerText.textContent = "Session ended. You can start again whenever you're ready.";
    startButton.textContent = "Start focus session ↗";
    activityTag.textContent = selectedActivity.toUpperCase();
    remainingLabel.textContent = `${selectedMinutes || Number(customInput.value) || 40} minutes planned`;
  });
  // Restore an active session on reload; the end timestamp keeps the countdown accurate in background tabs.
  if (state && ["running", "paused"].includes(state.status)) {
    selectedMinutes = state.customDuration ? 0 : state.durationMinutes;
    selectedActivity = state.activity || "Study";
    setSelectionButtons();
    if (state.status === "running") startTicking();
    updateDisplay();
  } else {
    if (state?.status === "complete") state = null;
    setSelectionButtons();
    timeNode.textContent = fmt(selectedMinutes * 60_000);
    updateDisplay();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateDisplay(); });
})();
