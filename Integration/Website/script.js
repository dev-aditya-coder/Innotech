(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = "frictionLayerPreferences_v2";
  const THEME_KEY = "frictionLayerTheme";
  const EXTENSION_ID = "ebogpfpkgidpdaecmnmaiamilbfodplg";

  // Shared light/dark theme across all four pages.
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    $$(".theme-toggle").forEach((button) => {
      const icon = $(".theme-icon", button);
      if (icon) icon.textContent = theme === "dark" ? "☾" : "☀";
      button.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
      button.setAttribute("aria-pressed", String(theme === "light"));
    });
  };
  let theme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(theme);
  $$(".theme-toggle").forEach((button) => button.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }));

  // Mobile navigation.
  const menuButton = $(".mobile-menu-toggle");
  const nav = $(".nav-links");
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = nav.classList.toggle("nav-open");
      menuButton.setAttribute("aria-expanded", String(open));
    });
    $$("a", nav).forEach((link) => link.addEventListener("click", () => {
      nav.classList.remove("nav-open");
      menuButton.setAttribute("aria-expanded", "false");
    }));
  }

  // Subtle scroll reveals. Content is immediately available to assistive tech and
  // remains visible if observers are unsupported or reduced motion is requested.
  const revealItems = $$(".reveal");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });
    revealItems.forEach((item) => {
      if (!item.classList.contains("is-visible")) observer.observe(item);
    });
  } else revealItems.forEach((item) => item.classList.add("is-visible"));

  // Preference helpers.
  const defaults = {
    goal: "Study & Learning",
    level: "Intermediate",
    intentFilter: true,
    recommendationFilter: true,
    strictness: "Balanced"
  };
  const readPreferences = () => {
    try { return { ...defaults, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")) }; }
    catch { return { ...defaults }; }
  };
  const savePreferences = (preferences) => localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));

  const syncPreferencesWithExtension = (preferences, callback) => {
    if (EXTENSION_ID === "PASTE_YOUR_EXTENSION_ID_HERE") {
      callback(false, "Extension ID has not been configured yet.");
      return;
    }

    if (!window.chrome?.runtime?.sendMessage) {
      callback(false, "Chrome extension messaging is unavailable.");
      return;
    }

    chrome.runtime.sendMessage(
      EXTENSION_ID,
      { type: "FL_SYNC_PREFERENCES", preferences },
      (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          callback(false, error.message);
          return;
        }

        callback(response?.ok === true, response?.error || "");
      }
    );
  };

  const toast = (message) => {
    const node = $(".toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("toast-visible");
    window.setTimeout(() => node.classList.remove("toast-visible"), 2800);
  };

  const form = $("#preferences-form");
  if (form) {
    const saved = readPreferences();
    const setRadio = (name, value) => {
      const input = $(`input[name="${name}"][value="${CSS.escape(value)}"]`, form);
      if (input) input.checked = true;
    };
    setRadio("goal", saved.goal);
    setRadio("level", saved.level);
    setRadio("strictness", saved.strictness);
    $("#intent-filter").checked = saved.intentFilter;
    $("#recommendation-filter").checked = saved.recommendationFilter;

    const current = () => ({
      goal: $('input[name="goal"]:checked', form)?.value || defaults.goal,
      level: $('input[name="level"]:checked', form)?.value || defaults.level,
      intentFilter: $("#intent-filter").checked,
      recommendationFilter: $("#recommendation-filter").checked,
      strictness: $('input[name="strictness"]:checked', form)?.value || defaults.strictness
    });
    const updateSummary = () => {
      const p = current();
      $("#summary-goal").textContent = p.goal;
      $("#summary-level").textContent = p.level;
      $("#summary-strictness").textContent = p.strictness;
      const updateState = (id, enabled) => {
        const node = $(id);
        node.textContent = enabled ? "Enabled" : "Disabled";
        node.classList.toggle("state-enabled", enabled);
        node.classList.toggle("state-disabled", !enabled);
      };
      updateState("#summary-intent", p.intentFilter);
      updateState("#summary-recommendations", p.recommendationFilter);
      $$('input[type="radio"]', form).forEach((input) => {
        const wrapper = input.closest("label");
        if (wrapper) wrapper.classList.toggle("selected", input.checked);
      });
    };
    form.addEventListener("change", updateSummary);
    updateSummary();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const preferences = current();
      // Keep these choices as a one-session draft. They are not saved as permanent
      // extension preferences; focus-session.js attaches them only when the timer starts.
      try {
        sessionStorage.setItem("frictionLayerFocusCustomizationDraft_v1", JSON.stringify({
          ...preferences,
          createdAt: Date.now()
        }));
        window.location.href = "focus.html";
      } catch {
        toast("Could not prepare your focus session. Please try again.");
      }
    });

  }

  // Populate the success page from saved values.
  if ($("#saved-goal")) {
    const p = readPreferences();
    const values = {
      "#saved-goal": p.goal,
      "#saved-level": p.level,
      "#saved-strictness": p.strictness,
      "#saved-intent": p.intentFilter ? "Enabled" : "Disabled",
      "#saved-recommendations": p.recommendationFilter ? "Enabled" : "Disabled"
    };
    Object.entries(values).forEach(([selector, value]) => { $(selector).textContent = value; });
  }



  // Smooth-scroll anchors for browsers that don't apply CSS scroll-behavior.
  $$('a[href^="#"]').forEach((link) => link.addEventListener("click", (event) => {
    const target = $(link.getAttribute("href"));
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", link.getAttribute("href"));
    }
  }));
})();