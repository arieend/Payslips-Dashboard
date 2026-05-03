const pdf = require('pdf-parse');
const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

const { productName } = require('../package.json');
const { writePayslipData } = require('./data-writer');
const { ocrPdfFile } = require('./ocr');
const { extractDataFromText } = require('./finance-parser');

const CONFIG_FILENAME = `${productName}.yaml`;

async function getAllFiles(dirPath, depth = 0) {
    if (depth > 4) return [];
    const files = await fs.readdir(dirPath);
    const entries = await Promise.all(
        files.map(async file => {
            const fullPath = path.join(dirPath, file);
            const stat = await fs.lstat(fullPath); // lstat does not follow symlinks
            return { fullPath, isDir: stat.isDirectory(), isSymlink: stat.isSymbolicLink() };
        })
    );
    const results = [];
    for (const { fullPath, isDir, isSymlink } of entries) {
        if (isSymlink) continue; // skip to avoid infinite loops
        if (isDir) {
            results.push(...await getAllFiles(fullPath, depth + 1));
        } else {
            results.push(fullPath);
        }
    }
    return results;
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
                const ocr = await ocrPdfFile(filePath);
                if (ocr) {
                    console.log(`[Ingest] OCR score=${ocr.score} len=${ocr.text?.trim().length ?? 0} for ${path.basename(filePath)}`);
                    if (ocr.text && ocr.text.trim().length > 10) {
                        text = ocr.text;
                        console.log(`[Ingest] OCR complete for: ${filePath}`);
                    } else {
                        console.warn(`[Ingest] OCR produced insufficient text for: ${filePath}`);
                    }
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
                const [ocrYear, ocrMonth] = data.month.split('-');
                if (Math.abs(parseInt(ocrYear) - filenameYear) > 2) {
                    data.month = `${nameMatch[1]}-${ocrMonth}`;
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

    // Also update config.js
    const config = await fs.readFile(configPath, 'utf8').then(s => yaml.load(s) || {}).catch(() => ({}));
    await fs.writeFile(path.join(dataPath, 'config.js'), `window.APP_CONFIG = ${JSON.stringify(config, null, 2)};`);

    return { success: true, count: payslips.length };
}

async function exportConfig(parentPath) {
    const configPath = path.join(__dirname, '..', CONFIG_FILENAME);
    const dataPath = path.join(__dirname, '..', 'data');
    const config = { parentDirectoryPath: parentPath };
    const tempPath = configPath + '.tmp';
    try {
        await fs.writeFile(tempPath, yaml.dump(config));
        await fs.move(tempPath, configPath, { overwrite: true });
    } catch (e) {
        await fs.remove(tempPath).catch(() => {});
        throw e;
    }
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

module.exports = { ingest, exportConfig, isFileForced };
