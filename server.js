const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const { productName } = require('./package.json');
const { ingest } = require('./scripts/ingest');
const { writePayslipData } = require('./scripts/data-writer');

const app = express();
const PORT = 3000;

// SSE clients for streaming ingest progress to the browser
const sseClients = new Set();
function broadcastProgress(data) {
    if (sseClients.size === 0) return;
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    const failed = [];
    sseClients.forEach(client => { try { client.write(msg); } catch (e) { failed.push(client); } });
    failed.forEach(c => sseClients.delete(c));
}

app.use(express.json());

// CSRF guard: only allow mutating requests from localhost (dev server is not internet-facing,
// but a malicious page on another tab could still trigger cross-origin POSTs).
app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const origin = req.headers.origin;
        const referer = req.headers.referer;
        if (origin && !origin.startsWith('http://localhost:') && !origin.startsWith('http://127.0.0.1:')) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (!origin && referer && !referer.startsWith('http://localhost:') && !referer.startsWith('http://127.0.0.1:')) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }
    next();
});

// Helper for absolute path resolution
const resolvePath = (p) => path.isAbsolute(p) ? p : path.resolve(__dirname, p);

// Cache-Control for fast refresh
app.use((req, res, next) => {
    // Disable caching for development
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use(express.static(path.join(__dirname, '.')));

// SSE endpoint — browser subscribes here to receive live ingest progress
app.get('/api/ingest-progress', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.write('data: {"type":"connected"}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
});

// Server-side ingestion endpoint — responds immediately, streams progress via SSE
app.post('/api/ingest', (req, res) => {
    const { year, month } = req.body || {};
    console.log('[Server] Ingestion request received...', year ? `year=${year}` : '', month ? `month=${month}` : '');
    res.json({ success: true });
    broadcastProgress({ type: 'start' });
    ingest(null, (progress) => broadcastProgress(progress), { forceYear: year, forceMonth: month })
        .then(result => {
            console.log(`[Server] Ingested ${result.count} items.`);
            broadcastProgress({ type: 'done', count: result.count });
        })
        .catch(error => {
            console.error('[Server] Ingestion error:', error);
            broadcastProgress({ type: 'error', error: error.message });
        });
});

const CONFIG_PATH = path.join(__dirname, `${productName}.yaml`);

// Cached config — invalidated whenever the config file is written
let _configCache = null;
async function readConfig() {
    if (_configCache) return _configCache;
    try {
        const raw = await fs.readFile(CONFIG_PATH, 'utf8');
        _configCache = yaml.load(raw) || {};
    } catch {
        _configCache = {};
    }
    return _configCache;
}
function invalidateConfig() { _configCache = null; }

// Endpoint to update configuration from browser
app.post('/api/config', async (req, res) => {
    const { parentDirectoryPath } = req.body;
    console.log('[Server] Updating config to:', parentDirectoryPath);
    try {
        const tmpConfigPath = CONFIG_PATH + '.tmp';
        await fs.writeFile(tmpConfigPath, yaml.dump({ parentDirectoryPath }));
        await fs.move(tmpConfigPath, CONFIG_PATH, { overwrite: true });
        invalidateConfig();

        // Re-setup the proxy on the fly
        if (parentDirectoryPath && fs.existsSync(parentDirectoryPath)) {
            // Note: express-static doesn't easily 'detach', but adding a new use often works for simple dev
            app.use('/payslips_source', express.static(parentDirectoryPath));
        }

        // Run ingestion in background — respond immediately so the UI isn't blocked
        res.json({ success: true });
        broadcastProgress({ type: 'start' });
        ingest(parentDirectoryPath, (progress) => broadcastProgress(progress))
            .then(result => broadcastProgress({ type: 'done', count: result.count }))
            .catch(e => {
                console.error('[Server] Background ingest error:', e);
                broadcastProgress({ type: 'error', error: e.message });
            });
    } catch (error) {
        console.error('[Server] Config update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Manual edit endpoint — updates a single month's data in payslips.json and payslips.js
app.post('/api/manual-edit', async (req, res) => {
    try {
        const { month, updates } = req.body;
        if (!month || !/^\d{4}-\d{2}$/.test(month) || !updates) {
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }
        const year = month.split('-')[0];
        const jsonPath = path.join(__dirname, 'data', 'payslips.json');
        const data = await fs.readJson(jsonPath);
        const yearData = data[year];
        if (!yearData) return res.status(404).json({ success: false, error: 'Year not found' });
        const entry = yearData.find(m => m.month === month);
        if (!entry) return res.status(404).json({ success: false, error: 'Month not found' });
        const ALLOWED_EDIT_KEYS = ['gross', 'net', 'total_deductions', 'deductions', 'earnings'];
        const safeUpdates = Object.fromEntries(
            Object.entries(updates).filter(([k]) => ALLOWED_EDIT_KEYS.includes(k))
        );
        Object.assign(entry, safeUpdates);
        await writePayslipData(data, path.join(__dirname, 'data'));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Serve a source file by absolute path (validated against configured source dir)
app.get('/api/source-file', async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath || typeof filePath !== 'string') return res.status(400).end();
        const config = await readConfig();
        const sourceDir = config.parentDirectoryPath;
        if (!sourceDir) return res.status(403).end();
        const resolved = path.resolve(filePath);
        const resolvedSource = path.resolve(sourceDir);
        // Use path.relative — startsWith('..') covers all out-of-bounds cases.
        const relative = path.relative(resolvedSource, resolved);
        if (relative.startsWith('..')) {
            return res.status(403).end();
        }
        res.sendFile(resolved);
    } catch (e) {
        res.status(500).end();
    }
});

// Setup payslips_source proxy — seed the config cache at startup
try {
    const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
    _configCache = yaml.load(rawConfig) || {};
    if (_configCache.parentDirectoryPath && fs.existsSync(_configCache.parentDirectoryPath)) {
        app.use('/payslips_source', express.static(_configCache.parentDirectoryPath));
        console.log('[Server] Proxying /payslips_source to:', _configCache.parentDirectoryPath);
    } else {
        console.warn('[Server] Invalid source path in config:', _configCache.parentDirectoryPath);
    }
} catch (e) {
    console.warn('[Server] Could not setup payslips_source proxy:', e.message);
    _configCache = {};
}

app.listen(PORT, () => {
    console.log(`\n🚀 Payslip Dashboard running at http://localhost:${PORT}`);
    console.log(`📡 Ingestion API: http://localhost:${PORT}/api/ingest`);
    console.log('Press Ctrl+C to stop.\n');
});
