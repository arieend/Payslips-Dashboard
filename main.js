const { app, BrowserWindow, ipcMain, dialog, protocol, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const chokidar = require('chokidar');
const { ingest, exportConfig } = require('./scripts/ingest');
const { writePayslipData } = require('./scripts/data-writer');

// Remove the default Electron menu
Menu.setApplicationMenu(null);

// --- Path Management ---
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const baseDir = isPortable ? process.env.PORTABLE_EXECUTABLE_DIR : __dirname;

// Config filename matches the executable name (e.g. "Payslip Dashboard.yaml")
const appName = app.isPackaged
  ? path.basename(process.execPath, path.extname(process.execPath))
  : app.getName();
const CONFIG_FILENAME = `${appName}.yaml`;

const paths = {
  config: path.join(baseDir, CONFIG_FILENAME),
  data: path.join(baseDir, 'data'),
  tesseract: app.isPackaged ? process.resourcesPath : baseDir
};

let mainWindow;
let watcher;

// Register custom protocol for local data access (bypassing ASAR issues)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-data', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Payslip Infographic Dashboard",
    icon: path.join(__dirname, 'favicon.png'),
    backgroundColor: '#0f172a'
  });

  mainWindow.loadFile('index.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// Read and parse the YAML config file
async function readConfig() {
  const content = await fs.readFile(paths.config, 'utf8');
  return yaml.load(content) || {};
}

// Atomic config write — writes YAML to a temp file then moves to avoid corrupt config on crash
async function writeConfigAtomic(data) {
    const tempPath = paths.config + '.tmp';
    try {
        await fs.writeFile(tempPath, yaml.dump(data));
        await fs.move(tempPath, paths.config, { overwrite: true });
    } catch (e) {
        await fs.remove(tempPath).catch(() => {});
        throw e;
    }
}

// Ingestion Orchestrator
let isIngesting = false;
async function runIngestion(opts = {}) {
  if (isIngesting) return;
  isIngesting = true;

  try {
    if (mainWindow) mainWindow.webContents.send('ingest-status', { status: 'syncing', message: 'Updating dashboard...' });

    // Read the source directory from config
    const config = await readConfig().catch(() => ({}));
    const targetDir = config.parentDirectoryPath;

    if (targetDir) {
      const result = await ingest(targetDir, (progress) => {
        if (mainWindow) mainWindow.webContents.send('ingest-progress', progress);
      }, opts);
      if (result.success) {
          if (mainWindow) {
            mainWindow.webContents.send('ingest-status', { status: 'idle', message: `Synced ${result.count} payslips` });
            mainWindow.webContents.send('data-updated');
          }
      } else {
          throw new Error(result.error);
      }
    } else {
      console.warn('[Sync] No target directory configured.');
      if (mainWindow) mainWindow.webContents.send('ingest-status', { status: 'idle', message: 'Setup Required' });
    }
  } catch (error) {
    console.error('[Main] Sync failed:', error);
    if (mainWindow) mainWindow.webContents.send('ingest-status', { status: 'error', message: error.message });
  } finally {
    isIngesting = false;
  }
}

// Setup/Re-setup File Watcher
async function setupWatcher() {
  if (watcher) {
    await watcher.close();
  }

  try {
    if (!(await fs.pathExists(paths.config))) {
        console.warn('[Watcher] Config file not found at:', paths.config);
        return;
    }

    const config = await readConfig();
    const watchPath = config.parentDirectoryPath;

    if (!watchPath || !(await fs.pathExists(watchPath))) {
        console.warn('[Watcher] Source path does not exist:', watchPath);
        return;
    }

    console.log('[Watcher] Monitoring folder:', watchPath);

    watcher = chokidar.watch(watchPath, {
      ignored: (p) => {
        try {
            // Always ignore if it's within our own app's data/config paths OR if it's our own temp/output files
            if (p.includes('data') || p.includes(CONFIG_FILENAME) || p.includes('payslips.js')) return true;
            // Only watch typical payslip formats
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
               const ext = path.extname(p).toLowerCase();
               return !['.pdf', '.txt', '.png', '.jpg', '.jpeg'].includes(ext);
            }
        } catch (e) {}
        return false;
      },
      persistent: true,
      ignoreInitial: true,
      depth: 2
    });

    let timer;
    const trigger = (type, p) => {
      if (isIngesting) return;
      console.log(`[Watcher] ${type} detected: ${p}`);
      clearTimeout(timer);
      timer = setTimeout(() => runIngestion().catch(err => console.error('[Watcher] Triggered ingestion error:', err)), 3000); // 3s settle
    };

    watcher.on('add', (p) => trigger('Add', p));
    watcher.on('unlink', (p) => trigger('Unlink', p));
    watcher.on('change', (p) => trigger('Change', p));

  } catch (err) {
    console.error('[Watcher] Setup failed:', err);
  }
}
// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const newPath = result.filePaths[0];
    await writeConfigAtomic({ parentDirectoryPath: newPath });
    await setupWatcher();
    runIngestion().catch(err => console.error('[Main] Background ingestion error:', err));
    return { success: true, path: newPath };
  }
  return { success: false };
});

ipcMain.handle('manual-sync', async () => {
  try {
    await runIngestion();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sync-year', async (event, year) => {
  if (!/^\d{4}$/.test(String(year))) return { success: false, error: 'Invalid year' };
  try {
    await runIngestion({ forceYear: year.toString() });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sync-month', async (event, { year, month }) => {
  if (!/^\d{4}$/.test(String(year)) || !/^\d{2}$/.test(String(month))) {
    return { success: false, error: 'Invalid params' };
  }
  try {
    await runIngestion({ forceYear: year.toString(), forceMonth: month });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('update-path', async (event, newPath) => {
  if (!newPath || typeof newPath !== 'string') return { success: false };
  const trimmed = newPath.trim();
  if (!(await fs.pathExists(trimmed))) {
    return { success: false, error: 'Path does not exist' };
  }
  try {
    const stat = await fs.stat(trimmed);
    if (!stat.isDirectory()) return { success: false, error: 'Path must be a directory' };
  } catch {
    return { success: false, error: 'Path is not accessible' };
  }
  await writeConfigAtomic({ parentDirectoryPath: trimmed });
  await setupWatcher();
  runIngestion().catch(err => console.error('[Main] Background ingestion error:', err));
  return { success: true, path: trimmed };
});

ipcMain.handle('read-file-base64', async (event, filePath) => {
  const config = await readConfig().catch(() => ({}));
  const sourceDir = config.parentDirectoryPath;
  if (!sourceDir) throw new Error('Access denied');
  const resolved = path.resolve(filePath);
  const resolvedSource = path.resolve(sourceDir);
  // Use path.relative — if the result starts with '..', the file is outside sourceDir.
  // path.relative never returns an absolute path, so isAbsolute check is not needed.
  const relative = path.relative(resolvedSource, resolved);
  if (relative.startsWith('..')) {
    throw new Error('Access denied');
  }
  const data = await fs.readFile(resolved);
  return data.toString('base64');
});

ipcMain.handle('get-config', async () => {
  try {
    return await readConfig();
  } catch (e) {
    return null;
  }
});

ipcMain.handle('save-manual-edit', async (event, { month, updates }) => {
  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return { success: false, error: 'Invalid month format' };
    const jsonPath = path.join(paths.data, 'payslips.json');
    const data = await fs.readJson(jsonPath);
    const year = month.split('-')[0];
    const yearData = data[year];
    if (!yearData) return { success: false, error: 'Year not found' };
    const entry = yearData.find(m => m.month === month);
    if (!entry) return { success: false, error: 'Month not found' };
    const ALLOWED_EDIT_KEYS = ['gross', 'net', 'total_deductions', 'deductions', 'earnings'];
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k]) => ALLOWED_EDIT_KEYS.includes(k))
    );
    Object.assign(entry, safeUpdates);
    await writePayslipData(data, paths.data);
    if (mainWindow) mainWindow.webContents.send('data-updated');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// App Lifecycle
app.whenReady().then(async () => {
  // Modern protocol handler
  protocol.handle('app-data', (request) => {
    try {
      const url = new URL(request.url);
      // For standard schemes, host + pathname gives the full path relative to app-data://
      // Example: app-data://data/payslips.json -> host='data', pathname='/payslips.json'
      const urlPath = (url.host + url.pathname).replace(/^\/+/, '');
      const resolvedBase = path.resolve(baseDir);
      const resolvedFile = path.resolve(baseDir, urlPath);
      // Guard against path traversal (e.g. app-data://../../sensitive)
      const relative = path.relative(resolvedBase, resolvedFile);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return new Response('Not Found', { status: 404 });
      }
      return net.fetch('file:///' + resolvedFile.replace(/\\/g, '/'));
    } catch (e) {
      console.error('[Protocol] Error:', e);
      return new Response('Not Found', { status: 404 });
    }
  });

  await createWindow();
  await setupWatcher();

  if (await fs.pathExists(paths.config)) {
    try {
      const config = await readConfig();
      const p = config.parentDirectoryPath;
      if (p && typeof p === 'string' && p.trim().length > 0) {
         console.log('[Main] Valid config found. Initializing background sync...');
         runIngestion().catch(err => console.error('[Main] Startup ingestion error:', err));
      } else {
         console.log('[Main] Initial config is empty. Waiting for user setup.');
         mainWindow.webContents.once('did-finish-load', () => {
           mainWindow.webContents.send('open-settings');
         });
      }
    } catch (e) {
      console.warn('[Main] Config error at startup. Opening settings.');
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('open-settings');
      });
    }
  } else {
    console.log('[Main] No config file found. Opening settings for first-time setup.');
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('open-settings');
    });
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
