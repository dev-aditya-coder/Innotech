/**
 * Friction Layer - Settings & Recommendation Unit Tests (tests/settings.test.js)
 */
(function () {
  'use strict';

  const { describe, it, expect } = (typeof module === 'object' && module.exports)
    ? require('./test-runner.js')
    : globalThis.FrictionTestRunner;

  const Settings = (typeof module === 'object' && module.exports)
    ? require('../core/settings.js')
    : globalThis.FrictionLayer.Settings;

  const RecommendationEngine = (typeof module === 'object' && module.exports)
    ? require('../core/recommendation-engine.js')
    : globalThis.FrictionLayer.RecommendationEngine;

  describe('Settings Module - Validation, Merging & Recovery', () => {
    it('provides complete default settings schema', () => {
      const def = Settings.DEFAULT_SETTINGS;
      expect(def.enabled).toBe(true);
      expect(def.search.threshold).toBe(45);
      expect(def.search.scoringMode).toBe('local');
      expect(def.recommendations.enabled).toBe(false);
      expect(def.quality.enabled).toBe(true);
      expect(def.security.enabled).toBe(true);
      expect(def.clutter.enabled).toBe(false);
    });

    it('recovers safely from missing, null, or malformed input', () => {
      const repaired = Settings.validateSettings(null);
      expect(repaired.enabled).toBe(true);
      expect(repaired.search.threshold).toBe(45);

      const malformed = Settings.validateSettings({
        search: { threshold: -50, scoringMode: 'invalid_mode' },
        recommendations: { blockedKeywords: 'not an array' },
        quality: { minimumEvidence: 'abc' }
      });

      // Threshold was negative -> recovered to default 45
      expect(malformed.search.threshold).toBe(45);
      // Scoring mode invalid -> recovered to 'local'
      expect(malformed.search.scoringMode).toBe('local');
      // Blocked keywords was string -> recovered to empty array
      expect(Array.isArray(malformed.recommendations.blockedKeywords)).toBe(true);
      // Min evidence was invalid -> recovered to 2
      expect(malformed.quality.minimumEvidence).toBe(2);
    });

    it('deep-merges partial updates without overwriting unrelated sibling keys', () => {
      const base = Settings.DEFAULT_SETTINGS;
      const partial = {
        search: { threshold: 60 }
      };
      const merged = Settings.deepMerge(base, partial);

      expect(merged.search.threshold).toBe(60);
      expect(merged.search.enabled).toBe(true); // Sibling key preserved!
      expect(merged.search.scoringMode).toBe('local'); // Sibling key preserved!
      expect(merged.quality.enabled).toBe(true); // Top-level sibling key preserved!
    });
  });

  describe('Recommendation Engine - Rules & Allowlist Precedence', () => {
    it('returns blocked=false when feature is disabled', () => {
      const item = { title: 'SHOCKING Drama Exploded!', channel: 'DramaAlert' };
      const res = RecommendationEngine.evaluateRecommendation(item, {
        recommendations: { enabled: false }
      });
      expect(res.blocked).toBe(false);
      expect(res.reason).toBe('feature-disabled');
    });

    it('blocks item matching a blocked keyword', () => {
      const item = { title: 'This Is A Shocking Discovery', channel: 'TechVlog' };
      const res = RecommendationEngine.evaluateRecommendation(item, {
        recommendations: {
          enabled: true,
          strategy: 'keywords',
          blockedKeywords: ['shocking']
        }
      });
      expect(res.blocked).toBe(true);
      expect(res.reason).toBe('blocked-keyword');
    });

    it('channel allowlist ALWAYS takes precedence over blocked keywords or topics', () => {
      const item = {
        title: 'SHOCKING Scientific Discovery About Black Holes',
        channel: 'Veritasium'
      };
      const res = RecommendationEngine.evaluateRecommendation(item, {
        recommendations: {
          enabled: true,
          strategy: 'combined',
          blockedKeywords: ['shocking'],
          blockedTopics: ['clickbait'],
          allowedChannels: ['Veritasium']
        }
      });
      // Should NOT be blocked because Veritasium is in allowedChannels!
      expect(res.blocked).toBe(false);
      expect(res.reason).toBe('allowed-channel');
      expect(res.matchedRule).toBe('Veritasium');
    });

    it('enforces Focus Mode by suppressing recommendations unless on allowlist', () => {
      const item = { title: 'Ordinary Daily Vlog', channel: 'RandomChannel' };
      const res = RecommendationEngine.evaluateRecommendation(item, {
        recommendations: {
          enabled: true,
          focusMode: true,
          allowedChannels: []
        }
      });
      expect(res.blocked).toBe(true);
      expect(res.reason).toBe('focus-mode');
    });
  });
})();
