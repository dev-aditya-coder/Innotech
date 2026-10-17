/**
 * Friction Layer - Quality Scorer (core/quality-scorer.js)
 * Transparent, evidence-based quality evaluator relying strictly on visible DOM signals.
 * Never fabricates data, credentials, or reviews.
 * Zero external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrictionLayer = root.FrictionLayer || {};
    root.FrictionLayer.QualityScorer = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Configured high-credibility public domains and educational/standards TLDs
  const REPUTABLE_TLDS = new Set(['.edu', '.gov', '.mil']);
  const TRUSTED_DOMAINS = new Set([
    'developer.mozilla.org',
    'w3.org',
    'ietf.org',
    'en.wikipedia.org',
    'github.com',
    'stackoverflow.com',
    'arxiv.org',
    'acm.org',
    'ieee.org',
    'nature.com',
    'nih.gov',
    'csrc.nist.gov'
  ]);

  /**
   * Evaluates text similarity (Jaccard similarity on 3-character n-grams) for duplicate detection.
   * @param {string} a
   * @param {string} b
   * @returns {number} 0.0 to 1.0
   */
  function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanA === cleanB) return 1.0;
    if (cleanA.length < 3 || cleanB.length < 3) return 0;

    const ngramsA = new Set();
    for (let i = 0; i <= cleanA.length - 3; i++) {
      ngramsA.add(cleanA.slice(i, i + 3));
    }
    let intersection = 0;
    const ngramsB = new Set();
    for (let i = 0; i <= cleanB.length - 3; i++) {
      const g = cleanB.slice(i, i + 3);
      ngramsB.add(g);
      if (ngramsA.has(g)) intersection++;
    }
    const union = ngramsA.size + ngramsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Evaluate a single search result for verifiable page-level quality signals.
   * @param {object} item { title, snippet, url, relevanceScore, dateText, visibleStats }
   * @param {object} context { allTitles: string[], settings: object }
   * @returns {object} { qualityScore, rating, evidenceCount, signals, explanation }
   */
  function evaluateQuality(item, context = {}) {
    const { title = '', snippet = '', url = '', relevanceScore = 50, dateText = '', visibleStats = {} } = item;
    const { allTitles = [], settings = {} } = context;
    const qualityConfig = settings.quality || {
      signals: {
        metadataCompleteness: true,
        relevance: true,
        duplicateDetection: true,
        sourceSignals: true
      },
      minimumEvidence: 2
    };

    const signals = [];
    let evidenceCount = 0;
    let earnedPoints = 0;
    let totalPossiblePoints = 0;

    // 1. Signal: Metadata Completeness
    if (qualityConfig.signals.metadataCompleteness) {
      let metaScore = 0;
      const details = [];

      // Title check
      if (title.length >= 15 && title.length <= 110) {
        metaScore += 10;
        details.push('Well-structured title');
      } else if (title.length > 0) {
        metaScore += 5;
        details.push('Title present but short/excessive');
      }

      // Snippet check
      if (snippet.length >= 50) {
        metaScore += 15;
        details.push('Rich informative snippet');
      } else if (snippet.length > 0) {
        metaScore += 7;
        details.push('Brief snippet');
      }

      // Valid URL
      try {
        const u = new URL(url);
        if (u.protocol === 'https:') {
          metaScore += 5;
          details.push('Secure HTTPS origin');
        }
      } catch {
        // Invalid or missing URL
      }

      if (dateText) {
        metaScore += 5;
        details.push('Publication date specified');
      }

      const passed = metaScore >= 20;
      signals.push({
        name: 'Metadata Completeness',
        passed,
        score: metaScore,
        maxScore: 35,
        detail: details.join(', ') || 'Minimal metadata provided'
      });

      earnedPoints += metaScore;
      totalPossiblePoints += 35;
      evidenceCount++;
    }

    // 2. Signal: Content Relevance
    if (qualityConfig.signals.relevance) {
      const relScore = Number(relevanceScore) || 0;
      let points = Math.round((relScore / 100) * 30);
      const passed = relScore >= 45;

      signals.push({
        name: 'Content Relevance',
        passed,
        score: points,
        maxScore: 30,
        detail: `Estimated query match: ${relScore}%`
      });

      earnedPoints += points;
      totalPossiblePoints += 30;
      evidenceCount++;
    }

    // 3. Signal: Duplicate / Syndication Detection
    if (qualityConfig.signals.duplicateDetection) {
      let isDuplicate = false;
      let dupMatch = '';

      if (Array.isArray(allTitles)) {
        for (const otherTitle of allTitles) {
          if (otherTitle && otherTitle !== title) {
            const sim = stringSimilarity(title, otherTitle);
            if (sim > 0.82) {
              isDuplicate = true;
              dupMatch = otherTitle;
              break;
            }
          }
        }
      }

      const score = isDuplicate ? 0 : 20;
      signals.push({
        name: 'Uniqueness',
        passed: !isDuplicate,
        score,
        maxScore: 20,
        detail: isDuplicate ? `Near-duplicate of another result: "${dupMatch.slice(0, 40)}..."` : 'Unique title in current results'
      });

      earnedPoints += score;
      totalPossiblePoints += 20;
      evidenceCount++;
    }

    // 4. Signal: Source & Domain Signals (Conservative, verified TLDs and known specs)
    if (qualityConfig.signals.sourceSignals) {
      let domainPoints = 5; // neutral base
      let detail = 'Standard web domain';

      try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();

        // Check authoritative TLDs
        const matchesTld = Array.from(REPUTABLE_TLDS).some(tld => host.endsWith(tld));
        if (matchesTld) {
          domainPoints = 15;
          detail = 'Government / Academic authoritative top-level domain';
        } else if (TRUSTED_DOMAINS.has(host) || Array.from(TRUSTED_DOMAINS).some(td => host.endsWith('.' + td))) {
          domainPoints = 15;
          detail = 'Recognized technical / open standards documentation domain';
        } else if (host.split('.').length > 4) {
          domainPoints = 2;
          detail = 'Deeply nested subdomain structure';
        }
      } catch {
        domainPoints = 0;
        detail = 'Unparseable URL destination';
      }

      signals.push({
        name: 'Source Structure',
        passed: domainPoints >= 5,
        score: domainPoints,
        maxScore: 15,
        detail
      });

      earnedPoints += domainPoints;
      totalPossiblePoints += 15;
      evidenceCount++;
    }

    // Check minimum evidence requirement
    const minRequired = Number(qualityConfig.minimumEvidence) || 2;
    if (evidenceCount < minRequired || totalPossiblePoints === 0) {
      return {
        qualityScore: null,
        rating: 'Insufficient Data',
        evidenceCount,
        signals,
        explanation: `Only ${evidenceCount} verifiable signals detected (minimum required: ${minRequired}). Quality rating omitted.`
      };
    }

    const normalizedQuality = Math.min(100, Math.max(0, Math.round((earnedPoints / totalPossiblePoints) * 100)));

    let rating = 'Limited Evidence';
    if (normalizedQuality >= 75) rating = 'High Evidence';
    else if (normalizedQuality >= 50) rating = 'Moderate Evidence';
    else if (normalizedQuality < 30) rating = 'Weak Evidence';

    return {
      qualityScore: normalizedQuality,
      rating,
      evidenceCount,
      signals,
      explanation: `Quality indicator: ${rating} (${normalizedQuality}/100) based on ${evidenceCount} inspectable signals. Popularity/metrics are not fabricated.`
    };
  }

  /**
   * Sort an array of result DOM elements by quality score in the browser DOM.
   * Records original index on elements for reversible restoration.
   * @param {HTMLElement[]} elements
   * @param {Map<HTMLElement, number>} scoresMap
   */
  function sortElementsByQuality(elements, scoresMap) {
    if (!elements || elements.length <= 1) return;
    const parent = elements[0].parentNode;
    if (!parent) return;

    // Record original index if not already recorded
    elements.forEach((el, idx) => {
      if (!el.hasAttribute('data-friction-orig-index')) {
        el.setAttribute('data-friction-orig-index', String(idx));
      }
    });

    const sorted = [...elements].sort((a, b) => {
      const scoreA = scoresMap.get(a) ?? -1;
      const scoreB = scoresMap.get(b) ?? -1;
      return scoreB - scoreA;
    });

    // Re-append in sorted order
    sorted.forEach(el => parent.appendChild(el));
  }

  /**
   * Restore DOM elements to their original order.
   * @param {HTMLElement[]} elements
   */
  function restoreElementOrder(elements) {
    if (!elements || elements.length <= 1) return;
    const parent = elements[0].parentNode;
    if (!parent) return;

    const restored = [...elements].sort((a, b) => {
      const idxA = parseInt(a.getAttribute('data-friction-orig-index') || '0', 10);
      const idxB = parseInt(b.getAttribute('data-friction-orig-index') || '0', 10);
      return idxA - idxB;
    });

    restored.forEach(el => {
      parent.appendChild(el);
      el.removeAttribute('data-friction-orig-index');
    });
  }

  return {
    REPUTABLE_TLDS,
    TRUSTED_DOMAINS,
    stringSimilarity,
    evaluateQuality,
    sortElementsByQuality,
    restoreElementOrder
  };
});
