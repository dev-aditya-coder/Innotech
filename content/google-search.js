/**
 * Friction Layer - Google Search Content Script (content/google-search.js)
 * Local relevance evaluation, evidence-based quality indicators, and reversible filtering.
 * Never alters Google server-side rankings or fabricates data.
 * Zero external dependencies.
 */
(function () {
  'use strict';

  // Dependencies from global namespace
  const FL = globalThis.FrictionLayer || {};
  const Settings = FL.Settings;
  const RelevanceScorer = FL.RelevanceScorer;
  const QualityScorer = FL.QualityScorer;
  const ClutterFilter = FL.ClutterFilter;
  const LinkRiskContent = FL.LinkRiskContent;
  const Messaging = FL.Messaging;

  let currentSettings = null;
  let currentQuery = '';
  let hiddenResultCount = 0;
  let totalResultCount = 0;
  let isRevealMode = false;
  let observer = null;
  let debounceTimer = null;
  const scoredItemsMap = new Map(); // DOMElement -> { relevance, quality }

  /**
   * Inject CSS styles for badges, banners, and reversible hiding.
   */
  function ensureStyles() {
    if (document.getElementById('friction-layer-search-styles')) return;

    const style = document.createElement('style');
    style.id = 'friction-layer-search-styles';
    style.textContent = `
      .friction-hidden-result {
        display: none !important;
      }
      .friction-reveal-all .friction-hidden-result {
        display: block !important;
        opacity: 0.65;
        border-left: 3px dashed #f59e0b;
        padding-left: 8px;
        margin-top: 6px;
      }
      .friction-score-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        border-radius: 4px;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-weight: 600;
        margin-right: 8px;
        vertical-align: middle;
        line-height: 1.3;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        cursor: help;
      }
      .friction-score-high {
        background: #0f766e;
        color: #ffffff;
      }
      .friction-score-med {
        background: #0369a1;
        color: #ffffff;
      }
      .friction-score-low {
        background: #b45309;
        color: #ffffff;
      }
      .friction-quality-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-weight: 500;
        margin-right: 6px;
        background: #1e293b;
        color: #94a3b8;
        border: 1px solid #334155;
      }
      .friction-search-banner {
        background: #0f172a;
        color: #f1f5f9;
        border: 1px solid #14b8a6;
        border-radius: 8px;
        padding: 10px 14px;
        margin: 12px 0 16px 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        z-index: 99;
      }
      .friction-banner-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .friction-banner-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .friction-banner-btn {
        background: #1e293b;
        color: #2dd4bf;
        border: 1px solid #0d9488;
        padding: 4px 10px;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .friction-banner-btn:hover {
        background: #0d9488;
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Extract query from URL parameters or search input.
   * @returns {string}
   */
  function extractQuery() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) return q.trim();

    const input = document.querySelector('input[name="q"], textarea[name="q"]');
    return input ? input.value.trim() : '';
  }

  /**
   * Unwrap Google redirect URL if present (/url?q=...).
   * @param {string} href
   * @returns {string}
   */
  function cleanUrl(href) {
    if (!href) return '';
    try {
      if (href.startsWith('/url?') || href.includes('google.com/url?')) {
        const u = new URL(href, window.location.origin);
        const actual = u.searchParams.get('q') || u.searchParams.get('url');
        if (actual) return actual;
      }
      return href;
    } catch {
      return href;
    }
  }

  /**
   * Conservative extraction of organic Google search results.
   * Excludes knowledge panels, advertisements, carousels, and search filters.
   * @returns {HTMLElement[]}
   */
  function findOrganicResults() {
    const candidates = [];
    
    // Primary selectors for standard desktop Google Search
    const searchRoot = document.getElementById('rso') || document.getElementById('search') || document.body;
    if (!searchRoot) return [];

    // Supported organic containers
    const standardContainers = searchRoot.querySelectorAll('div.MjjYud, div.g, div[data-hveid]');

    for (const el of standardContainers) {
      // Exclude ad blocks (extended with prototype's submission-container pattern)
      if (el.closest('#tads, #tadsb, .uEierd, [data-text-ad], div[aria-label="Ads"], [data-role="submission-container"]')) continue;

      // Exclude promoted commercial units (from prototype's commercial-unit-desktop-top)
      if (el.closest('.commercial-unit-desktop-top')) continue;

      // Exclude knowledge graph / right sidebar / related searches
      if (el.closest('#rhs, div.commercial-unit, div[data-rw]')) continue;

      // Exclude elements containing ad-block markers (from prototype's data-adblock check)
      if (el.querySelector('[data-adblock]')) continue;

      // Must have an h3 header and an anchor tag
      const h3 = el.querySelector('h3');
      const anchor = el.querySelector('a[href]');
      if (!h3 || !anchor) continue;

      const rawHref = anchor.getAttribute('href') || '';
      if (rawHref.startsWith('/search') || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;

      // Filter out internal Google cache/sub-component URLs (from prototype)
      if (rawHref.includes('googleusercontent.com') || rawHref.match(/^https?:\/\/(?:www\.)?google\.com(?:\/|$)/)) continue;

      // Ensure we haven't already captured an ancestor or child of this element
      const isDuplicateOrNested = candidates.some(existing => existing.contains(el) || el.contains(existing));
      if (!isDuplicateOrNested) {
        candidates.push(el);
      }
    }

    return candidates;
  }

  /**
   * Extract title, snippet, and URL text safely using DOM properties (no innerHTML).
   * @param {HTMLElement} node
   * @returns {object}
   */
  function extractResultData(node) {
    const h3 = node.querySelector('h3');
    const title = h3 ? h3.textContent.trim() : '';

    const anchor = node.querySelector('a[href]');
    const rawHref = anchor ? anchor.getAttribute('href') : '';
    const url = cleanUrl(rawHref);

    // Snippet extraction with fallbacks (includes prototype's .yBFveb selector)
    const snippetEl = node.querySelector('div.VwiC3b, div.IsZvec, div.yBFveb, div[style*="-webkit-line-clamp"]');
    let snippet = snippetEl ? snippetEl.textContent.trim() : '';

    if (!snippet) {
      // Fallback: collect text from non-title divs
      const textNodes = Array.from(node.querySelectorAll('div, span, p'))
        .filter(n => n !== h3 && !h3.contains(n) && n.children.length === 0)
        .map(n => n.textContent.trim())
        .filter(t => t.length > 25);
      snippet = textNodes.slice(0, 2).join(' ');
    }

    // Optional date text
    const dateEl = node.querySelector('span.LEwnzc, span.kDYuHf');
    const dateText = dateEl ? dateEl.textContent.trim() : '';

    return { title, snippet, url, dateText };
  }

  /**
   * Render or update the persistent top notification banner.
   */
  function updateBanner() {
    ensureStyles();

    let banner = document.getElementById('friction-layer-search-banner');
    const searchRoot = document.getElementById('rso') || document.getElementById('search') || document.getElementById('center_col');

    if (!searchRoot) return;

    if (!currentSettings || !currentSettings.enabled || !currentSettings.search.enabled) {
      if (banner) banner.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'friction-layer-search-banner';
      banner.className = 'friction-search-banner';
      searchRoot.insertBefore(banner, searchRoot.firstChild);
    }

    const threshold = currentSettings.search.threshold;

    banner.innerHTML = `
      <div class="friction-banner-left">
        <span style="font-size: 14px;">🛡️</span>
        <span><strong>Friction Layer:</strong> ${hiddenResultCount} of ${totalResultCount} results hidden below ${threshold}% relevance.</span>
      </div>
      <div class="friction-banner-actions">
        <button class="friction-banner-btn" id="friction-toggle-reveal">
          ${isRevealMode ? 'Re-Hide Filtered' : 'Show Hidden Results'}
        </button>
        <button class="friction-banner-btn" id="friction-reprocess">
          Reprocess
        </button>
      </div>
    `;

    banner.querySelector('#friction-toggle-reveal').addEventListener('click', () => {
      isRevealMode = !isRevealMode;
      const target = document.getElementById('rso') || document.getElementById('search') || document.body;
      if (isRevealMode) {
        target.classList.add('friction-reveal-all');
      } else {
        target.classList.remove('friction-reveal-all');
      }
      updateBanner();
    });

    banner.querySelector('#friction-reprocess').addEventListener('click', () => {
      reprocessResults(true);
    });
  }

  /**
   * Evaluates all detected organic search results.
   * @param {boolean} force
   */
  async function reprocessResults(force = false) {
    if (!currentSettings || !currentSettings.enabled || !currentSettings.search.enabled) {
      restoreAll();
      return;
    }

    ensureStyles();
    currentQuery = extractQuery();
    const results = findOrganicResults();
    totalResultCount = results.length;
    let hiddenNow = 0;

    const threshold = currentSettings.search.threshold;
    const allTitles = results.map(r => {
      const h3 = r.querySelector('h3');
      return h3 ? h3.textContent.trim() : '';
    });

    const qualityScoresMap = new Map();

    for (const node of results) {
      if (node.hasAttribute('data-friction-processed') && !force) {
        if (node.classList.contains('friction-hidden-result')) {
          hiddenNow++;
        }
        continue;
      }

      node.setAttribute('data-friction-processed', 'true');
      const data = extractResultData(node);

      // Score relevance
      let relevanceResult = { score: 100, explanation: '' };
      if (RelevanceScorer) {
        relevanceResult = await RelevanceScorer.scoreResult({
          query: currentQuery,
          title: data.title,
          snippet: data.snippet,
          url: data.url
        }, currentSettings);
      }

      // Score quality
      let qualityResult = null;
      if (QualityScorer && currentSettings.quality && currentSettings.quality.enabled) {
        qualityResult = QualityScorer.evaluateQuality({
          title: data.title,
          snippet: data.snippet,
          url: data.url,
          relevanceScore: relevanceResult.score,
          dateText: data.dateText
        }, { allTitles, settings: currentSettings });

        if (qualityResult.qualityScore !== null) {
          qualityScoresMap.set(node, qualityResult.qualityScore);
        }
      }

      scoredItemsMap.set(node, { relevance: relevanceResult, quality: qualityResult });

      // Attach relevance badge
      const h3 = node.querySelector('h3');
      if (h3) {
        // Remove existing badge if reprocessing
        const oldBadge = node.querySelector('.friction-score-badge');
        if (oldBadge) oldBadge.remove();

        const badge = document.createElement('span');
        badge.className = 'friction-score-badge';
        if (relevanceResult.score >= 70) badge.classList.add('friction-score-high');
        else if (relevanceResult.score >= threshold) badge.classList.add('friction-score-med');
        else badge.classList.add('friction-score-low');

        badge.textContent = `${relevanceResult.score}%`;
        badge.setAttribute('title', relevanceResult.explanation);

        h3.parentNode.insertBefore(badge, h3);

        // Quality badge if enabled
        if (qualityResult && qualityResult.rating !== 'Insufficient Data') {
          const oldQBadge = node.querySelector('.friction-quality-badge');
          if (oldQBadge) oldQBadge.remove();

          const qBadge = document.createElement('span');
          qBadge.className = 'friction-quality-badge';
          qBadge.textContent = qualityResult.rating;
          qBadge.setAttribute('title', qualityResult.explanation);
          h3.parentNode.insertBefore(qBadge, h3);
        }
      }

      // Check threshold and hide if low relevance
      if (relevanceResult.score < threshold) {
        node.classList.add('friction-hidden-result');
        node.setAttribute('data-friction-hidden', 'true');
        hiddenNow++;
      } else {
        node.classList.remove('friction-hidden-result');
        node.removeAttribute('data-friction-hidden');
      }
    }

    // Optional quality sorting if enabled
    if (QualityScorer && currentSettings.quality && currentSettings.quality.enabled && currentSettings.quality.sortResults) {
      QualityScorer.sortElementsByQuality(results, qualityScoresMap);
    }

    hiddenResultCount = hiddenNow;
    updateBanner();
  }

  /**
   * Restore all hidden results to normal visibility.
   */
  function restoreAll() {
    isRevealMode = false;
    const target = document.getElementById('rso') || document.getElementById('search') || document.body;
    if (target) target.classList.remove('friction-reveal-all');

    const hiddenElements = document.querySelectorAll('.friction-hidden-result, [data-friction-hidden]');
    hiddenElements.forEach(el => {
      el.classList.remove('friction-hidden-result');
      el.removeAttribute('data-friction-hidden');
    });

    // Remove score badges
    const badges = document.querySelectorAll('.friction-score-badge, .friction-quality-badge');
    badges.forEach(b => b.remove());

    const processed = document.querySelectorAll('[data-friction-processed]');
    processed.forEach(p => p.removeAttribute('data-friction-processed'));

    // Restore original DOM sorting if altered
    if (QualityScorer) {
      const results = findOrganicResults();
      QualityScorer.restoreElementOrder(results);
    }

    const banner = document.getElementById('friction-layer-search-banner');
    if (banner) banner.remove();

    hiddenResultCount = 0;
  }

  /**
   * Setup MutationObserver with loop prevention and debouncing.
   */
  function setupObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      // Prevent loops triggered by our own badges or banners
      let hasExternalChanges = false;
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          if (added instanceof HTMLElement) {
            if (!added.id.startsWith('friction-layer-') && !added.className.includes('friction-')) {
              hasExternalChanges = true;
              break;
            }
          }
        }
        if (hasExternalChanges) break;
      }

      if (hasExternalChanges) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          reprocessResults(false);
        }, 300);
      }
    });

    const root = document.getElementById('search') || document.getElementById('rso') || document.body;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  /**
   * Initialize Google Search processing and sub-features.
   */
  async function init() {
    if (!Settings) return;

    currentSettings = await Settings.getSettings();

    // Init sub-modules
    if (ClutterFilter) ClutterFilter.init(currentSettings);
    if (LinkRiskContent) LinkRiskContent.init(currentSettings);

    if (currentSettings.enabled && currentSettings.search.enabled) {
      reprocessResults(true);
      setupObserver();
    } else {
      restoreAll();
    }

    // Register message handler for popup/background commands
    if (Messaging && Messaging.registerMessageHandler) {
      Messaging.registerMessageHandler((message, sender, sendResponse) => {
        if (!message || !message.type) return false;

        switch (message.type) {
          case Messaging.MESSAGE_TYPES.GET_TAB_STATUS:
            sendResponse({
              pageType: 'google-search',
              hiddenCount: hiddenResultCount + (ClutterFilter ? ClutterFilter.getHiddenCount() : 0),
              totalCount: totalResultCount,
              query: currentQuery,
              isRevealMode
            });
            return true;

          case Messaging.MESSAGE_TYPES.RESTORE_CURRENT_PAGE:
            isRevealMode = true;
            const target = document.getElementById('rso') || document.getElementById('search') || document.body;
            if (target) target.classList.add('friction-reveal-all');
            if (ClutterFilter) ClutterFilter.restoreAll();
            updateBanner();
            sendResponse({ restored: true });
            return true;

          case Messaging.MESSAGE_TYPES.REPROCESS_CURRENT_PAGE:
            reprocessResults(true);
            if (ClutterFilter) ClutterFilter.applyRules();
            sendResponse({ reprocessed: true });
            return true;

          case Messaging.MESSAGE_TYPES.SETTINGS_CHANGED:
            if (message.settings) {
              currentSettings = message.settings;
              if (ClutterFilter) ClutterFilter.init(currentSettings);
              if (LinkRiskContent) LinkRiskContent.init(currentSettings);

              if (currentSettings.enabled && currentSettings.search.enabled) {
                reprocessResults(true);
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

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
