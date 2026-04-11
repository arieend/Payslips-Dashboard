/**
 * Electron IPC Handler
 * Connects the dashboard UI to the Electron Main process.
 */

const IPCHandler = {
  isEnabled: !!window.electron,

  init() {
    if (!this.isEnabled) return;

    // Listen for status updates
    window.electron.onIngestStatus((event, data) => {
      this.updateStatusUI(data.status, data.message);
    });

    // Listen for per-file progress
    window.electron.onIngestProgress((event, data) => {
      this.updateProgressUI(data);
    });

    // Listen for data updates -> Refresh dashboard
    window.electron.onDataUpdated(() => {
      console.log('Data updated in background. Refreshing dashboard...');
      if (window.app && window.app.loadData) {
        window.app.loadData();
      } else {
        console.warn('Dashboard app is not yet initialized. Skipping background refresh.');
      }
    });

    // Listen for open-settings signal (e.g. first run — no config file found)
    window.electron.onOpenSettings(() => {
      if (typeof UIManager !== 'undefined') UIManager.openSettings();
    });
    
    this.createStatusUI();
  },

  async selectFolder() {
    if (!this.isEnabled) return;
    const result = await window.electron.selectFolder();
    if (result.success) {
      console.log('New source folder selected:', result.path);
      return result;
    }
    return result;
  },

  async updatePath(newPath) {
    if (!this.isEnabled) return { success: false };
    const result = await window.electron.updatePath(newPath);
    if (result.success) {
      console.log('Path updated via manual input:', result.path);
      return result;
    }
    throw new Error('Failed to update path');
  },

  // Send a POST to the REST API (browser mode) or invoke an IPC channel (Electron mode).
  async _makeRequest(ipcMethod, ipcArgs, endpoint, body) {
    if (this.isEnabled) {
      return ipcMethod(...ipcArgs);
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  },

  async syncNow() {
    if (this.isEnabled) {
      await window.electron.manualSync();
    } else {
      console.log('[IPCHandler] Non-electron mode. Calling server ingestion API...');
      try {
        const result = await this._makeRequest(null, [], '/api/ingest', {});
        if (result.success) {
          console.log(`[IPCHandler] Server sync successful: ${result.count} items.`);
          if (window.app && window.app.loadData) await window.app.loadData();
        } else {
          console.error('[IPCHandler] Server sync failed:', result.error);
        }
      } catch (e) {
        console.error('[IPCHandler] Network error during sync:', e);
      }
    }
  },

  async syncYear(year) {
    await this._makeRequest(
      () => window.electron.syncYear(year), [],
      '/api/ingest', { year }
    );
  },

  async syncMonth(year, month) {
    await this._makeRequest(
      () => window.electron.syncMonth({ year, month }), [],
      '/api/ingest', { year, month }
    );
  },

  async saveManualEdit(month, updates) {
    if (this.isEnabled) {
      const result = await window.electron.saveManualEdit({ month, updates });
      if (!result.success) throw new Error(result.error || 'Save failed');
      return result;
    } else {
      const res = await fetch('/api/manual-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, updates })
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Save failed');
      return result;
    }
  },

  createStatusUI() {
    const header = document.querySelector('header') || document.body;
    const statusContainer = document.createElement('div');
    statusContainer.id = 'electron-status';
    statusContainer.innerHTML = `
      <div class="status-dot"></div>
      <span class="status-text">Connecting...</span>
      <button class="icon-button" id="btn-sync-now" title="Sync Now">
        <i data-lucide="refresh-cw"></i>
      </button>
      <button class="icon-button" id="btn-settings" title="Change Folder">
        <i data-lucide="folder-open"></i>
      </button>
    `;
    
    header.appendChild(statusContainer);
    
    document.getElementById('btn-sync-now').addEventListener('click', () => this.syncNow());
    document.getElementById('btn-settings').addEventListener('click', () => this.selectFolder());
    
    if (window.lucide) lucide.createIcons();
  },

  updateStatusUI(status, message) {
    const container = document.getElementById('electron-status');
    if (!container) return;

    const text = container.querySelector('.status-text');
    const syncBtn = document.getElementById('btn-sync-now');
    const progressWrap = document.getElementById('ingest-progress-wrap');
    const progressFill = document.getElementById('ingest-progress-fill');
    const progressLabel = document.getElementById('ingest-progress-label');

    text.textContent = message;
    container.className = `status-${status}`;

    if (status === 'syncing') {
      syncBtn.querySelector('i').classList.add('spinning');
      if (progressWrap) progressWrap.classList.remove('hidden');
      if (progressFill) progressFill.style.width = '0%';
      if (progressLabel) progressLabel.textContent = 'Starting…';
    } else {
      syncBtn.querySelector('i').classList.remove('spinning');
      if (progressWrap) progressWrap.classList.add('hidden');
    }
  },

  updateProgressUI({ current, total, month, gross, cached }) {
    const progressFill = document.getElementById('ingest-progress-fill');
    const progressLabel = document.getElementById('ingest-progress-label');

    if (progressFill && total > 0) {
      progressFill.style.width = Math.round((current / total) * 100) + '%';
    }

    if (progressLabel && month) {
      const date = new Date(month + '-01');
      const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      const grossStr = gross > 0 ? ` — ₪${gross.toLocaleString()}` : ' — no data parsed';
      const tag = cached ? ' (cached)' : ' ✓';
      progressLabel.textContent = `${monthName}${grossStr}${tag}   (${current} / ${total})`;
    } else if (progressLabel) {
      progressLabel.textContent = `Processing… (${current} / ${total})`;
    }
  }
};

window.IPCHandler = IPCHandler;
document.addEventListener('DOMContentLoaded', () => IPCHandler.init());
