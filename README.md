# AI Translator Chrome Extension

A Chrome extension that uses Google Gemini AI to translate text directly in your browser.

## Features

- 🌍 Multi-language support with 13+ languages
- 🤖 Powered by Google Gemini AI for accurate translations
- 📋 Easy text selection and translation
- 💾 Saves your API key and preferences
- 🎨 Beautiful, modern UI
- ⌨️ Keyboard shortcut support (Ctrl+Enter to translate)

## Supported Languages

- English
- Vietnamese
- Spanish
- French
- German
- Italian
- Portuguese
- Russian
- Japanese
- Korean
- Chinese
- Arabic
- Hindi

## Installation

### Step 1: Get Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key

### Step 2: Install the Extension

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the extension_translate folder

### Step 3: Configure the Extension

1. Click the extension icon in your browser toolbar
2. Paste your Gemini API key
3. Click "Save"

## Usage

### Method 1: Using the Popup

1. Select text on any webpage
2. Click the AI Translator extension icon
3. The selected text will appear in the source field
4. Choose your target language
5. Click "Translate" or press Ctrl+Enter

### Method 2: Manual Input

1. Click the extension icon
2. Type or paste text into the source field
3. Select your target language
4. Click "Translate"

### Features

- **Auto-detect source language**: Gemini automatically detects the source text language
- **Copy translation**: Click "Copy" to copy the translation to clipboard
- **Clear text**: Click "Clear" to reset both fields
- **Language preference**: Your last selected target language is saved

## File Structure

```
extension_translate/
├── manifest.json          # Extension configuration
├── popup.html             # Popup interface
├── popup.css              # Popup styling
├── popup.js               # Popup logic and API calls
├── content.js             # Content script for text selection
├── background.js          # Background service worker
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

## API Usage

This extension uses Google's Gemini API. Standard pricing applies:
- Free tier: 15 requests per minute
- Paid tier: Based on usage

Check [Google AI Pricing](https://ai.google.dev/pricing) for details.

## Privacy

- Your API key is stored locally in your browser
- Translations are sent directly to Google's servers
- No data is collected or sent to third parties

## Troubleshooting

### API Key Issues

- Make sure your API key is valid
- Check that you have enabled the Gemini API
- Verify you haven't exceeded your quota

### Translation Errors

- Check your internet connection
- Verify the API key is correct
- Try shorter text if getting timeout errors

### Extension Not Loading

- Make sure Developer Mode is enabled
- Check that all files are in the correct location
- Look for errors in chrome://extensions/

## Development

To modify or extend this extension:

1. Edit the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on your extension card

## Future Enhancements

Possible features to add:
- Context menu integration
- Keyboard shortcut for quick translation
- Translation history
- Text-to-speech for translations
- Offline mode with cached translations

## License

This is a personal project for educational purposes.

## Credits

Built with:
- Google Gemini API
- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks)
