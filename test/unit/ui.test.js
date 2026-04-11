import { describe, it, expect, vi, beforeEach } from 'vitest';
import UIManager from '../../js/ui.js';

const baseDOM = () => `
    <div id="drilldownModal" class="hidden"><div id="modalBody"></div></div>
    <div id="editModal" class="hidden">
        <h3 id="editModalTitle"></h3>
        <div id="editModalBody"></div>
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

describe('UIManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        if (UIManager._clearCache) UIManager._clearCache();
        document.body.innerHTML = baseDOM();
        global.lucide = { createIcons: vi.fn() };
    });

    // ── KPIs ─────────────────────────────────────────────────────────────────────
    describe('updateKPIs()', () => {
        it('formats and displays all KPI values', () => {
            UIManager.updateKPIs(
                { gross: 10000, net: 8000, deductions: 2000 },
                { gross: 10000, net: 8000 }
            );
            expect(document.querySelector('#kpi-gross .kpi-value').textContent).toBe('₪10,000');
            expect(document.querySelector('#kpi-net .kpi-value').textContent).toBe('₪8,000');
            expect(document.querySelector('#kpi-deductions .kpi-value').textContent).toBe('₪2,000');
            expect(document.querySelector('#kpi-avg .kpi-value').textContent).toBe('₪8,000');
        });
    });

    // ── Year Selector ─────────────────────────────────────────────────────────────
    describe('updateYearSelector()', () => {
        it('populates select with summary + year options and marks current', () => {
            UIManager.updateYearSelector(['2024', '2023'], '2024');
            const select = document.getElementById('yearSelect');
            expect(select.children.length).toBe(3); // summary + 2 years
            expect(select.value).toBe('2024');
        });

        it('sets mainTitle text to the current year', () => {
            UIManager.updateYearSelector(['2024'], '2024');
            expect(document.getElementById('mainTitle').textContent).toContain('2024');
        });

        it('uses summary label when currentYear is "summary"', () => {
            UIManager.updateYearSelector(['2024'], 'summary');
            const title = document.getElementById('mainTitle');
            expect(title.textContent).toContain('Summary');
        });
    });

    // ── Trend Analysis ────────────────────────────────────────────────────────────
    describe('updateTrendAnalysis()', () => {
        it('renders highest and lowest month with values', () => {
            UIManager.updateTrendAnalysis({
                highest: { month: '2024-03', net: 10000 },
                lowest: { month: '2024-01', net: 8000 },
                change: { pct: 25.4 }
            });
            expect(document.getElementById('trend-highest').textContent).toContain('10,000');
            expect(document.getElementById('trend-lowest').textContent).toContain('8,000');
        });

        it('calls refreshIcons after rendering', () => {
            UIManager.updateTrendAnalysis({
                highest: { month: '2024-01', net: 1000 },
                lowest: { month: '2024-01', net: 1000 },
                change: { pct: 0 }
            });
            expect(global.lucide.createIcons).toHaveBeenCalled();
        });

        it('does nothing when trend is null', () => {
            // Should not throw
            expect(() => UIManager.updateTrendAnalysis(null)).not.toThrow();
        });
    });

    // ── Anomalies ─────────────────────────────────────────────────────────────────
    describe('updateAnomalies()', () => {
        const structuredInsights = [
            {
                type: 'alert',
                icon: 'alert-triangle',
                titleKey: 'insightSpikeTitle',
                textKey: 'insightSpikeText',
                textData: { month: '2024-02' }
            },
            {
                type: 'info',
                icon: 'zap',
                titleKey: 'insightFluctuationTitle',
                textKey: 'insightFluctuationText',
                textData: { pct: '+100.0', fromMonth: '2024-01', toMonth: '2024-02' }
            }
        ];

        it('creates one .anomaly-item per insight', () => {
            UIManager.updateAnomalies(structuredInsights);
            expect(document.querySelectorAll('.anomaly-item').length).toBe(2);
        });

        it('applies type as CSS class on each item', () => {
            UIManager.updateAnomalies(structuredInsights);
            const items = document.querySelectorAll('.anomaly-item');
            expect(items[0].classList.contains('alert')).toBe(true);
            expect(items[1].classList.contains('info')).toBe(true);
        });

        it('renders title via i18n key (falls back to key when I18n absent)', () => {
            UIManager.updateAnomalies([structuredInsights[0]]);
            const item = document.querySelector('.anomaly-item');
            // Title span textContent should contain the key or translated string — never HTML tags
            expect(item.querySelector('span').textContent).not.toMatch(/<[a-z]/i);
            expect(item.querySelector('span').textContent.length).toBeGreaterThan(0);
        });

        it('renders body text without any HTML markup', () => {
            UIManager.updateAnomalies(structuredInsights);
            document.querySelectorAll('.anomaly-item p').forEach(p => {
                expect(p.textContent).not.toMatch(/<[a-z]/i);
                expect(p.innerHTML).not.toMatch(/<b>/i);
            });
        });

        it('clears previous insights before rendering new ones', () => {
            UIManager.updateAnomalies(structuredInsights);
            UIManager.updateAnomalies([structuredInsights[0]]);
            expect(document.querySelectorAll('.anomaly-item').length).toBe(1);
        });

        it('renders empty list without error', () => {
            expect(() => UIManager.updateAnomalies([])).not.toThrow();
            expect(document.querySelectorAll('.anomaly-item').length).toBe(0);
        });
    });

    // ── Month Grid ────────────────────────────────────────────────────────────────
    describe('updateMonthGrid()', () => {
        const sampleMonth = {
            month: '2024-03', gross: 1000, net: 800,
            total_deductions: 200, deductions: { tax: 100, pension: 60, insurance: 40 },
            source_file: 'f.pdf'
        };

        it('creates one card per month entry', () => {
            UIManager.updateMonthGrid([sampleMonth]);
            expect(document.getElementById('monthCards').children.length).toBe(1);
        });

        it('renders Edit and Refresh buttons per card', () => {
            UIManager.updateMonthGrid([sampleMonth]);
            expect(document.querySelector('.card-edit-btn')).not.toBeNull();
            expect(document.querySelector('.card-refresh-btn')).not.toBeNull();
        });

        it('calls onMonthRefresh with (monthObject, btn) when Refresh clicked', () => {
            const onRefresh = vi.fn();
            UIManager.updateMonthGrid([sampleMonth], onRefresh, null);
            document.querySelector('.card-refresh-btn').click();
            expect(onRefresh).toHaveBeenCalledWith(sampleMonth, expect.any(HTMLElement));
        });

        it('opens edit modal when Edit button is clicked', () => {
            const onEdit = vi.fn();
            UIManager.updateMonthGrid([sampleMonth], null, onEdit);
            document.querySelector('.card-edit-btn').click();
            expect(document.getElementById('editModal').classList.contains('hidden')).toBe(false);
        });

        it('adds parse-failed class for months with zero gross and net', () => {
            UIManager.updateMonthGrid([{ ...sampleMonth, gross: 0, net: 0 }]);
            expect(document.querySelector('.month-card').classList.contains('parse-failed')).toBe(true);
        });
    });

    // ── Month Details Modal ───────────────────────────────────────────────────────
    describe('showMonthDetails()', () => {
        const monthData = {
            month: '2024-03', gross: 100, net: 80, source_file: 'f.pdf',
            deductions: { tax: 10, pension: 5, insurance: 5 },
            raw_text: 'Expected Raw Content'
        };

        it('opens the drilldown modal', () => {
            UIManager.showMonthDetails(monthData);
            expect(document.getElementById('drilldownModal').classList.contains('hidden')).toBe(false);
        });

        it('fills raw text area with raw_text content', () => {
            UIManager.showMonthDetails(monthData);
            expect(document.getElementById('rawContentArea').textContent).toBe('Expected Raw Content');
        });

        it('displays gross and net values in parsed summary grid', () => {
            UIManager.showMonthDetails(monthData, true);
            expect(document.getElementById('detailGross').textContent).toBe('₪100');
            expect(document.getElementById('detailNet').textContent).toBe('₪80');
        });

        it('closeModal() hides the drilldown modal', () => {
            UIManager.showMonthDetails(monthData);
            UIManager.closeModal();
            expect(document.getElementById('drilldownModal').classList.contains('hidden')).toBe(true);
        });
    });

    // ── Edit Modal ────────────────────────────────────────────────────────────────
    describe('showEditModal()', () => {
        const monthData = {
            month: '2024-03', gross: 15000, net: 12000, total_deductions: 3000,
            deductions: { tax: 1500, pension: 750, insurance: 750 }
        };

        it('opens the edit modal', () => {
            UIManager.showEditModal(monthData, vi.fn());
            expect(document.getElementById('editModal').classList.contains('hidden')).toBe(false);
        });

        it('pre-fills all input fields with current month data', () => {
            UIManager.showEditModal(monthData, vi.fn());
            expect(document.getElementById('editGross').value).toBe('15000');
            expect(document.getElementById('editNet').value).toBe('12000');
            expect(document.getElementById('editTax').value).toBe('1500');
            expect(document.getElementById('editPension').value).toBe('750');
            expect(document.getElementById('editInsurance').value).toBe('750');
        });

        it('includes the month name in the modal title', () => {
            UIManager.showEditModal(monthData, vi.fn());
            expect(document.getElementById('editModalTitle').textContent).toContain('March');
        });

        it('calls onSave with correct updates on Save click', async () => {
            const onSave = vi.fn().mockResolvedValue(undefined);
            UIManager.showEditModal({ month: '2024-05', gross: 10000, net: 8000, deductions: { tax: 1000, pension: 500, insurance: 500 } }, onSave);
            document.getElementById('editGross').value = '11000';
            document.getElementById('editNet').value = '9000';
            document.getElementById('editTax').value = '1100';
            document.getElementById('editPension').value = '550';
            document.getElementById('editInsurance').value = '350';
            document.getElementById('editModalSaveBtn').click();
            await new Promise(r => setTimeout(r, 0));
            expect(onSave).toHaveBeenCalledWith('2024-05', {
                gross: 11000, net: 9000, total_deductions: 2000,
                deductions: { tax: 1100, pension: 550, insurance: 350 }
            });
        });

        it('shows a toast and keeps modal open when onSave throws', async () => {
            const onSave = vi.fn().mockRejectedValue(new Error('Server error'));
            UIManager.showEditModal(monthData, onSave);
            document.getElementById('editModalSaveBtn').click();
            await new Promise(r => setTimeout(r, 0));
            expect(document.getElementById('editModal').classList.contains('hidden')).toBe(false);
        });

        it('closeEditModal() hides the edit modal', () => {
            document.getElementById('editModal').classList.remove('hidden');
            UIManager.closeEditModal();
            expect(document.getElementById('editModal').classList.contains('hidden')).toBe(true);
        });
    });

    // ── Toast ─────────────────────────────────────────────────────────────────────
    describe('showToast()', () => {
        it('makes toast visible with correct message', () => {
            UIManager.showToast('Hello toast', 'check-circle');
            const toast = document.getElementById('appToast');
            expect(toast.classList.contains('show')).toBe(true);
            expect(toast.querySelector('.toast-msg').textContent).toBe('Hello toast');
        });

        it('updates icon data-lucide attribute', () => {
            UIManager.showToast('msg', 'alert-triangle');
            expect(document.querySelector('#appToast i').getAttribute('data-lucide')).toBe('alert-triangle');
        });

        it('hideToast() removes the show class', () => {
            UIManager.showToast('msg');
            UIManager.hideToast();
            expect(document.getElementById('appToast').classList.contains('show')).toBe(false);
        });
    });

    // ── Theme change event ────────────────────────────────────────────────────────
    describe('themeSwitch dispatches themechange event', () => {
        it('fires themechange custom event when switch is toggled', () => {
            // Re-trigger DOMContentLoaded listener setup
            document.dispatchEvent(new Event('DOMContentLoaded'));
            const handler = vi.fn();
            document.addEventListener('themechange', handler);
            const themeSwitch = document.getElementById('themeSwitch');
            themeSwitch.checked = true;
            themeSwitch.dispatchEvent(new Event('change'));
            document.removeEventListener('themechange', handler);
            expect(handler).toHaveBeenCalledOnce();
        });

        it('sets body class to dark-mode when switch is checked', () => {
            document.dispatchEvent(new Event('DOMContentLoaded'));
            const themeSwitch = document.getElementById('themeSwitch');
            themeSwitch.checked = true;
            themeSwitch.dispatchEvent(new Event('change'));
            expect(document.body.className).toBe('dark-mode');
        });
    });

    // ── Formatting ────────────────────────────────────────────────────────────────
    describe('_formatMonth()', () => {
        it('formats ISO date string to month name', () => {
            expect(UIManager._formatMonth('2024-03')).toBe('March');
        });

        it('returns original value for non-ISO strings', () => {
            expect(UIManager._formatMonth('2024')).toBe('2024');
        });

        it('returns "N/A" for falsy input', () => {
            expect(UIManager._formatMonth(null)).toBe('N/A');
        });
    });

    // ── Settings ──────────────────────────────────────────────────────────────────
    describe('openSettings()', () => {
        it('pre-fills configPathInput from APP_CONFIG', () => {
            global.window.APP_CONFIG = { parentDirectoryPath: '/test/path' };
            UIManager.openSettings();
            expect(document.getElementById('configPathInput').value).toBe('/test/path');
        });

        it('closeSettings() hides settings modal', () => {
            document.getElementById('settingsModal').classList.remove('hidden');
            UIManager.closeSettings();
            expect(document.getElementById('settingsModal').classList.contains('hidden')).toBe(true);
        });
    });

    // ── Welcome Screen ────────────────────────────────────────────────────────────
    describe('showWelcomeScreen()', () => {
        it('renders the Select Folder prompt', () => {
            UIManager.showWelcomeScreen();
            expect(document.getElementById('yearCardsGrid').innerHTML).toContain('Select Folder');
        });
    });
});
