const fs = require('fs-extra');
const path = require('path');

/**
 * Write payslip data to both payslips.json and payslips.js in one atomic step.
 * Used by ingest.js, main.js (save-manual-edit), and server.js (/api/manual-edit).
 */
async function writePayslipData(data, dataPath) {
    await fs.writeJson(path.join(dataPath, 'payslips.json'), data, { spaces: 2 });
    await fs.writeFile(
        path.join(dataPath, 'payslips.js'),
        `window.PAYSLIP_DATA = ${JSON.stringify(data, null, 2)};\n`
    );
}

module.exports = { writePayslipData };
