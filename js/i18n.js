const I18n = {
    lang: localStorage.getItem('payslip_lang') || 'en',

    translations: {
        en: {
            // Header
            darkMode: 'Dark Mode',
            allYearsSummary: 'All Years Summary',
            backToSummary: 'Back to Summary',
            refreshData: 'Refresh Data',
            // Titles
            payslipOverview: '{year} Payslip Overview',
            lifetimeSummary: 'Lifetime Payslip Summary',
            welcomeTitle: 'Welcome to Payslip Dashboard',
            // KPI labels
            lifetimeGross: 'Lifetime Gross',
            lifetimeNet: 'Lifetime Net',
            activeYears: 'Active Years',
            grossIncome: 'Gross Income',
            netIncome: 'Net Income',
            deductions: 'Deductions',
            monthlyAverage: 'Monthly Average',
            // Chart sections
            yoyGrowthTitle: 'Year-over-Year Gross Growth',
            lifetimeComboTitle: 'Lifetime Composition & Trends',
            monthlyBreakdown: 'Monthly Breakdown',
            allMonths: 'All Months',
            allComponents: 'All Components',
            composition: 'Composition',
            // Trend row
            highestPeak: 'Highest Peak',
            lowestPoint: 'Lowest Point',
            volatilityInsight: 'Volatility Insight',
            // Sidebar
            insights: 'Insights',
            monthlySnapshots: 'Monthly Snapshots',
            // Year cards section
            historicalArchives: 'Historical Archives',
            selectYearHint: 'Select a year to explore details',
            // Month card
            gross: 'Gross',
            net: 'Net',
            viewSource: 'View Source',
            // Month card buttons
            editMonth: 'Edit {month} data',
            reingestMonth: 'Re-ingest {month}',
            reingestYear: 'Re-ingest {year}',
            // Year card metrics
            months: 'Months',
            totalGross: 'Total Gross',
            totalNet: 'Total Net',
            // Modal: drilldown
            modalTitleSummary: '{month} Payslip Summary',
            modalTitleSource: '{month} Payslip Source',
            originalPdf: 'Original PDF Document',
            rawContent: 'Raw Document Content',
            showRawText: 'Show Raw Text',
            showPdfViewer: 'Show PDF Viewer',
            openNewTab: 'Open in new tab',
            parsedSummary: 'Parsed Summary',
            deductionBreakdown: 'Deduction Breakdown',
            tax: 'Tax',
            pension: 'Pension',
            insurance: 'Insurance',
            // Edit modal
            editPayslipTitle: 'Edit — {month} {year}',
            editGrossLabel: 'Gross',
            editNetLabel: 'Net',
            editDeductionsHeader: 'Deduction Breakdown',
            editTaxLabel: 'Tax',
            editPensionLabel: 'Pension',
            editInsuranceLabel: 'Insurance',
            savingBtn: 'Saving...',
            saveBtn: 'Save',
            cancelBtn: 'Cancel',
            // Settings modal
            settingsTitle: 'Dashboard Settings',
            settingsPathLabel: 'Payslips Source Folder',
            settingsPathPlaceholder: 'Enter path to your payslips folder',
            settingsPathBrowse: 'Browse',
            settingsPathGuide1: 'Folder must contain year folders (e.g., /2023, /2024)',
            settingsPathGuide2: 'Currently active:',
            settingsUpdate: 'Update Dashboard',
            // Footer
            pdfExport: 'PDF Export',
            pngExport: 'PNG Export',
            generatedOn: 'Generated on',
            // Welcome screen
            noDataFound: 'No Data Found',
            noDataHint: 'Select the folder containing your PDF payslips to get started.',
            selectFolder: 'Select Folder',
            // Component filter options
            compGross: 'Gross',
            compNet: 'Net',
            compDeductions: 'Deductions',
            // Chart dataset labels
            chartGross: 'Gross Salary',
            chartNet: 'Net Salary',
            chartDeductions: 'Deductions',
            chartBase: 'Base',
            chartBonus: 'Bonus',
            chartOvertime: 'Overtime',
            chartTax: 'Tax',
            chartPension: 'Pension',
            chartInsurance: 'Insurance',
            // Chart all-years labels
            chartAvgNet: 'Avg Net',
            chartYoyGross: 'YoY Gross Growth %',
            chartTotalGross: 'Total Gross',
            // Toast
            toastFolderSelected: 'Folder selected. Verify path and click Update Dashboard.',
            toastSyncFailed: 'Sync failed: ',
            toastNoData: 'No data available for ',
            toastRefreshFailed: 'Refresh failed: ',
            toastSaveFailed: 'Failed to save: ',
            toastSaveOk: 'Data saved successfully!',
            toastPathEmpty: 'Path cannot be empty!',
            toastPathAbsolute: 'Please provide an absolute path (e.g. C:\\Payslips)',
            toastPathUpdated: 'Folder path updated successfully!',
            toastPathUpdatedBrowser: 'Path updated! Ingestion running in background…',
            toastPathFailed: 'Server failed to save path: ',
            toastPathError: 'Failed to update folder path. Please check if the path exists.',
            toastPathUpdating: 'Updating...',
            toastIngestComplete: 'Ingestion complete — {count} payslips',
            toastIngestError: 'Ingestion error: ',
            // Progress
            progressStarting: 'Starting…',
            progressProcessing: 'Processing…',
            // PDF load error
            pdfLoadError: 'Could not load PDF.',
            // Raw text
            rawTextUnavailable: 'Raw text not available.',
        },
        he: {
            // Header
            darkMode: 'מצב לילה',
            allYearsSummary: 'סיכום כל השנים',
            backToSummary: 'חזרה לסיכום',
            refreshData: 'רענן נתונים',
            // Titles
            payslipOverview: 'סקירת {year}',
            lifetimeSummary: 'סיכום תלושי שכר',
            welcomeTitle: 'ברוכים הבאים ללוח תלושי שכר',
            // KPI labels
            lifetimeGross: 'ברוטו כולל',
            lifetimeNet: 'נטו כולל',
            activeYears: 'שנים פעילות',
            grossIncome: 'הכנסה ברוטו',
            netIncome: 'הכנסה נטו',
            deductions: 'ניכויים',
            monthlyAverage: 'ממוצע חודשי',
            // Chart sections
            yoyGrowthTitle: 'גידול ברוטו שנתי',
            lifetimeComboTitle: 'הרכב ומגמות לאורך זמן',
            monthlyBreakdown: 'פירוט חודשי',
            allMonths: 'כל החודשים',
            allComponents: 'כל הרכיבים',
            composition: 'הרכב',
            // Trend row
            highestPeak: 'שיא הכנסה',
            lowestPoint: 'הכנסה נמוכה ביותר',
            volatilityInsight: 'תובנת שונות',
            // Sidebar
            insights: 'תובנות',
            monthlySnapshots: 'תמונות חודשיות',
            // Year cards section
            historicalArchives: 'ארכיון היסטורי',
            selectYearHint: 'בחר שנה לפירוט',
            // Month card
            gross: 'ברוטו',
            net: 'נטו',
            viewSource: 'צפה במקור',
            // Month card buttons
            editMonth: 'עריכת {month}',
            reingestMonth: 'עיבוד מחדש {month}',
            reingestYear: 'עיבוד מחדש {year}',
            // Year card metrics
            months: 'חודשים',
            totalGross: 'סה"כ ברוטו',
            totalNet: 'סה"כ נטו',
            // Modal: drilldown
            modalTitleSummary: 'תלוש {month} — סיכום',
            modalTitleSource: 'תלוש {month} — מקור',
            originalPdf: 'מסמך PDF מקורי',
            rawContent: 'תוכן המסמך הגולמי',
            showRawText: 'הצג טקסט גולמי',
            showPdfViewer: 'הצג PDF',
            openNewTab: 'פתח בכרטיסייה חדשה',
            parsedSummary: 'סיכום מנותח',
            deductionBreakdown: 'פירוט ניכויים',
            tax: 'מס הכנסה',
            pension: 'פנסיה',
            insurance: 'ביטוח לאומי',
            // Edit modal
            editPayslipTitle: 'עריכה — {month} {year}',
            editGrossLabel: 'ברוטו',
            editNetLabel: 'נטו',
            editDeductionsHeader: 'פירוט ניכויים',
            editTaxLabel: 'מס הכנסה',
            editPensionLabel: 'פנסיה',
            editInsuranceLabel: 'ביטוח לאומי',
            savingBtn: 'שומר...',
            saveBtn: 'שמור',
            cancelBtn: 'ביטול',
            // Settings modal
            settingsTitle: 'הגדרות לוח המחוונים',
            settingsPathLabel: 'תיקיית תלושי שכר',
            settingsPathPlaceholder: 'הזן נתיב לתיקיית התלושים',
            settingsPathBrowse: 'עיון',
            settingsPathGuide1: 'התיקייה חייבת להכיל תיקיות שנה (לדוגמה: /2023, /2024)',
            settingsPathGuide2: 'פעיל כעת:',
            settingsUpdate: 'עדכן לוח מחוונים',
            // Footer
            pdfExport: 'ייצוא PDF',
            pngExport: 'ייצוא PNG',
            generatedOn: 'נוצר ב',
            // Welcome screen
            noDataFound: 'לא נמצאו נתונים',
            noDataHint: 'בחר את התיקיה המכילה את תלושי השכר כדי להתחיל.',
            selectFolder: 'בחר תיקיה',
            // Component filter options
            compGross: 'ברוטו',
            compNet: 'נטו',
            compDeductions: 'ניכויים',
            // Chart dataset labels
            chartGross: 'שכר ברוטו',
            chartNet: 'שכר נטו',
            chartDeductions: 'ניכויים',
            chartBase: 'בסיס',
            chartBonus: 'בונוס',
            chartOvertime: 'שעות נוספות',
            chartTax: 'מס הכנסה',
            chartPension: 'פנסיה',
            chartInsurance: 'ביטוח לאומי',
            // Chart all-years labels
            chartAvgNet: 'ממוצע נטו',
            chartYoyGross: 'צמיחת ברוטו שנתית %',
            chartTotalGross: 'סה"כ ברוטו',
            // Toast
            toastFolderSelected: 'תיקיה נבחרה. אמת נתיב ולחץ עדכן.',
            toastSyncFailed: 'סנכרון נכשל: ',
            toastNoData: 'אין נתונים עבור ',
            toastRefreshFailed: 'רענון נכשל: ',
            toastSaveFailed: 'שמירה נכשלה: ',
            toastSaveOk: 'הנתונים נשמרו בהצלחה!',
            toastPathEmpty: 'הנתיב לא יכול להיות ריק!',
            toastPathAbsolute: 'אנא הזן נתיב מלא (לדוגמה: C:\\Payslips)',
            toastPathUpdated: 'נתיב עודכן בהצלחה!',
            toastPathUpdatedBrowser: 'נתיב עודכן! עיבוד רץ ברקע…',
            toastPathFailed: 'שגיאת שרת בשמירת הנתיב: ',
            toastPathError: 'עדכון הנתיב נכשל. בדוק שהתיקיה קיימת.',
            toastPathUpdating: 'מעדכן...',
            toastIngestComplete: 'עיבוד הושלם — {count} תלושים',
            toastIngestError: 'שגיאת עיבוד: ',
            // Progress
            progressStarting: 'מתחיל…',
            progressProcessing: 'מעבד…',
            // PDF load error
            pdfLoadError: 'לא ניתן לטעון PDF.',
            // Raw text
            rawTextUnavailable: 'טקסט גולמי אינו זמין.',
        }
    },

    t(key, vars) {
        const dict = this.translations[this.lang] || this.translations.en;
        let str = dict[key] ?? this.translations.en[key] ?? key;
        if (vars) {
            Object.entries(vars).forEach(([k, v]) => {
                str = str.replace(`{${k}}`, v);
            });
        }
        return str;
    },

    setLang(lang) {
        this.lang = lang;
        localStorage.setItem('payslip_lang', lang);
        this._applyDir();
        this.apply();
        document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
    },

    _applyDir() {
        const isRtl = this.lang === 'he';
        document.documentElement.setAttribute('lang', this.lang);
        document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
        document.body.classList.toggle('lang-he', isRtl);
    },

    apply() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = this.t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) el.placeholder = this.t(key);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (key) el.title = this.t(key);
        });
        // Update year selector default option
        const yearSelect = document.getElementById('yearSelect');
        if (yearSelect && yearSelect.options[0]) {
            yearSelect.options[0].textContent = this.t('allYearsSummary');
        }
        // Update month filter options
        const monthFilter = document.getElementById('monthFilter');
        if (monthFilter && monthFilter.options[0]) {
            monthFilter.options[0].textContent = this.t('allMonths');
        }
        // Update component filter
        const compFilter = document.getElementById('componentFilter');
        if (compFilter && compFilter.options.length >= 4) {
            compFilter.options[0].textContent = this.t('allComponents');
            compFilter.options[1].textContent = this.t('compGross');
            compFilter.options[2].textContent = this.t('compNet');
            compFilter.options[3].textContent = this.t('compDeductions');
        }
        // Update lang toggle button tooltip
        const btn = document.getElementById('langToggleBtn');
        if (btn) btn.title = this.lang === 'en' ? 'Switch to Hebrew' : 'Switch to English';
    },

    formatMonth(monthIso) {
        if (!monthIso || !monthIso.includes('-')) return monthIso || 'N/A';
        const date = new Date(monthIso + '-01');
        const locale = this.lang === 'he' ? 'he-IL' : 'default';
        return date.toLocaleString(locale, { month: 'long' });
    },

    init() {
        this._applyDir();
        document.addEventListener('DOMContentLoaded', () => {
            this.apply();
            const btn = document.getElementById('langToggleBtn');
            if (btn) {
                btn.addEventListener('click', () => {
                    this.setLang(this.lang === 'en' ? 'he' : 'en');
                    // Re-render if App is available
                    if (window.App) window.App.render();
                });
            }
        });
    }
};

I18n.init();

if (typeof module !== 'undefined' && module.exports) module.exports = I18n;
