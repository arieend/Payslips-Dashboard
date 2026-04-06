import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChartManager from '../../js/charts.js';

describe('ChartManager Logical Coverage', () => {
    beforeEach(() => {
        // Mocking canvas context
        const mockContext = {
            getContext: vi.fn(() => ({})),
        };
        document.body.innerHTML = `
            <canvas id="mainSalaryChart"></canvas>
            <canvas id="earningsPie"></canvas>
            <canvas id="deductionsPie"></canvas>
        `;
        
        // Mock global Chart
        global.Chart = vi.fn().mockImplementation((ctx, config) => {
            return {
                destroy: vi.fn(),
                config: config
            };
        });

        // Mock compute style
        global.getComputedStyle = vi.fn().mockImplementation(() => ({
            getPropertyValue: (prop) => prop === '--blue' ? 'blue' : ''
        }));
    });

    describe('initCharts() / updateCharts()', () => {
        it('should initialize three charts and handle destruction on update', () => {
            ChartManager.initCharts([], { base: 100, bonus: 0, overtime: 0, tax: 10, pension: 5, insurance: 5 });
            expect(global.Chart).toHaveBeenCalledTimes(3);
            
            const firstCallCharts = { ...ChartManager.charts };
            ChartManager.updateCharts([], { base: 100, bonus: 0, overtime: 0, tax: 10, pension: 5, insurance: 5 });
            
            // Should call destroy on previous ones
            Object.values(firstCallCharts).forEach(c => expect(c.destroy).toHaveBeenCalled());
            expect(global.Chart).toHaveBeenCalledTimes(6); // 3 more
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
