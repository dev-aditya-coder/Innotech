/**
 * Friction Layer - Background Service Worker (background.js)
 * Coordinates validated runtime messaging, settings persistence, and tab synchronization.
 * Manifest V3 compliant - stateless and lifecycle resilient.
 */

// Import core modules into service worker context
try {
  importScripts('core/messaging.js', 'core/settings.js');
} catch (err) {
  console.error('[Friction Layer] Failed to import core modules:', err);
}

const Messaging = (globalThis.FrictionLayer && globalThis.FrictionLayer.Messaging) || null;
const Settings = FLSettings();

function FLSettings() {
  return (globalThis.FrictionLayer && globalThis.FrictionLayer.Settings) || null;
}

/**
 * Update the extension toolbar action badge based on active status.
 * @param {boolean} isEnabled
 */
function updateActionBadge(isEnabled) {
  if (!chrome.action) return;

  if (!isEnabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#64748B' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setBadgeBackgroundColor({ color: '#0D9488' });
  }
}

/**
 * Broadcast settings change to all open supported tabs so content scripts reprocess immediately.
 * @param {object} newSettings
 */
async function broadcastSettingsChange(newSettings) {
  if (!chrome.tabs) return;

  const urlPatterns = [
    'https://www.google.com/*',
    'https://www.youtube.com/*',
    'https://m.youtube.com/*'
  ];

  try {
    const tabs = await chrome.tabs.query({ url: urlPatterns });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: Messaging.MESSAGE_TYPES.SETTINGS_CHANGED,
            settings: newSettings
          },
          () => {
            // Suppress error if content script is not yet injected or tab is idle
            const _ignored = chrome.runtime.lastError;
          }
        );
      }
    }
  } catch (err) {
    console.warn('[Friction Layer] Tab broadcast notice:', err);
  }
}

// Lifecycle: Install & Seed Defaults
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Friction Layer] Installed / Updated. Reason:', details.reason);
  if (!Settings) return;
  const settings = await Settings.getSettings();
  updateActionBadge(settings.enabled);
});

// Lifecycle: Startup
chrome.runtime.onStartup.addListener(async () => {
  if (!Settings) return;
  const settings = await Settings.getSettings();
  updateActionBadge(settings.enabled);
});

// Central Runtime Message Router with Envelope Validation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!Messaging || !Settings) return false;

  const validation = Messaging.validateEnvelope(message);
  if (!validation.valid) {
    return false;
  }

  // Handle messages asynchronously
  (async () => {
    try {
      switch (message.type) {
        case Messaging.MESSAGE_TYPES.GET_SETTINGS: {
          const settings = await Settings.getSettings();
          sendResponse({ success: true, settings });
          break;
        }

        case Messaging.MESSAGE_TYPES.UPDATE_SETTINGS: {
          if (!message.settings || typeof message.settings !== 'object') {
            sendResponse({ success: false, error: 'Invalid settings payload' });
            return;
          }
          const updated = await Settings.updateSettings(message.settings);
          updateActionBadge(updated.enabled);
          await broadcastSettingsChange(updated);
          sendResponse({ success: true, settings: updated });
          break;
        }

        case Messaging.MESSAGE_TYPES.RESET_SETTINGS: {
          const reset = await Settings.resetSettings();
          updateActionBadge(reset.enabled);
          await broadcastSettingsChange(reset);
          sendResponse({ success: true, settings: reset });
          break;
        }

        case Messaging.MESSAGE_TYPES.CLEAR_LOCAL_CACHE: {
          await Settings.clearLocalCache();
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unhandled message type: ${message.type}` });
      }
    } catch (err) {
      console.error('[Friction Layer] Error processing message:', err);
      sendResponse({ success: false, error: err.message || 'Unknown processing error' });
    }
  })();

  return true; // Keep message channel open for async response
});
