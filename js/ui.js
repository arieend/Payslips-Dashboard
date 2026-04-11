const UIManager = {
    _cache: {},
    getEl(id) {
        if (!this._cache[id]) this._cache[id] = document.getElementById(id);
        return this._cache[id];
    },
    _clearCache() {
        this._cache = {};
    },
    refreshIcons() {
        if (window.lucide) lucide.createIcons();
    },
    updateKPIs(totals, averages) {
        const setVal = (id, val) => {
            const el = document.querySelector(`${id} .kpi-value`);
            if (el) el.textContent = val;
        };
        setVal('#kpi-gross', `₪${totals.gross.toLocaleString()}`);
        setVal('#kpi-net', `₪${totals.net.toLocaleString()}`);
        setVal('#kpi-deductions', `₪${totals.deductions.toLocaleString()}`);
        setVal('#kpi-avg', `₪${Math.round(averages.net).toLocaleString()}`);
    },
    updateYearSelector(years, currentYear) {
        const select = this.getEl('yearSelect');
        if (!select) return;
        const allYearsLabel = typeof I18n !== 'undefined' ? I18n.t('allYearsSummary') : 'All Years Summary';
        select.innerHTML = `<option value="summary">${allYearsLabel}</option>`;
        years.forEach(year => {
            const opt = new Option(year, year);
            if (year.toString() === currentYear.toString()) opt.selected = true;
            select.add(opt);
        });
        
        const mainTitle = this.getEl('mainTitle');
        if (mainTitle) {
            const i18 = typeof I18n !== 'undefined' ? I18n : null;
            const safeYear = String(currentYear).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            mainTitle.innerHTML = currentYear === 'summary'
                ? (i18 ? i18.t('lifetimeSummary') : 'Lifetime Payslip Summary')
                : (i18 ? i18.t('payslipOverview', { year: `<span id="displayYear">${safeYear}</span>` }) : `<span id="displayYear">${safeYear}</span> Payslip Overview`);
        }
    },
    updateTrendAnalysis(trend) {
        if (!trend) return;
        const setTrend = (id, val) => {
            const el = this.getEl(id);
            if (el) el.querySelector('.value').textContent = val;
        };
        setTrend('trend-highest', `${this._formatMonth(trend.highest.month)} (₪${trend.highest.net.toLocaleString()})`);
        setTrend('trend-lowest', `${this._formatMonth(trend.lowest.month)} (₪${trend.lowest.net.toLocaleString()})`);
        
        const sign = trend.change.pct > 0 ? '+' : '';
        setTrend('trend-change', `${sign}${trend.change.pct.toFixed(1)}% Max Deviation`);
        this.refreshIcons();
    },
    updateAnomalies(insights) {
        const list = this.getEl('anomalies-list');
        if (!list) return;
        list.innerHTML = '';
        insights.forEach(insight => {
            const item = document.createElement('div');
            item.className = `anomaly-item ${insight.type}`;

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; align-items:center; gap:0.5rem; font-weight:600; font-size:0.85rem; margin-bottom:0.3rem;';

            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', insight.icon || 'info');
            icon.style.width = '1rem';
            header.appendChild(icon);

            const titleSpan = document.createElement('span');
            titleSpan.textContent = insight.title;
            header.appendChild(titleSpan);

            const text = document.createElement('p');
            text.style.cssText = 'font-size:0.75rem; color:var(--text-secondary);';
            text.textContent = insight.text;

            item.appendChild(header);
            item.appendChild(text);
            list.appendChild(item);
        });
        this.refreshIcons();
    },
    updateMonthGrid(yearData, onMonthRefresh, onMonthEdit) {
        const container = this.getEl('monthCards');
        if (!container) return;
        container.innerHTML = '';

        yearData.forEach(month => {
            const card = document.createElement('div');
            const isFailed = month.gross === 0 && month.net === 0;
            card.className = 'month-card' + (isFailed ? ' parse-failed' : '');
            const i = typeof I18n !== 'undefined' ? I18n : null;
            const fmtMonth = this._formatMonth(month.month);
            card.innerHTML = `
                <div class="card-title">
                    <i data-lucide="calendar"></i>
                    ${fmtMonth}
                    <div style="margin-left:auto; display:flex; gap:0.25rem;">
                        <button class="card-edit-btn" title="${i ? i.t('editMonth', { month: fmtMonth }) : `Edit ${fmtMonth} data`}"><i data-lucide="pencil"></i></button>
                        <button class="card-refresh-btn" title="${i ? i.t('reingestMonth', { month: fmtMonth }) : `Re-ingest ${fmtMonth}`}"><i data-lucide="refresh-cw"></i></button>
                    </div>
                </div>
                <div class="card-stat"><span>${i ? i.t('gross') : 'Gross'}:</span> <b>₪${month.gross.toLocaleString()}</b></div>
                <div class="card-stat"><span>${i ? i.t('net') : 'Net'}:</span> <b style="color:var(--green);">₪${month.net.toLocaleString()}</b></div>
                <div class="card-stat"><span>${i ? i.t('deductions') : 'Deductions'}:</span> <b style="color:var(--red);">₪${(month.total_deductions || Math.max(0, month.gross - month.net)).toLocaleString()}</b></div>
                <button class="view-btn">${i ? i.t('viewSource') : 'View Source'}</button>
            `;
            card.querySelector('.view-btn').onclick = () => this.showMonthDetails(month, false);
            if (onMonthRefresh) {
                card.querySelector('.card-refresh-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    onMonthRefresh(month, card.querySelector('.card-refresh-btn'));
                });
            }
            if (onMonthEdit) {
                card.querySelector('.card-edit-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showEditModal(month, onMonthEdit);
                });
            }
            container.appendChild(card);
        });
        this.refreshIcons();
    },
    _formatMonth(monthIso) {
        if (typeof I18n !== 'undefined') return I18n.formatMonth(monthIso);
        if (!monthIso) return 'N/A';
        if (!monthIso.includes('-')) return monthIso;
        const date = new Date(monthIso + "-01");
        return date.toLocaleString('default', { month: 'long' });
    },
    _getPdfUrl(absolutePath) {
        if (!absolutePath) return null;
        if (window.electron) return null; // Electron: IPC blob URL is used instead (see showMonthDetails)
        // Browser dev mode: serve via dedicated endpoint
        return '/api/source-file?path=' + encodeURIComponent(absolutePath);
    },
    showMonthDetails(monthData, showParsed = true) {
        const modal = this.getEl('drilldownModal');
        const body = this.getEl('modalBody');
        const pdfUrl = this._getPdfUrl(monthData.source_file);
        const isPdf = monthData.source_file?.toLowerCase().endsWith('.pdf');
        
        body.innerHTML = `
            <div class="modal-inner" style="max-width: 1000px; width: 95vw; height: 90vh; display: flex; flex-direction: column; position: relative;">
                <button class="close-modal" id="modalCloseBtn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(0,0,0,0.1); border: none; padding: 0.5rem; border-radius: 50%; cursor: pointer; color: var(--text-primary); z-index: 100; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                    <i data-lucide="x" style="width: 1.2rem;"></i>
                </button>
                
                <div class="modal-header">
                    <h3 id="modalTitle"></h3>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; margin-right: 2.5rem;">
                        <span class="source-file" id="modalSourceFile"></span>
                        <a id="downloadLink" href="#" target="_blank" style="font-size:0.7rem; color:var(--blue); text-decoration:none; margin-top:0.2rem;">${typeof I18n !== 'undefined' ? I18n.t('openNewTab') : 'Open in new tab'}</a>
                    </div>
                </div>
                
                <div class="modal-grid" id="parsedSummaryGrid" style="${showParsed ? 'display:grid;' : 'display:none;'}">
                   <div class="breakdown-card">
                        <h4>${typeof I18n !== 'undefined' ? I18n.t('parsedSummary') : 'Parsed Summary'}</h4>
                        <div class="breakdown-item"><span>${typeof I18n !== 'undefined' ? I18n.t('gross') : 'Gross'}:</span> <b id="detailGross"></b></div>
                        <div class="breakdown-item"><span>${typeof I18n !== 'undefined' ? I18n.t('net') : 'Net'}:</span> <b id="detailNet" style="color:var(--green);"></b></div>
                        <div class="breakdown-item"><span>${typeof I18n !== 'undefined' ? I18n.t('deductions') : 'Deductions'}:</span> <b id="detailDeductions" style="color:var(--red);"></b></div>
                   </div>
                   <div class="breakdown-card">
                        <h4>${typeof I18n !== 'undefined' ? I18n.t('deductionBreakdown') : 'Deduction Breakdown'}</h4>
                        <div class="breakdown-item"><span>${typeof I18n !== 'undefined' ? I18n.t('tax') : 'Tax'}:</span> <b id="detailTax"></b></div>
                        <div class="breakdown-item"><span>${typeof I18n !== 'undefined' ? I18n.t('pension') : 'Pension'}:</span> <b id="detailPension"></b></div>
                        <div class="breakdown-item"><span>${typeof I18n !== 'undefined' ? I18n.t('insurance') : 'Insurance'}:</span> <b id="detailInsurance"></b></div>
                   </div>
                </div>

                <div class="viewer-container" style="flex:1; display:flex; flex-direction:column; min-height:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                         <h4 class="raw-content-header" style="margin:0;">${isPdf ? (typeof I18n !== 'undefined' ? I18n.t('originalPdf') : 'Original PDF Document') : (typeof I18n !== 'undefined' ? I18n.t('rawContent') : 'Raw Document Content')}</h4>
                         ${isPdf ? `<button id="toggleRaw" style="font-size:0.7rem; background:none; border:1px solid var(--border); padding:2px 8px; border-radius:4px; cursor:pointer;">${typeof I18n !== 'undefined' ? I18n.t('showRawText') : 'Show Raw Text'}</button>` : ''}
                    </div>
                    <div id="pdfViewerFrame" style="flex:1; border:1px solid var(--border); border-radius:0.5rem; overflow:hidden; background:#525659; display:${isPdf ? 'block' : 'none'};">
                        <iframe src="${pdfUrl || 'about:blank'}" width="100%" height="100%" frameborder="0"></iframe>
                    </div>
                    <pre class="raw-content" id="rawContentArea" style="flex:1; margin:0; display:${isPdf ? 'none' : 'block'};"></pre>
                </div>
            </div>
        `;

        const modalTitleKey = showParsed ? 'modalTitleSummary' : 'modalTitleSource';
        body.querySelector('#modalTitle').textContent = typeof I18n !== 'undefined'
            ? I18n.t(modalTitleKey, { month: this._formatMonth(monthData.month) })
            : `${this._formatMonth(monthData.month)} Payslip ${showParsed ? 'Summary' : 'Source'}`;
        body.querySelector('#modalSourceFile').textContent = monthData.source_file?.split(/[\\\/]/).pop() ?? 'Unknown file';
        
        if (pdfUrl) {
            body.querySelector('#downloadLink').href = pdfUrl;
        } else if (window.electron && isPdf && monthData.source_file) {
            // Electron: load PDF bytes via IPC and create a blob URL for the iframe
            window.electron.readFileBase64(monthData.source_file).then(base64 => {
                const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const blobUrl = URL.createObjectURL(blob);
                const frame = body.querySelector('#pdfViewerFrame iframe');
                if (frame) frame.src = blobUrl;
                body.querySelector('#downloadLink').href = blobUrl;
            }).catch(() => {
                const frame = body.querySelector('#pdfViewerFrame iframe');
                if (frame) frame.parentElement.innerHTML = `<p style="color:var(--text-secondary);padding:1rem;">${typeof I18n !== 'undefined' ? I18n.t('pdfLoadError') : 'Could not load PDF.'}</p>`;
            });
        } else {
            body.querySelector('#downloadLink').style.display = 'none';
        }

        if (showParsed) {
            body.querySelector('#detailGross').textContent = `₪${monthData.gross.toLocaleString()}`;
            body.querySelector('#detailNet').textContent = `₪${monthData.net.toLocaleString()}`;
            const totalDeductions = monthData.total_deductions || ((monthData.deductions?.tax ?? 0) + (monthData.deductions?.pension ?? 0) + (monthData.deductions?.insurance ?? 0));
            body.querySelector('#detailDeductions').textContent = `₪${totalDeductions.toLocaleString()}`;
            body.querySelector('#detailTax').textContent = `₪${(monthData.deductions?.tax ?? 0).toLocaleString()}`;
            body.querySelector('#detailPension').textContent = `₪${(monthData.deductions?.pension ?? 0).toLocaleString()}`;
            body.querySelector('#detailInsurance').textContent = `₪${(monthData.deductions?.insurance ?? 0).toLocaleString()}`;
        }
        
        body.querySelector('#rawContentArea').textContent = monthData.raw_text || (typeof I18n !== 'undefined' ? I18n.t('rawTextUnavailable') : 'Raw text not available.');
        
        const toggleBtn = body.querySelector('#toggleRaw');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                const isShowingPdf = body.querySelector('#pdfViewerFrame').style.display !== 'none';
                body.querySelector('#pdfViewerFrame').style.display = isShowingPdf ? 'none' : 'block';
                body.querySelector('#rawContentArea').style.display = isShowingPdf ? 'block' : 'none';
                toggleBtn.textContent = isShowingPdf
                    ? (typeof I18n !== 'undefined' ? I18n.t('showPdfViewer') : 'Show PDF Viewer')
                    : (typeof I18n !== 'undefined' ? I18n.t('showRawText') : 'Show Raw Text');
            };
        }

        body.querySelector('#modalCloseBtn').onclick = () => this.closeModal();
        this.refreshIcons();
        modal.classList.remove('hidden');
    },
    closeModal() {
        this.getEl('drilldownModal').classList.add('hidden');
    },
    showEditModal(monthData, onSave) {
        const modal = this.getEl('editModal');
        const title = this.getEl('editModalTitle');
        const body = this.getEl('editModalBody');

        const year = monthData.month?.split('-')[0] ?? '';
        title.textContent = typeof I18n !== 'undefined'
            ? I18n.t('editPayslipTitle', { month: this._formatMonth(monthData.month), year })
            : `Edit — ${this._formatMonth(monthData.month)} ${year}`;

        const deductions = monthData.deductions || {};
        const tax = deductions.tax ?? 0;
        const pension = deductions.pension ?? 0;
        const insurance = deductions.insurance ?? 0;

        const ii = typeof I18n !== 'undefined' ? I18n : null;
        body.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1rem; padding-top:0.5rem;">
                <div>
                    <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.3rem;">${ii ? ii.t('editGrossLabel') : 'Gross'}</label>
                    <input type="number" id="editGross" class="ui-select" value="${monthData.gross}" min="0" step="0.01" style="width:100%;">
                </div>
                <div>
                    <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.3rem;">${ii ? ii.t('editNetLabel') : 'Net'}</label>
                    <input type="number" id="editNet" class="ui-select" value="${monthData.net}" min="0" step="0.01" style="width:100%;">
                </div>
                <div style="border-top:1px solid var(--border); padding-top:1rem;">
                    <p style="font-weight:600; font-size:0.8rem; margin:0 0 0.8rem; color:var(--text-secondary);">${ii ? ii.t('editDeductionsHeader') : 'Deduction Breakdown'}</p>
                    <div style="display:flex; flex-direction:column; gap:0.6rem;">
                        <div>
                            <label style="font-size:0.8rem; display:block; margin-bottom:0.2rem;">${ii ? ii.t('editTaxLabel') : 'Tax'}</label>
                            <input type="number" id="editTax" class="ui-select" value="${tax}" min="0" step="0.01" style="width:100%;">
                        </div>
                        <div>
                            <label style="font-size:0.8rem; display:block; margin-bottom:0.2rem;">${ii ? ii.t('editPensionLabel') : 'Pension'}</label>
                            <input type="number" id="editPension" class="ui-select" value="${pension}" min="0" step="0.01" style="width:100%;">
                        </div>
                        <div>
                            <label style="font-size:0.8rem; display:block; margin-bottom:0.2rem;">${ii ? ii.t('editInsuranceLabel') : 'Insurance'}</label>
                            <input type="number" id="editInsurance" class="ui-select" value="${insurance}" min="0" step="0.01" style="width:100%;">
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="padding:0; box-shadow:none; margin-top:0.5rem;">
                    <button class="action-btn secondary" id="editModalCancelBtn">${ii ? ii.t('cancelBtn') : 'Cancel'}</button>
                    <button class="action-btn" id="editModalSaveBtn" style="background:var(--accent-gradient);">${ii ? ii.t('saveBtn') : 'Save'}</button>
                </div>
            </div>
        `;

        body.querySelector('#editModalCancelBtn').onclick = () => this.closeEditModal();
        body.querySelector('#editModalSaveBtn').onclick = async () => {
            const saveBtn = body.querySelector('#editModalSaveBtn');
            const gross = parseFloat(body.querySelector('#editGross').value) || 0;
            const net = parseFloat(body.querySelector('#editNet').value) || 0;
            const taxVal = parseFloat(body.querySelector('#editTax').value) || 0;
            const pensionVal = parseFloat(body.querySelector('#editPension').value) || 0;
            const insuranceVal = parseFloat(body.querySelector('#editInsurance').value) || 0;

            const updates = {
                gross,
                net,
                total_deductions: taxVal + pensionVal + insuranceVal,
                deductions: { tax: taxVal, pension: pensionVal, insurance: insuranceVal }
            };

            saveBtn.disabled = true;
            saveBtn.textContent = typeof I18n !== 'undefined' ? I18n.t('savingBtn') : 'Saving...';
            try {
                await onSave(monthData.month, updates);
                this.closeEditModal();
            } catch (e) {
                this.showToast('Failed to save: ' + e.message, 'alert-triangle');
                saveBtn.disabled = false;
                saveBtn.textContent = typeof I18n !== 'undefined' ? I18n.t('saveBtn') : 'Save';
            }
        };

        this.refreshIcons();
        modal.classList.remove('hidden');
    },
    closeEditModal() {
        this.getEl('editModal').classList.add('hidden');
    },
    showToast(message, icon = 'check-circle', duration = 4000) {
        const toast = this.getEl('appToast');
        if (!toast) return;
        
        if (toast._timeout) clearTimeout(toast._timeout);
        toast.querySelector('.toast-msg').textContent = message;
        const iconEl = toast.querySelector('i');
        if (iconEl) iconEl.setAttribute('data-lucide', icon);
        
        this.refreshIcons();
        toast.classList.add('show');
        if (duration > 0) {
            toast._timeout = setTimeout(() => toast.classList.remove('show'), duration);
        }
    },
    hideToast() {
        const toast = this.getEl('appToast');
        if (toast) toast.classList.remove('show');
    },
    _createToast() {
        if (this.getEl('appToast')) return;
        const toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.innerHTML = `
            <div id="appToast" class="toast">
                <i data-lucide="check-circle" style="width:1.2rem;"></i>
                <span class="toast-msg"></span>
            </div>
        `;
        document.body.appendChild(toastContainer);
    },
    openSettings() {
        const modal = this.getEl('settingsModal');
        const input = this.getEl('configPathInput');
        const activePathSpan = this.getEl('currentActivePath');
        
        const currentPath = (window.APP_CONFIG?.parentDirectoryPath) || localStorage.getItem('payslip_source_path') || '';
        input.value = currentPath;
        if (activePathSpan) activePathSpan.textContent = currentPath || 'None';
        
        modal.classList.remove('hidden');

        const browseBtn = this.getEl('browsePathBtn');
        if (browseBtn && !browseBtn.dataset.setup) {
            browseBtn.dataset.setup = "true";
            
            if (window.electron) {
                // Electron: use native OS folder dialog
                browseBtn.onclick = async () => {
                    if (window.IPCHandler) {
                        const result = await window.IPCHandler.selectFolder();
                        if (result?.success) {
                            input.value = result.path;
                            if (activePathSpan) activePathSpan.textContent = result.path;
                        }
                    }
                };
            } else {
                // Browser mode: use native <input webkitdirectory> to pick a folder
                let folderInput = document.getElementById('_hiddenFolderPicker');
                if (!folderInput) {
                    folderInput = document.createElement('input');
                    folderInput.type = 'file';
                    folderInput.id = '_hiddenFolderPicker';
                    folderInput.setAttribute('webkitdirectory', '');
                    folderInput.setAttribute('directory', '');
                    folderInput.style.display = 'none';
                    document.body.appendChild(folderInput);
                }
                
                browseBtn.onclick = () => folderInput.click();
                
                folderInput.onchange = () => {
                    if (folderInput.files && folderInput.files.length > 0) {
                        // Extract the folder path from the first file's webkitRelativePath
                        const firstFile = folderInput.files[0];
                        const relativePath = firstFile.webkitRelativePath;
                        // relativePath = "FolderName/file.pdf" — we need the full path
                        // Browsers don't expose full absolute paths for security. 
                        // We get the folder name and the user must confirm or edit.
                        const folderName = relativePath.split('/')[0];
                        // Try to construct from existing path hint
                        const existing = input.value;
                        const parentGuess = existing
                            ? existing.replace(/[/\\][^/\\]+\s*$/, '') // strip last segment
                            : '';
                        // Show helpful partial path so user can correct it
                        const guessedPath = parentGuess 
                            ? parentGuess + '\\' + folderName
                            : folderName;
                        input.value = guessedPath;
                        if (activePathSpan) activePathSpan.textContent = guessedPath;
                        this.showToast(typeof I18n !== 'undefined' ? I18n.t('toastFolderSelected') : 'Folder selected. Verify path and click Update Dashboard.', 'info');
                    }
                    folderInput.value = ''; // reset so same folder can be re-picked
                };
            }
        }
    },
    closeSettings() {
        this.getEl('settingsModal').classList.add('hidden');
    },
    renderAllYearsDashboard(summaryData, lifetimeTotals, onYearClick, onYearRefresh) {
        const setVal = (id, val) => {
            const el = document.querySelector(`${id} .kpi-value`);
            if (el) el.textContent = val;
        };
        setVal('#summary-gross', `₪${lifetimeTotals.gross.toLocaleString()}`);
        setVal('#summary-net', `₪${lifetimeTotals.net.toLocaleString()}`);
        setVal('#summary-years', summaryData.length);

        ChartManager.initAllYearsCharts(summaryData, lifetimeTotals);

        const grid = this.getEl('yearCardsGrid');
        if (grid) {
            grid.innerHTML = summaryData.map(item => {
                const year = parseInt(item.year) || 0;
                const months = parseInt(item.monthsCount) || 0;
                const failed = parseInt(item.failedCount) || 0;
                const totalGross = Number(item.totalGross) || 0;
                const totalNet = Number(item.totalNet) || 0;
                const failRatio = months > 0 ? failed / months : 0;
                const shadowStyle = failRatio > 0
                    ? ` style="box-shadow: 0 0 0 2px rgba(239,68,68,${(failRatio * 0.6 + 0.2).toFixed(2)}), 0 4px 16px rgba(239,68,68,${(failRatio * 0.35).toFixed(2)});"`
                    : '';
                const i18 = typeof I18n !== 'undefined' ? I18n : null;
                return `
                <div class="year-card" data-year="${year}"${shadowStyle}>
                    <div class="card-header">
                        <span class="year-label">${year}</span>
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <span class="months-tag">${months} ${i18 ? i18.t('months') : 'Months'}</span>
                            <button class="card-refresh-btn" data-year="${year}" title="${i18 ? i18.t('reingestYear', { year }) : `Re-ingest ${year}`}"><i data-lucide="refresh-cw"></i></button>
                        </div>
                    </div>
                    <div class="card-metrics">
                        <div class="metric-item">
                            <span class="metric-label">${i18 ? i18.t('totalGross') : 'Total Gross'}</span>
                            <span class="metric-value">₪${totalGross.toLocaleString()}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">${i18 ? i18.t('totalNet') : 'Total Net'}</span>
                            <span class="metric-value net">₪${totalNet.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                `;
            }).join('');
            
            grid.querySelectorAll('.year-card').forEach(card => {
                card.onclick = () => onYearClick(card.getAttribute('data-year'));
            });
            if (onYearRefresh) {
                grid.querySelectorAll('.card-refresh-btn[data-year]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        onYearRefresh(btn.dataset.year, btn);
                    });
                });
            }
        }

        this.refreshIcons();
    },
    toggleView(isSummary) {
        this.getEl('allYearsContent').classList.toggle('hidden', !isSummary);
        this.getEl('yearlyContent').classList.toggle('hidden', isSummary);
        this.getEl('backToSummary').classList.toggle('hidden', isSummary);
    },
    showWelcomeScreen() {
        this.toggleView(true);
        const i18 = typeof I18n !== 'undefined' ? I18n : null;
        this.getEl('mainTitle').innerHTML = i18 ? i18.t('welcomeTitle') : 'Welcome to Payslip Dashboard';
        const grid = this.getEl('yearCardsGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="welcome-card" style="grid-column: 1 / -1; padding: 2rem; border: 2px dashed var(--border); border-radius: 1rem; text-align: center; background: var(--bg-card);">
                    <i data-lucide="folder-search" style="width: 3rem; height: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <h3 style="margin-bottom: 0.5rem;">${i18 ? i18.t('noDataFound') : 'No Data Found'}</h3>
                    <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">${i18 ? i18.t('noDataHint') : 'Select the folder containing your PDF payslips to get started.'}</p>
                    <button class="action-btn" onclick="window.IPCHandler && window.IPCHandler.isEnabled ? window.IPCHandler.selectFolder() : UIManager.openSettings()">
                        <i data-lucide="folder-plus"></i> ${i18 ? i18.t('selectFolder') : 'Select Folder'}
                    </button>
                </div>
            `;
            this.refreshIcons();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    UIManager._createToast();
    const themeSwitch = document.getElementById('themeSwitch');
    if (themeSwitch) {
        themeSwitch.addEventListener('change', (e) => {
            document.body.className = e.target.checked ? 'dark-mode' : 'light-mode';
        });
    }
    const openBtn = document.getElementById('openSettings');
    if (openBtn) openBtn.onclick = () => UIManager.openSettings();

    document.querySelectorAll('.close-settings').forEach(btn => {
        btn.onclick = () => UIManager.closeSettings();
    });

    document.querySelectorAll('.close-edit-modal').forEach(btn => {
        btn.onclick = () => UIManager.closeEditModal();
    });

    const closeBtn = document.querySelector('.close-modal');
    if (closeBtn) closeBtn.onclick = () => UIManager.closeModal();

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
    });
});

if (typeof module !== 'undefined' && module.exports) module.exports = UIManager;
