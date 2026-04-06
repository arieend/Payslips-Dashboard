const { app, BrowserWindow, ipcMain, dialog, protocol, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const chokidar = require('chokidar');
const { ingest, exportConfig } = require('./scripts/ingest');

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
      timer = setTimeout(runIngestion, 3000); // 3s settle
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
    runIngestion(); // fire-and-forget; progress tracked via ingest-status events
    return { success: true, path: newPath };
  }
  return { success: false };
});

ipcMain.handle('manual-sync', async () => {
  await runIngestion();
  return { success: true };
});

ipcMain.handle('sync-year', async (event, year) => {
  await runIngestion({ forceYear: year.toString() });
  return { success: true };
});

ipcMain.handle('sync-month', async (event, { year, month }) => {
  await runIngestion({ forceYear: year.toString(), forceMonth: month });
  return { success: true };
});

ipcMain.handle('update-path', async (event, newPath) => {
  if (!newPath || typeof newPath !== 'string') return { success: false };
  const trimmed = newPath.trim();
  if (!(await fs.pathExists(trimmed))) {
    return { success: false, error: 'Path does not exist' };
  }
  await writeConfigAtomic({ parentDirectoryPath: trimmed });
  await setupWatcher();
  runIngestion(); // fire-and-forget; progress tracked via ingest-status events
  return { success: true, path: trimmed };
});

ipcMain.handle('read-file-base64', async (event, filePath) => {
  const data = await fs.readFile(filePath);
  return data.toString('base64');
});

ipcMain.handle('get-config', async () => {
  try {
    return await readConfig();
  } catch (e) {
    return null;
  }
});

// App Lifecycle
app.whenReady().then(async () => {
  // Remove default menu
  Menu.setApplicationMenu(null);

  // Modern protocol handler
  protocol.handle('app-data', (request) => {
    try {
      const url = new URL(request.url);
      // For standard schemes, host + pathname gives the full path relative to app-data://
      // Example: app-data://data/payslips.json -> host='data', pathname='/payslips.json'
      const urlPath = (url.host + url.pathname).replace(/^\/+/, '');
      const filePath = path.join(baseDir, urlPath).replace(/\\/g, '/');
      return net.fetch('file:///' + filePath);
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
      if (config.parentDirectoryPath && config.parentDirectoryPath.length > 5) {
         console.log('[Main] Valid config found. Initializing background sync...');
         runIngestion();
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
