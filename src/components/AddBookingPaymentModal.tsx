import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  Timestamp,
  increment
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { Booking, BookingPayment, BookingStatus } from '../types';
import { X, CreditCard, DollarSign, Calendar, CheckCircle2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

interface AddBookingPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
}

export function AddBookingPaymentModal({ isOpen, onClose, booking }: AddBookingPaymentModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: 0,
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
    paymentMode: 'Cash' as 'Cash' | 'UPI' | 'Bank Transfer',
    receivedBy: profile?.full_name || '',
    extraCharges: 0,
    extraChargesReason: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      const bookingRef = doc(db, 'bookings', booking.id);
      const paymentRef = doc(collection(db, 'bookings', booking.id, 'payments'));
      
      const newTotalPaid = booking.totalPaid + formData.amount;
      const newExtraCharges = (booking.extraCharges || 0) + formData.extraCharges;
      const newFinalAmount = booking.settlementAmount + newExtraCharges;
      const newBalanceDue = newFinalAmount - newTotalPaid;
      
      let newStatus: BookingStatus = booking.status;
      if (newBalanceDue <= 0 && booking.status !== 'CANCELLED') {
        newStatus = 'SETTLED';
      } else if (newTotalPaid > 0 && booking.status === 'CONFIRMED') {
        newStatus = 'ADVANCE PAID';
      }

      // 1. Add Payment
      batch.set(paymentRef, {
        amount: Number(formData.amount),
        paymentDate: Timestamp.fromDate(new Date(formData.paymentDate)),
        paymentMode: formData.paymentMode,
        receivedBy: formData.receivedBy,
        notes: formData.notes,
        createdAt: serverTimestamp(),
      });

      // 2. Update Booking
      batch.update(bookingRef, {
        totalPaid: Number(newTotalPaid),
        extraCharges: Number(newExtraCharges),
        extraChargesReason: formData.extraChargesReason || booking.extraChargesReason,
        finalAmount: Number(newFinalAmount),
        balanceDue: Number(newBalanceDue),
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      // 3. Update Hirer Revenue (only for the amount paid now?) 
      // Actually, standard is to update revenue as the settlement amount, but here we update as payments come.
      batch.update(doc(db, 'hirers', booking.hirerId), {
        totalRevenue: increment(formData.amount)
      });

      // 4. Activity Log
      const activityRef = doc(collection(db, 'bookings', booking.id, 'activity'));
      batch.set(activityRef, {
        action: 'Payment Received',
        details: `Received ₹${formData.amount} via ${formData.paymentMode}.${formData.extraCharges > 0 ? ` Added ₹${formData.extraCharges} as extra charges.` : ''}`,
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
        className="bg-surface w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
                <DollarSign className="h-6 w-6" />
             </div>
             <div>
                <h3 className="text-lg font-black text-primary font-sans">Add Payment</h3>
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">{booking.dutySlipNumber}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border rounded-xl">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <label className="label">Payment Amount (₹)</label>
                 <input 
                   type="number" 
                   className="input w-full font-black text-lg text-primary"
                   value={formData.amount || ''}
                   onChange={(e) => setFormData(prev => ({ ...prev, amount: Number(e.target.value) }))}
                   required
                   max={booking.balanceDue + 50000} // Loose limit
                 />
              </div>
              <div className="space-y-2">
                 <label className="label">Payment Date</label>
                 <input 
                   type="date" 
                   className="input w-full"
                   value={formData.paymentDate}
                   onChange={(e) => setFormData(prev => ({ ...prev, paymentDate: e.target.value }))}
                   required
                 />
              </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <label className="label">Payment Mode</label>
                 <select 
                    className="input w-full"
                    value={formData.paymentMode}
                    onChange={(e) => setFormData(prev => ({ ...prev, paymentMode: e.target.value as any }))}
                 >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="label">Received By</label>
                 <input 
                   type="text" 
                   className="input w-full"
                   value={formData.receivedBy}
                   onChange={(e) => setFormData(prev => ({ ...prev, receivedBy: e.target.value }))}
                   required
                 />
              </div>
           </div>

           <div className="p-4 bg-accent/5 rounded-2xl border border-accent/20 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                 <Plus className="h-4 w-4 text-accent" />
                 <span className="text-[10px] font-black uppercase text-accent tracking-widest">Extra Charges (Optional)</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-[10px] uppercase font-bold text-secondary">Amount</label>
                   <input 
                     type="number" 
                     className="input w-full bg-surface"
                     placeholder="₹0"
                     value={formData.extraCharges || ''}
                     onChange={(e) => setFormData(prev => ({ ...prev, extraCharges: Number(e.target.value) }))}
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] uppercase font-bold text-secondary">Reason</label>
                   <input 
                     type="text" 
                     className="input w-full bg-surface"
                     placeholder="e.g. Night charge, toll..."
                     value={formData.extraChargesReason}
                     onChange={(e) => setFormData(prev => ({ ...prev, extraChargesReason: e.target.value }))}
                   />
                </div>
              </div>
           </div>

           <div className="space-y-2">
              <label className="label">Internal Notes</label>
              <textarea 
                className="input w-full min-h-[60px]"
                placeholder="Any payment references or notes..."
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              ></textarea>
           </div>
        </form>

        <div className="p-6 bg-background/50 border-t border-border flex gap-3">
           <button onClick={onClose} className="btn-secondary flex-1 py-3 font-bold">Cancel</button>
           <button 
             onClick={handleSubmit}
             disabled={loading || formData.amount < 0}
             className="btn-primary flex-1 py-3 font-bold flex items-center justify-center gap-2"
           >
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Post Payment</span>
                </>
              )}
           </button>
        </div>
      </motion.div>
    </div>
  );
}
