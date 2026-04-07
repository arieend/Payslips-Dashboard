import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import I18n from '../../js/i18n.js';

// ──── helpers ────────────────────────────────────────────────────────────────

function setLangAndApply(lang) {
    I18n.lang = lang;
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    document.body.classList.toggle('lang-he', lang === 'he');
}

// ──── tests ───────────────────────────────────────────────────────────────────

describe('I18n — core translation', () => {
    beforeEach(() => {
        I18n.lang = 'en';
    });

    describe('t()', () => {
        it('returns English string for known key', () => {
            expect(I18n.t('darkMode')).toBe('Dark Mode');
        });

        it('returns Hebrew string after switching lang to he', () => {
            I18n.lang = 'he';
            expect(I18n.t('darkMode')).toBe('מצב לילה');
        });

        it('interpolates {var} placeholders', () => {
            expect(I18n.t('payslipOverview', { year: '2024' })).toBe('2024 Payslip Overview');
        });

        it('interpolates multiple placeholders', () => {
            expect(I18n.t('editPayslipTitle', { month: 'March', year: '2024' })).toBe('Edit — March 2024');
        });

        it('falls back to English when key is missing from Hebrew dict', () => {
            I18n.lang = 'he';
            // Temporarily remove a key from the Hebrew dict to test fallback
            const saved = I18n.translations.he.darkMode;
            delete I18n.translations.he.darkMode;
            expect(I18n.t('darkMode')).toBe('Dark Mode');
            I18n.translations.he.darkMode = saved;
        });

        it('returns the key itself when the key does not exist in any dict', () => {
            expect(I18n.t('nonExistentKey_xyz')).toBe('nonExistentKey_xyz');
        });

        it('returns correct plural-style string with count interpolation', () => {
            expect(I18n.t('toastIngestComplete', { count: 42 })).toBe('Ingestion complete — 42 payslips');
        });

        it('returns Hebrew interpolated string', () => {
            I18n.lang = 'he';
            expect(I18n.t('toastIngestComplete', { count: 5 })).toBe('עיבוד הושלם — 5 תלושים');
        });
    });

    describe('translation completeness', () => {
        it('every English key has a corresponding Hebrew translation', () => {
            const enKeys = Object.keys(I18n.translations.en);
            const heKeys = Object.keys(I18n.translations.he);
            const missing = enKeys.filter(k => !heKeys.includes(k));
            expect(missing).toEqual([]);
        });

        it('every Hebrew key exists in the English dict (no orphan keys)', () => {
            const enKeys = Object.keys(I18n.translations.en);
            const heKeys = Object.keys(I18n.translations.he);
            const orphans = heKeys.filter(k => !enKeys.includes(k));
            expect(orphans).toEqual([]);
        });

        it('no translation value is an empty string', () => {
            for (const [lang, dict] of Object.entries(I18n.translations)) {
                for (const [key, val] of Object.entries(dict)) {
                    expect(val, `${lang}.${key} must not be empty`).not.toBe('');
                }
            }
        });
    });
});

describe('I18n — setLang()', () => {
    const originalLang = I18n.lang;

    beforeEach(() => {
        document.body.innerHTML = `
            <span data-i18n="darkMode">Dark Mode</span>
            <span data-i18n="deductions">Deductions</span>
            <input data-i18n-placeholder="settingsPathPlaceholder" />
            <div data-i18n-title="refreshData" title="Refresh Data"></div>
            <select id="yearSelect"><option value="summary">All Years Summary</option></select>
            <select id="monthFilter"><option value="all">All Months</option></select>
            <select id="componentFilter">
                <option value="all">All Components</option>
                <option value="gross">Gross</option>
                <option value="net">Net</option>
                <option value="deductions">Deductions</option>
            </select>
            <button id="langToggleBtn"></button>
        `;
        global.localStorage = {
            _store: {},
            getItem(k) { return this._store[k] ?? null; },
            setItem(k, v) { this._store[k] = v; },
            removeItem(k) { delete this._store[k]; }
        };
    });

    afterEach(() => {
        I18n.lang = originalLang;
        document.documentElement.removeAttribute('dir');
        document.documentElement.setAttribute('lang', 'en');
        document.body.classList.remove('lang-he');
    });

    it('switches DOM text nodes to Hebrew on setLang("he")', () => {
        I18n.setLang('he');
        expect(document.querySelector('[data-i18n="darkMode"]').textContent).toBe('מצב לילה');
        expect(document.querySelector('[data-i18n="deductions"]').textContent).toBe('ניכויים');
    });

    it('switches back to English on setLang("en")', () => {
        I18n.setLang('he');
        I18n.setLang('en');
        expect(document.querySelector('[data-i18n="darkMode"]').textContent).toBe('Dark Mode');
    });

    it('updates placeholder on data-i18n-placeholder elements', () => {
        I18n.setLang('he');
        expect(document.querySelector('[data-i18n-placeholder]').placeholder).toBe('הזן נתיב לתיקיית התלושים');
    });

    it('updates title on data-i18n-title elements', () => {
        I18n.setLang('he');
        expect(document.querySelector('[data-i18n-title]').title).toBe('רענן נתונים');
    });

    it('sets dir="rtl" on <html> when switching to Hebrew', () => {
        I18n.setLang('he');
        expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    });

    it('sets dir="ltr" on <html> when switching back to English', () => {
        I18n.setLang('he');
        I18n.setLang('en');
        expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    });

    it('adds lang-he class to body for Hebrew', () => {
        I18n.setLang('he');
        expect(document.body.classList.contains('lang-he')).toBe(true);
    });

    it('removes lang-he class from body for English', () => {
        I18n.setLang('he');
        I18n.setLang('en');
        expect(document.body.classList.contains('lang-he')).toBe(false);
    });

    it('sets html lang attribute to "he"', () => {
        I18n.setLang('he');
        expect(document.documentElement.getAttribute('lang')).toBe('he');
    });

    it('updates year selector first option text', () => {
        I18n.setLang('he');
        expect(document.querySelector('#yearSelect option[value="summary"]').textContent).toBe('סיכום כל השנים');
    });

    it('updates component filter options to Hebrew', () => {
        I18n.setLang('he');
        const opts = document.querySelectorAll('#componentFilter option');
        expect(opts[0].textContent).toBe('כל הרכיבים');
        expect(opts[1].textContent).toBe('ברוטו');
        expect(opts[2].textContent).toBe('נטו');
        expect(opts[3].textContent).toBe('ניכויים');
    });

    it('persists language choice to localStorage', () => {
        I18n.setLang('he');
        expect(global.localStorage.getItem('payslip_lang')).toBe('he');
    });

    it('dispatches a langchange custom event', () => {
        const handler = vi.fn();
        document.addEventListener('langchange', handler);
        I18n.setLang('he');
        document.removeEventListener('langchange', handler);
        expect(handler).toHaveBeenCalledOnce();
        expect(handler.mock.calls[0][0].detail).toEqual({ lang: 'he' });
    });
});

describe('I18n — formatMonth()', () => {
    afterEach(() => {
        I18n.lang = 'en';
    });

    it('returns English month name in English mode', () => {
        I18n.lang = 'en';
        const result = I18n.formatMonth('2024-03');
        expect(result).toBe('March');
    });

    it('returns Hebrew month name in Hebrew mode', () => {
        I18n.lang = 'he';
        const result = I18n.formatMonth('2024-03');
        // "מרץ" or "מרס" depending on locale engine — just verify it's non-empty and not English
        expect(result).toBeTruthy();
        expect(result).not.toBe('March');
    });

    it('returns original value for non-ISO strings', () => {
        I18n.lang = 'en';
        expect(I18n.formatMonth('2024')).toBe('2024');
    });

    it('returns "N/A" for falsy input', () => {
        expect(I18n.formatMonth('')).toBe('N/A');
        expect(I18n.formatMonth(null)).toBe('N/A');
        expect(I18n.formatMonth(undefined)).toBe('N/A');
    });
});

describe('I18n — apply() DOM update', () => {
    beforeEach(() => {
        I18n.lang = 'en';
        document.body.innerHTML = `
            <span data-i18n="grossIncome">Gross Income</span>
            <span data-i18n="netIncome">Net Income</span>
            <span data-i18n="insights">Insights</span>
            <button id="langToggleBtn"></button>
        `;
    });

    it('updates all data-i18n elements to current language strings', () => {
        I18n.lang = 'he';
        I18n.apply();
        expect(document.querySelector('[data-i18n="grossIncome"]').textContent).toBe('הכנסה ברוטו');
        expect(document.querySelector('[data-i18n="netIncome"]').textContent).toBe('הכנסה נטו');
        expect(document.querySelector('[data-i18n="insights"]').textContent).toBe('תובנות');
    });

    it('restores English after switching back', () => {
        I18n.lang = 'he';
        I18n.apply();
        I18n.lang = 'en';
        I18n.apply();
        expect(document.querySelector('[data-i18n="grossIncome"]').textContent).toBe('Gross Income');
    });
});

describe('I18n — key coverage spot-checks', () => {
    const criticalKeys = [
        'darkMode', 'allYearsSummary', 'lifetimeSummary', 'payslipOverview',
        'grossIncome', 'netIncome', 'deductions', 'monthlyAverage',
        'monthlyBreakdown', 'composition', 'historicalArchives',
        'highestPeak', 'lowestPoint', 'volatilityInsight',
        'insights', 'monthlySnapshots', 'pdfExport', 'pngExport',
        'settingsTitle', 'settingsUpdate', 'cancelBtn', 'saveBtn',
        'viewSource', 'gross', 'net', 'totalGross', 'totalNet',
        'chartGross', 'chartNet', 'chartDeductions',
        'chartTax', 'chartPension', 'chartInsurance',
        'toastSaveOk', 'toastIngestComplete', 'noDataFound',
    ];

    criticalKeys.forEach(key => {
        it(`"${key}" exists in both en and he dicts`, () => {
            expect(I18n.translations.en[key]).toBeTruthy();
            expect(I18n.translations.he[key]).toBeTruthy();
        });

        it(`"${key}" en and he values are different strings`, () => {
            expect(I18n.translations.en[key]).not.toBe(I18n.translations.he[key]);
        });
    });
});
