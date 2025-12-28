# Pinterest to Obsidian Exporter

A Chrome extension that exports Pinterest boards to Obsidian with proper frontmatter and image downloads.

## Features

- **DOM-based extraction** — Works with private boards (runs in your authenticated session)
- **Infinite scroll support** — Automatically scrolls to capture entire boards
- **Multiple resolutions** — Choose from original, 1200px, or 736px images
- **PPV-aligned export** — Markdown files with proper frontmatter for Obsidian
- **Rate-limited downloads** — Respects Pinterest with configurable concurrency
- **Resume capability** — Checkpoints for large board exports (WIP)

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `pinterest-obsidian` folder

## Usage

1. Navigate to a Pinterest board
2. Click the extension icon
3. Configure options:
   - **Image Resolution**: Original (best), 1200px, or 736px
   - **Auto-scroll**: Enable to load all pins (recommended)
   - **Vault Path**: Your Obsidian vault location
4. Click **Export to Obsidian**

## Export Structure

```
06-Vaults/
└── Media/
    └── Pinterest/
        ├── _Pinterest-Index.md       ← Dashboard
        ├── boards/
        │   └── Board Name.md         ← Board index with Dataview query
        ├── pins/
        │   └── pin-title-123456.md   ← Individual pin notes
        └── assets/
            └── pin-title-123456.jpg  ← Downloaded images
```

## Pin Markdown Format

```yaml
---
type: pinterest
title: Scandinavian Kitchen Design
source: https://pinterest.com/pin/123456789
board: "[[Home Decor Ideas]]"
author: designinspiration
created: 2025-12-28
description: Minimalist kitchen with white oak cabinets
tags:
  - pinterest
  - home-decor
pillars:
  - Lifestyle
image: "[[scandinavian-kitchen-123456.jpg]]"
---
```

## Development

### Project Structure

```
pinterest-obsidian/
├── manifest.json       ← Chrome extension manifest (MV3)
├── background.js       ← Service worker
├── content.js          ← DOM extraction
├── popup.html/js/css   ← Extension UI
├── utils/
│   ├── sanitize.js     ← Filename sanitization
│   ├── markdown.js     ← Obsidian markdown generator
│   └── storage.js      ← Chrome storage helpers
└── icons/              ← Extension icons
```

### Key Technical Decisions

1. **DOM scraping over API** — Pinterest API requires Business account; DOM scraping works with any account including private boards
2. **Manifest V3** — Uses service worker (not persistent background page) with storage checkpoints
3. **Rate limiting** — 3 concurrent downloads with 500ms delays to avoid triggering anti-scraping

## Technical Reference

See [ONE-PAGER.md](ONE-PAGER.md) for detailed technical specification.

## License

MIT
