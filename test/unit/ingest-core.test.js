import { describe, it, expect, vi, beforeEach } from 'vitest';
import yaml from 'js-yaml';
import path from 'path';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
    mockFsReadFile, mockFsReadJson, mockFsWriteFile, mockFsMove,
    mockFsRemove, mockFsEnsureDir, mockFsPathExists,
    mockWritePayslipData, mockOcrPdfFile, mockPdfParse,
} = vi.hoisted(() => ({
    mockFsReadFile: vi.fn(),
    mockFsReadJson: vi.fn().mockResolvedValue({}),
    mockFsWriteFile: vi.fn().mockResolvedValue(undefined),
    mockFsMove: vi.fn().mockResolvedValue(undefined),
    mockFsRemove: vi.fn().mockResolvedValue(undefined),
    mockFsEnsureDir: vi.fn().mockResolvedValue(undefined),
    mockFsPathExists: vi.fn().mockResolvedValue(false),
    mockWritePayslipData: vi.fn().mockResolvedValue(undefined),
    mockOcrPdfFile: vi.fn().mockResolvedValue(null),
    mockPdfParse: vi.fn().mockResolvedValue({ text: '' }),
}));

vi.mock('fs-extra', () => ({
    readFile: mockFsReadFile,
    readJson: mockFsReadJson,
    writeFile: mockFsWriteFile,
    move: mockFsMove,
    remove: mockFsRemove,
    ensureDir: mockFsEnsureDir,
    pathExists: mockFsPathExists,
    readdir: vi.fn().mockResolvedValue([]),
    lstat: vi.fn(),
    stat: vi.fn(),
}));

vi.mock('../../scripts/data-writer.js', () => ({ writePayslipData: mockWritePayslipData }));
vi.mock('../../scripts/ocr.js', () => ({ ocrPdfFile: mockOcrPdfFile }));
vi.mock('pdf-parse', () => ({ default: mockPdfParse }));

const { ingest, exportConfig, isFileForced } = require('../../scripts/ingest.js');
const fs = require('fs-extra');

beforeEach(() => {
    vi.clearAllMocks();
    mockFsReadFile.mockResolvedValue('');
    mockFsReadJson.mockResolvedValue({});
    mockFsWriteFile.mockResolvedValue(undefined);
    mockFsMove.mockResolvedValue(undefined);
    mockFsRemove.mockResolvedValue(undefined);
    mockFsEnsureDir.mockResolvedValue(undefined);
    mockFsPathExists.mockResolvedValue(false);
    mockWritePayslipData.mockResolvedValue(undefined);
});

// ── isFileForced() — pure logic ───────────────────────────────────────────────
describe('isFileForced()', () => {
    it('returns true when cached entry year matches forceYear (no forceMonth)', () => {
        expect(isFileForced('/a/2024-01.pdf', { month: '2024-01' }, '2024', null)).toBe(true);
    });

    it('returns true when cached entry year AND month both match', () => {
        expect(isFileForced('/a/2024-03.pdf', { month: '2024-03' }, '2024', '3')).toBe(true);
    });

    it('pads single-digit forceMonth to two digits before comparing', () => {
        expect(isFileForced('/a/file.pdf', { month: '2024-03' }, '2024', '3')).toBe(true);
    });

    it('returns false when cached entry year does not match forceYear', () => {
        expect(isFileForced('/a/file.pdf', { month: '2023-03' }, '2024', null)).toBe(false);
    });

    it('returns false when cached entry year matches but month does not', () => {
        expect(isFileForced('/a/file.pdf', { month: '2024-05' }, '2024', '03')).toBe(false);
    });

    it('returns true for YYYYMM filename when year matches (no forceMonth)', () => {
        expect(isFileForced('/payslips/202401.pdf', undefined, '2024', null)).toBe(true);
    });

    it('returns false for YYYYMM filename when year does not match', () => {
        expect(isFileForced('/payslips/202301.pdf', undefined, '2024', null)).toBe(false);
    });

    it('returns false for YYYYMM filename when month does not match forceMonth', () => {
        expect(isFileForced('/payslips/202405.pdf', undefined, '2024', '03')).toBe(false);
    });

    it('returns true for YYYYMM filename when both year and month match', () => {
        expect(isFileForced('/payslips/202403.pdf', undefined, '2024', '03')).toBe(true);
    });

    it('returns true when parent directory name equals forceYear (no forceMonth)', () => {
        expect(isFileForced('/payslips/2024/somefile.pdf', undefined, '2024', null)).toBe(true);
    });

    it('returns false when nothing matches (no cached entry, no YYYYMM pattern, wrong parent)', () => {
        expect(isFileForced('/payslips/misc/somefile.pdf', undefined, '2024', null)).toBe(false);
    });
});

// ── exportConfig() ────────────────────────────────────────────────────────────
describe('exportConfig()', () => {
    it('atomically writes YAML to temp file then moves it to the config path', async () => {
        await exportConfig('/my/payslips');
        // Should write temp file then move to final path
        expect(mockFsWriteFile).toHaveBeenCalledWith(
            expect.stringContaining('.tmp'),
            expect.stringContaining('parentDirectoryPath')
        );
        expect(mockFsMove).toHaveBeenCalled();
    });

    it('also writes config.js with the APP_CONFIG global', async () => {
        await exportConfig('/my/payslips');
        const configJsCall = mockFsWriteFile.mock.calls.find(c => c[0].endsWith('config.js'));
        expect(configJsCall).toBeDefined();
        expect(configJsCall[1]).toContain('window.APP_CONFIG');
        expect(configJsCall[1]).toContain('/my/payslips');
    });

    it('removes the temp file and re-throws when the write fails', async () => {
        mockFsWriteFile.mockRejectedValueOnce(new Error('Disk full'));
        await expect(exportConfig('/my/payslips')).rejects.toThrow('Disk full');
        expect(mockFsRemove).toHaveBeenCalledWith(expect.stringContaining('.tmp'));
    });
});

// ── ingest() — key branches ───────────────────────────────────────────────────
describe('ingest()', () => {
    it('returns error when no targetDir is supplied and config has none', async () => {
        mockFsReadFile.mockResolvedValue('');
        const result = await ingest();
        expect(result).toEqual({ success: false, error: 'Target directory not set' });
    });

    it('returns error when config file cannot be read and targetDir is null', async () => {
        mockFsReadFile.mockRejectedValue(new Error('ENOENT'));
        const result = await ingest();
        expect(result).toEqual({ success: false, error: 'Target directory not set' });
    });

    it('returns { success: true, count: 0 } when source directory does not exist', async () => {
        mockFsReadFile.mockResolvedValue(yaml.dump({ parentDirectoryPath: '/test/payslips' }));
        mockFsPathExists.mockResolvedValue(false);
        const result = await ingest('/test/payslips');
        expect(result).toEqual({ success: true, count: 0 });
    });

    it('calls writePayslipData after processing (even with empty dir)', async () => {
        mockFsPathExists.mockResolvedValue(false);
        mockFsReadFile.mockResolvedValue('');
        await ingest('/test/payslips');
        expect(mockWritePayslipData).toHaveBeenCalled();
    });

    it('invokes onProgress callback with cached=true for unchanged cached file', async () => {
        const existingData = {
            '2024': [{
                source_file: '/payslips/2024/01.pdf',
                month: '2024-01',
                gross: 10000,
                net: 8000,
                mtime: 12345,
                raw_text: 'x'.repeat(150)
            }]
        };
        mockFsReadFile.mockResolvedValue('');
        mockFsReadJson.mockResolvedValue(existingData);
        mockFsPathExists.mockResolvedValue(true);
        vi.mocked(fs.readdir).mockResolvedValue(['01.pdf']);
        vi.mocked(fs.lstat).mockResolvedValue({ isDirectory: () => false, isSymbolicLink: () => false });
        vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: 12345 }); // same mtime → cached

        const progressCalls = [];
        await ingest('/payslips/2024', p => progressCalls.push(p));
        expect(progressCalls.some(p => p.cached === true)).toBe(true);
    });
});
