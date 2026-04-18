import { describe, it, expect, beforeEach, vi } from 'vitest';
import DataManager from '../../js/data.js';

const mockData = {
    "2024": [
        { month: "2024-01", gross: 10000, net: 8000, total_deductions: 2000, earnings: { base: 10000, bonus: 0, overtime: 0 }, deductions: { tax: 1000, pension: 500, insurance: 500 } },
        { month: "2024-02", gross: 20000, net: 16000, total_deductions: 4000, earnings: { base: 10000, bonus: 10000, overtime: 0 }, deductions: { tax: 2000, pension: 1000, insurance: 1000 } }
    ],
    "2023": [
        { month: "2023-12", gross: 10000, net: 8000, total_deductions: 2000, earnings: { base: 10000, bonus: 0, overtime: 0 }, deductions: { tax: 1000, pension: 500, insurance: 500 } }
    ]
};

describe('DataManager Logical Coverage', () => {
    beforeEach(() => {
        global.window = {};
        global.fetch = undefined;
        DataManager._raw = mockData;
        DataManager._sortedCache = {};
        DataManager._summaryCache = null;
    });

    // ── load() ──────────────────────────────────────────────────────────────────
    describe('load()', () => {
        it('loads from window.PAYSLIP_DATA when available (no fetch)', async () => {
            global.window = { PAYSLIP_DATA: mockData };
            const result = await DataManager.load();
            expect(result).toEqual(mockData);
            expect(DataManager._raw).toEqual(mockData);
        });

        it('loads from fetch when global is absent', async () => {
            global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData });
            const result = await DataManager.load();
            expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('data/payslips.json?v='));
            expect(result).toEqual(mockData);
        });

        it('falls back to global after a failed fetch', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            global.window = { PAYSLIP_DATA: mockData };
            const result = await DataManager.load();
            expect(result).toEqual(mockData);
        });

        it('returns null when both fetch and global fail', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            const result = await DataManager.load();
            expect(result).toBeNull();
        });

        it('clears sorted and summary caches after a successful load', async () => {
            DataManager._sortedCache = { '2023': [] };
            DataManager._summaryCache = [];
            global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData });
            await DataManager.load();
            expect(DataManager._sortedCache).toEqual({});
            expect(DataManager._summaryCache).toBeNull();
        });

        it('deduplicates concurrent load() calls (only one fetch)', async () => {
            let resolveFetch;
            global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolveFetch = () => r({ ok: true, json: async () => mockData }); }));
            const p1 = DataManager.load();
            const p2 = DataManager.load();
            resolveFetch();
            const [r1, r2] = await Promise.all([p1, p2]);
            expect(r1).toEqual(mockData);
            expect(r2).toEqual(mockData);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });

    // ── Accessors ────────────────────────────────────────────────────────────────
    describe('Accessors', () => {
        it('getYears(): returns years sorted descending', () => {
            expect(DataManager.getYears()).toEqual(['2024', '2023']);
        });

        it('getYears(): returns [] when _raw is null', () => {
            DataManager._raw = null;
            expect(DataManager.getYears()).toEqual([]);
        });

        it('getDataForYear(): returns months sorted ascending', () => {
            const data = DataManager.getDataForYear('2024');
            expect(data.map(d => d.month)).toEqual(['2024-01', '2024-02']);
        });

        it('getDataForYear(): returns [] for unknown year', () => {
            expect(DataManager.getDataForYear('1999')).toEqual([]);
        });

        it('getDataForYear(): caches result on second call (same reference)', () => {
            const first = DataManager.getDataForYear('2024');
            const second = DataManager.getDataForYear('2024');
            expect(first).toBe(second);
        });

        it('getDataForYear(): does not mutate _raw (spread clone)', () => {
            const data = DataManager.getDataForYear('2024');
            data.push({ month: '2024-99' });
            expect(DataManager._raw['2024'].length).toBe(2);
        });
    });

    // ── Totals & Averages ────────────────────────────────────────────────────────
    describe('getTotals()', () => {
        it('sums all financial components correctly', () => {
            const totals = DataManager.getTotals(DataManager.getDataForYear('2024'));
            expect(totals.gross).toBe(30000);
            expect(totals.net).toBe(24000);
            expect(totals.tax).toBe(3000);
            expect(totals.pension).toBe(1500);
            expect(totals.insurance).toBe(1500);
            expect(totals.base).toBe(20000);
            expect(totals.bonus).toBe(10000);
            expect(totals.overtime).toBe(0);
        });

        it('returns zero-initialised object for empty array', () => {
            const totals = DataManager.getTotals([]);
            expect(totals.gross).toBe(0);
            expect(totals.net).toBe(0);
        });

        it('skips invalid entries (no gross/net fields)', () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const data = [
                { month: '2024-01', gross: 10000, net: 8000, earnings: {}, deductions: {} },
                { month: '2024-02' } // invalid — missing gross/net
            ];
            const totals = DataManager.getTotals(data);
            expect(totals.gross).toBe(10000);
            consoleWarn.mockRestore();
        });

        it('falls back to gross-net diff when total_deductions is absent', () => {
            const data = [{ month: '2024-01', gross: 10000, net: 8000, earnings: {}, deductions: {} }];
            const totals = DataManager.getTotals(data);
            expect(totals.deductions).toBe(2000);
        });
    });

    describe('getAverages()', () => {
        it('returns correct gross and net averages', () => {
            const data = DataManager.getDataForYear('2024');
            const avg = DataManager.getAverages(data);
            expect(avg.net).toBe(12000);
            expect(avg.gross).toBe(15000);
        });

        it('returns { gross: 0, net: 0 } for empty array', () => {
            expect(DataManager.getAverages([])).toEqual({ gross: 0, net: 0 });
        });

        it('excludes zero-value months from denominator', () => {
            const data = [
                { month: '2024-01', gross: 10000, net: 8000, earnings: {}, deductions: {} },
                { month: '2024-02', gross: 0, net: 0, earnings: {}, deductions: {} } // failed parse
            ];
            const avg = DataManager.getAverages(data);
            expect(avg.net).toBe(8000); // only 1 valid month
        });
    });

    // ── Insights ─────────────────────────────────────────────────────────────────
    describe('getInsights()', () => {
        it('returns empty array for empty input', () => {
            expect(DataManager.getInsights([], '2024')).toEqual([]);
        });

        it('emits insightSpikeTitle when a month is 30%+ above average gross', () => {
            const data = [
                { month: '2024-01', gross: 10000, net: 8000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } },
                { month: '2024-02', gross: 20000, net: 16000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } }
            ];
            const insights = DataManager.getInsights(data, '2024');
            expect(insights.some(i => i.titleKey === 'insightSpikeTitle')).toBe(true);
        });

        it('includes month in textData for spike insight', () => {
            const data = [
                { month: '2024-01', gross: 10000, net: 8000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } },
                { month: '2024-02', gross: 20000, net: 16000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } }
            ];
            const spike = DataManager.getInsights(data, '2024').find(i => i.titleKey === 'insightSpikeTitle');
            expect(spike.textData.month).toBe('2024-02');
        });

        it('emits insightFluctuationTitle for MoM net change > 20%', () => {
            const data = [
                { month: '2024-01', gross: 10000, net: 8000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } },
                { month: '2024-02', gross: 20000, net: 16000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } }
            ];
            const insights = DataManager.getInsights(data, '2024');
            expect(insights.some(i => i.titleKey === 'insightFluctuationTitle')).toBe(true);
        });

        it('includes pct/fromMonth/toMonth in textData for fluctuation insight', () => {
            const data = [
                { month: '2024-01', gross: 10000, net: 8000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } },
                { month: '2024-02', gross: 20000, net: 16000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } }
            ];
            const fl = DataManager.getInsights(data, '2024').find(i => i.titleKey === 'insightFluctuationTitle');
            expect(fl.textData.fromMonth).toBe('2024-01');
            expect(fl.textData.toMonth).toBe('2024-02');
            expect(fl.textData.pct).toContain('100.0');
        });

        it('emits insightIncompleteTitle when year has fewer than 12 payslips', () => {
            const data = [
                { month: '2024-01', gross: 10000, net: 8000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } }
            ];
            const insights = DataManager.getInsights(data, '2024');
            const inc = insights.find(i => i.titleKey === 'insightIncompleteTitle');
            expect(inc).toBeDefined();
            expect(inc.textData.year).toBe('2024');
            expect(inc.textData.count).toBe(1);
        });

        it('does not emit fluctuation when MoM change is <= 20%', () => {
            const data = [
                { month: '2024-01', gross: 10000, net: 10000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } },
                { month: '2024-02', gross: 11000, net: 11000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } }
            ];
            const insights = DataManager.getInsights(data, '2024');
            expect(insights.some(i => i.titleKey === 'insightFluctuationTitle')).toBe(false);
        });

        it('insight objects have no raw HTML in any string field', () => {
            const data = [
                { month: '2024-01', gross: 10000, net: 8000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } },
                { month: '2024-02', gross: 20000, net: 16000, earnings: {}, deductions: { tax: 0, pension: 0, insurance: 0 } }
            ];
            const insights = DataManager.getInsights(data, '2024');
            insights.forEach(i => {
                expect(JSON.stringify(i)).not.toMatch(/<[a-z]/i);
            });
        });
    });

    // ── Trend Analysis ───────────────────────────────────────────────────────────
    describe('getTrendAnalysis()', () => {
        it('returns null for empty or null input', () => {
            expect(DataManager.getTrendAnalysis([])).toBeNull();
            expect(DataManager.getTrendAnalysis(null)).toBeNull();
        });

        it('identifies highest and lowest net months', () => {
            const data = [
                { month: '2024-01', net: 8000 },
                { month: '2024-02', net: 12000 },
                { month: '2024-03', net: 10000 }
            ];
            const result = DataManager.getTrendAnalysis(data);
            expect(result.highest.month).toBe('2024-02');
            expect(result.lowest.month).toBe('2024-01');
        });

        it('identifies the largest MoM change as mostSignificant', () => {
            const data = [
                { month: '2024-01', net: 8000 },
                { month: '2024-02', net: 12000 }, // +50%
                { month: '2024-03', net: 11000 }  // -8.3%
            ];
            const result = DataManager.getTrendAnalysis(data);
            expect(result.change.pct).toBe(50);
            expect(result.change.from).toBe('2024-01');
            expect(result.change.to).toBe('2024-02');
        });

        it('handles single-month input without crashing', () => {
            const data = [{ month: '2024-01', net: 5000 }];
            const result = DataManager.getTrendAnalysis(data);
            expect(result.highest.month).toBe('2024-01');
            expect(result.change.pct).toBe(0);
        });
    });

    // ── Cross-Year Summaries ─────────────────────────────────────────────────────
    describe('getAllYearsSummary()', () => {
        it('returns one entry per year sorted descending', () => {
            const summary = DataManager.getAllYearsSummary();
            expect(summary.map(s => s.year)).toEqual(['2024', '2023']);
        });

        it('calculates correct totals per year', () => {
            const summary = DataManager.getAllYearsSummary();
            const y2024 = summary.find(s => s.year === '2024');
            expect(y2024.totalGross).toBe(30000);
            expect(y2024.totalNet).toBe(24000);
            expect(y2024.monthsCount).toBe(2);
        });

        it('caches the result on second call (same reference)', () => {
            const first = DataManager.getAllYearsSummary();
            const second = DataManager.getAllYearsSummary();
            expect(first).toBe(second);
        });

        it('returns [] when _raw is null', () => {
            DataManager._raw = null;
            expect(DataManager.getAllYearsSummary()).toEqual([]);
        });
    });

    describe('getLifetimeTotals()', () => {
        it('aggregates gross and net across all years', () => {
            const lt = DataManager.getLifetimeTotals();
            expect(lt.gross).toBe(40000);
            expect(lt.net).toBe(32000);
            expect(lt.yearsCount).toBe(2);
        });

        it('returns zeros when _raw is null', () => {
            DataManager._raw = null;
            const lt = DataManager.getLifetimeTotals();
            expect(lt.gross).toBe(0);
            expect(lt.yearsCount).toBe(0);
        });
    });
});
