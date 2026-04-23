import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { 
  doc, 
  updateDoc, 
  writeBatch, 
  increment, 
  serverTimestamp, 
  Timestamp,
  collection
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Invoice } from '../types';
import { FileText, X, AlertCircle, Trash2, Save } from 'lucide-react';

interface EditInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  profile: any;
}

export function EditInvoiceModal({ isOpen, onClose, invoice, profile }: EditInvoiceModalProps) {
  const [invoiceDate, setInvoiceDate] = useState(format(invoice.invoiceDate.toDate ? invoice.invoiceDate.toDate() : new Date(invoice.invoiceDate), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(format(invoice.dueDate.toDate ? invoice.dueDate.toDate() : new Date(invoice.dueDate), 'yyyy-MM-dd'));
  const [itemDescription, setItemDescription] = useState(invoice.itemDescription || `${invoice.schoolName} [${invoice.standName}] Transport Fees`);
  const [feeAmount, setFeeAmount] = useState(invoice.feeAmount);
  const [invoiceConcession, setInvoiceConcession] = useState(invoice.invoiceConcession || 0);
  const [notes, setNotes] = useState(invoice.notes || '');
  const [terms, setTerms] = useState(invoice.terms || 'Due on Receipt');
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const profileConcession = invoice.profileConcession || 0;
  const totalConcession = profileConcession + invoiceConcession;
  const totalAmount = feeAmount - totalConcession;
  const balanceDue = totalAmount - invoice.paidAmount;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const invoiceRef = doc(db, 'invoices', invoice.id);
      
      let newStatus = invoice.status;
      if (balanceDue <= 0) {
        newStatus = 'PAID';
      } else if (invoice.paidAmount > 0) {
        newStatus = 'PARTIAL';
      } else {
        newStatus = 'UNPAID';
      }

      const historyEntry = {
        editedBy: auth.currentUser?.uid || '',
        userName: profile.full_name,
        editedAt: new Date()
      };

      const updatedData = {
        invoiceDate: Timestamp.fromDate(new Date(invoiceDate)),
        dueDate: Timestamp.fromDate(new Date(dueDate)),
        itemDescription,
        feeAmount,
        invoiceConcession,
        concession: totalConcession,
        totalAmount,
        balanceDue,
        status: newStatus,
        notes,
        terms,
        editHistory: [...(invoice.editHistory || []), historyEntry],
        updatedAt: serverTimestamp()
      };

      batch.update(invoiceRef, updatedData);

      // Update student balance
      const balanceDiff = totalAmount - invoice.totalAmount;
      if (balanceDiff !== 0) {
        batch.update(doc(db, 'students', invoice.studentId), {
          totalBalance: increment(balanceDiff)
        });
      }

      // Timeline event
      const timelineRef = doc(collection(db, 'students', invoice.studentId, 'timeline'));
      batch.set(timelineRef, {
        event: 'Invoice Edited',
        description: `Invoice ${invoice.invoiceNumber} was edited by ${profile.full_name}`,
        createdBy: profile.full_name,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      alert('Invoice updated successfully.');
      onClose();
    } catch (error) {
      console.error('Error updating invoice:', error);
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoice.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // Delete the invoice
      batch.delete(doc(db, 'invoices', invoice.id));

      // Update student balance (subtract the invoice amount)
      batch.update(doc(db, 'students', invoice.studentId), {
        totalBalance: increment(-invoice.totalAmount)
      });

      // Add timeline event
      const timelineRef = doc(collection(db, 'students', invoice.studentId, 'timeline'));
      batch.set(timelineRef, {
        event: 'Invoice Deleted',
        description: `Invoice ${invoice.invoiceNumber} was deleted by ${profile.full_name}`,
        createdBy: profile.full_name,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      alert('Invoice deleted successfully.');
      onClose();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      handleFirestoreError(error, OperationType.DELETE, `invoices/${invoice.id}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-2xl rounded-3xl shadow-2xl border border-border overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center text-warning">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Edit Invoice</h3>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">{invoice.invoiceNumber} - {invoice.studentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {showDeleteConfirm && (
            <div className="p-4 bg-danger/10 border border-danger/20 rounded-2xl space-y-3">
              <div className="flex items-center space-x-2 text-danger">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-black">Confirm Deletion</span>
              </div>
              <p className="text-xs text-secondary font-medium">
                Are you sure you want to delete invoice <strong>{invoice.invoiceNumber}</strong>? This will also update the student's balance. This action cannot be undone.
              </p>
              <div className="flex space-x-2">
                <button 
                  type="button" 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 bg-surface border border-border rounded-lg text-xs font-bold hover:bg-border/50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleDelete}
                  className="flex-1 py-2 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger/90 transition-colors"
                >
                  Yes, Delete Invoice
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Invoice Date</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="input w-full bg-background" required />
            </div>
            <div className="space-y-2">
              <label className="label">Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input w-full bg-background" required />
            </div>
          </div>

          <div className="space-y-2">
            <label className="label">Item Description</label>
            <input type="text" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} className="input w-full bg-background" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Fee Amount (Rate)</label>
              <input type="number" value={feeAmount} onChange={(e) => setFeeAmount(Number(e.target.value))} className="input w-full bg-background font-mono" required />
            </div>
            <div className="space-y-2">
              <label className="label">Invoice Concession</label>
              <input type="number" value={invoiceConcession} onChange={(e) => setInvoiceConcession(Number(e.target.value))} className="input w-full bg-background font-mono" />
              <p className="text-[10px] text-secondary font-bold">Profile Concession: {formatCurrency(profileConcession)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Terms</label>
              <input type="text" value={terms} onChange={(e) => setTerms(e.target.value)} className="input w-full bg-background" />
            </div>
            <div className="space-y-2">
              <label className="label">Internal Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full bg-background" placeholder="Internal only..." />
            </div>
          </div>

          <div className="bg-accent/5 p-4 rounded-2xl border border-accent/10 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary font-bold">Sub Total:</span>
              <span className="text-primary font-black font-mono">{formatCurrency(feeAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary font-bold">Total Discount:</span>
              <span className="text-danger font-black font-mono">-{formatCurrency(totalConcession)}</span>
            </div>
            <div className="flex justify-between text-lg border-t border-accent/10 pt-2">
              <span className="text-primary font-black">Total:</span>
              <span className="text-accent font-black font-mono">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary font-bold">Already Paid:</span>
              <span className="text-success font-black font-mono">{formatCurrency(invoice.paidAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span className="text-secondary">Balance Due:</span>
              <span className={cn("font-black font-mono", balanceDue > 0 ? "text-danger" : "text-success")}>{formatCurrency(balanceDue)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button 
              type="button" 
              onClick={() => setShowDeleteConfirm(true)} 
              className="btn-secondary text-danger border-danger/20 hover:bg-danger/5 flex items-center space-x-2"
              disabled={loading || invoice.paidAmount > 0}
              title={invoice.paidAmount > 0 ? "Cannot delete an invoice with payments" : "Delete Invoice"}
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center space-x-2">
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
