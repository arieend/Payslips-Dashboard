import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChartManager from '../../js/charts.js';

const sampleTotals = { base: 100, bonus: 50, overtime: 10, tax: 20, pension: 10, insurance: 5 };
const sampleData = [
    { month: '2024-01', gross: 10000, net: 8000, deductions: { tax: 1000, pension: 500, insurance: 500 } },
    { month: '2024-03', gross: 12000, net: 9500, deductions: { tax: 1200, pension: 600, insurance: 700 } }
];

describe('ChartManager', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <canvas id="mainSalaryChart"></canvas>
            <canvas id="earningsPie"></canvas>
            <canvas id="deductionsPie"></canvas>
            <canvas id="yoyGrowthChart"></canvas>
            <canvas id="lifetimeCompositionChart"></canvas>
            <canvas id="avgTrendlineChart"></canvas>
        `;

        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});

        ChartManager.charts = {};
        ChartManager._colorCache = {};

        global.Chart = vi.fn().mockImplementation((ctx, config) => ({
            destroy: vi.fn(),
            update: vi.fn(),
            config,
            data: config.data
        }));

        global.getComputedStyle = vi.fn().mockImplementation(() => ({
            getPropertyValue: (prop) => {
                const map = { '--blue': '#3b82f6', '--green': '#22c55e', '--red': '#ef4444', '--cyan': '#06b6d4', '--orange': '#f97316' };
                return map[prop] || '';
            }
        }));
    });

    // ── Create / Update ───────────────────────────────────────────────────────────
    describe('updateCharts()', () => {
        it('creates three new chart instances on first call', () => {
            ChartManager.updateCharts(sampleData, sampleTotals);
            expect(global.Chart).toHaveBeenCalledTimes(3);
            expect(ChartManager.charts.salary).toBeDefined();
            expect(ChartManager.charts.earnings).toBeDefined();
            expect(ChartManager.charts.deductions).toBeDefined();
        });

        it('updates data in-place on subsequent calls (no new Chart instances)', () => {
            ChartManager.updateCharts(sampleData, sampleTotals);
            const originalSalary = ChartManager.charts.salary;
            ChartManager.updateCharts(sampleData, { ...sampleTotals, base: 200 });
            expect(global.Chart).toHaveBeenCalledTimes(3);
            expect(ChartManager.charts.salary).toBe(originalSalary);
        });

        it('calls update("none") on existing charts for in-place refresh', () => {
            ChartManager.updateCharts(sampleData, sampleTotals);
            ChartManager.updateCharts(sampleData, sampleTotals);
            expect(ChartManager.charts.salary.update).toHaveBeenCalledWith('none');
        });

        it('does not call destroy() during in-place update', () => {
            ChartManager.updateCharts(sampleData, sampleTotals);
            const salaryDestroy = ChartManager.charts.salary.destroy;
            ChartManager.updateCharts(sampleData, sampleTotals);
            expect(salaryDestroy).not.toHaveBeenCalled();
        });
    });

    // ── destroyAll() ─────────────────────────────────────────────────────────────
    describe('destroyAll()', () => {
        it('calls destroy() on all chart instances', () => {
            ChartManager.updateCharts(sampleData, sampleTotals);
            const destroyers = Object.values(ChartManager.charts).map(c => c.destroy);
            ChartManager.destroyAll();
            destroyers.forEach(d => expect(d).toHaveBeenCalled());
        });

        it('clears charts map after destroy', () => {
            ChartManager.updateCharts(sampleData, sampleTotals);
            ChartManager.destroyAll();
            expect(ChartManager.charts).toEqual({});
        });

        it('clears the color cache after destroy', () => {
            ChartManager._getColor('--blue'); // populate cache
            expect(ChartManager._colorCache['--blue']).toBeDefined();
            ChartManager.destroyAll();
            expect(ChartManager._colorCache).toEqual({});
        });
    });

    // ── Color Cache ───────────────────────────────────────────────────────────────
    describe('_getColor()', () => {
        it('returns the computed CSS variable value', () => {
            expect(ChartManager._getColor('--blue')).toBe('#3b82f6');
        });

        it('returns "#666" fallback for unknown variables', () => {
            expect(ChartManager._getColor('--nonexistent')).toBe('#666');
        });

        it('caches the result so getComputedStyle is only called once per variable', () => {
            ChartManager._getColor('--blue');
            ChartManager._getColor('--blue');
            expect(global.getComputedStyle).toHaveBeenCalledTimes(1);
        });

        it('returns fresh value after cache is cleared by destroyAll()', () => {
            ChartManager._getColor('--blue');
            ChartManager.destroyAll();
            global.getComputedStyle = vi.fn().mockReturnValue({ getPropertyValue: () => '#0000ff' });
            expect(ChartManager._getColor('--blue')).toBe('#0000ff');
        });
    });

    // ── Chart Data Mapping ────────────────────────────────────────────────────────
    describe('_createMainSalaryChart()', () => {
        it('maps month labels correctly', () => {
            ChartManager._createMainSalaryChart({}, sampleData);
            const config = vi.mocked(global.Chart).mock.calls[0][1];
            expect(config.data.labels).toEqual(['Jan', 'Mar']);
        });

        it('maps gross, net values to correct datasets', () => {
            ChartManager._createMainSalaryChart({}, sampleData);
            const config = vi.mocked(global.Chart).mock.calls[0][1];
            expect(config.data.datasets[0].data).toEqual([10000, 12000]); // gross
            expect(config.data.datasets[1].data).toEqual([8000, 9500]);   // net
        });

        it('creates a bar chart', () => {
            ChartManager._createMainSalaryChart({}, sampleData);
            const config = vi.mocked(global.Chart).mock.calls[0][1];
            expect(config.type).toBe('bar');
        });
    });

    describe('_createEarningsPie()', () => {
        it('maps base/bonus/overtime to dataset', () => {
            ChartManager._createEarningsPie({}, { base: 100, bonus: 50, overtime: 10 });
            const config = vi.mocked(global.Chart).mock.calls[0][1];
            expect(config.data.datasets[0].data).toEqual([100, 50, 10]);
        });

        it('creates a doughnut chart', () => {
            ChartManager._createEarningsPie({}, sampleTotals);
            const config = vi.mocked(global.Chart).mock.calls[0][1];
            expect(config.type).toBe('doughnut');
        });
    });

    describe('_createDeductionsPie()', () => {
        it('maps tax/pension/insurance to dataset', () => {
            ChartManager._createDeductionsPie({}, { tax: 15, pension: 7, insurance: 8 });
            const config = vi.mocked(global.Chart).mock.calls[0][1];
            expect(config.data.datasets[0].data).toEqual([15, 7, 8]);
        });

        it('creates a pie chart', () => {
            ChartManager._createDeductionsPie({}, sampleTotals);
            const config = vi.mocked(global.Chart).mock.calls[0][1];
            expect(config.type).toBe('pie');
        });
    });

    // ── All-Years Charts ──────────────────────────────────────────────────────────
    describe('initAllYearsCharts()', () => {
        const summaryData = [
            { year: '2023', totalGross: 120000, totalNet: 96000, avgMonthly: 8000 },
            { year: '2024', totalGross: 150000, totalNet: 120000, avgMonthly: 10000 }
        ];
        const lifetimeTotals = { net: 216000, deductions: 54000 };

        it('creates growth, lifetimeComp, and trendline charts on first call', () => {
            ChartManager.initAllYearsCharts(summaryData, lifetimeTotals);
            expect(ChartManager.charts.growth).toBeDefined();
            expect(ChartManager.charts.lifetimeComp).toBeDefined();
            expect(ChartManager.charts.trendline).toBeDefined();
        });

        it('updates in-place on subsequent calls', () => {
            ChartManager.initAllYearsCharts(summaryData, lifetimeTotals);
            const originalGrowth = ChartManager.charts.growth;
            ChartManager.initAllYearsCharts(summaryData, lifetimeTotals);
            expect(ChartManager.charts.growth).toBe(originalGrowth);
            expect(ChartManager.charts.growth.update).toHaveBeenCalledWith('none');
        });

        it('sorts summary data by year (ascending) for the charts', () => {
            const unsorted = [summaryData[1], summaryData[0]]; // 2024 first
            ChartManager.initAllYearsCharts(unsorted, lifetimeTotals);
            const config = vi.mocked(global.Chart).mock.calls[0][1];
            expect(config.data.labels).toEqual(['2023', '2024']);
        });
    });

    // ── Month Labels ─────────────────────────────────────────────────────────────
    describe('_monthLabels()', () => {
        it('returns short month names from ISO month strings', () => {
            const labels = ChartManager._monthLabels([
                { month: '2024-01' }, { month: '2024-06' }, { month: '2024-12' }
            ]);
            expect(labels).toEqual(['Jan', 'Jun', 'Dec']);
        });

        it('returns "?" for invalid or missing month values', () => {
            const labels = ChartManager._monthLabels([{ month: null }, { month: 'bad' }]);
            expect(labels).toEqual(['?', '?']);
        });
    });
});
