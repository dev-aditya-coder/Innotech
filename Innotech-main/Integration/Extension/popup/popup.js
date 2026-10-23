const defaults = { enabled: true, hideBelowCutoff: true, cutoff: 35 }; const $ = id => document.getElementById(id);
const enabled = $("enabled"), hide = $("hideBelowCutoff"), cutoff = $("cutoff"), value = $("cutoffValue"), status = $("status");
function render(s) { enabled.checked = !!s.enabled; hide.checked = !!s.hideBelowCutoff; cutoff.value = String(s.cutoff); value.textContent = `${s.cutoff}%`; status.textContent = s.enabled ? "ON" : "OFF"; status.classList.toggle("off", !s.enabled); hide.disabled = cutoff.disabled = !s.enabled; }
function save() { const s = { enabled: enabled.checked, hideBelowCutoff: hide.checked, cutoff: Number(cutoff.value) }; chrome.storage.local.set({ frictionLayerSearchSettings: s }, () => { render(s); chrome.tabs.query({ active: true, currentWindow: true }, tabs => { if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: "FL_SEARCH_SETTINGS_UPDATED", settings: s }, () => void chrome.runtime.lastError); }); }); }
chrome.storage.local.get(["frictionLayerSearchSettings", "frictionLayerHideCutoffDefaultV1"], d => { const s = { ...defaults, ...(d.frictionLayerSearchSettings || {}) }; if (!d.frictionLayerHideCutoffDefaultV1) { s.hideBelowCutoff = true; chrome.storage.local.set({ frictionLayerSearchSettings: s, frictionLayerHideCutoffDefaultV1: true }); } render(s); });
enabled.addEventListener("change", save); hide.addEventListener("change", save); cutoff.addEventListener("input", () => value.textContent = `${cutoff.value}%`); cutoff.addEventListener("change", save);

const feedDefaults = { enabled: false, blockedCategories: [] };
const categoryIds = { Study: "blockStudy", Gaming: "blockGaming", Music: "blockMusic", Sports: "blockSports", News: "blockNews", "Movies & TV": "blockMoviesTV", Technology: "blockTechnology", Entertainment: "blockEntertainment" };
function readFeedUI() { return { enabled: $("feedEnabled").checked, blockedCategories: Object.entries(categoryIds).filter(([, id]) => $(id).checked).map(([category]) => category) }; }
function renderFeed(s) { $("feedEnabled").checked = !!s.enabled; for (const [category, id] of Object.entries(categoryIds)) $(id).checked = (s.blockedCategories || []).includes(category); }
function saveFeed() { const s = readFeedUI(); chrome.storage.local.set({ frictionLayerFeedSettings: s }, () => { renderFeed(s); chrome.tabs.query({ active: true, currentWindow: true }, tabs => { if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: "FL_FEED_SETTINGS_UPDATED", settings: s }, () => void chrome.runtime.lastError); }); const btn = $("saveFeed"); btn.textContent = "Saved"; setTimeout(() => btn.textContent = "Save feed settings", 1200); }); }
chrome.storage.local.get("frictionLayerFeedSettings", d => renderFeed({ ...feedDefaults, ...(d.frictionLayerFeedSettings || {}) }));
$("saveFeed").addEventListener("click", saveFeed);


// Independent Videos / Shorts filter (separate from category-based Feed Filter).
const typeDefaults = { enabled: false, showVideos: true, showShorts: true };
function readTypeUI() { return { enabled: $("typeFilterEnabled").checked, showVideos: $("showVideos").checked, showShorts: $("showShorts").checked }; }
function renderType(s) { $("typeFilterEnabled").checked = !!s.enabled; $("showVideos").checked = s.showVideos !== false; $("showShorts").checked = s.showShorts !== false; }
function saveType() { const s = readTypeUI(); chrome.storage.local.set({ frictionLayerVideoTypeSettings: s }, () => { renderType(s); chrome.tabs.query({ active: true, currentWindow: true }, tabs => { if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: "FL_VIDEO_TYPE_SETTINGS_UPDATED", settings: s }, () => void chrome.runtime.lastError); }); const btn = $("saveTypeSettings"); btn.textContent = "Saved"; setTimeout(() => btn.textContent = "Save video type settings", 1200); }); }
chrome.storage.local.get("frictionLayerVideoTypeSettings", d => renderType({ ...typeDefaults, ...(d.frictionLayerVideoTypeSettings || {}) }));
$("saveTypeSettings").addEventListener("click", saveType);
$("typeFilterEnabled").addEventListener("change", saveType);
