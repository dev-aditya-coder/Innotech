/**
 * Friction Layer - Recommendation Engine (core/recommendation-engine.js)
 * Evaluates video/feed items against user-defined keywords, transparent topic clusters,
 * channel allowlists, and focus mode.
 * Zero external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrictionLayer = root.FrictionLayer || {};
    root.FrictionLayer.RecommendationEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Transparent local topic-to-keyword clusters
  const TOPIC_CLUSTERS = Object.freeze({
    clickbait: [
      'shocking', "won't believe", 'gone wrong', 'insane', 'must watch',
      'omg', 'destroyed', 'crying', 'exposed', 'what happened',
      'before you buy', 'reacting to', '100 days', 'in 24 hours',
      'i tried', 'secret trick', 'glitch'
    ],
    gaming: [
      'gameplay', 'walkthrough', 'fortnite', 'minecraft', 'roblox',
      'gta', 'valorant', 'stream highlights', 'playthrough', 'speedrun',
      'esports', 'twitch'
    ],
    politics: [
      'election', 'debate', 'senate', 'democrat', 'republican',
      'scandal', 'parliament', 'congress', 'president', 'impeach',
      'white house', 'political', 'legislation'
    ],
    shorts: [
      '#shorts', 'shorts', 'tiktok compilation', 'reels', '#short'
    ],
    celebrity: [
      'drama', 'divorce', 'dating', 'celebrity', 'red carpet',
      'gossip', 'interview with', 'breakup', 'rumors', 'paparazzi'
    ],
    crypto: [
      'crypto', 'bitcoin', 'ethereum', 'btc', 'solana',
      'altcoin', '100x', 'airdrop', 'web3', 'nft', 'presale', 'bull run'
    ]
  });

  /**
   * Normalizes text for comparison (lowercase, trimmed).
   * @param {string} str
   * @returns {string}
   */
  function normalize(str) {
    return (str || '').toLowerCase().trim();
  }

  /**
   * Checks if candidate string contains target keyword (case-insensitive boundary check).
   * @param {string} text
   * @param {string} keyword
   * @returns {boolean}
   */
  function containsKeyword(text, keyword) {
    if (!text || !keyword) return false;
    const cleanText = normalize(text);
    const cleanKw = normalize(keyword);
    if (!cleanKw) return false;

    // Use regex with word boundaries if keyword is purely alphanumeric
    if (/^[a-z0-9\s]+$/i.test(cleanKw)) {
      const escaped = cleanKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`(^|\\b|\\s)${escaped}(\\b|\\s|$)`, 'i');
      return reg.test(cleanText);
    }
    return cleanText.includes(cleanKw);
  }

  /**
   * Evaluates a recommendation item against saved user preferences.
   * Allowlists ALWAYS take precedence over block rules.
   * @param {object} item { title, channel, description, isShorts }
   * @param {object} settings root settings or recommendations settings
   * @returns {{ blocked: boolean, reason: string, matchedRule?: string }}
   */
  function evaluateRecommendation(item, settings = {}) {
    const recConfig = settings.recommendations || settings;
    if (!recConfig.enabled) {
      return { blocked: false, reason: 'feature-disabled' };
    }

    const title = normalize(item.title);
    const channel = normalize(item.channel);
    const description = normalize(item.description);
    const fullText = `${title} ${channel} ${description}`;

    const {
      strategy = 'keywords',
      blockedKeywords = [],
      blockedTopics = [],
      allowedChannels = [],
      allowedTopics = [],
      focusMode = false
    } = recConfig;

    // 1. Check Channel Allowlist (Highest Precedence)
    for (const allowedCh of allowedChannels) {
      const cleanAllowed = normalize(allowedCh);
      if (cleanAllowed && (channel === cleanAllowed || channel.includes(cleanAllowed))) {
        return {
          blocked: false,
          reason: 'allowed-channel',
          matchedRule: allowedCh
        };
      }
    }

    // 2. Check Topic Allowlist
    for (const allowedTopic of allowedTopics) {
      const cleanTopic = normalize(allowedTopic);
      if (!cleanTopic) continue;

      // Check direct mention
      if (fullText.includes(cleanTopic)) {
        return {
          blocked: false,
          reason: 'allowed-topic',
          matchedRule: allowedTopic
        };
      }

      // Check cluster terms
      const cluster = TOPIC_CLUSTERS[cleanTopic];
      if (cluster && cluster.some(term => fullText.includes(term))) {
        return {
          blocked: false,
          reason: 'allowed-topic',
          matchedRule: allowedTopic
        };
      }
    }

    // 3. Focus Mode Check (suppresses recommendations unless specifically allowed)
    if (focusMode) {
      return {
        blocked: true,
        reason: 'focus-mode',
        matchedRule: 'Focus Mode Active'
      };
    }

    // 4. Keyword Blocking (active in 'keywords' and 'combined' strategies)
    if (strategy === 'keywords' || strategy === 'combined') {
      for (const kw of blockedKeywords) {
        if (containsKeyword(fullText, kw)) {
          return {
            blocked: true,
            reason: 'blocked-keyword',
            matchedRule: kw
          };
        }
      }
    }

    // 5. Topic Blocking (active in 'topics' and 'combined' strategies)
    if (strategy === 'topics' || strategy === 'combined') {
      for (const topic of blockedTopics) {
        const cleanTopic = normalize(topic);
        if (!cleanTopic) continue;

        // Check if topic is a registered cluster
        const cluster = TOPIC_CLUSTERS[cleanTopic];
        if (cluster) {
          for (const term of cluster) {
            if (containsKeyword(fullText, term)) {
              return {
                blocked: true,
                reason: 'blocked-topic',
                matchedRule: `${topic} (${term})`
              };
            }
          }
        } else {
          // Custom topic fallback to direct keyword match
          if (containsKeyword(fullText, cleanTopic)) {
            return {
              blocked: true,
              reason: 'blocked-topic',
              matchedRule: topic
            };
          }
        }
      }
    }

    return { blocked: false, reason: 'passed-filters' };
  }

  return {
    TOPIC_CLUSTERS,
    normalize,
    containsKeyword,
    evaluateRecommendation
  };
});
