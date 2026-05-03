import { describe, it, expect } from 'vitest';
const { extractDataFromText, findValueInLine, parseNum } = require('../../scripts/finance-parser');

// ─── parseNum ────────────────────────────────────────────────────────────────
describe('parseNum()', () => {
    it('parses plain integers', () => expect(parseNum('1500')).toBe(1500));
    it('strips comma separators', () => expect(parseNum('15,000')).toBe(15000));
    it('parses decimals', () => expect(parseNum('12,345.67')).toBe(12345.67));
    it('returns 0 for null/undefined', () => {
        expect(parseNum(null)).toBe(0);
        expect(parseNum(undefined)).toBe(0);
    });
    it('returns 0 for non-numeric strings', () => expect(parseNum('abc')).toBe(0));
    it('handles numeric input (toString coercion)', () => expect(parseNum(9999)).toBe(9999));
});

// ─── findValueInLine ──────────────────────────────────────────────────────────
describe('findValueInLine()', () => {
    it('finds value in English format (keyword then number)', () => {
        expect(findValueInLine(['Gross Total'], 'Gross Total: 15,000')).toBe(15000);
    });

    it('finds value in Hebrew format (number then keyword)', () => {
        // Number precedes Hebrew keyword: "15,000 ברוטו"
        expect(findValueInLine(['ברוטו'], '15,000 ברוטו')).toBe(15000);
    });

    it('respects max option — returns null when value exceeds max', () => {
        expect(findValueInLine(['Net Pay'], 'Net Pay 99999', { max: 50000 })).toBe(null);
    });

    it('respects max option — returns value when within max', () => {
        expect(findValueInLine(['Net Pay'], 'Net Pay 30000', { max: 50000 })).toBe(30000);
    });

    it('returns null when no keyword matches', () => {
        expect(findValueInLine(['Gross Total'], 'nothing here')).toBe(null);
    });

    it('skips excludeBasis lines containing "Basis"', () => {
        expect(findValueInLine(['Pension'], 'Pension Basis 5000', { excludeBasis: true })).toBe(null);
    });

    it('skips excludeBasis lines containing "Cumulative"', () => {
        expect(findValueInLine(['Pension'], 'Pension Cumulative 5000', { excludeBasis: true })).toBe(null);
    });
});

// ─── extractDataFromText – standard formats ───────────────────────────────────
describe('extractDataFromText() — standard parsing', () => {
    it('parses Hebrew keywords (January 2024 format)', () => {
        const text = `
            מועד תשלום: ינואר 2024
            סה"כ תשלומים: 15,000.00
            נטו לתשלום: 12,000.00
            משכורת: 13,000.00
            מס הכנסה: 1,000.00
            ביטוח לאומי: 500.00
            ביטוח בריאות: 500.00
        `;
        const data = extractDataFromText(text);
        expect(data.month).toBe('2024-01');
        expect(data.gross).toBe(15000);
        expect(data.net).toBe(12000);
        expect(data.earnings.base).toBe(13000);
        expect(data.deductions.tax).toBe(1000);
        expect(data.total_deductions).toBe(3000);
    });

    it('parses English keywords', () => {
        const text = `
            Month: 2023-12
            Gross Total: 20,000.00
            Net for Payment: 14,000.00
            Base Salary: 18,000.00
            Bonus: 2,000.00
            Income Tax: 4,000.00
            Pension: 1,000.00
            National Insurance: 1,000.00
        `;
        const data = extractDataFromText(text);
        expect(data.month).toBe('2023-12');
        expect(data.gross).toBe(20000);
        expect(data.net).toBe(14000);
        expect(data.earnings.base).toBe(18000);
        expect(data.earnings.bonus).toBe(2000);
        expect(data.total_deductions).toBe(6000);
    });

    it('detects month from ISO date pattern "Month: YYYY-MM"', () => {
        const text = 'Month: 2024-06\nGross Total: 10000\nNet for Payment: 8000';
        const data = extractDataFromText(text);
        expect(data.month).toBe('2024-06');
    });

    it('returns empty month when no date information exists', () => {
        const data = extractDataFromText('some random text without dates');
        expect(data.month).toBe('');
    });

    it('computes total_deductions as gross − net when both are present', () => {
        const text = 'Month: 2024-03\nGross Total: 18000\nNet for Payment: 14000';
        const data = extractDataFromText(text);
        expect(data.total_deductions).toBe(4000);
    });

    it('stores raw_text on the result', () => {
        const text = 'Month: 2024-01\nGross Total: 10000\nNet for Payment: 8000';
        const data = extractDataFromText(text);
        expect(data.raw_text).toBe(text);
    });
});

// ─── extractDataFromText – fallback strategies ────────────────────────────────
describe('extractDataFromText() — fallback strategies', () => {
    it('Fallback 1: ברוטו לב.לאומי — extracts gross when dot blocks standard regex', () => {
        // The dot in "לב.לאומי" stops the standard keyword regex;
        // fallback 1 uses a wildcard regex allowing dots between keyword and number.
        const text = 'Month: 2024-03\nברוטו לב.לאומי 15,000\nנטו לתשלום 12,000';
        const data = extractDataFromText(text);
        expect(data.gross).toBe(15000);
        expect(data.net).toBe(12000);
        expect(data.total_deductions).toBe(3000);
    });

    it('Fallback 1: resets gross > 100,000 (likely a YTD cumulative) and falls back', () => {
        // If the standard regex grabs a YTD cumulative (> 100k), fallback 1 resets
        // and re-extracts from the "ברוטו לאומי" pattern.
        const text = [
            'Month: 2024-04',
            'ברוטו 250,000',           // YTD cumulative — should be discarded
            'ברוטו חייב בפם 16,000', // actual monthly gross
            'נטו לתשלום 13,000'
        ].join('\n');
        const data = extractDataFromText(text);
        expect(data.gross).toBe(16000);
    });

    it('Fallback 2: Old Hilan — concatenated agorot values (pre-2012 scanned)', () => {
        // Deductions appear without a space after the Hebrew keyword and are in agorot (÷100).
        const text = [
            'Month: 2024-06',
            'ברוטו 15000',
            'נטו 12000',
            'מס הכנסה317500',   // 317500 agorot → 3,175 NIS
            'ב.בריאות58047',     // 580 NIS
            'לאומי109347'        // 1,093 NIS
        ].join('\n');
        const data = extractDataFromText(text);
        expect(data.deductions.tax).toBe(3175);
        expect(data.deductions.insurance).toBe(580 + 1093);
    });

    it('Fallback 2: OCR misread ס→מ is handled (מם הכנסה)', () => {
        const text = [
            'Month: 2024-07',
            'ברוטו 15000',
            'נטו 12000',
            'מם הכנסה250000'   // OCR garble of מס הכנסה; 250000 agorot → 2500 NIS
        ].join('\n');
        const data = extractDataFromText(text);
        expect(data.deductions.tax).toBe(2500);
    });

    it('Fallback 3: Old Hilan summary-row — three agorot values before תגמולים', () => {
        // A row with three numbers where gross − ded ≈ net (±2%) sits just before
        // "תגמולים" or "נתונים תצטברים".  Values are in agorot (÷100).
        const text = [
            'Month: 2024-04',
            '1500000 350000 1150000',   // 15000, 3500, 11500 in NIS
            'תגמולים'
        ].join('\n');
        const data = extractDataFromText(text);
        expect(data.gross).toBe(15000);
        expect(data.net).toBe(11500);
        expect(data.total_deductions).toBe(3500);
    });

    it('Fallback 3: also matches "נתונים תצטברים" header variant', () => {
        const text = [
            'Month: 2024-05',
            '1200000 240000 960000',
            'נתונים תצטברים'
        ].join('\n');
        const data = extractDataFromText(text);
        expect(data.gross).toBe(12000);
        expect(data.net).toBe(9600);
    });

    it('Fallback 4: phone-camera net fallback — "שכר נטו" on a Grossing-excluded line', () => {
        // The main-loop net extraction skips lines containing "Grossing".
        // Fallback 4 re-checks for "שכר נטו X,XXX.XX" pattern.
        const text = [
            'Month: 2024-08',
            'Gross Total: 15,000',
            'Grossing שכר נטו 12,000.00'   // Grossing guard blocks main loop; fallback 4 catches it
        ].join('\n');
        const data = extractDataFromText(text);
        expect(data.net).toBe(12000);
    });

    it('Fallback 5: agorot normalization — pension exceeding 40% of gross is scaled down', () => {
        // If a deduction component exceeds a plausible fraction of gross, it is assumed
        // to be in agorot and scaled by ÷100.
        const text = [
            'Month: 2024-09',
            'Gross Total: 15000',
            'נטו לתשלום: 12000',
            'Pension 600000'    // 600000 agorot → 6000 NIS  (> 15000*0.4 triggers normalization)
        ].join('\n');
        const data = extractDataFromText(text);
        expect(data.deductions.pension).toBe(6000);
    });

    it('Fallback 6: estimates net from gross minus known deductions when net is absent', () => {
        const text = [
            'Month: 2024-10',
            'Gross Total: 15000',
            'Income Tax: 2000',
            'Pension: 1000',
            'National Insurance: 500'
            // Deliberately no net keyword
        ].join('\n');
        const data = extractDataFromText(text);
        // sumDed = 3500 < 15000*0.8 → net = round((15000-3500)*100)/100 = 11500
        expect(data.net).toBe(11500);
    });
});

// ─── extractDataFromText – bonus fields ───────────────────────────────────────
describe('extractDataFromText() — bonus / overtime', () => {
    it('accumulates bonus amounts', () => {
        const text = 'Month: 2024-01\nGross Total: 20000\nNet for Payment: 15000\nBonus: 3000\nGrant: 2000';
        const data = extractDataFromText(text);
        expect(data.earnings.bonus).toBe(5000);
    });

    it('overtime field is always 0 — parser does not extract overtime keywords', () => {
        // Business rule: the parser initialises overtime to 0; there is no extraction
        // keyword for it, so it always remains 0 regardless of text content.
        const text = 'Month: 2024-01\nGross Total: 20000\nNet for Payment: 15000\nOvertime: 2000';
        const data = extractDataFromText(text);
        expect(data.earnings.overtime).toBe(0);
    });
});

// ─── extractDataFromText – large salaries & edge values ───────────────────────
describe('extractDataFromText() — large salaries and edge values', () => {
    it('parses a gross salary above 50,000 correctly', () => {
        const text = [
            'Month: 2024-12',
            'Gross Total: 55,000',
            'Net for Payment: 42,000',
        ].join('\n');
        const data = extractDataFromText(text);
        expect(data.gross).toBe(55000);
        expect(data.net).toBe(42000);
        expect(data.total_deductions).toBe(13000);
    });

    it('total_deductions fallback: extracts from "ניכויים" keyword when gross-net diff is unavailable', () => {
        // When gross=0 and net=0, the gross-net diff produces 0.
        // The code then tries the totalDeductionKeywords search on each line.
        const text = 'Month: 2024-01\nניכויים: 3,500';
        const data = extractDataFromText(text);
        expect(data.total_deductions).toBe(3500);
    });

    it('handles empty string input without throwing', () => {
        expect(() => extractDataFromText('')).not.toThrow();
    });

    it('handles input with only whitespace without throwing', () => {
        expect(() => extractDataFromText('   \n  \t  ')).not.toThrow();
    });
});
