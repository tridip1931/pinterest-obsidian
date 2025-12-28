/**
 * Pinterest to Obsidian - Popup Script
 * Handles UI interactions, settings management, and export coordination
 */

import { getSettings, saveSettings, getHistory } from './utils/storage.js';

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Page status
  pageType: document.getElementById('page-type'),
  boardInfo: document.getElementById('board-info'),
  boardName: document.getElementById('board-name'),
  pinCount: document.getElementById('pin-count'),
  notBoardWarning: document.getElementById('not-board-warning'),

  // Export options
  exportOptions: document.getElementById('export-options'),
  resolution: document.getElementById('resolution'),
  autoScroll: document.getElementById('auto-scroll'),
  scrollOptions: document.getElementById('scroll-options'),
  maxScrolls: document.getElementById('max-scrolls'),

  // Settings
  vaultPath: document.getElementById('vault-path'),
  concurrency: document.getElementById('concurrency'),
  delay: document.getElementById('delay'),
  saveSettingsBtn: document.getElementById('save-settings'),

  // Progress
  progressSection: document.getElementById('progress-section'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  progressPercent: document.getElementById('progress-percent'),
  successCount: document.getElementById('success-count'),
  failedCount: document.getElementById('failed-count'),

  // Actions
  extractBtn: document.getElementById('extract-btn'),
  exportBtn: document.getElementById('export-btn'),
  cancelBtn: document.getElementById('cancel-btn'),

  // History
  historyList: document.getElementById('history-list')
};

// ============================================
// State
// ============================================

let currentState = {
  isBoard: false,
  boardName: null,
  pins: [],
  isExporting: false
};

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadHistory();
  await detectCurrentPage();
  setupEventListeners();
});

// ============================================
// Settings Management
// ============================================

async function loadSettings() {
  const settings = await getSettings();

  elements.vaultPath.value = settings.vaultPath || '';
  elements.resolution.value = settings.resolution || 'originals';
  elements.concurrency.value = settings.concurrency || 3;
  elements.delay.value = settings.delay || 500;
  elements.autoScroll.checked = settings.autoScroll !== false;
  elements.maxScrolls.value = settings.maxScrolls || 50;
}

async function handleSaveSettings() {
  await saveSettings({
    vaultPath: elements.vaultPath.value,
    resolution: elements.resolution.value,
    concurrency: parseInt(elements.concurrency.value, 10),
    delay: parseInt(elements.delay.value, 10),
    autoScroll: elements.autoScroll.checked,
    maxScrolls: parseInt(elements.maxScrolls.value, 10)
  });

  // Visual feedback
  elements.saveSettingsBtn.textContent = 'Saved!';
  setTimeout(() => {
    elements.saveSettingsBtn.textContent = 'Save Settings';
  }, 2000);
}

// ============================================
// Page Detection
// ============================================

async function detectCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('pinterest.com')) {
      showNotOnPinterest();
      return;
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });

    if (response.success) {
      updatePageStatus(response);
    } else {
      showError('Could not detect page info');
    }
  } catch (error) {
    console.error('Detection error:', error);
    showNotOnPinterest();
  }
}

function updatePageStatus(info) {
  currentState.isBoard = info.isBoard;
  currentState.boardName = info.boardName;

  if (info.isBoard) {
    elements.pageType.textContent = 'Board Page';
    elements.boardInfo.style.display = 'flex';
    elements.boardName.textContent = info.boardName || 'Unknown';
    elements.pinCount.textContent = info.visiblePinCount || 0;

    elements.notBoardWarning.style.display = 'none';
    elements.exportOptions.style.display = 'block';
    elements.exportBtn.disabled = false;
    elements.extractBtn.style.display = 'inline-block';
  } else {
    elements.pageType.textContent = 'Not a Board';
    elements.boardInfo.style.display = 'none';
    elements.notBoardWarning.style.display = 'block';
    elements.exportOptions.style.display = 'none';
    elements.exportBtn.disabled = true;
    elements.extractBtn.style.display = 'none';
  }
}

function showNotOnPinterest() {
  elements.pageType.textContent = 'Not on Pinterest';
  elements.notBoardWarning.style.display = 'block';
  elements.notBoardWarning.querySelector('p').textContent =
    'Open a Pinterest board to use this extension.';
  elements.exportBtn.disabled = true;
}

function showError(message) {
  elements.pageType.textContent = 'Error';
  elements.notBoardWarning.style.display = 'block';
  elements.notBoardWarning.querySelector('p').textContent = message;
}

// ============================================
// Export Handling
// ============================================

async function handleExtract() {
  elements.extractBtn.disabled = true;
  elements.extractBtn.textContent = 'Extracting...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const action = elements.autoScroll.checked ? 'scrollAndExtract' : 'extractPins';
    const response = await chrome.tabs.sendMessage(tab.id, {
      action,
      maxScrolls: parseInt(elements.maxScrolls.value, 10),
      scrollDelay: 2000
    });

    if (response.success) {
      currentState.pins = response.pins;
      elements.pinCount.textContent = response.pins.length;
      alert(`Found ${response.pins.length} pins!`);
    } else {
      alert('Extraction failed: ' + response.error);
    }
  } catch (error) {
    console.error('Extract error:', error);
    alert('Failed to extract pins');
  } finally {
    elements.extractBtn.disabled = false;
    elements.extractBtn.textContent = 'Extract Pins Only';
  }
}

async function handleExport() {
  if (currentState.isExporting) return;

  currentState.isExporting = true;
  elements.exportBtn.disabled = true;
  elements.cancelBtn.style.display = 'inline-block';
  elements.progressSection.style.display = 'block';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // First extract pins if not already done
    if (currentState.pins.length === 0) {
      const action = elements.autoScroll.checked ? 'scrollAndExtract' : 'extractPins';
      const extractResponse = await chrome.tabs.sendMessage(tab.id, {
        action,
        maxScrolls: parseInt(elements.maxScrolls.value, 10),
        scrollDelay: 2000
      });

      if (!extractResponse.success) {
        throw new Error('Extraction failed: ' + extractResponse.error);
      }

      currentState.pins = extractResponse.pins;
    }

    // Start export
    const exportResponse = await chrome.runtime.sendMessage({
      action: 'startExport',
      pins: currentState.pins,
      boardName: currentState.boardName || 'Uncategorized',
      options: {
        resolution: elements.resolution.value
      }
    });

    if (exportResponse.success) {
      const { results, message } = exportResponse;
      const skippedText = results.skipped > 0 ? `\n⏭ ${results.skipped} already downloaded` : '';
      alert(message || `Export complete!\n✓ ${results.success} new pins\n✗ ${results.failed} failed${skippedText}`);
      await loadHistory();
    } else {
      throw new Error(exportResponse.error);
    }

  } catch (error) {
    console.error('Export error:', error);
    alert('Export failed: ' + error.message);
  } finally {
    currentState.isExporting = false;
    currentState.pins = [];
    elements.exportBtn.disabled = false;
    elements.cancelBtn.style.display = 'none';
    elements.progressSection.style.display = 'none';
    resetProgress();
  }
}

async function handleCancel() {
  await chrome.runtime.sendMessage({ action: 'cancelExport' });
  currentState.isExporting = false;
  elements.exportBtn.disabled = false;
  elements.cancelBtn.style.display = 'none';
  elements.progressSection.style.display = 'none';
  resetProgress();
}

// ============================================
// Progress Updates
// ============================================

function updateProgress(progress) {
  const { current, total, success, failed } = progress;
  const percent = Math.round((current / total) * 100);

  elements.progressFill.style.width = `${percent}%`;
  elements.progressText.textContent = `${current} / ${total}`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.successCount.textContent = success || 0;
  elements.failedCount.textContent = failed || 0;
}

function resetProgress() {
  elements.progressFill.style.width = '0%';
  elements.progressText.textContent = '0 / 0';
  elements.progressPercent.textContent = '0%';
  elements.successCount.textContent = '0';
  elements.failedCount.textContent = '0';
}

// ============================================
// History
// ============================================

async function loadHistory() {
  const history = await getHistory();

  if (history.length === 0) {
    elements.historyList.innerHTML = '<li class="empty">No exports yet</li>';
    return;
  }

  elements.historyList.innerHTML = history.map(record => {
    const date = new Date(record.timestamp).toLocaleDateString();
    return `
      <li>
        <span class="board-name">${record.boardName}</span>
        <span class="stats">
          ${record.pinCount} pins • ${date}
        </span>
      </li>
    `;
  }).join('');
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
  // Buttons
  elements.extractBtn.addEventListener('click', handleExtract);
  elements.exportBtn.addEventListener('click', handleExport);
  elements.cancelBtn.addEventListener('click', handleCancel);
  elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);

  // Auto-scroll toggle
  elements.autoScroll.addEventListener('change', () => {
    elements.scrollOptions.style.display = elements.autoScroll.checked ? 'block' : 'none';
  });

  // Collapsible sections
  document.querySelectorAll('.collapsible').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.section');
      section.classList.toggle('collapsed');
    });
  });

  // Listen for progress messages from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'downloadProgress') {
      updateProgress(message);
    }
  });
}
