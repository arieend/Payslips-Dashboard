const pdf = require('pdf-parse');
const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const Tesseract = require('tesseract.js');
const { pdfToPng } = require('pdf-to-png-converter');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const { productName } = require('../package.json');
const { writePayslipData } = require('./data-writer');
const CONFIG_FILENAME = `${productName}.yaml`;

// --- OCR rotation helpers ---

async function rotateImageBuffer(imgBuf, degrees) {
    const img = await loadImage(imgBuf);
    const rad = (degrees * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const w = Math.round(img.width * cos + img.height * sin);
    const h = Math.round(img.width * sin + img.height * cos);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    return canvas.toBuffer('image/png');
}

function scoreOcrText(text) {
    // Count complete Hebrew words (3+ consecutive chars) — much better signal than isolated chars.
    // Garbled/rotated OCR produces isolated Hebrew letters; correct rotation produces real words.
    const hebrewWords = (text.match(/[\u05D0-\u05EA]{3,}/g) || []).length;
    const numbers = (text.match(/\d{4,}/g) || []).length;
    return hebrewWords * 10 + numbers * 5;
}

// Returns true if the OCR text contains recognizable payslip content.
// Used to decide whether to try rotating the image for better OCR results.
function isReadablePayslipText(text) {
    const PAYSLIP_KEYWORDS = [
        'ברוטו', 'נטו', 'ניכוי', 'משכורת', 'שכר', 'תשלום',
        'Gross', 'gross', 'Net', 'net', 'Salary', 'salary',
        'פנסיה', 'מס הכנסה', 'ביטוח', 'פלאפון'
    ];
    return PAYSLIP_KEYWORDS.some(kw => text.includes(kw));
}

async function runOcr(imgBuf) {
    const { data: { text } } = await Tesseract.recognize(imgBuf, 'heb+eng', {
        logger: () => {},
        tessedit_pageseg_mode: '6',
        tessedit_ocr_engine_mode: '1'
    });
    return text;
}

// Try OCR at 0° first; if quality is poor try 90/180/270 and return the best result
async function ocrWithRotation(imgBuf) {
    let bestText = await runOcr(imgBuf);
    let bestScore = scoreOcrText(bestText);

    // Try rotations if the initial result lacks recognizable payslip content,
    // OR if the score is still very low (covers non-payslip formats / blank pages)
    if (!isReadablePayslipText(bestText) || bestScore < 30) {
        for (const deg of [90, 270, 180]) {
            const rotated = await rotateImageBuffer(imgBuf, deg);
            const text = await runOcr(rotated);
            const score = scoreOcrText(text);
            if (score > bestScore) {
                bestScore = score;
                bestText = text;
                if (isReadablePayslipText(text)) break; // First rotation with real content wins
            }
        }
    }

    return { text: bestText, score: bestScore };
}

// Finance parsing utilities
function parseNum(str) {
    if (!str) return 0;
    const clean = str.toString().replace(/,/g, '').trim();
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
}

async function getAllFiles(dirPath) {
    const files = await fs.readdir(dirPath);
    const entries = await Promise.all(
        files.map(async file => {
            const fullPath = path.join(dirPath, file);
            const stat = await fs.stat(fullPath);
            return { fullPath, isDir: stat.isDirectory() };
        })
    );
    const results = [];
    for (const { fullPath, isDir } of entries) {
        if (isDir) {
            results.push(...await getAllFiles(fullPath));
        } else {
            results.push(fullPath);
        }
    }
    return results;
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
        if (options.excludeBasis && (line.includes('åèåøá') || line.includes('øáèöî') || line.includes('Basis') || line.includes('Cumulative'))) {
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

// Returns true if a file should bypass the mtime cache for targeted refresh
function isFileForced(filePath, cachedEntry, forceYear, forceMonth) {
    const yr = forceYear.toString();
    const mo = forceMonth ? forceMonth.toString().padStart(2, '0') : null;

    // Use cached month when available (most reliable)
    if (cachedEntry?.month) {
        const [y, m] = cachedEntry.month.split('-');
        if (y !== yr) return false;
        if (mo && m !== mo) return false;
        return true;
    }

    // Fallback: path-based heuristics for uncached files
    const filename = path.basename(filePath, path.extname(filePath));
    const parentDir = path.basename(path.dirname(filePath));

    // Filename pattern YYYYMM (e.g. 202401.pdf)
    const monthMatch = filename.match(/^(\d{4})(\d{2})$/);
    if (monthMatch) {
        if (monthMatch[1] !== yr) return false;
        if (mo && monthMatch[2] !== mo) return false;
        return true;
    }

    // Parent directory is the year (e.g. .../2024/somefile.pdf)
    if (parentDir === yr) return true;

    return false;
}

// Ingestion Core
async function ingest(targetDir = null, onProgress = null, { forceYear = null, forceMonth = null } = {}) {
    const configPath = path.join(__dirname, '..', CONFIG_FILENAME);
    if (!targetDir) {
        const config = await fs.readFile(configPath, 'utf8').then(s => yaml.load(s) || {}).catch(() => ({}));
        targetDir = config.parentDirectoryPath;
        if (!targetDir) return { success: false, error: 'Target directory not set' };
    }

    const dataPath = path.join(__dirname, '..', 'data');
    await fs.ensureDir(dataPath);
    
    // Load existing data for caching
    const existingData = await fs.readJson(path.join(dataPath, 'payslips.json')).catch(() => ({}));
    const cache = new Map();
    Object.values(existingData).flat().forEach(p => {
        if (p.source_file) cache.set(p.source_file, p);
    });

    const payslips = [];
    if (await fs.pathExists(targetDir)) {
        const allFiles = await getAllFiles(targetDir);
        const payslipFiles = allFiles.filter(f => ['.pdf', '.txt'].includes(path.extname(f).toLowerCase()));
        const total = payslipFiles.length;
        let current = 0;

        for (const filePath of payslipFiles) {
            const ext = path.extname(filePath).toLowerCase();
            current++;
            try {
                const stats = await fs.stat(filePath);
                const cached = cache.get(filePath);
                const forced = forceYear && isFileForced(filePath, cached, forceYear, forceMonth);
                // Skip re-parsing only if file unchanged AND it has meaningful text or was a txt file
                if (!forced && cached && cached.mtime === stats.mtimeMs && (cached.raw_text?.trim().length > 100 || ext === '.txt')) {
                    payslips.push(cached);
                    if (onProgress) onProgress({ current, total, month: cached.month, gross: cached.gross, cached: true });
                    continue;
                }

                const data = await extractData(filePath);
                if (data) {
                    data.mtime = stats.mtimeMs;
                    payslips.push(data);
                    if (onProgress) onProgress({ current, total, month: data.month, gross: data.gross, cached: false });
                } else {
                    if (onProgress) onProgress({ current, total, month: null, gross: 0, cached: false });
                }
            } catch (e) {
                console.error(`[Ingest] Error processing ${filePath}:`, e);
                if (onProgress) onProgress({ current, total, month: null, gross: 0, cached: false });
            }
        }
    }

    const finalData = {};
    payslips.forEach(p => {
        if (!p.month) return;
        const year = p.month.split('-')[0];
        if (!finalData[year]) finalData[year] = [];
        finalData[year].push(p);
    });

    // Sort by month
    Object.keys(finalData).forEach(y => {
        finalData[y].sort((a, b) => a.month.localeCompare(b.month));
    });

    // Apply manual overrides (user-maintained data/manual_overrides.json keyed by YYYY-MM)
    const overridesPath = path.join(dataPath, 'manual_overrides.json');
    const overrides = await fs.readJson(overridesPath).catch(() => ({}));
    if (Object.keys(overrides).length > 0) {
        Object.values(finalData).flat().forEach(p => {
            if (p.month && overrides[p.month]) {
                Object.assign(p, overrides[p.month]);
            }
        });
    }

    // Write both JSON and JS for browser/electron compatibility
    await writePayslipData(finalData, dataPath);
    
    // Also update config.js if it exists
    const config = await fs.readFile(configPath, 'utf8').then(s => yaml.load(s) || {}).catch(() => ({}));
    await fs.writeFile(path.join(dataPath, 'config.js'), `window.APP_CONFIG = ${JSON.stringify(config, null, 2)};`);

    return { success: true, count: payslips.length };
}

async function extractData(filePath) {
    try {
        const ext = path.extname(filePath).toLowerCase();
        let text = '';
        if (ext === '.pdf') {
            const dataBuffer = await fs.readFile(filePath);
            const pdfData = await pdf(dataBuffer);
            text = pdfData.text;

            // OCR fallback for scanned/image PDFs (often 2003-2012 era)
            if (!text || text.trim().length < 50) {
                console.log(`[Ingest] Scanned PDF detected, trying OCR: ${filePath}`);
                let pngPages = [];
                try {
                    pngPages = await pdfToPng(filePath, {
                        pagesToConvert: [1], // Most payslips are 1 page
                        viewportScale: 4.0 // Higher res improves OCR accuracy on old scans
                    });
                } catch (pngErr) {
                    console.warn(`[Ingest] PDF-to-PNG conversion failed for: ${filePath}:`, pngErr.message);
                }

                if (pngPages.length > 0) {
                    const { text: ocrText, score } = await ocrWithRotation(pngPages[0].content);
                    console.log(`[Ingest] OCR score=${score} len=${ocrText?.trim().length ?? 0} for ${path.basename(filePath)}`);
                    if (ocrText && ocrText.trim().length > 10) {
                        text = ocrText;
                        console.log(`[Ingest] OCR complete for: ${filePath}`);
                    } else {
                        console.warn(`[Ingest] OCR produced insufficient text for: ${filePath}`);
                    }
                } else {
                    console.warn(`[Ingest] PDF-to-PNG produced no pages for: ${filePath}`);
                }
            }
        } else if (ext === '.txt') {
            text = await fs.readFile(filePath, 'utf8');
        } else {
            return null;
        }
        
        const data = extractDataFromText(text);

        // Validate OCR-extracted year against filename year.
        // Old scans can OCR "2003" as "2005" etc. — if they diverge by >2 years,
        // the filename year is more reliable; keep the OCR month number.
        if (data.month) {
            const basename = path.basename(filePath, ext);
            const nameMatch = basename.match(/(\d{4})[-_]?(\d{2})/);
            if (nameMatch) {
                const filenameYear = parseInt(nameMatch[1]);
                const ocrYear = parseInt(data.month.split('-')[0]);
                if (Math.abs(ocrYear - filenameYear) > 2) {
                    data.month = `${nameMatch[1]}-${data.month.split('-')[1]}`;
                }
            }
        }

        // Month fallback from filename/parent dir
        if (!data.month) {
            const basename = path.basename(filePath, ext);
            // Match YYYY-MM or YYYYMM
            const nameMatch = basename.match(/(\d{4})[-_]?(\d{2})/);
            if (nameMatch) {
                data.month = `${nameMatch[1]}-${nameMatch[2]}`;
            } else {
                // Try parent folder for Year and filename for Month
                const parts = filePath.split(/[\\\/]/).filter(p => p.length > 0);
                if (parts.length >= 2) {
                    const parent = parts[parts.length - 2];
                    if (parent.match(/^20\d{2}$/)) {
                        const monthMatch = basename.match(/(\d{2})/);
                        if (monthMatch) data.month = `${parent}-${monthMatch[1]}`;
                    }
                }
            }
        }

        data.source_file = filePath;
        return data;
    } catch (e) {
       console.error(`[Ingest] Extraction failed for ${filePath}:`, e);
       return null;
    }
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
        const isYtdLine  = line.includes('ברוטו') && (line.includes('רגיל') || line.includes('לא קבוע'));
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

async function exportConfig(parentPath) {
    const configPath = path.join(__dirname, '..', CONFIG_FILENAME);
    const dataPath = path.join(__dirname, '..', 'data');
    const config = { parentDirectoryPath: parentPath };
    await fs.writeFile(configPath, yaml.dump(config));
    await fs.writeFile(path.join(dataPath, 'config.js'), `window.APP_CONFIG = ${JSON.stringify(config, null, 2)};`);
}

// CLI Support
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args[0] === 'config') {
        exportConfig(args[1]).then(() => console.log('Config updated.')).catch(console.error);
    } else {
        ingest(args[0]).then(res => {
            console.log(res.success ? `Successfully ingested ${res.count} items.` : `Error: ${res.error}`);
            process.exit(res.success ? 0 : 1);
        }).catch(err => {
            console.error(err);
            process.exit(1);
        });
    }
}

module.exports = { ingest, extractDataFromText, exportConfig };
