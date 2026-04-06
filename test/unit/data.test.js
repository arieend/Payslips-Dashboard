import { describe, it, expect, beforeEach, vi } from 'vitest';
import DataManager from '../../js/data.js';

const mockData = {
    "2024": [
        { month: "2024-01", gross: 10000, net: 8000, earnings: { base: 10000, bonus: 0, overtime: 0 }, deductions: { tax: 1000, pension: 500, insurance: 500 } },
        { month: "2024-02", gross: 20000, net: 16000, earnings: { base: 10000, bonus: 10000, overtime: 0 }, deductions: { tax: 2000, pension: 1000, insurance: 1000 } }
    ],
    "2023": [
         { month: "2023-12", gross: 10000, net: 8000, earnings: { base: 10000, bonus: 0, overtime: 0 }, deductions: { tax: 1000, pension: 500, insurance: 500 } }
    ]
};

describe('DataManager Logical Coverage', () => {
    beforeEach(() => {
        // Reset global state
        global.window = {};
        global.fetch = undefined;
        DataManager._raw = null;
    });

    describe('load()', () => {
        it('should load from window.PAYSLIP_DATA if available', async () => {
            global.window = { PAYSLIP_DATA: mockData };
            const result = await DataManager.load();
            expect(result).toEqual(mockData);
            expect(DataManager._raw).toEqual(mockData);
        });

        it('should load from fetch if window global is missing', async () => {
            const mockResponse = {
                ok: true,
                json: async () => mockData
            };
            global.fetch = vi.fn().mockResolvedValue(mockResponse);
            
            const result = await DataManager.load();
            expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('data/payslips.json?v='));
            expect(result).toEqual(mockData);
        });

        it('should handle fetch failure gracefully', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            const result = await DataManager.load();
            expect(result).toBeNull();
        });
    });

    describe('Accessors & Calculations', () => {
        beforeEach(() => {
            DataManager._raw = mockData;
        });

        it('getYears(): should return sorted keys or empty array', () => {
            expect(DataManager.getYears()).toEqual(["2024", "2023"]);
            DataManager._raw = null;
            expect(DataManager.getYears()).toEqual([]);
        });

        it('getDataForYear(): should return sorted months for a year', () => {
            const data = DataManager.getDataForYear("2024");
            expect(data.length).toBe(2);
            expect(data[0].month).toBe("2024-01");
            expect(data[1].month).toBe("2024-02");
            
            expect(DataManager.getDataForYear("1999")).toEqual([]);
        });

        it('getTotals(): should sum all components correctly', () => {
            const data = DataManager.getDataForYear("2024");
            const totals = DataManager.getTotals(data);
            expect(totals.gross).toBe(30000);
            expect(totals.net).toBe(24000);
            expect(totals.tax).toBe(3000);
            expect(totals.pension).toBe(1500);
            expect(totals.insurance).toBe(1500);
            expect(totals.base).toBe(20000);
            expect(totals.bonus).toBe(10000);
            expect(totals.overtime).toBe(0);
        });

        it('getAverages(): should return correct net average', () => {
            const data = DataManager.getDataForYear("2024");
            expect(DataManager.getAverages(data).net).toBe(12000);
            expect(DataManager.getAverages([]).net).toBe(0);
        });
    });

    describe('Insights & Trends', () => {
        it('getInsights(): should cover all anomaly types', () => {
            const yearData = [
                { month: "2024-01", gross: 10000, net: 8000, earnings: { base: 10000, bonus: 0, overtime: 0 }, deductions: { tax: 1000, pension: 500, insurance: 500 } },
                { month: "2024-02", gross: 20000, net: 16000, earnings: { base: 10000, bonus: 10000, overtime: 0 }, deductions: { tax: 2000, pension: 1000, insurance: 1000 } }
            ];
            const insights = DataManager.getInsights(yearData, "2024");
            
            // Spike: 20k vs avg 15k (20/15 = 1.33 > 1.3)
            expect(insights.some(i => i.title === 'Gross Spike Detected')).toBe(true);
            // Fluctuation: (16-8)/8 = 100% > 20%
            expect(insights.some(i => i.title === 'Net Fluctuation')).toBe(true);
            // Incomplete: 2 months < 12
            expect(insights.some(i => i.title === 'Incomplete Dataset')).toBe(true);
            
            expect(DataManager.getInsights([], "2024")).toEqual([]);
        });

        it('getTrendAnalysis(): should calculate max/min and MoM change', () => {
            const yearData = [
                { month: "2024-01", net: 8000 },
                { month: "2024-02", net: 12000 },
                { month: "2024-03", net: 10000 }
            ];
            const result = DataManager.getTrendAnalysis(yearData);
            expect(result.highest.month).toBe("2024-02");
            expect(result.lowest.month).toBe("2024-01");
            // Change from 8k to 12k is 50%. Change from 12k to 10k is (10-12)/12 = -16.6%. Correct!
            expect(result.change.pct).toBe(50);
            
            expect(DataManager.getTrendAnalysis([])).toBeNull();
            expect(DataManager.getTrendAnalysis(null)).toBeNull();
        });
    });

    describe('Cross-Year Summaries', () => {
        beforeEach(() => {
            DataManager._raw = mockData;
        });

        it('getAllYearsSummary(): should aggregate data across all years and filter empty ones', () => {
            const summary = DataManager.getAllYearsSummary();
            expect(summary.length).toBe(2);
            expect(summary[0].year).toBe("2024");
            expect(summary[0].totalGross).toBe(30000);
            expect(summary[0].monthsCount).toBe(2);
            expect(summary[1].year).toBe("2023");
            expect(summary[1].totalGross).toBe(10000);
        });

        it('getLifetimeTotals(): should calculate global totals accurately', () => {
            const lifetime = DataManager.getLifetimeTotals();
            // 2024 (30k gross, 24k net) + 2023 (10k gross, 8k net) = 40k gross, 32k net
            expect(lifetime.gross).toBe(40000);
            expect(lifetime.net).toBe(32000);
            expect(lifetime.deductions).toBe(8000);
            expect(lifetime.yearsCount).toBe(2);
        });

        it('should handle missing data for lifetime totals', () => {
             DataManager._raw = null;
             const lifetime = DataManager.getLifetimeTotals();
             expect(lifetime.gross).toBe(0);
             expect(lifetime.yearsCount).toBe(0);
        });
    });
});
