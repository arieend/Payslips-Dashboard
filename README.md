# Payslip Infographic Generator

A premium dashboard for visualizing and analyzing yearly payslip data. This application processes your salary documents and highlights trends, anomalies, and detailed monthly breakdowns.

## Features
- **Data Ingestion**: Automatically parses payslips from sorted directories (Year > Months) with incremental caching.
- **OCR Fallback**: Tesseract.js OCR with automatic rotation detection for scanned PDFs; supports Hebrew and English text.
- **Interactive Visuals**: Beautiful charts using Chart.js to show salary trends and composition.
- **Anomaly Detection**: Identifies spikes in earnings or missing files.
- **Live Sync**: Chokidar file watcher re-ingests data automatically when source files change.
- **Premium Design**: Modern Glassmorphism UI with Light/Dark mode support.
- **Export**: Options to export your financial overview as PDF/PNG.
- **Portable App**: Fully standalone Electron application for easy distribution.

## Distribution

### Windows Portable App
The latest release can be built using:
```bash
npm run build
```
This generates a standalone `Payslip Dashboard 1.2.0.exe` in the `dist/` directory.

### Initial Setup
1. Launch the application.
2. Click the **Settings Gear** (top right) to configure your source directory.
3. Click **Browse** to select the folder containing your PDF/TXT payslips.
4. The dashboard will automatically ingest and display your data.

## Getting Started

### Prerequisites
- Node.js installed

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Usage
1. Place your payslips in the source directory you configure via the app's Settings (organized by year folders).
2. Run the ingestion script:
   ```bash
   npm run ingest
   ```
3. Open `index.html` in your browser. Or run a local server:
   ```bash
   npm run dev
   ```

## Testing
The project includes both unit and end-to-end tests:
- **Unit Tests**: `npm run test` (via Vitest)
- **E2E Tests**: `npm run test:e2e` (via Playwright)

## Tech Stack
- Frontend: Vanilla JS, CSS, HTML5
- Desktop: Electron, electron-builder
- Charts: Chart.js
- Icons: Lucide
- Testing: Vitest, Playwright, JSDOM
- Ingestion: Node.js, fs-extra, pdf-parse, Tesseract.js, js-yaml
- File Watching: chokidar
- Build: electron-builder (portable Windows EXE)
