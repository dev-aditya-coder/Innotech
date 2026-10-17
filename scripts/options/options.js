/**
 * Friction Layer - Options Controller (options/options.js)
 * Manages configuration dashboard, sidebar navigation, form data extraction, and persistence.
 */
(function () {
  'use strict';

  const FL = globalThis.FrictionLayer || {};
  const Settings = FL.Settings;
  const Messaging = FL.Messaging;

  // Header Titles Map
  const SECTION_TITLES = {
    'section-search': {
      title: 'Search Relevance Filtering',
      subtitle: 'Tune local intent estimation, threshold boundaries, and organic result presentation.'
    },
    'section-recommendations': {
      title: 'YouTube Recommendation Filtering',
      subtitle: 'Reclaim your focus by hiding distracting feeds, algorithmic recommendations, and clickbait.'
    },
    'section-quality': {
      title: 'Evidence-Based Quality Indicators',
      subtitle: 'Inspect visible page-level signals without fabricating popularity or reputation data.'
    },
    'section-security': {
      title: 'Spam & Scam Link-Risk Protection',
      subtitle: 'Non-blocking, local heuristic checks for deceptive URLs, typosquatting, and obfuscated redirects.'
    },
    'section-clutter': {
      title: 'Ad & Clutter Filtering',
      subtitle: 'Conservative, reversible filtering of explicitly marked sponsored elements and generic overlays.'
    },
    'section-appearance': {
      title: 'Appearance & Theme',
      subtitle: 'Customize interface visual theme and extension behavior.'
    },
    'section-privacy': {
      title: 'Privacy, Permissions & Diagnostics',
      subtitle: 'Zero telemetry, local processing by default, and transparent permission justification.'
    }
  };

  // DOM Elements
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  const toast = document.getElementById('optionsToast');

  // Search Inputs
  const searchEnabled = document.getElementById('searchEnabled');
  const searchThreshold = document.getElementById('searchThreshold');
  const searchThresholdValue = document.getElementById('searchThresholdValue');
  const searchSupportedDomains = document.getElementById('searchSupportedDomains');
  const semanticEndpoint = document.getElementById('semanticEndpoint');
  const semanticEndpointContainer = document.getElementById('semanticEndpointContainer');
  const radioLocal = document.getElementById('labelLocalScoring');
  const radioSemantic = document.getElementById('labelSemanticScoring');

  // Recommendation Inputs
  const recEnabled = document.getElementById('recEnabled');
  const recFocusMode = document.getElementById('recFocusMode');
  const recStrategy = document.getElementById('recStrategy');
  const recBlockedKeywords = document.getElementById('recBlockedKeywords');
  const recBlockedTopics = document.getElementById('recBlockedTopics');
  const recAllowedChannels = document.getElementById('recAllowedChannels');

  // Quality Inputs
  const qualityEnabled = document.getElementById('qualityEnabled');
  const signalMetadata = document.getElementById('signalMetadata');
  const signalRelevance = document.getElementById('signalRelevance');
  const signalDuplicate = document.getElementById('signalDuplicate');
  const signalSource = document.getElementById('signalSource');
  const qualityMinEvidence = document.getElementById('qualityMinEvidence');
  const qualityMinEvidenceVal = document.getElementById('qualityMinEvidenceVal');
  const qualitySortResults = document.getElementById('qualitySortResults');

  // Security Inputs
  const securityEnabled = document.getElementById('securityEnabled');
  const securityMode = document.getElementById('securityMode');
  const securityShowExplanations = document.getElementById('securityShowExplanations');

  // Clutter Inputs
  const clutterEnabled = document.getElementById('clutterEnabled');
  const clutterHideSponsored = document.getElementById('clutterHideSponsored');
  const clutterHideOverlays = document.getElementById('clutterHideOverlays');
  const clutterReduceSidebars = document.getElementById('clutterReduceSidebars');

  // Appearance Inputs
  const themeSelect = document.getElementById('themeSelect');
  const appearancePerSite = document.getElementById('appearancePerSite');

  // Action Buttons
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const btnResetDefaults = document.getElementById('btnResetDefaults');
  const btnClearCache = document.getElementById('btnClearCache');
  const btnFullReset = document.getElementById('btnFullReset');

  let toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  function linesToArray(text) {
    if (!text) return [];
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  function arrayToLines(arr) {
    return Array.isArray(arr) ? arr.join('\n') : '';
  }

  /**
   * Populate input controls from settings object.
   * @param {object} s
   */
  function populateUI(s) {
    // Search
    searchEnabled.checked = Boolean(s.search.enabled);
    searchThreshold.value = s.search.threshold;
    searchThresholdValue.textContent = `${s.search.threshold}%`;
    searchSupportedDomains.value = arrayToLines(s.search.supportedDomains);
    semanticEndpoint.value = s.search.semanticEndpoint || '';

    if (s.search.scoringMode === 'semantic') {
      radioSemantic.querySelector('input').checked = true;
      radioSemantic.classList.add('selected');
      radioLocal.classList.remove('selected');
      semanticEndpointContainer.style.display = 'block';
    } else {
      radioLocal.querySelector('input').checked = true;
      radioLocal.classList.add('selected');
      radioSemantic.classList.remove('selected');
      semanticEndpointContainer.style.display = 'none';
    }

    // Recommendations
    recEnabled.checked = Boolean(s.recommendations.enabled);
    recFocusMode.checked = Boolean(s.recommendations.focusMode);
    recStrategy.value = s.recommendations.strategy || 'combined';
    recBlockedKeywords.value = arrayToLines(s.recommendations.blockedKeywords);
    recBlockedTopics.value = arrayToLines(s.recommendations.blockedTopics);
    recAllowedChannels.value = arrayToLines(s.recommendations.allowedChannels);

    // Quality
    qualityEnabled.checked = Boolean(s.quality.enabled);
    signalMetadata.checked = Boolean(s.quality.signals.metadataCompleteness);
    signalRelevance.checked = Boolean(s.quality.signals.relevance);
    signalDuplicate.checked = Boolean(s.quality.signals.duplicateDetection);
    signalSource.checked = Boolean(s.quality.signals.sourceSignals);
    qualityMinEvidence.value = s.quality.minimumEvidence;
    qualityMinEvidenceVal.textContent = String(s.quality.minimumEvidence);
    qualitySortResults.checked = Boolean(s.quality.sortResults);

    // Security
    securityEnabled.checked = Boolean(s.security.enabled);
    securityMode.value = s.security.mode || 'heuristic';
    securityShowExplanations.checked = Boolean(s.security.showExplanations);

    // Clutter
    clutterEnabled.checked = Boolean(s.clutter.enabled);
    clutterHideSponsored.checked = Boolean(s.clutter.hideSponsored);
    clutterHideOverlays.checked = Boolean(s.clutter.hideOverlays);
    clutterReduceSidebars.checked = Boolean(s.clutter.reduceSidebars);

    // Appearance
    themeSelect.value = s.appearance.theme || 'system';
    appearancePerSite.checked = Boolean(s.appearance.perSiteBehavior);
  }

  /**
   * Extract settings object from UI inputs.
   * @returns {object}
   */
  function extractSettingsFromUI() {
    const isSemantic = radioSemantic.querySelector('input').checked;

    return {
      search: {
        enabled: searchEnabled.checked,
        threshold: parseInt(searchThreshold.value, 10),
        scoringMode: isSemantic ? 'semantic' : 'local',
        semanticEndpoint: semanticEndpoint.value.trim(),
        supportedDomains: linesToArray(searchSupportedDomains.value)
      },
      recommendations: {
        enabled: recEnabled.checked,
        strategy: recStrategy.value,
        blockedKeywords: linesToArray(recBlockedKeywords.value),
        blockedTopics: linesToArray(recBlockedTopics.value),
        allowedChannels: linesToArray(recAllowedChannels.value),
        focusMode: recFocusMode.checked
      },
      quality: {
        enabled: qualityEnabled.checked,
        signals: {
          metadataCompleteness: signalMetadata.checked,
          relevance: signalRelevance.checked,
          duplicateDetection: signalDuplicate.checked,
          sourceSignals: signalSource.checked
        },
        minimumEvidence: parseInt(qualityMinEvidence.value, 10),
        sortResults: qualitySortResults.checked
      },
      security: {
        enabled: securityEnabled.checked,
        mode: securityMode.value,
        showExplanations: securityShowExplanations.checked
      },
      clutter: {
        enabled: clutterEnabled.checked,
        hideSponsored: clutterHideSponsored.checked,
        hideOverlays: clutterHideOverlays.checked,
        reduceSidebars: clutterReduceSidebars.checked
      },
      appearance: {
        theme: themeSelect.value,
        perSiteBehavior: appearancePerSite.checked
      }
    };
  }

  /**
   * Save settings and broadcast to tabs.
   */
  async function handleSave() {
    const data = extractSettingsFromUI();

    // Semantic validation check
    if (data.search.scoringMode === 'semantic') {
      if (!data.search.semanticEndpoint || !data.search.semanticEndpoint.startsWith('https://')) {
        showToast('Error: Semantic endpoint must begin with https://');
        return;
      }
    }

    try {
      if (Messaging && Messaging.sendRuntimeMessage) {
        const res = await Messaging.sendRuntimeMessage({
          type: Messaging.MESSAGE_TYPES.UPDATE_SETTINGS,
          settings: data
        });
        if (res && res.success) {
          populateUI(res.settings);
          showToast('Preferences saved & applied');
          return;
        }
      }

      if (Settings && Settings.updateSettings) {
        const updated = await Settings.updateSettings(data);
        populateUI(updated);
        showToast('Preferences saved');
      }
    } catch (err) {
      console.error('[Friction Layer] Save failed:', err);
      showToast('Save failed: ' + err.message);
    }
  }

  /**
   * Bind all event listeners.
   */
  function bindEvents() {
    // Tab switching
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        const targetId = item.getAttribute('data-section');
        const sections = document.querySelectorAll('.settings-section');
        sections.forEach(s => s.classList.remove('active'));

        const targetSection = document.getElementById(targetId);
        if (targetSection) {
          targetSection.classList.add('active');
        }

        const info = SECTION_TITLES[targetId];
        if (info) {
          pageTitle.textContent = info.title;
          pageSubtitle.textContent = info.subtitle;
        }
      });
    });

    // Threshold Slider live readout
    searchThreshold.addEventListener('input', () => {
      searchThresholdValue.textContent = `${searchThreshold.value}%`;
    });

    // Quality Min Evidence Slider readout
    qualityMinEvidence.addEventListener('input', () => {
      qualityMinEvidenceVal.textContent = qualityMinEvidence.value;
    });

    // Radio selection cards
    radioLocal.addEventListener('click', () => {
      radioLocal.querySelector('input').checked = true;
      radioLocal.classList.add('selected');
      radioSemantic.classList.remove('selected');
      semanticEndpointContainer.style.display = 'none';
    });

    radioSemantic.addEventListener('click', () => {
      radioSemantic.querySelector('input').checked = true;
      radioSemantic.classList.add('selected');
      radioLocal.classList.remove('selected');
      semanticEndpointContainer.style.display = 'block';
    });

    // Save button
    btnSaveSettings.addEventListener('click', handleSave);

    // Reset Defaults
    btnResetDefaults.addEventListener('click', async () => {
      if (!confirm('Reset all settings to default values?')) return;
      try {
        if (Messaging && Messaging.sendRuntimeMessage) {
          const res = await Messaging.sendRuntimeMessage({
            type: Messaging.MESSAGE_TYPES.RESET_SETTINGS
          });
          if (res && res.success) {
            populateUI(res.settings);
            showToast('Reset to defaults complete');
            return;
          }
        }
        if (Settings && Settings.resetSettings) {
          const def = await Settings.resetSettings();
          populateUI(def);
          showToast('Reset to defaults complete');
        }
      } catch (err) {
        showToast('Reset failed');
      }
    });

    // Clear Cache
    btnClearCache.addEventListener('click', async () => {
      try {
        if (Messaging && Messaging.sendRuntimeMessage) {
          await Messaging.sendRuntimeMessage({
            type: Messaging.MESSAGE_TYPES.CLEAR_LOCAL_CACHE
          });
        } else if (Settings && Settings.clearLocalCache) {
          await Settings.clearLocalCache();
        }
        showToast('Local scoring cache cleared');
      } catch {
        showToast('Clear cache failed');
      }
    });

    // Full Reset
    btnFullReset.addEventListener('click', async () => {
      if (!confirm('WARNING: This will wipe all custom keywords, allowlists, and scoring cache. Continue?')) return;
      try {
        if (Settings && Settings.resetSettings) {
          await Settings.clearLocalCache();
          const def = await Settings.resetSettings();
          populateUI(def);
          showToast('Factory reset completed');
        }
      } catch {
        showToast('Factory reset failed');
      }
    });
  }

  /**
   * Main initialization.
   */
  async function init() {
    bindEvents();

    if (Settings && Settings.getSettings) {
      try {
        const current = await Settings.getSettings();
        populateUI(current);
      } catch (err) {
        console.error('[Friction Layer] Failed to read settings:', err);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
