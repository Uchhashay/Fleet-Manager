import React, { useState, useRef, useEffect } from 'react';
import { readExcelFile, autoDetectColumns, detectDateFormat, mapRowsToTransactions, runAutoMatch } from '../lib/statement-utils';
import { BankAccount, ColumnMap, StatementTransaction } from '../types';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Loader2, X, Landmark } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

interface BankStatementUploadProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  currentUserId: string;
  currentUserName: string;
  onUploadComplete: (uploadId: string) => void;
}

export function BankStatementUpload({ 
  isOpen, 
  onClose, 
  accounts, 
  currentUserId, 
  onUploadComplete 
}: BankStatementUploadProps) {
  const [step, setStep] = useState(1);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [colMap, setColMap] = useState<Partial<ColumnMap>>({
    dateFormat: 'DD/MM/YYYY',
    amountStyle: 'separate_columns'
  });
  const [previewRows, setPreviewRows] = useState<Omit<StatementTransaction, 'id'>[]>([]);
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setSelectedAccountId('');
      setFile(null);
      setHeaders([]);
      setRawRows([]);
      setColMap({
        dateFormat: 'DD/MM/YYYY',
        amountStyle: 'separate_columns'
      });
      setPreviewRows([]);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (step === 3 && rawRows.length > 0) {
      updatePreview();
    }
  }, [step, colMap]);

  function updatePreview() {
    if (!colMap.date || !colMap.description || (!colMap.debit && colMap.amountStyle === 'separate_columns')) {
      setPreviewRows([]);
      return;
    }
    const preview = mapRowsToTransactions(
      rawRows.slice(0, 10),
      colMap as ColumnMap,
      selectedAccountId,
      'preview',
      currentUserId
    );
    setPreviewRows(preview as any);
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    try {
      const { headers, rows } = await readExcelFile(uploadedFile);
      setHeaders(headers);
      setRawRows(rows);
      
      const detected = autoDetectColumns(headers);
      if (detected) {
        // Find a non-empty sample row to detect date format
        let sampleDate = '';
        if (detected.date) {
          for (let i = 0; i < Math.min(rows.length, 10); i++) {
            if (rows[i][detected.date]) {
              sampleDate = rows[i][detected.date];
              break;
            }
          }
        }
        const fmt = sampleDate ? detectDateFormat(sampleDate) : 'DD/MM/YYYY';
        setColMap({ ...detected, dateFormat: fmt });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to read file');
    }
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const validRows = mapRowsToTransactions(
        rawRows,
        colMap as ColumnMap,
        selectedAccountId,
        '', // uploadId filled after
        currentUserId
      );

      if (validRows.length === 0) {
        throw new Error('No valid transactions found in the file with current mapping.');
      }

      const dates = validRows.map(r => r.date).sort();

      // 1. Create the StatementUpload document first to get its ID
      const uploadRef = await addDoc(collection(db, 'statement_uploads'), {
        account_id: selectedAccountId,
        filename: file!.name,
        date_range_start: dates[0],
        date_range_end: dates[dates.length - 1],
        total_rows: rawRows.length,
        matched_count: 0,
        unmatched_count: validRows.length,
        ignored_count: 0,
        status: 'pending',
        uploaded_by: currentUserId,
        uploaded_at: serverTimestamp()
      });

      // 2. Write statement_transactions in batches of 400
      let batch = writeBatch(db);
      let count = 0;
      for (const tx of validRows) {
        const ref = doc(collection(db, 'statement_transactions'));
        batch.set(ref, { 
          ...tx, 
          upload_id: uploadRef.id, 
          uploaded_at: serverTimestamp() 
        });
        count++;
        if (count % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      if (count % 400 !== 0) await batch.commit();

      setMatching(true);
      await runAutoMatch(uploadRef.id, selectedAccountId);

      onUploadComplete(uploadRef.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save statement');
    } finally {
      setSaving(false);
      setMatching(false);
    }
  }

  const validPreviewCount = previewRows.length;
  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-surface w-full max-w-5xl rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Import Bank Statement</h3>
                  <div className="flex items-center space-x-2 mt-1">
                    {[1, 2, 3, 4].map((s) => (
                      <div key={s} className="flex items-center">
                        <div className={cn(
                          "h-1.5 w-8 rounded-full transition-all",
                          step >= s ? "bg-accent" : "bg-border"
                        )} />
                        {s < 4 && <div className="w-1" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
                <X className="h-5 w-5 text-secondary" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {error && (
                <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-2xl flex items-center space-x-3 text-danger">
                  <AlertCircle className="h-5 w-5" />
                  <p className="text-sm font-bold">{error}</p>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h4 className="text-2xl font-black text-primary">Select Bank Account</h4>
                    <p className="text-secondary">Which account does this statement belong to?</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.map(account => (
                      <button
                        key={account.id}
                        onClick={() => setSelectedAccountId(account.id)}
                        className={cn(
                          "card text-left transition-all p-6 border-2",
                          selectedAccountId === account.id 
                            ? "border-accent bg-accent/5" 
                            : "border-border bg-surface hover:border-border-hover hover:bg-surface-hover"
                        )}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                            <Landmark className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-primary">{account.account_name}</p>
                            <p className="text-[10px] text-secondary font-medium uppercase">{account.bank_name}</p>
                          </div>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[9px] text-secondary uppercase font-bold tracking-wider">Account Last 4</p>
                            <p className="text-sm font-mono font-bold text-primary">****{account.account_number_last4}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-secondary uppercase font-bold tracking-wider">Current Balance</p>
                            <p className="text-sm font-mono font-bold text-primary">{formatCurrency(account.current_balance)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="max-w-2xl mx-auto py-10 space-y-8 text-center">
                  <div className="space-y-4">
                    <div className="h-20 w-20 bg-accent/10 rounded-3xl flex items-center justify-center text-accent mx-auto">
                      <FileText className="h-10 w-10" />
                    </div>
                    <h4 className="text-2xl font-black text-primary">Upload Bank Statement</h4>
                    <p className="text-secondary leading-relaxed">
                      Upload your statement file (Excel format). We'll auto-detect the columns for you.
                    </p>
                  </div>

                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-3xl p-16 text-center space-y-4 hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer group"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept=".xlsx,.xls" 
                      className="hidden" 
                    />
                    {file ? (
                      <div className="space-y-4">
                        <div className="h-16 w-16 bg-success/10 rounded-2xl flex items-center justify-center text-success mx-auto">
                          <CheckCircle2 className="h-8 w-8" />
                        </div>
                        <div>
                          <p className="text-lg font-bold text-primary">{file.name}</p>
                          <p className="text-sm text-success font-bold">{rawRows.length} rows detected successfully</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="h-16 w-16 bg-accent/10 rounded-2xl flex items-center justify-center text-accent mx-auto group-hover:scale-110 transition-transform">
                          <Upload className="h-8 w-8" />
                        </div>
                        <div>
                          <p className="text-lg font-bold text-primary">Click to upload or drag and drop</p>
                          <p className="text-sm text-secondary">Only .xlsx and .xls files are supported</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-8">
                  <div className="text-center space-y-2">
                    <h4 className="text-2xl font-black text-primary">Map Columns</h4>
                    <p className="text-secondary">We've auto-detected your columns. Please verify and correct if needed.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">Date Column</label>
                       <select 
                         className="input" 
                         value={colMap.date} 
                         onChange={e => setColMap(prev => ({ ...prev, date: e.target.value }))}
                       >
                         <option value="">Select Column</option>
                         {headers.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">Description Column</label>
                       <select 
                         className="input" 
                         value={colMap.description} 
                         onChange={e => setColMap(prev => ({ ...prev, description: e.target.value }))}
                       >
                         <option value="">Select Column</option>
                         {headers.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">Date Format</label>
                       <select 
                         className="input" 
                         value={colMap.dateFormat} 
                         onChange={e => setColMap(prev => ({ ...prev, dateFormat: e.target.value as any }))}
                       >
                         <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                         <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                         <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                         <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                         <option value="DD-MMM-YY">DD-MMM-YY</option>
                         <option value="DD-MMM-YYYY">DD-MMM-YYYY</option>
                       </select>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">Amount Style</label>
                       <div className="flex items-center gap-4 py-2">
                         <label className="flex items-center gap-2 cursor-pointer">
                           <input 
                             type="radio" 
                             checked={colMap.amountStyle === 'separate_columns'} 
                             onChange={() => setColMap(prev => ({ ...prev, amountStyle: 'separate_columns' }))}
                           />
                           <span className="text-xs font-medium">Separate Dr/Cr</span>
                         </label>
                         <label className="flex items-center gap-2 cursor-pointer">
                           <input 
                             type="radio" 
                             checked={colMap.amountStyle === 'single_column_signed'} 
                             onChange={() => setColMap(prev => ({ ...prev, amountStyle: 'single_column_signed' }))}
                           />
                           <span className="text-xs font-medium">Single Column</span>
                         </label>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                         {colMap.amountStyle === 'separate_columns' ? 'Debit Column' : 'Amount Column'}
                       </label>
                       <select 
                         className="input" 
                         value={colMap.debit} 
                         onChange={e => setColMap(prev => ({ ...prev, debit: e.target.value }))}
                       >
                         <option value="">Select Column</option>
                         {headers.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                    </div>

                    {colMap.amountStyle === 'separate_columns' && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">Credit Column</label>
                        <select 
                          className="input" 
                          value={colMap.credit} 
                          onChange={e => setColMap(prev => ({ ...prev, credit: e.target.value }))}
                        >
                          <option value="">Select Column</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    )}

                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">Balance Column</label>
                       <select 
                         className="input" 
                         value={colMap.balance} 
                         onChange={e => setColMap(prev => ({ ...prev, balance: e.target.value }))}
                       >
                         <option value="">Select Column</option>
                         {headers.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h5 className="text-[10px] font-bold text-secondary uppercase tracking-widest">Data Preview (Top 10 Rows)</h5>
                    <div className="overflow-x-auto border border-border rounded-2xl">
                      <table className="table w-full">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th className="text-right">Debit</th>
                            <th className="text-right">Credit</th>
                            <th className="text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="text-xs font-mono">{row.date}</td>
                              <td className="text-xs max-w-[200px] truncate">{row.description}</td>
                              <td className="text-xs text-right text-danger font-mono">{row.debit > 0 ? formatCurrency(row.debit) : '—'}</td>
                              <td className="text-xs text-right text-success font-mono">{row.credit > 0 ? formatCurrency(row.credit) : '—'}</td>
                              <td className="text-xs text-right text-primary font-mono">{formatCurrency(row.balance_as_per_statement)}</td>
                            </tr>
                          ))}
                          {previewRows.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-sm text-secondary italic">
                                Map columns to see preview
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="max-w-2xl mx-auto py-10 space-y-8 text-center">
                  <div className="space-y-4">
                    <div className="h-20 w-20 bg-success/10 rounded-3xl flex items-center justify-center text-success mx-auto">
                      <CheckCircle2 className="h-10 w-10" />
                    </div>
                    <h4 className="text-2xl font-black text-primary">Review & Import</h4>
                    <p className="text-secondary leading-relaxed">
                      Please review the import summary for <span className="font-bold text-primary">{selectedAccount?.account_name}</span>.
                    </p>
                  </div>

                  {(() => {
                    const validRows = mapRowsToTransactions(
                      rawRows,
                      colMap as ColumnMap,
                      selectedAccountId,
                      'final',
                      currentUserId
                    );
                    const dates = validRows.map(r => r.date).sort();
                    const skippedCount = rawRows.length - validRows.length;

                    return (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="card bg-surface border border-border p-6 text-left">
                            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Valid Transactions</p>
                            <p className="text-3xl font-black text-primary">{validRows.length}</p>
                            <p className="text-[10px] text-secondary mt-1 italic">To be imported</p>
                          </div>
                          <div className="card bg-surface border border-border p-6 text-left">
                            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Skipped Rows</p>
                            <p className="text-3xl font-black text-warning">{skippedCount}</p>
                            <p className="text-[10px] text-secondary mt-1 italic">Invalid date or empty amount</p>
                          </div>
                        </div>

                        <div className="card bg-accent/5 border border-accent/20 p-6 text-left space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-accent" />
                              <span className="text-xs font-bold text-primary">{file?.name}</span>
                            </div>
                            <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Detected Range</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[9px] text-secondary uppercase font-bold tracking-wider">Start Date</p>
                              <p className="text-base font-mono font-bold text-primary">{dates[0] || '—'}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-secondary/30" />
                            <div className="text-right">
                              <p className="text-[9px] text-secondary uppercase font-bold tracking-wider">End Date</p>
                              <p className="text-base font-mono font-bold text-primary">{dates[dates.length - 1] || '—'}</p>
                            </div>
                          </div>
                        </div>

                        {skippedCount > 0 && (
                          <div className="bg-warning/5 border border-warning/20 rounded-2xl p-4 text-left flex items-start space-x-3">
                            <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                            <p className="text-xs text-secondary leading-relaxed">
                              <span className="font-bold text-warning">Note:</span> {skippedCount} rows were skipped due to missing dates, empty amounts, or unparseable columns. This is common for header/footer sections in bank statements.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border flex items-center justify-between bg-surface">
              <button 
                onClick={() => setStep(prev => prev - 1)}
                disabled={step === 1 || saving}
                className="btn-secondary flex items-center space-x-2 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              
              <div className="flex items-center space-x-3">
                <button onClick={onClose} className="btn-secondary">Cancel</button>
                {step < 4 ? (
                  <button 
                    onClick={() => setStep(prev => prev + 1)}
                    disabled={
                      (step === 1 && !selectedAccountId) || 
                      (step === 2 && !file) ||
                      (step === 3 && previewRows.length === 0)
                    }
                    className="btn-primary flex items-center space-x-2 disabled:opacity-50"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary flex items-center space-x-2 !px-10 disabled:opacity-50 shadow-lg shadow-accent/20"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span>{matching ? 'Matching transactions...' : 'Confirm & Import'}</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
