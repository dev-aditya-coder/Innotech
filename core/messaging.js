/**
 * Friction Layer - Messaging Module (core/messaging.js)
 * Defines validated message types, schema checking, and runtime/tab messaging helpers.
 * Universal Module Definition (UMD) - zero external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrictionLayer = root.FrictionLayer || {};
    root.FrictionLayer.Messaging = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MESSAGE_TYPES = {
    GET_SETTINGS: 'FRICTION_LAYER_GET_SETTINGS',
    UPDATE_SETTINGS: 'FRICTION_LAYER_UPDATE_SETTINGS',
    RESET_SETTINGS: 'FRICTION_LAYER_RESET_SETTINGS',
    CLEAR_LOCAL_CACHE: 'FRICTION_LAYER_CLEAR_LOCAL_CACHE',
    GET_TAB_STATUS: 'FRICTION_LAYER_GET_TAB_STATUS',
    RESTORE_CURRENT_PAGE: 'FRICTION_LAYER_RESTORE_CURRENT_PAGE',
    REPROCESS_CURRENT_PAGE: 'FRICTION_LAYER_REPROCESS_CURRENT_PAGE',
    SETTINGS_CHANGED: 'FRICTION_LAYER_SETTINGS_CHANGED',
    SEMANTIC_SCORE_REQUEST: 'FRICTION_LAYER_SEMANTIC_SCORE_REQUEST'
  };

  /**
   * Validate that an incoming message conforms to the Friction Layer envelope.
   * @param {any} message
   * @returns {{ valid: boolean, error?: string }}
   */
  function validateEnvelope(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Message must be an object' };
    }
    if (typeof message.type !== 'string') {
      return { valid: false, error: 'Message type must be a string' };
    }
    const knownTypes = Object.values(MESSAGE_TYPES);
    if (!knownTypes.includes(message.type)) {
      return { valid: false, error: `Unknown message type: ${message.type}` };
    }
    return { valid: true };
  }

  /**
   * Safe wrapper around chrome.runtime.sendMessage with timeout & error trapping.
   * @param {object} message
   * @param {number} [timeoutMs=3000]
   * @returns {Promise<any>}
   */
  function sendRuntimeMessage(message, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const validation = validateEnvelope(message);
      if (!validation.valid) {
        return reject(new Error(`Validation failed: ${validation.error}`));
      }

      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return reject(new Error('chrome.runtime.sendMessage is not available in this context'));
      }

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`sendRuntimeMessage timed out after ${timeoutMs}ms for ${message.type}`));
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timer);
          if (timedOut) return;

          const lastError = chrome.runtime.lastError;
          if (lastError) {
            return reject(new Error(lastError.message || 'Unknown chrome.runtime error'));
          }
          resolve(response);
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Safe wrapper around chrome.tabs.sendMessage to communicate with content scripts.
   * Gracefully handles unsupported pages, restricted schemes, and un-injected tabs.
   * @param {number} tabId
   * @param {object} message
   * @param {number} [timeoutMs=3000]
   * @returns {Promise<any>}
   */
  function sendTabMessage(tabId, message, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const validation = validateEnvelope(message);
      if (!validation.valid) {
        return reject(new Error(`Validation failed: ${validation.error}`));
      }

      if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.sendMessage) {
        return reject(new Error('chrome.tabs.sendMessage is not available in this context'));
      }

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`sendTabMessage timed out after ${timeoutMs}ms for tab ${tabId}`));
      }, timeoutMs);

      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          clearTimeout(timer);
          if (timedOut) return;

          const lastError = chrome.runtime.lastError;
          if (lastError) {
            // Content script not present or restricted page
            return reject(new Error(lastError.message || 'Receiving end does not exist'));
          }
          resolve(response);
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Helper to attach message listeners with envelope validation.
   * @param {Function} handler (message, sender, sendResponse) => boolean | void
   */
  function registerMessageHandler(handler) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) {
      return () => {};
    }

    const listener = (message, sender, sendResponse) => {
      const check = validateEnvelope(message);
      if (!check.valid) {
        // Ignore foreign or invalid messages without erroring
        return false;
      }
      return handler(message, sender, sendResponse);
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }

  return {
    MESSAGE_TYPES,
    validateEnvelope,
    sendRuntimeMessage,
    sendTabMessage,
    registerMessageHandler
  };
});
