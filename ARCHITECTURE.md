# Project Architecture

The Payslip Infographic Generator is built with a clear separation between data ingestion and visualization.

## Architecture Overview

### Data Ingestion Layer (`scripts/`)
- `ingest.js`: Recursively traverses the directory structure (Year > Months), parses files using `pdf-parse` for text PDFs. Falls back to Tesseract.js OCR (with automatic rotation scoring) when fewer than 50 characters are extracted. Supports Hebrew and English month names. Ingestion is incremental — files are cached by `mtime` to avoid re-processing.
- Output: `data/payslips.json` (Electron persistent storage) and `data/payslips.js` (Frontend injection via `window.PAYSLIP_DATA`).

### App Orchestration (`main.js`, `server.js`)
- `main.js`: Electron entry point managing window lifecycle, IPC handlers for ingestion/config, chokidar file watcher for live reload, and portable path management. Registers a custom `app-data://` protocol for local asset access from the ASAR bundle.
- `server.js`: Development Express server providing `/api/ingest` and `/api/config` endpoints with SSE-based progress streaming.

### Frontend Visualization Layer (`index.html`, `js/`, `css/`)
- `DataManager`: Core logic for data manipulation, analytics (averages, totals), and insight generation.
- `ChartManager`: Configuration and management of Chart.js instances.
- `UIManager`: Handles DOM state, event listeners, theme switching, and responsive design updates.
- `App`: Connects data, charts, and UI modules, handling first-run configuration logic.

### Design System (`css/styles.css`)
- **Theme Support**: Utilizes CSS variables for light and dark modes.
- **Glassmorphism**: Semi-transparent backdrops with blurring for modern layered feel.
- **Grid Layout**: Responsive grid system adapting the 12-month drilldown and analytics cards.

## Data Schema
`data/payslips.json` is keyed by year; each entry contains:
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

`mtime` is used for incremental ingestion — a file is only re-parsed if its modification time has changed.

## Configuration

Configuration is stored as YAML in `{appName}.yaml` (e.g. `Payslip Dashboard.yaml`) at `baseDir`. It holds `{ parentDirectoryPath: "..." }`. Writes are atomic (temp file + rename) to prevent corruption on crash. In Electron the file is written via IPC handlers; in dev mode via `POST /api/config`.

The frontend reads configuration from `data/config.js` as `window.APP_CONFIG`.

## Portable App Path Logic

When running as a portable EXE, `process.env.PORTABLE_EXECUTABLE_DIR` is set. `main.js` uses this as `baseDir` for the YAML config and `data/` directory, so user data lives next to the executable rather than inside the ASAR bundle.

All processing is local — no data leaves the machine.
