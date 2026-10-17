/**
 * Friction Layer - Persistent Settings Module (core/settings.js)
 * Manages configuration, deep validation, schema recovery, and chrome.storage.local persistence.
 * Zero external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrictionLayer = root.FrictionLayer || {};
    root.FrictionLayer.Settings = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'friction_layer_settings_v1';
  const CACHE_KEY = 'friction_layer_cache_v1';

  /**
   * Complete default settings schema.
   */
  const DEFAULT_SETTINGS = Object.freeze({
    version: 1,
    enabled: true,
    search: Object.freeze({
      enabled: true,
      threshold: 45,
      scoringMode: 'local', // 'local' | 'semantic'
      semanticEndpoint: '',
      supportedDomains: ['www.google.com', 'google.com']
    }),
    recommendations: Object.freeze({
      enabled: false,
      strategy: 'keywords', // 'keywords' | 'topics' | 'combined'
      blockedKeywords: [],
      blockedTopics: [],
      allowedChannels: [],
      allowedTopics: [],
      focusMode: false
    }),
    quality: Object.freeze({
      enabled: true,
      signals: Object.freeze({
        metadataCompleteness: true,
        relevance: true,
        duplicateDetection: true,
        sourceSignals: true
      }),
      minimumEvidence: 2,
      sortResults: false
    }),
    security: Object.freeze({
      enabled: true,
      showExplanations: true,
      mode: 'heuristic' // 'heuristic' | 'strict'
    }),
    clutter: Object.freeze({
      enabled: false,
      hideSponsored: true,
      hideOverlays: false,
      reduceSidebars: false
    }),
    appearance: Object.freeze({
      theme: 'system', // 'system' | 'dark' | 'light'
      perSiteBehavior: true
    }),
    privacy: Object.freeze({
      semanticScoringEnabled: false,
      securityLookupEnabled: false
    })
  });

  /**
   * Deep clone helper.
   */
  function clone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(clone);
    const out = {};
    for (const key of Object.keys(obj)) {
      out[key] = clone(obj[key]);
    }
    return out;
  }

  /**
   * Deep merge source into target.
   */
  function deepMerge(target, source) {
    const result = clone(target);
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return result;
    }

    for (const key of Object.keys(source)) {
      const srcVal = source[key];
      if (srcVal === undefined) continue;

      if (
        srcVal !== null &&
        typeof srcVal === 'object' &&
        !Array.isArray(srcVal) &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], srcVal);
      } else if (Array.isArray(srcVal)) {
        result[key] = srcVal.map(clone);
      } else {
        result[key] = srcVal;
      }
    }
    return result;
  }

  /**
   * Validates and repairs settings object against schema constraints.
   * Recovers safely from missing, malformed, or outdated keys.
   * @param {any} raw
   * @returns {object} validated clean settings
   */
  function validateSettings(raw) {
    const def = clone(DEFAULT_SETTINGS);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return def;
    }

    const merged = deepMerge(def, raw);

    // Root flags
    merged.version = 1;
    merged.enabled = typeof merged.enabled === 'boolean' ? merged.enabled : def.enabled;

    // Search validation
    if (typeof merged.search !== 'object' || merged.search === null) merged.search = clone(def.search);
    merged.search.enabled = typeof merged.search.enabled === 'boolean' ? merged.search.enabled : def.search.enabled;
    
    let threshold = Number(merged.search.threshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      threshold = def.search.threshold;
    }
    merged.search.threshold = Math.round(threshold);

    if (!['local', 'semantic'].includes(merged.search.scoringMode)) {
      merged.search.scoringMode = 'local';
    }
    merged.search.semanticEndpoint = typeof merged.search.semanticEndpoint === 'string' ? merged.search.semanticEndpoint.trim() : '';

    if (!Array.isArray(merged.search.supportedDomains)) {
      merged.search.supportedDomains = clone(def.search.supportedDomains);
    } else {
      merged.search.supportedDomains = merged.search.supportedDomains
        .filter(d => typeof d === 'string' && d.trim().length > 0)
        .map(d => d.trim().toLowerCase());
      if (merged.search.supportedDomains.length === 0) {
        merged.search.supportedDomains = clone(def.search.supportedDomains);
      }
    }

    // Recommendations validation
    if (typeof merged.recommendations !== 'object' || merged.recommendations === null) {
      merged.recommendations = clone(def.recommendations);
    }
    merged.recommendations.enabled = typeof merged.recommendations.enabled === 'boolean' ? merged.recommendations.enabled : def.recommendations.enabled;
    if (!['keywords', 'topics', 'combined'].includes(merged.recommendations.strategy)) {
      merged.recommendations.strategy = 'keywords';
    }

    const sanitizeStringList = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(item => typeof item === 'string' && item.trim().length > 0)
        .map(item => item.trim());
    };

    merged.recommendations.blockedKeywords = sanitizeStringList(merged.recommendations.blockedKeywords);
    merged.recommendations.blockedTopics = sanitizeStringList(merged.recommendations.blockedTopics);
    merged.recommendations.allowedChannels = sanitizeStringList(merged.recommendations.allowedChannels);
    merged.recommendations.allowedTopics = sanitizeStringList(merged.recommendations.allowedTopics);
    merged.recommendations.focusMode = typeof merged.recommendations.focusMode === 'boolean' ? merged.recommendations.focusMode : false;

    // Quality validation
    if (typeof merged.quality !== 'object' || merged.quality === null) merged.quality = clone(def.quality);
    merged.quality.enabled = typeof merged.quality.enabled === 'boolean' ? merged.quality.enabled : def.quality.enabled;
    if (typeof merged.quality.signals !== 'object' || merged.quality.signals === null) {
      merged.quality.signals = clone(def.quality.signals);
    }
    merged.quality.signals.metadataCompleteness = typeof merged.quality.signals.metadataCompleteness === 'boolean' ? merged.quality.signals.metadataCompleteness : true;
    merged.quality.signals.relevance = typeof merged.quality.signals.relevance === 'boolean' ? merged.quality.signals.relevance : true;
    merged.quality.signals.duplicateDetection = typeof merged.quality.signals.duplicateDetection === 'boolean' ? merged.quality.signals.duplicateDetection : true;
    merged.quality.signals.sourceSignals = typeof merged.quality.signals.sourceSignals === 'boolean' ? merged.quality.signals.sourceSignals : true;

    let minEv = Number(merged.quality.minimumEvidence);
    if (isNaN(minEv) || minEv < 1 || minEv > 4) minEv = def.quality.minimumEvidence;
    merged.quality.minimumEvidence = Math.round(minEv);
    merged.quality.sortResults = typeof merged.quality.sortResults === 'boolean' ? merged.quality.sortResults : false;

    // Security validation
    if (typeof merged.security !== 'object' || merged.security === null) merged.security = clone(def.security);
    merged.security.enabled = typeof merged.security.enabled === 'boolean' ? merged.security.enabled : def.security.enabled;
    merged.security.showExplanations = typeof merged.security.showExplanations === 'boolean' ? merged.security.showExplanations : true;
    if (!['heuristic', 'strict'].includes(merged.security.mode)) {
      merged.security.mode = 'heuristic';
    }

    // Clutter validation
    if (typeof merged.clutter !== 'object' || merged.clutter === null) merged.clutter = clone(def.clutter);
    merged.clutter.enabled = typeof merged.clutter.enabled === 'boolean' ? merged.clutter.enabled : false;
    merged.clutter.hideSponsored = typeof merged.clutter.hideSponsored === 'boolean' ? merged.clutter.hideSponsored : true;
    merged.clutter.hideOverlays = typeof merged.clutter.hideOverlays === 'boolean' ? merged.clutter.hideOverlays : false;
    merged.clutter.reduceSidebars = typeof merged.clutter.reduceSidebars === 'boolean' ? merged.clutter.reduceSidebars : false;

    // Appearance validation
    if (typeof merged.appearance !== 'object' || merged.appearance === null) merged.appearance = clone(def.appearance);
    if (!['system', 'dark', 'light'].includes(merged.appearance.theme)) {
      merged.appearance.theme = 'system';
    }
    merged.appearance.perSiteBehavior = typeof merged.appearance.perSiteBehavior === 'boolean' ? merged.appearance.perSiteBehavior : true;

    // Privacy validation
    if (typeof merged.privacy !== 'object' || merged.privacy === null) merged.privacy = clone(def.privacy);
    merged.privacy.semanticScoringEnabled = typeof merged.privacy.semanticScoringEnabled === 'boolean' ? merged.privacy.semanticScoringEnabled : false;
    merged.privacy.securityLookupEnabled = typeof merged.privacy.securityLookupEnabled === 'boolean' ? merged.privacy.securityLookupEnabled : false;

    return merged;
  }

  /**
   * Low-level storage adapter with fallbacks for Chrome extensions or test environments.
   */
  const storageAdapter = {
    get(key) {
      return new Promise((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            chrome.storage.local.get([key], (result) => {
              const err = chrome.runtime.lastError;
              if (err) return reject(new Error(err.message));
              resolve(result ? result[key] : undefined);
            });
          } catch (e) {
            reject(e);
          }
        } else if (typeof localStorage !== 'undefined') {
          try {
            const raw = localStorage.getItem(key);
            resolve(raw ? JSON.parse(raw) : undefined);
          } catch (e) {
            resolve(undefined);
          }
        } else {
          // In-memory fallback
          resolve(storageAdapter._mem ? storageAdapter._mem[key] : undefined);
        }
      });
    },

    set(key, value) {
      return new Promise((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            chrome.storage.local.set({ [key]: value }, () => {
              const err = chrome.runtime.lastError;
              if (err) return reject(new Error(err.message));
              resolve();
            });
          } catch (e) {
            reject(e);
          }
        } else if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(key, JSON.stringify(value));
            resolve();
          } catch (e) {
            reject(e);
          }
        } else {
          storageAdapter._mem = storageAdapter._mem || {};
          storageAdapter._mem[key] = clone(value);
          resolve();
        }
      });
    },

    remove(key) {
      return new Promise((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            chrome.storage.local.remove([key], () => {
              const err = chrome.runtime.lastError;
              if (err) return reject(new Error(err.message));
              resolve();
            });
          } catch (e) {
            reject(e);
          }
        } else if (typeof localStorage !== 'undefined') {
          try {
            localStorage.removeItem(key);
            resolve();
          } catch (e) {
            reject(e);
          }
        } else {
          if (storageAdapter._mem) delete storageAdapter._mem[key];
          resolve();
        }
      });
    }
  };

  /**
   * Retrieve current settings from storage, repairing/migrating if necessary.
   * @returns {Promise<object>}
   */
  async function getSettings() {
    try {
      const stored = await storageAdapter.get(STORAGE_KEY);
      const validated = validateSettings(stored);
      // If nothing was stored, seed the default settings
      if (!stored) {
        await storageAdapter.set(STORAGE_KEY, validated);
      }
      return validated;
    } catch (err) {
      console.warn('[Friction Layer] Storage read error, using safe defaults:', err);
      return clone(DEFAULT_SETTINGS);
    }
  }

  /**
   * Partially update settings without wiping sibling keys.
   * @param {object} partial
   * @returns {Promise<object>} updated clean settings
   */
  async function updateSettings(partial) {
    if (!partial || typeof partial !== 'object') {
      throw new Error('updateSettings requires an object argument');
    }
    const current = await getSettings();
    const merged = deepMerge(current, partial);
    const validated = validateSettings(merged);
    await storageAdapter.set(STORAGE_KEY, validated);
    return validated;
  }

  /**
   * Reset all settings to defaults.
   * @returns {Promise<object>}
   */
  async function resetSettings() {
    const def = clone(DEFAULT_SETTINGS);
    await storageAdapter.set(STORAGE_KEY, def);
    return def;
  }

  /**
   * Clears cached scores and risk computations.
   * @returns {Promise<void>}
   */
  async function clearLocalCache() {
    await storageAdapter.remove(CACHE_KEY);
  }

  /**
   * Cache getter / setter helpers for scoring modules.
   */
  async function getCachedValue(hashKey) {
    try {
      const cache = (await storageAdapter.get(CACHE_KEY)) || {};
      const entry = cache[hashKey];
      if (entry && entry.expiresAt > Date.now()) {
        return entry.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function setCachedValue(hashKey, data, ttlMs = 1000 * 60 * 60 * 24) {
    try {
      const cache = (await storageAdapter.get(CACHE_KEY)) || {};
      cache[hashKey] = {
        data,
        expiresAt: Date.now() + ttlMs
      };
      // Keep cache bounded to at most 1000 items
      const keys = Object.keys(cache);
      if (keys.length > 1000) {
        const sorted = keys.sort((a, b) => cache[a].expiresAt - cache[b].expiresAt);
        for (let i = 0; i < 200; i++) {
          delete cache[sorted[i]];
        }
      }
      await storageAdapter.set(CACHE_KEY, cache);
    } catch {
      // Non-critical cache failure
    }
  }

  return {
    DEFAULT_SETTINGS,
    STORAGE_KEY,
    CACHE_KEY,
    clone,
    deepMerge,
    validateSettings,
    getSettings,
    updateSettings,
    resetSettings,
    clearLocalCache,
    getCachedValue,
    setCachedValue
  };
});
