/**
 * Friction Layer - Link Risk Engine Unit Tests (tests/link-risk.test.js)
 */
(function () {
  'use strict';

  const { describe, it, expect } = (typeof module === 'object' && module.exports)
    ? require('./test-runner.js')
    : globalThis.FrictionTestRunner;

  const LinkRisk = (typeof module === 'object' && module.exports)
    ? require('../core/link-risk.js')
    : globalThis.FrictionLayer.LinkRisk;

  describe('Link Risk Engine - Local Heuristic Checks', () => {
    it('evaluates legitimate URLs with low risk and zero warnings', () => {
      const legitimateUrls = [
        'https://www.google.com/search?q=javascript+documentation',
        'https://github.com/torvalds/linux',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        'https://en.wikipedia.org/wiki/Computer_science',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      ];

      for (const url of legitimateUrls) {
        const assessment = LinkRisk.assessUrlRisk(url);
        expect(assessment.riskLevel).toBe('low');
        expect(assessment.score).toBeLessThan(20);
        expect(assessment.signals.length).toBe(0);
      }
    });

    it('detects misleading user-info credential abuse (high risk)', () => {
      const deceptiveUrl = 'https://google.com@attacker-controlled-destination.example.com/login';
      const assessment = LinkRisk.assessUrlRisk(deceptiveUrl);

      expect(assessment.riskLevel).toBe('high');
      expect(assessment.score).toBeGreaterThanOrEqual(45);
      const signalCodes = assessment.signals.map(s => s.code);
      expect(signalCodes).toContain('USERINFO_CREDENTIALS');
    });

    it('detects typosquatting and deceptive brand imitation (high risk)', () => {
      const typosquatUrl = 'https://paypa1-security-verify.example.com/account';
      const assessment = LinkRisk.assessUrlRisk(typosquatUrl);

      expect(assessment.riskLevel).toBe('high');
      const signalCodes = assessment.signals.map(s => s.code);
      expect(signalCodes).toContain('DECEPTIVE_LOOKALIKE');
    });

    it('detects punycode homograph domains (caution risk)', () => {
      const punycodeUrl = 'https://xn--e1afmkfd.xn--p1ai/login';
      const assessment = LinkRisk.assessUrlRisk(punycodeUrl);

      expect(assessment.riskLevel).toBe('caution');
      const signalCodes = assessment.signals.map(s => s.code);
      expect(signalCodes).toContain('PUNYCODE_IDN');
    });

    it('detects open redirect parameters carrying external destinations (caution risk)', () => {
      const redirectUrl = 'https://legit-site.example.com/redirect?dest=https://external-target.com/page';
      const assessment = LinkRisk.assessUrlRisk(redirectUrl);

      expect(assessment.riskLevel).toBe('caution');
      const signalCodes = assessment.signals.map(s => s.code);
      expect(signalCodes).toContain('OPEN_REDIRECT_PARAM');
    });

    it('detects obfuscated double percent-encoding', () => {
      const obfuscatedUrl = 'https://example.com/%252e%252e/secret';
      const assessment = LinkRisk.assessUrlRisk(obfuscatedUrl);

      expect(assessment.riskLevel).toBe('caution');
      const signalCodes = assessment.signals.map(s => s.code);
      expect(signalCodes).toContain('SUSPICIOUS_PERCENT_ENCODING');
    });

    it('uses calibrated, transparent language and never claims verified threat intelligence', () => {
      const deceptiveUrl = 'https://google.com@bad.example.com';
      const assessment = LinkRisk.assessUrlRisk(deceptiveUrl);

      expect(assessment.source).toBe('local-heuristic');
      // Must NOT claim malware or virus
      expect(assessment.calibratedWarning).toContain('Potentially suspicious link');
    });
  });
})();
