import { describe, it, expect, vi, beforeEach } from 'vitest';

// Load ipc-handler as a module — it sets window.IPCHandler
import '../../js/ipc-handler.js';

describe('IPCHandler.saveManualEdit()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
        global.IPCHandler.isEnabled = false;
        delete global.window.electron;
    });

    it('browser mode: calls /api/manual-edit and resolves on success', async () => {
        global.fetch.mockResolvedValue({
            json: vi.fn().mockResolvedValue({ success: true })
        });

        const result = await global.IPCHandler.saveManualEdit('2024-03', {
            gross: 16000, net: 13000, total_deductions: 3000,
            deductions: { tax: 1500, pension: 900, insurance: 600 }
        });

        expect(global.fetch).toHaveBeenCalledWith('/api/manual-edit', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                month: '2024-03',
                updates: { gross: 16000, net: 13000, total_deductions: 3000,
                           deductions: { tax: 1500, pension: 900, insurance: 600 } }
            })
        }));
        expect(result.success).toBe(true);
    });

    it('browser mode: throws when server returns success:false', async () => {
        global.fetch.mockResolvedValue({
            json: vi.fn().mockResolvedValue({ success: false, error: 'Month not found' })
        });

        await expect(
            global.IPCHandler.saveManualEdit('2024-99', {})
        ).rejects.toThrow('Month not found');
    });

    it('browser mode: throws when fetch itself fails', async () => {
        global.fetch.mockRejectedValue(new Error('Network error'));

        await expect(
            global.IPCHandler.saveManualEdit('2024-03', {})
        ).rejects.toThrow('Network error');
    });

    it('electron mode: calls window.electron.saveManualEdit and resolves on success', async () => {
        global.IPCHandler.isEnabled = true;
        global.window.electron = {
            saveManualEdit: vi.fn().mockResolvedValue({ success: true })
        };

        const updates = { gross: 15000, net: 12000, total_deductions: 3000, deductions: {} };
        const result = await global.IPCHandler.saveManualEdit('2024-04', updates);

        expect(global.window.electron.saveManualEdit).toHaveBeenCalledWith({
            month: '2024-04', updates
        });
        expect(result.success).toBe(true);
    });

    it('electron mode: throws when electron returns success:false', async () => {
        global.IPCHandler.isEnabled = true;
        global.window.electron = {
            saveManualEdit: vi.fn().mockResolvedValue({ success: false, error: 'Year not found' })
        };

        await expect(
            global.IPCHandler.saveManualEdit('2099-01', {})
        ).rejects.toThrow('Year not found');
    });
});
