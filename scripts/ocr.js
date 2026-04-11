const Tesseract = require('tesseract.js');
const { pdfToPng } = require('pdf-to-png-converter');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

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

// Convert a PDF file to a PNG buffer for the first page, with OCR fallback.
// Returns { text, score } via ocrWithRotation, or null if conversion fails.
async function ocrPdfFile(filePath) {
    let pngPages = [];
    try {
        pngPages = await pdfToPng(filePath, {
            pagesToConvert: [1], // Most payslips are 1 page
            viewportScale: 4.0  // Higher res improves OCR accuracy on old scans
        });
    } catch (pngErr) {
        console.warn(`[OCR] PDF-to-PNG conversion failed for: ${filePath}:`, pngErr.message);
        return null;
    }
    if (pngPages.length === 0) {
        console.warn(`[OCR] PDF-to-PNG produced no pages for: ${filePath}`);
        return null;
    }
    return ocrWithRotation(pngPages[0].content);
}

module.exports = { ocrWithRotation, ocrPdfFile, runOcr, scoreOcrText, isReadablePayslipText };
