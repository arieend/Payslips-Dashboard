const App = {
    currentYear: null,
    allYears: [],
    _selectedComponent: 'all',

    _t(key, fallback, data) {
        if (typeof I18n === 'undefined') return fallback;
        return data !== undefined ? I18n.t(key, data) : I18n.t(key);
    },
    _isHe() {
        return typeof I18n !== 'undefined' && I18n.lang === 'he';
    },

    async init() {
        console.log('Initializing Payslip Infographic App...');
        await this.loadData();
        this.setupEventListeners();
        this.setupChartInteractivity();
    },

    async loadData() {
        const rawData = await DataManager.load();
        if (!rawData) {
            console.error('No data found.');
            UIManager.showWelcomeScreen();
            return;
        }

        this.allYears = DataManager.getYears();
        this.currentYear = 'summary';
        UIManager.updateYearSelector(this.allYears, this.currentYear);
        this.render();
    },

    setupEventListeners() {
        const refreshDataBtn = document.getElementById('refreshData');
        if (refreshDataBtn) {
            refreshDataBtn.addEventListener('click', async () => {
                if (window.IPCHandler) {
                    try {
                        await window.IPCHandler.syncNow();
                        if (!window.electron) this._subscribeToIngestProgress();
                    } catch (e) {
                        console.error('[App] Sync failed:', e);
                        UIManager.showToast(this._t('toastSyncFailed', 'Sync failed: ') + e.message, 'alert-triangle');
                    }
                } else {
                    console.error('IPC Handler not found');
                }
            });
        }

        const yearSelect = document.getElementById('yearSelect');
        if (yearSelect) {
            yearSelect.addEventListener('change', (e) => {
                this.currentYear = e.target.value;
                this.render();
            });
        }

        const backBtn = document.getElementById('backToSummary');
        if (backBtn) {
            backBtn.onclick = () => {
                this.currentYear = 'summary';
                if (yearSelect) yearSelect.value = 'summary';
                this.render();
            };
        }

        const monthFilter = document.getElementById('monthFilter');
        if (monthFilter) {
            const monthKeys = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            monthKeys.forEach((m, idx) => {
                const opt = document.createElement('option');
                opt.value = (idx + 1).toString().padStart(2, '0');
                const d = new Date(2000, idx, 1);
                const locale = this._isHe() ? 'he-IL' : 'default';
                opt.textContent = d.toLocaleString(locale, { month: 'long' });
                monthFilter.appendChild(opt);
            });
            monthFilter.addEventListener('change', () => this.render());
        }

        const componentFilter = document.getElementById('componentFilter');
        if (componentFilter) {
            const components = [
                { value: 'gross', key: 'compGross', fallback: 'Gross' },
                { value: 'net', key: 'compNet', fallback: 'Net' },
                { value: 'deductions', key: 'compDeductions', fallback: 'Deductions' },
            ];
            components.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.value;
                opt.textContent = this._t(c.key, c.fallback);
                componentFilter.appendChild(opt);
            });
            componentFilter.addEventListener('change', () => {
                this._selectedComponent = componentFilter.value;
                this.render();
            });
        }

        // Re-render when language changes
        document.addEventListener('langchange', () => {
            if (monthFilter) {
                const selectedVal = monthFilter.value;
                Array.from(monthFilter.options).slice(1).forEach((opt, idx) => {
                    const d = new Date(2000, idx, 1);
                    const locale = this._isHe() ? 'he-IL' : 'default';
                    opt.textContent = d.toLocaleString(locale, { month: 'long' });
                });
                monthFilter.value = selectedVal;
            }
            ChartManager.destroyAll();
            this.render();
        });

        // Re-render when theme changes (charts bake colors at creation time)
        document.addEventListener('themechange', () => {
            ChartManager.destroyAll();
            this.render();
        });

        const exportPdfBtn = document.getElementById('exportPdf');
        if (exportPdfBtn) exportPdfBtn.onclick = () => this.exportToPdf();
        const exportPngBtn = document.getElementById('exportPng');
        if (exportPngBtn) exportPngBtn.onclick = () => this.exportToPng();

        const saveSettingsBtn = document.getElementById('saveSettings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                const input = document.getElementById('configPathInput');
                const newPath = input.value.trim();

                if (!newPath) {
                    UIManager.showToast(this._t('toastPathEmpty', 'Path cannot be empty!'), 'alert-triangle');
                    return;
                }
                if (!/^([A-Za-z]:[\\\/]|\\\\|\/)/i.test(newPath)) {
                    UIManager.showToast(this._t('toastPathAbsolute', 'Please provide an absolute path (e.g. C:\\Payslips)'), 'alert-triangle');
                    return;
                }

                const originalText = saveSettingsBtn.textContent;
                saveSettingsBtn.disabled = true;
                saveSettingsBtn.textContent = this._t('toastPathUpdating', 'Updating...');

                try {
                    await window.IPCHandler.updatePath(newPath);
                    const toastKey = window.electron ? 'toastPathUpdated' : 'toastPathUpdatedBrowser';
                    UIManager.showToast(this._t(toastKey, 'Folder path updated!'), 'check-circle');
                    if (!window.APP_CONFIG) window.APP_CONFIG = {};
                    window.APP_CONFIG.parentDirectoryPath = newPath;
                    if (!window.electron) {
                        localStorage.setItem('payslip_source_path', newPath);
                        this._subscribeToIngestProgress();
                    }
                    UIManager.closeSettings();
                } catch (e) {
                    console.error('[App] Config update error:', e);
                    UIManager.showToast(this._t('toastPathError', 'Failed to update folder path. Please check if the path exists.'), 'alert-triangle');
                } finally {
                    saveSettingsBtn.disabled = false;
                    saveSettingsBtn.textContent = originalText;
                }
            });
        }
    },

    _escHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },

    render() {
        if (this.currentYear === 'summary') return this._renderSummary();
        this._renderYear(this.currentYear);
    },

    _renderSummary() {
        UIManager.toggleView(true);
        document.getElementById('mainTitle').innerHTML = this._t('lifetimeSummary', 'Lifetime Payslip Summary');
        const summary = DataManager.getAllYearsSummary();
        const lifetime = DataManager.getLifetimeTotals();
        UIManager.renderAllYearsDashboard(summary, lifetime,
            (year) => {
                this.currentYear = year;
                document.getElementById('yearSelect').value = year;
                this.render();
            },
            async (year, btn) => {
                await this._syncWithProgress(btn, () => window.IPCHandler.syncYear(year));
            }
        );
    },

    _renderYear(year) {
        UIManager.toggleView(false);
        const safeYear = this._escHtml(year);
        document.getElementById('mainTitle').innerHTML = this._t('payslipOverview', `<span>${safeYear}</span> Payslip Overview`, { year: `<span>${safeYear}</span>` });

        const monthFilterVal = document.getElementById('monthFilter')?.value ?? 'all';
        const filteredData = this._getFilteredData(monthFilterVal);
        if (!filteredData || filteredData.length === 0) {
            UIManager.showToast(this._t('toastNoData', 'No data available for ') + year, 'alert-circle');
            return;
        }

        const totals = DataManager.getTotals(filteredData);
        const averages = DataManager.getAverages(filteredData);
        const insights = DataManager.getInsights(filteredData, year);
        const trends = DataManager.getTrendAnalysis(filteredData);

        UIManager.updateKPIs(totals, averages);
        UIManager.updateTrendAnalysis(trends);
        UIManager.updateAnomalies(insights);
        UIManager.updateMonthGrid(filteredData,
            async (month, btn) => {
                const [yr, mo] = month.month.split('-');
                await this._syncWithProgress(btn, () => window.IPCHandler.syncMonth(yr, mo));
            },
            async (monthKey, updates) => {
                await window.IPCHandler.saveManualEdit(monthKey, updates);
                UIManager.showToast(this._t('toastSaveOk', 'Data saved successfully!'), 'check-circle');
                await this.loadData();
            }
        );

        ChartManager.updateCharts(filteredData, totals);

        // Sync component filter state
        const componentFilter = document.getElementById('componentFilter');
        if (componentFilter) {
            if (componentFilter.value !== 'all') {
                this._selectedComponent = componentFilter.value;
            } else if (this._selectedComponent !== 'all') {
                componentFilter.value = this._selectedComponent;
            }
        }
        if (this._selectedComponent !== 'all' && ChartManager.charts.salary) {
            const labelMap = {
                'gross': this._t('chartGross', 'Gross Salary'),
                'net': this._t('chartNet', 'Net Salary'),
                'deductions': this._t('chartDeductions', 'Deductions')
            };
            const selectedLabel = labelMap[this._selectedComponent];
            ChartManager.charts.salary.data.datasets.forEach(ds => {
                ds.hidden = ds.label !== selectedLabel;
            });
            ChartManager.charts.salary.update();
        }
    },

    exportToPdf() {
        const element = document.querySelector('.app-container');
        const opt = {
            margin: 10,
            filename: `Payslip_Dashboard_${this.currentYear}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        html2pdf().from(element).set(opt).save();
    },

    exportToPng() {
        const element = document.querySelector('.app-container');
        html2canvas(element).then(canvas => {
            const link = document.createElement('a');
            link.download = `Payslip_Dashboard_${this.currentYear}.png`;
            link.href = canvas.toDataURL();
            link.click();
        });
    },

    setupChartInteractivity() {
        const canvas = document.getElementById('mainSalaryChart');
        if (!canvas) return;

        canvas.onclick = (evt) => {
            const salaryChart = ChartManager.charts.salary;
            if (!salaryChart) return;

            const activePoints = salaryChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
            if (activePoints.length > 0) {
                const index = activePoints[0].index;
                const monthFilterVal = document.getElementById('monthFilter')?.value || 'all';
                const filteredData = this._getFilteredData(monthFilterVal);
                const monthData = filteredData[index];
                if (monthData) {
                    UIManager.showMonthDetails(monthData);
                }
            }
        };
    },

    _getFilteredData(monthFilterVal) {
        const fullYearData = DataManager.getDataForYear(this.currentYear);
        if (!monthFilterVal || monthFilterVal === 'all') return [...fullYearData];
        return fullYearData.filter(d => d.month.includes(`-${monthFilterVal}`));
    },

    async _syncWithProgress(btn, syncFn) {
        const icon = btn.querySelector('i, svg');
        icon.classList.add('spinning');
        const done = () => icon.classList.remove('spinning');
        try {
            await syncFn();
        } catch (e) {
            done();
            UIManager.showToast(this._t('toastRefreshFailed', 'Refresh failed: ') + e.message, 'alert-triangle');
            return;
        }
        if (window.electron) done();
        else this._subscribeToIngestProgress(done);
    },

    _subscribeToIngestProgress(onDone) {
        if (window.electron) { if (onDone) onDone(); return; }
        if (this._sseSource) { this._sseSource.close(); this._sseSource = null; }

        const wrap = document.getElementById('ingest-progress-wrap');
        const fill = document.getElementById('ingest-progress-fill');
        const label = document.getElementById('ingest-progress-label');

        if (wrap) wrap.classList.remove('hidden');
        if (fill) fill.style.width = '0%';
        if (label) label.textContent = this._t('progressStarting', 'Starting…');

        const es = new EventSource('/api/ingest-progress');
        this._sseSource = es;

        es.onmessage = (e) => {
            let data;
            try { data = JSON.parse(e.data); } catch { return; }

            if (data.type === 'done') {
                es.close(); this._sseSource = null;
                if (wrap) wrap.classList.add('hidden');
                UIManager.showToast(this._t('toastIngestComplete', `Ingestion complete — ${data.count} payslips`, { count: data.count }), 'check-circle', 5000);
                this.loadData();
                if (onDone) onDone();
                return;
            }
            if (data.type === 'error') {
                es.close(); this._sseSource = null;
                if (wrap) wrap.classList.add('hidden');
                UIManager.showToast(this._t('toastIngestError', 'Ingestion error: ') + data.error, 'alert-triangle', 8000);
                if (onDone) onDone();
                return;
            }
            if (data.type === 'start' || data.type === 'connected') return;

            if (fill && data.total > 0) {
                fill.style.width = Math.round((data.current / data.total) * 100) + '%';
            }
            if (label && data.month) {
                const date = new Date(data.month + '-01');
                const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
                const grossStr = data.gross > 0 ? ` — ₪${data.gross.toLocaleString()}` : ' — no data parsed';
                const tag = data.cached ? ' (cached)' : ' ✓';
                label.textContent = `${monthName}${grossStr}${tag}   (${data.current} / ${data.total})`;
            } else if (label) {
                label.textContent = `${this._t('progressProcessing', 'Processing…')}  (${data.current} / ${data.total})`;
            }
        };

        es.onerror = () => {
            es.close(); this._sseSource = null;
            if (wrap) wrap.classList.add('hidden');
            if (onDone) onDone();
        };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
}

window.app = App;

window.addEventListener('DOMContentLoaded', () => {
    App.init();
});
