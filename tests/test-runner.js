/**
 * Friction Layer - Zero-Dependency Test Runner (tests/test-runner.js)
 * Lightweight test harness runnable in any browser or automated runner.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrictionTestRunner = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const suites = [];
  let currentSuite = null;

  function describe(name, fn) {
    const suite = { name, tests: [] };
    suites.push(suite);
    const prev = currentSuite;
    currentSuite = suite;
    try {
      fn();
    } finally {
      currentSuite = prev;
    }
  }

  function it(name, fn) {
    if (!currentSuite) {
      throw new Error(`Test "${name}" must be inside a describe block`);
    }
    currentSuite.tests.push({ name, fn });
  }

  function expect(actual) {
    return {
      toBe(expected) {
        if (actual !== expected) {
          throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
        }
      },
      toEqual(expected) {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e) {
          throw new Error(`Expected deep equality:\nExpected: ${e}\nReceived: ${a}`);
        }
      },
      toBeTruthy() {
        if (!actual) {
          throw new Error(`Expected value to be truthy, got ${JSON.stringify(actual)}`);
        }
      },
      toBeFalsy() {
        if (actual) {
          throw new Error(`Expected value to be falsy, got ${JSON.stringify(actual)}`);
        }
      },
      toBeGreaterThan(val) {
        if (!(actual > val)) {
          throw new Error(`Expected ${actual} > ${val}`);
        }
      },
      toBeGreaterThanOrEqual(val) {
        if (!(actual >= val)) {
          throw new Error(`Expected ${actual} >= ${val}`);
        }
      },
      toBeLessThan(val) {
        if (!(actual < val)) {
          throw new Error(`Expected ${actual} < ${val}`);
        }
      },
      toBeLessThanOrEqual(val) {
        if (!(actual <= val)) {
          throw new Error(`Expected ${actual} <= ${val}`);
        }
      },
      toContain(item) {
        if (Array.isArray(actual)) {
          if (!actual.includes(item)) {
            throw new Error(`Array did not contain ${JSON.stringify(item)}`);
          }
        } else if (typeof actual === 'string') {
          if (!actual.includes(item)) {
            throw new Error(`String "${actual}" did not contain "${item}"`);
          }
        } else {
          throw new Error(`toContain requires array or string, got ${typeof actual}`);
        }
      }
    };
  }

  async function runAll() {
    let total = 0;
    let passed = 0;
    let failed = 0;
    const results = [];

    console.log('%c[Friction Layer] Starting Automated Test Suite...', 'font-weight: bold; color: #14b8a6;');

    for (const suite of suites) {
      const suiteResult = { name: suite.name, tests: [] };

      for (const test of suite.tests) {
        total++;
        const start = performance.now();
        try {
          await test.fn();
          const duration = Math.round(performance.now() - start);
          passed++;
          suiteResult.tests.push({ name: test.name, passed: true, duration });
          console.log(`  ✓ %c${test.name} (${duration}ms)`, 'color: #10b981;');
        } catch (err) {
          const duration = Math.round(performance.now() - start);
          failed++;
          suiteResult.tests.push({ name: test.name, passed: false, error: err.message, duration });
          console.error(`  ✗ ${test.name}:`, err.message);
        }
      }
      results.push(suiteResult);
    }

    const summary = { total, passed, failed, results };
    console.log(
      `%c[Friction Layer] Test Run Complete: ${passed}/${total} Passed, ${failed} Failed.`,
      `font-weight: bold; color: ${failed === 0 ? '#10b981' : '#ef4444'};`
    );

    // Update global state and DOM
    if (typeof globalThis !== 'undefined') {
      globalThis.__frictionTestSummary = summary;
    }
    if (typeof document !== 'undefined') {
      document.title = `TESTS_${failed === 0 ? 'PASSED' : 'FAILED'}: ${passed}/${total}`;
      document.body.setAttribute('data-test-status', failed === 0 ? 'PASSED' : 'FAILED');
      renderDOMResults(summary);

      // Post back to automated test runner server if listening
      if (typeof fetch !== 'undefined') {
        try {
          fetch('/__test_results__', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(summary)
          }).catch(() => {});
        } catch {}
      }
    }

    return summary;
  }

  function renderDOMResults(summary) {
    const output = document.getElementById('test-output');
    if (!output) return;

    let html = `
      <div class="test-summary ${summary.failed === 0 ? 'all-passed' : 'has-failures'}">
        <h2>${summary.failed === 0 ? '✓ All Tests Passed' : '✗ Test Failures Encountered'}</h2>
        <div class="metrics">
          <span><strong>Total:</strong> ${summary.total}</span>
          <span class="passed-count"><strong>Passed:</strong> ${summary.passed}</span>
          <span class="failed-count"><strong>Failed:</strong> ${summary.failed}</span>
        </div>
      </div>
    `;

    for (const s of summary.results) {
      html += `
        <div class="suite-card">
          <div class="suite-title">${escape(s.name)}</div>
          <div class="suite-tests">
      `;
      for (const t of s.tests) {
        html += `
          <div class="test-row ${t.passed ? 'pass' : 'fail'}">
            <span class="test-icon">${t.passed ? '✓' : '✗'}</span>
            <span class="test-name">${escape(t.name)}</span>
            <span class="test-time">${t.duration}ms</span>
            ${!t.passed ? `<div class="test-error">${escape(t.error)}</div>` : ''}
          </div>
        `;
      }
      html += `</div></div>`;
    }

    output.innerHTML = html;
  }

  function escape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return {
    describe,
    it,
    expect,
    runAll
  };
});
