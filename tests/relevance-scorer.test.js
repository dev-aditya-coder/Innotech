/**
 * Friction Layer - Relevance Scorer Unit Tests (tests/relevance-scorer.test.js)
 */
(function () {
  'use strict';

  const { describe, it, expect } = (typeof module === 'object' && module.exports)
    ? require('./test-runner.js')
    : globalThis.FrictionTestRunner;

  const RelevanceScorer = (typeof module === 'object' && module.exports)
    ? require('../core/relevance-scorer.js')
    : globalThis.FrictionLayer.RelevanceScorer;

  describe('Relevance Scorer - Local Heuristic Engine', () => {
    it('returns score 100 on empty or whitespace query', async () => {
      const res = await RelevanceScorer.scoreResult({
        query: '   ',
        title: 'Any Title',
        snippet: 'Any Snippet'
      });
      expect(res.score).toBe(100);
      expect(res.mode).toBe('local');
    });

    it('awards high score (>= 80) for exact query phrase match in title', async () => {
      const res = await RelevanceScorer.scoreResult({
        query: 'react state management',
        title: 'React State Management in 2026: The Definitive Guide',
        snippet: 'A comprehensive guide exploring various options for react state management in modern applications.',
        url: 'https://example.com/react-state-management'
      });
      expect(res.score).toBeGreaterThanOrEqual(80);
      expect(res.score).toBeLessThanOrEqual(100);
      expect(res.breakdown.phraseBonus).toBeGreaterThan(0);
    });

    it('scores partial query matches moderately (between 30 and 75)', async () => {
      const res = await RelevanceScorer.scoreResult({
        query: 'react performance optimization',
        title: 'React Performance Guide: Rendering Cycles',
        snippet: 'Learn how components render and strategies to diagnose bottlenecks in your codebase.',
        url: 'https://example.com/react-cycles'
      });
      expect(res.score).toBeGreaterThanOrEqual(30);
      expect(res.score).toBeLessThan(75);
    });

    it('scores completely unrelated content very low (< 20)', async () => {
      const res = await RelevanceScorer.scoreResult({
        query: 'react hooks documentation',
        title: 'Best Gourmet Artisan Pizza Dough Recipes',
        snippet: 'Discover the secrets to fermenting dough over 72 hours with sourdough starter and high protein flour.',
        url: 'https://recipes.example.com/pizza-dough'
      });
      expect(res.score).toBeLessThan(20);
    });

    it('recognizes lightweight synonyms (e.g., "js" expands to "javascript")', async () => {
      const resWithSynonym = await RelevanceScorer.scoreResult({
        query: 'js tutorial',
        title: 'JavaScript Reference & Complete Guide',
        snippet: 'Learn basic and advanced modern JavaScript concepts.',
        url: 'https://example.com/javascript-guide'
      });
      expect(resWithSynonym.score).toBeGreaterThanOrEqual(50);
    });

    it('always clamps scores strictly within the range [0, 100]', async () => {
      const extremeHighScore = await RelevanceScorer.scoreResult({
        query: 'test',
        title: 'test test test test test test test test',
        snippet: 'test test test test test test test test',
        url: 'https://test.com/test'
      });
      expect(extremeHighScore.score).toBeLessThanOrEqual(100);
      expect(extremeHighScore.score).toBeGreaterThanOrEqual(0);

      const extremeLowScore = await RelevanceScorer.scoreResult({
        query: 'quantum cryptography entanglements',
        title: 'Cute Puppies Playing',
        snippet: 'Watch these golden retriever puppies roll on the grass.',
        url: 'https://pets.example.com/dogs'
      });
      expect(extremeLowScore.score).toBeLessThanOrEqual(100);
      expect(extremeLowScore.score).toBeGreaterThanOrEqual(0);
    });

    it('falls back safely to local scoring when semantic endpoint is invalid', async () => {
      const res = await RelevanceScorer.scoreResult({
        query: 'chrome extension development',
        title: 'Building Chrome Extensions with Manifest V3',
        snippet: 'A complete walkthrough of extension development, service workers, and permissions.'
      }, {
        search: {
          scoringMode: 'semantic',
          semanticEndpoint: 'https://invalid-nonexistent-domain-12345.org/score'
        }
      });
      expect(res.score).toBeGreaterThanOrEqual(50);
      expect(res.explanation).toContain('Fallback from semantic endpoint');
    });
  });
})();
