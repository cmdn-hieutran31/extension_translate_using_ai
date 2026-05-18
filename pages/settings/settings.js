// Settings page JavaScript

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const toggleApiKeyBtn = document.getElementById('toggleApiKey');
const targetLangSelect = document.getElementById('targetLang');
const geminiModelSelect = document.getElementById('geminiModel');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const grammarCheckToggle = document.getElementById('grammarCheckEnabled');
const inlineTranslationToggle = document.getElementById('inlineTranslationEnabled');
const hoverTranslationToggle = document.getElementById('hoverTranslationEnabled');
const myMemoryUsage = document.getElementById('myMemoryUsage');
const myMemoryProgressBar = document.getElementById('myMemoryProgressBar');
const grammarUsage = document.getElementById('grammarUsage');
const aiTranslateUsage = document.getElementById('aiTranslateUsage');
const resetTimeElement = document.getElementById('resetTime');

// State
let apiKeyVisible = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadUsageStats();
  setupEventListeners();
});

// Load saved settings
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get([
      'apiKey',
      'savedTargetLang',
      'geminiModel',
      'grammarCheckEnabled',
      'inlineTranslationEnabled',
      'hoverTranslationEnabled',
    ]);

    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }

    if (data.savedTargetLang) {
      targetLangSelect.value = data.savedTargetLang;
    }

    if (data.geminiModel) {
      geminiModelSelect.value = data.geminiModel;
    }

    if (data.grammarCheckEnabled !== undefined) {
      grammarCheckToggle.checked = data.grammarCheckEnabled;
    }

    if (data.inlineTranslationEnabled !== undefined) {
      inlineTranslationToggle.checked = data.inlineTranslationEnabled;
    }

    if (data.hoverTranslationEnabled !== undefined) {
      hoverTranslationToggle.checked = data.hoverTranslationEnabled;
    }

  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Load usage statistics
async function loadUsageStats() {
  try {
    const data = await chrome.storage.local.get([
      'myMemoryChars',
      'myMemoryLastDate',
      'grammarCheckCount',
      'grammarLastDate',
      'aiTranslateCount',
      'aiTranslateLastDate',
    ]);

    const today = new Date().toDateString();

    // MyMemory quota
    const myMemoryLastDate = data.myMemoryLastDate || today;
    if (today !== myMemoryLastDate) {
      await chrome.storage.local.set({
        myMemoryChars: 0,
        myMemoryLastDate: today,
      });
      updateMyMemoryDisplay(0);
    } else {
      updateMyMemoryDisplay(data.myMemoryChars || 0);
    }

    // Grammar Check usage
    const grammarLastDate = data.grammarLastDate || today;
    if (today !== grammarLastDate) {
      await chrome.storage.local.set({
        grammarCheckCount: 0,
        grammarLastDate: today,
      });
      // Show count / Unlimited (since limit is per minute)
      grammarUsage.innerHTML = `0 <span style="font-size: 0.8em; color: #6b7280; font-weight: normal;">(Limit: 20/min)</span>`;
    } else {
      const grammarCount = data.grammarCheckCount || 0;
      grammarUsage.innerHTML = `${grammarCount} <span style="font-size: 0.8em; color: #6b7280; font-weight: normal;">(Limit: 20/min)</span>`;
    }

    // AI Translate usage
    const aiTranslateLastDate = data.aiTranslateLastDate || today;
    if (today !== aiTranslateLastDate) {
      await chrome.storage.local.set({
        aiTranslateCount: 0,
        aiTranslateLastDate: today,
      });
      aiTranslateUsage.textContent = '0 / 20';
    } else {
      const aiCount = data.aiTranslateCount || 0;
      aiTranslateUsage.textContent = `${aiCount} / 20`;
    }

    // Calculate reset time
    updateResetTime();
  } catch (error) {
    console.error('Failed to load usage stats:', error);
  }
}

// Update MyMemory display with progress bar
function updateMyMemoryDisplay(charsUsed) {
  const MY_MEMORY_DAILY_LIMIT = 10000;
  myMemoryUsage.textContent = `${charsUsed.toLocaleString()} / ${MY_MEMORY_DAILY_LIMIT.toLocaleString()}`;

  const percentage = Math.min((charsUsed / MY_MEMORY_DAILY_LIMIT) * 100, 100);
  myMemoryProgressBar.style.width = `${percentage}%`;

  // Update progress bar color based on usage
  myMemoryProgressBar.classList.remove('warning', 'danger');
  if (percentage >= 90) {
    myMemoryProgressBar.classList.add('danger');
  } else if (percentage >= 70) {
    myMemoryProgressBar.classList.add('warning');
  }
}

// Update reset time display
function updateResetTime() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const diff = tomorrow - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  resetTimeElement.textContent = `Next reset: ${hours}h ${minutes}m`;
}

// Setup event listeners
function setupEventListeners() {
  // Toggle API key visibility
  toggleApiKeyBtn.addEventListener('click', () => {
    apiKeyVisible = !apiKeyVisible;
    apiKeyInput.type = apiKeyVisible ? 'text' : 'password';
    toggleApiKeyBtn.textContent = apiKeyVisible ? '🙈' : '👁️';
  });

  // Save API key
  saveApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showToast('Please enter your API key', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({
        apiKey: apiKey,
        savedTargetLang: targetLangSelect.value,
        geminiModel: geminiModelSelect.value,
      });
      showToast('Settings saved successfully!', 'success');

      // Notify all tabs to update
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs
            .sendMessage(tab.id, { action: 'settingsUpdated' })
            .catch(() => {
              // Ignore errors for tabs without content script
            });
        });
      });
    } catch (error) {
      console.error('Failed to save API key:', error);
      showToast('Failed to save API key', 'error');
    }
  });

  // Save model preference
  geminiModelSelect.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({
        geminiModel: geminiModelSelect.value,
      });
      const selectedText = geminiModelSelect.options[geminiModelSelect.selectedIndex].text;
      showToast(`Model đã đổi: ${selectedText}`, 'success');
    } catch (error) {
      console.error('Failed to save model:', error);
    }
  });

  // Save language preference
  targetLangSelect.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({
        savedTargetLang: targetLangSelect.value,
      });
      showToast('Language preference saved', 'success');
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  });

  // Toggle grammar check
  grammarCheckToggle.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({
        grammarCheckEnabled: grammarCheckToggle.checked,
      });
      showToast(
        grammarCheckToggle.checked
          ? 'Grammar check enabled'
          : 'Grammar check disabled',
        'success'
      );

      // Notify all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs
            .sendMessage(tab.id, { action: 'settingsUpdated' })
            .catch(() => { });
        });
      });
    } catch (error) {
      console.error('Failed to update grammar check setting:', error);
      showToast('Failed to update setting', 'error');
    }
  });

  // Toggle inline translation
  inlineTranslationToggle.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({
        inlineTranslationEnabled: inlineTranslationToggle.checked,
      });
      showToast(
        inlineTranslationToggle.checked
          ? 'Inline translation enabled'
          : 'Inline translation disabled',
        'success'
      );

      // Notify all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs
            .sendMessage(tab.id, { action: 'settingsUpdated' })
            .catch(() => { });
        });
      });
    } catch (error) {
      console.error('Failed to update inline translation setting:', error);
      showToast('Failed to update setting', 'error');
    }
  });

  // Toggle hover translation
  hoverTranslationToggle.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({
        hoverTranslationEnabled: hoverTranslationToggle.checked,
      });
      showToast(
        hoverTranslationToggle.checked
          ? 'Hover translation enabled'
          : 'Hover translation disabled',
        'success'
      );

      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated' }).catch(() => {});
        });
      });
    } catch (error) {
      console.error('Failed to update hover translation setting:', error);
      showToast('Failed to update setting', 'error');
    }
  });

}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  toastMessage.textContent = message;
  toast.className = 'toast show ' + type;

  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateUsageStats') {
    loadUsageStats();
  } else if (request.action === 'reloadSettings') {
    loadSettings();
  }
  return true;
});

// Update reset time every minute
setInterval(() => {
  updateResetTime();
}, 60000);

// ========== Keyboard Shortcuts ==========
(function renderShortcuts() {
  const isMac = navigator.platform.toUpperCase().includes('MAC') ||
                navigator.userAgent.toUpperCase().includes('MAC');

  const mod = isMac ? '⌥ Option' : 'Alt';
  const shortcuts = [
    { keys: `${mod} + Shift + T`, desc: 'Translate selected text' },
    { keys: `${mod} + Shift + G`, desc: 'Check grammar of selected text' },
    { keys: `${mod} + Shift + F`, desc: 'Open My Flashcards' },
    { keys: `${mod} + Shift + S`, desc: 'Open Settings' },
    { keys: 'Not set', desc: 'Open Translation History', note: 'Bind manually at chrome://extensions/shortcuts (Chrome cho phép tối đa 4 phím mặc định)' },
  ];

  const list = document.getElementById('shortcutList');
  if (!list) return;

  list.innerHTML = shortcuts.map(s => `
    <div class="shortcut-item">
      <kbd${s.keys === 'Not set' ? ' class="kbd-unset"' : ''}>${s.keys}</kbd>
      <span>
        ${s.desc}
        ${s.note ? `<small class="shortcut-note">${s.note}</small>` : ''}
      </span>
    </div>
  `).join('');
})();

// ========== Cross-nav buttons ==========
document.getElementById('openHistoryBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/history/history.html') });
});
document.getElementById('openFlashcardsBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/flashcards/flashcards.html') });
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
