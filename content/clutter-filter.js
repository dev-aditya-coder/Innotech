/**
 * Friction Layer - Clutter & Sponsored Filter (content/clutter-filter.js)
 * Conservative, reversible filtration of explicitly marked sponsored elements and distracting overlays.
 * Disabled by default. Preserves essential page content, authentication, and payments.
 * Zero external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrictionLayer = root.FrictionLayer || {};
    root.FrictionLayer.ClutterFilter = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Conservative selectors targeting only explicitly marked promotional blocks
  const SELECTORS = {
    sponsoredGoogle: [
      '#tads',
      '#tadsb',
      'div.uEierd',
      'div[data-text-ad]',
      'div[aria-label="Ads"]',
      'div[aria-label="Sponsored"]'
    ],
    sponsoredYouTube: [
      'ytd-ad-slot-renderer',
      'ytd-in-feed-ad-layout-renderer',
      'ytd-banner-promo-renderer',
      'ytd-statement-banner-renderer',
      '#masthead-ad'
    ],
    dismissibleOverlays: [
      'div[id*="cookie-banner"]',
      'div[id*="cookie-consent"]',
      'div[class*="cookie-banner"]',
      'div[class*="cookie-notice"]',
      'div[aria-label*="cookie" i]'
    ],
    repetitiveSidebars: [
      'div#secondary #related ytd-shelf-renderer[is-promoted]'
    ]
  };

  // Registry of elements currently hidden by this module
  const hiddenElementsRegistry = new Set();
  let observer = null;
  let currentSettings = null;
  let debounceTimer = null;

  /**
   * Hide an element cleanly and reversibly.
   * @param {HTMLElement} el
   * @param {string} category
   */
  function hideElement(el, category) {
    if (!el || !(el instanceof HTMLElement)) return;
    if (el.hasAttribute('data-friction-clutter-hidden')) return;

    // Safety guard: NEVER hide forms, payments, logins, or primary video/search
    const tag = el.tagName.toLowerCase();
    if (['form', 'input', 'button', 'video', 'nav', 'header'].includes(tag)) return;
    if (el.querySelector('form, [type="password"], [name*="credit" i], [name*="pay" i]')) return;

    // Record original inline style
    const origDisplay = el.style.display || '';
    el.setAttribute('data-friction-orig-display', origDisplay);
    el.setAttribute('data-friction-clutter-hidden', category);
    el.style.display = 'none';

    hiddenElementsRegistry.add(el);
  }

  /**
   * Restore a single hidden element.
   * @param {HTMLElement} el
   */
  function restoreElement(el) {
    if (!el || !(el instanceof HTMLElement)) return;
    if (!el.hasAttribute('data-friction-clutter-hidden')) return;

    const origDisplay = el.getAttribute('data-friction-orig-display') || '';
    el.style.display = origDisplay;
    el.removeAttribute('data-friction-clutter-hidden');
    el.removeAttribute('data-friction-orig-display');

    hiddenElementsRegistry.delete(el);
  }

  /**
   * Restore all elements hidden by the clutter filter.
   */
  function restoreAll() {
    // Restore from registry
    for (const el of hiddenElementsRegistry) {
      restoreElement(el);
    }
    hiddenElementsRegistry.clear();

    // Query DOM fallback for any disconnected/re-attached nodes
    const remaining = document.querySelectorAll('[data-friction-clutter-hidden]');
    remaining.forEach(restoreElement);
  }

  /**
   * Scans and applies active clutter rules.
   */
  function applyRules() {
    if (!currentSettings || !currentSettings.clutter || !currentSettings.clutter.enabled) {
      restoreAll();
      return;
    }

    const { hideSponsored, hideOverlays, reduceSidebars } = currentSettings.clutter;

    // 1. Sponsored blocks
    if (hideSponsored) {
      const allSponsored = [...SELECTORS.sponsoredGoogle, ...SELECTORS.sponsoredYouTube];
      allSponsored.forEach(sel => {
        try {
          const matched = document.querySelectorAll(sel);
          matched.forEach(el => hideElement(el, 'sponsored'));
        } catch {
          // Selector error fallback
        }
      });
    }

    // 2. Dismissible generic cookie/consent overlays
    if (hideOverlays) {
      SELECTORS.dismissibleOverlays.forEach(sel => {
        try {
          const matched = document.querySelectorAll(sel);
          matched.forEach(el => hideElement(el, 'overlay'));
        } catch {
          // Selector error fallback
        }
      });
    }

    // 3. Repetitive sidebars
    if (reduceSidebars) {
      SELECTORS.repetitiveSidebars.forEach(sel => {
        try {
          const matched = document.querySelectorAll(sel);
          matched.forEach(el => hideElement(el, 'sidebar'));
        } catch {
          // Selector error fallback
        }
      });
    }
  }

  /**
   * Initializes or updates the clutter filter.
   * @param {object} settings
   */
  function init(settings) {
    currentSettings = settings;

    if (!settings || !settings.clutter || !settings.clutter.enabled) {
      restoreAll();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      return;
    }

    // Run initial scan
    applyRules();

    // Setup throttled MutationObserver if not active
    if (!observer && document.body) {
      observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          applyRules();
        }, 300);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  /**
   * Return count of currently hidden clutter items.
   * @returns {number}
   */
  function getHiddenCount() {
    return hiddenElementsRegistry.size;
  }

  return {
    SELECTORS,
    init,
    applyRules,
    restoreAll,
    getHiddenCount
  };
});
