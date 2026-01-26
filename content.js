// Content script - runs on every webpage
// Simplified version for better reliability

console.log('[AI Translator] Content script loaded');

// State
let lastSelectedText = '';
let lastSelectionRange = null;
let translateIcon = null;
let translatePopup = null;
let justOpenedPopup = false; // Flag to prevent immediate closing
let popupCloseTimeout = null;

// Feature flags - defaults to true
let grammarCheckEnabled = true;
let inlineTranslationEnabled = true;

// Grammar check state
let grammarTimeouts = new Map();

// ========== SETTINGS LOADING ==========

async function loadSettings() {
  try {
    const data = await chrome.storage.local.get(['grammarCheckEnabled', 'inlineTranslationEnabled']);
    grammarCheckEnabled = data.grammarCheckEnabled !== undefined ? data.grammarCheckEnabled : true;
    inlineTranslationEnabled = data.inlineTranslationEnabled !== undefined ? data.inlineTranslationEnabled : true;
    console.log('[AI Translator] Settings loaded:', { grammarCheckEnabled, inlineTranslationEnabled });
  } catch (error) {
    console.error('[AI Translator] Failed to load settings:', error);
  }
}

// ========== TRANSLATE ICON ==========

function createTranslateIcon() {
  if (translateIcon) return;
  if (!document.body) {
    setTimeout(createTranslateIcon, 100);
    return;
  }

  console.log('[AI Translator] Creating translate icon...');

  translateIcon = document.createElement('div');
  translateIcon.id = 'ai-translator-icon';
  translateIcon.className = 'ai-translator-icon';
  // Use icon file from extension
  translateIcon.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon24.png')}" alt="Translate" style="width: 20px; height: 20px; pointer-events: none;">`;

  // Add styles via style tag
  if (!document.getElementById('ai-translator-styles')) {
    const style = document.createElement('style');
    style.id = 'ai-translator-styles';
    style.textContent = `
      .ai-translator-icon {
        position: absolute !important;
        width: 40px !important;
        height: 40px !important;
        border-radius: 50% !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
        cursor: pointer !important;
        display: none !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 2147483647 !important;
        transition: all 0.2s ease !important;
        border: 2px solid white !important;
        user-select: none !important;
      }
      .ai-translator-icon img {
        width: 20px !important;
        height: 20px !important;
        pointer-events: none !important;
        display: block !important;
      }
      .ai-translator-icon:hover {
        transform: scale(1.1) !important;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2) !important;
      }
      .ai-translator-popup {
        position: absolute !important;
        width: 320px !important;
        max-width: 90vw !important;
        background: white !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
        z-index: 2147483647 !important;
        display: none !important;
        border: 1px solid #e5e7eb !important;
      }
      .ai-translator-popup-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 12px 16px !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        color: white !important;
        border-radius: 12px 12px 0 0 !important;
      }
      .ai-translator-popup-title {
        font-weight: 600 !important;
        font-size: 14px !important;
      }
      .ai-translator-popup-close {
        background: none !important;
        border: none !important;
        color: white !important;
        font-size: 24px !important;
        cursor: pointer !important;
        padding: 0 !important;
        width: 24px !important;
        height: 24px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
      }
      .ai-translator-popup-close:hover {
        background: rgba(255, 255, 255, 0.2) !important;
      }
      .ai-translator-popup-content {
        padding: 16px !important;
      }
      .ai-translator-popup-result {
        padding: 12px !important;
        background: #f9fafb !important;
        border-radius: 8px !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        color: #1f2937 !important;
        min-height: 60px !important;
      }
      .ai-translator-popup-actions {
        display: flex !important;
        gap: 8px !important;
        margin-top: 12px !important;
      }
      .ai-translator-popup-btn {
        flex: 1 !important;
        padding: 8px 16px !important;
        border: none !important;
        border-radius: 6px !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        background: #667eea !important;
        color: white !important;
      }
      .ai-translator-popup-btn:hover {
        background: #5568d3 !important;
      }
    `;
    document.head.appendChild(style);
  }

  translateIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showTranslatePopup();
  });

  document.body.appendChild(translateIcon);
  console.log('[AI Translator] Translate icon added to body');
}

function showTranslateIcon() {
  if (!translateIcon) {
    createTranslateIcon();
    if (!translateIcon) return;
  }

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (!selectedText || selectedText.length === 0) {
    if (translateIcon) {
      translateIcon.style.setProperty('display', 'none', 'important');
    }
    return;
  }

  if (!inlineTranslationEnabled) {
    return;
  }

  try {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const iconLeft = rect.right + window.scrollX + 8;
    const iconTop = rect.bottom + window.scrollY + 8;

    translateIcon.style.left = iconLeft + 'px';
    translateIcon.style.top = iconTop + 'px';
    translateIcon.style.setProperty('display', 'flex', 'important');

    console.log('[AI Translator] Icon shown at:', iconLeft, iconTop);
  } catch (e) {
    console.error('[AI Translator] Error showing icon:', e);
  }
}

function hideTranslateIcon() {
  if (translateIcon) {
    translateIcon.style.setProperty('display', 'none', 'important');
  }
}

// ========== TRANSLATE POPUP ==========

function createTranslatePopup() {
  if (translatePopup) return;
  if (!document.body) {
    setTimeout(createTranslatePopup, 100);
    return;
  }

  console.log('[AI Translator] Creating translate popup...');

  translatePopup = document.createElement('div');
  translatePopup.id = 'ai-translator-popup';
  translatePopup.className = 'ai-translator-popup';
  translatePopup.innerHTML = `
    <div class="ai-translator-popup-header">
      <span class="ai-translator-popup-title">AI Translator</span>
      <button class="ai-translator-popup-close" id="ai-translator-popup-close">×</button>
    </div>
    <div class="ai-translator-popup-content">
      <div class="ai-translator-popup-result" id="ai-translator-popup-result">Translation will appear here...</div>
      <div class="ai-translator-popup-actions">
        <button class="ai-translator-popup-btn" id="ai-translator-popup-copy">Copy</button>
      </div>
    </div>
  `;

  document.body.appendChild(translatePopup);

  // Event listeners
  document.getElementById('ai-translator-popup-close').addEventListener('click', hideTranslatePopup);
  document.getElementById('ai-translator-popup-copy').addEventListener('click', copyTranslation);

  // Close popup when clicking outside (but not immediately after opening)
  document.addEventListener('click', (e) => {
    if (translatePopup && translatePopup.style.display === 'block') {
      // Don't close if just opened (within 200ms)
      if (justOpenedPopup) return;

      if (!translatePopup.contains(e.target) && (!translateIcon || !translateIcon.contains(e.target))) {
        hideTranslatePopup();
      }
    }
  });

  console.log('[AI Translator] Translate popup added to body');
}

async function showTranslatePopup() {
  console.log('[AI Translator] showTranslatePopup called, lastSelectedText:', lastSelectedText);

  if (!lastSelectedText) {
    console.error('[AI Translator] No text to translate');
    return;
  }

  if (!translatePopup) {
    console.log('[AI Translator] Creating translate popup...');
    createTranslatePopup();
  }

  const selection = window.getSelection();
  let rect;

  try {
    if (selection.rangeCount > 0) {
      rect = selection.getRangeAt(0).getBoundingClientRect();
    } else if (lastSelectionRange) {
      rect = lastSelectionRange.getBoundingClientRect();
    } else {
      rect = { top: 100, left: 100, width: 0 };
    }
  } catch (e) {
    rect = { top: 100, left: 100, width: 0 };
  }

  // Position popup
  const popupWidth = 320;
  const popupHeight = 200;

  let top = rect.top + window.scrollY - popupHeight - 10;
  let left = rect.left + window.scrollX + (rect.width / 2) - (popupWidth / 2);

  // Keep popup in viewport
  if (top < 10) top = rect.bottom + window.scrollY + 10;
  if (left < 10) left = 10;
  if (left + popupWidth > window.innerWidth - 10) left = window.innerWidth - popupWidth - 10;

  // Set flag to prevent immediate closing
  justOpenedPopup = true;
  if (popupCloseTimeout) clearTimeout(popupCloseTimeout);

  translatePopup.style.top = top + 'px';
  translatePopup.style.left = left + 'px';
  translatePopup.style.setProperty('display', 'block', 'important');

  console.log('[AI Translator] Popup displayed at:', top, left);

  // Reset the flag after a short delay
  popupCloseTimeout = setTimeout(() => {
    justOpenedPopup = false;
    console.log('[AI Translator] Popup can now be closed by clicking outside');
  }, 300);

  const resultDiv = document.getElementById('ai-translator-popup-result');
  resultDiv.textContent = 'Translating...';

  try {
    const { apiKey, savedTargetLang } = await chrome.storage.local.get(['apiKey', 'savedTargetLang']);

    if (!apiKey) {
      resultDiv.innerHTML = `
        <div style="text-align: center; color: #ef4444; padding: 20px;">
          <div style="font-size: 32px; margin-bottom: 8px;">?</div>
          <div style="font-weight: 600; margin-bottom: 8px;">Missing API Key</div>
          <div style="color: #6b7280; font-size: 13px;">
            Please set your Gemini API key in the extension settings.
          </div>
        </div>
      `;
      return;
    }

    const translation = await translateText(lastSelectedText, savedTargetLang || 'vi', apiKey);
    resultDiv.textContent = translation;

    // Track usage
    await trackUsage('aiTranslateCount', 'aiTranslateLastDate');
  } catch (error) {
    resultDiv.innerHTML = `
      <div style="text-align: center; color: #ef4444; padding: 20px;">
        <div style="font-size: 32px; margin-bottom: 8px;">?</div>
        <div style="font-weight: 600;">Translation Failed</div>
        <div style="color: #6b7280; font-size: 13px; margin-top: 8px;">${error.message}</div>
      </div>
    `;
  }
}

function hideTranslatePopup() {
  if (translatePopup) {
    translatePopup.style.setProperty('display', 'none', 'important');
  }
}

async function copyTranslation() {
  const resultDiv = document.getElementById('ai-translator-popup-result');
  const text = resultDiv.textContent;

  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    const copyBtn = document.getElementById('ai-translator-popup-copy');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 1500);
  } catch (error) {
    console.error('[AI Translator] Failed to copy:', error);
  }
}

// ========== TRANSLATION API ==========

async function translateText(text, targetLang, apiKey) {
  const languageNames = {
    'en': 'English',
    'vi': 'Vietnamese',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi'
  };

  const targetLanguage = languageNames[targetLang] || 'Vietnamese';

  const prompt = `You are a professional translator. Translate the following text into ${targetLanguage}. Only provide the translation, no explanations or additional text.

Text to translate:
${text}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        }
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => (console.log(response)));
    if (response.status === 429) {
      throw new Error('API Rate Limit Exceeded. Please wait 1-2 minutes before trying again.');
    }
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid response from API');
  }

  return data.candidates[0].content.parts[0].text.trim();
}

// ========== USAGE TRACKING ==========

async function trackUsage(countKey, dateKey) {
  try {
    const data = await chrome.storage.local.get([countKey, dateKey]);
    const today = new Date().toDateString();

    if (data[dateKey] !== today) {
      await chrome.storage.local.set({
        [countKey]: 1,
        [dateKey]: today
      });
    } else {
      await chrome.storage.local.set({
        [countKey]: (data[countKey] || 0) + 1
      });
    }
  } catch (error) {
    console.error('[AI Translator] Failed to track usage:', error);
  }
}

// ========== EVENT LISTENERS ==========

// Text selection - show translate icon
document.addEventListener('mouseup', (e) => {
  // Small delay to let selection complete
  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && selectedText.length > 0) {
      lastSelectedText = selectedText;
      try {
        lastSelectionRange = selection.getRangeAt(0).cloneRange();
      } catch (err) {
        // Ignore
      }
      showTranslateIcon();
    } else {
      hideTranslateIcon();
    }
  }, 10);
});

// Hide icon when clicking elsewhere
// Use mousedown but check if target is not part of text selection
document.addEventListener('mousedown', (e) => {
  if (translateIcon && !translateIcon.contains(e.target)) {
    const selection = window.getSelection();
    // Only hide if clicking outside and selection is collapsed (no text selected)
    if (selection.isCollapsed) {
      // Add a small delay to allow text selection to complete
      setTimeout(() => {
        const newSelection = window.getSelection();
        if (newSelection.isCollapsed || newSelection.toString().trim().length === 0) {
          hideTranslateIcon();
          hideTranslatePopup();
        }
      }, 50);
    }
  }
});



// Listen for messages from extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[AI Translator] Received message:', request.action);

  if (request.action === 'getSelectedText') {
    sendResponse({ text: lastSelectedText });
  } else if (request.action === 'translateFromContextMenu') {
    lastSelectedText = request.text || window.getSelection().toString().trim();
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      try {
        lastSelectionRange = selection.getRangeAt(0).cloneRange();
      } catch (err) {
        // Ignore
      }
    }
    showTranslatePopup();
    sendResponse({ success: true });
  } else if (request.action === 'checkGrammarFromContextMenu') {
    handleGrammarCheck(request.text);
    sendResponse({ success: true });
  } else if (request.action === 'translateFromShortcut') {
    console.log('[AI Translator] translateFromShortcut received');
    console.log('[AI Translator] Current selection:', window.getSelection().toString());
    console.log('[AI Translator] lastSelectedText:', lastSelectedText);

    let text = window.getSelection().toString().trim();

    // Fallback to last selected text if current selection is empty
    if (!text && lastSelectedText) {
      console.log('[AI Translator] No current selection, using last selected text');
      text = lastSelectedText;
    }

    console.log('[AI Translator] Text to translate:', text);

    if (text) {
      lastSelectedText = text;
      // Try to update range if it's a fresh selection
      if (window.getSelection().rangeCount > 0) {
        try {
          lastSelectionRange = window.getSelection().getRangeAt(0).cloneRange();
        } catch (err) {
          // Ignore
        }
      }
      console.log('[AI Translator] Calling showTranslatePopup...');
      showTranslatePopup();
    } else {
      console.log('[AI Translator] No text to translate');
      showNotification('No Text Selected', 'Please select some text first to translate.');
    }
    sendResponse({ success: true });
  } else if (request.action === 'checkGrammarFromShortcut') {
    const text = window.getSelection().toString().trim();
    handleGrammarCheck(text);
    sendResponse({ success: true });
  } else if (request.action === 'settingsUpdated') {
    loadSettings().then(() => {
      if (inlineTranslationEnabled && !translateIcon) {
        createTranslateIcon();
      }
    });
    sendResponse({ success: true });
  }
  return true;
});

// ========== GRAMMAR CHECK ==========

async function handleGrammarCheck(text) {
  if (!text) {
    text = window.getSelection().toString().trim();
  }

  if (!text) {
    showNotification('No Text Selected', 'Please select some text to check grammar.');
    return;
  }

  showNotification('Checking Grammar', 'Checking grammar...');

  try {
    const correctedText = await checkGrammar(text);

    if (correctedText !== text) {
      showGrammarDiff(text, correctedText);
    } else {
      showNotification('No Grammar Errors', 'Your text looks good!');
    }
  } catch (error) {
    console.error('[AI Translator] Grammar check error:', error);
    showNotification('Grammar Check Failed', error.message);
  }
}

async function checkGrammar(text) {
  const { apiKey } = await chrome.storage.local.get('apiKey');

  if (!apiKey) {
    throw new Error('API key not set');
  }

  const prompt = `You are a professional grammar checker. Your task is to:
1. Check ONLY grammar errors (subject-verb agreement, verb tense, sentence structure, articles, etc.)
2. Do NOT change capitalization - keep the original capitalization exactly as is
3. Do NOT add or remove punctuation unless it's a grammatical error
4. Fix only real grammar mistakes
5. Return ONLY the corrected version of the text, no explanations

Text to check:
${text}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        }
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 429) {
        throw new Error('Too many requests. Please wait a moment.');
    }
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid response from API');
  }

  // Track usage
  await trackUsage('grammarCheckCount', 'grammarLastDate');

  return data.candidates[0].content.parts[0].text.trim();
}

function showNotification(title, message) {
  const existing = document.getElementById('ai-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.id = 'ai-notification';
  notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <div style="font-size: 24px;">?</div>
      <div style="flex: 1;">
        <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px; font-size: 14px;">${title}</div>
        <div style="color: #6b7280; font-size: 13px;">${message}</div>
      </div>
      <button onclick="this.closest('#ai-notification').remove()" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #9ca3af; padding: 4px;">×</button>
    </div>
  `;

  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    maxWidth: '350px',
    padding: '16px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
    zIndex: '2147483647',
    border: '2px solid #667eea'
  });

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentElement) notification.remove();
  }, 5000);
}

function showGrammarDiff(original, corrected) {
  const existing = document.getElementById('ai-grammar-diff');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'ai-grammar-diff';
  dialog.innerHTML = `
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; padding: 24px; max-width: 600px; width: 90%; max-height: 80vh; overflow: auto; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); z-index: 2147483647;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0; font-size: 18px;">Grammar Suggestions</h2>
        <button onclick="this.closest('#ai-grammar-diff').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
      </div>
      <div style="margin-bottom: 16px;">
        <div style="font-size: 13px; font-weight: 600; color: #dc2626; margin-bottom: 8px;">Original:</div>
        <div style="padding: 12px; background: #fef2f2; border-radius: 8px; font-size: 14px;">${original}</div>
      </div>
      <div style="margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: 600; color: #16a34a; margin-bottom: 8px;">Corrected:</div>
        <div style="padding: 12px; background: #f0fdf4; border-radius: 8px; font-size: 14px;">${corrected}</div>
      </div>
      <div style="display: flex; gap: 12px;">
        <button id="ai-copy-corrected" style="flex: 1; padding: 12px; background: #22c55e; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Copy Corrected</button>
        <button onclick="this.closest('#ai-grammar-diff').remove()" style="flex: 1; padding: 12px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  document.getElementById('ai-copy-corrected').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(corrected);
      const btn = document.getElementById('ai-copy-corrected');
      btn.textContent = 'Copied!';
      setTimeout(() => dialog.remove(), 1500);
    } catch (error) {
      console.error('[AI Translator] Failed to copy:', error);
    }
  });
}

// Monitor for dynamically added inputs (basic grammar check)
const observer = new MutationObserver((mutations) => {
  if (!grammarCheckEnabled) return;

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === 1) {
        if (node.tagName === 'TEXTAREA' ||
            (node.tagName === 'INPUT' && node.type === 'text') ||
            (node.getAttribute && node.getAttribute('contenteditable') === 'true')) {
          setupGrammarCheck(node);
        }

        const textareas = node.querySelectorAll?.('textarea');
        const inputs = node.querySelectorAll?.('input[type="text"]');
        const editables = node.querySelectorAll?.('[contenteditable="true"]');

        textareas?.forEach(el => setupGrammarCheck(el));
        inputs?.forEach(el => setupGrammarCheck(el));
        editables?.forEach(el => setupGrammarCheck(el));
      }
    });
  });
});

function setupGrammarCheck(element) {
  if (grammarTimeouts.has(element)) return;

  element.addEventListener('input', () => {
    if (!grammarCheckEnabled) return;

    const text = element.value?.trim() || element.textContent?.trim() || '';
    if (text.length < 10) return;

    if (grammarTimeouts.has(element)) {
      clearTimeout(grammarTimeouts.get(element));
    }

    const timeout = setTimeout(async () => {
      try {
        const corrected = await checkGrammar(text);
        if (corrected !== text) {
          console.log('[AI Translator] Grammar suggestion available');
        }
      } catch (error) {
        // Silently fail
      }
    }, 2000);

    grammarTimeouts.set(element, timeout);
  });
}

// ========== INITIALIZATION ==========

// Initialize when DOM is ready
function init() {
  console.log('[AI Translator] Initializing...');

  loadSettings().then(() => {
    createTranslateIcon();
    createTranslatePopup();

    // Set up grammar check for existing inputs
    if (grammarCheckEnabled) {
      document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]').forEach(el => {
        setupGrammarCheck(el);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
}

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
