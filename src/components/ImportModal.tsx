import React, { useState, useRef, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  Timestamp,
  writeBatch,
  doc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { X, Upload, Download, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { cn, formatCurrency } from '../lib/utils';
import { Student } from '../types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

interface ImportRow {
  studentName: string;
  fatherName: string;
  phoneNumber: string;
  schoolName: string;
  standName: string;
  class: string;
  address: string;
  dateOfJoining: string;
  feeAmount: number;
  concession: number;
  oldBalance: number;
  notes: string;
  isActive: boolean;
  session: string;
  errors: Record<string, string>;
  isValid: boolean;
}

export function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState(1);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Fetch existing phone numbers for duplicate detection
      const fetchPhones = async () => {
        const snap = await getDocs(collection(db, 'students'));
        const phones = new Set(snap.docs.map(doc => doc.data().phoneNumber));
        setExistingPhones(phones);
      };
      fetchPhones();
    } else {
      setStep(1);
      setImportData([]);
    }
  }, [isOpen]);

  const downloadTemplate = () => {
    const headers = [
      'Student Name', 'Father Name', 'Phone Number', 'School Name', 
      'Stand Name', 'Class', 'Address', 'Date of Joining (DD/MM/YYYY)', 
      'Fee Amount', 'Concession', 'Old Balance', 'Notes', 'Active (Yes/No)', 'Session'
    ];
    const csvContent = headers.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'Jagriti_Student_Template.csv');
  };

  const validateRow = (row: Partial<ImportRow>, allPhones: Set<string>, currentRows: ImportRow[]): ImportRow => {
    const errors: Record<string, string> = {};
    
    if (!row.studentName) errors.studentName = 'Required';
    
    if (!row.phoneNumber) {
      errors.phoneNumber = 'Required';
    } else if (!/^\d{10}$/.test(row.phoneNumber)) {
      errors.phoneNumber = 'Must be 10 digits';
    } else if (allPhones.has(row.phoneNumber)) {
      errors.phoneNumber = 'Duplicate: Phone number already exists';
    } else if (currentRows.some(r => r.phoneNumber === row.phoneNumber)) {
      errors.phoneNumber = 'Duplicate in file';
    }

    if (row.feeAmount === undefined || isNaN(row.feeAmount)) {
      errors.feeAmount = 'Required number';
    }

    if (!row.dateOfJoining) {
      errors.dateOfJoining = 'Required';
    } else {
      const dateParts = row.dateOfJoining.split('/');
      if (dateParts.length !== 3) {
        errors.dateOfJoining = 'Use DD/MM/YYYY';
      } else {
        const d = parseInt(dateParts[0]);
        const m = parseInt(dateParts[1]) - 1;
        const y = parseInt(dateParts[2]);
        const date = new Date(y, m, d);
        if (isNaN(date.getTime())) {
          errors.dateOfJoining = 'Invalid date';
        }
      }
    }

    return {
      studentName: row.studentName || '',
      fatherName: row.fatherName || '',
      phoneNumber: row.phoneNumber || '',
      schoolName: row.schoolName || '',
      standName: row.standName || '',
      class: row.class || '',
      address: row.address || '',
      dateOfJoining: row.dateOfJoining || '',
      feeAmount: row.feeAmount || 0,
      concession: row.concession || 0,
      oldBalance: row.oldBalance || 0,
      notes: row.notes || '',
      isActive: row.isActive ?? true,
      session: row.session || '2025-26',
      errors,
      isValid: Object.keys(errors).length === 0
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      if (file.name.endsWith('.csv')) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            processParsedData(results.data);
          }
        });
      } else {
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        processParsedData(data);
      }
    };
    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const processParsedData = (data: any[]) => {
    const rows: ImportRow[] = [];
    data.forEach((item: any) => {
      const mappedRow: Partial<ImportRow> = {
        studentName: item['Student Name'] || item['studentName'],
        fatherName: item['Father Name'] || item['fatherName'],
        phoneNumber: String(item['Phone Number'] || item['phoneNumber'] || '').trim(),
        schoolName: item['School Name'] || item['schoolName'],
        standName: item['Stand Name'] || item['standName'],
        class: item['Class'] || item['class'],
        address: item['Address'] || item['address'],
        dateOfJoining: item['Date of Joining (DD/MM/YYYY)'] || item['dateOfJoining'],
        feeAmount: Number(item['Fee Amount'] || item['feeAmount'] || 0),
        concession: Number(item['Concession'] || item['concession'] || 0),
        oldBalance: Number(item['Old Balance'] || item['oldBalance'] || 0),
        notes: item['Notes'] || item['notes'],
        isActive: String(item['Active (Yes/No)'] || item['isActive']).toLowerCase() !== 'no',
        session: item['Session'] || item['session'] || '2025-26'
      };
      rows.push(validateRow(mappedRow, existingPhones, rows));
    });
    setImportData(rows);
    setStep(2);
  };

  const handleInlineEdit = (index: number, field: keyof ImportRow, value: any) => {
    const newRows = [...importData];
    const updatedRow = { ...newRows[index], [field]: value };
    // Re-validate
    const validated = validateRow(updatedRow, existingPhones, newRows.filter((_, i) => i !== index));
    newRows[index] = validated;
    setImportData(newRows);
  };

  const handleConfirmImport = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const validRows = importData.filter(r => r.isValid);
      
      for (const row of validRows) {
        const dateParts = row.dateOfJoining.split('/');
        const date = new Date(parseInt(dateParts[2]), parseInt(dateParts[1]) - 1, parseInt(dateParts[0]));
        
        const studentRef = doc(collection(db, 'students'));
        const studentData = {
          studentName: row.studentName,
          fatherName: row.fatherName,
          phoneNumber: row.phoneNumber,
          schoolName: row.schoolName,
          standName: row.standName,
          class: row.class,
          address: row.address,
          dateOfJoining: Timestamp.fromDate(date),
          feeAmount: row.feeAmount,
          concession: row.concession,
          oldBalance: row.oldBalance,
          totalBalance: row.feeAmount - row.concession + row.oldBalance,
          isActive: row.isActive,
          notes: row.notes,
          session: row.session,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        
        batch.set(studentRef, studentData);
        
        // Add timeline event
        const timelineRef = doc(collection(db, 'students', studentRef.id, 'timeline'));
        batch.set(timelineRef, {
          event: 'Student Imported',
          description: 'Student imported via bulk upload',
          createdBy: 'System',
          createdAt: serverTimestamp()
        });
      }
      
      await batch.commit();
      onSuccess(validRows.length);
      onClose();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import students. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const validCount = importData.filter(r => r.isValid).length;
  const errorCount = importData.length - validCount;

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
                  <h3 className="text-xl font-black text-primary tracking-tight">Bulk Import Students</h3>
                  <div className="flex items-center space-x-2 mt-1">
                    {[1, 2, 3].map((s) => (
                      <div key={s} className="flex items-center">
                        <div className={cn(
                          "h-1.5 w-8 rounded-full transition-all",
                          step >= s ? "bg-accent" : "bg-border"
                        )} />
                        {s < 3 && <div className="w-1" />}
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
              {step === 1 && (
                <div className="max-w-2xl mx-auto py-10 space-y-8 text-center">
                  <div className="space-y-4">
                    <div className="h-20 w-20 bg-accent/10 rounded-3xl flex items-center justify-center text-accent mx-auto">
                      <FileText className="h-10 w-10" />
                    </div>
                    <h4 className="text-2xl font-black text-primary">Step 1: Download Template</h4>
                    <p className="text-secondary leading-relaxed">
                      To ensure a smooth import, please use our standardized template. 
                      Fill in the student details following the column headers exactly.
                    </p>
                  </div>

                  <div className="bg-surface border border-border rounded-2xl p-6 text-left space-y-4">
                    <h5 className="text-xs font-black text-accent uppercase tracking-widest">Instructions:</h5>
                    <ul className="space-y-2 text-sm text-secondary">
                      <li className="flex items-start space-x-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                        <span>Phone numbers must be exactly 10 digits.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                        <span>Date format must be DD/MM/YYYY.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                        <span>Fee Amount, Concession, and Old Balance must be numbers.</span>
                      </li>
                    </ul>
                  </div>

                  <button onClick={downloadTemplate} className="btn-secondary py-4 px-8 flex items-center space-x-3 mx-auto">
                    <Download className="h-5 w-5" />
                    <span>Download CSV Template</span>
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  {importData.length === 0 ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-3xl p-20 text-center space-y-4 hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer group"
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".csv,.xlsx,.xls" 
                        className="hidden" 
                      />
                      <div className="h-16 w-16 bg-accent/10 rounded-2xl flex items-center justify-center text-accent mx-auto group-hover:scale-110 transition-transform">
                        <Upload className="h-8 w-8" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-primary">Click to upload or drag and drop</p>
                        <p className="text-sm text-secondary">CSV or Excel files are supported</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="bg-success/10 text-success px-4 py-2 rounded-xl flex items-center space-x-2">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm font-bold">{validCount} Rows Valid</span>
                          </div>
                          {errorCount > 0 && (
                            <div className="bg-danger/10 text-danger px-4 py-2 rounded-xl flex items-center space-x-2">
                              <AlertCircle className="h-4 w-4" />
                              <span className="text-sm font-bold">{errorCount} Rows with Errors</span>
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={() => {
                            setImportData([]);
                            fileInputRef.current?.click();
                          }}
                          className="text-xs font-bold text-accent hover:underline"
                        >
                          Re-upload File
                        </button>
                      </div>

                      <div className="overflow-x-auto border border-border rounded-2xl">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Phone</th>
                              <th>School</th>
                              <th>Stand</th>
                              <th>Session</th>
                              <th>Fee</th>
                              <th>Joining Date</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importData.map((row, idx) => (
                              <tr key={idx} className={cn(!row.isValid && "bg-danger/5")}>
                                <td>
                                  <input 
                                    type="text"
                                    value={row.studentName}
                                    onChange={(e) => handleInlineEdit(idx, 'studentName', e.target.value)}
                                    className={cn(
                                      "bg-transparent w-full focus:outline-none text-xs font-medium",
                                      row.errors.studentName ? "text-danger border-b border-danger" : "text-primary"
                                    )}
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="text"
                                    value={row.phoneNumber}
                                    onChange={(e) => handleInlineEdit(idx, 'phoneNumber', e.target.value)}
                                    className={cn(
                                      "bg-transparent w-full focus:outline-none text-xs font-mono",
                                      row.errors.phoneNumber ? "text-danger border-b border-danger" : "text-secondary"
                                    )}
                                    title={row.errors.phoneNumber}
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="text"
                                    value={row.schoolName}
                                    onChange={(e) => handleInlineEdit(idx, 'schoolName', e.target.value)}
                                    className="bg-transparent w-full focus:outline-none text-xs text-secondary"
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="text"
                                    value={row.standName}
                                    onChange={(e) => handleInlineEdit(idx, 'standName', e.target.value)}
                                    className="bg-transparent w-full focus:outline-none text-xs text-secondary"
                                  />
                                </td>
                                <td>
                                  <select 
                                    value={row.session}
                                    onChange={(e) => handleInlineEdit(idx, 'session', e.target.value)}
                                    className="bg-transparent w-full focus:outline-none text-xs text-accent font-bold"
                                  >
                                    <option value="2024-25">2024-25</option>
                                    <option value="2025-26">2025-26</option>
                                    <option value="2026-27">2026-27</option>
                                  </select>
                                </td>
                                <td>
                                  <input 
                                    type="number"
                                    value={row.feeAmount}
                                    onChange={(e) => handleInlineEdit(idx, 'feeAmount', Number(e.target.value))}
                                    className={cn(
                                      "bg-transparent w-full focus:outline-none text-xs font-mono",
                                      row.errors.feeAmount ? "text-danger border-b border-danger" : "text-primary"
                                    )}
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="text"
                                    value={row.dateOfJoining}
                                    onChange={(e) => handleInlineEdit(idx, 'dateOfJoining', e.target.value)}
                                    className={cn(
                                      "bg-transparent w-full focus:outline-none text-xs",
                                      row.errors.dateOfJoining ? "text-danger border-b border-danger" : "text-secondary"
                                    )}
                                    placeholder="DD/MM/YYYY"
                                  />
                                </td>
                                <td>
                                  {row.isValid ? (
                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                  ) : (
                                    <div className="group relative">
                                      <AlertCircle className="h-4 w-4 text-danger" />
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-danger text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-10">
                                        {Object.values(row.errors).join(', ')}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="max-w-2xl mx-auto py-10 space-y-8 text-center">
                  <div className="space-y-4">
                    <div className="h-20 w-20 bg-success/10 rounded-3xl flex items-center justify-center text-success mx-auto">
                      <CheckCircle2 className="h-10 w-10" />
                    </div>
                    <h4 className="text-2xl font-black text-primary">Step 3: Confirm Import</h4>
                    <p className="text-secondary leading-relaxed">
                      You are about to import <span className="text-primary font-bold">{validCount}</span> students 
                      into the database. Please review the summary below before confirming.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="card bg-surface border border-border p-6 text-left">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Total to Import</p>
                      <p className="text-3xl font-black text-primary">{validCount}</p>
                    </div>
                    <div className="card bg-surface border border-border p-6 text-left">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Skipped (Errors)</p>
                      <p className="text-3xl font-black text-danger">{errorCount}</p>
                    </div>
                  </div>

                  {errorCount > 0 && (
                    <div className="bg-danger/5 border border-danger/20 rounded-2xl p-4 text-left flex items-start space-x-3">
                      <AlertCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
                      <p className="text-xs text-danger leading-relaxed">
                        <span className="font-bold">Warning:</span> {errorCount} rows contain errors and will be skipped. 
                        You can go back to Step 2 to fix them or proceed with only valid records.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border flex items-center justify-between bg-surface">
              <button 
                onClick={() => setStep(prev => prev - 1)}
                disabled={step === 1 || loading}
                className="btn-secondary flex items-center space-x-2 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              
              <div className="flex items-center space-x-3">
                <button onClick={onClose} className="btn-secondary">Cancel</button>
                {step < 3 ? (
                  <button 
                    onClick={() => setStep(prev => prev + 1)}
                    disabled={(step === 2 && importData.length === 0) || (step === 2 && errorCount > 0)}
                    className="btn-primary flex items-center space-x-2 disabled:opacity-50"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button 
                    onClick={handleConfirmImport}
                    disabled={loading || validCount === 0}
                    className="btn-primary flex items-center space-x-2 !px-10"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span>Confirm Import</span>
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
