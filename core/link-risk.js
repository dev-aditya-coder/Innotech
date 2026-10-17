/**
 * Friction Layer - Link Risk Engine (core/link-risk.js)
 * Transparent, local heuristic analysis of URLs for deceptive patterns.
 * Produces calibrated, explainable signals without claiming verified threat intelligence.
 * Zero external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrictionLayer = root.FrictionLayer || {};
    root.FrictionLayer.LinkRisk = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Configured high-profile brands monitored for deceptive lookalike domains
  const MONITORED_BRANDS = [
    'google', 'paypal', 'microsoft', 'apple', 'amazon',
    'netflix', 'facebook', 'instagram', 'chase', 'wellsfargo',
    'bankofamerica', 'dropbox', 'github', 'twitter'
  ];

  // Common redirect query parameter keys
  const REDIRECT_PARAMS = new Set([
    'url', 'redirect', 'redirect_uri', 'redirect_url', 'dest',
    'destination', 'target', 'goto', 'next', 'return', 'return_to'
  ]);

  /**
   * Safely parse a URL string.
   * @param {string} rawUrl
   * @returns {URL|null}
   */
  function parseUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
      return new URL(rawUrl.trim());
    } catch {
      // Try prefixing https:// if scheme is missing
      try {
        return new URL('https://' + rawUrl.trim());
      } catch {
        return null;
      }
    }
  }

  /**
   * Checks for obvious typosquatting / character substitution.
   * @param {string} hostname
   * @returns {{ match: boolean, brand?: string, detail?: string }}
   */
  function detectLookalikeBrand(hostname) {
    const host = hostname.toLowerCase();
    
    // Normalize common leetspeak substitutions: 0->o, 1->l/i, 3->e, 5->s, @->a
    const unLeet = host
      .replace(/0/g, 'o')
      .replace(/1/g, 'l')
      .replace(/3/g, 'e')
      .replace(/5/g, 's')
      .replace(/vv/g, 'w');

    for (const brand of MONITORED_BRANDS) {
      // Exact legitimate domain match (e.g., google.com, sub.google.com) is safe
      if (host === `${brand}.com` || host.endsWith(`.${brand}.com`) || host.endsWith(`.${brand}.org`)) {
        continue;
      }

      // Check if un-leeted string contains brand and is not official
      if (unLeet.includes(brand)) {
        // Hyphenated deceptive compound (e.g. "paypal-security-update.com")
        if (host.includes(`${brand}-`) || host.includes(`-${brand}`)) {
          return {
            match: true,
            brand,
            detail: `Appears to imitate "${brand}" using compound naming (${host})`
          };
        }

        // Leetspeak imitation (e.g. "g00gle.com", "paypa1.com")
        if (!host.includes(brand) && unLeet.includes(brand)) {
          return {
            match: true,
            brand,
            detail: `Appears to imitate "${brand}" via character substitution (${host})`
          };
        }
      }
    }

    return { match: false };
  }

  /**
   * Analyzes a destination URL using transparent local heuristics.
   * @param {string} rawUrl
   * @param {object} [settings]
   * @returns {object} structured risk assessment
   */
  function assessUrlRisk(rawUrl, settings = {}) {
    const secConfig = settings.security || { enabled: true, mode: 'heuristic' };
    if (!secConfig.enabled) {
      return {
        riskLevel: 'low',
        score: 0,
        signals: [],
        source: 'local-heuristic',
        hostname: ''
      };
    }

    const parsed = parseUrl(rawUrl);
    if (!parsed) {
      return {
        riskLevel: 'caution',
        score: 30,
        signals: [{
          code: 'MALFORMED_URL',
          label: 'Unparseable URL syntax',
          description: 'The destination link structure could not be parsed as a standard web address.',
          severity: 'caution'
        }],
        source: 'local-heuristic',
        hostname: ''
      };
    }

    // Skip internal, blob, data, and extension schemes
    const protocol = parsed.protocol.toLowerCase();
    if (['chrome:', 'chrome-extension:', 'about:', 'data:', 'blob:'].includes(protocol)) {
      return {
        riskLevel: 'low',
        score: 0,
        signals: [],
        source: 'local-heuristic',
        hostname: parsed.hostname
      };
    }

    const signals = [];
    let riskPoints = 0;
    const hostname = parsed.hostname.toLowerCase();

    // 1. Misleading User-Info Credentials (e.g. https://google.com@attacker.com)
    if (parsed.username || parsed.password) {
      riskPoints += 50;
      signals.push({
        code: 'USERINFO_CREDENTIALS',
        label: 'Embedded credentials / misleading prefix',
        description: `URL contains a user-info segment ("${parsed.username}@") before the actual host (${hostname}). This pattern is frequently used to mislead users regarding destination identity.`,
        severity: 'high'
      });
    }

    // 2. Punycode / Internationalized Domain (IDN) check
    if (hostname.includes('xn--')) {
      riskPoints += 30;
      signals.push({
        code: 'PUNYCODE_IDN',
        label: 'Punycode encoded domain (IDN)',
        description: `Hostname uses Punycode ("${hostname}"). While legitimate for non-Latin languages, this is also utilized for homograph visual impersonation.`,
        severity: 'caution'
      });
    }

    // 3. Lookalike / Typosquatting Brand Imitation
    const lookalike = detectLookalikeBrand(hostname);
    if (lookalike.match) {
      riskPoints += 50;
      signals.push({
        code: 'DECEPTIVE_LOOKALIKE',
        label: 'Potential brand imitation pattern',
        description: lookalike.detail,
        severity: 'high'
      });
    }

    // 4. Excessive Subdomain Depth
    const domainParts = hostname.split('.');
    // Standard domains usually have 2-3 parts (e.g. sub.example.com). >4 parts is unusual.
    if (domainParts.length > 4) {
      const suspiciousTerms = ['login', 'verify', 'secure', 'account', 'banking', 'update', 'signin', 'service'];
      const hasSuspiciousTerm = domainParts.slice(0, -2).some(p => suspiciousTerms.includes(p));

      const points = hasSuspiciousTerm ? 35 : 20;
      riskPoints += points;
      signals.push({
        code: 'EXCESSIVE_SUBDOMAINS',
        label: 'Deeply nested subdomain structure',
        description: `Destination has ${domainParts.length} domain levels${hasSuspiciousTerm ? ' including sensitive keywords (e.g. login/secure)' : ''}.`,
        severity: hasSuspiciousTerm ? 'high' : 'caution'
      });
    }

    // 5. Raw IP Address Hostname
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const isIpv6 = hostname.startsWith('[') && hostname.endsWith(']');
    if (isIpv4 || isIpv6) {
      riskPoints += 25;
      signals.push({
        code: 'NUMERIC_IP_HOST',
        label: 'Direct IP address destination',
        description: `Link points directly to an IP address (${hostname}) rather than a registered domain name.`,
        severity: 'caution'
      });
    }

    // 6. Suspicious Percent-Encoding & Obfuscation
    const fullHref = parsed.href;
    if (/%25/i.test(fullHref) || /%2e%2e/i.test(fullHref) || /%2f/i.test(parsed.search)) {
      riskPoints += 25;
      signals.push({
        code: 'SUSPICIOUS_PERCENT_ENCODING',
        label: 'Obfuscated character encoding',
        description: 'URL contains double-encoding (%25) or path traversal characters designed to evade URL filters.',
        severity: 'caution'
      });
    }

    // 7. Open Redirect Query Parameters
    try {
      for (const [key, val] of parsed.searchParams.entries()) {
        if (REDIRECT_PARAMS.has(key.toLowerCase()) && /^https?:\/\//i.test(val)) {
          riskPoints += 20;
          signals.push({
            code: 'OPEN_REDIRECT_PARAM',
            label: 'Embedded redirect parameter',
            description: `Parameter "${key}" contains an external forwarding destination (${val.slice(0, 50)}...).`,
            severity: 'caution'
          });
          break;
        }
      }
    } catch {
      // Ignore param parsing failure
    }

    // Score clamping & Classification
    const finalScore = Math.min(100, Math.max(0, riskPoints));
    let riskLevel = 'low';
    let calibratedWarning = 'No heuristic risks identified';

    if (finalScore >= 45) {
      riskLevel = 'high';
      calibratedWarning = 'Potentially suspicious link (Multiple heuristic indicators detected)';
    } else if (finalScore >= 20) {
      riskLevel = 'caution';
      calibratedWarning = 'Caution advised (Unusual link structure detected)';
    }

    return {
      riskLevel,
      score: finalScore,
      signals,
      hostname,
      source: 'local-heuristic',
      calibratedWarning,
      timestamp: Date.now()
    };
  }

  return {
    MONITORED_BRANDS,
    REDIRECT_PARAMS,
    parseUrl,
    detectLookalikeBrand,
    assessUrlRisk
  };
});
