const fs = require('fs-extra');
const path = require('path');

/**
 * Write payslip data to both payslips.json and payslips.js in one atomic step.
 * Used by ingest.js, main.js (save-manual-edit), and server.js (/api/manual-edit).
 */
async function writePayslipData(data, dataPath) {
    const jsonPath = path.join(dataPath, 'payslips.json');
    const jsPath = path.join(dataPath, 'payslips.js');
    const jsonTmp = jsonPath + '.tmp';
    const jsTmp = jsPath + '.tmp';
    try {
        await fs.writeJson(jsonTmp, data, { spaces: 2 });
        await fs.writeFile(jsTmp, `window.PAYSLIP_DATA = ${JSON.stringify(data, null, 2)};\n`);
        await fs.move(jsonTmp, jsonPath, { overwrite: true });
        await fs.move(jsTmp, jsPath, { overwrite: true });
    } catch (e) {
        await fs.remove(jsonTmp).catch(() => {});
        await fs.remove(jsTmp).catch(() => {});
        throw e;
    }
}

module.exports = { writePayslipData };
