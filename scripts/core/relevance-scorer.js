/**
 * Friction Layer - Relevance Scorer (core/relevance-scorer.js)
 * High-performance, transparent local text relevance evaluation with modular semantic adapter.
 * Supports exact phrase matching, normalized term frequency, lightweight stemming, and synonym expansion.
 * Zero external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrictionLayer = root.FrictionLayer || {};
    root.FrictionLayer.RelevanceScorer = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Standard lightweight stop words
  const STOP_WORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
    'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
    'by', 'can', 'did', 'do', 'does', 'doing', 'don', 'down', 'during', 'each', 'few', 'for',
    'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself',
    'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
    'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off',
    'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
    'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
    'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
    'which', 'while', 'who', 'whom', 'why', 'with', 'you', 'your', 'yours', 'yourself'
  ]);

  // Lightweight synonym & topic expansion dictionary
  const SYNONYM_MAP = {
    'js': ['javascript', 'ecmascript'],
    'javascript': ['js', 'ecmascript'],
    'ts': ['typescript'],
    'typescript': ['ts'],
    'py': ['python'],
    'python': ['py'],
    'docs': ['documentation', 'reference', 'manual', 'guide'],
    'doc': ['documentation', 'reference', 'guide'],
    'documentation': ['docs', 'doc', 'reference', 'guide'],
    'tutorial': ['guide', 'walkthrough', 'howto', 'examples', 'learning'],
    'guide': ['tutorial', 'walkthrough', 'reference', 'docs'],
    'auth': ['authentication', 'authorization', 'login', 'oauth'],
    'ai': ['artificial intelligence', 'machine learning', 'llm'],
    'ext': ['extension', 'addon', 'plugin'],
    'extension': ['ext', 'addon', 'plugin', 'extensions'],
    'perf': ['performance', 'speed', 'benchmark', 'optimization'],
    'performance': ['perf', 'speed', 'optimization', 'latency'],
    'sec': ['security', 'protection', 'vulnerability']
  };

  // In-memory LRU-like scoring cache
  const localCache = new Map();
  const MAX_CACHE_ENTRIES = 500;

  /**
   * Normalize input text: lowercases, strips accents, removes punctuation.
   * @param {string} text
   * @returns {string}
   */
  function normalize(text) {
    if (typeof text !== 'string') return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacritics
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Lightweight English suffix stemming.
   * @param {string} word
   * @returns {string}
   */
  function stem(word) {
    if (!word || word.length <= 3) return word;
    if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
    if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
    if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
    return word;
  }

  /**
   * Tokenize text into terms.
   * @param {string} text
   * @returns {string[]}
   */
  function tokenize(text) {
    const clean = normalize(text);
    if (!clean) return [];
    return clean.split(' ').filter(t => t.length > 0);
  }

  /**
   * Filter out stop words unless all tokens are stop words.
   * @param {string[]} tokens
   * @returns {string[]}
   */
  function filterStopWords(tokens) {
    const meaningful = tokens.filter(t => !STOP_WORDS.has(t));
    return meaningful.length > 0 ? meaningful : tokens;
  }

  /**
   * Match a query term against a document token set using exact, stem, or synonym matching.
   * @param {string} term
   * @param {Set<string>} tokenSet
   * @param {Set<string>} stemmedSet
   * @returns {{ matched: boolean, weight: number, matchType?: string }}
   */
  function matchTerm(term, tokenSet, stemmedSet) {
    if (tokenSet.has(term)) {
      return { matched: true, weight: 1.0, matchType: 'exact' };
    }
    const s = stem(term);
    if (stemmedSet.has(s)) {
      return { matched: true, weight: 0.95, matchType: 'stem' };
    }
    const syns = SYNONYM_MAP[term] || [];
    for (const syn of syns) {
      if (tokenSet.has(syn) || stemmedSet.has(stem(syn))) {
        return { matched: true, weight: 0.85, matchType: 'synonym' };
      }
    }
    return { matched: false, weight: 0 };
  }

  /**
   * Calculates local heuristic relevance score for a search result.
   * @param {object} params { query, title, snippet, url }
   * @returns {object} { score: number, breakdown: object, explanation: string, mode: 'local' }
   */
  function calculateLocalScore({ query = '', title = '', snippet = '', url = '' }) {
    const cleanQuery = normalize(query);
    if (!cleanQuery) {
      return {
        score: 100,
        mode: 'local',
        breakdown: {
          coverageRatio: 1,
          titleMatches: 0,
          snippetMatches: 0,
          phraseMatch: false,
          termCount: 0
        },
        explanation: 'Empty or universal query: showing all results without penalty.'
      };
    }

    const queryTokens = tokenize(cleanQuery);
    const meaningfulQueryTerms = filterStopWords(queryTokens);

    const cleanTitle = normalize(title);
    const cleanSnippet = normalize(snippet);
    const titleTokens = tokenize(cleanTitle);
    const snippetTokens = tokenize(cleanSnippet);

    const titleTokenSet = new Set(titleTokens);
    const titleStemmedSet = new Set(titleTokens.map(stem));
    const snippetTokenSet = new Set(snippetTokens);
    const snippetStemmedSet = new Set(snippetTokens.map(stem));

    // 1. Exact phrase matching bonus
    const phraseInTitle = cleanTitle.includes(cleanQuery);
    const phraseInSnippet = cleanSnippet.includes(cleanQuery);

    // 2. Term evaluation across title and snippet
    let coveredCount = 0;
    let titleEarned = 0;
    let snippetEarned = 0;
    const matchedTerms = [];

    for (const term of meaningfulQueryTerms) {
      const titleMatch = matchTerm(term, titleTokenSet, titleStemmedSet);
      const snippetMatch = matchTerm(term, snippetTokenSet, snippetStemmedSet);

      if (titleMatch.matched || snippetMatch.matched) {
        coveredCount++;
        const bestType = titleMatch.matched ? titleMatch.matchType : snippetMatch.matchType;
        matchedTerms.push(bestType === 'synonym' ? `${term} (syn)` : term);
      }

      if (titleMatch.matched) {
        titleEarned += titleMatch.weight;
      }
      if (snippetMatch.matched) {
        snippetEarned += snippetMatch.weight;
      }
    }

    const totalTerms = meaningfulQueryTerms.length || 1;
    const coverageRatio = coveredCount / totalTerms;
    const titleRatio = titleEarned / totalTerms;
    const snippetRatio = snippetEarned / totalTerms;

    // 3. Component Weights:
    // Title coverage carries up to 55 points
    const titleScore = titleRatio * 55;
    // Snippet coverage carries up to 25 points
    const snippetScore = snippetRatio * 25;

    // 4. URL slug bonus (up to 8 points)
    let urlBonus = 0;
    if (url) {
      const cleanUrl = normalize(url);
      for (const term of meaningfulQueryTerms) {
        if (cleanUrl.includes(term) || cleanUrl.includes(stem(term))) {
          urlBonus += 3;
        }
      }
      urlBonus = Math.min(8, urlBonus);
    }

    // 5. Phrase match bonus (up to 15 points)
    let phraseBonus = 0;
    if (phraseInTitle) {
      phraseBonus += 15;
    } else if (phraseInSnippet) {
      phraseBonus += 8;
    }

    let rawScore = titleScore + snippetScore + urlBonus + phraseBonus;

    // Demotion for low term coverage on multi-term queries
    if (totalTerms >= 2) {
      if (coverageRatio < 0.35) {
        rawScore *= 0.3;
      } else if (coverageRatio < 0.6) {
        rawScore *= 0.65;
      }
    }

    const finalScore = Math.min(100, Math.max(0, Math.round(rawScore)));

    // Explainable reasoning string
    const parts = [];
    parts.push(`Estimated relevance: ${finalScore}/100.`);
    if (phraseInTitle) parts.push('Exact query phrase matched in title (+15).');
    else if (phraseInSnippet) parts.push('Exact query phrase found in snippet (+8).');
    parts.push(`Matched ${Math.round(coverageRatio * 100)}% of query terms (${matchedTerms.join(', ') || 'none'}).`);
    if (titleEarned > 0) parts.push(`Title relevance: ${Math.round(titleScore)} pts.`);
    if (snippetEarned > 0) parts.push(`Snippet relevance: ${Math.round(snippetScore)} pts.`);
    parts.push('Score is a local heuristic estimate, not true semantic comprehension.');

    return {
      score: finalScore,
      mode: 'local',
      breakdown: {
        rawScore: Math.round(rawScore),
        coverageRatio: Number(coverageRatio.toFixed(2)),
        titleRatio: Number(titleRatio.toFixed(2)),
        snippetRatio: Number(snippetRatio.toFixed(2)),
        phraseBonus,
        urlBonus,
        termCount: totalTerms,
        matchedTerms
      },
      explanation: parts.join(' ')
    };
  }

  /**
   * Optional semantic scoring adapter.
   */
  async function scoreSemantic({ query, title, snippet, url }, endpoint) {
    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      throw new Error('Semantic endpoint must be a valid HTTPS URL');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);

    const payload = {
      query: (query || '').slice(0, 300),
      title: (title || '').slice(0, 300),
      snippet: (snippet || '').slice(0, 500),
      url: (url || '').slice(0, 200)
    };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Semantic endpoint responded with HTTP ${res.status}`);
      }

      const data = await res.json();
      if (typeof data.score !== 'number' || isNaN(data.score) || data.score < 0 || data.score > 100) {
        throw new Error('Semantic endpoint returned invalid score');
      }

      return {
        score: Math.round(data.score),
        mode: 'semantic',
        breakdown: data.breakdown || {},
        explanation: data.explanation || `Semantic AI score: ${Math.round(data.score)}/100 from configured endpoint.`
      };
    } catch (err) {
      clearTimeout(timeout);
      console.warn('[Friction Layer] Semantic scoring failed, falling back to local heuristic:', err.message);
      const fallback = calculateLocalScore({ query, title, snippet, url });
      fallback.explanation = `(Fallback from semantic endpoint: ${err.message}) ` + fallback.explanation;
      return fallback;
    }
  }

  /**
   * Main scoreResult public method.
   * @param {object} item { query, title, snippet, url }
   * @param {object} [settings]
   * @returns {Promise<object>}
   */
  async function scoreResult(item, settings = {}) {
    const { query = '', title = '', snippet = '', url = '' } = item || {};

    const cacheKey = `${normalize(query)}||${normalize(title)}||${normalize(snippet)}||${(url || '').trim()}`;
    if (localCache.has(cacheKey)) {
      return localCache.get(cacheKey);
    }

    let result;
    const searchSettings = settings.search || {};
    const isSemantic = searchSettings.scoringMode === 'semantic' && searchSettings.semanticEndpoint;

    if (isSemantic) {
      result = await scoreSemantic(item, searchSettings.semanticEndpoint);
    } else {
      result = calculateLocalScore(item);
    }

    if (localCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = localCache.keys().next().value;
      localCache.delete(oldestKey);
    }
    localCache.set(cacheKey, result);

    return result;
  }

  return {
    STOP_WORDS,
    SYNONYM_MAP,
    normalize,
    stem,
    tokenize,
    filterStopWords,
    matchTerm,
    calculateLocalScore,
    scoreSemantic,
    scoreResult
  };
});
