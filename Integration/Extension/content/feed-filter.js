(() => {
  "use strict";
  const KEY = "frictionLayerFeedSettings";
  const DEFAULTS = { enabled: false, blockedCategories: [] };
  const CARD_SELECTORS = [
    "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-compact-video-renderer",
    "ytd-grid-video-renderer", "ytd-reel-item-renderer", "yt-lockup-view-model"
  ];
  // These are transparent keyword heuristics, not semantic/AI classification.
  const CATEGORY_TERMS = {
    Study: ["study", "studying", "learn", "learning", "lecture", "tutorial", "lesson", "course", "education", "exam", "revision", "notes", "textbook", "homework", "assignment", "class", "school", "college lecture", "explained", "how to solve", "problem solving"],
    Gaming: ["gaming", "gameplay", "walkthrough", "game review", "video game", "pc gaming", "playstation", "xbox", "nintendo", "minecraft", "fortnite", "valorant", "roblox", "gta", "steam game", "boss fight", "speedrun", "lets play", "let's play", "game trailer", "esports"],
    Music: ["music", "song", "songs", "official audio", "official music video", "music video", "lyrics", "lyric video", "live performance", "concert", "album", "singer", "singing", "cover song", "instrumental", "remix", "dj set", "playlist", "acoustic"],
    Sports: ["sports", "football", "soccer", "cricket", "basketball", "tennis", "badminton", "formula 1", "f1", "match highlights", "sports highlights", "goal", "wicket", "ipl", "nba", "olympics", "training", "workout"],
    News: ["news", "breaking news", "current affairs", "politics", "election", "headline", "press conference", "world news", "latest update", "news report", "geopolitics"],
    "Movies & TV": ["movie", "film", "film trailer", "movie trailer", "tv show", "web series", "episode", "cinema", "official trailer", "review movie", "recap", "anime", "cartoon", "netflix", "disney", "marvel", "dc universe"],
    Technology: ["technology", "tech", "programming", "coding", "software", "hardware", "javascript", "python", "web development", "artificial intelligence", "ai tools", "machine learning", "gadgets", "smartphone", "laptop", "developer", "computer science"],
    Entertainment: ["entertainment", "funny", "comedy", "reaction", "celebrity", "gossip", "prank", "challenge", "meme", "vlog", "reality show", "stand up", "behind the scenes", "talk show", "variety show"]
  };
  let settings = { ...DEFAULTS }, timer = null, running = false;
  const norm = s => (s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  function titleOf(card) {
    const el = card.querySelector("#video-title, a#video-title, h3 a, yt-formatted-string#video-title, a[title]");
    return (el?.getAttribute("title") || el?.textContent || el?.getAttribute("aria-label") || "").trim();
  }
  function contentText(card) {
    return norm([
      titleOf(card),
      card.querySelector("#channel-name, ytd-channel-name, .ytd-channel-name, yt-content-metadata-view-model")?.textContent || "",
      card.querySelector("#description-text, .metadata-snippet-text, yt-formatted-string#description-text")?.textContent || ""
    ].join(" "));
  }
  // Selected categories are an ALLOWLIST: only matching feed cards remain visible.
  function matchingAllowRules(text) {
    const matches = [];
    for (const category of settings.blockedCategories || []) {
      const terms = CATEGORY_TERMS[category] || [];
      if (terms.some(term => text.includes(norm(term)))) matches.push(category);
    }
    return matches;
  }
  function hasAllowRules() {
    return (settings.blockedCategories || []).length > 0;
  }
  function clearCard(card) {
    card.classList.remove("fl-feed-hidden");
    card.querySelectorAll(".fl-feed-badge-host").forEach(n => n.remove());
    card.removeAttribute("data-fl-feed-processed");
    card.removeAttribute("data-fl-feed-reason");
  }
  function process() {
    if (running) return;
    running = true;
    try {
      // Keep YouTube Search exclusively under the separate Search Filter.
      if (location.pathname === "/results") {
        // YouTube Search belongs to Search Filter only. Clean up any feed state left
        // behind during YouTube's SPA navigation, including cards whose marker changed.
        document.querySelectorAll("[data-fl-feed-processed], .fl-feed-hidden").forEach(clearCard);
        document.getElementById("fl-feed-status")?.remove();
        return;
      }
      if (!settings.enabled || !hasAllowRules()) {
        document.querySelectorAll("[data-fl-feed-processed]").forEach(clearCard);
        document.getElementById("fl-feed-status")?.remove();
        return;
      }
      const seen = new Set();
      for (const selector of CARD_SELECTORS) {
        document.querySelectorAll(selector).forEach(card => {
          if (seen.has(card) || card.closest("#fl-feed-status")) return;
          if (card.parentElement?.closest(CARD_SELECTORS.join(","))) return;
          seen.add(card);
          const text = contentText(card);
          const matches = matchingAllowRules(text);
          const shouldShow = matches.length > 0;
          const reason = shouldShow ? matches.join(" | ") : "not in selected categories/keywords";
          if (card.getAttribute("data-fl-feed-processed") === "1" &&
              card.getAttribute("data-fl-feed-reason") === reason) return;
          clearCard(card);
          card.setAttribute("data-fl-feed-processed", "1");
          card.setAttribute("data-fl-feed-reason", reason);
          if (!shouldShow) card.classList.add("fl-feed-hidden");
        });
      }
      ensureStyles();
      updateStatus(seen.size);
    } finally { running = false; }
  }
  function ensureStyles() {
    if (document.getElementById("fl-feed-styles")) return;
    const style = document.createElement("style");
    style.id = "fl-feed-styles";
    style.textContent = `
      .fl-feed-hidden{display:none!important}
      #fl-feed-status{position:relative;z-index:1;display:flex;gap:8px;align-items:center;justify-content:space-between;margin:8px 0;padding:9px 12px;border:1px solid #2dd4bf66;border-radius:10px;background:#0b1724;color:#e2e8f0;font:12px/1.4 system-ui,sans-serif}
      #fl-feed-status strong{color:#5eead4}
      #fl-feed-status button{border:1px solid #2dd4bf66;border-radius:7px;padding:5px 8px;background:#122b3a;color:#99f6e4;cursor:pointer;font-weight:600}
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  function updateStatus(count) {
    let banner = document.getElementById("fl-feed-status");
    // Place the banner inside the feed column. (A comma selector list returns the first match in
    // document order, which is <ytd-app> itself, putting the banner above YouTube's header/search bar.)
    const root = ["ytd-browse:not([hidden]) #primary", "ytd-browse:not([hidden]) #contents", "ytd-browse:not([hidden])"]
      .map(sel => document.querySelector(sel)).find(Boolean);
    if (!root) { banner?.remove(); return; }
    if (banner && banner.parentElement !== root) { banner.remove(); banner = null; }
    if (!banner) { banner = document.createElement("div"); banner.id = "fl-feed-status"; root.prepend(banner); }
    const hidden = document.querySelectorAll(".fl-feed-hidden").length;
    const categories = (settings.blockedCategories || []).join(", ") || "none";
    banner.replaceChildren();
    const text = document.createElement("span");
    const strong = document.createElement("strong"); strong.textContent = "FrictionLayer Feed Filter";
    text.append(strong, document.createTextNode(` · Showing only: ${categories} · ${hidden} hidden of ${count} scanned`));
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Restore feed";
    button.addEventListener("click", () => { document.querySelectorAll("[data-fl-feed-processed]").forEach(clearCard); banner.remove(); }, { once: true });
    banner.append(text, button);
  }
  function load() {
    chrome.storage.local.get(KEY, data => { settings = { ...DEFAULTS, ...(data[KEY] || {}) }; process(); });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) { settings = { ...DEFAULTS, ...(changes[KEY].newValue || {}) }; process(); }
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FL_FEED_SETTINGS_UPDATED") { settings = { ...settings, ...(message.settings || {}) }; process(); sendResponse({ ok: true }); }
    else if (message?.type === "FL_FEED_REPROCESS") { process(); sendResponse({ ok: true }); }
    return true;
  });
  function init() {
    load();
    const routeChanged = () => { clearTimeout(timer); timer = setTimeout(process, 120); };
    document.addEventListener("yt-navigate-finish", routeChanged);
    window.addEventListener("popstate", routeChanged);
    window.addEventListener("yt-page-data-updated", routeChanged);
    const observer = new MutationObserver(records => {
      const meaningful = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => {
        if (node.nodeType !== 1) return false;
        return !node.closest?.("#fl-feed-status") && !node.matches?.("#fl-feed-status, #fl-feed-styles");
      }));
      if (meaningful) { clearTimeout(timer); timer = setTimeout(process, 350); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
