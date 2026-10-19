(() => {
  "use strict";
  const KEY = "frictionLayerVideoTypeSettings";
  const DEFAULTS = { enabled: false, showVideos: true, showShorts: true };
  const SHORTS_CARD_SELECTORS = ["ytd-reel-item-renderer"];
  const GENERAL_CARD_SELECTORS = ["ytd-rich-item-renderer", "ytd-video-renderer", "ytd-compact-video-renderer", "ytd-grid-video-renderer", "yt-lockup-view-model"];
  let settings = { ...DEFAULTS }, timer = null, processing = false;
  const isSearch = () => location.pathname === "/results";
  const isShortsPage = () => location.pathname.startsWith("/shorts/");
  function clearMarked() {
    document.querySelectorAll("[data-fl-type-processed], .fl-type-hidden").forEach(card => {
      card.classList.remove("fl-type-hidden");
      card.removeAttribute("data-fl-type-processed");
    });
    document.getElementById("fl-type-filter-style")?.remove();
  }

  // When the user chooses Videos only, disable YouTube's Shorts entry in
  // both the expanded and mini sidebar. This is independent of feed cards.
  const SHORTS_NAV_DISABLED_CLASS = "fl-shorts-nav-disabled";
  function videosOnly() {
    return settings.enabled && settings.showVideos && !settings.showShorts;
  }
  function ensureSidebarStyle() {
    if (document.getElementById("fl-shorts-nav-style")) return;
    const style = document.createElement("style");
    style.id = "fl-shorts-nav-style";
    style.textContent = `
      ytd-guide-entry-renderer.${SHORTS_NAV_DISABLED_CLASS},
      ytd-mini-guide-entry-renderer.${SHORTS_NAV_DISABLED_CLASS} { opacity: .38 !important; cursor: not-allowed !important; }
      ytd-guide-entry-renderer.${SHORTS_NAV_DISABLED_CLASS} a,
      ytd-mini-guide-entry-renderer.${SHORTS_NAV_DISABLED_CLASS} a { pointer-events: none !important; cursor: not-allowed !important; }
      ytd-guide-entry-renderer.${SHORTS_NAV_DISABLED_CLASS} #endpoint,
      ytd-mini-guide-entry-renderer.${SHORTS_NAV_DISABLED_CLASS} #endpoint { pointer-events: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  function shortsSidebarEntries() {
    return [...document.querySelectorAll("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer")]
      .filter(entry => {
        const link = entry.querySelector("a[href]");
        const href = (link?.getAttribute("href") || "").toLowerCase();
        const label = (entry.innerText || entry.textContent || "").trim().toLowerCase();
        return href.includes("/shorts") || label === "shorts" || label.startsWith("shorts\n");
      });
  }
  function applySidebarState() {
    const disable = videosOnly();
    if (disable) ensureSidebarStyle();
    shortsSidebarEntries().forEach(entry => {
      const link = entry.querySelector("a[href]");
      if (disable) {
        entry.classList.add(SHORTS_NAV_DISABLED_CLASS);
        entry.setAttribute("aria-disabled", "true");
        if (link) {
          if (!link.hasAttribute("data-fl-original-tabindex")) {
            link.setAttribute("data-fl-original-tabindex", link.getAttribute("tabindex") ?? "__none__");
          }
          link.setAttribute("tabindex", "-1");
          link.setAttribute("aria-disabled", "true");
        }
      } else {
        entry.classList.remove(SHORTS_NAV_DISABLED_CLASS);
        entry.removeAttribute("aria-disabled");
        if (link) {
          const originalTabindex = link.getAttribute("data-fl-original-tabindex");
          if (originalTabindex !== null) {
            if (originalTabindex === "__none__") link.removeAttribute("tabindex");
            else link.setAttribute("tabindex", originalTabindex);
            link.removeAttribute("data-fl-original-tabindex");
          }
          link.removeAttribute("aria-disabled");
        }
      }
    });
  }
  // pointer-events and tabindex prevent normal interaction; this capture guard
  // also blocks delegated click handlers used by YouTube's sidebar navigation.
  document.addEventListener("click", event => {
    if (!videosOnly()) return;
    const entry = event.target?.closest?.(`ytd-guide-entry-renderer.${SHORTS_NAV_DISABLED_CLASS}, ytd-mini-guide-entry-renderer.${SHORTS_NAV_DISABLED_CLASS}`);
    if (entry) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);
  function ensureStyle() {
    if (document.getElementById("fl-type-filter-style")) return;
    const style = document.createElement("style");
    style.id = "fl-type-filter-style";
    style.textContent = ".fl-type-hidden{display:none!important}";
    (document.head || document.documentElement).appendChild(style);
  }
  function isShortCard(card) {
    if (card.matches("ytd-reel-item-renderer")) return true;
    // YouTube marks Shorts destinations with /shorts/ links. Inspect links only
    // inside the candidate card so regular videos are not misclassified by page links.
    return !!card.querySelector('a[href^="/shorts/"], a[href*="youtube.com/shorts/"]');
  }
  function hideCard(card) {
    card.classList.add("fl-type-hidden");
    card.setAttribute("data-fl-type-processed", "1");
  }
  function process() {
    if (processing) return;
    processing = true;
    try {
      // Sidebar state is independent from feed-card filtering and is refreshed
      // on every YouTube SPA navigation / DOM update.
      applySidebarState();
      // Never interfere with YouTube search results or the Shorts player itself.
      if (isSearch() || isShortsPage() || !settings.enabled || (!settings.showVideos && !settings.showShorts)) {
        clearMarked();
        return;
      }
      ensureStyle();
      const seen = new Set();
      // Hide complete Shorts shelves when Shorts are not selected.
      if (!settings.showShorts) {
        document.querySelectorAll("ytd-rich-section-renderer, ytd-reel-shelf-renderer, ytd-reel-item-renderer").forEach(card => {
          const containsShorts = card.matches("ytd-reel-item-renderer, ytd-reel-shelf-renderer") || !!card.querySelector("ytd-reel-item-renderer, a[href^='/shorts/']");
          if (containsShorts && !seen.has(card)) { seen.add(card); hideCard(card); }
        });
      }
      // Classify regular cards independently. Only hide a card if its own content type is disallowed.
      document.querySelectorAll(GENERAL_CARD_SELECTORS.join(",")).forEach(card => {
        if (seen.has(card) || card.closest(".fl-type-hidden") || card.parentElement?.closest(GENERAL_CARD_SELECTORS.join(","))) return;
        seen.add(card);
        const shorts = isShortCard(card);
        if ((shorts && !settings.showShorts) || (!shorts && !settings.showVideos)) hideCard(card);
        else { card.classList.remove("fl-type-hidden"); card.removeAttribute("data-fl-type-processed"); }
      });
      // When showing Videos only, also remove any standalone Shorts renderer not nested in a card.
      if (!settings.showShorts) document.querySelectorAll(SHORTS_CARD_SELECTORS.join(",")).forEach(card => { if (!card.closest(".fl-type-hidden")) hideCard(card); });
    } finally { processing = false; }
  }
  function load() { chrome.storage.local.get(KEY, data => { settings = { ...DEFAULTS, ...(data[KEY] || {}) }; process(); }); }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) { settings = { ...DEFAULTS, ...(changes[KEY].newValue || {}) }; process(); }
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FL_VIDEO_TYPE_SETTINGS_UPDATED") { settings = { ...settings, ...(message.settings || {}) }; process(); sendResponse({ ok: true }); }
    return true;
  });
  function schedule() { clearTimeout(timer); timer = setTimeout(process, 180); }
  function init() {
    load();
    document.addEventListener("yt-navigate-finish", schedule);
    window.addEventListener("popstate", schedule);
    window.addEventListener("yt-page-data-updated", schedule);
    const observer = new MutationObserver(records => {
      const meaningful = records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && !node.matches?.("#fl-type-filter-style") && !node.closest?.("#fl-type-filter-style")));
      if (meaningful) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
