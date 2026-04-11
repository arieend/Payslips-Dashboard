import { describe, it, expect } from 'vitest';
const { extractDataFromText } = require('../../scripts/finance-parser');

describe('Payslip Ingestion Pipeline', () => {
    it('should correctly parse Hebrew keywords from text sample', async () => {
        const sampleText = `
            מועד תשלום: ינואר 2024
            סה"כ תשלומים: 15,000.00
            נטו לתשלום: 12,000.00
            משכורת: 13,000.00
            מס הכנסה: 1,000.00
            ביטוח לאומי: 500.00
            ביטוח בריאות: 500.00
        `;
        
        const data = extractDataFromText(sampleText);
        
        expect(data.month).toBe('2024-01');
        expect(data.gross).toBe(15000);
        expect(data.net).toBe(12000);
        expect(data.earnings.base).toBe(13000);
        expect(data.deductions.tax).toBe(1000);
        expect(data.total_deductions).toBe(3000); // 15000 - 12000
    });

    it('should correctly parse English keywords from text sample', async () => {
        const sampleText = `
            Month: 2023-12
            Gross Total: 20,000.00
            Net for Payment: 14,000.00
            Base Salary: 18,000.00
            Bonus: 2,000.00
            Income Tax: 4,000.00
            Pension: 1,000.00
            National Insurance: 1,000.00
        `;
        
        const data = extractDataFromText(sampleText);
        
        expect(data.month).toBe('2023-12');
        expect(data.gross).toBe(20000);
        expect(data.net).toBe(14000);
        expect(data.earnings.base).toBe(18000);
        expect(data.earnings.bonus).toBe(2000);
        expect(data.total_deductions).toBe(6000);
    });
});
