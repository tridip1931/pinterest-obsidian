/**
 * Chrome Storage Abstraction
 * Handles state persistence for service worker timeout recovery
 * Uses chrome.storage.local with unlimitedStorage permission
 */

const STORAGE_KEYS = {
  EXPORT_STATE: 'exportState',
  SETTINGS: 'settings',
  EXPORT_HISTORY: 'exportHistory',
  DOWNLOADED_PINS: 'downloadedPins'  // Track already downloaded pin IDs
};

/**
 * Default settings
 */
const DEFAULT_SETTINGS = {
  vaultPath: '',  // Empty = downloads to ~/Downloads/Pinterest-Export/
  resolution: 'originals',  // 'originals', '1200x', '736x'
  concurrency: 3,
  delay: 500,  // ms between batches
  autoScroll: true,
  maxScrolls: 50
};

// ============================================
// State Management (for export progress)
// ============================================

/**
 * Save current export state (for recovery after service worker timeout)
 * @param {Object} state - Export state object
 * @param {string[]} state.pendingPins - Pin IDs not yet processed
 * @param {string[]} state.completedPins - Pin IDs successfully exported
 * @param {string[]} state.failedPins - Pin IDs that failed
 * @param {string} state.boardName - Current board being exported
 * @param {number} state.startTime - Export start timestamp
 */
export async function saveState(state) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.EXPORT_STATE]: {
      ...state,
      savedAt: Date.now()
    }
  });
}

/**
 * Load saved export state
 * @returns {Promise<Object|null>} - Saved state or null if none exists
 */
export async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.EXPORT_STATE);
  return result[STORAGE_KEYS.EXPORT_STATE] || null;
}

/**
 * Clear export state (after successful completion or manual cancel)
 */
export async function clearState() {
  await chrome.storage.local.remove(STORAGE_KEYS.EXPORT_STATE);
}

/**
 * Check if there's a resumable export
 * @returns {Promise<boolean>}
 */
export async function hasResumableExport() {
  const state = await loadState();
  return state !== null && state.pendingPins && state.pendingPins.length > 0;
}

// ============================================
// Settings Management
// ============================================

/**
 * Get user settings
 * @returns {Promise<Object>} - Settings object with defaults applied
 */
export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[STORAGE_KEYS.SETTINGS] || {})
  };
}

/**
 * Save user settings
 * @param {Object} settings - Partial settings to update
 */
export async function saveSettings(settings) {
  const current = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: {
      ...current,
      ...settings
    }
  });
}

// ============================================
// Export History
// ============================================

/**
 * Add an export to history
 * @param {Object} exportRecord - Export record
 * @param {string} exportRecord.boardName - Board name
 * @param {number} exportRecord.pinCount - Number of pins exported
 * @param {number} exportRecord.successCount - Successful downloads
 * @param {number} exportRecord.failedCount - Failed downloads
 */
export async function addToHistory(exportRecord) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.EXPORT_HISTORY);
  const history = result[STORAGE_KEYS.EXPORT_HISTORY] || [];

  history.unshift({
    ...exportRecord,
    timestamp: Date.now()
  });

  // Keep last 50 exports
  if (history.length > 50) {
    history.pop();
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.EXPORT_HISTORY]: history
  });
}

/**
 * Get export history
 * @returns {Promise<Object[]>} - Array of export records
 */
export async function getHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.EXPORT_HISTORY);
  return result[STORAGE_KEYS.EXPORT_HISTORY] || [];
}

/**
 * Clear export history
 */
export async function clearHistory() {
  await chrome.storage.local.remove(STORAGE_KEYS.EXPORT_HISTORY);
}

// ============================================
// Downloaded Pins Tracking
// ============================================

/**
 * Get set of already downloaded pin IDs
 * @returns {Promise<Set<string>>} - Set of pin IDs
 */
export async function getDownloadedPins() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DOWNLOADED_PINS);
  const pins = result[STORAGE_KEYS.DOWNLOADED_PINS] || [];
  return new Set(pins);
}

/**
 * Mark pins as downloaded
 * @param {string[]} pinIds - Array of pin IDs to mark as downloaded
 */
export async function markPinsAsDownloaded(pinIds) {
  const existing = await getDownloadedPins();
  pinIds.forEach(id => existing.add(id));

  await chrome.storage.local.set({
    [STORAGE_KEYS.DOWNLOADED_PINS]: Array.from(existing)
  });
}

/**
 * Filter out already downloaded pins
 * @param {Object[]} pins - Array of pin objects
 * @returns {Promise<{newPins: Object[], skippedCount: number}>}
 */
export async function filterNewPins(pins) {
  const downloaded = await getDownloadedPins();
  const newPins = pins.filter(pin => !downloaded.has(pin.id));
  return {
    newPins,
    skippedCount: pins.length - newPins.length
  };
}

/**
 * Clear downloaded pins tracking (reset)
 */
export async function clearDownloadedPins() {
  await chrome.storage.local.remove(STORAGE_KEYS.DOWNLOADED_PINS);
}

/**
 * Get count of downloaded pins
 * @returns {Promise<number>}
 */
export async function getDownloadedPinsCount() {
  const downloaded = await getDownloadedPins();
  return downloaded.size;
}
