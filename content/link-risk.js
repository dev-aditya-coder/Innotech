/**
 * Friction Layer - Link Risk Content Script (content/link-risk.js)
 * Inspects page links using local heuristics, displaying non-blocking explainable warning badges.
 * Never redirects, alters, or silently blocks user navigation.
 * Zero external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrictionLayer = root.FrictionLayer || {};
    root.FrictionLayer.LinkRiskContent = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LinkRisk = (typeof globalThis !== 'undefined' && globalThis.FrictionLayer && globalThis.FrictionLayer.LinkRisk)
    ? globalThis.FrictionLayer.LinkRisk
    : null;

  let currentSettings = null;
  let observer = null;
  let debounceTimer = null;
  let activeModal = null;

  /**
   * Inject styling for warning badge and accessible explanation popover.
   */
  function ensureStyles() {
    if (document.getElementById('friction-layer-risk-styles')) return;

    const style = document.createElement('style');
    style.id = 'friction-layer-risk-styles';
    style.textContent = `
      .friction-risk-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 6px;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        vertical-align: middle;
        line-height: 1.2;
        transition: transform 0.15s ease, background 0.15s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
        z-index: 10;
      }
      .friction-risk-badge:hover {
        transform: translateY(-1px);
      }
      .friction-risk-caution {
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #fcd34d;
      }
      .friction-risk-high {
        background: #fee2e2;
        color: #991b1b;
        border: 1px solid #fca5a5;
      }
      .friction-risk-popover {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #0f172a;
        color: #f1f5f9;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 20px;
        width: 90%;
        max-width: 480px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: frictionFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .friction-risk-backdrop {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(10, 17, 40, 0.7);
        backdrop-filter: blur(2px);
        z-index: 2147483646;
      }
      .friction-risk-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        border-bottom: 1px solid #1e293b;
        padding-bottom: 10px;
      }
      .friction-risk-title {
        font-size: 15px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #38bdf8;
      }
      .friction-risk-signals {
        list-style: none;
        padding: 0;
        margin: 12px 0;
      }
      .friction-risk-signal-item {
        background: #1e293b;
        border-left: 3px solid #14b8a6;
        padding: 8px 12px;
        border-radius: 4px;
        margin-bottom: 8px;
        font-size: 12px;
        line-height: 1.4;
      }
      .friction-risk-signal-item.high {
        border-left-color: #ef4444;
      }
      .friction-risk-signal-label {
        font-weight: 600;
        color: #f8fafc;
        display: block;
        margin-bottom: 2px;
      }
      .friction-risk-signal-desc {
        color: #94a3b8;
      }
      .friction-risk-destination {
        background: #020617;
        padding: 8px 10px;
        border-radius: 6px;
        font-family: monospace;
        font-size: 11px;
        color: #e2e8f0;
        word-break: break-all;
        margin-bottom: 14px;
        border: 1px solid #1e293b;
      }
      .friction-risk-disclaimer {
        font-size: 11px;
        color: #64748b;
        margin-bottom: 16px;
        line-height: 1.4;
      }
      .friction-risk-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .friction-btn {
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.15s ease;
      }
      .friction-btn-secondary {
        background: #334155;
        color: #f1f5f9;
      }
      .friction-btn-secondary:hover {
        background: #475569;
      }
      .friction-btn-primary {
        background: #0d9488;
        color: #ffffff;
      }
      .friction-btn-primary:hover {
        background: #14b8a6;
      }
      @keyframes frictionFadeIn {
        from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Close active explanation modal.
   */
  function closeModal() {
    if (activeModal) {
      if (activeModal.backdrop && activeModal.backdrop.parentNode) {
        activeModal.backdrop.parentNode.removeChild(activeModal.backdrop);
      }
      if (activeModal.dialog && activeModal.dialog.parentNode) {
        activeModal.dialog.parentNode.removeChild(activeModal.dialog);
      }
      activeModal = null;
    }
  }

  /**
   * Display safe, explainable modal dialog for observed heuristic signals.
   * @param {object} assessment
   * @param {string} destinationUrl
   */
  function showExplanationModal(assessment, destinationUrl) {
    closeModal();
    ensureStyles();

    const backdrop = document.createElement('div');
    backdrop.className = 'friction-risk-backdrop';
    backdrop.addEventListener('click', closeModal);

    const dialog = document.createElement('div');
    dialog.className = 'friction-risk-popover';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'friction-risk-title');

    // Build signals list HTML
    const signalsList = (assessment.signals || []).map(s => `
      <li class="friction-risk-signal-item ${s.severity === 'high' ? 'high' : ''}">
        <span class="friction-risk-signal-label">${escapeHtml(s.label)}</span>
        <span class="friction-risk-signal-desc">${escapeHtml(s.description)}</span>
      </li>
    `).join('');

    dialog.innerHTML = `
      <div class="friction-risk-header">
        <div id="friction-risk-title" class="friction-risk-title">
          <span>⚠️</span>
          <span>${assessment.riskLevel === 'high' ? 'Potentially Suspicious Link' : 'Link Structure Notice'}</span>
        </div>
        <button class="friction-btn friction-btn-secondary" id="friction-risk-close" style="padding: 4px 8px; font-size: 11px;">✕</button>
      </div>

      <div style="font-size: 13px; color: #cbd5e1; margin-bottom: 8px;">
        Observed Destination:
      </div>
      <div class="friction-risk-destination">${escapeHtml(destinationUrl)}</div>

      <div style="font-size: 12px; font-weight: 600; color: #94a3b8; margin-top: 10px;">
        Detected Heuristic Indicators (${assessment.signals.length}):
      </div>
      <ul class="friction-risk-signals">
        ${signalsList || '<li class="friction-risk-signal-item">No specific pattern details available.</li>'}
      </ul>

      <div class="friction-risk-disclaimer">
        <strong>Privacy & Security Note:</strong> This is a local structural heuristic check processed entirely on your machine. Friction Layer never blocks your navigation silently. You maintain full discretion.
      </div>

      <div class="friction-risk-actions">
        <button class="friction-btn friction-btn-secondary" id="friction-risk-copy">Copy URL</button>
        <button class="friction-btn friction-btn-primary" id="friction-risk-dismiss">Dismiss Notice</button>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);

    // Event listeners
    dialog.querySelector('#friction-risk-close').addEventListener('click', closeModal);
    dialog.querySelector('#friction-risk-dismiss').addEventListener('click', closeModal);
    dialog.querySelector('#friction-risk-copy').addEventListener('click', () => {
      try {
        navigator.clipboard.writeText(destinationUrl);
        const copyBtn = dialog.querySelector('#friction-risk-copy');
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copy URL'; }, 1500);
      } catch {
        // Fallback
      }
    });

    activeModal = { backdrop, dialog };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Scans a single anchor element and appends a risk badge if heuristic flags are raised.
   * @param {HTMLAnchorElement} anchor
   */
  function inspectAnchor(anchor) {
    if (!anchor || anchor.hasAttribute('data-friction-risk-checked')) return;
    anchor.setAttribute('data-friction-risk-checked', 'true');

    const href = anchor.href;
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    if (!LinkRisk) return;
    const assessment = LinkRisk.assessUrlRisk(href, currentSettings || {});
    if (assessment.riskLevel === 'low') return;

    ensureStyles();

    // Create small badge
    const badge = document.createElement('span');
    badge.className = `friction-risk-badge friction-risk-${assessment.riskLevel}`;
    badge.setAttribute('title', `${assessment.calibratedWarning}. Click to view explanation.`);
    badge.innerHTML = assessment.riskLevel === 'high' ? '⚠️ High Risk Link' : '⚠️ Caution';

    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showExplanationModal(assessment, href);
    });

    // Insert after anchor
    if (anchor.nextSibling) {
      anchor.parentNode.insertBefore(badge, anchor.nextSibling);
    } else {
      anchor.parentNode.appendChild(badge);
    }
  }

  /**
   * Scans document for links.
   */
  function scanLinks() {
    if (!currentSettings || !currentSettings.security || !currentSettings.security.enabled) {
      removeAllBadges();
      return;
    }

    const anchors = document.querySelectorAll('a[href]:not([data-friction-risk-checked])');
    anchors.forEach(inspectAnchor);
  }

  /**
   * Removes all warning badges and resets check attributes.
   */
  function removeAllBadges() {
    const badges = document.querySelectorAll('.friction-risk-badge');
    badges.forEach(b => b.remove());

    const checked = document.querySelectorAll('[data-friction-risk-checked]');
    checked.forEach(el => el.removeAttribute('data-friction-risk-checked'));
  }

  /**
   * Initialize or update link risk scanner.
   * @param {object} settings
   */
  function init(settings) {
    currentSettings = settings;

    if (!settings || !settings.security || !settings.security.enabled) {
      removeAllBadges();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      return;
    }

    scanLinks();

    if (!observer && document.body) {
      observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(scanLinks, 300);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  return {
    init,
    scanLinks,
    inspectAnchor,
    removeAllBadges,
    showExplanationModal
  };
});
