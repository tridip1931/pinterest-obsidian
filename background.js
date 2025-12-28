/**
 * Pinterest Exporter - Background Service Worker
 * Handles downloads, storage, and coordination between content script and popup
 *
 * IMPORTANT: Service workers terminate after ~30s of inactivity
 * All state must be persisted to chrome.storage.local
 */

import { generatePinMarkdown, generateBoardIndexMarkdown } from './utils/markdown.js';
import { generatePinFilename } from './utils/sanitize.js';
import {
  saveState,
  loadState,
  clearState,
  getSettings,
  addToHistory
} from './utils/storage.js';

// ============================================
// Image URL Processing
// ============================================

/**
 * Convert thumbnail URL to original resolution
 * Pinterest CDN pattern: /70x/, /236x/, /736x/, /1200x/, /originals/
 * @param {string} thumbnailUrl - Pinterest image URL
 * @param {string} resolution - Target resolution ('originals', '1200x', '736x')
 * @returns {string} - URL with target resolution
 */
function getImageUrl(thumbnailUrl, resolution = 'originals') {
  return thumbnailUrl.replace(/\/\d+x\//, `/${resolution}/`);
}

/**
 * Extract file extension from Pinterest image URL
 * @param {string} url - Pinterest image URL
 * @returns {string} - Extension (jpg, png, gif, webp)
 */
function getImageExtension(url) {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = match ? match[1].toLowerCase() : 'jpg';
  // Only allow known image extensions
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
}

// ============================================
// Download Queue with Rate Limiting
// ============================================

/**
 * Download a batch of pins with rate limiting
 * @param {Object[]} pins - Array of pin objects
 * @param {Object} options - Download options
 * @param {string} options.vaultPath - Obsidian vault base path
 * @param {string} options.boardName - Board name for organization
 * @param {number} options.concurrency - Max concurrent downloads
 * @param {number} options.delay - Delay between batches (ms)
 * @param {string} options.resolution - Image resolution
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object>} - Results with success/failed counts
 */
async function batchDownload(pins, options = {}) {
  const {
    vaultPath = '',
    boardName = 'Uncategorized',
    concurrency = 3,
    delay = 500,
    resolution = 'originals',
    onProgress = null
  } = options;

  const results = {
    success: 0,
    failed: 0,
    failedPins: []
  };

  const basePath = vaultPath
    ? `${vaultPath}/06-Vaults/Media/Pinterest`
    : 'Pinterest-Export';

  // Process in batches
  for (let i = 0; i < pins.length; i += concurrency) {
    const batch = pins.slice(i, i + concurrency);

    await Promise.all(batch.map(async (pin) => {
      try {
        // Download image
        const imageUrl = getImageUrl(pin.thumbnailUrl, resolution);
        const imageExt = getImageExtension(pin.thumbnailUrl);
        const imageFilename = `${generatePinFilename(pin.title, pin.id)}.${imageExt}`;

        await chrome.downloads.download({
          url: imageUrl,
          filename: `${basePath}/assets/${imageFilename}`,
          conflictAction: 'uniquify'
        });

        // Generate and save markdown
        const markdown = generatePinMarkdown(pin, { boardName, imageExtension: imageExt });
        const mdFilename = `${generatePinFilename(pin.title, pin.id)}.md`;

        // Create markdown file via data URL (service workers don't support createObjectURL)
        const mdUrl = 'data:text/markdown;base64,' + btoa(unescape(encodeURIComponent(markdown)));

        await chrome.downloads.download({
          url: mdUrl,
          filename: `${basePath}/pins/${mdFilename}`,
          conflictAction: 'uniquify'
        });
        results.success++;

      } catch (error) {
        console.error(`Failed to download pin ${pin.id}:`, error);
        results.failed++;
        results.failedPins.push(pin.id);
      }
    }));

    // Save checkpoint after each batch
    await saveState({
      pendingPins: pins.slice(i + concurrency).map(p => p.id),
      completedPins: pins.slice(0, i + concurrency).filter(p =>
        !results.failedPins.includes(p.id)
      ).map(p => p.id),
      failedPins: results.failedPins,
      boardName,
      startTime: Date.now()
    });

    // Progress callback
    if (onProgress) {
      onProgress({
        current: Math.min(i + concurrency, pins.length),
        total: pins.length,
        success: results.success,
        failed: results.failed
      });
    }

    // Delay between batches (except last)
    if (i + concurrency < pins.length) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return results;
}

/**
 * Create board index file
 * @param {string} boardName - Board name
 * @param {Object[]} pins - Array of pins
 * @param {string} vaultPath - Vault base path
 */
async function createBoardIndex(boardName, pins, vaultPath) {
  const basePath = vaultPath
    ? `${vaultPath}/06-Vaults/Media/Pinterest`
    : 'Pinterest-Export';

  const markdown = generateBoardIndexMarkdown(boardName, pins);
  const url = 'data:text/markdown;base64,' + btoa(unescape(encodeURIComponent(markdown)));

  // Sanitize board name for filename
  const safeFilename = (boardName || 'board')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 100);

  await chrome.downloads.download({
    url,
    filename: `${basePath}/boards/${safeFilename}.md`,
    conflictAction: 'overwrite'
  });
}

// ============================================
// Message Handling
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

/**
 * Route and handle incoming messages
 */
async function handleMessage(message, sender) {
  switch (message.action) {
    case 'contentScriptReady':
      console.log('[Background] Content script ready:', message.url);
      return { success: true };

    case 'extractionProgress':
      // Forward to popup if open
      chrome.runtime.sendMessage({
        action: 'updateProgress',
        ...message
      }).catch(() => {}); // Ignore if popup closed
      return { success: true };

    case 'startExport':
      return await handleStartExport(message);

    case 'resumeExport':
      return await handleResumeExport();

    case 'cancelExport':
      await clearState();
      return { success: true };

    case 'getExportState':
      const state = await loadState();
      return { success: true, state };

    case 'getSettings':
      const settings = await getSettings();
      return { success: true, settings };

    default:
      return { success: false, error: `Unknown action: ${message.action}` };
  }
}

/**
 * Handle export start request
 */
async function handleStartExport(message) {
  const { pins, boardName, options = {} } = message;
  const settings = await getSettings();

  try {
    // Create board index first
    await createBoardIndex(boardName, pins, settings.vaultPath);

    // Start batch download
    const results = await batchDownload(pins, {
      vaultPath: settings.vaultPath,
      boardName,
      concurrency: settings.concurrency,
      delay: settings.delay,
      resolution: settings.resolution,
      onProgress: (progress) => {
        chrome.runtime.sendMessage({
          action: 'downloadProgress',
          ...progress
        }).catch(() => {});
      }
    });

    // Clear state on success
    await clearState();

    // Add to history
    await addToHistory({
      boardName,
      pinCount: pins.length,
      successCount: results.success,
      failedCount: results.failed
    });

    return {
      success: true,
      results
    };

  } catch (error) {
    console.error('[Background] Export failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle export resume request
 */
async function handleResumeExport() {
  const state = await loadState();

  if (!state || !state.pendingPins || state.pendingPins.length === 0) {
    return { success: false, error: 'No resumable export found' };
  }

  // TODO: Implement resume logic
  // Need to reload pin data from storage or re-extract

  return {
    success: false,
    error: 'Resume not yet implemented - please start a new export'
  };
}

// ============================================
// Initialization
// ============================================

console.log('[Pinterest Exporter] Background service worker started');
