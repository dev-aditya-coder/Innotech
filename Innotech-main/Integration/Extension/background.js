// FrictionLayer v0.5.1 — fallback injection for the floating focus overlay.
// Static content-script registration remains enabled; the overlay's own guard
// prevents duplicate UI if this fallback runs on the same page.
const OVERLAY_FILE = 'content/focus-overlay.js';
const WEB_URL = /^https?:\/\//i;

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || !WEB_URL.test(details.url)) return;
  chrome.scripting.executeScript({
    target: { tabId: details.tabId },
    files: [OVERLAY_FILE],
    world: 'ISOLATED'
  }).catch(() => {
    // Some pages (Chrome internal pages, Web Store, restricted browser pages)
    // reject script injection. Those pages are intentionally unsupported.
  });
});

const WEBSITE_GOAL_CATEGORIES = {
  "Study & Learning": ["Study"],
  "Research & Projects": ["Study", "Technology", "News"],
  "Skill Development": ["Study", "Technology"],
  "General Focused Browsing": ["Study", "Technology"]
};

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // Accept messages only from the local development website.
  const senderHost = sender.url ? new URL(sender.url).hostname : "";
if (!["localhost", "127.0.0.1"].includes(senderHost)) {
    sendResponse({ ok: false, error: "Unapproved website origin" });
    return;
  }

  if (message?.type !== "FL_SYNC_PREFERENCES" || !message.preferences) {
    sendResponse({ ok: false, error: "Invalid message" });
    return;
  }

  const p = message.preferences;
  const cutoffs = { Relaxed: 30, Balanced: 60, Strict: 90 };
  const cutoff = cutoffs[p.strictness] ?? 35;
  const categories = WEBSITE_GOAL_CATEGORIES[p.goal] ?? ["Study"];

  const searchSettings = {
    enabled: p.intentFilter !== false,
    hideBelowCutoff: true,
    cutoff
  };

  const feedSettings = {
    enabled: p.recommendationFilter !== false,
    blockedCategories: categories
  };

  chrome.storage.local.set({
    frictionLayerWebsitePreferences: p,
    frictionLayerSearchSettings: searchSettings,
    frictionLayerFeedSettings: feedSettings
  }, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }

    // Update open search-engine tabs.
    chrome.tabs.query({
      url: [
        "https://www.google.com/*", "https://www.google.co.in/*",
        "https://www.google.co.uk/*", "https://www.google.ca/*",
        "https://www.google.com.au/*", "https://www.bing.com/*",
        "https://duckduckgo.com/*", "https://search.brave.com/*",
        "https://search.yahoo.com/*", "https://www.ecosia.org/*",
        "https://www.youtube.com/*"
      ]
    }, tabs => {
      for (const tab of tabs) {
        if (!tab.id) continue;

        chrome.tabs.sendMessage(tab.id, {
          type: "FL_SEARCH_SETTINGS_UPDATED",
          settings: searchSettings
        }, () => void chrome.runtime.lastError);

        if (tab.url?.includes("youtube.com")) {
          chrome.tabs.sendMessage(tab.id, {
            type: "FL_FEED_SETTINGS_UPDATED",
            settings: feedSettings
          }, () => void chrome.runtime.lastError);
        }
      }
    });

    sendResponse({ ok: true });
  });

  return true;
});


// Temporary focus-session customization. The existing user settings are snapshotted
// before the first session override and restored on completion or early end.
const TEMP_BASELINE_KEY = "frictionLayerPreFocusSettingsBaseline_v1";
const TEMP_GOAL_CATEGORIES = {
  "Study & Learning": ["Study"],
  "Research & Projects": ["Study", "Technology", "News"],
  "Skill Development": ["Study", "Technology"],
  "General Focused Browsing": ["Study", "Technology"]
};
const TEMP_CUTOFFS = { Relaxed: 30, Balanced: 60, Strict: 90 };
const FILTER_URLS = [
  "https://www.google.com/*", "https://www.google.co.in/*",
  "https://www.google.co.uk/*", "https://www.google.ca/*",
  "https://www.google.com.au/*", "https://www.bing.com/*",
  "https://duckduckgo.com/*", "https://search.brave.com/*",
  "https://search.yahoo.com/*", "https://www.ecosia.org/*",
  "https://www.youtube.com/*"
];

function broadcastFilterSettings(searchSettings, feedSettings) {
  chrome.tabs.query({ url: FILTER_URLS }, tabs => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "FL_SEARCH_SETTINGS_UPDATED", settings: searchSettings }, () => void chrome.runtime.lastError);
      if (tab.url?.includes("youtube.com")) {
        chrome.tabs.sendMessage(tab.id, { type: "FL_FEED_SETTINGS_UPDATED", settings: feedSettings }, () => void chrome.runtime.lastError);
      }
    }
  });
}

function restorePreFocusSettings() {
  chrome.storage.local.get([TEMP_BASELINE_KEY], result => {
    const baseline = result?.[TEMP_BASELINE_KEY];
    if (!baseline) return;
    const changes = {};
    if (baseline.searchSettings === undefined) changes.frictionLayerSearchSettings = null;
    else changes.frictionLayerSearchSettings = baseline.searchSettings;
    if (baseline.feedSettings === undefined) changes.frictionLayerFeedSettings = null;
    else changes.frictionLayerFeedSettings = baseline.feedSettings;
    if (baseline.websitePreferences === undefined) changes.frictionLayerWebsitePreferences = null;
    else changes.frictionLayerWebsitePreferences = baseline.websitePreferences;
    chrome.storage.local.remove(TEMP_BASELINE_KEY, () => {
      // Use set/remove separately so missing prior keys are truly removed.
      const setValues = {};
      for (const [key, value] of Object.entries(changes)) if (value !== null) setValues[key] = value;
      const removeKeys = Object.entries(changes).filter(([, value]) => value === null).map(([key]) => key);
      const finish = () => chrome.storage.local.get(["frictionLayerSearchSettings", "frictionLayerFeedSettings"], current => {
        broadcastFilterSettings(current.frictionLayerSearchSettings || { enabled: true, hideBelowCutoff: false, cutoff: 35 }, current.frictionLayerFeedSettings || { enabled: false, blockedCategories: [] });
      });
      const afterSet = () => removeKeys.length ? chrome.storage.local.remove(removeKeys, finish) : finish();
      if (Object.keys(setValues).length) chrome.storage.local.set(setValues, afterSet); else afterSet();
    });
  });
}

function applyTemporaryCustomization(customization) {
  const p = customization;
  if (!p || typeof p !== "object") return;
  chrome.storage.local.get([TEMP_BASELINE_KEY, "frictionLayerSearchSettings", "frictionLayerFeedSettings", "frictionLayerWebsitePreferences"], result => {
    if (!result[TEMP_BASELINE_KEY]) {
      const baseline = {};
      if (result.frictionLayerSearchSettings !== undefined) baseline.searchSettings = result.frictionLayerSearchSettings;
      if (result.frictionLayerFeedSettings !== undefined) baseline.feedSettings = result.frictionLayerFeedSettings;
      if (result.frictionLayerWebsitePreferences !== undefined) baseline.websitePreferences = result.frictionLayerWebsitePreferences;
      chrome.storage.local.set({ [TEMP_BASELINE_KEY]: baseline }, () => applyTemporaryCustomizationNow(p));
    } else applyTemporaryCustomizationNow(p);
  });
}

function applyTemporaryCustomizationNow(p) {
  const searchSettings = {
    enabled: p.intentFilter !== false,
    hideBelowCutoff: true,
    cutoff: TEMP_CUTOFFS[p.strictness] ?? 60
  };
  const feedSettings = {
    enabled: p.recommendationFilter !== false,
    blockedCategories: TEMP_GOAL_CATEGORIES[p.goal] ?? ["Study"]
  };
  chrome.storage.local.set({
    frictionLayerWebsitePreferences: p,
    frictionLayerSearchSettings: searchSettings,
    frictionLayerFeedSettings: feedSettings
  }, () => broadcastFilterSettings(searchSettings, feedSettings));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "FL_FOCUS_SESSION_STATE") return;
  const state = message.state;
  if (state && ["running", "paused"].includes(state.status) && state.customization) {
    applyTemporaryCustomization(state.customization);
  } else if (!state || state.status === "complete") {
    restorePreFocusSettings();
  }

  // The floating overlay may be on a different tab from the website's timer.
  // Relay every session update through the service worker to all open tabs so
  // the focus page can stop/reset when End is clicked in the overlay.
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, {
        type: "FL_FOCUS_SESSION_SYNC",
        state: state ? { ...state } : null
      }, () => void chrome.runtime.lastError);
    }
  });
  sendResponse?.({ ok: true });
  return true;
});
