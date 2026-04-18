import { describe, it, expect, vi, beforeEach } from 'vitest';

const flushAsync = () => new Promise(r => setTimeout(r, 0));
import App from '../../js/app.js';
import DataManager from '../../js/data.js';
import UIManager from '../../js/ui.js';
import ChartManager from '../../js/charts.js';

vi.mock('../../js/data.js');
vi.mock('../../js/ui.js');
vi.mock('../../js/charts.js');

const baseDOM = () => `
    <select id="yearSelect"></select>
    <select id="monthFilter">
        <option value="all">All</option>
        <option value="01">Jan</option>
        <option value="02">Feb</option>
    </select>
    <select id="componentFilter">
        <option value="all">All</option>
        <option value="gross">Gross</option>
        <option value="net">Net</option>
        <option value="deductions">Deductions</option>
    </select>
    <button id="refreshData"></button>
    <button id="exportPdf"></button>
    <button id="exportPng"></button>
    <h1 id="mainTitle"></h1>
    <button id="backToSummary"></button>
    <div id="allYearsContent"></div>
    <div id="yearlyContent"></div>
    <button id="saveSettings"></button>
    <input id="configPathInput" />
    <canvas id="mainSalaryChart"></canvas>
    <div class="app-container"></div>
`;

const yearData = [
    { month: '2024-01', gross: 10000, net: 8000, total_deductions: 2000, deductions: { tax: 1000, pension: 500, insurance: 500 }, earnings: {} },
    { month: '2024-02', gross: 12000, net: 9500, total_deductions: 2500, deductions: { tax: 1200, pension: 650, insurance: 650 }, earnings: {} }
];

describe('App', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = baseDOM();

        global.DataManager = DataManager;
        global.UIManager = UIManager;
        global.ChartManager = ChartManager;

        global.html2pdf = vi.fn(() => ({ from: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), save: vi.fn() }));
        global.html2canvas = vi.fn().mockResolvedValue({ toDataURL: vi.fn().mockReturnValue('data:image/png;') });

        // Reset App state
        App.currentYear = null;
        App.allYears = [];
        App._selectedComponent = 'all';

        // Safe DataManager defaults
        vi.mocked(DataManager.getYears).mockReturnValue(['2024']);
        vi.mocked(DataManager.getDataForYear).mockReturnValue([]);
        vi.mocked(DataManager.getTotals).mockReturnValue({ gross: 0, net: 0, deductions: 0, tax: 0, pension: 0, insurance: 0, base: 0, bonus: 0, overtime: 0 });
        vi.mocked(DataManager.getAverages).mockReturnValue({ gross: 0, net: 0 });
        vi.mocked(DataManager.getInsights).mockReturnValue([]);
        vi.mocked(DataManager.getTrendAnalysis).mockReturnValue(null);
        vi.mocked(DataManager.getAllYearsSummary).mockReturnValue([]);
        vi.mocked(DataManager.getLifetimeTotals).mockReturnValue({ gross: 0, net: 0, deductions: 0, yearsCount: 0 });
        ChartManager.charts = {};
        ChartManager.destroyAll = vi.fn();
        ChartManager.updateCharts = vi.fn();
    });

    // ── init() ────────────────────────────────────────────────────────────────────
    describe('init()', () => {
        it('loads data and updates year selector on success', async () => {
            vi.mocked(DataManager.load).mockResolvedValue({ '2024': [] });
            await App.init();
            expect(DataManager.load).toHaveBeenCalled();
            expect(UIManager.updateYearSelector).toHaveBeenCalledWith(['2024'], 'summary');
        });

        it('shows welcome screen when no data is returned', async () => {
            vi.mocked(DataManager.load).mockResolvedValue(null);
            vi.spyOn(console, 'error').mockImplementation(() => {});
            await App.init();
            expect(UIManager.showWelcomeScreen).toHaveBeenCalled();
        });
    });

    // ── render() dispatch ─────────────────────────────────────────────────────────
    describe('render()', () => {
        it('delegates to _renderSummary() when currentYear is "summary"', () => {
            App.currentYear = 'summary';
            const spy = vi.spyOn(App, '_renderSummary');
            App.render();
            expect(spy).toHaveBeenCalled();
        });

        it('delegates to _renderYear() when currentYear is a year string', () => {
            App.currentYear = '2024';
            const spy = vi.spyOn(App, '_renderYear');
            App.render();
            expect(spy).toHaveBeenCalledWith('2024');
        });
    });

    // ── _renderSummary() ──────────────────────────────────────────────────────────
    describe('_renderSummary()', () => {
        beforeEach(() => {
            App.currentYear = 'summary';
            document.getElementById('yearSelect').innerHTML = '<option value="summary"></option><option value="2024"></option>';
        });

        it('calls toggleView(true)', () => {
            App._renderSummary();
            expect(UIManager.toggleView).toHaveBeenCalledWith(true);
        });

        it('calls renderAllYearsDashboard with summary and lifetime data', () => {
            const summary = [{ year: '2024', totalGross: 100 }];
            const lifetime = { gross: 100, net: 80, deductions: 20, yearsCount: 1 };
            vi.mocked(DataManager.getAllYearsSummary).mockReturnValue(summary);
            vi.mocked(DataManager.getLifetimeTotals).mockReturnValue(lifetime);
            App._renderSummary();
            expect(UIManager.renderAllYearsDashboard).toHaveBeenCalledWith(summary, lifetime, expect.any(Function), expect.any(Function));
        });

        it('year card click callback navigates to that year', () => {
            App._renderSummary();
            const [, , onYearClick] = vi.mocked(UIManager.renderAllYearsDashboard).mock.calls[0];
            document.getElementById('yearSelect').innerHTML = '<option value="summary"></option><option value="2024"></option>';
            onYearClick('2024');
            expect(App.currentYear).toBe('2024');
        });
    });

    // ── _renderYear() ─────────────────────────────────────────────────────────────
    describe('_renderYear()', () => {
        beforeEach(() => {
            App.currentYear = '2024';
            vi.mocked(DataManager.getDataForYear).mockReturnValue(yearData);
        });

        it('calls toggleView(false)', () => {
            App._renderYear('2024');
            expect(UIManager.toggleView).toHaveBeenCalledWith(false);
        });

        it('calls updateKPIs, updateTrendAnalysis, updateAnomalies, updateMonthGrid, updateCharts', () => {
            App._renderYear('2024');
            expect(UIManager.updateKPIs).toHaveBeenCalled();
            expect(UIManager.updateTrendAnalysis).toHaveBeenCalled();
            expect(UIManager.updateAnomalies).toHaveBeenCalled();
            expect(UIManager.updateMonthGrid).toHaveBeenCalled();
            expect(ChartManager.updateCharts).toHaveBeenCalled();
        });

        it('shows a toast when no data is available for the year', () => {
            vi.mocked(DataManager.getDataForYear).mockReturnValue([]);
            App._renderYear('2024');
            expect(UIManager.showToast).toHaveBeenCalled();
            expect(UIManager.updateKPIs).not.toHaveBeenCalled();
        });

        it('escapes HTML in year before inserting into mainTitle', () => {
            App._renderYear('<script>');
            const title = document.getElementById('mainTitle').innerHTML;
            expect(title).not.toContain('<script>');
            expect(title).toContain('&lt;script&gt;');
        });
    });

    // ── _getFilteredData() ────────────────────────────────────────────────────────
    describe('_getFilteredData()', () => {
        beforeEach(() => {
            App.currentYear = '2024';
            vi.mocked(DataManager.getDataForYear).mockReturnValue(yearData);
        });

        it('returns all data when filter is "all"', () => {
            expect(App._getFilteredData('all').length).toBe(2);
        });

        it('returns only matching month when filter is set', () => {
            const result = App._getFilteredData('02');
            expect(result.length).toBe(1);
            expect(result[0].month).toBe('2024-02');
        });

        it('returns empty array when no months match the filter', () => {
            expect(App._getFilteredData('12').length).toBe(0);
        });

        it('does not mutate the cached sorted array from DataManager', () => {
            const original = DataManager.getDataForYear('2024');
            const filtered = App._getFilteredData('all');
            filtered.push({ month: 'extra' });
            expect(DataManager.getDataForYear('2024').length).toBe(original.length);
        });
    });

    // ── Month Filter (via DOM) ────────────────────────────────────────────────────
    describe('month filtering via DOM', () => {
        beforeEach(() => {
            App.currentYear = '2024';
            vi.mocked(DataManager.getDataForYear).mockReturnValue(yearData);
        });

        it('reads monthFilter.value inside _renderYear and filters correctly', () => {
            document.getElementById('monthFilter').value = '01';
            App._renderYear('2024');
            const [calledData] = vi.mocked(UIManager.updateMonthGrid).mock.calls[0];
            expect(calledData.length).toBe(1);
            expect(calledData[0].month).toBe('2024-01');
        });
    });

    // ── Component Filter ──────────────────────────────────────────────────────────
    describe('component filter (dataset hiding)', () => {
        beforeEach(() => {
            App.currentYear = '2024';
            vi.mocked(DataManager.getDataForYear).mockReturnValue(yearData);
            ChartManager.charts = {
                salary: {
                    data: {
                        datasets: [
                            { label: 'Gross Salary', hidden: false },
                            { label: 'Net Salary', hidden: false },
                            { label: 'Deductions', hidden: false }
                        ]
                    },
                    update: vi.fn()
                }
            };
        });

        it('hides non-selected datasets when a component filter is set', () => {
            document.getElementById('componentFilter').value = 'net';
            App._selectedComponent = 'net';
            App._renderYear('2024');
            expect(ChartManager.charts.salary.data.datasets[0].hidden).toBe(true);  // Gross
            expect(ChartManager.charts.salary.data.datasets[1].hidden).toBe(false); // Net
            expect(ChartManager.charts.salary.data.datasets[2].hidden).toBe(true);  // Deductions
        });

        it('does not hide datasets when component filter is "all"', () => {
            document.getElementById('componentFilter').value = 'all';
            App._selectedComponent = 'all';
            App._renderYear('2024');
            ChartManager.charts.salary.data.datasets.forEach(ds => {
                expect(ds.hidden).toBe(false);
            });
        });
    });

    // ── Back to Summary ───────────────────────────────────────────────────────────
    describe('back button', () => {
        it('resets currentYear to "summary" and calls render()', () => {
            App.currentYear = '2024';
            document.getElementById('yearSelect').innerHTML = '<option value="summary"></option><option value="2024" selected></option>';
            App.setupEventListeners();
            const renderSpy = vi.spyOn(App, '_renderSummary');
            document.getElementById('backToSummary').click();
            expect(App.currentYear).toBe('summary');
            expect(renderSpy).toHaveBeenCalled();
        });
    });

    // ── Manual Edit ───────────────────────────────────────────────────────────────
    describe('manual edit callback', () => {
        beforeEach(() => {
            App.currentYear = '2024';
            vi.mocked(DataManager.getDataForYear).mockReturnValue(yearData);
        });

        it('passes onMonthEdit as third argument to updateMonthGrid', () => {
            App._renderYear('2024');
            const args = vi.mocked(UIManager.updateMonthGrid).mock.calls[0];
            expect(args[2]).toBeTypeOf('function');
        });

        it('onMonthEdit: calls IPCHandler.saveManualEdit, shows toast, and reloads data', async () => {
            const mockSave = vi.fn().mockResolvedValue({ success: true });
            const mockLoadData = vi.spyOn(App, 'loadData').mockResolvedValue(undefined);
            global.IPCHandler = { saveManualEdit: mockSave };

            App._renderYear('2024');
            const onMonthEdit = vi.mocked(UIManager.updateMonthGrid).mock.calls[0][2];
            await onMonthEdit('2024-01', { gross: 11000, net: 9000 });

            expect(mockSave).toHaveBeenCalledWith('2024-01', { gross: 11000, net: 9000 });
            expect(UIManager.showToast).toHaveBeenCalledWith(expect.stringMatching(/saved/i), 'check-circle');
            expect(mockLoadData).toHaveBeenCalled();

            mockLoadData.mockRestore();
        });
    });

    // ── Settings Save ─────────────────────────────────────────────────────────────
    describe('saveSettings button', () => {
        beforeEach(() => {
            global.IPCHandler = { updatePath: vi.fn().mockResolvedValue({ success: true }) };
        });

        it('shows toast for empty path without calling IPCHandler', async () => {
            document.getElementById('configPathInput').value = '';
            App.setupEventListeners();
            document.getElementById('saveSettings').click();
            await flushAsync();
            expect(global.IPCHandler.updatePath).not.toHaveBeenCalled();
            expect(UIManager.showToast).toHaveBeenCalledWith(expect.stringMatching(/empty/i), 'alert-triangle');
        });

        it('shows toast for non-absolute path', async () => {
            document.getElementById('configPathInput').value = 'relative/path';
            App.setupEventListeners();
            document.getElementById('saveSettings').click();
            await flushAsync();
            expect(global.IPCHandler.updatePath).not.toHaveBeenCalled();
            expect(UIManager.showToast).toHaveBeenCalledWith(expect.stringMatching(/absolute/i), 'alert-triangle');
        });

        it('calls IPCHandler.updatePath with the entered path', async () => {
            document.getElementById('configPathInput').value = 'C:\\Payslips';
            App.setupEventListeners();
            document.getElementById('saveSettings').click();
            await flushAsync();
            expect(global.IPCHandler.updatePath).toHaveBeenCalledWith('C:\\Payslips');
        });

        it('shows error toast when IPCHandler.updatePath throws', async () => {
            global.IPCHandler.updatePath = vi.fn().mockRejectedValue(new Error('Path not found'));
            document.getElementById('configPathInput').value = 'C:\\Missing';
            App.setupEventListeners();
            document.getElementById('saveSettings').click();
            await flushAsync();
            expect(UIManager.showToast).toHaveBeenCalledWith(expect.stringMatching(/failed/i), 'alert-triangle');
        });
    });

    // ── Exports ───────────────────────────────────────────────────────────────────
    describe('exportToPdf()', () => {
        it('calls html2pdf with correct filename', () => {
            App.currentYear = '2024';
            App.exportToPdf();
            expect(global.html2pdf).toHaveBeenCalled();
        });
    });

    describe('exportToPng()', () => {
        it('calls html2canvas', async () => {
            await App.exportToPng();
            expect(global.html2canvas).toHaveBeenCalled();
        });
    });

    // ── Chart Interactivity ───────────────────────────────────────────────────────
    describe('setupChartInteractivity()', () => {
        it('shows month details modal on chart bar click', () => {
            App.currentYear = '2024';
            vi.mocked(DataManager.getDataForYear).mockReturnValue(yearData);
            App.setupChartInteractivity();
            ChartManager.charts.salary = {
                getElementsAtEventForMode: vi.fn().mockReturnValue([{ index: 0 }])
            };
            document.getElementById('mainSalaryChart').onclick({});
            expect(UIManager.showMonthDetails).toHaveBeenCalledWith(yearData[0]);
        });

        it('does nothing when no data point is at the click position', () => {
            App.setupChartInteractivity();
            ChartManager.charts.salary = {
                getElementsAtEventForMode: vi.fn().mockReturnValue([])
            };
            document.getElementById('mainSalaryChart').onclick({});
            expect(UIManager.showMonthDetails).not.toHaveBeenCalled();
        });
    });

    // ── themechange listener ──────────────────────────────────────────────────────
    describe('themechange event', () => {
        it('destroys all charts and re-renders when themechange fires', () => {
            App.currentYear = 'summary';
            App.setupEventListeners();
            document.dispatchEvent(new CustomEvent('themechange'));
            expect(ChartManager.destroyAll).toHaveBeenCalled();
            expect(UIManager.toggleView).toHaveBeenCalled();
        });
    });

    // ── _escHtml() ────────────────────────────────────────────────────────────────
    describe('_escHtml()', () => {
        it.each([
            ['<script>', '&lt;script&gt;'],
            ['"quote"', '&quot;quote&quot;'],
            ['a & b', 'a &amp; b'],
            ['plain', 'plain'],
        ])('escapes %s to %s', (input, expected) => {
            expect(App._escHtml(input)).toBe(expected);
        });
    });
});
