const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Payslip Dashboard E2E', () => {

    test.beforeEach(async ({ page }) => {
        const filePath = `file://${path.resolve(__dirname, '../../index.html')}`;
        await page.goto(filePath);
    });

    test('should load the dashboard with correct default title', async ({ page }) => {
        const title = page.locator('#mainTitle');
        await expect(title).toContainText('Lifetime Payslip Summary');
    });

    test('should show lifetime KPI cards', async ({ page }) => {
        await expect(page.locator('#kpi-gross .kpi-label')).toContainText('Lifetime Gross');
        const grossValue = page.locator('#kpi-gross .kpi-value');
        await expect(grossValue).not.toHaveText('₪0.00');
    });

    test('should show historical archives grid', async ({ page }) => {
        const yearCards = page.locator('.year-card');
        const count = await yearCards.count();
        expect(count).toBeGreaterThan(0);
    });

    test('should navigate to 2024 via year card and back', async ({ page }) => {
        const yearCard2024 = page.locator('.year-card', { hasText: '2024' }).first();
        if (await yearCard2024.isVisible()) {
            await yearCard2024.click();
            await expect(page.locator('#mainTitle')).toContainText('2024 Payslip Overview');
            await expect(page.locator('#allYearsContent')).toHaveClass(/hidden/);
            
            const backBtn = page.locator('#backToSummary');
            await backBtn.click();
            await expect(page.locator('#mainTitle')).toContainText('Lifetime Payslip Summary');
            await expect(page.locator('#allYearsContent')).not.toHaveClass(/hidden/);
        }
    });

    test('should be able to perform yearly data checks after selection', async ({ page }) => {
        // Navigate to a specific year first
        const yearSelect = page.locator('#yearSelect');
        await yearSelect.selectOption({ index: 1 }); // Select first year option after 'summary'
        
        const highestMonth = page.locator('#trend-highest .value');
        await expect(highestMonth).not.toHaveText('...', { timeout: 10000 });
        await expect(highestMonth).toContainText('₪');

        const monthCards = page.locator('.month-card');
        const count = await monthCards.count();
        expect(count).toBeGreaterThan(0);
    });

    test('should toggle dark mode', async ({ page }) => {
        const themeSwitch = page.locator('#themeSwitch');
        await themeSwitch.check();
        await expect(page.locator('body')).toHaveClass(/dark-mode/);
        
        await themeSwitch.uncheck();
        await expect(page.locator('body')).toHaveClass(/light-mode/);
    });

});
