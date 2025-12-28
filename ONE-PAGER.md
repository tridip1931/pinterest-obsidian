# Pinterest-to-Obsidian Chrome Extension — Technical Scope

**Existing tools like Pinpasta and Pin Toolbox don't use the official Pinterest API at all—they rely entirely on DOM scraping within the browser context.** This approach works because Chrome extensions run in the user's authenticated session, enabling access to private boards without API restrictions. Building a similar tool requires understanding Manifest V3's service worker architecture, Pinterest's DOM patterns, and Obsidian's markdown conventions.

---

## Chrome Extension Architecture (Manifest V3)

The shift from Manifest V2 to V3 fundamentally changes how background scripts work. Service workers replace persistent background pages, terminating after **~30 seconds of inactivity**. This means you cannot store state in global variables—everything must be persisted to `chrome.storage.local`.

### Required manifest.json

```json
{
  "manifest_version": 3,
  "name": "Pinterest to Obsidian Exporter",
  "version": "1.0",
  "permissions": ["activeTab", "storage", "downloads", "scripting"],
  "host_permissions": [
    "https://*.pinterest.com/*",
    "https://i.pinimg.com/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://*.pinterest.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "action": { "default_popup": "popup.html" }
}
```

The `unlimitedStorage` permission removes the **10MB default limit** on `chrome.storage.local`, essential for caching large board exports.

### Component Communication

Content scripts extract pin data from Pinterest's DOM, then use `chrome.runtime.sendMessage()` to relay data to the service worker. Critical: async message handlers **must return `true`** to keep the response channel open:

```javascript
// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleExport(msg.pins).then(result => sendResponse(result));
  return true; // Required for async response
});
```

---

## Why DOM Scraping Wins

The official Pinterest API v5 requires a **Business account**, OAuth authentication, and offers limited value for export scenarios. **Every major Pinterest export tool uses browser-based scraping.**

| Approach | Pros | Cons |
|----------|------|------|
| **DOM Scraping** | No API key, full private access, no rate limits | Brittle to DOM changes |
| **Official API** | Stable, documented | Business account required, limited endpoints |

---

## Pinterest DOM Structure

Pinterest wraps pins in containers with `data-test-id="pinWrapper"`:

```javascript
// content.js - Extract pins from current page
function extractPins() {
  const pins = [];
  document.querySelectorAll('[data-test-id="pinWrapper"]').forEach(wrapper => {
    const link = wrapper.querySelector('a[href*="/pin/"]');
    const img = wrapper.querySelector('img');
    if (link && img) {
      pins.push({
        id: link.href.match(/\/pin\/(\d+)/)?.[1],
        title: img.alt || link.getAttribute('aria-label') || 'Untitled',
        thumbnailUrl: img.src,
        pinUrl: link.href
      });
    }
  });
  return pins;
}
```

---

## Image Resolution

Pinterest CDN (`i.pinimg.com`) serves images at multiple resolutions:

| Resolution | Path Prefix | Use Case |
|------------|-------------|----------|
| 70x | `/70x/` | Tiny thumbnails |
| 236x | `/236x/` | Default pin cards |
| 736x | `/736x/` | Full-size view |
| 1200x | `/1200x/` | Large resolution |
| originals | `/originals/` | **Original upload** |

```javascript
function getOriginalUrl(thumbnailUrl) {
  return thumbnailUrl.replace(/\/\d+x\//, '/originals/');
}
```

---

## Infinite Scroll Handling

Pinterest uses infinite scroll. To capture entire boards:

```javascript
async function scrollAndExtract(maxScrolls = 50) {
  const allPins = new Map(); // Deduplicate by pin ID

  for (let i = 0; i < maxScrolls; i++) {
    const prevHeight = document.body.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 2000)); // Wait for content

    extractPins().forEach(pin => allPins.set(pin.id, pin));

    if (document.body.scrollHeight === prevHeight) break; // No more content
  }
  return Array.from(allPins.values());
}
```

---

## Download Queue with Rate Limiting

```javascript
// background.js
async function batchDownload(pins, vaultPath, { concurrency = 3, delay = 500 } = {}) {
  const results = { success: 0, failed: 0 };
  const basePath = `${vaultPath}/06-Vaults/Media/Pinterest`;

  for (let i = 0; i < pins.length; i += concurrency) {
    const batch = pins.slice(i, i + concurrency);
    await Promise.all(batch.map(async pin => {
      try {
        // Download image to assets/
        await chrome.downloads.download({
          url: getOriginalUrl(pin.thumbnailUrl),
          filename: `${basePath}/assets/${sanitize(pin.title)}-${pin.id}.jpg`,
          conflictAction: 'uniquify'
        });
        results.success++;
      } catch (e) { results.failed++; }
    }));
    if (i + concurrency < pins.length) {
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return results;
}
```

---

## Obsidian Export Format

Follows vault frontmatter conventions (matches Clippings format):

```markdown
---
type: pinterest
title: Scandinavian Kitchen Design
source: https://pinterest.com/pin/123456789
board: "[[Home Decor Ideas]]"
author: designinspiration
created: 2025-12-28
processed:
description: Minimalist kitchen with white oak cabinets
tags:
  - pinterest
  - home-decor
  - kitchen
pillars:
  - Career
  - Lifestyle
image: "[[scandinavian-kitchen-123456.jpg]]"
---

# Scandinavian Kitchen Design

![[scandinavian-kitchen-123456.jpg]]

## Description

Minimalist kitchen with white oak cabinets

## Source

[View on Pinterest](https://pinterest.com/pin/123456789)
```

### Key Frontmatter Fields

| Field | Purpose |
|-------|---------|
| `type: pinterest` | For Dataview queries |
| `board` | Wikilink to board index note |
| `pillars` | PPV alignment (Career, Lifestyle, etc.) |
| `processed` | For knowledge-curator pipeline (optional) |
| `image` | Wikilink to local image |

### Folder Structure (PPV-aligned)

```
06-Vaults/
└── Media/
    └── Pinterest/
        ├── _Pinterest-Index.md       ← Dashboard with Dataview queries
        ├── boards/
        │   ├── Home Decor Ideas.md   ← Board index (links all pins)
        │   └── UI Inspiration.md
        ├── pins/
        │   ├── scandinavian-kitchen.md
        │   └── modern-dashboard.md
        └── assets/
            ├── scandinavian-kitchen-123456.jpg
            └── modern-dashboard-789012.jpg
```

### Processing Options

Pins can optionally flow through knowledge-curator:
1. **Direct export** → `06-Vaults/Media/Pinterest/pins/` (visual reference, no processing needed)
2. **With insights** → `06-Vaults/Notes-Ideas/` → knowledge-curator → `Staging/` (if you want to extract design principles)

---

## Filename Sanitization

```javascript
function sanitize(title) {
  return (title || 'untitled')
    .toLowerCase()
    .replace(/[*"\/\\<>:|?#\[\]^]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100);
}
```

---

## Technical Challenges

| Challenge | Solution |
|-----------|----------|
| **Private boards** | Works automatically — extension runs in authenticated session |
| **CORS on images** | Use `chrome.downloads.download()` from service worker |
| **Service worker timeout** | Batch processing + storage checkpoints |
| **Anti-scraping** | 2-5s delays between scrolls, 3-5 concurrent downloads |

---

## Open Source References

| Repository | Approach |
|------------|----------|
| [rrokutaro/pinterest-board-downloader](https://github.com/rrokutaro/pinterest-board-downloader) | Pure JS Chrome extension with DOM scraping |
| [sean1832/pinterest-dl](https://github.com/sean1832/pinterest-dl) | Python with Selenium |
| [obsidianmd/obsidian-importer](https://github.com/obsidianmd/obsidian-importer) | Obsidian import patterns |

---

## Implementation Phases

### Phase 1: Project Setup
- manifest.json skeleton
- Basic folder structure

### Phase 2: Core Extraction
- content.js DOM extraction
- Scroll automation
- background.js service worker

### Phase 3: Obsidian Integration
- Markdown generator with frontmatter
- Image download with resolution selection
- Filename sanitization

### Phase 4: UI & Polish
- Popup UI for board selection + progress
- Batch processing with rate limiting
- Export history/resume capability
