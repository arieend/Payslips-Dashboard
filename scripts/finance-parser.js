// Finance number extraction and payslip text parsing.
// All functions are pure (no I/O) and work on strings/numbers only.

function parseNum(str) {
    if (!str) return 0;
    const clean = str.toString().replace(/,/g, '').trim();
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
}

const FINANCE_REGEX_CACHE = new Map();
function getFinanceRegex(kw) {
    if (!FINANCE_REGEX_CACHE.has(kw)) {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        FINANCE_REGEX_CACHE.set(kw, {
            fwd: new RegExp('(?:^|[^\\d])([\\d,]{2,}(?:\\.\\d+)?)[^\\d,.]*' + escaped, 'i'),
            rev: new RegExp(escaped + '[^\\d,.]*([\\d,]{2,}(?:\\.\\d+)?)', 'i')
        });
    }
    return FINANCE_REGEX_CACHE.get(kw);
}

function findValueInLine(keywords, line, options = {}) {
    for (const kw of keywords) {
        if (options.excludeBasis && (line.includes('Basis') || line.includes('Cumulative'))) {
            continue;
        }
        const regexes = getFinanceRegex(kw);

        // Hebrew PDF fashion (Number before Keyword)
        const fwdMatch = line.match(regexes.fwd);
        if (fwdMatch) {
            const val = parseNum(fwdMatch[1]);
            if (!options.max || val <= options.max) return val;
        }

        // English fashion (Keyword before Number)
        const revMatch = line.match(regexes.rev);
        if (revMatch) {
            const val = parseNum(revMatch[1]);
            if (!options.max || val <= options.max) return val;
        }
    }
    return null;
}

function extractDataFromText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const data = {
        month: '',
        gross: 0,
        net: 0,
        total_deductions: 0,
        earnings: { base: 0, bonus: 0, overtime: 0 },
        deductions: { tax: 0, pension: 0, insurance: 0 },
        raw_text: text
    };

    const monthMapping = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04', 'May': '05', 'June': '06',
        'July': '07', 'August': '08', 'September': '09', 'October': '10', 'November': '11', 'December': '12',
        'éðåàø': '01', 'ôáøåàø': '02', 'îøõ': '03', 'àôøéì': '04', 'îàé': '05', 'éåðé': '06',
        'éåìé': '07', 'àåâåñè': '08', 'ñôèîáø': '09', 'àå÷èåáø': '10', 'ðåáîáø': '11', 'ãöîáø': '12',
        'ינואר': '01', 'פברואר': '02', 'מרץ': '03', 'אפריל': '04', 'מאי': '05', 'יוני': '06',
        'יולי': '07', 'אוגוסט': '08', 'ספטמבר': '09', 'אוקטובר': '10', 'נובמבר': '11', 'דצמבר': '12'
    };

    lines.forEach(line => {
        // Month detection — skip inner loop once a month+year is found
        if (!data.month) {
            for (const [name, num] of Object.entries(monthMapping)) {
                if (line.includes(name)) {
                    const yearMatch = line.match(/\b((?:19|20)\d{2})\b/);
                    if (yearMatch) {
                        data.month = `${yearMatch[0]}-${num}`;
                        break;
                    }
                }
            }
        }

        if (!data.month) {
            const dateMatch = line.match(/(?:Period|Month|חודש|ùãåç):\s*(\d{4}-\d{2}|\d{2}\/\d{4})/i);
            if (dateMatch) data.month = dateMatch[1];
        }

        // Gross parsing — skip cumulative YTD lines and imputed-income subtotal lines
        // "ברוטו רגיל" / "ברוטו לא קבוע" = cumulative section headers
        // "זקיפות" lines contain imputed income subtotals that appear adjacent to "ברוטו"
        const isYtdLine = line.includes('ברוטו') && (line.includes('רגיל') || line.includes('לא קבוע'));
        const isImputedLine = line.includes('זקיפות') || line.includes('שיחות+חשבוניות');
        if (!isYtdLine && !isImputedLine) {
            const grossKeywords = ['Gross Total', 'סה"כ ברוטו', 'סה"כ תשלומים', 'íéîåìùúä ìë-êñ', 'íéîåìùúä ë"äñ', 'ברוטו', 'øëù áåèåøá'];
            const gV = findValueInLine(grossKeywords, line);
            if (gV > 1000 && gV > data.gross) data.gross = gV;
        }

        // Net parsing — max:99999 prevents employee ID numbers landing as net salary
        if (!line.includes('íåìéâ') && !line.includes('Grossing') && !line.includes('éååù')) {
            const netKeywords = ['íåìùúì åèð', 'נטו לתשלום', 'שכר נטו', 'Net for Payment', 'Net Payable', 'Salary Net'];
            const nV = findValueInLine(netKeywords, line, { max: 99999 });
            if (nV > 1000) data.net = nV;
            else {
                const sV = findValueInLine(['נטו', 'åèð', 'Net Value', 'Net Pay'], line, { max: 99999 });
                if (sV > 1000 && (data.net === 0 || (sV > data.net && sV < data.gross))) data.net = sV;
            }
        }

        // Earnings
        const baseKeywords = ['Base Salary', 'Salary', 'øëù', 'משכורת'];
        const bV = findValueInLine(baseKeywords, line, { excludeBasis: true });
        if (bV > 1000 && bV > data.earnings.base) data.earnings.base = bV;

        const bonusKeywords = ['Bonus', 'בונוס', 'îòð÷', 'Grant'];
        const boV = findValueInLine(bonusKeywords, line);
        if (boV > 0) data.earnings.bonus += boV;

        // Deduction parsing
        const pensionKeywords = ['Pension', 'פנסיה', 'Gamla', 'âîìà', 'äôøùä ìôðñéä'];
        const pV = findValueInLine(pensionKeywords, line, { excludeBasis: true });
        if (pV !== null) data.deductions.pension += pV;

        const taxKeywords = ['Income Tax', 'מס הכנסה', 'מס רגיל', 'Income Tax Deduction', 'äñðëä ñî', 'Income Tax Payable'];
        const tV = findValueInLine(taxKeywords, line, { excludeBasis: true, max: data.gross * 0.5 });
        if (tV !== null && tV > data.deductions.tax) data.deductions.tax = tV;

        const insuranceKeywords = ['National Insurance', 'Mas Briut', 'ביטוח לאומי', 'ביטוח בריאות', 'éîåàì åçéèá', 'úåàéøá òî', 'Health Tax', 'Health Insurance'];
        const iV = findValueInLine(insuranceKeywords, line, { excludeBasis: true });
        if (iV !== null) data.deductions.insurance += iV;
    });

    // --- Format-specific fallback extraction ---

    // 1. Gross fallback: "ברוטו לב.לאומי" / "ברוטו לרב.לאומי" / "ברוטו חייב בפם"
    //    The dot inside "לב.לאומי" stops the standard keyword regex — use a bounded
    //    wildcard regex that allows dots between the keyword and the number.
    //    Also runs when gross > 100,000 (a YTD cumulative line was mistakenly matched).
    if (data.gross === 0 || data.gross > 100000) {
        const prevGross = data.gross;
        data.gross = 0;
        lines.forEach(line => {
            if (data.gross > 0) return;
            if (!line.includes('ברוטו')) return;
            if (!line.includes('לאומי') && !/חייב|הייב/.test(line)) return;
            const m = line.match(/ברוטו.{0,30}?([\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{4,}(?:\.\d{1,2})?)/);
            if (m) {
                const v = parseNum(m[1]);
                if (v > 500) data.gross = v;
            }
        });
        if (data.gross === 0) data.gross = prevGross; // nothing better found; restore
    }

    // 2. Old Hilan format (pre-2012 scanned): deductions are concatenated to the keyword
    //    without a space and stored in agorot (no decimal point). Detected by the pattern
    //    "מס הכנסה" immediately followed by 5+ digits.
    //    OCR sometimes misreads ס→מ, so also detect "מם הכנסה".
    if (/מ[סם] הכנסה\d{5,}/.test(text)) {
        // Reset deductions that may have been set incorrectly from wrong line context
        data.deductions.tax = 0;
        data.deductions.insurance = 0;

        lines.forEach(line => {
            // Income tax: "מס הכנסה317500" → 3,175 NIS (also matches OCR מם for מס)
            const taxM = line.match(/מ[סם] הכנסה(\d{5,7})/);
            if (taxM) {
                const v = Math.round(parseInt(taxM[1]) / 100);
                if (v > data.deductions.tax) data.deductions.tax = v;
            }
            // Health insurance: "ב.בריאות58047" or "בריאות85583"
            // Note: /ב[.]?ריאות/ cannot match "ברוטו", so no ברוטו guard needed here.
            const healthM = line.match(/ב[.]?ריאות(\d{4,6})/);
            if (healthM) {
                data.deductions.insurance += Math.round(parseInt(healthM[1]) / 100);
            }
            // National insurance: "לאומי109347" — 5-6 digits only (7-digit = YTD cumulative)
            // Skip lines containing "ברוטו" to avoid matching "ברוטו לב.לאומי" gross lines
            const niM = line.match(/לאומי(\d{5,6})(?!\d)/);
            if (niM && !line.includes('ברוטו')) {
                data.deductions.insurance += Math.round(parseInt(niM[1]) / 100);
            }
        });
    }

    // 3. Old Hilan summary-row fallback: the line immediately before "נתונים תצטברים" / "תגמולים"
    //    contains three agorot values: [gross, deductions, net]. We only trust it when the
    //    math checks out (gross − deductions ≈ net within 2%), preventing false extraction.
    //    Trigger only when gross is still 0 after the main passes above.
    if (data.gross === 0) {
        // Allow common OCR substitutions: מ↔ח, ת↔נ in "תגמולים"; ת↔מ in "תצטברים"
        const pensionIdx = lines.findIndex(l => /ת[גח][מנ]ולים|נתונ.{1,8}[תמ][צר]טבר/.test(l));
        if (pensionIdx > 0) {
            // Scan up to 8 lines before the pension section for a numeric summary line
            for (let i = pensionIdx - 1; i >= Math.max(0, pensionIdx - 8); i--) {
                // Normalise OCR noise: l/I/| between digits → decimal point
                const normalised = lines[i].replace(/(\d)[lI|](\d{2})(?=\D|$)/g, '$1.$2');
                // Extract all plausible numeric tokens (4-9 digits, optional decimal)
                const tokens = [...normalised.matchAll(/\b(\d{4,9}(?:\.\d{1,2})?)\b/g)]
                    .map(m => parseFloat(m[1]))
                    .filter(v => !isNaN(v));
                if (tokens.length < 3) continue;

                // Try every ordered triplet (A, B, C) with A being the largest.
                // Attempt both agorot (÷100) and direct-NIS interpretations —
                // old scans sometimes OCR the decimal as 'l' giving direct NIS values.
                let found = false;
                for (const scale of [100, 1]) {
                    for (let a = 0; a < tokens.length && !found; a++) {
                        for (let b = 0; b < tokens.length && !found; b++) {
                            for (let c = 0; c < tokens.length && !found; c++) {
                                if (a === b || b === c || a === c) continue;
                                const [A, B, C] = [tokens[a], tokens[b], tokens[c]];
                                if (A <= B || A <= C) continue; // gross must be largest
                                const gross = A / scale, ded = B / scale, net = C / scale;
                                if (gross < 3000 || gross > 60000) continue;
                                // Math check: gross − deductions ≈ net within 2%
                                if (Math.abs((gross - ded) - net) / gross > 0.02) continue;
                                data.gross = gross;
                                if (data.net === 0) data.net = net;
                                found = true;
                            }
                        }
                    }
                    if (found) break;
                }
                if (found) break;
            }
        }
    }

    // 4. Net fallback for phone-camera format: "שכר נטו X,XXX.XX" (OCR may garble ט→שׁ)
    if (data.net === 0) {
        lines.forEach(line => {
            if (data.net > 0) return;
            if (!/שכר.{0,4}נ[טשׁ]ו|שכר נטו/.test(line)) return;
            const m = line.match(/(\d{1,3}(?:,\d{3})+\.\d{2}|\d{4,}\.\d{2})/);
            if (m) {
                const v = parseNum(m[1]);
                if (v > 1000 && v < 99999) data.net = v;
            }
        });
    }

    // 5. Safety-net agorot normalization: if a deduction still exceeds a plausible
    //    fraction of gross after all above, scale it down by 100.
    if (data.gross > 0) {
        if (data.deductions.tax > data.gross * 0.9)
            data.deductions.tax = Math.round(data.deductions.tax / 100);
        if (data.deductions.insurance > data.gross * 0.6)
            data.deductions.insurance = Math.round(data.deductions.insurance / 100);
        if (data.deductions.pension > data.gross * 0.4)
            data.deductions.pension = Math.round(data.deductions.pension / 100);
    }

    // 6. Estimate net from gross − known deductions when net is still unknown
    if (data.net === 0 && data.gross > 0) {
        const sumDed = data.deductions.tax + data.deductions.pension + data.deductions.insurance;
        if (sumDed > 0 && sumDed < data.gross * 0.8) {
            data.net = Math.round((data.gross - sumDed) * 100) / 100;
        }
    }

    // Calculate total deductions
    // Rule: if we have both gross & net, deductions must be the difference
    if (data.gross > 0 && data.net > 0) {
        data.total_deductions = Math.max(0, data.gross - data.net);
    }

    // If individual components are 0, try a generic total search as well
    if (data.total_deductions === 0) {
        const totalDeductionKeywords = ['Total Deductions', 'סה"כ ניכויים', 'íééåëéð ë"äñ', 'íééåëéð', 'ניכויים'];
        lines.forEach(line => {
            const tdV = findValueInLine(totalDeductionKeywords, line, { max: 99999 });
            if (tdV > 0 && tdV > data.total_deductions) data.total_deductions = tdV;
        });
    }

    return data;
}

module.exports = { extractDataFromText, findValueInLine, parseNum };
