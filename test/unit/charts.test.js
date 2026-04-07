import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChartManager from '../../js/charts.js';

describe('ChartManager Logical Coverage', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <canvas id="mainSalaryChart"></canvas>
            <canvas id="earningsPie"></canvas>
            <canvas id="deductionsPie"></canvas>
        `;

        // jsdom doesn't implement getContext — mock it on the prototype
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});

        // Reset charts so each test starts fresh
        ChartManager.charts = {};

        // Mock global Chart — return an object that mirrors how Chart.js instances look
        global.Chart = vi.fn().mockImplementation((ctx, config) => ({
            destroy: vi.fn(),
            update: vi.fn(),
            config,
            data: config.data
        }));

        // Mock compute style
        global.getComputedStyle = vi.fn().mockImplementation(() => ({
            getPropertyValue: (prop) => prop === '--blue' ? 'blue' : ''
        }));
    });

    describe('initCharts() / updateCharts()', () => {
        it('should create three charts on first call and update in-place on subsequent calls', () => {
            ChartManager.updateCharts([], { base: 100, bonus: 0, overtime: 0, tax: 10, pension: 5, insurance: 5 });
            expect(global.Chart).toHaveBeenCalledTimes(3);

            const firstCallCharts = { ...ChartManager.charts };
            ChartManager.updateCharts([], { base: 200, bonus: 0, overtime: 0, tax: 20, pension: 10, insurance: 10 });

            // In-place update: no new Chart instances and no destroy calls
            expect(global.Chart).toHaveBeenCalledTimes(3);
            Object.values(firstCallCharts).forEach(c => expect(c.destroy).not.toHaveBeenCalled());
            // Same chart instances should still be referenced
            expect(ChartManager.charts.salary).toBe(firstCallCharts.salary);
        });
    });

    describe('Chart Data Mapping', () => {
        it('_createMainSalaryChart(): should generate correct datasets', () => {
            const data = [
                { month: '2024-03', gross: 100, net: 80, deductions: { tax: 10, pension: 5, insurance: 5 } }
            ];
            ChartManager._createMainSalaryChart({}, data);
            
            const config = vi.mocked(global.Chart).mock.calls[0][1];
            expect(config.data.labels).toEqual(['Mar']);
            expect(config.data.datasets[0].data).toEqual([100]); // Gross
            expect(config.data.datasets[1].data).toEqual([80]);  // Net
        });

        it('_createEarningsPie(): should generate pie datasets', () => {
             ChartManager._createEarningsPie({}, { base: 100, bonus: 50, overtime: 10 });
             const config = vi.mocked(global.Chart).mock.calls[0][1];
             expect(config.data.datasets[0].data).toEqual([100, 50, 10]);
        });

        it('_createDeductionsPie(): should generate pie datasets', () => {
             ChartManager._createDeductionsPie({}, { tax: 15, pension: 7, insurance: 8 });
             const config = vi.mocked(global.Chart).mock.calls[0][1];
             expect(config.data.datasets[0].data).toEqual([15, 7, 8]);
        });
    });

    describe('_getColor()', () => {
         it('should return computed value or fallback', () => {
              expect(ChartManager._getColor('--blue')).toBe('blue');
              expect(ChartManager._getColor('--missing')).toBe('#666');
         });
    });
});
