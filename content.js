/**
 * Pinterest Content Script
 * Runs in the context of Pinterest pages to extract pin data from the DOM
 * Communicates with background.js via chrome.runtime messaging
 */

// ============================================
// DOM Extraction
// ============================================

/**
 * Extract pins from the current page DOM
 * @returns {Object[]} - Array of pin objects
 */
function extractPins() {
  const pins = [];

  document.querySelectorAll('[data-test-id="pinWrapper"]').forEach(wrapper => {
    const link = wrapper.querySelector('a[href*="/pin/"]');
    const img = wrapper.querySelector('img');

    if (link && img) {
      const pinId = link.href.match(/\/pin\/(\d+)/)?.[1];

      if (pinId) {
        pins.push({
          id: pinId,
          title: img.alt || link.getAttribute('aria-label') || 'Untitled',
          thumbnailUrl: img.src,
          pinUrl: link.href
        });
      }
    }
  });

  return pins;
}

/**
 * Detect the current board name from the page
 * @returns {string|null} - Board name or null if not on a board page
 */
function detectBoardName() {
  // Try various selectors for board name
  const selectors = [
    'h1[data-test-id="board-name"]',
    '[data-test-id="board-header"] h1',
    'h1.boardName',
    'h1'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }

  // Fallback: extract from URL
  const match = window.location.pathname.match(/\/([^\/]+)\/([^\/]+)\/?$/);
  if (match) {
    return decodeURIComponent(match[2]).replace(/-/g, ' ');
  }

  return null;
}

/**
 * Detect if we're on a board page
 * @returns {boolean}
 */
function isOnBoardPage() {
  // Board URLs typically look like: /username/board-name/
  const pathname = window.location.pathname;
  return pathname.split('/').filter(Boolean).length >= 2 &&
         !pathname.includes('/pin/') &&
         !pathname.includes('/settings');
}

// ============================================
// Infinite Scroll Handling
// ============================================

/**
 * Scroll through the page to load all pins
 * @param {Object} options - Scroll options
 * @param {number} options.maxScrolls - Maximum scroll iterations
 * @param {number} options.scrollDelay - Delay between scrolls (ms)
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object[]>} - All unique pins found
 */
async function scrollAndExtract(options = {}) {
  const {
    maxScrolls = 50,
    scrollDelay = 2000,
    onProgress = null
  } = options;

  const allPins = new Map(); // Deduplicate by pin ID
  let previousHeight = 0;
  let noNewContentCount = 0;

  for (let i = 0; i < maxScrolls; i++) {
    // Extract current pins
    const currentPins = extractPins();
    let newPinsCount = 0;

    currentPins.forEach(pin => {
      if (!allPins.has(pin.id)) {
        allPins.set(pin.id, pin);
        newPinsCount++;
      }
    });

    // Report progress
    if (onProgress) {
      onProgress({
        scrollIteration: i + 1,
        maxScrolls,
        totalPins: allPins.size,
        newPinsThisScroll: newPinsCount
      });
    }

    // Scroll to bottom
    const currentHeight = document.body.scrollHeight;
    window.scrollTo(0, currentHeight);

    // Wait for content to load
    await new Promise(r => setTimeout(r, scrollDelay));

    // Check if we've reached the end
    if (currentHeight === previousHeight) {
      noNewContentCount++;
      if (noNewContentCount >= 3) {
        // No new content after 3 attempts, we've reached the end
        break;
      }
    } else {
      noNewContentCount = 0;
    }

    previousHeight = currentHeight;
  }

  return Array.from(allPins.values());
}

// ============================================
// Message Handling
// ============================================

/**
 * Handle messages from popup or background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'extractPins':
      sendResponse({
        success: true,
        pins: extractPins(),
        boardName: detectBoardName(),
        isBoard: isOnBoardPage()
      });
      break;

    case 'scrollAndExtract':
      // Run async scroll extraction
      scrollAndExtract({
        maxScrolls: message.maxScrolls || 50,
        scrollDelay: message.scrollDelay || 2000,
        onProgress: (progress) => {
          // Send progress updates to background
          chrome.runtime.sendMessage({
            action: 'extractionProgress',
            ...progress
          });
        }
      }).then(pins => {
        sendResponse({
          success: true,
          pins,
          boardName: detectBoardName(),
          isBoard: isOnBoardPage()
        });
      }).catch(error => {
        sendResponse({
          success: false,
          error: error.message
        });
      });
      return true; // Keep channel open for async response

    case 'getPageInfo':
      sendResponse({
        success: true,
        url: window.location.href,
        boardName: detectBoardName(),
        isBoard: isOnBoardPage(),
        visiblePinCount: extractPins().length
      });
      break;

    default:
      sendResponse({
        success: false,
        error: `Unknown action: ${message.action}`
      });
  }

  return false; // Sync response (except scrollAndExtract)
});

// ============================================
// Initialization
// ============================================

/**
 * Notify background script that content script is ready
 */
function init() {
  chrome.runtime.sendMessage({
    action: 'contentScriptReady',
    url: window.location.href,
    isBoard: isOnBoardPage(),
    boardName: detectBoardName()
  });
}

// Run on load
init();

console.log('[Pinterest Exporter] Content script loaded');
