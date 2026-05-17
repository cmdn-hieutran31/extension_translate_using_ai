// Content script - runs on every webpage
// Simplified version for better reliability

console.log('[AI Translator] Content script loaded');

// State
let lastSelectedText = '';
let lastSelectionRange = null;
let lastSelectedContext = '';
let lastDictionaryData = null; // Stores dictionary data from last translation result
let translateIcon = null;
let translatePopup = null;
let justOpenedPopup = false; // Flag to prevent immediate closing
let popupCloseTimeout = null;

// Helper function to extract surrounding context/sentence
function extractContextSentence(selection, selectedText) {
    try {
        if (!selection || selection.rangeCount === 0) return '';
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const parent = container.nodeType === 3 ? container.parentNode : container;
        if (!parent) return '';
        
        let sentence = parent.textContent.trim().replace(/\s+/g, ' ');
        if (sentence.length > 200) {
            let idx = sentence.toLowerCase().indexOf(selectedText.toLowerCase());
            if (idx !== -1) {
                 let start = Math.max(0, idx - 80);
                 let end = Math.min(sentence.length, idx + selectedText.length + 80);
                 sentence = (start > 0 ? '...' : '') + sentence.substring(start, end) + (end < sentence.length ? '...' : '');
            } else {
                 sentence = sentence.substring(0, 150) + '...';
            }
        }
        return sentence;
    } catch (e) {
        return '';
    }
}

// Feature flags - defaults to true
let grammarCheckEnabled = true;
let inlineTranslationEnabled = true;
let hoverTranslationEnabled = true;

// Grammar check state
let grammarTimeouts = new WeakMap();

// Hover translation state
let currentTheme = 'dark';
let hoverTooltip = null;
let hoverDebounceTimer = null;
let lastHoveredWord = '';
let currentHoveredElement = null;
let hoverCache = new Map(); // sentence → { data, timestamp }

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ========== SETTINGS LOADING ==========

async function loadSettings() {
    try {
        const data = await chrome.storage.local.get([
            'grammarCheckEnabled',
            'inlineTranslationEnabled',
            'hoverTranslationEnabled',
            'globalTheme',
        ]);
        grammarCheckEnabled =
            data.grammarCheckEnabled !== undefined ? data.grammarCheckEnabled : true;
        inlineTranslationEnabled =
            data.inlineTranslationEnabled !== undefined
                ? data.inlineTranslationEnabled
                : true;
        hoverTranslationEnabled =
            data.hoverTranslationEnabled !== undefined
                ? data.hoverTranslationEnabled
                : true;
        const systemDefault = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        currentTheme = data.globalTheme || systemDefault;
        console.log('[AI Translator] Settings loaded:', {
            grammarCheckEnabled,
            inlineTranslationEnabled,
            hoverTranslationEnabled,
            currentTheme,
        });
    } catch (error) {
        console.error('[AI Translator] Failed to load settings:', error);
    }
}

// Keep currentTheme in sync when user toggles theme anywhere
chrome.storage.onChanged.addListener((changes) => {
    if (changes.globalTheme) {
        currentTheme = changes.globalTheme.newValue;
    }
});

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
    translateIcon.innerHTML = `<img src="${chrome.runtime.getURL('assets/icons/icon24.png')}" alt="Translate" style="width: 20px; height: 20px; pointer-events: none;">`;

    // Add styles via style tag
    if (!document.getElementById('ai-translator-styles')) {
        const style = document.createElement('style');
        style.id = 'ai-translator-styles';
        style.textContent = `
      .ai-translator-popup {
        --ai-popup-bg: rgba(255, 255, 255, 0.95);
        --ai-popup-text: #1f2937;
        --ai-popup-border: rgba(0, 0, 0, 0.1);
        --ai-popup-shadow: rgba(0, 0, 0, 0.15);
        --ai-header-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        --ai-result-bg: rgba(0, 0, 0, 0.03);
        --ai-result-border: rgba(0, 0, 0, 0.05);
        --ai-btn-bg: #667eea;
        --ai-btn-hover: #5568d3;
        --ai-btn-text: #ffffff;
      }

      .ai-theme-dark {
        --ai-popup-bg: rgba(20, 20, 25, 0.85);
        --ai-popup-text: #f8fafc;
        --ai-popup-border: rgba(255, 255, 255, 0.1);
        --ai-popup-shadow: rgba(0, 0, 0, 0.5);
        --ai-header-bg: linear-gradient(135deg, #7e22ce 0%, #3b82f6 100%);
        --ai-result-bg: rgba(0, 0, 0, 0.4);
        --ai-result-border: rgba(255, 255, 255, 0.05);
        --ai-btn-bg: rgba(255, 255, 255, 0.1);
        --ai-btn-hover: rgba(255, 255, 255, 0.2);
        --ai-btn-text: #ffffff;
      }

      .ai-translator-icon {
        position: absolute !important;
        width: 32px !important;
        height: 32px !important;
        background: none !important;
        box-shadow: none !important;
        cursor: pointer !important;
        display: none !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 2147483647 !important;
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
        border: none !important;
        user-select: none !important;
        padding: 0 !important;
      }
      .ai-translator-icon img {
        width: 32px !important;
        height: 32px !important;
        filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)) !important;
        pointer-events: none !important;
      }
      .ai-translator-icon:hover {
        transform: scale(1.15) !important;
      }

      .ai-translator-popup {
        position: absolute !important;
        width: 360px !important;
        max-width: 90vw !important;
        background: var(--ai-popup-bg) !important;
        color: var(--ai-popup-text) !important;
        border-radius: 16px !important;
        box-shadow: 0 10px 30px var(--ai-popup-shadow), inset 0 1px 1px rgba(255,255,255,0.1) !important;
        backdrop-filter: blur(20px) !important;
        -webkit-backdrop-filter: blur(20px) !important;
        z-index: 2147483647 !important;
        display: none !important;
        border: 1px solid var(--ai-popup-border) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        overflow: hidden !important;
        opacity: 1 !important;
        visibility: visible !important;
      }

      .ai-translator-popup-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 14px 18px !important;
        background: var(--ai-header-bg) !important;
        color: white !important;
      }
      .ai-translator-popup-title {
        font-weight: 600 !important;
        font-size: 15px !important;
        letter-spacing: -0.01em !important;
      }
      
      .ai-translator-popup-controls {
        display: flex !important;
        gap: 6px !important;
        align-items: center !important;
      }

      .ai-translator-popup-icon-btn {
        background: none !important;
        border: none !important;
        color: white !important;
        cursor: pointer !important;
        padding: 0 !important;
        width: 28px !important;
        height: 28px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 6px !important;
        transition: all 0.2s !important;
      }
      .ai-translator-popup-icon-btn:hover {
        background: rgba(255, 255, 255, 0.2) !important;
      }
      .ai-translator-popup-speak-header.playing {
        color: #fcd34d !important;
        animation: ai-pulse-header 1s infinite alternate !important;
      }
      
      @keyframes ai-pulse-header {
        from { opacity: 1; filter: drop-shadow(0 0 4px rgba(252, 211, 77, 0.6)); }
        to { opacity: 0.7; filter: drop-shadow(0 0 0 rgba(252, 211, 77, 0)); }
      }

      .ai-spinner {
        width: 14px !important;
        height: 14px !important;
        border: 2px solid rgba(128, 128, 128, 0.3) !important;
        border-top-color: var(--ai-popup-text) !important;
        border-radius: 50% !important;
        animation: ai-spin 0.6s linear infinite !important;
        display: inline-block !important;
      }
      @keyframes ai-spin {
        to { transform: rotate(360deg); }
      }

      .ai-translator-popup-content {
        padding: 16px !important;
      }

      .ai-translator-popup-result {
        padding: 14px !important;
        background: var(--ai-result-bg) !important;
        border: 1px solid var(--ai-result-border) !important;
        border-radius: 12px !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        color: var(--ai-popup-text) !important;
        min-height: 60px !important;
        max-height: 300px !important;
        overflow-y: auto !important;
        white-space: pre-wrap !important;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.05) !important;
      }
      .ai-translator-popup-result::-webkit-scrollbar { width: 6px !important; }
      .ai-translator-popup-result::-webkit-scrollbar-thumb { background: rgba(150,150,150,0.4) !important; border-radius: 3px !important; }

      .ai-translator-popup-source {
        font-size: 10px !important;
        color: var(--ai-popup-text) !important;
        opacity: 0.5 !important;
        font-style: italic !important;
        text-align: right !important;
        margin-top: 8px !important;
        padding-right: 4px !important;
      }

      .ai-translator-popup-actions {
        display: flex !important;
        gap: 8px !important;
        margin-top: 12px !important;
      }

      .ai-translator-popup-btn {
        flex: 1 !important;
        padding: 6px 10px !important;
        border: 1px solid rgba(128, 128, 128, 0.15) !important;
        border-radius: 12px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        background: rgba(128, 128, 128, 0.05) !important;
        color: var(--ai-popup-text) !important;
        transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 4px !important;
        min-width: 0 !important;
        white-space: nowrap !important;
      }
      .ai-theme-dark .ai-translator-popup-btn {
        background: rgba(255, 255, 255, 0.05) !important;
      }
      
      .ai-translator-popup-btn:hover {
        background: rgba(128, 128, 128, 0.15) !important;
        transform: translateY(-2px) !important;
      }
      .ai-theme-dark .ai-translator-popup-btn:hover {
        background: rgba(255, 255, 255, 0.1) !important;
      }
      
      .ai-translator-popup-btn#ai-translator-popup-save {
        color: #d97706 !important;
        border-color: rgba(245, 158, 11, 0.3) !important;
        background: rgba(245, 158, 11, 0.05) !important;
      }
      .ai-theme-dark .ai-translator-popup-btn#ai-translator-popup-save {
        color: #fcd34d !important;
      }
      .ai-translator-popup-btn#ai-translator-popup-save:hover {
        background: rgba(245, 158, 11, 0.15) !important;
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.1) !important;
      }
      
      .ai-translator-popup-btn#ai-translator-popup-ai {
        color: #059669 !important;
        border-color: rgba(16, 185, 129, 0.3) !important;
        background: rgba(16, 185, 129, 0.05) !important;
      }
      .ai-theme-dark .ai-translator-popup-btn#ai-translator-popup-ai {
        color: #34d399 !important;
      }
      .ai-translator-popup-btn#ai-translator-popup-ai:hover {
        background: rgba(16, 185, 129, 0.15) !important;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.1) !important;
      }

      .ai-dict-container {
        margin-top: 12px !important;
        border-top: 1px solid var(--ai-result-border) !important;
        padding-top: 12px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 12px !important;
      }
      .ai-dict-group { display: flex !important; flex-direction: column !important; gap: 6px !important; }
      .ai-dict-type {
        font-size: 11px !important;
        color: var(--ai-popup-text) !important;
        opacity: 0.7 !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
      }
      .ai-dict-item {
        display: flex !important;
        align-items: flex-start !important;
        gap: 8px !important;
        font-size: 13px !important;
        line-height: 1.4 !important;
      }
      .ai-dict-badge {
        background: var(--ai-header-bg) !important;
        color: white !important;
        padding: 2px 8px !important;
        border-radius: 6px !important;
        font-weight: 600 !important;
        white-space: nowrap !important;
        border: 1px solid rgba(255,255,255,0.2) !important;
      }
      .ai-dict-related {
        color: var(--ai-popup-text) !important;
        opacity: 0.6 !important;
        padding-top: 2px !important;
      }

      /* ===== HOVER TOOLTIP ===== */
      .ai-hover-tooltip {
        --ai-popup-bg: rgba(255, 255, 255, 0.95);
        --ai-popup-text: #1f2937;
        --ai-popup-border: rgba(0, 0, 0, 0.1);
        --ai-popup-shadow: rgba(0, 0, 0, 0.15);
        --ai-result-border: rgba(0, 0, 0, 0.05);
        position: absolute !important;
        width: max-content !important;
        min-width: 160px !important;
        max-width: 360px !important;
        background: var(--ai-popup-bg) !important;
        color: var(--ai-popup-text) !important;
        border: 1px solid var(--ai-popup-border) !important;
        border-radius: 10px !important;
        box-shadow: 0 8px 24px var(--ai-popup-shadow) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        z-index: 2147483647 !important;
        padding: 10px 12px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 13px !important;
        line-height: 1.5 !important;
        pointer-events: auto !important;
        display: none !important;
        animation: ai-hover-fadein 0.15s ease-out !important;
      }
      @keyframes ai-hover-fadein {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .ai-hover-tooltip-word {
        font-size: 11px !important;
        opacity: 0.5 !important;
        font-weight: 500 !important;
        margin-bottom: 4px !important;
        letter-spacing: 0.02em !important;
      }
      .ai-hover-tooltip-translation {
        font-weight: 400 !important;
        font-size: 13px !important;
        line-height: 1.6 !important;
        color: var(--ai-popup-text) !important;
      }
      .ai-hover-tooltip-dict {
        margin-top: 8px !important;
        padding-top: 8px !important;
        border-top: 1px solid var(--ai-result-border) !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
      }
      .ai-hover-tooltip-dict-type {
        font-size: 10px !important;
        opacity: 0.5 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        font-weight: 600 !important;
      }
      .ai-hover-tooltip-dict-words {
        font-size: 12px !important;
        opacity: 0.85 !important;
      }
      .ai-hover-tooltip-loading {
        opacity: 0.5 !important;
        font-style: italic !important;
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
      <div class="ai-translator-popup-controls">
        <button class="ai-translator-popup-icon-btn" id="ai-translator-popup-theme" title="Toggle Dark/Light Mode">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-moon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        </button>
        <button class="ai-translator-popup-icon-btn ai-translator-popup-speak-header" id="ai-translator-popup-speak" title="Listen" style="display: none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
        </button>
        <button class="ai-translator-popup-icon-btn" id="ai-translator-popup-close" style="font-size:22px; font-weight: 400;">×</button>
      </div>
    </div>
    <div class="ai-translator-popup-content">
      <div class="ai-translator-popup-result" id="ai-translator-popup-result">Translation will appear here...</div>
      <div id="ai-translator-popup-source" class="ai-translator-popup-source"></div>
      <div class="ai-translator-popup-actions">
        <button class="ai-translator-popup-btn" id="ai-translator-popup-copy">Copy</button>
        <button class="ai-translator-popup-btn" id="ai-translator-popup-save">⭐️ Save</button>
        <button class="ai-translator-popup-btn" id="ai-translator-popup-ai" style="display: none;">✨ AI Translate</button>
      </div>
    </div>
  `;

    document.body.appendChild(translatePopup);

    // Event listeners
    document
        .getElementById('ai-translator-popup-close')
        .addEventListener('click', hideTranslatePopup);
    document
        .getElementById('ai-translator-popup-copy')
        .addEventListener('click', copyTranslation);
    document
        .getElementById('ai-translator-popup-speak')
        .addEventListener('click', speakPopupText);

    // Theme toggle and sync
    function setContentTheme(theme) {
        // Default to dark since dark is the default premium theme
        const isDark = theme !== 'light'; 
        const svgBtn = document.getElementById('ai-translator-popup-theme');
        
        if (!svgBtn) return;
        
        if (isDark) {
            translatePopup.classList.add('ai-theme-dark');
            svgBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
        } else {
            translatePopup.classList.remove('ai-theme-dark');
            svgBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
        }
    }

    document
        .getElementById('ai-translator-popup-theme')
        .addEventListener('click', () => {
            const isDark = translatePopup.classList.contains('ai-theme-dark');
            const newTheme = isDark ? 'light' : 'dark';
            chrome.storage.local.set({ globalTheme: newTheme });
            setContentTheme(newTheme); // Apply locally immediately
        });
        
    // Listen for storage changes from other tabs/popups
    const themeStorageListener = (changes) => {
        if (changes.globalTheme && document.getElementById('ai-translator-popup-theme')) {
            setContentTheme(changes.globalTheme.newValue);
        }
    };
    chrome.storage.onChanged.addListener(themeStorageListener);
    translatePopup._themeStorageListener = themeStorageListener;
        
    // Load saved theme initially
    chrome.storage.local.get(['globalTheme'], (data) => {
        const defaultTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        const theme = data.globalTheme || defaultTheme;
        setContentTheme(theme);
    });

    translatePopup._setContentTheme = setContentTheme;

    // Save Flashcard listener
    document
        .getElementById('ai-translator-popup-save')
        .addEventListener('click', async () => {
             const resultDiv = document.getElementById('ai-translator-popup-result');
             const saveBtn = document.getElementById('ai-translator-popup-save');
             const originalText = saveBtn.textContent;
             
             // Get first translation line or whole text
             let transText = resultDiv.innerText;
             if (transText.includes('✨')) {
                 transText = transText.split('\n')[0].replace('✨', '').trim();
             }

             if (!lastSelectedText || !transText || transText.includes('Translating')) return;

             saveBtn.textContent = 'Saving...';
             
             chrome.runtime.sendMessage({
                 action: 'saveFlashcard',
                 data: {
                     word: lastSelectedText,
                     translation: transText,
                     context: window.location.href,
                     example: lastSelectedContext,
                     dictionary: lastDictionaryData || [] // save dictionary data
                 }
             }, (response) => {
                 if (response && response.success) {
                     saveBtn.textContent = 'Saved! ✅';
                     setTimeout(() => { saveBtn.textContent = originalText; }, 2000);
                 } else {
                     saveBtn.textContent = 'Failed ❌';
                     setTimeout(() => { saveBtn.textContent = originalText; }, 2000);
                 }
             });
        });

    // AI Translate button listener
    document
        .getElementById('ai-translator-popup-ai')
        .addEventListener('click', async () => {
            const resultDiv = document.getElementById('ai-translator-popup-result');
            const aiBtn = document.getElementById('ai-translator-popup-ai');

            resultDiv.textContent = 'Translating with AI...';
            aiBtn.disabled = true;
            aiBtn.innerHTML = '<div class="ai-spinner"></div> Translating...';

            try {
                const { apiKey, savedTargetLang } = await chrome.storage.local.get([
                    'apiKey',
                    'savedTargetLang',
                ]);

                // Force AI translation
                const translationData = await translateText(
                    lastSelectedText,
                    savedTargetLang || 'vi',
                    apiKey,
                    true // forceAI
                );

                resultDiv.innerHTML = translationData.data || translationData; // Handle object or string
                const sourceDiv = document.getElementById('ai-translator-popup-source');
                if (sourceDiv) sourceDiv.textContent = 'Translated by Gemini AI';
                
                aiBtn.style.display = 'none'; // Hide button after success
                aiBtn.disabled = false;
                aiBtn.innerHTML = '✨ AI Translate';
            } catch (error) {
                resultDiv.textContent = 'AI Translation failed: ' + error.message;
                aiBtn.disabled = false;
                aiBtn.innerHTML = '✨ AI Translate';
            }
        });

    // Close popup when clicking outside (but not immediately after opening)
    document.addEventListener('click', (e) => {
        if (translatePopup && translatePopup.style.display === 'block') {
            // Don't close if just opened (within 200ms)
            if (justOpenedPopup) return;

            if (
                !translatePopup.contains(e.target) &&
                (!translateIcon || !translateIcon.contains(e.target))
            ) {
                hideTranslatePopup();
            }
        }
    });

    console.log('[AI Translator] Translate popup added to body');
}

async function showTranslatePopup() {
    console.log(
        '[AI Translator] showTranslatePopup called, lastSelectedText:',
        lastSelectedText
    );

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
    const popupWidth = 360;
    const popupHeight = 200;

    let top = rect.top + window.scrollY - popupHeight - 10;
    let left = rect.left + window.scrollX + rect.width / 2 - popupWidth / 2;

    // Keep popup in viewport
    if (top < 10) top = rect.bottom + window.scrollY + 10;
    if (left < 10) left = 10;
    if (left + popupWidth > window.innerWidth - 10)
        left = window.innerWidth - popupWidth - 10;

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

    // Re-attach theme storage listener each time popup opens (was removed on close)
    if (translatePopup._setContentTheme && !translatePopup._themeStorageListener) {
        const listener = (changes) => {
            if (changes.globalTheme && translatePopup._setContentTheme) {
                translatePopup._setContentTheme(changes.globalTheme.newValue);
            }
        };
        chrome.storage.onChanged.addListener(listener);
        translatePopup._themeStorageListener = listener;
    }

    const resultDiv = document.getElementById('ai-translator-popup-result');
    const aiBtn = document.getElementById('ai-translator-popup-ai');
    const speakBtn = document.getElementById('ai-translator-popup-speak');

    // Reset UI state
    resultDiv.textContent = 'Translating...';
    const sourceDiv = document.getElementById('ai-translator-popup-source');
    if (sourceDiv) sourceDiv.textContent = '';
    aiBtn.style.display = 'none';
    aiBtn.disabled = false;
    aiBtn.innerHTML = '✨ AI Translate';
    speakBtn.style.setProperty('display', 'none', 'important');
    speakBtn.classList.remove('playing');
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    try {
        const { apiKey, savedTargetLang } = await chrome.storage.local.get([
            'apiKey',
            'savedTargetLang',
        ]);

        const translationResponse = await translateText(
            lastSelectedText,
            savedTargetLang || 'vi',
            apiKey
        );

        let htmlContent = '';
        let source = '';

        if (typeof translationResponse === 'object' && translationResponse.data) {
            source = translationResponse.source;
            const resData = translationResponse.data;

            if (typeof resData === 'object' && resData.dictionary) {
                // Capture dictionary data for save flashcard
                lastDictionaryData = resData.dictionary || [];
                // Render Dictionary UI
                htmlContent = `<div style="font-weight: 500; font-size: 15px; margin-bottom: 8px;">✨ ${escapeHtml(resData.translation)}</div>`;

                if (resData.dictionary.length > 0) {
                    htmlContent += `<div class="ai-dict-container">`;
                    resData.dictionary.forEach((group) => {
                        htmlContent += `
                             <div class="ai-dict-group">
                                 <div class="ai-dict-type">${escapeHtml(group.type)}</div>
                         `;
                        group.meanings.forEach((item) => {
                            const relatedText =
                                item.related && item.related.length > 0
                                    ? `<div class="ai-dict-related">- ${escapeHtml(item.related.join(', '))}</div>`
                                    : '';
                            htmlContent += `
                                 <div class="ai-dict-item">
                                     <div class="ai-dict-badge">${escapeHtml(item.word)}</div>
                                     ${relatedText}
                                 </div>
                             `;
                        });
                        htmlContent += `</div>`;
                    });
                    htmlContent += `</div>`;
                }
            } else {
                // Fallback normal string
                lastDictionaryData = null;
                htmlContent = String(resData).replace(/\n/g, '<br>');
            }
        } else {
            lastDictionaryData = null;
            htmlContent = String(translationResponse).replace(/\n/g, '<br>');
        }

        resultDiv.innerHTML = htmlContent;
        const sourceDiv = document.getElementById('ai-translator-popup-source');
        
        // Show AI button if source is mymemory
        if (source === 'mymemory') {
            if (sourceDiv) sourceDiv.textContent = 'Translated by MyMemory (Free API)';
            aiBtn.style.display = 'block';
            // Track MyMemory usage (chars)
            await trackMyMemoryUsage(lastSelectedText.length);
        } else if (source === 'google_dict') {
            if (sourceDiv) sourceDiv.textContent = 'Translated by Google Dictionary';
        } else {
            if (sourceDiv) sourceDiv.textContent = 'Translated by Gemini AI';
            // Track AI usage (requests)
            await trackUsage('aiTranslateCount', 'aiTranslateLastDate');
        }
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
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        const speakBtn = document.getElementById('ai-translator-popup-speak');
        if (speakBtn) {
            speakBtn.classList.remove('playing');
        }
        if (translatePopup._themeStorageListener) {
            chrome.storage.onChanged.removeListener(translatePopup._themeStorageListener);
            translatePopup._themeStorageListener = null;
        }
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

function speakPopupText() {
    const resultDiv = document.getElementById('ai-translator-popup-result');
    const speakBtn = document.getElementById('ai-translator-popup-speak');

    if (speakBtn.classList.contains('playing')) {
        window.speechSynthesis.cancel();
        speakBtn.classList.remove('playing');
        return;
    }

    window.speechSynthesis.cancel();

    // In content popup, we often translate FROM English (or auto) TO user target lang
    // The user wants to hear the *original* text
    let textToSpeak = lastSelectedText;

    if (!textToSpeak) return;

    chrome.storage.local.get(['savedTargetLang'], (data) => {
        const targetLang = data.savedTargetLang || 'vi';
        const cleanText = textToSpeak.replace(/<[^>]*>?/gm, '');

        chrome.i18n.detectLanguage(cleanText, (result) => {
            let lang = 'en-US';

            if (result && result.languages && result.languages.length > 0) {
                const detected = result.languages[0].language;
                const langMap = {
                    en: 'en-US',
                    vi: 'vi-VN',
                    es: 'es-ES',
                    fr: 'fr-FR',
                    de: 'de-DE',
                    it: 'it-IT',
                    pt: 'pt-PT',
                    ru: 'ru-RU',
                    ja: 'ja-JP',
                    ko: 'ko-KR',
                    zh: 'zh-CN',
                    ar: 'ar-SA',
                    hi: 'hi-IN',
                };
                lang = langMap[detected] || detected;
            } else {
                if (/[\uac00-\ud7a3]/.test(cleanText)) lang = 'ko-KR';
                else if (/[\u3040-\u30ff]/.test(cleanText)) lang = 'ja-JP';
                else if (/[\u4e00-\u9fff]/.test(cleanText)) lang = 'zh-CN';
                else if (targetLang === 'en') lang = 'vi-VN';
            }

            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = lang;

            utterance.onstart = () => {
                speakBtn.classList.add('playing');
            };

            utterance.onend = () => {
                speakBtn.classList.remove('playing');
            };

            utterance.onerror = () => {
                speakBtn.classList.remove('playing');
                showNotification('Lỗi', 'Không thể đọc văn bản này.');
            };

            window.speechSynthesis.speak(utterance);
        });
    });
}

// ========== TRANSLATION API ==========

async function translateText(text, targetLang, apiKey, forceAI = false) {
    // Note: We don't block on missing apiKey here anymore because MyMemory might work without it.
    // The background script will handle missing key error if it needs to fallback to AI.

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                action: 'callTranslateAPI',
                text: text,
                targetLang: targetLang,
                forceAI: forceAI,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response && response.success) {
                    // Return the whole response object (data + source) so UI can decide
                    // We also keep backward compatibility if some caller expects just string?
                    // No, callers are updated to handle object.
                    resolve(response);
                } else {
                    reject(new Error(response ? response.error : 'Unknown error'));
                }
            }
        );
    });
}

// ========== USAGE TRACKING ==========

async function trackUsage(countKey, dateKey) {
    try {
        const data = await chrome.storage.local.get([countKey, dateKey]);
        const today = new Date().toDateString();

        if (data[dateKey] !== today) {
            await chrome.storage.local.set({
                [countKey]: 1,
                [dateKey]: today,
            });
        } else {
            await chrome.storage.local.set({
                [countKey]: (data[countKey] || 0) + 1,
            });
        }
    } catch (error) {
        console.error('[AI Translator] Failed to track usage:', error);
    }
}

async function trackMyMemoryUsage(charCount) {
    const MY_MEMORY_CHARS = 'myMemoryChars';
    const MY_MEMORY_LAST_DATE = 'myMemoryLastDate';

    try {
        const data = await chrome.storage.local.get([
            MY_MEMORY_CHARS,
            MY_MEMORY_LAST_DATE,
        ]);
        const today = new Date().toDateString();

        if (data[MY_MEMORY_LAST_DATE] !== today) {
            // New day, reset
            await chrome.storage.local.set({
                [MY_MEMORY_CHARS]: charCount,
                [MY_MEMORY_LAST_DATE]: today,
            });
        } else {
            // Same day, accumulate
            await chrome.storage.local.set({
                [MY_MEMORY_CHARS]: (data[MY_MEMORY_CHARS] || 0) + charCount,
            });
        }
    } catch (error) {
        console.error('[AI Translator] Failed to track MyMemory usage:', error);
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
                lastSelectedContext = extractContextSentence(selection, selectedText);
            } catch (err) {
                lastSelectedContext = '';
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
                if (
                    newSelection.isCollapsed ||
                    newSelection.toString().trim().length === 0
                ) {
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
                lastSelectedContext = extractContextSentence(selection, lastSelectedText);
            } catch (err) {
                lastSelectedContext = '';
            }
        } else {
            lastSelectedContext = '';
        }
        showTranslatePopup();
        sendResponse({ success: true });
    } else if (request.action === 'checkGrammarFromContextMenu') {
        handleGrammarCheck(request.text);
        sendResponse({ success: true });
    } else if (request.action === 'translateFromShortcut') {
        console.log('[AI Translator] translateFromShortcut received');
        console.log(
            '[AI Translator] Current selection:',
            window.getSelection().toString()
        );
        console.log('[AI Translator] lastSelectedText:', lastSelectedText);

        let text = window.getSelection().toString().trim();

        // Fallback to last selected text if current selection is empty
        if (!text && lastSelectedText) {
            console.log(
                '[AI Translator] No current selection, using last selected text'
            );
            text = lastSelectedText;
        }

        console.log('[AI Translator] Text to translate:', text);

        if (text) {
            lastSelectedText = text;
            // Try to update range if it's a fresh selection
            if (window.getSelection().rangeCount > 0) {
                try {
                    lastSelectionRange = window
                        .getSelection()
                        .getRangeAt(0)
                        .cloneRange();
                } catch (err) {
                    // Ignore
                }
            }
            console.log('[AI Translator] Calling showTranslatePopup...');
            showTranslatePopup();
        } else {
            console.log('[AI Translator] No text to translate');
            showNotification(
                'No Text Selected',
                'Please select some text first to translate.'
            );
        }
        sendResponse({ success: true });
    } else if (request.action === 'checkGrammarFromShortcut') {
        const text = window.getSelection().toString().trim() || lastSelectedText;
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
        showNotification(
            'No Text Selected',
            'Please select some text to check grammar.'
        );
        return;
    }

    showNotification('Checking Grammar', 'Checking grammar...');

    try {
        const result = await checkGrammar(text);

        if (result.data !== text) {
            showGrammarDiff(text, result.data, result.source);
        } else {
            showNotification('No Grammar Errors', 'Your text looks good!');
        }
    } catch (error) {
        console.error('[AI Translator] Grammar check error:', error);
        showNotification('Grammar Check Failed', error.message);
    }
}

async function checkGrammar(text, forceAI = false) {
    // Note: We don't block on missing apiKey here anymore because LanguageTool works without it.
    // The background script will handle missing key error if it needs to fallback to AI.

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                action: 'callGrammarCheckAPI',
                text: text,
                forceAI: forceAI,
            },
            async (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response && response.success) {
                    // Track usage on success
                    await trackUsage('grammarCheckCount', 'grammarLastDate');
                    resolve({ data: response.data, source: response.source });
                } else {
                    reject(new Error(response ? response.error : 'Unknown error'));
                }
            }
        );
    });
}

function showNotification(title, message) {
    const existing = document.getElementById('ai-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'ai-notification';

    // Choose icon based on title/context (simple heuristic)
    const lowerTitle = title.toLowerCase();
    // It is an error if it contains 'failed' OR ('error' provided it's NOT 'No Grammar Errors')
    const isError =
        lowerTitle.includes('failed') ||
        (lowerTitle.includes('error') && !lowerTitle.includes('no grammar errors'));

    const isSuccess = !isError;
    const icon = isSuccess ? '✨' : '⚠️';
    const iconColor = isSuccess ? '#10b981' : '#ef4444'; // Green or Red
    const accentColor = isSuccess ? '#10b981' : '#ef4444';

    notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 16px;">
      <div style="font-size: 20px; background: ${isSuccess ? '#d1fae5' : '#fee2e2'}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${iconColor}; flex-shrink: 0;">${icon}</div>
      <div style="flex: 1;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 15px; font-family: sans-serif;">${escapeHtml(title)}</div>
        <div style="color: #6b7280; font-size: 14px; line-height: 1.4; font-family: sans-serif;">${escapeHtml(message)}</div>
      </div>
      <button class="ai-notification-close" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #9ca3af; padding: 0; line-height: 1; margin-left: 8px;">×</button>
    </div>
  `;
    notification.querySelector('.ai-notification-close').addEventListener('click', () => notification.remove());

    Object.assign(notification.style, {
        position: 'fixed',
        top: '24px',
        right: '24px',
        maxWidth: '380px',
        width: 'auto',
        minWidth: '300px',
        padding: '20px',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
        zIndex: '2147483647',
        border: '1px solid rgba(0,0,0,0.05)',
        borderLeft: `5px solid ${accentColor}`,
        animation: 'slideIn 0.3s ease-out forwards',
        fontFamily: 'sans-serif', // Ensure font consistency
    });

    // Add animation keyframes if not present
    if (!document.getElementById('ai-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'ai-notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { opacity: 0; transform: translateX(20px); }
                to { opacity: 1; transform: translateX(0); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-10px)';
            notification.style.transition = 'all 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

function showGrammarDiff(original, corrected, source = 'languagetool') {
    const existing = document.getElementById('ai-grammar-diff');
    if (existing) existing.remove();

    // Generate diff
    const diff = diffWords(original, corrected);

    // Build HTML for original (showing changes)
    let originalHtml = '';
    let correctedHtml = '';

    diff.forEach((part) => {
        const escapedValue = part.value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        if (part.added) {
            correctedHtml += `<span style="color: #16a34a; font-weight: bold; background: #dcfce7; padding: 0 2px; border-radius: 2px;">${escapedValue}</span> `;
        } else if (part.removed) {
            originalHtml += `<span style="text-decoration: line-through; color: #dc2626; background: #fee2e2; padding: 0 2px; border-radius: 2px;">${escapedValue}</span> `;
        } else {
            originalHtml += escapedValue + ' ';
            correctedHtml += escapedValue + ' ';
        }
    });

    const isAI = source === 'ai';
    const aiButtonHtml = isAI
        ? ''
        : `<button id="ai-deep-check" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">✨ Deep Check (AI)</button>`;

    const dialog = document.createElement('div');
    dialog.id = 'ai-grammar-diff';

    // Full-screen backdrop — clicking outside the card closes the modal
    Object.assign(dialog.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483646',
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
    });

    dialog.innerHTML = `
    <div id="ai-grammar-diff-card" style="background: white; border-radius: 12px; padding: 24px; max-width: 600px; width: 100%; max-height: 80vh; overflow: auto; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); color: #1f2937; font-family: sans-serif; position: relative;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0; font-size: 18px; color: #1f2937;">Grammar Suggestions ${isAI ? '<span style="font-size: 12px; background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; vertical-align: middle;">AI Powered</span>' : ''}</h2>
        <button id="ai-grammar-close-btn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">×</button>
      </div>
      <div style="margin-bottom: 16px;">
        <div style="font-size: 13px; font-weight: 600; color: #dc2626; margin-bottom: 8px;">Original (Changes marked):</div>
        <div style="padding: 12px; background: #fef2f2; border-radius: 8px; font-size: 14px; color: #1f2937; line-height: 1.6;">${originalHtml}</div>
      </div>
      <div style="margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: 600; color: #16a34a; margin-bottom: 8px;">Corrected:</div>
        <div style="padding: 12px; background: #f0fdf4; border-radius: 8px; font-size: 14px; color: #1f2937; line-height: 1.6;">${correctedHtml}</div>
      </div>
      <div style="display: flex; gap: 12px;">
        <button id="ai-copy-corrected" style="flex: 1; padding: 12px; background: #22c55e; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Copy Corrected</button>
        ${aiButtonHtml}
        <button id="ai-grammar-close-btn2" style="flex: 1; padding: 12px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Close</button>
      </div>
    </div>
  `;

    document.body.appendChild(dialog);

    // Close on backdrop click (click outside the card)
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.remove();
    });

    dialog.querySelector('#ai-grammar-close-btn').addEventListener('click', () => dialog.remove());
    dialog.querySelector('#ai-grammar-close-btn2').addEventListener('click', () => dialog.remove());

    document
        .getElementById('ai-copy-corrected')
        .addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(corrected);
                const btn = document.getElementById('ai-copy-corrected');
                btn.textContent = 'Copied!';
                setTimeout(() => dialog.remove(), 1500);
            } catch (error) {
                console.error('[AI Translator] Failed to copy:', error);
            }
        });

    if (!isAI) {
        document
            .getElementById('ai-deep-check')
            .addEventListener('click', async () => {
                const btn = document.getElementById('ai-deep-check');
                btn.textContent = 'Checking with AI...';
                btn.disabled = true;

                try {
                    // Check if API key exists first? No, let checkGrammar handle error
                    const result = await checkGrammar(original, true); // forceAI = true

                    // Remove current dialog and show new one
                    dialog.remove();
                    showGrammarDiff(original, result.data, result.source);
                } catch (error) {
                    btn.textContent = 'Failed: ' + error.message;
                    btn.style.background = '#ef4444';
                }
            });
    }
}

// Simple word diff algorithm
function diffWords(string1, string2) {
    const words1 = string1.split(/\s+/);
    const words2 = string2.split(/\s+/);

    // Using a simplified diff (LCS based typically, but here we can use a simpler approach for MVP)
    // Actually, let's implement a basic LCS for better results
    const matrix = [];
    for (let i = 0; i <= words1.length; i++) {
        matrix[i] = new Array(words2.length + 1).fill(0);
    }

    for (let i = 1; i <= words1.length; i++) {
        for (let j = 1; j <= words2.length; j++) {
            if (words1[i - 1] === words2[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }

    const diff = [];
    let i = words1.length;
    let j = words2.length;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && words1[i - 1] === words2[j - 1]) {
            diff.unshift({ value: words1[i - 1], added: false, removed: false });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            diff.unshift({ value: words2[j - 1], added: true, removed: false });
            j--;
        } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
            diff.unshift({ value: words1[i - 1], added: false, removed: true });
            i--;
        }
    }

    return diff;
}

// Monitor for dynamically added inputs (basic grammar check)
const observer = new MutationObserver((mutations) => {
    if (!grammarCheckEnabled) return;

    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
                if (
                    node.tagName === 'TEXTAREA' ||
                    (node.tagName === 'INPUT' && node.type === 'text') ||
                    (node.getAttribute &&
                        node.getAttribute('contenteditable') === 'true')
                ) {
                    setupGrammarCheck(node);
                }

                const textareas = node.querySelectorAll?.('textarea');
                const inputs = node.querySelectorAll?.('input[type="text"]');
                const editables = node.querySelectorAll?.(
                    '[contenteditable="true"]'
                );

                textareas?.forEach((el) => setupGrammarCheck(el));
                inputs?.forEach((el) => setupGrammarCheck(el));
                editables?.forEach((el) => setupGrammarCheck(el));
            }
        });
    });
});

function setupGrammarCheck(element) {
    if (grammarTimeouts.has(element)) return;

    element.addEventListener('input', () => {
        if (!grammarCheckEnabled) return;

        // Remove existing indicator if any
        removeGrammarIndicator(element);

        const text = element.value?.trim() || element.textContent?.trim() || '';
        if (text.length < 5) return; // Reduced min length

        if (grammarTimeouts.has(element)) {
            clearTimeout(grammarTimeouts.get(element));
        }

        // Reduced debounce to 1.5s as requested
        const timeout = setTimeout(async () => {
            try {
                const result = await checkGrammar(text);
                if (result.data !== text) {
                    showGrammarIndicator(element, text, result.data, result.source);
                }
            } catch (error) {
                // Silently fail
            }
        }, 1500);

        grammarTimeouts.set(element, timeout);
    });
}

function showGrammarIndicator(element, original, corrected, source) {
    removeGrammarIndicator(element); // Ensure clean slate

    const indicator = document.createElement('div');
    indicator.className = 'ai-grammar-indicator';
    indicator.innerHTML = '✨'; // Changed from 📝 to ✨
    indicator.title = 'AI Grammar Suggestion Available';

    // Position fixed so it stays anchored even when page is scrolled
    const rect = element.getBoundingClientRect();

    Object.assign(indicator.style, {
        position: 'fixed',
        top: `${rect.top + 4}px`,
        left: `${rect.right - 30}px`,
        cursor: 'pointer',
        fontSize: '16px',
        zIndex: '2147483647',
        animation: 'bounce 1s infinite',
        background: 'white',
        borderRadius: '50%',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        width: '24px',
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #e5e7eb',
    });

    indicator.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showGrammarDiff(original, corrected, source);
        indicator.remove();
    });

    // Store reference on element for easy removal
    element.dataset.aiGrammarId = Date.now();
    indicator.dataset.forElementId = element.dataset.aiGrammarId;

    document.body.appendChild(indicator);
}

function removeGrammarIndicator(element) {
    if (element.dataset.aiGrammarId) {
        const existing = document.querySelector(
            `.ai-grammar-indicator[data-for-element-id="${element.dataset.aiGrammarId}"]`
        );
        if (existing) existing.remove();
    }
}

// ========== HOVER TRANSLATION ==========

const HOVER_CACHE_TTL = 5 * 60 * 1000; // 5 phút
const HOVER_TAG_BLACKLIST = new Set(['INPUT', 'TEXTAREA', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'SELECT', 'BUTTON']);

const HOVER_BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'SPAN', 'A']);

function getSentenceAtPoint(x, y) {
    try {
        const range = document.caretRangeFromPoint(x, y);
        if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

        const textNode = range.startContainer;
        const parent = textNode.parentElement;
        if (!parent) return null;

        // Blacklist check
        if (HOVER_TAG_BLACKLIST.has(parent.tagName)) return null;
        if (parent.closest('[contenteditable="true"]')) return null;
        if (parent.closest('.ai-hover-tooltip, .ai-translator-popup, .ai-translator-icon, .ai-grammar-diff, #ai-notification')) return null;

        // Find nearest block-level ancestor to get full sentence context
        let blockEl = parent;
        while (blockEl.parentElement && !HOVER_BLOCK_TAGS.has(blockEl.tagName)) {
            blockEl = blockEl.parentElement;
        }

        // Walk text nodes in blockEl to find cursor's global char offset
        const treeWalker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
        let charOffset = 0;
        let cursorGlobalOffset = null;
        let node;

        while ((node = treeWalker.nextNode())) {
            if (node === textNode) {
                cursorGlobalOffset = charOffset + range.startOffset;
                break;
            }
            charOffset += node.textContent.length;
        }

        if (cursorGlobalOffset === null) return null;

        const fullText = (blockEl.innerText || blockEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (!fullText || fullText.length < 3) return null;

        // Find sentence boundaries (split on . ? ! newlines)
        const sentenceEndRe = /[.?!。！？]/;
        let start = cursorGlobalOffset;
        let end = cursorGlobalOffset;

        while (start > 0 && !sentenceEndRe.test(fullText[start - 1]) && fullText[start - 1] !== '\n') start--;
        while (end < fullText.length && !sentenceEndRe.test(fullText[end]) && fullText[end] !== '\n') end++;
        if (end < fullText.length && sentenceEndRe.test(fullText[end])) end++; // include ending punctuation

        const sentence = fullText.slice(start, end).trim();
        if (!sentence || sentence.length < 3 || sentence.length > 600) return null;

        // Use cursor position for tooltip placement
        const rect = range.getBoundingClientRect();
        return { sentence, rect, element: blockEl };
    } catch (e) {
        return null;
    }
}

function createHoverTooltip() {
    if (hoverTooltip) return;
    if (!document.body) return;

    hoverTooltip = document.createElement('div');
    hoverTooltip.className = 'ai-hover-tooltip';
    hoverTooltip.innerHTML = `
        <div class="ai-hover-tooltip-word"></div>
        <div class="ai-hover-tooltip-translation"></div>
    `;
    document.body.appendChild(hoverTooltip);
}

function showHoverTooltip(sentence, rect, data) {
    if (!hoverTooltip) createHoverTooltip();
    if (!hoverTooltip) return;

    // Apply current theme
    if (currentTheme !== 'light') hoverTooltip.classList.add('ai-theme-dark');
    else hoverTooltip.classList.remove('ai-theme-dark');

    const wordEl = hoverTooltip.querySelector('.ai-hover-tooltip-word');
    const transEl = hoverTooltip.querySelector('.ai-hover-tooltip-translation');

    wordEl.style.display = 'none';

    if (data === null) {
        transEl.innerHTML = '<span class="ai-hover-tooltip-loading">Đang dịch...</span>';
    } else {
        const translation = data && typeof data === 'object' ? data.translation : String(data);
        transEl.textContent = '✨ ' + escapeHtml(translation);
    }

    // Measure actual size before positioning (hidden off-screen)
    hoverTooltip.style.visibility = 'hidden';
    hoverTooltip.style.setProperty('display', 'block', 'important');
    const tooltipW = hoverTooltip.offsetWidth;
    const tooltipH = hoverTooltip.offsetHeight;
    hoverTooltip.style.visibility = '';

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const gap = 8;

    let top = rect.bottom + scrollY + gap;
    let left = rect.left + scrollX;

    // Flip above if going off-screen below
    if (rect.bottom + tooltipH + gap > window.innerHeight) {
        top = rect.top + scrollY - tooltipH - gap;
    }
    // Keep within horizontal bounds
    if (left + tooltipW > window.innerWidth - 10) {
        left = window.innerWidth - tooltipW - 10;
    }
    if (left < 10) left = 10;

    hoverTooltip.style.top = top + 'px';
    hoverTooltip.style.left = left + 'px';
}

function hideHoverTooltip() {
    clearTimeout(hoverDebounceTimer);
    hoverDebounceTimer = null;
    if (hoverTooltip) {
        hoverTooltip.style.setProperty('display', 'none', 'important');
    }
    lastHoveredWord = '';
    currentHoveredElement = null;
}

async function translateHoveredSentence(sentence, rect) {
    // Check cache first
    const cached = hoverCache.get(sentence);
    if (cached && Date.now() - cached.timestamp < HOVER_CACHE_TTL) {
        if (lastHoveredWord !== sentence) return;
        showHoverTooltip(sentence, rect, cached.data);
        return;
    }

    // Show loading state
    showHoverTooltip(sentence, rect, null);

    try {
        const { savedTargetLang } = await chrome.storage.local.get(['savedTargetLang']);
        const targetLang = savedTargetLang || 'vi';

        chrome.runtime.sendMessage(
            { action: 'callTranslateAPI', text: sentence, targetLang },
            (response) => {
                if (chrome.runtime.lastError) return;
                // Discard if user moved away before response arrived
                if (lastHoveredWord !== sentence) return;

                if (response && response.success) {
                    const resData = response.data;
                    const displayData = typeof resData === 'object' ? resData : { translation: String(resData) };
                    hoverCache.set(sentence, { data: displayData, timestamp: Date.now() });
                    showHoverTooltip(sentence, rect, displayData);
                } else {
                    hideHoverTooltip();
                }
            }
        );
    } catch (e) {
        hideHoverTooltip();
    }
}

// Hide tooltip when clicking outside (not on the tooltip itself)
document.addEventListener('click', (e) => {
    if (lastHoveredWord && !(hoverTooltip && hoverTooltip.contains(e.target))) {
        hideHoverTooltip();
    }
}, true);

// Hide tooltip when mouse leaves the page
window.addEventListener('blur', hideHoverTooltip);
document.addEventListener('mouseleave', hideHoverTooltip);

// Main hover listener — no Alt required, fires on plain hover
document.addEventListener('mousemove', (e) => {
    if (!hoverTranslationEnabled) return;

    // If tooltip is showing and cursor left the tracked element, hide immediately
    // (but not if cursor moved onto the tooltip itself)
    if (lastHoveredWord && currentHoveredElement && !currentHoveredElement.contains(e.target)) {
        if (hoverTooltip && hoverTooltip.contains(e.target)) return;
        hideHoverTooltip();
        return;
    }

    clearTimeout(hoverDebounceTimer);
    hoverDebounceTimer = setTimeout(() => {
        const result = getSentenceAtPoint(e.clientX, e.clientY);
        if (!result) {
            hideHoverTooltip();
            return;
        }
        if (result.sentence === lastHoveredWord) return; // same sentence, tooltip already showing
        lastHoveredWord = result.sentence;
        currentHoveredElement = result.element;
        translateHoveredSentence(result.sentence, result.rect);
    }, 300);
});

// ========== INITIALIZATION ==========

// Initialize when DOM is ready
function init() {
    console.log('[AI Translator] Initializing...');

    loadSettings().then(() => {
        createTranslateIcon();
        createTranslatePopup();
        createHoverTooltip();

        // Set up grammar check for existing inputs
        document
            .querySelectorAll(
                'textarea, input[type="text"], [contenteditable="true"]'
            )
            .forEach((el) => {
                setupGrammarCheck(el);
            });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
