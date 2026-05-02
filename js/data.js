const DataManager = {
    _raw: null,
    _loadPromise: null,
    _sortedCache: {},   // year → sorted month array; cleared on each load
    _summaryCache: null, // getAllYearsSummary result; cleared on each load

    async load(forceFetch = false) {
        // Prevent concurrent fetches — queue behind the in-flight request
        if (this._loadPromise) return this._loadPromise;
        this._loadPromise = this._doLoad(forceFetch).finally(() => { this._loadPromise = null; });
        return this._loadPromise;
    },

    async _doLoad(forceFetch) {
        // Fallback helper to wait up to 2 seconds for window.PAYSLIP_DATA
        const getGlobalData = () => new Promise(resolve => {
            if (window.PAYSLIP_DATA) return resolve(window.PAYSLIP_DATA);
            const check = (remaining) => {
                if (window.PAYSLIP_DATA) return resolve(window.PAYSLIP_DATA);
                if (remaining <= 0) return resolve(null);
                setTimeout(() => check(remaining - 100), 100);
            };
            check(2000);
        });

        // Only use global if not forcing a fresh fetch (e.g. background update)
        if (window.PAYSLIP_DATA && !forceFetch) {
            this._raw = window.PAYSLIP_DATA;
            this._sortedCache = {};
            this._summaryCache = null;
            return this._raw;
        }

        try {
            // Use app-data protocol if in Electron to bypass file system issues
            const baseUrl = window.electron ? 'app-data://' : '';
            const response = await fetch(`${baseUrl}data/payslips.json?v=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this._raw = await response.json();
            this._sortedCache = {};
            this._summaryCache = null;
            console.log('[DataManager] Data loaded from JSON file.');
            return this._raw;
        } catch (error) {
            console.warn('Fetch failed, trying global variable fallback...', error.message);
            this._raw = await getGlobalData();
            if (this._raw) {
                this._sortedCache = {};
                this._summaryCache = null;
                console.log('[DataManager] Data loaded from window.PAYSLIP_DATA fallback.');
                return this._raw;
            }
            return null;
        }
    },

    getYears() {
        if (!this._raw) return [];
        return Object.keys(this._raw).sort((a, b) => b - a);
    },

    getDataForYear(year) {
        if (!this._raw || !this._raw[year]) return [];
        // Cache sorted result — invalidated when _raw is replaced in _doLoad
        if (!this._sortedCache[year]) {
            this._sortedCache[year] = [...this._raw[year]].sort((a, b) => a.month.localeCompare(b.month));
        }
        return this._sortedCache[year];
    },

    getTotals(yearData) {
        if (!Array.isArray(yearData)) return { gross: 0, net: 0, tax: 0, pension: 0, insurance: 0, base: 0, bonus: 0, overtime: 0, deductions: 0 };
        return yearData.reduce((acc, curr) => {
            if (!curr || typeof curr.gross !== 'number' || typeof curr.net !== 'number') {
                console.warn('[DataManager] Skipping invalid payslip entry:', curr);
                return acc;
            }
            acc.gross += curr.gross;
            acc.net += curr.net;
            acc.tax += (curr.deductions?.tax || 0);
            acc.pension += (curr.deductions?.pension || 0);
            acc.insurance += (curr.deductions?.insurance || 0);

            // Total Deductions priority: 1. stored total, 2. calculated diff, 3. sum of parts
            const totalD = curr.total_deductions || (curr.gross > 0 && curr.net > 0 ? (curr.gross - curr.net) : 0);
            acc.deductions += totalD;

            acc.base += (curr.earnings?.base || 0);
            acc.bonus += (curr.earnings?.bonus || 0);
            acc.overtime += (curr.earnings?.overtime || 0);
            return acc;
        }, { gross: 0, net: 0, tax: 0, pension: 0, insurance: 0, base: 0, bonus: 0, overtime: 0, deductions: 0 });
    },

    getAverages(yearData) {
        const valid = yearData.filter(d => d.gross > 0 || d.net > 0);
        if (valid.length === 0) return { gross: 0, net: 0 };
        const totals = this.getTotals(valid);
        return {
            gross: totals.gross / valid.length,
            net: totals.net / valid.length
        };
    },

    getInsights(yearData, year) {
        const insights = [];
        if (yearData.length === 0) return insights;

        // 1. Threshold-based Anomalies — compute average only over months with real data
        const validData = yearData.filter(d => d.gross > 0 || d.net > 0);
        const avgGross = validData.length > 0
            ? validData.reduce((s, d) => s + d.gross, 0) / validData.length
            : 0;
        yearData.forEach(d => {
            if (d.gross > avgGross * 1.3) {
                insights.push({
                    type: 'alert',
                    icon: 'alert-triangle',
                    titleKey: 'insightSpikeTitle',
                    textKey: 'insightSpikeText',
                    textData: { month: d.month }
                });
            }
        });

        // 2. Trend Anomalies (MoM changes > 20%)
        for (let i = 1; i < yearData.length; i++) {
            const curr = yearData[i];
            const prev = yearData[i - 1];
            const pct = prev.net !== 0 ? ((curr.net - prev.net) / prev.net) * 100 : 0;
            if (Math.abs(pct) > 20) {
                const sign = pct > 0 ? '+' : '';
                insights.push({
                    type: 'info',
                    icon: 'zap',
                    titleKey: 'insightFluctuationTitle',
                    textKey: 'insightFluctuationText',
                    textData: { pct: sign + pct.toFixed(1), toMonth: curr.month, fromMonth: prev.month }
                });
            }
        }

        // 3. Completeness Insight
        if (yearData.length < 12) {
            insights.push({
                type: 'warning',
                icon: 'file-warning',
                titleKey: 'insightIncompleteTitle',
                textKey: 'insightIncompleteText',
                textData: { year, count: yearData.length }
            });
        }

        return insights;
    },

    getTrendAnalysis(yearData) {
        if (!yearData || yearData.length === 0) return null;

        let highest = yearData[0];
        let lowest = yearData[0];
        let mostSignificant = { pct: 0, from: '', to: '' };

        for (let i = 0; i < yearData.length; i++) {
            const curr = yearData[i];

            if (curr.net > highest.net) highest = curr;
            if (curr.net < lowest.net) lowest = curr;

            if (i > 0) {
                const prev = yearData[i - 1];
                const pct = prev.net !== 0 ? ((curr.net - prev.net) / prev.net) * 100 : 0;
                if (Math.abs(pct) > Math.abs(mostSignificant.pct)) {
                    mostSignificant = { pct, from: prev.month, to: curr.month };
                }
            }
        }

        return { highest, lowest, change: mostSignificant };
    },

    getAllYearsSummary() {
        if (this._summaryCache) return this._summaryCache;

        const years = this.getYears();
        const summary = [];

        years.forEach(year => {
            const yearData = this.getDataForYear(year);
            if (yearData.length > 0) {
                const totals = this.getTotals(yearData);
                const failedCount = yearData.filter(m => m.gross === 0 && m.net === 0).length;
                const validCount = yearData.length - failedCount || 1;
                summary.push({
                    year,
                    totalGross: totals.gross,
                    totalNet: totals.net,
                    totalDeductions: totals.deductions,
                    avgMonthly: totals.net / validCount,
                    monthsCount: yearData.length,
                    failedCount
                });
            }
        });

        this._summaryCache = summary.sort((a, b) => b.year - a.year);
        return this._summaryCache;
    },

    getLifetimeTotals() {
        const summary = this.getAllYearsSummary();
        const totals = summary.reduce((acc, curr) => {
            acc.gross += curr.totalGross;
            acc.net += curr.totalNet;
            acc.deductions += curr.totalDeductions;
            return acc;
        }, { gross: 0, net: 0, deductions: 0 });

        totals.yearsCount = summary.length;
        return totals;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataManager;
}
