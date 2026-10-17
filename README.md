# Friction Layer 🛡️

**InnoTech Hackathon Project**  
*Reclaiming intentional browsing through local relevance scoring, distraction filtering, and heuristic security.*

---

## 📖 Product Overview

**Friction Layer** is a privacy-first Google Chrome extension (Manifest V3) that adds an intentional, transparent boundary between you and high-distraction, low-relevance web content.

Modern web platforms maximize user engagement via algorithmic recommendation feeds, sponsored placements, clickbait thumbnails, and syndicated content. Furthermore, web searches and online forums are frequently targeted with deceptive lookalikes, typosquatting domains, and obfuscated redirects.

Friction Layer gives control back to the user:
1. **Intent-Based Search Relevance**: Computes real-time relevance scores (0–100%) for organic search results against your query and reversibly hides low-scoring clutter below your chosen cutoff.
2. **Recommendation & Distraction Filtering**: Suppresses YouTube algorithmic recommendations, sidebars, shorts, and clickbait based on customizable keywords, transparent topic clusters, and a channel allowlist.
3. **Evidence-Based Quality Indicators**: Evaluates page-level structural signals (metadata completeness, content relevance, title uniqueness, and authoritative domain TLDs) without fabricating reviews or reputation metrics.
4. **Heuristic Link-Risk Protection**: Flags deceptive URL structures (embedded user-info credentials, punycode homographs, typosquatted brand names, excessive subdomain depth, and open redirect parameters) using local heuristics.
5. **Conservative Clutter & Sponsored Filter**: Reversibly hides explicitly marked sponsored units and generic cookie/consent overlays while preserving critical page navigation, authentication, and payment workflows.

---

## 🔒 Privacy-First Architecture

* **Zero Telemetry**: No browsing history, queries, cookies, or page contents leave your browser.
* **100% Offline Processing**: All scoring, tokenization, stemming, clustering, and heuristic evaluations execute entirely on your machine.
* **No External Dependencies**: Core extension requires zero external npm packages, bundlers, or third-party cloud APIs.
* **No Fake AI Claims**: Deterministic local heuristics are clearly distinguished from external semantic AI services. Optional HTTPS semantic scoring is strictly opt-in and disabled by default.

---

## 📂 Complete Directory Structure

```
friction-layer/
├── manifest.json                     # Chrome Manifest V3 configuration
├── background.js                     # Service worker for validated runtime messaging & tab coordination
├── README.md                         # Product documentation & hackathon guide
├── popup/                            # Extension toolbar popup (375px dark navy & teal)
│   ├── popup.html                    # Master switch, 5 feature toggles, metrics, quick actions
│   ├── popup.css                     # Accessible dark navy & teal styles
│   └── popup.js                      # Popup controller & tab messaging
├── options/                          # Full settings dashboard (chrome.runtime.openOptionsPage)
│   ├── options.html                  # Multi-tab settings panel
│   ├── options.css                   # Responsive dashboard styling
│   └── options.js                    # Form validation, sliders, and persistent storage
├── core/                             # Core evaluation modules (UMD zero-dependency)
│   ├── messaging.js                  # Message envelopes, validation, runtime/tab wrappers
│   ├── settings.js                   # Settings schema, deep-merge, defaults, chrome.storage.local
│   ├── relevance-scorer.js           # Query tokenizer, stop words, stemming, phrase bonus, cache
│   ├── quality-scorer.js             # Evidence-based quality evaluation & reversible DOM sorting
│   ├── recommendation-engine.js      # Keyword/topic rules, channel allowlists, focus mode
│   └── link-risk.js                  # Local URL heuristics, lookalikes, userinfo, punycode
├── content/                          # Site-specific content scripts
│   ├── google-search.js              # Google organic search filtering & relevance badges
│   ├── youtube-recommendations.js    # YouTube home & sidebar recommendations filter
│   ├── clutter-filter.js             # Reversible sponsored & overlay filter
│   └── link-risk.js                  # Interactive non-blocking link warning popovers
├── assets/
│   └── icons/
│       ├── icon.svg                  # Vector master icon (Navy shield with layered teal plates)
│       ├── icon16.png                # 16x16 raster icon
│       ├── icon32.png                # 32x32 raster icon
│       ├── icon48.png                # 48x48 raster icon
│       └── icon128.png               # 128x128 raster icon
├── scripts/
│   ├── generate-icons.py             # Stdlib Python PNG raster icon generator
│   └── run-tests.py                  # Automated headless browser test runner
└── tests/
    ├── test-runner.html              # Standalone test runner interface
    ├── test-runner.js                # Zero-dependency test framework & assertion library
    ├── relevance-scorer.test.js      # Relevance engine unit tests
    ├── settings.test.js              # Settings validation & allowlist tests
    ├── link-risk.test.js             # Heuristic risk check unit tests
    └── fixtures/
        └── search-results.html       # Synthetic test fixture with interactive demo console
```

---

## 🚀 Installation & Chrome Setup

### Prerequisites
* Google Chrome desktop (version 102+ recommended).
* (Optional for running tests/icons) Python 3.8+ (no pip packages needed).

### Step-by-Step Installation
1. Open Google Chrome.
2. In the address bar, navigate to:
   ```
   chrome://extensions
   ```
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button in the top-left toolbar.
5. In the file picker dialog, select the project folder:
   ```
   c:\Users\hp\Desktop\Friction-Layer
   ```
6. Click **Select Folder**.
7. The **Friction Layer** extension card will appear with its navy/teal shield icon, version `1.0.0`, and active status.
8. (Recommended) Click the Chrome puzzle piece icon in your browser toolbar and click the **Pin** icon next to **Friction Layer** for quick access.

---

## 🧪 Running Automated Tests

Friction Layer includes a complete, zero-dependency unit and regression test suite.

### Option A: Via Browser (Visual Runner)
1. In Google Chrome, open the test runner file:
   ```
   file:///c:/Users/hp/Desktop/Friction-Layer/tests/test-runner.html
   ```
2. The interactive runner immediately executes all unit tests across Relevance Scoring, Settings Validation, Recommendation Rules, and Link-Risk Heuristics.
3. Click **Re-run Tests** anytime to re-evaluate.

### Option B: Via Command Line (Headless Browser)
Run the automated headless test runner script:
```powershell
python scripts/run-tests.py
```
This launches a lightweight local test server, runs `tests/test-runner.html` in headless Chrome, and prints a verified pass/fail breakdown to your terminal.

### Option C: Interactive Synthetic Test Fixture
Open the synthetic demonstration fixture to test search filtering and link-risk popovers interactively:
```
file:///c:/Users/hp/Desktop/Friction-Layer/tests/fixtures/search-results.html
```

---

## 🎨 Icon Generation

All required raster PNG icons (`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`) and vector `icon.svg` are pre-generated in `assets/icons/`.

If you ever wish to modify the icon palette or regenerate the raster assets without external dependencies (no PIL/Pillow required), run:
```powershell
python scripts/generate-icons.py
```
This pure-Python script renders the antialiased navy shield and teal friction plates using only the standard library (`zlib` and `struct`).

---

## ⚙️ Feature Status Matrix

| Feature | Implemented Locally | Optional Integration | Limitations |
| :--- | :---: | :---: | :--- |
| **Search Relevance Scoring** | ✅ Yes | HTTPS Semantic Backend | Heuristic estimate based on term coverage, stemming, phrase bonus, and synonyms; not human-level semantic comprehension. |
| **Reversible Search Hiding** | ✅ Yes | None | Targets standard Google organic results containers (`#search`, `.g`, `.MjjYud`). Changes to Google markup are handled with selector fallbacks. |
| **Recommendation Filtering** | ✅ Yes | None | Targets YouTube recommendation cards (`ytd-rich-item-renderer`, `ytd-compact-video-renderer`, Shorts). Does not block embedded players. |
| **Focus Mode** | ✅ Yes | None | Hides entire recommendation sidebars and feeds. Does not alter search result pages or user subscriptions. |
| **Channel & Topic Allowlists** | ✅ Yes | None | Allowlists take strict precedence over blocking rules. Matching is case-insensitive. |
| **Evidence-Based Quality** | ✅ Yes | None | Inspects strictly visible DOM signals (metadata completeness, relevance, duplicate titles, authoritative TLDs). Displays "Insufficient data" when evidence is lacking; never fabricates data. |
| **DOM Quality Sorting** | ✅ Yes | None | Reorders search results locally in the browser DOM. Does not alter Google's server-side rank. Fully reversible. |
| **Link-Risk Warnings** | ✅ Yes | Threat Intel APIs | Local heuristic checks (user-info `@`, typosquatting, excessive subdomains, punycode, open redirects). Never silently blocks or navigates. |
| **Clutter & Sponsored Filter** | ✅ Yes | None | Disabled by default. Targets explicitly marked sponsored containers (`.uEierd`, `[data-text-ad]`, `ytd-ad-slot-renderer`). Does not claim universal ad-blocking. |
| **External Semantic Scoring** | ❌ Opt-In Only | Custom HTTPS Server | Requires an explicitly configured HTTPS endpoint by the user. Client client code contains zero hardcoded API keys. |
| **Threat-Intelligence Lookups** | ❌ Future Scope | Safe Browsing API | External Safe Browsing / threat feeds are not configured by default to protect user query privacy. |

---

## 🌐 Supported Websites & Permissions

### Supported Domains
* `https://www.google.com/*` (Google Search organic results)
* `https://www.youtube.com/*` (YouTube desktop home, watch, and search)
* `https://m.youtube.com/*` (YouTube mobile web)

### Permissions Justification
* `storage`: Persists user filtering rules, thresholds, channel allowlists, and themes locally via `chrome.storage.local`.
* `activeTab`: Allows the toolbar popup to detect the current tab type and query active hidden item counts without requesting permanent background tab spying permissions.
* `host_permissions` (`google.com`, `youtube.com`): Strictly limited to supported websites where filtering content scripts operate. Friction Layer does **not** request unrestricted access to `<all_urls>`.

---

## 🔌 Optional Semantic Backend Contract

Friction Layer is 100% functional offline. If an enterprise or developer wishes to connect a private semantic scoring endpoint, the options page allows configuring a custom HTTPS URL.

### Security Guarantees
* Only user-configured HTTPS URLs are permitted.
* Client extension code never contains hardcoded API keys or secrets.
* Request payload includes **only** the query string and result metadata (title, snippet, URL).
* No cookies, session headers, authentication credentials, or browsing history are sent.
* Timeout is capped at 2,500ms; if the endpoint fails, times out, or returns invalid data, Friction Layer seamlessly falls back to the local deterministic scorer.

### Request Format
```http
POST https://api.example.com/v1/score
Content-Type: application/json

{
  "query": "react performance optimization",
  "title": "React Performance Optimization Guide",
  "snippet": "Learn techniques to eliminate unnecessary component re-renders.",
  "url": "https://example.com/react-perf"
}
```

### Expected Response Format
```json
{
  "score": 87,
  "explanation": "High semantic similarity between query and documentation content.",
  "breakdown": {
    "semanticCosine": 0.89,
    "topicRelevance": 0.85
  }
}
```

---

## 🧭 Browser & Platform Compatibility

* **Google Chrome Desktop (Windows, macOS, Linux)**: Primary target platform, fully supported on Manifest V3.
* **Microsoft Edge (Chromium)**: Fully compatible via "Load unpacked" in `edge://extensions`.
* **Mozilla Firefox**: Manifest V3 background service workers and declarative content scripts are structurally compatible, but Firefox requires specific `background.scripts` fallback for full MV3 feature parity.
* **Mobile Browsers**: Mobile Chrome does not support desktop extensions. Experimental Chromium mobile forks (e.g. Kiwi Browser) can load unpacked extensions, but desktop layout is the officially supported target.

---

## 🔧 Selector Limitations & DOM Resilience

Search engines and video platforms frequently iterate on their internal DOM markup, obfuscating class names and changing component wrappers.

Friction Layer handles this with resilient engineering:
1. **Multi-Stage Selector Fallbacks**: Evaluates `div.MjjYud`, `div.g`, `#search`, `#rso`, and standard `h3` hierarchy.
2. **Safe Failure Behavior**: If organic containers cannot be reliably identified, the extension shows no fabricated badges and will **never** hide arbitrary page elements.
3. **Loop-Protected MutationObserver**: All DOM mutations initiated by Friction Layer's own badges and banners are tagged with `data-friction-*` attributes to prevent observer cascade loops.
4. **Reversible Registry**: All hidden elements preserve their original `display` property and can be instantly un-hidden via the popup or banner.

---

## 🛠️ Troubleshooting

| Issue | Resolution |
| :--- | :--- |
| **Popup shows "Unsupported Tab"** | Chrome security policy prohibits extensions from modifying internal browser tabs (`chrome://`, `chrome-extension://`, `edge://`, or Web Store pages). Navigate to a Google Search or YouTube page. |
| **Results are not hiding on Google** | Check that master toggle and **Search Relevance Filter** are enabled in the popup. Verify the relevance threshold slider (default 45%). If your query is very broad, all results may score above the cutoff. |
| **Legitimate video is hidden on YouTube** | Open the options dashboard and add the channel name to the **Channel Allowlist**. Allowlists take strict precedence over all block rules. |
| **Search results order looks altered** | Check if **Local Quality-Based Reordering** is enabled under Quality Settings in the dashboard. Toggle it off to return to Google's standard order. |
| **Extension needs refresh after editing code** | Navigate to `chrome://extensions`, locate **Friction Layer**, and click the circular **Reload** icon. |

---

## 🏆 Hackathon Demonstration Script

Follow this step-by-step walkthrough to demonstrate Friction Layer to judges:

### Scene 1: Inspection & Installation (30 Seconds)
1. Open `chrome://extensions` and show **Friction Layer** loaded as an unpacked MV3 extension.
2. Highlight the restricted host permissions (`google.com`, `youtube.com`) and zero third-party dependencies.

### Scene 2: Automated Verification (30 Seconds)
1. Open `tests/test-runner.html` in the browser or run `python scripts/run-tests.py` in the terminal.
2. Show all unit tests passing with green indicators across Relevance Scoring, Settings Recovery, Allowlist Precedence, and Heuristic Link-Risk Detection.

### Scene 3: Search Relevance & Quality Filtering (60 Seconds)
1. Open `tests/fixtures/search-results.html` (or live Google Search for a technical query).
2. Point out the estimated relevance badges (e.g., `88%`, `62%`, `12%`).
3. Drag the **Relevance Cutoff** slider from 35% to 50%: demonstrate the off-topic vacation spam card disappearing cleanly.
4. Click **Reveal Filtered Items** to demonstrate the reversible non-destructive hiding model.
5. Click **Sort by Quality** to show evidence-based reordering using visible metadata signals.

### Scene 4: Heuristic Link-Risk Protection (45 Seconds)
1. In the demo fixture, highlight result item #4 (`https://g00gle.com@paypa1-security-update.example.com/download`).
2. Notice the `⚠️ Suspicious Link` badge.
3. Click the badge: demonstrate the interactive explanation dialog showing exact heuristic indicators:
   * Misleading credential prefix (`g00gle.com@`)
   * Typosquatted brand imitation (`paypa1`)
4. Emphasize that the user remains in control: navigation is not blocked silently.

### Scene 5: Distraction-Free YouTube & Options Dashboard (45 Seconds)
1. Open the **Friction Layer Popup** from the toolbar: show real-time metrics and the 5 independent toggles.
2. Click **Settings** to open the full dashboard:
   * Show Focus Mode configuration.
   * Show Channel Allowlists and explain that allowlists override block rules.
   * Show Privacy diagnostics confirming 100% offline local engine execution.
