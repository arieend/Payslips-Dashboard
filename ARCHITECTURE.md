# Architecture

The Payslip Dashboard is built with a clear separation between data ingestion and visualization.

## Runtime Modes

The app shares a single frontend (`index.html`, `js/`, `css/`) across two runtime modes:

| Mode | Entry Point | How it works |
|------|-------------|--------------|
| **Electron** (`npm start`) | `main.js` | Manages window lifecycle, IPC, file watching, and a custom `app-data://` protocol for local data access. `preload.js` exposes `window.electron` / `window.IPCHandler` to the renderer via `contextBridge`. |
| **Browser dev** (`npm run dev`) | `server.js` | Express serves static files and exposes REST endpoints (`/api/ingest`, `/api/config`, `/api/manual-edit`) with SSE-based ingestion progress streaming. |

## Data Flow

```
payslips_source/             (PDFs/TXTs organized as Year/YYYYMM.pdf)
    → scripts/ingest.js      (pdf-parse + Tesseract OCR fallback)
    → data/payslips.json     (Node/Electron reads and writes)
    → data/payslips.js       (window.PAYSLIP_DATA — injected for browser fallback)
    → data/config.js         (window.APP_CONFIG — injected for browser fallback)
```

Ingestion is incremental: files are cached by `mtime`. OCR (Hebrew + English) is only triggered when `pdf-parse` extracts fewer than 50 characters.

## Frontend Modules (`js/`)

| File | Class | Role |
|------|-------|------|
| `data.js` | `DataManager` | Loads `window.PAYSLIP_DATA` or fetches from `app-data://data/payslips.json`. Computes totals, averages, insights, trend analysis, per-year summaries, and lifetime totals. |
| `charts.js` | `ChartManager` | Chart.js instance creation and update lifecycle. |
| `ui.js` | `UIManager` | DOM state, event listeners, theme switching, modals (drilldown, edit, settings), year selector, toast notifications. |
| `app.js` | `App` | Wires `DataManager` → `ChartManager` → `UIManager`. Handles first-run logic and SSE ingestion progress in browser mode. |
| `ipc-handler.js` | `IPCHandler` | Detects Electron vs browser, wraps all IPC calls or REST calls uniformly. Renders the sync status bar and progress indicator. |
| `i18n.js` | `I18n` | Full UI translations for English and Hebrew (RTL). Persists language choice in `localStorage`. Applies translations via `data-i18n` attributes and direct DOM updates. |

### `DataManager` API

| Method | Description |
|--------|-------------|
| `load(forceFetch)` | Loads data from JSON (via `app-data://` or `fetch`) with a `window.PAYSLIP_DATA` fallback. Deduplicates concurrent calls. |
| `getYears()` | Returns years present in data, descending. |
| `getDataForYear(year)` | Returns month entries for a year, sorted ascending. |
| `getTotals(yearData)` | Aggregates gross, net, tax, pension, insurance, deductions, base, bonus, overtime. |
| `getAverages(yearData)` | Average net across months with non-zero data. |
| `getInsights(yearData, year)` | Generates anomaly/info/warning insights (gross spike, MoM fluctuation, incomplete dataset). |
| `getTrendAnalysis(yearData)` | Returns highest/lowest net month and most significant MoM percentage change. |
| `getAllYearsSummary()` | Cross-year rollup: total gross/net, average monthly, month count, failed count per year. |
| `getLifetimeTotals()` | Career totals (gross, net, deductions) and total years count. |

## IPC / API Handlers

### Electron IPC (main.js `ipcMain.handle`)

| Channel | Purpose |
|---------|---------|
| `select-folder` | Opens native folder dialog, saves path to YAML config, re-runs ingestion and file watcher. |
| `update-path` | Saves a manually typed path to YAML config, validates it exists, re-runs ingestion and file watcher. |
| `manual-sync` | Triggers a full ingestion run. |
| `sync-year` | Triggers ingestion scoped to a specific year (`forceYear`). |
| `sync-month` | Triggers ingestion scoped to a specific month (`forceYear` + `forceMonth`). |
| `read-file-base64` | Reads a source file as base64 (path-traversal protected — must be under the configured source directory). |
| `get-config` | Returns current YAML config object. |
| `save-manual-edit` | Applies field updates to a specific month in `payslips.json` and regenerates `payslips.js`, then sends `data-updated` to the renderer. |

### IPC Events (main → renderer)

| Event | Purpose |
|-------|---------|
| `ingest-status` | `{ status: 'syncing'|'idle'|'error', message }` — drives the status bar in `IPCHandler`. |
| `ingest-progress` | `{ current, total, month, gross, cached }` — drives the progress bar. |
| `data-updated` | Signals the renderer to call `App.loadData()` and refresh the dashboard. |
| `open-settings` | Emitted on first run or missing config — triggers `UIManager.openSettings()`. |

### Browser REST API (server.js)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ingest` | POST | Runs ingestion with optional `{ year, month }` body. Streams progress via SSE. |
| `/api/config` | GET/POST | Reads or writes the YAML config. |
| `/api/manual-edit` | POST | Applies `{ month, updates }` to `payslips.json` and regenerates `payslips.js`. |

## Data Schema

`data/payslips.json` is keyed by year:

```json
{
  "2024": [
    {
      "month": "2024-03",
      "gross": 15000,
      "net": 12000,
      "total_deductions": 3000,
      "earnings": { "base": 10000, "bonus": 5000, "overtime": 0 },
      "deductions": { "tax": 1500, "pension": 750, "insurance": 750 },
      "source_file": "/path/to/file.pdf",
      "mtime": 1234567890
    }
  ]
}
```

`mtime` is used for incremental ingestion — a file is only re-parsed when its modification time changes.

## Configuration

`{appName}.yaml` (e.g., `Payslip Dashboard.yaml`) holds `{ parentDirectoryPath: "..." }`. Writes are atomic (temp file + rename) to prevent corruption on crash. In Electron it is written via IPC handlers; in dev mode via `POST /api/config`.

The frontend reads it from `data/config.js` as `window.APP_CONFIG`.

## Portable App Path Logic

When running as a portable EXE, `process.env.PORTABLE_EXECUTABLE_DIR` is set. `main.js` uses this as `baseDir` for the YAML config and `data/` directory, so user data lives next to the executable rather than inside the ASAR bundle.

## Custom Protocol (`app-data://`)

Registered in `main.js` to allow the renderer to load local data files from `baseDir` without ASAR path issues. Example: `app-data://data/payslips.json` resolves to `<baseDir>/data/payslips.json`. `DataManager` uses this protocol automatically when `window.electron` is detected.

## Security

- `contextIsolation: true`, `nodeIntegration: false` — renderer has no direct Node.js access.
- `read-file-base64` validates that the requested path is within the configured source directory (path-traversal protection).
- All processing is local — no data leaves the machine.
