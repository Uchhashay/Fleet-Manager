import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  Timestamp,
  writeBatch,
  doc,
  increment,
  query,
  orderBy,
  limit,
  getDocs,
  where
} from 'firebase/firestore';
import { Student } from '../types';
import { format, endOfMonth } from 'date-fns';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency } from '../lib/utils';
import { X, Save, FileText, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface RaiseSingleInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  profile: any;
}

export function RaiseSingleInvoiceModal({ isOpen, onClose, student, profile }: RaiseSingleInvoiceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'MMMM yyyy'));
  const [schoolName, setSchoolName] = useState(student.schoolName);
  const [description, setDescription] = useState(`${student.schoolName} [${student.standName}] Transport Fees`);
  const [feeAmount, setFeeAmount] = useState(student.feeAmount);
  const [concession, setConcession] = useState(student.concession);
  const [terms, setTerms] = useState('Due on Receipt');
  const [notes, setNotes] = useState('');

  const totalAmount = feeAmount - concession;

  const handleRaise = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile) return;
    setLoading(true);
    setError(null);

    try {
      const batch = writeBatch(db);
      const invoiceDate = serverTimestamp();
      const dueDate = Timestamp.fromDate(endOfMonth(new Date()));

      // Check if invoice already exists for this month (only if not already confirmed)
      if (!showConfirm) {
        const existingSnap = await getDocs(query(
          collection(db, 'invoices'),
          where('studentId', '==', student.id),
          where('month', '==', selectedMonth)
        ));

        if (!existingSnap.empty) {
          setShowConfirm(true);
          setLoading(false);
          return;
        }
      }

      // Get last invoice number
      const q = query(collection(db, 'invoices'), orderBy('invoiceNumber', 'desc'), limit(1));
      const snap = await getDocs(q);
      let lastNum = 0;
      if (!snap.empty) {
        const lastInvoiceNumber = snap.docs[0].data().invoiceNumber;
        const parts = lastInvoiceNumber.split('-');
        if (parts.length > 1) {
          lastNum = parseInt(parts[1]);
        }
      }

      const invoiceNumber = `JTT-${(lastNum + 1).toString().padStart(6, '0')}`;

      const invoiceData = {
        invoiceNumber,
        studentId: student.id,
        studentName: student.studentName,
        fatherName: student.fatherName,
        schoolName,
        standName: student.standName,
        address: student.address,
        phoneNumber: student.phoneNumber,
        invoiceDate,
        dueDate,
        month: selectedMonth,
        feeAmount,
        profileConcession: student.concession,
        invoiceConcession: concession - student.concession,
        concession,
        totalAmount,
        paidAmount: 0,
        balanceDue: totalAmount,
        status: 'UNPAID',
        itemDescription: description,
        terms,
        notes,
        createdBy: profile.full_name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const invRef = doc(collection(db, 'invoices'));
      batch.set(invRef, invoiceData);

      // Update student balance
      batch.update(doc(db, 'students', student.id), {
        totalBalance: increment(totalAmount)
      });

      // Add timeline
      const timelineRef = doc(collection(db, 'students', student.id, 'timeline'));
      batch.set(timelineRef, {
        event: 'Invoice Raised',
        description: `Invoice ${invoiceNumber} raised for ${selectedMonth}`,
        createdBy: profile.full_name,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      setSuccess(`Successfully raised invoice ${invoiceNumber}.`);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error raising invoice:', error);
      setError('Failed to raise invoice. Please try again.');
      handleFirestoreError(error, OperationType.CREATE, 'invoices');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-lg rounded-3xl shadow-2xl border border-border overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Raise Invoice</h3>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">For {student.studentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <form onSubmit={handleRaise} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl flex items-center space-x-2 text-danger text-xs font-bold">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-success/10 border border-success/20 rounded-xl flex items-center space-x-2 text-success text-xs font-bold">
              <CheckCircle2 className="h-4 w-4" />
              <span>{success}</span>
            </div>
          )}

          {showConfirm && (
            <div className="p-4 bg-warning/10 border border-warning/20 rounded-2xl space-y-3">
              <div className="flex items-center space-x-2 text-warning">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-black">Duplicate Invoice Detected</span>
              </div>
              <p className="text-xs text-secondary font-medium">
                An invoice for <strong>{selectedMonth}</strong> already exists for this student. Do you want to raise another one?
              </p>
              <div className="flex space-x-2">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowConfirm(false);
                    setLoading(false);
                  }}
                  className="flex-1 py-2 bg-surface border border-border rounded-lg text-xs font-bold hover:bg-border/50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={() => handleRaise()}
                  className="flex-1 py-2 bg-warning text-white rounded-lg text-xs font-bold hover:bg-warning/90 transition-colors"
                >
                  Yes, Raise Anyway
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Select Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="input w-full bg-background"
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() + (i - 2));
                  const m = format(d, 'MMMM yyyy');
                  return <option key={m} value={m}>{m}</option>;
                })}
              </select>
            </div>
            <div className="space-y-2">
              <label className="label">School Name</label>
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="input w-full bg-background"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="label">Item Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full bg-background min-h-[80px] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Fee Amount (₹)</label>
              <input
                type="number"
                value={feeAmount}
                onChange={(e) => setFeeAmount(Number(e.target.value))}
                className="input w-full bg-background font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="label">Total Concession (₹)</label>
              <input
                type="number"
                value={concession}
                onChange={(e) => setConcession(Number(e.target.value))}
                className="input w-full bg-background font-mono text-success"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="label">Terms</label>
            <input
              type="text"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="input w-full bg-background"
            />
          </div>

          <div className="space-y-2">
            <label className="label">Internal Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input w-full bg-background min-h-[60px] resize-none"
              placeholder="Internal only..."
            />
          </div>

          <div className="bg-accent/5 rounded-2xl p-4 flex items-center justify-between border border-accent/10">
            <div className="flex items-center space-x-2 text-secondary">
              <Info className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Total Amount</span>
            </div>
            <span className="text-xl font-black font-mono text-accent">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button 
              type="submit" 
              disabled={loading || totalAmount < 0}
              className="btn-primary flex-1 flex items-center justify-center space-x-2"
            >
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
              <span>Raise Invoice</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
