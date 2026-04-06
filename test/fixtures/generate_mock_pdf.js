const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');

async function generateMockPDF(filename, data) {
    const doc = new PDFDocument();
    const outputPath = path.join(__dirname, 'payslips_source', filename);
    await fs.ensureDir(path.dirname(outputPath));
    
    doc.pipe(fs.createWriteStream(outputPath));

    // Using a font that supports Hebrew
    const fontPath = 'C:\\Windows\\Fonts\\Arial.ttf';
    if (await fs.exists(fontPath)) {
        doc.font(fontPath);
    }

    // Header
    doc.fontSize(20).text('Mock Payslip', { align: 'center' });
    doc.moveDown();

    // Data - using the patterns from ingest.js
    doc.fontSize(12);
    
    // bidi support: simplified for tests, pdf-parse usually finds the text in original order or reversed 
    // depending on the engine. We'll provide both or just one to check regex robustness.
    doc.text(`חברה: חברת דמו בע"מ`);
    doc.text(`תאריך: ${data.date || '01/2024'}`);
    doc.moveDown();
    
    doc.text(`עבור חודש: ${data.date || '01/2024'}`);
    doc.text(`ברוטו למס הכנסה: ${data.gross || '15,000.00'}`);
    doc.text(`נטו לתשלום: ${data.net || '12,500.00'}`);
    
    // Add some noise
    doc.moveDown();
    doc.text(`סה"כ ניכויים: ${data.deductions || '2,500.00'}`);
    doc.text(`הערות: תלוש נוצר לצורך בדיקות אוטומציה.`);

    doc.end();
}

const mocks = [
    { filename: 'payslip_2024_01.pdf', date: '01/2024', gross: '15,000.00', net: '12,000.00' },
    { filename: 'payslip_2024_02.pdf', date: '02/2024', gross: '15,500.00', net: '12,200.00' },
    { filename: 'payslip_2023_12.pdf', date: '12/2023', gross: '14,000.00', net: '11,500.00' }
];

async function run() {
    console.log('[MockGen] Generating test fixtures...');
    for (const m of mocks) {
        await generateMockPDF(m.filename, m);
        console.log(`[MockGen] Generated ${m.filename}`);
    }
}

run().catch(console.error);
