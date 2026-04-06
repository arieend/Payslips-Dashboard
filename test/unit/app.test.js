import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../../js/app.js';
import DataManager from '../../js/data.js';
import UIManager from '../../js/ui.js';
import ChartManager from '../../js/charts.js';

vi.mock('../../js/data.js');
vi.mock('../../js/ui.js');
vi.mock('../../js/charts.js');

describe('App Orchestrator Logical Coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        global.DataManager = DataManager;
        global.UIManager = UIManager;
        global.ChartManager = ChartManager;
        
        // Basic DOM for App.init() and render()
        document.body.innerHTML = `
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
            </select>
            <button id="exportPdf"></button>
            <button id="exportPng"></button>
            <span id="displayYear"></span>
            <h1 id="mainTitle"></h1>
            <button id="backToSummary"></button>
            <div id="allYearsContent"></div>
            <div id="yearlyContent"></div>
            <div id="saveSettings"></div>
            <input id="configPathInput" />
            <canvas id="mainSalaryChart"></canvas>
            <div class="app-container"></div>
        `;
        
        // Mock external libraries
        global.html2pdf = vi.fn(() => ({
            from: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            save: vi.fn().mockReturnThis()
        }));
        global.html2canvas = vi.fn().mockResolvedValue({
            toDataURL: vi.fn().mockReturnValue('data:image/png;')
        });

        // Safe defaults for DataManager
        vi.mocked(DataManager.getYears).mockReturnValue(["2024"]);
        vi.mocked(DataManager.getDataForYear).mockReturnValue([]);
        vi.mocked(DataManager.getAllYearsSummary).mockReturnValue([]);
        vi.mocked(DataManager.getLifetimeTotals).mockReturnValue({ gross: 0, net: 0, deductions: 0, yearsCount: 0 });
    });

    describe('init()', () => {
        it('should initialize and register events', async () => {
             vi.mocked(DataManager.load).mockResolvedValue({ "2024": [] });
             vi.mocked(DataManager.getYears).mockReturnValue(["2024"]);
             vi.mocked(DataManager.getDataForYear).mockReturnValue([]);
             
             await App.init();
             
             expect(DataManager.load).toHaveBeenCalled();
             expect(UIManager.updateYearSelector).toHaveBeenCalled();
        });

        it('should handle missing data gracefully', async () => {
             vi.mocked(DataManager.load).mockResolvedValue(null);
             const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
             await App.init();
             expect(spy).toHaveBeenCalledWith(expect.stringContaining('No data found'));
        });
    });

    describe('render() & Filtering', () => {
        beforeEach(() => {
            App.currentYear = "2024";
            vi.mocked(DataManager.getDataForYear).mockReturnValue([
                { month: '2024-01', net: 100 },
                { month: '2024-02', net: 200 }
            ]);
            vi.mocked(DataManager.getTotals).mockReturnValue({});
            vi.mocked(DataManager.getAverages).mockReturnValue({});
            ChartManager.charts = { salary: { 
                 data: { datasets: [{ label: 'Gross Salary', hidden: false }] },
                 update: vi.fn()
            }};
        });

        it('should render all modules with filtered data', () => {
            App.render();
            expect(UIManager.updateKPIs).toHaveBeenCalled();
            expect(ChartManager.updateCharts).toHaveBeenCalled();
        });

        it('should handle month filtering', () => {
            document.getElementById('monthFilter').value = "02";
            const filtered = App.getFilteredData();
            expect(filtered.length).toBe(1);
            expect(filtered[0].month).toBe('2024-02');
        });

        it('should apply component filtering (hiding datasets)', () => {
            document.getElementById('componentFilter').value = "gross";
            App.render();
            // Gross Salary should be visible (hidden: false)
            expect(ChartManager.charts.salary.data.datasets[0].hidden).toBe(false);
            
            document.getElementById('componentFilter').value = "net";
            App.render();
            // Gross Salary should be hidden (hidden: true)
            expect(ChartManager.charts.salary.data.datasets[0].hidden).toBe(true);
        });
    });

    describe('Exporting', () => {
        it('exportToPdf() should call html2pdf', () => {
             App.exportToPdf();
             expect(global.html2pdf).toHaveBeenCalled();
        });

        it('exportToPng() should call html2canvas', async () => {
             await App.exportToPng();
             expect(global.html2canvas).toHaveBeenCalled();
        });
    });

    describe('Interactivity', () => {
        it('setupChartInteractivity(): should show details on click', () => {
            App.setupChartInteractivity();
            const canvas = document.getElementById('mainSalaryChart');
            
            ChartManager.charts.salary = {
                 getElementsAtEventForMode: vi.fn().mockReturnValue([{ index: 0 }])
            };
            vi.mocked(DataManager.getDataForYear).mockReturnValue([{ month: '2024-01' }]);
            
            canvas.onclick({}); 
            expect(UIManager.showMonthDetails).toHaveBeenCalled();
        });
    });
    describe('Summary View Orchestration', () => {
        beforeEach(() => {
            document.body.innerHTML += '<div id="allYearsContent"></div><div id="yearlyContent"></div><button id="backToSummary"></button><h1 id="mainTitle"></h1>';
            App.currentYear = "summary";
        });

        it('render(): should trigger summary dashboard when currentYear is summary', () => {
            vi.mocked(DataManager.getAllYearsSummary).mockReturnValue([]);
            vi.mocked(DataManager.getLifetimeTotals).mockReturnValue({});
            
            App.render();
            
            expect(UIManager.toggleView).toHaveBeenCalledWith(true);
            expect(UIManager.renderAllYearsDashboard).toHaveBeenCalled();
        });

        it('should navigate to summary when back button clicked', async () => {
            App.currentYear = "2024";
            document.getElementById('yearSelect').innerHTML = '<option value="summary"></option><option value="2024"></option>';
            
            // This is normally called in init(), but we call it here to check event binding
            App.setupEventListeners();
            
            const backBtn = document.getElementById('backToSummary');
            backBtn.click();
            
            expect(App.currentYear).toBe('summary');
            expect(UIManager.toggleView).toHaveBeenCalledWith(true);
        });
    });
});
