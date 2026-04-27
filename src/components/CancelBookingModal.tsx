import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { 
  doc, 
  writeBatch, 
  serverTimestamp, 
  Timestamp,
  increment,
  collection
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { Booking } from '../types';
import { X, AlertTriangle, Trash2, Calendar, Clock, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { motion } from 'framer-motion';

interface CancelBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
}

export function CancelBookingModal({ isOpen, onClose, booking }: CancelBookingModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    reason: '',
    refundAmount: 0,
    refundDate: format(new Date(), 'yyyy-MM-dd'),
    refundMode: 'Cash' as 'Cash' | 'UPI' | 'Bank Transfer',
  });

  const handleCancel = async () => {
    if (!profile || !formData.reason) return;
    if (!window.confirm('Are you absolutely sure you want to CANCEL this booking? This action can be reversed by admin only.')) return;
    
    setLoading(true);

    try {
      const batch = writeBatch(db);
      const bookingRef = doc(db, 'bookings', booking.id);
      
      // 1. Update Booking Status
      batch.update(bookingRef, {
        status: 'CANCELLED',
        cancellationReason: formData.reason,
        refundAmount: Number(formData.refundAmount),
        refundDate: Timestamp.fromDate(new Date(formData.refundDate)),
        updatedAt: serverTimestamp()
      });

      // 2. Adjust Hirer Revenue (Subtract the settlement amount as it's no longer revenue)
      // And also subtract any refund given? Or is refund already part of the adjustment?
      // Since totalRevenue = sum of settlement amounts, we just subtract settlement amount.
      batch.update(doc(db, 'hirers', booking.hirerId), {
        totalRevenue: increment(-booking.settlementAmount)
      });

      // 3. Activity Log
      const activityRef = doc(collection(db, 'bookings', booking.id, 'activity'));
      batch.set(activityRef, {
        action: 'Booking Cancelled',
        details: `Booking cancelled by ${profile.full_name}. Reason: ${formData.reason}. ${formData.refundAmount > 0 ? `Refund of ₹${formData.refundAmount} issued.` : ''}`,
        createdAt: serverTimestamp(),
        createdBy: profile.full_name
      });

      await batch.commit();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bookings');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <Trash2 className="h-6 w-6" />
             </div>
             <div>
                <h3 className="text-lg font-black text-danger uppercase tracking-tighter">Cancel Booking</h3>
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">{booking.dutySlipNumber}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border rounded-xl">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-8 space-y-6">
           <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-bold leading-relaxed">
                Warning: This will mark the booking as CANCELLED and adjust the hirer revenue. This action is recorded in activity logs.
              </p>
           </div>

           <div className="space-y-2">
              <label className="label">Cancellation Reason</label>
              <textarea 
                className="input w-full min-h-[80px]"
                placeholder="Why is this booking being cancelled?"
                value={formData.reason}
                onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                required
              ></textarea>
           </div>

           {booking.totalPaid > 0 && (
             <div className="space-y-4 pt-4 border-t border-border">
                <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4 italic">Refund Details</h4>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="label">Refund Amount (₹)</label>
                      <input 
                        type="number" 
                        className="input w-full bg-accent/5 font-bold text-danger border-danger/20"
                        value={formData.refundAmount || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, refundAmount: Number(e.target.value) }))}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="label">Refund Date</label>
                      <input 
                        type="date" 
                        className="input w-full bg-surface"
                        value={formData.refundDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, refundDate: e.target.value }))}
                      />
                   </div>
                </div>
                <p className="text-[10px] text-secondary italic">Note: Hirer has already paid {formatCurrency(booking.totalPaid)} as advance/payment.</p>
             </div>
           )}
        </div>

        <div className="p-6 bg-background/50 border-t border-border flex gap-3">
           <button onClick={onClose} className="btn-secondary flex-1 py-3 font-bold">Nevermind</button>
           <button 
             onClick={handleCancel}
             disabled={loading || !formData.reason}
             className="btn-danger flex-1 py-3 font-bold flex items-center justify-center gap-2"
           >
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
                <>
                  <Trash2 className="h-4 w-4" />
                  <span>Confirm Cancellation</span>
                </>
              )}
           </button>
        </div>
      </motion.div>
    </div>
  );
}
