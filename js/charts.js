const ChartManager = {
    charts: {},

    // Update yearly charts in-place if they exist, create them if not.
    updateCharts(yearData, totals) {
        const labels = this._monthLabels(yearData);

        if (this.charts.salary) {
            this.charts.salary.data.labels = labels;
            this.charts.salary.data.datasets[0].data = yearData.map(d => d.gross);
            this.charts.salary.data.datasets[1].data = yearData.map(d => d.net);
            this.charts.salary.data.datasets[2].data = yearData.map(d => d.deductions.tax + d.deductions.pension + d.deductions.insurance);
            this.charts.salary.update('none');
        } else {
            this._createMainSalaryChart(document.getElementById('mainSalaryChart').getContext('2d'), yearData);
        }

        if (this.charts.earnings) {
            this.charts.earnings.data.datasets[0].data = [totals.base, totals.bonus, totals.overtime];
            this.charts.earnings.update('none');
        } else {
            this._createEarningsPie(document.getElementById('earningsPie').getContext('2d'), totals);
        }

        if (this.charts.deductions) {
            this.charts.deductions.data.datasets[0].data = [totals.tax, totals.pension, totals.insurance];
            this.charts.deductions.update('none');
        } else {
            this._createDeductionsPie(document.getElementById('deductionsPie').getContext('2d'), totals);
        }
    },

    _monthLabels(yearData) {
        return yearData.map(d => {
            if (!d.month || !/^\d{4}-\d{2}$/.test(d.month)) return '?';
            const date = new Date(d.month + '-01');
            return isNaN(date.getTime()) ? '?' : date.toLocaleString('default', { month: 'short' });
        });
    },

    _getColor(varName) {
        return getComputedStyle(document.body).getPropertyValue(varName).trim() || '#666';
    },

    _createMainSalaryChart(ctx, yearData) {
        const labels = this._monthLabels(yearData);

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
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 100,
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
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 100,
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
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 100,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true, color: this._getColor('--text-primary'), font: { family: 'Inter', size: 11 } }
                    }
                }
            }
        });
    },

    // Update summary charts in-place if they exist, create them if not.
    initAllYearsCharts(summaryData, lifetimeTotals) {
        const sortedData = [...summaryData].sort((a, b) => a.year - b.year);

        if (this.charts.growth) {
            this.charts.growth.data.labels = sortedData.map(d => d.year);
            this.charts.growth.data.datasets[0].data = sortedData.map(d => d.totalGross);
            this.charts.growth.data.datasets[1].data = sortedData.map(d => d.totalNet);
            this.charts.growth.update('none');
        } else {
            this._createYoYGrowthChart(document.getElementById('yoyGrowthChart').getContext('2d'), summaryData);
        }

        if (this.charts.lifetimeComp) {
            this.charts.lifetimeComp.data.datasets[0].data = [lifetimeTotals.net, lifetimeTotals.deductions];
            this.charts.lifetimeComp.update('none');
        } else {
            this._createLifetimeCompositionChart(document.getElementById('lifetimeCompositionChart').getContext('2d'), lifetimeTotals);
        }

        if (this.charts.trendline) {
            this.charts.trendline.data.labels = sortedData.map(d => d.year);
            this.charts.trendline.data.datasets[0].data = sortedData.map(d => d.avgMonthly);
            this.charts.trendline.update('none');
        } else {
            this._createAvgTrendlineChart(document.getElementById('avgTrendlineChart').getContext('2d'), summaryData);
        }
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
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 100,
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
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 100,
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
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 100,
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
