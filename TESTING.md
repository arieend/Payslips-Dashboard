# Testing Strategy

The Payslip Infographic Generator uses a multi-layered testing strategy to ensuring 100% functionality and data accuracy.

## Test Layers

### Unit Tests (Vitest)
Located in `test/unit/`.

| File | Scope |
|------|-------|
| `data.test.js` | `DataManager` — `getYears()`, `getTotals()`, `getAverages()`, `getInsights()`, `getTrendAnalysis()` |
| `app.test.js` | `App` — wiring of DataManager → ChartManager → UIManager, first-run logic |
| `charts.test.js` | `ChartManager` — Chart.js instance creation and update lifecycle |
| `ui.test.js` | `UIManager` — DOM state, theme switching, modal open/close, year selector |
| `ingest.test.js` | Ingestion pipeline — PDF parsing, OCR fallback, month detection, incremental caching |

To run a single file:
```bash
npx vitest run test/unit/data.test.js
```

### End-to-End Tests (Playwright)
Located in `test/e2e/e2e.spec.js`.
- **Scope**: Frontend interactions, UI state, and visual elements.
- **Key Tests**:
  - Dashboard initialization and title verification.
  - KPI card population with non-zero values.
  - Visibility and content of the Trend Analysis section.
  - Dynamic generation of the 12-month drilldown grid.
  - Modal opening/closing for monthly detailed views.
  - Theme switching (Light/Dark mode) and its application to the DOM.
  - Year selection and subsequent data updates.

## How to Run Tests

### Standard Unit Tests
```bash
npm run test
```

### E2E Tests
Requires Playwright browsers to be installed.
```bash
npx playwright install chromium
npm run test:e2e
```

## Coverage Goal
The goal is to provide 100% code coverage for the `DataManager` logic and full coverage of the primary user journey (Loading, Filtering, Detailed View, Theme Toggle).
