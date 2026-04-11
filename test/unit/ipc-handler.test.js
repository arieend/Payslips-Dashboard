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
});
