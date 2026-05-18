// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const saveKeyBtn = document.getElementById('saveKey');
const sourceText = document.getElementById('sourceText');
const targetLang = document.getElementById('targetLang');
const translateBtn = document.getElementById('translateBtn');
const translationResult = document.getElementById('translationResult');
const translationSource = document.getElementById('translationSource');
const retranslateBtn = document.getElementById('retranslateBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const speakSourceBtn = document.getElementById('speakSourceBtn');
const speakResultBtn = document.getElementById('speakResultBtn');
const grammarBtn = document.getElementById('grammarBtn');
const grammarSection = document.getElementById('grammarSection');
const grammarResult = document.getElementById('grammarResult');
const copyGrammarBtn = document.getElementById('copyGrammarBtn');
const status = document.getElementById('status');

// Image upload elements
const imageUploadArea = document.getElementById('imageUploadArea');
const imageInput = document.getElementById('imageInput');
const uploadedImage = document.getElementById('uploadedImage');
const uploadPlaceholder = document.querySelector('.upload-placeholder');
const extractedTextSection = document.getElementById('extractedTextSection');
const extractedText = document.getElementById('extractedText');
const clearImageBtn = document.getElementById('clearImageBtn');
const useExtractedBtn = document.getElementById('useExtractedBtn');
const activeModelBadge = document.getElementById('activeModelBadge');

// Model display names map
const MODEL_DISPLAY_NAMES = {
    'gemini-2.5-flash-preview-04-17': '2.5 Flash',
    'gemini-2.5-pro-preview-03-25':   '2.5 Pro',
    'gemini-2.0-flash':               '2.0 Flash',
    'gemini-2.0-flash-lite':          '2.0 Flash Lite',
    'gemini-1.5-flash':               '1.5 Flash',
    'gemini-1.5-pro':                 '1.5 Pro',
    'gemini-3.1-flash-lite-preview':  '3.1 Flash Lite',
};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function updateModelBadge(modelId) {
    if (!activeModelBadge) return;
    const name = MODEL_DISPLAY_NAMES[modelId] || modelId;
    activeModelBadge.textContent = `⚡ ${name}`;
    activeModelBadge.title = `Model đang dùng: ${modelId}\nClick để đổi trong Settings`;
}

// Click badge → mở Settings (CSP-safe, không dùng inline onclick)
if (activeModelBadge) {
    activeModelBadge.addEventListener('click', () => {
        chrome.tabs.create({ url: 'pages/settings/settings.html' });
    });
}

let currentImageData = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved API key
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (apiKey) {
        apiKeyInput.value = apiKey;
        showStatus('API key saved', 'success');
    }

    // Load saved source text and translation from previous session
    const { savedSourceText, savedTranslation } = await chrome.storage.local.get([
        'savedSourceText',
        'savedTranslation',
    ]);

    // Get selected text from current tab
    const selectedText = await getSelectedText();

    // Use saved text if no text is currently selected, otherwise use selected text
    if (selectedText) {
        sourceText.value = selectedText;
        if (selectedText.trim()) speakSourceBtn.style.display = 'inline-flex';
    } else if (savedSourceText) {
        sourceText.value = savedSourceText;
        if (savedSourceText.trim()) speakSourceBtn.style.display = 'inline-flex';
        // Restore translation if available
        if (savedTranslation) {
            if (typeof savedTranslation === 'object') {
                // If it's an old malformed object for some reason
                translationResult.innerHTML =
                    '<span class="placeholder" style="color: #ef4444;">Please re-translate to clear old cache</span>';
                chrome.storage.local.remove(['savedTranslation']);
            } else {
                translationResult.innerHTML = savedTranslation;
                speakResultBtn.style.display = 'inline-flex';
            }
        }
    }

    // Load saved target language
    const { savedTargetLang } = await chrome.storage.local.get('savedTargetLang');
    if (savedTargetLang) {
        targetLang.value = savedTargetLang;
    }

    // Load and display active model badge
    const { geminiModel } = await chrome.storage.local.get('geminiModel');
    updateModelBadge(geminiModel || 'gemini-2.0-flash');
});

// Listen for model changes from settings page
chrome.storage.onChanged.addListener((changes) => {
    if (changes.geminiModel) {
        updateModelBadge(changes.geminiModel.newValue);
    }
});

// Save target language when changed
targetLang.addEventListener('change', async () => {
    try {
        await chrome.storage.local.set({ savedTargetLang: targetLang.value });
        showStatus('Language preference saved', 'success');

        // Notify settings page if open
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.url && tab.url.includes('pages/settings/settings.html')) {
                    chrome.tabs
                        .sendMessage(tab.id, { action: 'reloadSettings' })
                        .catch(() => {});
                }
            });
        });
    } catch (error) {
        console.error('Failed to save language:', error);
    }
});

// Save API key
saveKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
        showStatus('Please enter an API key', 'error');
        return;
    }

    await chrome.storage.local.set({ apiKey: key });
    showStatus('API key saved successfully', 'success');
});

// Get selected text from active tab
async function getSelectedText() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.id) {
            console.log('No active tab found');
            return '';
        }

        // Skip chrome:// and other restricted URLs
        if (
            tab.url &&
            (tab.url.startsWith('chrome://') ||
                tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('about:'))
        ) {
            console.log('Cannot access restricted URL:', tab.url);
            return '';
        }

        // Method 1: Try chrome.scripting.executeScript (requires "scripting" permission)
        if (chrome.scripting && chrome.scripting.executeScript) {
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => window.getSelection().toString().trim(),
                });

                if (results && results[0] && results[0].result) {
                    return results[0].result;
                }
            } catch (scriptError) {
                console.log(
                    'executeScript failed, trying message method:',
                    scriptError.message
                );
            }
        }

        // Method 2: Fallback - send message to content script
        try {
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'getSelectedText',
            });
            if (response && response.text) {
                return response.text;
            }
        } catch (msgError) {
            console.log('sendMessage failed:', msgError.message);
        }

        return '';
    } catch (error) {
        console.error('Error getting selected text:', error);
        return '';
    }
}

// Translate button click
translateBtn.addEventListener('click', async () => {
    const text = sourceText.value.trim();
    const apiKey = apiKeyInput.value.trim(); // Optional for MyMemory

    if (!text) {
        showStatus('Please enter text to translate', 'error');
        return;
    }

    // Save target language preference
    await chrome.storage.local.set({ savedTargetLang: targetLang.value });

    // Show loading state
    translateBtn.classList.add('loading');
    translateBtn.disabled = true;
    translationResult.innerHTML = '<span class="placeholder">Translating...</span>';
    translationSource.textContent = '';
    retranslateBtn.style.display = 'none';
    showStatus('');

    try {
        // Call Translate API (delegated to background)
        // Note: apiKey might be empty, which is fine for MyMemory
        const response = await translateText(text, targetLang.value, apiKey);

        let htmlContent = '';
        let source = '';

        if (typeof response === 'object' && response.data) {
            source = response.source;
            const resData = response.data;

            if (typeof resData === 'object' && resData.dictionary) {
                // Render Dictionary UI for popup window
                htmlContent = `<div style="font-weight: 500; font-size: 15px; margin-bottom: 8px;">✨ ${escapeHtml(resData.translation)}</div>`;

                if (resData.dictionary.length > 0) {
                    htmlContent += `<div class="ai-dict-container" style="margin-top: 12px; border-top: 1px solid #e5e7eb; padding-top: 12px; display: flex; flex-direction: column; gap: 12px;">`;
                    resData.dictionary.forEach((group) => {
                        htmlContent += `
                             <div class="ai-dict-group" style="display: flex; flex-direction: column; gap: 6px;">
                                 <div class="ai-dict-type" style="font-size: 12px; color: #6b7280; font-weight: 500; text-transform: capitalize;">${escapeHtml(group.type)}</div>
                         `;
                        group.meanings.forEach((item) => {
                            const relatedText =
                                item.related && item.related.length > 0
                                    ? `<div class="ai-dict-related" style="color: #4b5563; padding-top: 2px;">- ${escapeHtml(item.related.join(', '))}</div>`
                                    : '';
                            htmlContent += `
                                 <div class="ai-dict-item" style="display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 1.4;">
                                     <div class="ai-dict-badge" style="background: #111827; color: white; padding: 2px 8px; border-radius: 4px; font-weight: 600; white-space: nowrap;">${escapeHtml(item.word)}</div>
                                     ${relatedText}
                                 </div>
                             `;
                        });
                        htmlContent += `</div>`;
                    });
                    htmlContent += `</div>`;
                }
            } else {
                htmlContent = String(resData).replace(/\n/g, '<br>');
            }
        } else {
            htmlContent = String(response).replace(/\n/g, '<br>');
        }

        translationResult.innerHTML = htmlContent;

        if (source === 'mymemory') {
            translationSource.textContent = 'Translated by MyMemory (Free API)';
            retranslateBtn.style.display = 'inline';
            // Track MyMemory usage
            await trackMyMemoryUsage(text.length);
        } else if (source === 'google_dict') {
            translationSource.textContent = 'Translated by Google Dictionary';
            retranslateBtn.style.display = 'inline';
        } else {
            translationSource.textContent = 'Translated by Gemini AI';
            retranslateBtn.style.display = 'none'; // Already AI
            // Track AI usage
            await trackUsage('aiTranslateCount', 'aiTranslateLastDate');
        }

        speakResultBtn.style.display = 'inline-flex';
        showStatus('Translation complete', 'success');

        // Save translation to storage
        await chrome.storage.local.set({
            savedTranslation: htmlContent,
            savedSourceText: text,
        });
    } catch (error) {
        translationResult.innerHTML = `<span class="placeholder" style="color: #ef4444;">Error: ${error.message}</span>`;
        showStatus('Translation failed', 'error');
    } finally {
        translateBtn.classList.remove('loading');
        translateBtn.disabled = false;
    }
});

// Translate text using Gemini API
async function translateText(text, targetLang, apiKey, forceAI = false) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                action: 'callTranslateAPI',
                text: text,
                targetLang: targetLang,
                forceAI: forceAI,
            },
            async (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response && response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response ? response.error : 'Unknown error'));
                }
            }
        );
    });
}

// Track MyMemory character usage
async function trackMyMemoryUsage(charsUsed) {
    try {
        const data = await chrome.storage.local.get([
            'myMemoryChars',
            'myMemoryLastDate',
        ]);
        const today = new Date().toDateString();

        // Reset if new day
        if (data.myMemoryLastDate !== today) {
            await chrome.storage.local.set({
                myMemoryChars: charsUsed,
                myMemoryLastDate: today,
            });
        } else {
            await chrome.storage.local.set({
                myMemoryChars: (data.myMemoryChars || 0) + charsUsed,
            });
        }
    } catch (error) {
        console.error('Failed to track MyMemory usage:', error);
    }
}

// Translate with AI (button click handler)
retranslateBtn.addEventListener('click', async () => {
    const text = sourceText.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
        showStatus('Please enter your Gemini API key for AI translation', 'error');
        return;
    }

    if (!text) {
        showStatus('Please enter text to translate', 'error');
        return;
    }

    // Show loading state
    retranslateBtn.disabled = true;
    retranslateBtn.textContent = '✨ Translating...';
    translationResult.innerHTML =
        '<span class="placeholder">AI Translating...</span>';
    showStatus('Translating with AI...');

    try {
        // Force AI translation
        const response = await translateText(text, targetLang.value, apiKey, true);

        let htmlContent = '';
        let translatedTextStr = '';

        if (typeof response === 'object' && response.data) {
            const resData = response.data;
            if (typeof resData === 'object' && resData.dictionary) {
                htmlContent = `<div style="font-weight: 500; font-size: 15px; margin-bottom: 8px;">✨ ${escapeHtml(resData.translation)}</div>`;
                translatedTextStr = resData.translation;

                if (resData.dictionary.length > 0) {
                    htmlContent += `<div class="ai-dict-container" style="margin-top: 12px; border-top: 1px solid #e5e7eb; padding-top: 12px; display: flex; flex-direction: column; gap: 12px;">`;
                    resData.dictionary.forEach((group) => {
                        htmlContent += `
                              <div class="ai-dict-group" style="display: flex; flex-direction: column; gap: 6px;">
                                  <div class="ai-dict-type" style="font-size: 12px; color: #6b7280; font-weight: 500; text-transform: capitalize;">${escapeHtml(group.type)}</div>
                          `;
                        group.meanings.forEach((item) => {
                            const relatedText =
                                item.related && item.related.length > 0
                                    ? `<div class="ai-dict-related" style="color: #4b5563; padding-top: 2px;">- ${escapeHtml(item.related.join(', '))}</div>`
                                    : '';
                            htmlContent += `
                                  <div class="ai-dict-item" style="display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 1.4;">
                                      <div class="ai-dict-badge" style="background: #111827; color: white; padding: 2px 8px; border-radius: 4px; font-weight: 600; white-space: nowrap;">${escapeHtml(item.word)}</div>
                                      ${relatedText}
                                  </div>
                              `;
                        });
                        htmlContent += `</div>`;
                    });
                    htmlContent += `</div>`;
                }
            } else {
                htmlContent = String(resData).replace(/\n/g, '<br>');
                translatedTextStr = String(resData);
            }
        } else {
            htmlContent = String(response).replace(/\n/g, '<br>');
            translatedTextStr = String(response);
        }

        translationResult.innerHTML = htmlContent;
        translationSource.textContent = 'Translated by Gemini AI';
        
        // Reset and hide the AI button
        retranslateBtn.textContent = '✨ Translate with AI';
        retranslateBtn.style.display = 'none'; 
        retranslateBtn.disabled = false;
        
        speakResultBtn.style.display = 'inline-flex';
        showStatus('AI Translation complete', 'success');

        // Track AI usage
        await trackUsage('aiTranslateCount', 'aiTranslateLastDate');

        // Save translation to storage
        await chrome.storage.local.set({
            savedTranslation: htmlContent, // Save the full HTML for restoration
            savedSourceText: text,
        });
    } catch (error) {
        translationResult.innerHTML = `<span class="placeholder" style="color: #ef4444;">Error: ${error.message}</span>`;
        retranslateBtn.textContent = '✨ Translate with AI';
        retranslateBtn.disabled = false;
        showStatus('AI Translation failed', 'error');
    }
});

// Check grammar using Gemini API
async function checkGrammar(text, apiKey) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                action: 'callGrammarCheckAPI',
                text: text,
            },
            async (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response && response.success) {
                    // Track usage on success
                    await trackUsage('grammarCheckCount', 'grammarLastDate');
                    resolve(response.data);
                } else {
                    reject(new Error(response ? response.error : 'Unknown error'));
                }
            }
        );
    });
}

// Track API usage (grammar check, AI translate)
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
        console.error('Failed to track usage:', error);
    }
}

// Clear button
clearBtn.addEventListener('click', async () => {
    sourceText.value = '';
    translationResult.innerHTML =
        '<span class="placeholder">Translation will appear here...</span>';
    grammarResult.innerHTML =
        '<span class="placeholder">Grammar check results will appear here...</span>';
    grammarSection.style.display = 'none';
    speakSourceBtn.style.display = 'none';
    speakResultBtn.style.display = 'none';

    // Stop speaking if playing
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    sourceText.focus();

    // Also clear image if present
    if (currentImageData) {
        currentImageData = null;
        imageInput.value = '';
        uploadedImage.src = '';
        uploadedImage.style.display = 'none';
        uploadPlaceholder.style.display = 'block';
        extractedTextSection.style.display = 'none';
        extractedText.textContent = '';
        clearImageBtn.style.display = 'none';
    }

    // Clear saved data from storage
    await chrome.storage.local.remove(['savedSourceText', 'savedTranslation']);
});

// Copy button
copyBtn.addEventListener('click', async () => {
    const text = translationResult.textContent;

    if (!text || translationResult.querySelector('.placeholder')) {
        showStatus('Nothing to copy', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        showStatus('Copied to clipboard', 'success');
    } catch (error) {
        showStatus('Failed to copy', 'error');
    }
});

// Grammar check button
grammarBtn.addEventListener('click', async () => {
    const text = sourceText.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!text) {
        showStatus('Please enter text to check grammar', 'error');
        return;
    }

    // Show grammar section
    grammarSection.style.display = 'block';

    // Show loading state
    grammarBtn.classList.add('loading');
    grammarBtn.disabled = true;
    grammarResult.innerHTML = '<span class="placeholder">Checking grammar...</span>';
    showStatus('');

    try {
        const correctedText = await checkGrammar(text, apiKey);
        grammarResult.textContent = correctedText;
        showStatus('Grammar check complete', 'success');
    } catch (error) {
        grammarResult.innerHTML = `<span class="placeholder" style="color: #0f0e0eff;">Error: ${error.message}</span>`;
        showStatus('Grammar check failed', 'error');
    } finally {
        grammarBtn.classList.remove('loading');
        grammarBtn.disabled = false;
    }
});

// Copy corrected grammar button
copyGrammarBtn.addEventListener('click', async () => {
    const text = grammarResult.textContent;

    if (!text || grammarResult.querySelector('.placeholder')) {
        showStatus('Nothing to copy', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        showStatus('Copied to clipboard', 'success');
    } catch (error) {
        showStatus('Failed to copy', 'error');
    }
});

// Show status message
function showStatus(message, type = '') {
    status.textContent = message;
    status.className = 'status ' + type;

    if (message) {
        setTimeout(() => {
            if (status.textContent === message) {
                status.className = 'status';
                status.textContent = '';
            }
        }, 3000);
    }
}

// Allow Ctrl+Enter to translate
sourceText.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        translateBtn.click();
    }
});

// Debounce function to save source text as user types
let saveTimeout;
sourceText.addEventListener('input', () => {
    speakSourceBtn.style.display = sourceText.value.trim() ? 'inline-flex' : 'none';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const text = sourceText.value;
        if (text.trim()) {
            await chrome.storage.local.set({ savedSourceText: text });
        }
    }, 500); // Save after 500ms of no typing
});

// Open Settings button
document.getElementById('openSettingsBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'pages/settings/settings.html' });
});

// Open Flashcards button
document.getElementById('openFlashcardsBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'pages/flashcards/flashcards.html' });
});

// Open History button
document.getElementById('openHistoryBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'pages/history/history.html' });
});

// ========== Image Upload Functionality ==========

// Paste from clipboard (Ctrl+V / Cmd+V)
document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                handleImageFile(file);
                showStatus('Image pasted from clipboard', 'success');
            }
            return;
        }
    }
});

// Click to upload image
imageUploadArea.addEventListener('click', () => {
    imageInput.click();
});

// Handle file selection
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleImageFile(file);
    }
});

// Drag and drop support
imageUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploadArea.classList.add('drag-over');
});

imageUploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    imageUploadArea.classList.remove('drag-over');
});

imageUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUploadArea.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleImageFile(file);
    } else {
        showStatus('Please drop a valid image file', 'error');
    }
});

// Handle image file
function handleImageFile(file) {
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showStatus('Image size must be less than 10MB', 'error');
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        currentImageData = e.target.result;

        // Show image preview
        uploadedImage.src = currentImageData;
        uploadedImage.style.display = 'block';
        uploadPlaceholder.style.display = 'none';
        clearImageBtn.style.display = 'block';

        // Extract text from image
        extractTextFromImage(currentImageData);
    };

    reader.onerror = () => {
        showStatus('Failed to read image file', 'error');
    };

    reader.readAsDataURL(file);
}

// Extract text from image using Gemini Vision API
async function extractTextFromImage(imageData) {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
        showStatus('Please enter your Gemini API key', 'error');
        return;
    }

    // Show loading state
    extractedTextSection.style.display = 'block';
    extractedText.innerHTML =
        '<span class="placeholder">Extracting text from image...</span>';
    showStatus('Extracting text from image...');

    try {
        const text = await extractTextWithGemini(imageData, apiKey);
        extractedText.textContent = text;

        // Auto-translate the extracted text
        if (text && text.trim()) {
            sourceText.value = text;
            showStatus('Text extracted! Click Translate to translate.', 'success');
        } else {
            extractedText.innerHTML =
                '<span class="placeholder" style="color: #f59e0b;">No text could be extracted from this image.</span>';
            showStatus('No text found in image', 'error');
        }
    } catch (error) {
        extractedText.innerHTML = `<span class="placeholder" style="color: #ef4444;">Error: ${error.message}</span>`;
        showStatus('Failed to extract text', 'error');
    }
}

// Extract text from image using Gemini Vision API
async function extractTextWithGemini(imageData, apiKey) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                action: 'callExtractTextAPI',
                imageData: imageData,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response ? response.error : 'Unknown error'));
                }
            }
        );
    });
}

// Clear image button
clearImageBtn.addEventListener('click', () => {
    currentImageData = null;
    imageInput.value = '';
    uploadedImage.src = '';
    uploadedImage.style.display = 'none';
    uploadPlaceholder.style.display = 'block';
    extractedTextSection.style.display = 'none';
    extractedText.textContent = '';
    clearImageBtn.style.display = 'none';
    showStatus('Image cleared', 'success');
});

// Use extracted text button
useExtractedBtn.addEventListener('click', () => {
    const text = extractedText.textContent;
    if (text && !extractedText.querySelector('.placeholder')) {
        sourceText.value = text;
        speakSourceBtn.style.display = 'inline-flex';
        sourceText.focus();
        showStatus('Text copied to source', 'success');
    }
});

// ========== Text to Speech (TTS) ==========
function speakText(text, lang, buttonEl) {
    if (!text || !window.speechSynthesis) return;

    // If clicking the button while it's playing, it acts as a toggle to stop
    if (buttonEl.classList.contains('playing')) {
        window.speechSynthesis.cancel();
        buttonEl.classList.remove('playing');
        return;
    }

    // Stop current speech if any
    window.speechSynthesis.cancel();

    // Clean text: remove HTML tags if any
    let cleanText = text.replace(/<[^>]*>?/gm, '');

    // Map to standard locales
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

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = langMap[lang] || 'en-US';

    utterance.onstart = () => {
        // Remove playing class from all buttons
        speakSourceBtn.classList.remove('playing');
        speakResultBtn.classList.remove('playing');
        buttonEl.classList.add('playing');
    };

    utterance.onend = () => {
        buttonEl.classList.remove('playing');
    };

    utterance.onerror = () => {
        buttonEl.classList.remove('playing');
        showStatus('Lỗi phát âm', 'error');
    };

    window.speechSynthesis.speak(utterance);
}

speakSourceBtn.addEventListener('click', () => {
    const text = sourceText.value.trim();
    if (text) {
        chrome.i18n.detectLanguage(text, (result) => {
            let lang = 'en';
            if (result && result.languages && result.languages.length > 0) {
                lang = result.languages[0].language;
            } else {
                if (/[\uac00-\ud7a3]/.test(text)) lang = 'ko';
                else if (/[\u3040-\u30ff]/.test(text)) lang = 'ja';
                else if (/[\u4e00-\u9fff]/.test(text)) lang = 'zh';
            }
            speakText(text, lang, speakSourceBtn);
        });
    }
});

speakResultBtn.addEventListener('click', () => {
    let textToSpeak = '';
    const dictHeader = translationResult.querySelector(
        'div[style*="font-weight: 500"]'
    );
    if (dictHeader) {
        textToSpeak = dictHeader.textContent.replace('✨ ', '').trim();
    } else {
        textToSpeak = translationResult.innerText;
    }

    if (textToSpeak && !translationResult.querySelector('.placeholder')) {
        speakText(textToSpeak, targetLang.value, speakResultBtn);
    }
});

// ========== Theme Initialization ==========
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');

function updateThemeUI(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeIcon) {
            themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
        }
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (themeIcon) {
            themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        }
    }
}

// Load initial theme
chrome.storage.local.get(['globalTheme'], (data) => {
    const defaultTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const theme = data.globalTheme || defaultTheme;
    updateThemeUI(theme);
});

// Toggle button click
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const newTheme = isLight ? 'dark' : 'light';
        chrome.storage.local.set({ globalTheme: newTheme });
        updateThemeUI(newTheme); // Apply locally IMMEDIATELY
    });
}

// Listen for global theme changes across tabs
chrome.storage.onChanged.addListener((changes) => {
    if (changes.globalTheme) {
        updateThemeUI(changes.globalTheme.newValue);
    }
});
