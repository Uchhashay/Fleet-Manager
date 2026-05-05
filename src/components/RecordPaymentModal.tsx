import React, { useState } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  doc, 
  writeBatch, 
  Timestamp, 
  serverTimestamp, 
  increment,
  where
} from 'firebase/firestore';
import { applyPaymentToInvoices } from '../lib/invoice-utils';
import { Invoice, Organization } from '../types';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency } from '../lib/utils';
import { amountToWordsIndian } from '../lib/number-utils';
import { X, CreditCard, CheckCircle2, Info } from 'lucide-react';
import { motion } from 'framer-motion';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  profile: any;
}

export function RecordPaymentModal({ isOpen, onClose, invoice, profile }: RecordPaymentModalProps) {
  const [amount, setAmount] = useState(invoice.balanceDue);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [mode, setMode] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Cash');
  const [type, setType] = useState<'Sunday Doorstep' | 'Regular via Driver'>('Regular via Driver');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // Get last receipt number
      const q = query(collection(db, 'receipts'), orderBy('receiptNumber', 'desc'), limit(1));
      const snap = await getDocs(q);
      let lastNum = 0;
      if (!snap.empty) {
        const lastReceiptNumber = snap.docs[0].data().receiptNumber;
        const parts = lastReceiptNumber.split('-');
        if (parts.length > 1) {
          lastNum = parseInt(parts[1]);
        }
      }
      const receiptNumber = `RCP-${(lastNum + 1).toString().padStart(6, '0')}`;

      const rcpRef = doc(collection(db, 'receipts'));
      
      // Use Unified FIFO Adjustment Logic from invoice-utils
      // We first apply to ANY pending invoices including the current one
      // Note: applyPaymentToInvoices already filters for UNPAID/PARTIAL
      const linkedInvoices = await applyPaymentToInvoices(batch, invoice.studentId, amount);

      // Generate description from months
      const monthsPaid = linkedInvoices
        .filter(li => li.invoiceId !== 'ADVANCE')
        .map(li => li.month);
      const uniqueMonths = [...new Set(monthsPaid)];
      const hasAdvance = linkedInvoices.some(li => li.invoiceId === 'ADVANCE');
      
      let description = uniqueMonths.length > 0 
        ? `Fees for ${uniqueMonths.join(', ')}`
        : `Fees for ${invoice.month}`;
        
      if (hasAdvance) {
        description += uniqueMonths.length > 0 ? ' (incl. Advance)' : 'Advance Payment';
      }
      
      if (notes) description = notes;

      const receiptData = {
        receiptNumber,
        invoiceId: linkedInvoices[0]?.invoiceId || invoice.id,
        invoiceNumber: linkedInvoices[0]?.invoiceNumber || invoice.invoiceNumber,
        studentId: invoice.studentId,
        studentName: invoice.studentName,
        fatherName: invoice.fatherName,
        address: invoice.address,
        phoneNumber: invoice.phoneNumber,
        paymentDate: Timestamp.fromDate(new Date(date)),
        paymentMode: mode,
        feeType: type,
        receivedBy: profile.full_name,
        amountReceived: amount,
        amountInWords: amountToWordsIndian(amount),
        linkedInvoices,
        description,
        notes,
        createdAt: serverTimestamp()
      };

      batch.set(rcpRef, receiptData);

      // Update student
      batch.update(doc(db, 'students', invoice.studentId), {
        totalBalance: increment(-amount)
      });

      // Add timeline
      const timelineRef = doc(collection(db, 'students', invoice.studentId, 'timeline'));
      const invoiceInfo = linkedInvoices.length > 0
        ? `Adjusted against: ${linkedInvoices.map(li => li.invoiceNumber).join(', ')}`
        : `Adjusted against invoice: ${invoice.invoiceNumber}`;

      batch.set(timelineRef, {
        event: 'Payment Recorded',
        description: `Payment of ₹${amount} received via ${mode}. ${invoiceInfo}`,
        createdBy: profile.full_name,
        createdAt: serverTimestamp()
      });

      // Add to cash transactions if Cash
      if (mode === 'Cash') {
        const cashRef = doc(collection(db, 'cash_transactions'));
        batch.set(cashRef, {
          date: date,
          type: 'in',
          category: 'fee_collection',
          amount: amount,
          description: `Fee collection for ${invoice.schoolName}: ${invoice.studentName} (${invoice.month})`,
          linked_id: invoice.id,
          paid_by: (profile.role === 'admin' || profile.role === 'developer') ? 'owner' : 'accountant',
          created_by: auth.currentUser?.uid,
          created_at: serverTimestamp()
        });
      }

      await batch.commit();
      alert('Payment recorded successfully.');
      onClose();
    } catch (error) {
      console.error('Error recording payment:', error);
      handleFirestoreError(error, OperationType.WRITE, 'receipts');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-lg rounded-3xl shadow-2xl border border-border overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Record Payment</h3>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Against Invoice {invoice.invoiceNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-accent/5 p-4 rounded-2xl border border-accent/10 space-y-1">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Student Name</p>
            <p className="text-lg font-black text-primary">{invoice.studentName}</p>
            <div className="flex flex-col space-y-1">
              <p className="text-xs text-secondary">Outstanding for {invoice.month}: <span className="font-bold text-danger">{formatCurrency(invoice.balanceDue)}</span></p>
              <p className="text-[10px] text-accent font-bold italic bg-accent/5 px-2 py-1 rounded-lg border border-accent/10">
                ℹ️ FIFO: Payment will be applied to the oldest pending invoices first.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Amount to Pay (₹)</label>
              <input
                required
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="input w-full bg-background font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="label">Payment Date</label>
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input w-full bg-background"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Payment Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="input w-full bg-background"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="label">Fee Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="input w-full bg-background"
              >
                <option value="Regular via Driver">Regular via Driver</option>
                <option value="Sunday Doorstep">Sunday Doorstep</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="label">Internal Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input w-full bg-background min-h-[80px] resize-none"
              placeholder="Internal only notes..."
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button 
              type="submit" 
              disabled={loading || amount <= 0}
              className="btn-primary flex-1 flex items-center justify-center space-x-2"
            >
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>Record Payment</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
