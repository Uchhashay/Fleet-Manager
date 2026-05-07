import * as XLSX from 'xlsx';
import { ColumnMap, StatementTransaction } from '../types';
import { parse, format, isValid } from 'date-fns';

// ─── Date parsing ───────────────────────────────────────────────
export function parseStatementDate(raw: string | number, fmt: ColumnMap['dateFormat']): string | null {
  if (!raw) return null;

  // Excel serial number (e.g. 45678)
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw);
    if (date) {
      const d = new Date(date.y, date.m - 1, date.d);
      return isValid(d) ? format(d, 'yyyy-MM-dd') : null;
    }
  }

  const str = String(raw).trim();
  const formatMap: Record<ColumnMap['dateFormat'], string> = {
    'DD/MM/YYYY': 'dd/MM/yyyy',
    'MM/DD/YYYY': 'MM/dd/yyyy',
    'YYYY-MM-DD': 'yyyy-MM-dd',
    'DD-MM-YYYY': 'dd-MM-yyyy',
    'DD-MMM-YY':  'dd-MMM-yy',
    'DD-MMM-YYYY':'dd-MMM-yyyy',
  };

  try {
    const parsed = parse(str, formatMap[fmt], new Date());
    return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : null;
  } catch {
    return null;
  }
}

// ─── Amount parsing ─────────────────────────────────────────────
export function parseAmount(raw: any): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const cleaned = String(raw).replace(/[₹,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
}

// ─── Auto-detect columns from header row ────────────────────────
// Returns a best-guess ColumnMap or null if detection fails
export function autoDetectColumns(headers: string[]): Partial<ColumnMap> | null {
  const lower = headers.map(h => h.toLowerCase().trim());
  const find = (keywords: string[]) =>
    headers[lower.findIndex(h => keywords.some(k => h.includes(k)))] || '';

  const date = find(['date', 'txn date', 'transaction date', 'value date', 'posting date']);
  const description = find(['description', 'narration', 'particulars', 'remarks', 'details', 'txn remarks']);
  const debit = find(['debit', 'withdrawal', 'dr', 'debit amount', 'withdrawal amount']);
  const credit = find(['credit', 'deposit', 'cr', 'credit amount', 'deposit amount']);
  const balance = find(['balance', 'closing balance', 'running balance', 'available balance']);

  // Check if it's a single amount column (signed)
  const amount = find(['amount']);
  const amountStyle: ColumnMap['amountStyle'] = (debit && credit)
    ? 'separate_columns'
    : 'single_column_signed';

  // Date format detection from first data rows is done separately
  return { date, description, debit, credit, balance, amountStyle };
}

// ─── Detect date format from a sample value ──────────────────────
export function detectDateFormat(sample: string | number): ColumnMap['dateFormat'] {
  if (typeof sample === 'number') return 'DD/MM/YYYY'; // will use serial parsing
  const s = String(sample).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'YYYY-MM-DD';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return 'DD/MM/YYYY';
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return 'DD-MM-YYYY';
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(s)) return 'DD-MMM-YYYY';
  if (/^\d{2}-[A-Za-z]{3}-\d{2}$/.test(s)) return 'DD-MMM-YY';
  return 'DD/MM/YYYY'; // fallback
}

// ─── Parse Excel file into raw rows ─────────────────────────────
export function readExcelFile(file: File): Promise<{ headers: string[]; rows: any[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'binary', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Find the header row — first row where more than 3 cells are non-empty strings
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(raw.length, 15); i++) {
          const nonEmpty = raw[i].filter(cell => cell !== '' && cell !== null).length;
          if (nonEmpty >= 3) { headerRowIndex = i; break; }
        }

        const headers = raw[headerRowIndex].map(h => String(h).trim()).filter(h => h !== '');
        const rows = raw.slice(headerRowIndex + 1)
          .filter(row => row.some(cell => cell !== '' && cell !== null))
          .map(row => {
            const obj: any = {};
            headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
            return obj;
          });

        resolve({ headers, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

// ─── Convert mapped rows into StatementTransactions ─────────────
export function mapRowsToTransactions(
  rows: any[],
  colMap: ColumnMap,
  accountId: string,
  uploadId: string,
  uploadedBy: string
): Omit<StatementTransaction, 'id'>[] {
  const results: Omit<StatementTransaction, 'id'>[] = [];

  for (const row of rows) {
    const dateRaw = row[colMap.date];
    const date = parseStatementDate(dateRaw, colMap.dateFormat);
    if (!date) continue; // skip rows with unparseable dates

    let debit = 0;
    let credit = 0;

    if (colMap.amountStyle === 'separate_columns') {
      debit = parseAmount(row[colMap.debit]);
      credit = parseAmount(row[colMap.credit]);
    } else {
      const amtText = String(row[colMap.debit] || row[colMap.credit] || '0').replace(/[₹,\s]/g, '');
      const amt = parseFloat(amtText);
      if (amt < 0) debit = Math.abs(amt);
      else credit = amt;
    }

    if (debit === 0 && credit === 0) continue; // skip zero-amount rows

    results.push({
      upload_id: uploadId,
      account_id: accountId,
      date,
      description: String(row[colMap.description] || '').trim(),
      debit,
      credit,
      balance_as_per_statement: parseAmount(row[colMap.balance]),
      matched_bank_transaction_id: '',
      match_confidence: 'none',
      status: 'unmatched',
      uploaded_by: uploadedBy,
      uploaded_at: new Date().toISOString()
    });
  }

  return results;
}
