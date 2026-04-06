const ChartManager = {
    charts: {},

    initCharts(yearData, totals) {
        const mainSalaryCtx = document.getElementById('mainSalaryChart').getContext('2d');
        const earningsPieCtx = document.getElementById('earningsPie').getContext('2d');
        const deductionsPieCtx = document.getElementById('deductionsPie').getContext('2d');

        this._createMainSalaryChart(mainSalaryCtx, yearData);
        this._createEarningsPie(earningsPieCtx, totals);
        this._createDeductionsPie(deductionsPieCtx, totals);
    },

    updateCharts(yearData, totals) {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.initCharts(yearData, totals);
    },

    _getColor(varName) {
        return getComputedStyle(document.body).getPropertyValue(varName).trim() || '#666';
    },

    _createMainSalaryChart(ctx, yearData) {
        const labels = yearData.map(d => {
            if (!d.month || !/^\d{4}-\d{2}$/.test(d.month)) {
                console.warn('[ChartManager] Invalid month format:', d.month);
                return '?';
            }
            const date = new Date(d.month + '-01');
            return isNaN(date.getTime()) ? '?' : date.toLocaleString('default', { month: 'short' });
        });
        
        this.charts.salary = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Gross Salary',
                        data: yearData.map(d => d.gross),
                        backgroundColor: this._getColor('--blue'),
                        borderRadius: 6,
                        barThickness: 20,
                    },
                    {
                        label: 'Net Salary',
                        data: yearData.map(d => d.net),
                        backgroundColor: this._getColor('--green'),
                        borderRadius: 6,
                        barThickness: 20,
                    },
                    {
                        label: 'Deductions',
                        data: yearData.map(d => d.deductions.tax + d.deductions.pension + d.deductions.insurance),
                        backgroundColor: this._getColor('--red'),
                        borderRadius: 6,
                        barThickness: 20,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: this._getColor('--border'), drawBorder: false },
                        ticks: { color: this._getColor('--text-secondary'), font: { family: 'Inter', size: 11 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: this._getColor('--text-secondary'), font: { family: 'Inter', size: 11 } }
                    }
                },
                plugins: {
                    legend: { 
                        display: true, 
                        position: 'top', 
                        align: 'end', 
                        labels: { usePointStyle: true, boxWidth: 6, color: this._getColor('--text-primary'), font: { family: 'Inter', size: 10 } } 
                    },
                    tooltip: {
                        backgroundColor: this._getColor('--bg-header'),
                        titleColor: this._getColor('--text-primary'),
                        bodyColor: this._getColor('--text-primary'),
                        borderColor: this._getColor('--border'),
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: (context) => {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += '₪' + context.parsed.y.toLocaleString();
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    },

    _createEarningsPie(ctx, totals) {
        this.charts.earnings = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Base', 'Bonus', 'Overtime'],
                datasets: [{
                    data: [totals.base, totals.bonus, totals.overtime],
                    backgroundColor: [this._getColor('--blue'), this._getColor('--cyan'), this._getColor('--orange')],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { 
                        position: 'bottom', 
                        labels: { usePointStyle: true, color: this._getColor('--text-primary'), font: { family: 'Inter', size: 11 } } 
                    }
                }
            }
        });
    },

    _createDeductionsPie(ctx, totals) {
        this.charts.deductions = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Tax', 'Pension', 'Insurance'],
                datasets: [{
                    data: [totals.tax, totals.pension, totals.insurance],
                    backgroundColor: [this._getColor('--red'), this._getColor('--orange'), this._getColor('--cyan')],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'bottom', 
                        labels: { usePointStyle: true, color: this._getColor('--text-primary'), font: { family: 'Inter', size: 11 } } 
                    }
                }
            }
        });
    },

    initAllYearsCharts(summaryData, lifetimeTotals) {
        // Clear previous instances to prevent memory leaks/loops
        ['growth', 'lifetimeComp', 'trendline'].forEach(key => {
            if (this.charts[key]) {
                try { this.charts[key].destroy(); } catch (e) { console.warn(`[ChartManager] Failed to destroy ${key} chart:`, e); }
                this.charts[key] = null;
            }
        });

        const growthCtx = document.getElementById('yoyGrowthChart').getContext('2d');
        const compositionCtx = document.getElementById('lifetimeCompositionChart').getContext('2d');
        const trendlineCtx = document.getElementById('avgTrendlineChart').getContext('2d');

        this._createYoYGrowthChart(growthCtx, summaryData);
        this._createLifetimeCompositionChart(compositionCtx, lifetimeTotals);
        this._createAvgTrendlineChart(trendlineCtx, summaryData);
    },

    _createYoYGrowthChart(ctx, summaryData) {
        const sortedData = [...summaryData].sort((a, b) => a.year - b.year);
        this.charts.growth = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedData.map(d => d.year),
                datasets: [
                    {
                        label: 'Gross Yearly',
                        data: sortedData.map(d => d.totalGross),
                        backgroundColor: this._getColor('--blue'),
                        borderRadius: 8,
                    },
                    {
                        label: 'Net Yearly',
                        data: sortedData.map(d => d.totalNet),
                        backgroundColor: this._getColor('--green'),
                        borderRadius: 8,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 6, font: { size: 10 } } }
                }
            }
        });
    },

    _createLifetimeCompositionChart(ctx, lifetimeTotals) {
        this.charts.lifetimeComp = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Net Income', 'Deductions'],
                datasets: [{
                    data: [lifetimeTotals.net, lifetimeTotals.deductions],
                    backgroundColor: [this._getColor('--green'), this._getColor('--red')],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { position: 'right', labels: { usePointStyle: true, font: { size: 11 } } }
                }
            }
        });
    },

    _createAvgTrendlineChart(ctx, summaryData) {
        const sortedData = [...summaryData].sort((a, b) => a.year - b.year);
        this.charts.trendline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedData.map(d => d.year),
                datasets: [{
                    label: 'Avg Monthly Net',
                    data: sortedData.map(d => d.avgMonthly),
                    borderColor: this._getColor('--cyan'),
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: this._getColor('--cyan'),
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { display: false },
                    y: { display: true, ticks: { display: false }, grid: { display: false } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChartManager;
}
