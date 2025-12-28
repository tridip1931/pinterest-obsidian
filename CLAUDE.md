# Pinterest-to-Obsidian Chrome Extension

## Project Overview

A Manifest V3 Chrome extension that exports Pinterest boards to Obsidian with proper frontmatter and downloaded images. Uses DOM scraping (not API) to access private boards.

## Tech Stack

- **Chrome Extension Manifest V3** — Service workers, not background pages
- **Vanilla JavaScript** — No build step, no frameworks
- **ES Modules** — `type: "module"` in manifest
- **Chrome APIs** — `storage`, `downloads`, `scripting`, `tabs`, `runtime`

## Architecture

```
popup.js ←→ background.js (service worker) ←→ content.js (Pinterest DOM)
              ↓
         chrome.storage.local (state persistence)
              ↓
         chrome.downloads (images + markdown files)
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| `content.js` | DOM extraction, scroll automation, runs in Pinterest context |
| `background.js` | Service worker, download queue, state management |
| `popup.js` | UI logic, settings, progress display |
| `utils/` | Shared utilities (sanitize, markdown, storage) |

## Critical Constraints

### Service Worker Limitations
- **Terminates after ~30s of inactivity** — No persistent state in memory
- **Must checkpoint to `chrome.storage.local`** — Resume after timeout
- **Async message handlers must `return true`** — Keep channel open

```javascript
// CORRECT
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  doAsyncWork().then(sendResponse);
  return true; // Required!
});

// WRONG - response never sent
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  doAsyncWork().then(sendResponse);
});
```

### ES Module Imports
- Background script uses `type: "module"` — Can use `import`
- Content scripts **cannot** use ES modules — Must be self-contained or bundled
- Popup can use modules with `type="module"` in script tag

### Pinterest DOM Selectors
- Pin wrapper: `[data-test-id="pinWrapper"]`
- Pin link: `a[href*="/pin/"]`
- Image: `img` inside wrapper
- **These may change** — Pinterest updates DOM structure periodically

### Image CDN Pattern
```javascript
// Pinterest CDN: i.pinimg.com
// Resolutions: /70x/, /236x/, /736x/, /1200x/, /originals/
url.replace(/\/\d+x\//, '/originals/')
```

## Coding Standards

### File Organization
- Keep files small and focused
- Utils go in `utils/` with single responsibility
- No build step — files are loaded directly

### Error Handling
```javascript
// Always handle async errors
try {
  await chrome.downloads.download({ url, filename });
} catch (error) {
  console.error('[Background] Download failed:', error);
  results.failed++;
}
```

### Logging Convention
```javascript
console.log('[Background] Message received:', action);
console.log('[Content] Extracted pins:', pins.length);
console.log('[Popup] Settings saved');
```

### Message Protocol
```javascript
// Actions use verb-noun pattern
{ action: 'extractPins' }
{ action: 'scrollAndExtract', maxScrolls: 50 }
{ action: 'startExport', pins: [...], boardName: '...' }
{ action: 'downloadProgress', current: 5, total: 100 }
```

## Testing

### Manual Testing Checklist
1. Load unpacked extension in `chrome://extensions/`
2. Navigate to a Pinterest board
3. Click extension icon — should detect board
4. Test extract without scroll
5. Test extract with scroll
6. Test full export
7. Verify files in download folder

### Common Issues
| Issue | Cause | Fix |
|-------|-------|-----|
| Content script not loading | Wrong URL pattern | Check `manifest.json` matches |
| Messages not received | Missing `return true` | Add for async handlers |
| State lost | Service worker terminated | Use `chrome.storage.local` |
| CORS on images | Direct fetch blocked | Use `chrome.downloads` |

## Obsidian Integration

### Frontmatter Format
```yaml
---
type: pinterest
title: Pin Title
source: https://pinterest.com/pin/123
board: "[[Board Name]]"
created: 2025-12-28
image: "[[filename.jpg]]"
tags:
  - pinterest
---
```

### Folder Structure (PPV-aligned)
```
06-Vaults/Media/Pinterest/
├── boards/       ← Board index files
├── pins/         ← Individual pin notes
└── assets/       ← Downloaded images
```

## Development Workflow

1. Make changes to source files
2. Go to `chrome://extensions/`
3. Click refresh icon on extension card
4. Test on Pinterest

No build step required — changes are immediate after refresh.

## Reference

- [ONE-PAGER.md](ONE-PAGER.md) — Technical specification
- [Chrome MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Pinterest DOM patterns](https://github.com/nickschwab/pinterest-api) — Reference implementations
