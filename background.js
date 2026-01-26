// Background service worker

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Translator extension installed');

  // Create context menus
  chrome.contextMenus.create({
    id: 'translate-text',
    title: 'Translate with AI',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'check-grammar',
    title: 'Check Grammar with AI',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'separator',
    type: 'separator',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'open-settings',
    title: 'Open AI Translator Settings',
    contexts: ['all']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-text') {
    // Send message to content script to translate
    chrome.tabs.sendMessage(tab.id, {
      action: 'translateFromContextMenu',
      text: info.selectionText
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError.message);
      }
    });
  } else if (info.menuItemId === 'check-grammar') {
    // Send message to content script to check grammar
    chrome.tabs.sendMessage(tab.id, {
      action: 'checkGrammarFromContextMenu',
      text: info.selectionText
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError.message);
      }
    });
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

    console.log('[AI Translator Background] Sending command to tab:', tabs[0].id);

    if (command === 'translate-selection') {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'translateFromShortcut' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[AI Translator Background] Error sending message:', chrome.runtime.lastError.message);
        } else {
          console.log('[AI Translator Background] Message sent successfully:', response);
        }
      });
    } else if (command === 'check-grammar') {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'checkGrammarFromShortcut' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[AI Translator Background] Error sending message:', chrome.runtime.lastError.message);
        }
      });
    } else if (command === 'open-settings') {
      chrome.tabs.create({ url: 'settings.html' });
    }
  });
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translateSelection') {
    console.log('Text to translate:', request.text);
  } else if (request.action === 'openSettings') {
    chrome.tabs.create({ url: 'settings.html' });
    sendResponse({ success: true });
  } else if (request.action === 'updateUsageStats') {
    // Forward to settings page if open
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && tab.url.includes('settings.html')) {
          chrome.tabs.sendMessage(tab.id, { action: 'updateUsageStats' }).catch(() => {});
        }
      });
    });
  }
  return true; // Keep message channel open for async response
});
