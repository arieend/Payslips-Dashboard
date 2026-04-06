const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

const { productName } = require('../package.json');
const configPath = path.join(__dirname, '..', `${productName}.yaml`);
const config = yaml.load(fs.readFileSync(configPath, 'utf8')) || {};
const sourceDir = config.parentDirectoryPath;

async function generateSamples() {
    console.log(`Generating sample payslips in: ${sourceDir}`);
    await fs.ensureDir(sourceDir);

    const years = ['2023', '2024', '2025'];
    
    for (const year of years) {
        const yearDir = path.join(sourceDir, year);
        await fs.ensureDir(yearDir);
        
        // Generate most months, maybe miss one to test validation
        for (let m = 1; m <= 12; m++) {
            if (year === '2025' && m > 4) break; // Only first 4 months of 2025
            if (year === '2024' && m === 11) continue; // Skip November 2024 for testing
            
            const monthStr = m.toString().padStart(2, '0');
            const fileName = `${year}${monthStr}.txt`;
            const filePath = path.join(yearDir, fileName);
            
            // Randomish salary components
            const base = 5000 + Math.floor(Math.random() * 500);
            const bonus = (m % 3 === 0) ? 1000 : 0;
            const overtime = Math.floor(Math.random() * 200);
            
            const gross = base + bonus + overtime;
            const tax = Math.floor(gross * 0.2);
            const pension = Math.floor(gross * 0.05);
            const insurance = 150;
            const net = gross - tax - pension - insurance;

            const content = `
Employee: John Doe
Employer: Tech Solutions Inc.
Period: ${year}-${monthStr}

Base Salary: ${base}
Bonus: ${bonus}
Overtime: ${overtime}
Gross Total: ${gross}

Deductions:
- Income Tax: ${tax}
- Pension: ${pension}
- Health Insurance: ${insurance}

Net Payable: ${net}
Payment Date: ${year}-${monthStr}-28
            `;
            
            await fs.writeFile(filePath, content.trim());
        }
    }
    console.log('Sample generation complete.');
}

generateSamples().catch(console.error);
