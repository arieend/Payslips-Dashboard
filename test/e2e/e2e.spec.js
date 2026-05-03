const { test, expect } = require('@playwright/test');
const path = require('path');

// Minimal fixture — one year, one month — enough to drive all data-dependent tests.
const FIXTURE_DATA = {
    "2024": [
        {
            month: "2024-01",
            gross: 15000,
            net: 12000,
            total_deductions: 3000,
            earnings: { base: 15000, bonus: 0, overtime: 0 },
            deductions: { tax: 1500, pension: 750, insurance: 750 },
            source_file: "test/fixtures/payslips_source/payslip_2024_01.pdf",
            mtime: 1700000000
        }
    ]
};

test.describe('Payslip Dashboard E2E', () => {

    test.beforeEach(async ({ page }) => {
        // Inject fixture data before the page loads so the Dynamic Script Loader
        // finds window.PAYSLIP_DATA defined and DataManager initialises with data.
        await page.addInitScript((data) => {
            window.PAYSLIP_DATA = data;
        }, FIXTURE_DATA);

        const filePath = `file://${path.resolve(__dirname, '../../index.html')}`;
        await page.goto(filePath);

        // Wait for the app to finish initialising with data before each test.
        await expect(page.locator('#allYearsContent')).not.toHaveClass(/hidden/, { timeout: 10000 });
    });

    test('should load the dashboard with correct default title', async ({ page }) => {
        await expect(page.locator('#mainTitle')).toContainText('Lifetime Payslip Summary');
    });

    test('should show lifetime KPI cards', async ({ page }) => {
        // Summary KPIs live in #summary-gross, not #kpi-gross (which is the yearly view).
        await expect(page.locator('#summary-gross .kpi-label')).toContainText('Lifetime Gross');
        await expect(page.locator('#summary-gross .kpi-value')).not.toHaveText('₪0.00');
    });

    test('should show historical archives grid', async ({ page }) => {
        const yearCards = page.locator('.year-card');
        await expect(yearCards.first()).toBeVisible();
        expect(await yearCards.count()).toBeGreaterThan(0);
    });

    test('should navigate to 2024 via year card and back', async ({ page }) => {
        const yearCard2024 = page.locator('.year-card', { hasText: '2024' }).first();
        await expect(yearCard2024).toBeVisible();
        await yearCard2024.click();
        await expect(page.locator('#mainTitle')).toContainText('2024 Payslip Overview');
        await expect(page.locator('#allYearsContent')).toHaveClass(/hidden/);

        await page.locator('#backToSummary').click();
        await expect(page.locator('#mainTitle')).toContainText('Lifetime Payslip Summary');
        await expect(page.locator('#allYearsContent')).not.toHaveClass(/hidden/);
    });

    test('should be able to perform yearly data checks after selection', async ({ page }) => {
        // Select by value rather than fragile index — year keys match option values.
        await page.locator('#yearSelect').selectOption('2024');

        const highestMonth = page.locator('#trend-highest .value');
        await expect(highestMonth).not.toHaveText('...', { timeout: 10000 });
        await expect(highestMonth).toContainText('₪');

        const monthCards = page.locator('.month-card');
        await expect(monthCards.first()).toBeVisible();
        expect(await monthCards.count()).toBeGreaterThan(0);
    });

    test('should toggle dark mode', async ({ page }) => {
        // #themeSwitch is a CSS-hidden <input> inside <label class="switch">.
        // Click the label (the visible toggle) rather than the hidden checkbox.
        await page.locator('label.switch').click();
        await expect(page.locator('body')).toHaveClass(/dark-mode/);

        await page.locator('label.switch').click();
        await expect(page.locator('body')).toHaveClass(/light-mode/);
    });

});
