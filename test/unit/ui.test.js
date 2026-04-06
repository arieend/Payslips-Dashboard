import { describe, it, expect, vi, beforeEach } from 'vitest';
import UIManager from '../../js/ui.js';

describe('UIManager Logical Coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        if (UIManager._clearCache) UIManager._clearCache();
        
        document.body.innerHTML = `
            <div id="drilldownModal" class="hidden">
                <div id="modalBody"></div>
            </div>
            <select id="yearSelect"></select>
            <h1 id="mainTitle"></h1>
            <div id="anomalies-list"></div>
            <div id="monthCards"></div>
            <div id="allYearsContent"></div>
            <div id="yearlyContent"></div>
            <button id="backToSummary"></button>
            <div id="yearCardsGrid"></div>
            <div id="appToast" class="toast">
                <i data-lucide="check-circle" style="width:1rem;"></i>
                <span class="toast-msg"></span>
            </div>
            <div id="trend-highest"><div class="value"></div></div>
            <div id="trend-lowest"><div class="value"></div></div>
            <div id="trend-change"><div class="value"></div></div>
            <div id="kpi-gross"><div class="kpi-value"></div></div>
            <div id="kpi-net"><div class="kpi-value"></div></div>
            <div id="kpi-deductions"><div class="kpi-value"></div></div>
            <div id="kpi-avg"><div class="kpi-value"></div></div>
            <div id="settingsModal" class="hidden">
                <input id="configPathInput" />
                <button class="close-settings"></button>
                <div id="currentActivePath"></div>
                <button id="browsePathBtn"></button>
            </div>
            <button id="openSettings"></button>
            <input type="checkbox" id="themeSwitch" />
        `;
        global.lucide = { createIcons: vi.fn() };
    });

    describe('updateKPIs()', () => {
        it('should format and display KPI values correctly', () => {
            UIManager.updateKPIs(
                { gross: 10000, net: 8000, deductions: 2000, tax: 1000, pension: 500, insurance: 500 },
                { net: 8000 }
            );
            expect(document.querySelector('#kpi-gross .kpi-value').textContent).toBe('₪10,000');
            expect(document.querySelector('#kpi-net .kpi-value').textContent).toBe('₪8,000');
            expect(document.querySelector('#kpi-deductions .kpi-value').textContent).toBe('₪2,000');
        });
    });

    describe('updateYearSelector()', () => {
        it('should populate select and set current year', () => {
            UIManager.updateYearSelector(["2024", "2023"], "2024");
            const select = document.getElementById('yearSelect');
            expect(select.children.length).toBe(3);
            expect(select.value).toBe("2024");
            expect(document.getElementById('mainTitle').textContent).toContain("2024");
        });
    });

    describe('Insights & Trends', () => {
        it('updateTrendAnalysis(): should render formatted text', () => {
            UIManager.updateTrendAnalysis({
                highest: { month: '2024-03', net: 10000 },
                lowest: { month: '2024-01', net: 8000 },
                change: { pct: 25.4 }
            });
            expect(document.getElementById('trend-highest').textContent).toContain('10,000');
            expect(global.lucide.createIcons).toHaveBeenCalled();
        });

        it('updateAnomalies(): should create anomaly list items', () => {
            UIManager.updateAnomalies([{ type: 'alert', title: 'Test Alert', icon: 'zap', text: 'Boom' }]);
            const items = document.querySelectorAll('.anomaly-item');
            expect(items.length).toBe(1);
            expect(items[0].textContent).toContain('Test Alert');
        });
    });

    describe('Month Grid & Modal', () => {
        it('updateMonthGrid(): should create month cards', () => {
            UIManager.updateMonthGrid([{ month: '2024-03', gross: 1000, net: 800, deductions: {tax:10,pension:5,insurance:5}, source_file: 'f.pdf' }]);
            const grid = document.getElementById('monthCards');
            expect(grid.children.length).toBe(1);
        });

        it('showMonthDetails(): should fill modal with month data', () => {
            const data = { 
                month: '2024-03', gross: 100, net: 80, source_file: 'f.pdf',
                deductions: { tax: 10, pension: 5, insurance: 5 },
                raw_text: 'Expected Raw Content' 
            };
            UIManager.showMonthDetails(data);
            const modal = document.getElementById('drilldownModal');
            expect(modal.classList.contains('hidden')).toBe(false);
            expect(document.getElementById('rawContentArea').textContent).toBe('Expected Raw Content');
        });

        it('closeModal(): should hide modal', () => {
            const modal = document.getElementById('drilldownModal');
            modal.classList.remove('hidden');
            UIManager.closeModal();
            expect(modal.classList.contains('hidden')).toBe(true);
        });
    });

    describe('_formatMonth()', () => {
        it('should format ISO months correctly', () => {
            expect(UIManager._formatMonth('2024-03')).toBe('March');
        });
    });

    describe('Settings & Welcome', () => {
        it('openSettings(): should load paths', () => {
            global.window.APP_CONFIG = { parentDirectoryPath: '/test/path' };
            UIManager.openSettings();
            expect(document.getElementById('configPathInput').value).toBe('/test/path');
        });

        it('showWelcomeScreen(): should render select folder prompt', () => {
            UIManager.showWelcomeScreen();
            expect(document.getElementById('yearCardsGrid').innerHTML).toContain('Select Folder');
        });
    });
});
