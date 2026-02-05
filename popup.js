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
    } else if (savedSourceText) {
        sourceText.value = savedSourceText;
        // Restore translation if available
        if (savedTranslation) {
            translationResult.innerHTML = savedTranslation;
        }
    }

    // Load saved target language
    const { savedTargetLang } = await chrome.storage.local.get('savedTargetLang');
    if (savedTargetLang) {
        targetLang.value = savedTargetLang;
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
                if (tab.url && tab.url.includes('settings.html')) {
                    chrome.tabs
                        .sendMessage(tab.id, { action: 'reloadSettings' })
                        .catch(() => { });
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

        // Handle response
        let translatedText = '';
        let source = '';

        if (typeof response === 'object' && response.data) {
            translatedText = response.data;
            source = response.source;
        } else {
            translatedText = response;
        }

        translationResult.textContent = translatedText;

        if (source === 'mymemory') {
            translationSource.textContent = 'Translated by MyMemory (Free API)';
            retranslateBtn.style.display = 'inline';
            // Track MyMemory usage
            await trackMyMemoryUsage(text.length);
        } else {
            translationSource.textContent = 'Translated by Gemini AI';
            retranslateBtn.style.display = 'none'; // Already AI
            // Track AI usage
            await trackUsage('aiTranslateCount', 'aiTranslateLastDate');
        }

        showStatus('Translation complete', 'success');

        // Save translation to storage
        await chrome.storage.local.set({
            savedTranslation: translatedText,
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
async function translateText(text, targetLang, apiKey) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                action: 'callTranslateAPI',
                text: text,
                targetLang: targetLang,
            },
            async (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response && response.success) {
                    // Track usage on success (or let background do it? Background doesn't track specific counter names easily without passing them)
                    // Original code: await trackUsage('aiTranslateCount', 'aiTranslateLastDate');
                    // Let's keep tracking here for consistency with existing storage logic
                    await trackUsage('aiTranslateCount', 'aiTranslateLastDate');
                    resolve(response.data);
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

        let translatedText = '';
        if (typeof response === 'object' && response.data) {
            translatedText = response.data;
        } else {
            translatedText = response;
        }

        translationResult.textContent = translatedText;
        translationSource.textContent = 'Translated by Gemini AI';
        retranslateBtn.textContent = '✨ Translate with AI';
        retranslateBtn.style.display = 'none'; // Done
        retranslateBtn.disabled = false;
        showStatus('AI Translation complete', 'success');

        // Track AI usage
        await trackUsage('aiTranslateCount', 'aiTranslateLastDate');

        // Save translation to storage
        await chrome.storage.local.set({
            savedTranslation: translatedText,
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

    if (!apiKey) {
        showStatus('Please enter your Gemini API key', 'error');
        return;
    }

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
    chrome.tabs.create({ url: 'settings.html' });
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
        sourceText.focus();
        showStatus('Text copied to source', 'success');
    }
});
