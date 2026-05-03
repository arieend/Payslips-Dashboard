import { describe, it, expect, vi, beforeEach } from 'vitest';
import yaml from 'js-yaml';
import path from 'path';

// ── Hoisted mock instances — must exist before vi.mock factories run ──────────
const { mockReadFile, mockReadJson, mockWriteFile, mockMove, mockIngest, mockWritePayslipData } = vi.hoisted(() => ({
    mockReadFile: vi.fn().mockResolvedValue(''),
    mockReadJson: vi.fn().mockResolvedValue({}),
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockMove: vi.fn().mockResolvedValue(undefined),
    mockIngest: vi.fn().mockResolvedValue({ success: true, count: 3 }),
    mockWritePayslipData: vi.fn().mockResolvedValue(undefined),
}));

// Mocks are registered (hoisted) before the static imports below are resolved
vi.mock('fs-extra', () => ({
    readFileSync: vi.fn(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }),
    existsSync: vi.fn(() => false),
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    move: mockMove,
    readJson: mockReadJson,
}));

vi.mock('../../scripts/ingest.js', () => ({ ingest: mockIngest }));
vi.mock('../../scripts/data-writer.js', () => ({ writePayslipData: mockWritePayslipData }));

// Static imports are resolved AFTER vi.mock() registration — server.js loads with mocked deps
import serverExports from '../../server.js';
import supertest from 'supertest';

const { app, readConfig, invalidateConfig, broadcastProgress } = serverExports;
const request = supertest(app);

beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue('');
    mockReadJson.mockResolvedValue({});
    mockWriteFile.mockResolvedValue(undefined);
    mockMove.mockResolvedValue(undefined);
    mockIngest.mockResolvedValue({ success: true, count: 3 });
    mockWritePayslipData.mockResolvedValue(undefined);
    invalidateConfig();
});

// ── CSRF guard middleware ─────────────────────────────────────────────────────
describe('CSRF guard', () => {
    it('blocks POST from a non-localhost Origin', async () => {
        await request
            .post('/api/ingest')
            .set('Origin', 'https://evil.com')
            .send({})
            .expect(403);
    });

    it('blocks POST when no Origin but a non-localhost Referer is present', async () => {
        await request
            .post('/api/ingest')
            .set('Referer', 'https://evil.com/attack')
            .send({})
            .expect(403);
    });

    it('allows POST from http://localhost Origin', async () => {
        const res = await request
            .post('/api/ingest')
            .set('Origin', 'http://localhost:3000')
            .send({});
        expect(res.status).not.toBe(403);
    });

    it('allows POST from http://127.0.0.1 Origin', async () => {
        const res = await request
            .post('/api/ingest')
            .set('Origin', 'http://127.0.0.1:3000')
            .send({});
        expect(res.status).not.toBe(403);
    });

    it('allows POST with no Origin and no Referer headers', async () => {
        const res = await request.post('/api/ingest').send({});
        expect(res.status).not.toBe(403);
    });

    it('does NOT block GET requests regardless of Origin (read-only methods are exempt)', async () => {
        const res = await request
            .get('/api/source-file')
            .set('Origin', 'https://evil.com')
            .query({ path: '/any/path' });
        // Should not be blocked by CSRF guard (may fail for other reasons, but not 403 from CSRF)
        // We check that the response isn't the CSRF 403 specifically
        if (res.status === 403) {
            // Verify it's not the CSRF response (CSRF response body is { error: 'Forbidden' })
            expect(res.body.error).not.toBe('Forbidden');
        }
    });
});

// ── readConfig / invalidateConfig ─────────────────────────────────────────────
describe('readConfig() / invalidateConfig()', () => {
    it('caches config on first call — second call skips file read', async () => {
        mockReadFile.mockResolvedValue(yaml.dump({ parentDirectoryPath: '/test' }));
        await readConfig();
        await readConfig();
        expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('invalidateConfig() forces a fresh file read on the next call', async () => {
        mockReadFile.mockResolvedValue(yaml.dump({ parentDirectoryPath: '/first' }));
        const cfg1 = await readConfig();
        invalidateConfig();
        mockReadFile.mockResolvedValue(yaml.dump({ parentDirectoryPath: '/second' }));
        const cfg2 = await readConfig();
        expect(cfg1.parentDirectoryPath).toBe('/first');
        expect(cfg2.parentDirectoryPath).toBe('/second');
    });

    it('falls back to {} when the config file cannot be read', async () => {
        mockReadFile.mockRejectedValue(new Error('ENOENT'));
        const cfg = await readConfig();
        expect(cfg).toEqual({});
    });
});

// ── broadcastProgress ─────────────────────────────────────────────────────────
describe('broadcastProgress()', () => {
    it('does not throw when there are no connected SSE clients', () => {
        expect(() => broadcastProgress({ type: 'done', count: 5 })).not.toThrow();
    });
});

// ── POST /api/manual-edit ─────────────────────────────────────────────────────
describe('POST /api/manual-edit', () => {
    const validPayslips = {
        '2024': [{ month: '2024-03', gross: 15000, net: 12000, total_deductions: 3000, deductions: {}, earnings: {} }]
    };

    it('returns 400 when month is missing', async () => {
        await request
            .post('/api/manual-edit')
            .set('Origin', 'http://localhost:3000')
            .send({ updates: { gross: 16000 } })
            .expect(400);
    });

    it('returns 400 for an invalid month format (missing leading zero)', async () => {
        await request
            .post('/api/manual-edit')
            .set('Origin', 'http://localhost:3000')
            .send({ month: '2024-3', updates: { gross: 16000 } })
            .expect(400);
    });

    it('returns 400 for a month value that is plain text', async () => {
        await request
            .post('/api/manual-edit')
            .set('Origin', 'http://localhost:3000')
            .send({ month: 'March 2024', updates: { gross: 16000 } })
            .expect(400);
    });

    it('returns 400 when the updates object is absent', async () => {
        await request
            .post('/api/manual-edit')
            .set('Origin', 'http://localhost:3000')
            .send({ month: '2024-03' })
            .expect(400);
    });

    it('returns 404 when the year is not present in stored data', async () => {
        mockReadJson.mockResolvedValue({ '2023': [] });
        await request
            .post('/api/manual-edit')
            .set('Origin', 'http://localhost:3000')
            .send({ month: '2024-03', updates: { gross: 16000 } })
            .expect(404);
    });

    it('returns 404 when the specific month entry is not found in year data', async () => {
        mockReadJson.mockResolvedValue({ '2024': [{ month: '2024-01', gross: 10000, net: 8000 }] });
        await request
            .post('/api/manual-edit')
            .set('Origin', 'http://localhost:3000')
            .send({ month: '2024-03', updates: { gross: 16000 } })
            .expect(404);
    });

    it('strips disallowed keys from updates — only ALLOWED_EDIT_KEYS pass through', async () => {
        mockReadJson.mockResolvedValueOnce(JSON.parse(JSON.stringify(validPayslips)));
        await request
            .post('/api/manual-edit')
            .set('Origin', 'http://localhost:3000')
            .send({ month: '2024-03', updates: { gross: 16000, hackerField: 'evil', net: 13000 } })
            .expect(200);
        const [writtenData] = mockWritePayslipData.mock.calls[0];
        expect(writtenData['2024'][0].gross).toBe(16000);
        expect(writtenData['2024'][0].net).toBe(13000);
        expect(writtenData['2024'][0].hackerField).toBeUndefined();
    });

    it('allows all five approved edit fields to be applied', async () => {
        mockReadJson.mockResolvedValueOnce(JSON.parse(JSON.stringify(validPayslips)));
        const updates = { gross: 16000, net: 13000, total_deductions: 3000, deductions: { tax: 1500 }, earnings: { base: 15000 } };
        await request
            .post('/api/manual-edit')
            .set('Origin', 'http://localhost:3000')
            .send({ month: '2024-03', updates })
            .expect(200);
        const [writtenData] = mockWritePayslipData.mock.calls[0];
        const entry = writtenData['2024'][0];
        expect(entry.gross).toBe(16000);
        expect(entry.net).toBe(13000);
        expect(entry.total_deductions).toBe(3000);
        expect(entry.deductions.tax).toBe(1500);
        expect(entry.earnings.base).toBe(15000);
    });
});

// ── GET /api/source-file ──────────────────────────────────────────────────────
describe('GET /api/source-file', () => {
    it('returns 400 when the path query parameter is missing', async () => {
        await request.get('/api/source-file').expect(400);
    });

    it('returns 403 when no sourceDir is configured in the config', async () => {
        // mockReadFile returns '' → yaml.load('') = null → config = {} → no sourceDir
        await request
            .get('/api/source-file')
            .query({ path: 'C:\\test\\file.pdf' })
            .expect(403);
    });

    it('blocks path traversal — path outside sourceDir returns 403', async () => {
        mockReadFile.mockResolvedValueOnce(yaml.dump({ parentDirectoryPath: 'C:\\test\\payslips' }));
        // C:\Windows\system32 is completely outside C:\test\payslips
        await request
            .get('/api/source-file')
            .query({ path: 'C:\\Windows\\system32\\evil.dll' })
            .expect(403);
    });

    it('passes a path within sourceDir through the security check (non-403)', async () => {
        mockReadFile.mockResolvedValueOnce(yaml.dump({ parentDirectoryPath: 'C:\\test\\payslips' }));
        const res = await request
            .get('/api/source-file')
            .query({ path: path.join('C:\\test\\payslips', '2024', '01.pdf') });
        // Security guard must not block this — Express may return 404/500 because the file
        // doesn't actually exist on disk, but must NOT return 403 (security block) or 400.
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(400);
    });
});
