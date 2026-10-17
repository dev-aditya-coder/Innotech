/**
 * Friction Layer - YouTube Recommendations Content Script (content/youtube-recommendations.js)
 * Privacy-first recommendation filtering based on user keywords, topic clusters, channel allowlists, and focus mode.
 * Preserves video player, comments, and navigation. Disabled by default.
 * Zero external dependencies.
 */
(function () {
  'use strict';

  const FL = globalThis.FrictionLayer || {};
  const Settings = FL.Settings;
  const RecommendationEngine = FL.RecommendationEngine;
  const ClutterFilter = FL.ClutterFilter;
  const Messaging = FL.Messaging;

  let currentSettings = null;
  let hiddenCount = 0;
  let isRevealMode = false;
  let observer = null;
  let debounceTimer = null;

  // Track processed elements to avoid unnecessary re-evaluation
  const processedElements = new WeakSet();
  const hiddenElements = new Set();

  /**
   * Inject CSS styles for reversible hiding and YouTube banner.
   */
  function ensureStyles() {
    if (document.getElementById('friction-layer-yt-styles')) return;

    const style = document.createElement('style');
    style.id = 'friction-layer-yt-styles';
    style.textContent = `
      .friction-yt-hidden {
        display: none !important;
      }
      .friction-yt-reveal .friction-yt-hidden {
        display: block !important;
        opacity: 0.55;
        border: 2px dashed #0d9488 !important;
        border-radius: 8px;
        position: relative;
      }
      .friction-yt-banner {
        background: #0f172a;
        color: #f1f5f9;
        border: 1px solid #14b8a6;
        border-radius: 8px;
        padding: 8px 12px;
        margin: 8px 0 12px 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 12px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        z-index: 20;
      }
      .friction-yt-banner button {
        background: #1e293b;
        color: #2dd4bf;
        border: 1px solid #0d9488;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .friction-yt-banner button:hover {
        background: #0d9488;
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Extract video metadata from a YouTube renderer element.
   * @param {HTMLElement} el
   * @returns {object}
   */
  function extractVideoData(el) {
    const titleEl = el.querySelector('#video-title, #video-title-link, h3');
    const title = titleEl ? titleEl.textContent.trim() : '';

    const channelEl = el.querySelector('ytd-channel-name, #channel-name, #byline, .ytd-channel-name');
    const channel = channelEl ? channelEl.textContent.trim() : '';

    const descEl = el.querySelector('#description-text, #metadata-line');
    const description = descEl ? descEl.textContent.trim() : '';

    const isShorts = el.tagName.toLowerCase().includes('reel') ||
      el.hasAttribute('is-shorts') ||
      (titleEl && titleEl.getAttribute('href') && titleEl.getAttribute('href').includes('/shorts/'));

    return { title, channel, description, isShorts };
  }

  /**
   * Conservative extraction of recommendation card elements.
   * NEVER targets main player, comments, or main navigation headers.
   * @returns {HTMLElement[]}
   */
  function findRecommendationElements() {
    const selectors = [
      'ytd-rich-item-renderer',       // Home feed items
      'ytd-compact-video-renderer',    // Sidebar watch next items
      'ytd-compact-radio-renderer',    // Mix / radio cards
      'ytd-reel-item-renderer',        // Shorts items
      'ytd-reel-shelf-renderer'        // Entire Shorts shelf
    ];

    const elements = [];
    for (const sel of selectors) {
      try {
        const matches = document.querySelectorAll(sel);
        for (const el of matches) {
          // Absolute safety guard: NEVER touch the player or controls
          if (el.closest('#player, #movie_player, #player-container, #masthead, #guide, #comments, ytd-watch-metadata')) {
            continue;
          }
          elements.push(el);
        }
      } catch {
        // Selector error
      }
    }
    return elements;
  }

  /**
   * Render or update notice banner in YouTube sidebar or home feed.
   */
  function updateBanner() {
    ensureStyles();

    let banner = document.getElementById('friction-layer-yt-banner');
    const container = document.querySelector('#secondary #related') ||
                      document.querySelector('ytd-browse[page-subtype="home"] #primary') ||
                      document.querySelector('#secondary') ||
                      document.body;

    if (!container || !currentSettings || !currentSettings.enabled || !currentSettings.recommendations || !currentSettings.recommendations.enabled) {
      if (banner) banner.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'friction-layer-yt-banner';
      banner.className = 'friction-yt-banner';
      container.insertBefore(banner, container.firstChild);
    }

    banner.innerHTML = `
      <span>🛡️ <strong>Friction Layer:</strong> ${hiddenCount} recommendations filtered</span>
      <button id="friction-yt-toggle-reveal">
        ${isRevealMode ? 'Re-Hide Filtered' : 'Show Hidden'}
      </button>
    `;

    banner.querySelector('#friction-yt-toggle-reveal').addEventListener('click', () => {
      isRevealMode = !isRevealMode;
      if (isRevealMode) {
        document.body.classList.add('friction-yt-reveal');
      } else {
        document.body.classList.remove('friction-yt-reveal');
      }
      updateBanner();
    });
  }

  /**
   * Evaluate all recommendations and apply filters.
   * @param {boolean} force
   */
  function evaluateRecommendations(force = false) {
    if (!currentSettings || !currentSettings.enabled || !currentSettings.recommendations || !currentSettings.recommendations.enabled) {
      restoreAll();
      return;
    }

    ensureStyles();
    const items = findRecommendationElements();
    let currentHidden = 0;

    for (const el of items) {
      if (processedElements.has(el) && !force) {
        if (el.classList.contains('friction-yt-hidden')) {
          currentHidden++;
        }
        continue;
      }

      processedElements.add(el);
      const data = extractVideoData(el);

      // Evaluate against rules
      const decision = RecommendationEngine
        ? RecommendationEngine.evaluateRecommendation(data, currentSettings)
        : { blocked: false };

      if (decision.blocked) {
        el.classList.add('friction-yt-hidden');
        el.setAttribute('data-friction-yt-hidden', decision.reason || 'blocked');
        hiddenElements.add(el);
        currentHidden++;
      } else {
        el.classList.remove('friction-yt-hidden');
        el.removeAttribute('data-friction-yt-hidden');
        hiddenElements.delete(el);
      }
    }

    hiddenCount = currentHidden;
    updateBanner();
  }

  /**
   * Restore all hidden elements.
   */
  function restoreAll() {
    isRevealMode = false;
    document.body.classList.remove('friction-yt-reveal');

    for (const el of hiddenElements) {
      if (el && el.classList) {
        el.classList.remove('friction-yt-hidden');
        el.removeAttribute('data-friction-yt-hidden');
      }
    }
    hiddenElements.clear();

    const banner = document.getElementById('friction-layer-yt-banner');
    if (banner) banner.remove();

    hiddenCount = 0;
  }

  /**
   * Setup MutationObserver and SPA navigation handlers for YouTube.
   */
  function setupObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        evaluateRecommendations(false);
      }, 350);
    });

    const target = document.querySelector('ytd-app') || document.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }

    // YouTube SPA navigation events
    window.addEventListener('yt-navigate-finish', () => {
      setTimeout(() => {
        evaluateRecommendations(true);
      }, 500);
    });
  }

  /**
   * Initialize YouTube recommendations content script.
   */
  async function init() {
    if (!Settings) return;

    currentSettings = await Settings.getSettings();

    if (ClutterFilter) ClutterFilter.init(currentSettings);

    if (currentSettings.enabled && currentSettings.recommendations && currentSettings.recommendations.enabled) {
      evaluateRecommendations(true);
      setupObserver();
    } else {
      restoreAll();
    }

    // Message handler for popup and settings commands
    if (Messaging && Messaging.registerMessageHandler) {
      Messaging.registerMessageHandler((message, sender, sendResponse) => {
        if (!message || !message.type) return false;

        switch (message.type) {
          case Messaging.MESSAGE_TYPES.GET_TAB_STATUS:
            sendResponse({
              pageType: 'youtube',
              hiddenCount: hiddenCount + (ClutterFilter ? ClutterFilter.getHiddenCount() : 0),
              totalCount: findRecommendationElements().length,
              isRevealMode
            });
            return true;

          case Messaging.MESSAGE_TYPES.RESTORE_CURRENT_PAGE:
            isRevealMode = true;
            document.body.classList.add('friction-yt-reveal');
            if (ClutterFilter) ClutterFilter.restoreAll();
            updateBanner();
            sendResponse({ restored: true });
            return true;

          case Messaging.MESSAGE_TYPES.REPROCESS_CURRENT_PAGE:
            evaluateRecommendations(true);
            if (ClutterFilter) ClutterFilter.applyRules();
            sendResponse({ reprocessed: true });
            return true;

          case Messaging.MESSAGE_TYPES.SETTINGS_CHANGED:
            if (message.settings) {
              currentSettings = message.settings;
              if (ClutterFilter) ClutterFilter.init(currentSettings);

              if (currentSettings.enabled && currentSettings.recommendations && currentSettings.recommendations.enabled) {
                evaluateRecommendations(true);
                setupObserver();
              } else {
                restoreAll();
              }
            }
            sendResponse({ applied: true });
            return true;

          default:
            return false;
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
