import * as XLSX from 'xlsx';
import { ColumnMap, StatementTransaction, BankTransaction } from '../types';
import { parse, format, isValid } from 'date-fns';
import { db } from './firebase';
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';

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

export function computeMatchScore(
  stmt: StatementTransaction,
  bank: BankTransaction
): { confidence: StatementTransaction['match_confidence']; score: number } {
  let score = 0;

  // 1. Amount must match exactly — if it doesn't, score 0 and return early
  const stmtAmount = stmt.debit > 0 ? stmt.debit : stmt.credit;
  if (stmtAmount !== bank.amount) return { confidence: 'none', score: 0 };
  score += 50; // amount match is the strongest signal

  // 2. Type must match — statement debit = bank 'out', statement credit = bank 'in'
  const stmtType = stmt.debit > 0 ? 'out' : 'in';
  if (stmtType !== bank.type) return { confidence: 'none', score: 0 };
  score += 20;

  // 3. Date proximity — same date = +20, ±1 day = +15, ±2 days = +10, ±3 days = +5
  const stmtDate = new Date(stmt.date).getTime();
  const bankDate = new Date(bank.date).getTime();
  const daysDiff = Math.abs((stmtDate - bankDate) / (1000 * 60 * 60 * 24));
  if (daysDiff === 0) score += 20;
  else if (daysDiff <= 1) score += 15;
  else if (daysDiff <= 2) score += 10;
  else if (daysDiff <= 3) score += 5;
  else return { confidence: 'none', score: 0 }; // more than 3 days apart = no match

  // 4. Description similarity — basic keyword overlap
  const stmtWords = stmt.description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const bankWords = bank.description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const overlap = stmtWords.filter(w => bankWords.some(bw => bw.includes(w) || w.includes(bw))).length;
  if (overlap >= 2) score += 10;
  else if (overlap === 1) score += 5;

  // Confidence thresholds
  let confidence: StatementTransaction['match_confidence'] = 'none';
  if (score >= 85) confidence = 'high';
  else if (score >= 70) confidence = 'medium';
  else if (score >= 50) confidence = 'low';

  return { confidence, score };
}

export async function runAutoMatch(uploadId: string, accountId: string): Promise<{
  highCount: number;
  mediumCount: number;
  lowCount: number;
  noneCount: number;
}> {
  // 1. Fetch all statement_transactions for this upload
  const stmtSnap = await getDocs(query(
    collection(db, 'statement_transactions'),
    where('upload_id', '==', uploadId),
    where('status', '==', 'unmatched')
  ));
  const stmtTxs = stmtSnap.docs.map(d => ({ id: d.id, ...d.data() } as StatementTransaction));

  if (stmtTxs.length === 0) return { highCount: 0, mediumCount: 0, lowCount: 0, noneCount: 0 };

  // 2. Get date range of statement transactions
  const dates = stmtTxs.map(t => t.date).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  // 3. Fetch bank_transactions for same account in date range ±3 days
  const rangeStart = new Date(startDate);
  rangeStart.setDate(rangeStart.getDate() - 3);
  const rangeEnd = new Date(endDate);
  rangeEnd.setDate(rangeEnd.getDate() + 3);

  const bankSnap = await getDocs(query(
    collection(db, 'bank_transactions'),
    where('account_id', '==', accountId),
    where('date', '>=', format(rangeStart, 'yyyy-MM-dd')),
    where('date', '<=', format(rangeEnd, 'yyyy-MM-dd'))
  ));
  const bankTxs = bankSnap.docs.map(d => ({ id: d.id, ...d.data() } as BankTransaction));

  // 4. Match each statement tx against bank txs — best score wins
  // Track which bank txs are already claimed to prevent double-matching
  const claimedBankIds = new Set<string>();
  const results: { stmtId: string; bankId: string; confidence: StatementTransaction['match_confidence'] }[] = [];

  for (const stmt of stmtTxs) {
    let bestScore = 0;
    let bestBankId = '';
    let bestConfidence: StatementTransaction['match_confidence'] = 'none';

    for (const bank of bankTxs) {
      if (claimedBankIds.has(bank.id)) continue; // already matched
      const { score, confidence } = computeMatchScore(stmt, bank);
      if (score > bestScore) {
        bestScore = score;
        bestBankId = bank.id;
        bestConfidence = confidence;
      }
    }

    if (bestConfidence !== 'none' && bestBankId) {
      claimedBankIds.add(bestBankId);
      results.push({ stmtId: stmt.id, bankId: bestBankId, confidence: bestConfidence });
    }
  }

  // 5. Write match results to Firestore in batches of 400
  let batch = writeBatch(db);
  let count = 0;
  const counts = { highCount: 0, mediumCount: 0, lowCount: 0, noneCount: 0 };

  for (const stmt of stmtTxs) {
    const match = results.find(r => r.stmtId === stmt.id);
    const stmtRef = doc(db, 'statement_transactions', stmt.id);

    if (match) {
      batch.update(stmtRef, {
        matched_bank_transaction_id: match.bankId,
        match_confidence: match.confidence,
        status: 'matched',
        matched_at: serverTimestamp()
      });
      if (match.confidence === 'high') counts.highCount++;
      else if (match.confidence === 'medium') counts.mediumCount++;
      else counts.lowCount++;
    } else {
      counts.noneCount++;
    }

    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  if (count % 400 !== 0) await batch.commit();

  // 6. Update the statement_upload document with match counts
  const uploadRef = doc(db, 'statement_uploads', uploadId);
  const updateBatch = writeBatch(db);
  updateBatch.update(uploadRef, {
    matched_count: results.length,
    unmatched_count: counts.noneCount,
    updated_at: serverTimestamp()
  });
  await updateBatch.commit();

  return counts;
}
