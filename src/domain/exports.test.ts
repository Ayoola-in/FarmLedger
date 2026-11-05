import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, parseBackup, saleReceipt, toCsv, whatsappLink } from './exports';

describe('toCsv', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny', 5, null]])).toBe('"a,b","say ""hi""","x\ny",5,');
  });
  it('stops spreadsheet formula injection from typed text', () => {
    for (const bad of ['=HYPERLINK("x")', '+1', '-1', '@SUM(A1)']) {
      expect(toCsv([[bad]]).replace(/^"/, '')).toMatch(/^'/);
    }
  });
  it('leaves real numbers untouched, including negatives', () => {
    expect(toCsv([[-5]])).toBe('-5');
  });
});

describe('receipts', () => {
  it('shows the balance on a credit sale', () => {
    const text = saleReceipt({ farmName: 'Green', date: '2026-01-02', description: '10 crates', amountKobo: 100_000, paidKobo: 40_000, customer: 'Ada' });
    expect(text).toContain('Customer: Ada');
    expect(text).toMatch(/Balance due: .600/);
  });
  it('confirms a fully paid sale', () => {
    expect(saleReceipt({ farmName: 'G', date: '2026-01-02', description: 'x', amountKobo: 5, paidKobo: 5 })).toContain('Fully paid');
  });
  it('builds a WhatsApp link with a Nigerian number in international form', () => {
    const link = whatsappLink('hi there', '0803 000 0001');
    expect(link).toBe('https://wa.me/2348030000001?text=hi%20there');
  });
  it('still opens WhatsApp with no number', () => {
    expect(whatsappLink('x')).toBe('https://wa.me/?text=x');
  });
});

describe('parseBackup', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  it('accepts a valid file and fills missing tables', () => {
    const parsed = parseBackup({ format: BACKUP_FORMAT, version: 1, records: { flocks: [{ id }] } });
    expect(parsed.records.flocks).toHaveLength(1);
    expect(parsed.records.sales).toEqual([]);
  });
  it('rejects the wrong file, newer versions and bad rows', () => {
    expect(() => parseBackup({ hello: 1 })).toThrow(/isn’t a FarmLedger/);
    expect(() => parseBackup({ format: BACKUP_FORMAT, version: 2, records: {} })).toThrow(/newer version/);
    expect(() => parseBackup({ format: BACKUP_FORMAT, version: 1, records: { flocks: [{ id: 'x' }] } })).toThrow(/damaged/);
    expect(() => parseBackup(null)).toThrow();
  });
});
