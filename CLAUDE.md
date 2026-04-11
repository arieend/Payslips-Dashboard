# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm start            # Run as Electron desktop app
npm run dev          # Run as browser app via Express on localhost:3000
npm run ingest       # Run ingestion pipeline from CLI (reads {appName}.yaml for source path)
npm run build        # Build portable Windows EXE (output: dist/)

npm test             # Run unit tests (Vitest, jsdom environment)
npm run test:watch   # Run unit tests in watch mode
npm run test:e2e     # Run Playwright E2E tests (requires: npx playwright install chromium)
```

To run a single unit test file:
```bash
npx vitest run test/unit/data.test.js
```

## Architecture

The app has two runtime modes sharing the same frontend:
- **Electron** (`npm start`): `main.js` manages lifecycle, IPC, and file watching. `preload.js` exposes `window.electron` / `window.IPCHandler` to the renderer via `contextBridge`.
- **Browser dev** (`npm run dev`): `server.js` (Express) serves static files and provides `/api/ingest` and `/api/config` endpoints.

### Data Flow

```
payslips_source/ (PDFs/TXTs organized as Year/YYYYMM.pdf)
    → scripts/ingest.js  (pdf-parse + Tesseract OCR fallback for scanned PDFs)
    → data/payslips.json (Node/Electron reads)
    → data/payslips.js   (injected as window.PAYSLIP_DATA for browser)
    → data/config.js     (injected as window.APP_CONFIG)
```

Ingestion is incremental: files are cached by `mtime`. OCR (Hebrew + English) is only triggered when `pdf-parse` extracts fewer than 50 characters.

### Frontend Modules (`js/`)

| File | Role |
|------|------|
| `data.js` | `DataManager` — loads `window.PAYSLIP_DATA`, computes totals/averages/insights/trends |
| `charts.js` | `ChartManager` — Chart.js instance management |
| `ui.js` | `UIManager` — DOM state, theme switching, modals, year selector |
| `app.js` | `App` — wires DataManager → ChartManager → UIManager, handles first-run logic |
| `ipc-handler.js` | Detects Electron vs browser, wraps IPC or REST calls uniformly |

### Portable App Path Logic

When running as a portable EXE, `process.env.PORTABLE_EXECUTABLE_DIR` is set. `main.js` uses this as `baseDir` for `{appName}.yaml` and `data/` so user data lives next to the executable, not inside the ASAR bundle.

### Data Schema

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

Month is derived from PDF text first (Hebrew and English month names supported), then falls back to filename pattern `YYYYMM` or parent folder `YYYY` + filename `MM`.

### Configuration

`{appName}.yaml` (e.g. `Payslip Dashboard.yaml`, at `baseDir`) holds `{ parentDirectoryPath: "..." }`. Writes are atomic to prevent corruption. In Electron it is written via IPC handlers; in dev mode via `POST /api/config`. The frontend reads it from `data/config.js` as `window.APP_CONFIG`.

### Testing Layout

- `test/unit/` — Vitest unit tests for `DataManager`, `ChartManager`, `UIManager`, `App`, and `ingest.js`
- `test/e2e/` — Playwright tests for full UI flows (served via `npm run dev`)
- `test/fixtures/payslips_source/` — sample PDFs for ingest tests

## Security Conventions

**Path validation** — always use `path.relative(resolvedBase, resolved)` to guard file-serving; check `relative.startsWith('..') || path.isAbsolute(relative)`. Never use `startsWith()` string comparison (breaks on Windows case folding).

**Month parameters** — validate with `/^\d{4}-\d{2}$/.test(month)` before use in IPC handlers (`main.js`) and Express endpoints (`server.js`).

**innerHTML** — user-originated or OCR-derived strings must use `textContent` or be escaped with the `_escHtml()` helper in `app.js` before interpolation into HTML.

**`runIngestion()` calls** — always append `.catch(err => console.error(...))` at fire-and-forget call sites; the function handles its own errors internally but unhandled rejections still surface without a catch.

**Express CSRF** — `server.js` has a localhost-only `Origin`/`Referer` guard middleware for all mutating methods. Keep it in place when adding new endpoints.
