# Testing Strategy

The Payslip Dashboard uses a multi-layered testing approach: unit tests for logic correctness and E2E tests for full UI flows.

## Test Layers

### Unit Tests (Vitest + JSDOM)

Located in `test/unit/`.

| File | Scope |
|------|-------|
| `data.test.js` | `DataManager` — `load()`, `getYears()`, `getDataForYear()`, `getTotals()`, `getAverages()`, `getInsights()`, `getTrendAnalysis()`, `getAllYearsSummary()`, `getLifetimeTotals()` |
| `app.test.js` | `App` — wiring of DataManager → ChartManager → UIManager, first-run logic, SSE progress subscription |
| `charts.test.js` | `ChartManager` — Chart.js instance creation and update lifecycle |
| `ui.test.js` | `UIManager` — DOM state, theme switching, modal open/close, year selector, toast notifications, month grid rendering, manual edit modal |
| `ipc-handler.test.js` | `IPCHandler` — `selectFolder()`, `updatePath()`, `syncNow()`, `syncYear()`, `syncMonth()`, `saveManualEdit()`, status/progress UI updates, browser REST fallback paths |
| `i18n.test.js` | `I18n` — translation lookup (`t()`), variable interpolation, `setLang()`, RTL direction application, `apply()` DOM mutations, `formatMonth()` |
| `ingest.test.js` | Ingestion pipeline — PDF parsing, OCR fallback, Hebrew/English month detection, incremental caching, `forceYear`/`forceMonth` scoping |

Run a single file:
```bash
npx vitest run test/unit/data.test.js
```

### End-to-End Tests (Playwright)

Located in `test/e2e/e2e.spec.js`. The dev server (`npm run dev`) must be running (the test runner starts it automatically via `webServer` config).

| Test area | What is verified |
|-----------|-----------------|
| Initialization | Dashboard title, KPI cards populated with non-zero values |
| Trend section | Visibility and content of highest/lowest/volatility rows |
| Month grid | Dynamic 12-card grid generation |
| Modals | Monthly drilldown opens and closes correctly |
| Theme switching | Light/Dark toggle applies correct class to `<html>` |
| Year selection | Year dropdown updates displayed data |

## How to Run

```bash
# All unit tests
npm test

# Unit tests in watch mode
npm run test:watch

# E2E tests (install browsers once first)
npx playwright install chromium
npm run test:e2e
```

## Coverage Goal

Full coverage of `DataManager` logic and the primary user journey: data loading → year/month filtering → monthly drilldown modal → manual edit → theme toggle.
