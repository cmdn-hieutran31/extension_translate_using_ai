// Background service worker

// Helper function to translate text using Gemini API
async function translateTextWithGemini(text, targetLang, apiKey) {
    const languageNames = {
        en: 'English',
        vi: 'Vietnamese',
        es: 'Spanish',
        fr: 'French',
        de: 'German',
        it: 'Italian',
        pt: 'Portuguese',
        ru: 'Russian',
        ja: 'Japanese',
        ko: 'Korean',
        zh: 'Chinese',
        ar: 'Arabic',
        hi: 'Hindi',
    };

    const targetLanguage = languageNames[targetLang] || 'Vietnamese';

    const prompt = `You are a professional translator. Translate the following text into ${targetLanguage}. Only provide the translation, no explanations or additional text.

Text to translate:
${text}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: prompt }],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        topK: 1,
                        topP: 1,
                        maxOutputTokens: 2048,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 429) {
                throw new Error(
                    'API Rate Limit Exceeded. Please wait 1-2 minutes before trying again.'
                );
            }
            throw new Error(
                errorData.error?.message || `API error: ${response.status}`
            );
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Invalid response from API');
        }

        return {
            success: true,
            data: data.candidates[0].content.parts[0].text.trim(),
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Helper: Translate using MyMemory API
async function translateWithMyMemory(text, targetLang) {
    const langMap = {
        en: 'en',
        vi: 'vi',
        es: 'es',
        fr: 'fr',
        de: 'de',
        it: 'it',
        pt: 'pt',
        ru: 'ru',
        ja: 'ja',
        ko: 'ko',
        zh: 'zh',
        ar: 'ar',
        hi: 'hi',
    };

    const sourceLang = 'autodetect';
    const target = langMap[targetLang] || 'vi';

    try {
        const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${target}`
        );

        if (!response.ok) {
            throw new Error(`MyMemory API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.responseStatus === 200 && data.responseData) {
            return {
                success: true,
                data: data.responseData.translatedText,
                source: 'mymemory',
            };
        }

        // Check for quota exceeded or other specific MyMemory errors
        if (data.responseStatus === 403 || data.responseStatus === 429) {
            throw new Error('MyMemory quota exceeded');
        }

        // For other non-200 statuses
        throw new Error(data.responseDetails || 'MyMemory translation failed');
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Helper: Check Dictionary using Google Translate API (Free endpoint)
async function checkDictionaryWithGoogle(text, targetLang) {
    const langMap = {
        en: 'en',
        vi: 'vi',
        es: 'es',
        fr: 'fr',
        de: 'de',
        it: 'it',
        pt: 'pt',
        ru: 'ru',
        ja: 'ja',
        ko: 'ko',
        zh: 'zh',
        ar: 'ar',
        hi: 'hi',
    };
    const target = langMap[targetLang] || 'vi';

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&dt=bd&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error(
                    'Google Dictionary API rate limit reached. Fallback triggered.'
                );
            }
            throw new Error(`Google API error: ${response.status}`);
        }

        const data = await response.json();

        // data[0] contains direct translation, data[1] contains dictionary entries
        let translation = '';
        let dictionary = [];

        // Add direct translation as the primary meaning
        if (data[0] && data[0][0] && data[0][0][0]) {
            translation = data[0][0][0];
        } else {
            throw new Error('No primary translation found from Google');
        }

        // Add dictionary details if available
        if (data[1] && Array.isArray(data[1])) {
            data[1].forEach((partOfSpeech) => {
                const type = partOfSpeech[0]; // e.g., "noun", "verb"
                const meanings = partOfSpeech[1] || []; // e.g., ["thăng chức", "quảng bá"]

                // Detailed meanings list for extra UX
                const detailedMeanings = [];
                if (partOfSpeech[2] && Array.isArray(partOfSpeech[2])) {
                    partOfSpeech[2].forEach((detail) => {
                        if (detail[0] && detail[1]) {
                            detailedMeanings.push({
                                word: detail[0],
                                related: detail[1],
                            });
                        }
                    });
                }

                // Map English parts of speech to Vietnamese for better UX
                const typeMap = {
                    noun: 'Danh từ',
                    verb: 'Động từ',
                    adjective: 'Tính từ',
                    adverb: 'Trạng từ',
                    pronoun: 'Đại từ',
                    preposition: 'Giới từ',
                    conjunction: 'Liên từ',
                    interjection: 'Thán từ',
                };
                const displayType = typeMap[type] || type;

                if (detailedMeanings.length > 0) {
                    dictionary.push({
                        type: displayType,
                        meanings: detailedMeanings,
                    });
                } else if (meanings.length > 0) {
                    dictionary.push({
                        type: displayType,
                        meanings: meanings.map((m) => ({ word: m, related: [] })),
                    });
                }
            });
        }

        return {
            success: true,
            data: { translation, dictionary },
            source: 'google_dict',
        };
    } catch (error) {
        console.error('[AI Translator] Google Dict Error:', error);
        return { success: false, error: error.message };
    }
}

// Helper function to check grammar using Gemini API
async function checkGrammarWithGemini(text, apiKey) {
    const prompt = `You are a professional grammar checker. Your task is to:
1. Check ONLY grammar errors (subject-verb agreement, verb tense, sentence structure, articles, etc.)
2. Do NOT change capitalization - keep the original capitalization exactly as is
3. Do NOT add or remove punctuation unless it's a grammatical error
4. Fix only real grammar mistakes
5. Return ONLY the corrected version of the text, no explanations

Text to check:
${text}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: prompt }],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        topK: 1,
                        topP: 1,
                        maxOutputTokens: 2048,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 429) {
                throw new Error('Too many requests. Please wait a moment.');
            }
            throw new Error(
                errorData.error?.message || `API error: ${response.status}`
            );
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Invalid response from API');
        }

        return {
            success: true,
            data: data.candidates[0].content.parts[0].text.trim(),
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Helper: Extract text from image using Gemini Vision API
async function extractTextWithGemini(imageData, apiKey) {
    const prompt = `Extract ALL text from this image accurately.
Rules:
1. Preserve the original structure and line breaks
2. Include ALL text visible in the image
3. If there are multiple languages, extract all of them
4. Return ONLY the extracted text, no explanations
5. Do not add any formatting or additional text`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: prompt },
                                {
                                    inline_data: {
                                        mime_type: 'image/jpeg',
                                        data: imageData.split(',')[1],
                                    },
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.1,
                        topK: 1,
                        topP: 1,
                        maxOutputTokens: 4096,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                errorData.error?.message || `API error: ${response.status}`
            );
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Invalid response from API');
        }

        return {
            success: true,
            data: data.candidates[0].content.parts[0].text.trim(),
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('AI Translator extension installed');

    // Create context menus
    chrome.contextMenus.create({
        id: 'translate-text',
        title: 'Translate with AI',
        contexts: ['selection'],
    });

    chrome.contextMenus.create({
        id: 'check-grammar',
        title: 'Check Grammar with AI',
        contexts: ['selection'],
    });

    chrome.contextMenus.create({
        id: 'separator',
        type: 'separator',
        contexts: ['selection'],
    });

    chrome.contextMenus.create({
        id: 'open-settings',
        title: 'Open AI Translator Settings',
        contexts: ['all'],
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'translate-text') {
        // Send message to content script to translate
        chrome.tabs.sendMessage(
            tab.id,
            {
                action: 'translateFromContextMenu',
                text: info.selectionText,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        'Error sending message:',
                        chrome.runtime.lastError.message
                    );
                }
            }
        );
    } else if (info.menuItemId === 'check-grammar') {
        // Send message to content script to check grammar
        chrome.tabs.sendMessage(
            tab.id,
            {
                action: 'checkGrammarFromContextMenu',
                text: info.selectionText,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        'Error sending message:',
                        chrome.runtime.lastError.message
                    );
                }
            }
        );
    } else if (info.menuItemId === 'open-settings') {
        // Open settings page
        chrome.tabs.create({ url: 'settings.html' });
    }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    console.log('[AI Translator Background] Command received:', command);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
            console.error('[AI Translator Background] No active tab found');
            return;
        }

        console.log(
            '[AI Translator Background] Sending command to tab:',
            tabs[0].id
        );

        if (command === 'translate-selection') {
            chrome.tabs.sendMessage(
                tabs[0].id,
                { action: 'translateFromShortcut' },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            '[AI Translator Background] Error sending message:',
                            chrome.runtime.lastError.message
                        );
                    } else {
                        console.log(
                            '[AI Translator Background] Message sent successfully:',
                            response
                        );
                    }
                }
            );
        } else if (command === 'check-grammar') {
            chrome.tabs.sendMessage(
                tabs[0].id,
                { action: 'checkGrammarFromShortcut' },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            '[AI Translator Background] Error sending message:',
                            chrome.runtime.lastError.message
                        );
                    }
                }
            );
        } else if (command === 'open-settings') {
            chrome.tabs.create({ url: 'settings.html' });
        } else if (command === 'open-flashcards') {
            chrome.tabs.create({ url: 'flashcards.html' });
        }
    });
});

// Helper: Check grammar using LanguageTool API (Free)
async function checkGrammarWithLanguageTool(text) {
    try {
        const params = new URLSearchParams();
        params.append('text', text);
        params.append('language', 'auto'); // Auto-detect
        // params.append('enabledOnly', 'false'); // Optional

        const response = await fetch('https://api.languagetool.org/v2/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: params,
        });

        if (!response.ok) {
            throw new Error(`LanguageTool API error: ${response.status}`);
        }

        const data = await response.json();

        // Process matches to construct corrected text
        if (!data.matches || data.matches.length === 0) {
            return {
                success: true,
                data: text, // No errors
                source: 'languagetool',
            };
        }

        // Apply corrections (reverse order to keep indices valid)
        let correctedText = text;
        const matches = data.matches.sort((a, b) => b.offset - a.offset);

        for (const match of matches) {
            if (match.replacements && match.replacements.length > 0) {
                const replacement = match.replacements[0].value;
                const prefix = correctedText.substring(0, match.offset);
                const suffix = correctedText.substring(match.offset + match.length);
                correctedText = prefix + replacement + suffix;
            }
        }

        return {
            success: true,
            data: correctedText,
            source: 'languagetool',
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==========================================
// FLASHCARD INDEXEDDB MANAGEMENT
// ==========================================
const DB_NAME = 'AITranslatorDB';
const DB_VERSION = 1;
const STORE_NAME = 'flashcards';

// Helper: Open Database
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject('Database error: ' + event.target.error);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('createdAt', 'createdAt', { unique: false });
                console.log('Object store created');
            }
        };
    });
}

// Add Flashcard
async function addFlashcard(cardData) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const newCard = {
            id: Date.now().toString(),
            word: cardData.word,
            translation: cardData.translation,
            context: cardData.context || '',
            example: cardData.example || '',
            dictionary: cardData.dictionary || [],
            createdAt: new Date().toISOString()
        };

        const request = store.add(newCard);

        request.onsuccess = () => resolve(newCard);
        request.onerror = (e) => reject('Error saving card: ' + e.target.error);
    });
}

// Get all Flashcards
async function getAllFlashcards() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject('Error getting cards: ' + e.target.error);
    });
}

// Delete Flashcard
async function deleteFlashcard(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject('Error deleting card: ' + e.target.error);
    });
}

// Update Flashcard
async function updateFlashcard(id, updatedData) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Get the existing card first
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
            const card = getRequest.result;
            if (!card) {
                reject('Card not found');
                return;
            }
            
            // Merge updated data
            const newCard = { ...card, ...updatedData, updatedAt: new Date().toISOString() };
            const putRequest = store.put(newCard);
            
            putRequest.onsuccess = () => resolve(newCard);
            putRequest.onerror = (e) => reject('Error updating card: ' + e.target.error);
        };
        
        getRequest.onerror = (e) => reject('Error getting card: ' + e.target.error);
    });
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translateSelection') {
        console.log('Text to translate:', request.text);
    } else if (request.action === 'openSettings') {
        chrome.tabs.create({ url: 'settings.html' });
        sendResponse({ success: true });
    } else if (request.action === 'updateUsageStats') {
        // Forward to settings page if open
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.url && tab.url.includes('settings.html')) {
                    chrome.tabs
                        .sendMessage(tab.id, { action: 'updateUsageStats' })
                        .catch(() => {});
                }
            });
        });
        sendResponse({ success: true });
    }

    // NEW: Flashcard DB Actions Processing
    else if (request.action === 'saveFlashcard') {
        (async () => {
             try {
                 const newCard = await addFlashcard(request.data);
                 sendResponse({ success: true, data: newCard });
             } catch (error) {
                 sendResponse({ success: false, error: error.toString() });
             }
        })();
        return true;
    } 
    else if (request.action === 'getFlashcards') {
        (async () => {
             try {
                 const cards = await getAllFlashcards();
                 // Sort descending by date
                 cards.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
                 sendResponse({ success: true, data: cards });
             } catch (error) {
                 sendResponse({ success: false, error: error.toString() });
             }
        })();
        return true;
    }
    else if (request.action === 'deleteFlashcard') {
        (async () => {
             try {
                 await deleteFlashcard(request.id);
                 sendResponse({ success: true });
             } catch (error) {
                 sendResponse({ success: false, error: error.toString() });
             }
        })();
        return true;
    }
    else if (request.action === 'updateFlashcard') {
        (async () => {
             try {
                 const updatedCard = await updateFlashcard(request.id, request.data);
                 sendResponse({ success: true, data: updatedCard });
             } catch (error) {
                 sendResponse({ success: false, error: error.toString() });
             }
        })();
        return true;
    }

    // NEW: Handle API calls via background script
    else if (request.action === 'callTranslateAPI') {
        // Async handling requires return true
        (async () => {
            try {
                const { apiKey } = await chrome.storage.local.get('apiKey');

                // Strategy:
                // 1. If forceAI is true -> call Gemini
                // 2. Else -> call MyMemory
                // 3. If MyMemory fails -> call Gemini (Fallback)

                if (request.forceAI) {
                    if (!apiKey) {
                        sendResponse({ success: false, error: 'API key not found' });
                        return;
                    }
                    const result = await translateTextWithGemini(
                        request.text,
                        request.targetLang,
                        apiKey
                    );
                    result.source = 'ai'; // Ensure source is marked
                    sendResponse(result);
                } else {
                    // Strategy:
                    // 1. If text is short (<= 3 words), try Google Dictionary API first
                    // 2. If Google fails or text is long, try MyMemory
                    // 3. If MyMemory fails, try Gemini API (Fallback)

                    const wordsCount = request.text.trim().split(/\s+/).length;

                    if (wordsCount <= 3) {
                        const googleResult = await checkDictionaryWithGoogle(
                            request.text,
                            request.targetLang
                        );
                        if (googleResult.success) {
                            sendResponse(googleResult);
                            return; // Stop here if dictionary succeeds
                        } else {
                            console.log(
                                'Google Dictionary failed, falling back to MyMemory/Gemini:',
                                googleResult.error
                            );
                        }
                    }

                    // Try MyMemory (either text is long, or Google Dict failed)
                    const mmResult = await translateWithMyMemory(
                        request.text,
                        request.targetLang
                    );

                    if (mmResult.success) {
                        sendResponse(mmResult);
                    } else {
                        console.log(
                            'MyMemory failed, fallback to AI:',
                            mmResult.error
                        );
                        // Fallback to Gemini
                        if (!apiKey) {
                            // If no API key, we can't fallback. Return MyMemory error.
                            sendResponse({
                                success: false,
                                error:
                                    mmResult.error +
                                    '. And API Key not found for fallback.',
                            });
                            return;
                        }
                        const aiResult = await translateTextWithGemini(
                            request.text,
                            request.targetLang,
                            apiKey
                        );
                        aiResult.source = 'ai'; // Ensure source is marked
                        sendResponse(aiResult);
                    }
                }
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true; // Keep channel open

        // ... existing code ...
    } else if (request.action === 'callGrammarCheckAPI') {
        (async () => {
            try {
                const { apiKey } = await chrome.storage.local.get('apiKey');

                // If forceAI is true, skip LanguageTool and go straight to Gemini
                if (!request.forceAI) {
                    // Try LanguageTool first
                    const ltResult = await checkGrammarWithLanguageTool(
                        request.text
                    );

                    if (ltResult.success) {
                        sendResponse(ltResult);
                        return;
                    }

                    console.log(
                        'LanguageTool failed, fallback to Gemini:',
                        ltResult.error
                    );
                }

                // Fallback to Gemini or if forceAI is true
                if (!apiKey) {
                    sendResponse({
                        success: false,
                        error:
                            (request.forceAI
                                ? 'AI Deep Check'
                                : 'LanguageTool fallback') + ' requires an API Key.',
                    });
                    return;
                }

                const result = await checkGrammarWithGemini(request.text, apiKey);
                result.source = 'ai';
                sendResponse(result);
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true; // Keep channel open
    } else if (request.action === 'callExtractTextAPI') {
        (async () => {
            try {
                const { apiKey } = await chrome.storage.local.get('apiKey');
                if (!apiKey) {
                    sendResponse({ success: false, error: 'API key not found' });
                    return;
                }

                const result = await extractTextWithGemini(
                    request.imageData,
                    apiKey
                );
                sendResponse(result);
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true; // Keep channel open
    }

    return true; // Keep message channel open for async response
});
