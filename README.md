# Payslip Dashboard

A premium desktop dashboard for visualizing and analyzing yearly payslip data. Processes salary documents and surfaces trends, anomalies, and detailed monthly breakdowns — with full Hebrew/English localization.

## Features

- **Data Ingestion**: Parses payslips from year-organized directories with incremental caching (skips unchanged files).
- **OCR Fallback**: Tesseract.js OCR with automatic rotation detection for scanned PDFs; supports Hebrew and English text.
- **Interactive Charts**: Chart.js visualizations — monthly salary, year-over-year growth, and composition breakdowns.
- **Anomaly Detection**: Flags gross spikes (>30% above average) and significant month-over-month net changes (>20%).
- **Lifetime Summary**: Aggregated view across all years with career totals and per-year metrics.
- **Manual Data Editing**: In-app modal to correct parsed values for any month and persist changes to `payslips.json`.
- **Live Sync**: Chokidar file watcher re-ingests automatically when source files change (3-second settle delay).
- **Internationalization**: Full UI in English and Hebrew (RTL support), persisted via `localStorage`.
- **Light / Dark Mode**: Theme switching with CSS variable-driven Glassmorphism design.
- **Export**: PDF and PNG export of the current dashboard view.
- **Portable App**: Standalone Electron EXE — no Node.js required for end users.

## Getting Started

### Prerequisites

- Node.js (for development)

### Installation

```bash
git clone <repo>
cd "Payslips Dashboard"
npm install
```

### Running

```bash
npm start          # Electron desktop app
npm run dev        # Browser dev server at localhost:3000
npm run ingest     # CLI ingestion pipeline (reads {appName}.yaml for source path)
```

### First-Time Setup

1. Launch the app (`npm start` or the built EXE).
2. On first run, the Settings panel opens automatically.
3. Click **Browse** to select the folder containing your PDF payslips.
4. The folder must be organized as `<Year>/<YYYYMM>.pdf` (e.g., `2024/202403.pdf`).
5. The dashboard ingests and displays your data automatically.

## Building for Distribution

```bash
npm run build
```

Outputs a standalone `Payslip Dashboard 1.2.0.exe` to `dist/`. The EXE is portable — `{appName}.yaml` and `data/` are stored next to the executable.

## Testing

```bash
npm test               # Unit tests (Vitest)
npm run test:watch     # Watch mode
npm run test:e2e       # E2E tests (requires: npx playwright install chromium)
```

Run a single unit test file:
```bash
npx vitest run test/unit/data.test.js
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron, electron-builder |
| Frontend | Vanilla JS, CSS, HTML5 |
| Internationalization | Custom `I18n` module (EN + HE) |
| Charts | Chart.js |
| Icons | Lucide |
| Ingestion | pdf-parse, Tesseract.js, js-yaml, fs-extra |
| File watching | chokidar |
| Dev server | Express |
| Testing | Vitest, Playwright, JSDOM |
| Build | electron-builder (portable Windows EXE) |
