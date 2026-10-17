/**
 * Friction Layer - Popup Controller (popup/popup.js)
 * Coordinates user controls, real-time tab state query, and validated settings updates.
 * Gracefully handles unsupported pages, un-injected tabs, and connection drops.
 */
(function () {
  'use strict';

  const FL = globalThis.FrictionLayer || {};
  const Messaging = FL.Messaging;
  const Settings = FL.Settings;

  let currentSettings = null;
  let activeTab = null;
  let isSupportedPage = false;

  // DOM Elements
  const masterToggle = document.getElementById('masterToggle');
  const toggleSearch = document.getElementById('toggleSearch');
  const toggleRecommendations = document.getElementById('toggleRecommendations');
  const toggleQuality = document.getElementById('toggleQuality');
  const toggleSecurity = document.getElementById('toggleSecurity');
  const toggleClutter = document.getElementById('toggleClutter');

  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const pageTypeBadge = document.getElementById('pageTypeBadge');
  const hiddenCountMetric = document.getElementById('hiddenCountMetric');
  const filterStatusMetric = document.getElementById('filterStatusMetric');

  const btnRestorePage = document.getElementById('btnRestorePage');
  const btnReprocessPage = document.getElementById('btnReprocessPage');
  const btnOpenOptions = document.getElementById('btnOpenOptions');
  const toast = document.getElementById('popupToast');

  let toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  /**
   * Determine page category from URL.
   * @param {string} url
   * @returns {{ supported: boolean, type: string, label: string }}
   */
  function inspectUrl(url) {
    if (!url || typeof url !== 'string') {
      return { supported: false, type: 'unsupported', label: 'Restricted' };
    }

    const restrictedSchemes = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'data:', 'view-source:'];
    if (restrictedSchemes.some(scheme => url.startsWith(scheme))) {
      return { supported: false, type: 'restricted', label: 'Chrome Internal' };
    }

    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();

      if (host.includes('google.com') && (u.pathname === '/search' || u.pathname === '/')) {
        return { supported: true, type: 'google-search', label: 'Google Search' };
      }
      if (host.includes('youtube.com')) {
        return { supported: true, type: 'youtube', label: 'YouTube' };
      }
      return { supported: true, type: 'generic-web', label: 'Web Page' };
    } catch {
      return { supported: false, type: 'unsupported', label: 'Unknown' };
    }
  }

  /**
   * Update UI controls to match settings object.
   * @param {object} settings
   */
  function syncUIFromSettings(settings) {
    currentSettings = settings;

    masterToggle.checked = Boolean(settings.enabled);
    toggleSearch.checked = Boolean(settings.search && settings.search.enabled);
    toggleRecommendations.checked = Boolean(settings.recommendations && settings.recommendations.enabled);
    toggleQuality.checked = Boolean(settings.quality && settings.quality.enabled);
    toggleSecurity.checked = Boolean(settings.security && settings.security.enabled);
    toggleClutter.checked = Boolean(settings.clutter && settings.clutter.enabled);

    // Dim child toggles if master toggle is disabled
    const childToggles = [toggleSearch, toggleRecommendations, toggleQuality, toggleSecurity, toggleClutter];
    childToggles.forEach(t => {
      t.disabled = !settings.enabled;
      const card = t.closest('.feature-card');
      if (card) {
        card.style.opacity = settings.enabled ? '1' : '0.45';
      }
    });

    filterStatusMetric.textContent = settings.enabled ? 'Active' : 'Paused';
    updateStatusDisplay();
  }

  /**
   * Update status indicator dot and text based on master state and tab type.
   */
  function updateStatusDisplay() {
    statusDot.className = 'status-dot';

    if (!currentSettings || !currentSettings.enabled) {
      statusDot.classList.add('paused');
      statusText.textContent = 'Protection Paused';
      return;
    }

    if (!isSupportedPage) {
      statusDot.classList.add('unsupported');
      statusText.textContent = 'Unsupported Tab';
      return;
    }

    statusText.textContent = 'Active & Filtering';
  }

  /**
   * Send a validated settings update to background worker.
   * @param {object} partial
   */
  async function saveSettingChange(partial) {
    try {
      if (Messaging && Messaging.sendRuntimeMessage) {
        const res = await Messaging.sendRuntimeMessage({
          type: Messaging.MESSAGE_TYPES.UPDATE_SETTINGS,
          settings: partial
        });
        if (res && res.success && res.settings) {
          syncUIFromSettings(res.settings);
          showToast('Settings saved');
          return;
        }
      }

      // Fallback direct storage update
      if (Settings && Settings.updateSettings) {
        const updated = await Settings.updateSettings(partial);
        syncUIFromSettings(updated);
        showToast('Settings saved');
      }
    } catch (err) {
      console.error('[Friction Layer] Save settings failed:', err);
      showToast('Error saving settings');
    }
  }

  /**
   * Query active tab state (hidden items count, reveal mode).
   */
  async function queryActiveTabStatus() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      return;
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) return;

      activeTab = tabs[0];
      const pageInfo = inspectUrl(activeTab.url);
      pageTypeBadge.textContent = pageInfo.label;

      if (!pageInfo.supported || pageInfo.type === 'restricted') {
        isSupportedPage = false;
        hiddenCountMetric.textContent = '-';
        btnRestorePage.disabled = true;
        btnReprocessPage.disabled = true;
        updateStatusDisplay();
        return;
      }

      isSupportedPage = true;
      btnRestorePage.disabled = false;
      btnReprocessPage.disabled = false;
      updateStatusDisplay();

      // Query content script for metrics
      if (Messaging && Messaging.sendTabMessage && activeTab.id) {
        try {
          const status = await Messaging.sendTabMessage(activeTab.id, {
            type: Messaging.MESSAGE_TYPES.GET_TAB_STATUS
          }, 1500);

          if (status && typeof status.hiddenCount === 'number') {
            hiddenCountMetric.textContent = String(status.hiddenCount);
          }
        } catch (msgErr) {
          // Content script not yet injected or user is on an unscripted page
          hiddenCountMetric.textContent = '0';
        }
      }
    } catch (err) {
      console.warn('[Friction Layer] Active tab query notice:', err);
    }
  }

  /**
   * Attach event listeners to controls.
   */
  function bindEvents() {
    masterToggle.addEventListener('change', () => {
      saveSettingChange({ enabled: masterToggle.checked });
    });

    toggleSearch.addEventListener('change', () => {
      saveSettingChange({ search: { enabled: toggleSearch.checked } });
    });

    toggleRecommendations.addEventListener('change', () => {
      saveSettingChange({ recommendations: { enabled: toggleRecommendations.checked } });
    });

    toggleQuality.addEventListener('change', () => {
      saveSettingChange({ quality: { enabled: toggleQuality.checked } });
    });

    toggleSecurity.addEventListener('change', () => {
      saveSettingChange({ security: { enabled: toggleSecurity.checked } });
    });

    toggleClutter.addEventListener('change', () => {
      saveSettingChange({ clutter: { enabled: toggleClutter.checked } });
    });

    // Actions
    btnRestorePage.addEventListener('click', async () => {
      if (!activeTab || !activeTab.id || !isSupportedPage) {
        showToast('Page not supported');
        return;
      }

      try {
        const res = await Messaging.sendTabMessage(activeTab.id, {
          type: Messaging.MESSAGE_TYPES.RESTORE_CURRENT_PAGE
        });
        if (res && res.restored) {
          showToast('Hidden items revealed');
          queryActiveTabStatus();
        } else {
          showToast('Could not restore page');
        }
      } catch (err) {
        showToast('Page not responsive');
      }
    });

    btnReprocessPage.addEventListener('click', async () => {
      if (!activeTab || !activeTab.id || !isSupportedPage) {
        showToast('Page not supported');
        return;
      }

      try {
        const res = await Messaging.sendTabMessage(activeTab.id, {
          type: Messaging.MESSAGE_TYPES.REPROCESS_CURRENT_PAGE
        });
        if (res && res.reprocessed) {
          showToast('Page reprocessed');
          queryActiveTabStatus();
        } else {
          showToast('Reprocess failed');
        }
      } catch (err) {
        showToast('Page not responsive');
      }
    });

    btnOpenOptions.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('../options/options.html');
      }
    });
  }

  /**
   * Main popup initialization.
   */
  async function init() {
    bindEvents();

    // Load saved settings
    if (Settings && Settings.getSettings) {
      try {
        const settings = await Settings.getSettings();
        syncUIFromSettings(settings);
      } catch (err) {
        console.error('[Friction Layer] Failed to read settings:', err);
      }
    }

    // Inspect current tab
    await queryActiveTabStatus();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
