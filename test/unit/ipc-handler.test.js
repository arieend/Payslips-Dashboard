import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../../js/ipc-handler.js';

describe('IPCHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
        global.IPCHandler.isEnabled = false;
        delete global.window.electron;
    });

    // ── saveManualEdit ────────────────────────────────────────────────────────────
    describe('saveManualEdit()', () => {
        it('browser mode: POST /api/manual-edit with correct payload', async () => {
            global.fetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({ success: true }) });
            const updates = { gross: 16000, net: 13000, total_deductions: 3000, deductions: { tax: 1500, pension: 900, insurance: 600 } };
            await global.IPCHandler.saveManualEdit('2024-03', updates);
            expect(global.fetch).toHaveBeenCalledWith('/api/manual-edit', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ month: '2024-03', updates })
            }));
        });

        it('browser mode: throws when server returns success:false', async () => {
            global.fetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({ success: false, error: 'Month not found' }) });
            await expect(global.IPCHandler.saveManualEdit('2024-99', {})).rejects.toThrow('Month not found');
        });

        it('browser mode: throws when fetch fails', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'));
            await expect(global.IPCHandler.saveManualEdit('2024-03', {})).rejects.toThrow('Network error');
        });

        it('electron mode: calls window.electron.saveManualEdit', async () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = { saveManualEdit: vi.fn().mockResolvedValue({ success: true }) };
            const updates = { gross: 15000, net: 12000, total_deductions: 3000, deductions: {} };
            await global.IPCHandler.saveManualEdit('2024-04', updates);
            expect(global.window.electron.saveManualEdit).toHaveBeenCalledWith({ month: '2024-04', updates });
        });

        it('electron mode: throws when electron returns success:false', async () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = { saveManualEdit: vi.fn().mockResolvedValue({ success: false, error: 'Year not found' }) };
            await expect(global.IPCHandler.saveManualEdit('2099-01', {})).rejects.toThrow('Year not found');
        });
    });

    // ── updatePath ────────────────────────────────────────────────────────────────
    describe('updatePath()', () => {
        it('browser mode: POST /api/config and resolve on success', async () => {
            global.fetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({ success: true, path: '/new/path' }) });
            const result = await global.IPCHandler.updatePath('/new/path');
            expect(global.fetch).toHaveBeenCalledWith('/api/config', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ parentDirectoryPath: '/new/path' })
            }));
            expect(result.success).toBe(true);
        });

        it('browser mode: throws when server returns success:false', async () => {
            global.fetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({ success: false, error: 'Dir not found' }) });
            await expect(global.IPCHandler.updatePath('/bad/path')).rejects.toThrow('Dir not found');
        });

        it('browser mode: throws when fetch fails', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'));
            await expect(global.IPCHandler.updatePath('/path')).rejects.toThrow('Network error');
        });

        it('electron mode: calls window.electron.updatePath', async () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = { updatePath: vi.fn().mockResolvedValue({ success: true, path: 'C:\\Payslips' }) };
            const result = await global.IPCHandler.updatePath('C:\\Payslips');
            expect(global.window.electron.updatePath).toHaveBeenCalledWith('C:\\Payslips');
            expect(result.success).toBe(true);
        });

        it('electron mode: throws when electron returns success:false', async () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = { updatePath: vi.fn().mockResolvedValue({ success: false, error: 'Path does not exist' }) };
            await expect(global.IPCHandler.updatePath('C:\\Missing')).rejects.toThrow('Path does not exist');
        });
    });

    // ── syncYear ──────────────────────────────────────────────────────────────────
    describe('syncYear()', () => {
        it('browser mode: POST /api/ingest with year payload', async () => {
            global.fetch.mockResolvedValue({ ok: true });
            await global.IPCHandler.syncYear('2024');
            expect(global.fetch).toHaveBeenCalledWith('/api/ingest', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ year: '2024' })
            }));
        });

        it('browser mode: throws when server returns non-ok status', async () => {
            global.fetch.mockResolvedValue({ ok: false, status: 500 });
            await expect(global.IPCHandler.syncYear('2024')).rejects.toThrow('Sync failed: 500');
        });

        it('electron mode: calls window.electron.syncYear', async () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = { syncYear: vi.fn().mockResolvedValue(undefined) };
            await global.IPCHandler.syncYear('2024');
            expect(global.window.electron.syncYear).toHaveBeenCalledWith('2024');
        });
    });

    // ── syncMonth ─────────────────────────────────────────────────────────────────
    describe('syncMonth()', () => {
        it('browser mode: POST /api/ingest with year and month payload', async () => {
            global.fetch.mockResolvedValue({ ok: true });
            await global.IPCHandler.syncMonth('2024', '03');
            expect(global.fetch).toHaveBeenCalledWith('/api/ingest', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ year: '2024', month: '03' })
            }));
        });

        it('browser mode: throws when server returns non-ok status', async () => {
            global.fetch.mockResolvedValue({ ok: false, status: 503 });
            await expect(global.IPCHandler.syncMonth('2024', '03')).rejects.toThrow('Sync failed: 503');
        });

        it('electron mode: calls window.electron.syncMonth with year+month object', async () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = { syncMonth: vi.fn().mockResolvedValue(undefined) };
            await global.IPCHandler.syncMonth('2024', '03');
            expect(global.window.electron.syncMonth).toHaveBeenCalledWith({ year: '2024', month: '03' });
        });
    });

    // ── syncNow ───────────────────────────────────────────────────────────────────
    describe('syncNow()', () => {
        it('browser mode: POST /api/ingest and call app.loadData on success', async () => {
            global.fetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({ success: true }) });
            const mockLoadData = vi.fn().mockResolvedValue(undefined);
            global.window.app = { loadData: mockLoadData };
            await global.IPCHandler.syncNow();
            expect(global.fetch).toHaveBeenCalledWith('/api/ingest', expect.any(Object));
            expect(mockLoadData).toHaveBeenCalled();
        });

        it('electron mode: delegates to window.electron.manualSync', async () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = { manualSync: vi.fn().mockResolvedValue(undefined) };
            await global.IPCHandler.syncNow();
            expect(global.window.electron.manualSync).toHaveBeenCalled();
        });
    });

    // ── selectFolder ──────────────────────────────────────────────────────────────
    describe('selectFolder()', () => {
        it('does nothing in browser mode (isEnabled=false)', async () => {
            const result = await global.IPCHandler.selectFolder();
            expect(result).toBeUndefined();
        });

        it('electron mode: calls window.electron.selectFolder and returns result', async () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = { selectFolder: vi.fn().mockResolvedValue({ success: true, path: 'C:\\Payslips' }) };
            const result = await global.IPCHandler.selectFolder();
            expect(result).toEqual({ success: true, path: 'C:\\Payslips' });
        });
    });

    // ── init() ────────────────────────────────────────────────────────────────────
    describe('init()', () => {
        beforeEach(() => {
            global.IPCHandler._initialized = false;
            document.body.innerHTML = '<header></header>';
        });

        it('does nothing in browser mode (isEnabled=false)', () => {
            global.IPCHandler.isEnabled = false;
            const createSpy = vi.spyOn(global.IPCHandler, 'createStatusUI');
            global.IPCHandler.init();
            expect(createSpy).not.toHaveBeenCalled();
        });

        it('does nothing when already initialized', () => {
            global.IPCHandler.isEnabled = true;
            global.IPCHandler._initialized = true;
            global.window.electron = {
                onIngestStatus: vi.fn(), onIngestProgress: vi.fn(),
                onDataUpdated: vi.fn(), onOpenSettings: vi.fn()
            };
            const createSpy = vi.spyOn(global.IPCHandler, 'createStatusUI');
            global.IPCHandler.init();
            expect(createSpy).not.toHaveBeenCalled();
        });

        it('registers all four Electron event listeners on first init', () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = {
                onIngestStatus: vi.fn(), onIngestProgress: vi.fn(),
                onDataUpdated: vi.fn(), onOpenSettings: vi.fn()
            };
            global.IPCHandler.init();
            expect(global.window.electron.onIngestStatus).toHaveBeenCalledOnce();
            expect(global.window.electron.onIngestProgress).toHaveBeenCalledOnce();
            expect(global.window.electron.onDataUpdated).toHaveBeenCalledOnce();
            expect(global.window.electron.onOpenSettings).toHaveBeenCalledOnce();
        });

        it('sets _initialized = true after first init', () => {
            global.IPCHandler.isEnabled = true;
            global.window.electron = {
                onIngestStatus: vi.fn(), onIngestProgress: vi.fn(),
                onDataUpdated: vi.fn(), onOpenSettings: vi.fn()
            };
            global.IPCHandler.init();
            expect(global.IPCHandler._initialized).toBe(true);
        });

        it('onDataUpdated callback calls window.app.loadData when available', () => {
            global.IPCHandler.isEnabled = true;
            let dataUpdatedCb;
            global.window.electron = {
                onIngestStatus: vi.fn(), onIngestProgress: vi.fn(),
                onDataUpdated: vi.fn(cb => { dataUpdatedCb = cb; }), onOpenSettings: vi.fn()
            };
            const mockLoadData = vi.fn();
            global.window.app = { loadData: mockLoadData };
            global.IPCHandler.init();
            dataUpdatedCb();
            expect(mockLoadData).toHaveBeenCalledOnce();
        });

        it('onDataUpdated callback warns when app is not yet initialized', () => {
            global.IPCHandler.isEnabled = true;
            let dataUpdatedCb;
            global.window.electron = {
                onIngestStatus: vi.fn(), onIngestProgress: vi.fn(),
                onDataUpdated: vi.fn(cb => { dataUpdatedCb = cb; }), onOpenSettings: vi.fn()
            };
            delete global.window.app;
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            global.IPCHandler.init();
            dataUpdatedCb();
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not yet initialized'));
            warnSpy.mockRestore();
        });
    });

    // ── createStatusUI() ──────────────────────────────────────────────────────────
    describe('createStatusUI()', () => {
        beforeEach(() => {
            document.body.innerHTML = '<header></header>';
        });

        it('appends #electron-status div to the header', () => {
            global.IPCHandler.createStatusUI();
            expect(document.getElementById('electron-status')).not.toBeNull();
            expect(document.querySelector('header #electron-status')).not.toBeNull();
        });

        it('status UI contains status-dot, status-text, btn-sync-now, and btn-settings', () => {
            global.IPCHandler.createStatusUI();
            expect(document.querySelector('.status-dot')).not.toBeNull();
            expect(document.querySelector('.status-text')).not.toBeNull();
            expect(document.getElementById('btn-sync-now')).not.toBeNull();
            expect(document.getElementById('btn-settings')).not.toBeNull();
        });

        it('btn-sync-now click delegates to syncNow()', () => {
            global.IPCHandler.createStatusUI();
            const syncSpy = vi.spyOn(global.IPCHandler, 'syncNow').mockResolvedValue(undefined);
            document.getElementById('btn-sync-now').click();
            expect(syncSpy).toHaveBeenCalledOnce();
        });

        it('btn-settings click delegates to selectFolder()', () => {
            global.IPCHandler.createStatusUI();
            const folderSpy = vi.spyOn(global.IPCHandler, 'selectFolder').mockResolvedValue(undefined);
            document.getElementById('btn-settings').click();
            expect(folderSpy).toHaveBeenCalledOnce();
        });
    });

    // ── updateStatusUI() ─────────────────────────────────────────────────────────
    describe('updateStatusUI()', () => {
        const statusDOM = () => `
            <div id="electron-status" class="">
                <span class="status-text"></span>
                <button id="btn-sync-now"><i></i></button>
                <div id="ingest-progress-wrap" class="hidden"></div>
                <div id="ingest-progress-fill"></div>
                <span id="ingest-progress-label"></span>
            </div>`;

        beforeEach(() => { document.body.innerHTML = statusDOM(); });

        it('returns early without error when #electron-status is absent', () => {
            document.body.innerHTML = '';
            expect(() => global.IPCHandler.updateStatusUI('idle', 'Ready')).not.toThrow();
        });

        it('sets the status-text content to the provided message', () => {
            global.IPCHandler.updateStatusUI('idle', 'All good');
            expect(document.querySelector('.status-text').textContent).toBe('All good');
        });

        it('sets container class to status-{status}', () => {
            global.IPCHandler.updateStatusUI('error', 'Failed');
            expect(document.getElementById('electron-status').className).toBe('status-error');
        });

        it('adds "spinning" class to sync button icon when status is "syncing"', () => {
            global.IPCHandler.updateStatusUI('syncing', 'Syncing…');
            expect(document.querySelector('#btn-sync-now i').classList.contains('spinning')).toBe(true);
        });

        it('removes "spinning" class and hides progress when status is not "syncing"', () => {
            // First set syncing to add the class
            global.IPCHandler.updateStatusUI('syncing', 'Syncing…');
            // Then set idle — class should be removed
            global.IPCHandler.updateStatusUI('idle', 'Done');
            expect(document.querySelector('#btn-sync-now i').classList.contains('spinning')).toBe(false);
            expect(document.getElementById('ingest-progress-wrap').classList.contains('hidden')).toBe(true);
        });

        it('shows progress wrap and resets fill when status is "syncing"', () => {
            const wrap = document.getElementById('ingest-progress-wrap');
            const fill = document.getElementById('ingest-progress-fill');
            wrap.classList.add('hidden');
            fill.style.width = '80%';
            global.IPCHandler.updateStatusUI('syncing', 'Syncing…');
            expect(wrap.classList.contains('hidden')).toBe(false);
            expect(fill.style.width).toBe('0%');
        });
    });

    // ── updateProgressUI() ───────────────────────────────────────────────────────
    describe('updateProgressUI()', () => {
        const progressDOM = () => `
            <div id="ingest-progress-fill" style="width:0%"></div>
            <span id="ingest-progress-label"></span>`;

        beforeEach(() => { document.body.innerHTML = progressDOM(); });

        it('sets progress fill width based on current/total ratio', () => {
            global.IPCHandler.updateProgressUI({ current: 3, total: 10, month: null, gross: 0, cached: false });
            expect(document.getElementById('ingest-progress-fill').style.width).toBe('30%');
        });

        it('does not set fill width when total is 0 (avoids division by zero)', () => {
            global.IPCHandler.updateProgressUI({ current: 0, total: 0, month: null, gross: 0, cached: false });
            expect(document.getElementById('ingest-progress-fill').style.width).toBe('0%');
        });

        it('sets a descriptive label when month and positive gross are provided', () => {
            global.IPCHandler.updateProgressUI({ current: 1, total: 5, month: '2024-03', gross: 15000, cached: false });
            const label = document.getElementById('ingest-progress-label').textContent;
            expect(label).toContain('15,000');
            expect(label).toContain('1 / 5');
            expect(label).toContain('✓');
        });

        it('shows "no data parsed" when gross is 0', () => {
            global.IPCHandler.updateProgressUI({ current: 1, total: 5, month: '2024-03', gross: 0, cached: false });
            expect(document.getElementById('ingest-progress-label').textContent).toContain('no data parsed');
        });

        it('adds "(cached)" tag when cached=true', () => {
            global.IPCHandler.updateProgressUI({ current: 2, total: 5, month: '2024-03', gross: 12000, cached: true });
            expect(document.getElementById('ingest-progress-label').textContent).toContain('(cached)');
        });

        it('shows generic Processing label when month is null', () => {
            global.IPCHandler.updateProgressUI({ current: 4, total: 10, month: null, gross: 0, cached: false });
            const label = document.getElementById('ingest-progress-label').textContent;
            expect(label).toContain('Processing');
            expect(label).toContain('4 / 10');
        });
    });
});
