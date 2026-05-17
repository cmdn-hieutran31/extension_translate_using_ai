# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Rule

**IMPORTANT: Always respond in Vietnamese**, regardless of what language the user writes in.

## Project Overview

Chrome Extension (Manifest V3) for AI-powered text translation, grammar checking, and image OCR using Google Gemini. No build system — pure vanilla JS loaded directly by Chrome.

## Development Workflow

**Loading the extension:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select this directory

**After code changes:** Click the reload icon next to the extension in `chrome://extensions/`. For content script changes, also reload the target webpage.

There are no build steps, no package.json, no npm scripts, and no tests.

## Architecture

The extension has three runtime contexts that communicate via `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`:

### Background Service Worker (`background.js`)
The logic layer. Handles all API calls and data persistence. Key responsibilities:
- **Translation routing**: Short text (≤3 words) → Google Translate free API → MyMemory fallback → Gemini fallback
- **Gemini API calls**: `translateTextWithGemini()`, `checkGrammarWithGemini()`, `extractImageWithGemini()`
- **IndexedDB**: Flashcard CRUD (`TranslatorDB` / `flashcards` store)
- **Context menu** and **keyboard command** handlers (Alt+T, Alt+G)
- `fetchWithTimeout()` wraps all network calls (8s default, 15s for Gemini)
- `getGeminiModel()` reads the selected model from `chrome.storage.local`

### Content Script (`content.js`)
Injected into all webpages. Handles DOM interaction and the inline UI:
- Detects text selection (`mouseup`/`keyup`) → shows floating translate icon
- Builds and manages the inline floating popup (translate result, dictionary, audio, save button)
- Sends messages to background for translation/grammar, displays results
- Monitors textareas/inputs for auto grammar check (controlled by `grammarCheckEnabled` setting)
- Syncs `globalTheme` preference across tabs via `chrome.storage.local`

### Popup / Settings / Flashcards Pages
Each has a paired `.html` + `.js` + `.css`. They communicate exclusively with background via message passing — never with content.js directly.

- **`popup.html`**: Full translation UI with image upload/OCR, language selector, TTS, grammar check
- **`settings.html`**: API key, model selection, feature toggles, usage stats dashboard
- **`flashcards.html`**: Grid of saved words with 3D flip cards, inline example editing, dictionary drawer

## Message Protocol

All messages follow `{action: string, ...data}`. Key actions handled by `background.js`:

| Action | Payload | Description |
|--------|---------|-------------|
| `callTranslateAPI` | `{text, targetLang}` | Translate text (cascading fallback) |
| `callGrammarCheckAPI` | `{text}` | Grammar check via Gemini |
| `saveFlashcard` | `{data: FlashcardData}` | Save to IndexedDB |
| `getFlashcards` | — | Return all flashcards |
| `deleteFlashcard` | `{id}` | Delete by UUID |
| `updateFlashcard` | `{id, ...fields}` | Update existing card |
| `openSettings` | — | Open settings tab |

## Flashcard Data Model

```js
{
  id: UUID,
  word: string,
  translation: string,
  context: string,       // source page URL
  example: string,       // surrounding sentence
  dictionary: [{type: string, meanings: string[]}],
  createdAt: ISO string,
  updatedAt: ISO string
}
```

## External APIs

| API | Usage | Limit |
|-----|-------|-------|
| MyMemory | Primary translation | 10K chars/day free |
| Google Translate (free endpoint) | Dictionary / short words | Unofficial, no key needed |
| Gemini API | AI translation, grammar, OCR | Requires user's API key; model configurable |

## Configurable Gemini Models

Stored as `geminiModel` in `chrome.storage.local`. Options: `gemini-2.5-pro-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-lite-preview`, `gemini-2.0-flash`, `gemini-1.5-flash-lite` (default).

## Keyboard Shortcuts

Defined in `manifest.json` under `commands`:
- `Alt+T` — Translate selected text
- `Alt+G` — Grammar check selected text  
- `Alt+F` — Open flashcards page
- `Alt+S` — Open settings page

## UI Conventions

- Glassmorphism design with dark mode default; theme stored as `globalTheme` (`'dark'`/`'light'`) in `chrome.storage.local`
- Spinner state on buttons during async calls: add `.loading` class, remove on completion
- Source attribution shown on translation results: `'google_dict'`, `'mymemory'`, or `'ai'`
- All CSS uses CSS custom properties (`--bg-color`, `--text-color`, etc.) for theming
