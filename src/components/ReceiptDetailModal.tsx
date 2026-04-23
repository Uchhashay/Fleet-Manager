import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../lib/firebase';
import { Receipt, Invoice } from '../types';
import { OperationType, handleFirestoreError } from '../lib/firestore-errors';
import { formatCurrency, cn } from '../lib/utils';
import { CheckCircle2, X, AlertCircle, Download, MessageSquare } from 'lucide-react';

interface ReceiptDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: Receipt;
  invoice: Invoice | undefined;
  profile: any;
  onDownload?: () => void;
  onWhatsApp?: () => void;
}

export function ReceiptDetailModal({ 
  isOpen, 
  onClose, 
  receipt, 
  invoice, 
  profile,
  onDownload,
  onWhatsApp
}: ReceiptDetailModalProps) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [notes, setNotes] = useState(receipt.notes || '');
  const [description, setDescription] = useState(receipt.description || '');
  const [loading, setLoading] = useState(false);

  const handleSaveNotes = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'receipts', receipt.id), {
        notes,
        updatedAt: serverTimestamp()
      });
      setIsEditingNotes(false);
      alert('Notes updated successfully.');
    } catch (error) {
      console.error('Error updating receipt notes:', error);
      handleFirestoreError(error, OperationType.UPDATE, `receipts/${receipt.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDescription = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'receipts', receipt.id), {
        description,
        updatedAt: serverTimestamp()
      });
      setIsEditingDescription(false);
      alert('Description updated successfully.');
    } catch (error) {
      console.error('Error updating receipt description:', error);
      handleFirestoreError(error, OperationType.UPDATE, `receipts/${receipt.id}`);
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
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Receipt Details</h3>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">{receipt.receiptNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Student</p>
              <p className="text-sm font-black text-primary">{receipt.studentName}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Amount Received</p>
              <p className="text-lg font-black text-success">{formatCurrency(receipt.amountReceived)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Payment Date</p>
              <p className="text-sm font-bold text-primary">{format(receipt.paymentDate.toDate ? receipt.paymentDate.toDate() : new Date(receipt.paymentDate), 'dd MMM yyyy')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Payment Mode</p>
              <p className="text-sm font-bold text-primary">{receipt.paymentMode}</p>
            </div>
          </div>

          {/* Description Section (Printed on Receipt) */}
          <div className="p-4 bg-accent/5 border border-border rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-black text-primary uppercase tracking-wider">
                Description (Printed on Receipt)
              </h5>
              {!isEditingDescription && (
                <button 
                  onClick={() => setIsEditingDescription(true)}
                  className="text-[10px] font-bold text-accent hover:underline"
                >
                  Edit Description
                </button>
              )}
            </div>
            
            {isEditingDescription ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input w-full bg-background text-sm"
                  placeholder="e.g. Fees for January, February"
                />
                <div className="flex justify-end space-x-2">
                  <button onClick={() => setIsEditingDescription(false)} className="px-3 py-1 text-[10px] font-bold text-secondary hover:bg-border/50 rounded-lg">Cancel</button>
                  <button 
                    onClick={handleSaveDescription} 
                    disabled={loading}
                    className="px-3 py-1 text-[10px] font-bold bg-accent text-white rounded-lg hover:bg-accent/90"
                  >
                    {loading ? 'Saving...' : 'Save Description'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-primary font-medium">{receipt.description || 'No description added.'}</p>
            )}
          </div>

          {/* Internal Notes Section */}
          <div className="p-4 bg-warning/10 border border-warning/20 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-black text-warning uppercase tracking-wider flex items-center gap-2">
                <AlertCircle className="h-3 w-3" />
                Internal Notes (Not Printed)
              </h5>
              {!isEditingNotes && (
                <button 
                  onClick={() => setIsEditingNotes(true)}
                  className="text-[10px] font-bold text-warning hover:underline"
                >
                  Edit Notes
                </button>
              )}
            </div>
            
            {isEditingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input w-full bg-background min-h-[80px] text-sm resize-none"
                  placeholder="Add internal notes..."
                />
                <div className="flex justify-end space-x-2">
                  <button onClick={() => setIsEditingNotes(false)} className="px-3 py-1 text-[10px] font-bold text-secondary hover:bg-border/50 rounded-lg">Cancel</button>
                  <button 
                    onClick={handleSaveNotes} 
                    disabled={loading}
                    className="px-3 py-1 text-[10px] font-bold bg-warning text-white rounded-lg hover:bg-warning/90"
                  >
                    {loading ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-primary">{receipt.notes || 'No internal notes added.'}</p>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-border bg-accent/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button 
              onClick={onWhatsApp}
              className="flex-1 sm:flex-none btn-secondary text-accent border-accent/20 hover:bg-accent/5 flex items-center justify-center space-x-2"
            >
              <MessageSquare className="h-4 w-4" />
              <span>WhatsApp</span>
            </button>
            <button 
              onClick={onDownload}
              className="flex-1 sm:flex-none btn-secondary flex items-center justify-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>Download PDF</span>
            </button>
          </div>
          <button onClick={onClose} className="w-full sm:w-auto btn-primary">Close</button>
        </div>
      </motion.div>
    </div>
  );
}
