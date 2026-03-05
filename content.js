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
        const data = await chrome.storage.local.get([
            'grammarCheckEnabled',
            'inlineTranslationEnabled',
        ]);
        grammarCheckEnabled =
            data.grammarCheckEnabled !== undefined ? data.grammarCheckEnabled : true;
        inlineTranslationEnabled =
            data.inlineTranslationEnabled !== undefined
                ? data.inlineTranslationEnabled
                : true;
        console.log('[AI Translator] Settings loaded:', {
            grammarCheckEnabled,
            inlineTranslationEnabled,
        });
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
        width: 32px !important; /* Slightly smaller to fit icon better */
        height: 32px !important;
        background: none !important; /* Transparent background */
        box-shadow: none !important; /* No shadow */
        cursor: pointer !important;
        display: none !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 2147483647 !important;
        transition: all 0.2s ease !important;
        border: none !important; /* No border */
        user-select: none !important;
        padding: 0 !important;
      }
      .ai-translator-icon img {
        width: 32px !important; /* Full size image */
        height: 32px !important;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); /* Add shadow to image instead */
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
      .ai-translator-popup-speak-header {
        background: none !important;
        border: none !important;
        color: white !important;
        font-size: 16px !important;
        cursor: pointer !important;
        padding: 0 !important;
        width: 24px !important;
        height: 24px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
        transition: all 0.2s !important;
      }
      .ai-translator-popup-speak-header:hover {
        background: rgba(255, 255, 255, 0.2) !important;
      }
      .ai-translator-popup-speak-header.playing {
        color: #fcd34d !important;
        animation: ai-pulse-header 1s infinite alternate !important;
      }
      @keyframes ai-pulse-header {
        from { opacity: 1; text-shadow: 0 0 5px rgba(252, 211, 77, 0.5); }
        to { opacity: 0.6; text-shadow: 0 0 10px rgba(252, 211, 77, 0); }
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
        max-height: 300px !important;
        overflow-y: auto !important;
        white-space: pre-wrap !important;
      }
      .ai-translator-popup-result::-webkit-scrollbar {
        width: 6px !important;
      }
      .ai-translator-popup-result::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .ai-translator-popup-result::-webkit-scrollbar-thumb {
        background: #d1d5db !important;
        border-radius: 3px !important;
      }
      .ai-translator-popup-result::-webkit-scrollbar-thumb:hover {
        background: #9ca3af !important;
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
      .ai-dict-container {
        margin-top: 12px !important;
        border-top: 1px solid #e5e7eb !important;
        padding-top: 12px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 12px !important;
      }
      .ai-dict-group {
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
      }
      .ai-dict-type {
        font-size: 12px !important;
        color: #6b7280 !important;
        font-weight: 500 !important;
        text-transform: capitalize !important;
      }
      .ai-dict-item {
        display: flex !important;
        align-items: flex-start !important;
        gap: 8px !important;
        font-size: 13px !important;
        line-height: 1.4 !important;
      }
      .ai-dict-badge {
        background: #111827 !important;
        color: white !important;
        padding: 2px 8px !important;
        border-radius: 4px !important;
        font-weight: 600 !important;
        white-space: nowrap !important;
      }
      .ai-dict-related {
        color: #4b5563 !important;
        padding-top: 2px !important;
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
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="ai-translator-popup-speak-header" id="ai-translator-popup-speak" title="Listen" style="display: none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
        </button>
        <button class="ai-translator-popup-close" id="ai-translator-popup-close">×</button>
      </div>
    </div>
    <div class="ai-translator-popup-content">
      <div class="ai-translator-popup-result" id="ai-translator-popup-result">Translation will appear here...</div>
      <div class="ai-translator-popup-actions">
        <button class="ai-translator-popup-btn" id="ai-translator-popup-copy">Copy</button>
        <button class="ai-translator-popup-btn" id="ai-translator-popup-ai" style="display: none; background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;">✨ Translate with AI</button>
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

    // AI Translate button listener
    document
        .getElementById('ai-translator-popup-ai')
        .addEventListener('click', async () => {
            const resultDiv = document.getElementById('ai-translator-popup-result');
            const aiBtn = document.getElementById('ai-translator-popup-ai');

            resultDiv.textContent = 'Translating with AI...';
            aiBtn.disabled = true;
            aiBtn.textContent = 'Processing...';

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

                resultDiv.textContent = translationData.data || translationData; // Handle object or string
                aiBtn.style.display = 'none'; // Hide button after success
            } catch (error) {
                resultDiv.textContent = 'AI Translation failed: ' + error.message;
                aiBtn.disabled = false;
                aiBtn.textContent = '✨ Retry with AI';
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
    const popupWidth = 320;
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

    const resultDiv = document.getElementById('ai-translator-popup-result');
    const aiBtn = document.getElementById('ai-translator-popup-ai');
    const speakBtn = document.getElementById('ai-translator-popup-speak');

    // Reset UI state
    resultDiv.textContent = 'Translating...';
    aiBtn.style.display = 'none';
    aiBtn.disabled = false;
    aiBtn.textContent = '✨ Translate with AI';
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
                // Render Dictionary UI
                htmlContent = `<div style="font-weight: 500; font-size: 15px; margin-bottom: 8px;">✨ ${resData.translation}</div>`;

                if (resData.dictionary.length > 0) {
                    htmlContent += `<div class="ai-dict-container">`;
                    resData.dictionary.forEach((group) => {
                        htmlContent += `
                             <div class="ai-dict-group">
                                 <div class="ai-dict-type">${group.type}</div>
                         `;
                        group.meanings.forEach((item) => {
                            const relatedText =
                                item.related && item.related.length > 0
                                    ? `<div class="ai-dict-related">- ${item.related.join(', ')}</div>`
                                    : '';
                            htmlContent += `
                                 <div class="ai-dict-item">
                                     <div class="ai-dict-badge">${item.word}</div>
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
                htmlContent = String(resData).replace(/\n/g, '<br>');
            }
        } else {
            htmlContent = String(translationResponse).replace(/\n/g, '<br>');
        }

        resultDiv.innerHTML = htmlContent;
        speakBtn.style.setProperty('display', 'flex', 'important');

        // Show AI button if source is mymemory
        if (source === 'mymemory') {
            aiBtn.style.display = 'block';
            // Track MyMemory usage (chars)
            await trackMyMemoryUsage(lastSelectedText.length);
        } else {
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
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 15px; font-family: sans-serif;">${title}</div>
        <div style="color: #6b7280; font-size: 14px; line-height: 1.4; font-family: sans-serif;">${message}</div>
      </div>
      <button onclick="this.closest('#ai-notification').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #9ca3af; padding: 0; line-height: 1; margin-left: 8px;">×</button>
    </div>
  `;

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
    dialog.innerHTML = `
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; padding: 24px; max-width: 600px; width: 90%; max-height: 80vh; overflow: auto; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); z-index: 2147483647; color: #1f2937; font-family: sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0; font-size: 18px; color: #1f2937;">Grammar Suggestions ${isAI ? '<span style="font-size: 12px; background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; vertical-align: middle;">AI Powered</span>' : ''}</h2>
        <button onclick="this.closest('#ai-grammar-diff').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">×</button>
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
        <button onclick="this.closest('#ai-grammar-diff').remove()" style="flex: 1; padding: 12px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Close</button>
      </div>
    </div>
  `;

    document.body.appendChild(dialog);

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

    // Position relative to input
    const rect = element.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    Object.assign(indicator.style, {
        position: 'absolute',
        top: `${rect.top + scrollTop + 4}px`,
        left: `${rect.right + scrollLeft - 30}px`, // Inside right edge
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

// ========== INITIALIZATION ==========

// Initialize when DOM is ready
function init() {
    console.log('[AI Translator] Initializing...');

    loadSettings().then(() => {
        createTranslateIcon();
        createTranslatePopup();

        // Set up grammar check for existing inputs
        if (grammarCheckEnabled) {
            document
                .querySelectorAll(
                    'textarea, input[type="text"], [contenteditable="true"]'
                )
                .forEach((el) => {
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
