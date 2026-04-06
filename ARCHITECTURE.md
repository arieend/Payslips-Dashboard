# Project Architecture

The Payslip Infographic Generator is built with a clear separation between data ingestion and visualization.

## Architecture Overview

### Data Ingestion Layer (`scripts/`)
- `ingest.js`: Recursively traverses the directory structure (Year > Months), parses files using `pdf-parse` for PDF documents and `fs-extra` for TXT files. It generates flattened JSON for the dashboard.
- Output: `data/payslips.json` (Electron persistent storage) and `data/payslips.js` (Frontend injection via `window.PAYSLIP_DATA`).

### App Orchestration (`main.js`, `server.js`)
- `main.js`: Electron entry point managing window lifecycle, IPC communication for ingestion, and portable environment path management.
- `server.js`: Development Express server providing API endpoints for configuration and ingestion in non-Electron environments.

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
A typical payslip entry:
```json
{
  "month": "2024-03",
  "gross": 15000,
  "net": 12000,
  "earnings": { "base": 10000, "bonus": 5000, "overtime": 0 },
  "deductions": { "tax": 1500, "pension": 750, "insurance": 750 },
  "source_file": "..."
}
```

- All processing is local via Node.js/Electron.
- Source path configuration is encrypted if persistent (Electron storage) or local JSON.
- **Portable Sandbox**: The application runs in a isolated portable directory when distributed as an EXE.
