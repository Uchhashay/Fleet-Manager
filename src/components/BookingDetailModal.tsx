import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../lib/firebase';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  updateDoc,
  serverTimestamp,
  addDoc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Booking, BookingStatus, BookingPayment } from '../types';
import { 
  X, 
  Edit2, 
  Plus, 
  Truck, 
  Download, 
  MessageSquare, 
  XCircle, 
  ChevronRight,
  Info,
  CreditCard,
  History,
  Phone,
  User,
  MapPin,
  Calendar,
  Clock,
  ExternalLink,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { generateDutySlipPDF } from '../lib/pdf-service';
import { Organization } from '../types';
import { sendBookingWhatsApp } from '../lib/whatsapp-utils';
import { getDoc } from 'firebase/firestore';
import { AssignVehicleModal } from './AssignVehicleModal';
import { AddBookingPaymentModal } from './AddBookingPaymentModal';
import { CancelBookingModal } from './CancelBookingModal';
import { HirerProfileModal } from './HirerProfileModal';

interface BookingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
}

type Tab = 'overview' | 'payments' | 'activity';

export function BookingDetailModal({ isOpen, onClose, bookingId }: BookingDetailModalProps) {
  const { profile } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [payments, setPayments] = useState<BookingPayment[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [orgDetails, setOrgDetails] = useState<Organization | null>(null);

  // Modals
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isHirerProfileOpen, setIsHirerProfileOpen] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const snap = await getDoc(doc(db, 'settings', 'organization'));
      if (snap.exists()) setOrgDetails(snap.data() as Organization);
    };
    fetchSettings();
  }, []);

  const handleDownloadPDF = () => {
    if (!booking || !orgDetails) return;
    const pdf = generateDutySlipPDF(booking, payments, orgDetails);
    pdf.save(`duty-slip-${booking.dutySlipNumber}.pdf`);
  };

  useEffect(() => {
    if (!bookingId || !isOpen) return;

    setLoading(true);
    const unsubBooking = onSnapshot(doc(db, 'bookings', bookingId), (docSnap) => {
      if (docSnap.exists()) {
        setBooking({ id: docSnap.id, ...docSnap.data() } as Booking);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'bookings'));

    const unsubPayments = onSnapshot(query(collection(db, 'bookings', bookingId, 'payments'), orderBy('paymentDate', 'desc')), (snapshot) => {
      setPayments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BookingPayment)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `bookings/${bookingId}/payments`));

    const unsubActivity = onSnapshot(query(collection(db, 'bookings', bookingId, 'activity'), orderBy('createdAt', 'desc')), (snapshot) => {
      setActivity(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `bookings/${bookingId}/activity`));

    return () => {
      unsubBooking();
      unsubPayments();
      unsubActivity();
    };
  }, [bookingId, isOpen]);

  const markDutyDone = async () => {
    if (!booking || !profile) return;
    if (!window.confirm('Mark this duty as completed?')) return;

    try {
      const batch = writeBatch(db);
      const bookingRef = doc(db, 'bookings', booking.id);
      
      batch.update(bookingRef, {
        status: 'DUTY DONE',
        updatedAt: serverTimestamp()
      });

      const activityRef = doc(collection(db, 'bookings', booking.id, 'activity'));
      batch.set(activityRef, {
        action: 'Duty completed',
        details: `Duty marked as done by ${profile.full_name}`,
        createdAt: serverTimestamp(),
        createdBy: profile.full_name
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bookings');
    }
  };

  if (!isOpen) return null;
  if (loading) return null; // Or a spinner
  if (!booking) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-surface w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 border-b border-border bg-background/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
             <div className="h-16 w-16 rounded-3xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner">
                <Calendar className="h-8 w-8" />
             </div>
             <div>
                <h2 className="text-3xl font-black text-primary tracking-tighter leading-none mb-2">{booking.dutySlipNumber}</h2>
                <div className="flex items-center gap-3">
                   <StatusBadge status={booking.status} />
                   <span className="text-[10px] font-black text-secondary/60 uppercase tracking-widest italic">
                     Created {format(booking.createdAt.toDate(), 'PPP')}
                   </span>
                </div>
             </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {(profile?.role === 'admin' || profile?.role === 'developer') && (
              <>
                <button className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface border border-border text-xs font-bold text-primary hover:bg-border transition-all">
                  <Edit2 className="h-4 w-4" />
                  <span>Edit</span>
                </button>
                <button 
                  onClick={() => setIsAssignModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-50 border border-indigo-100 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-all"
                >
                  <Truck className="h-4 w-4" />
                  <span>Assign Fleet</span>
                </button>
              </>
            )}
            <button 
              onClick={() => setIsPaymentModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-600 hover:bg-emerald-100 transition-all"
            >
              <CreditCard className="h-4 w-4" />
              <span>Record Payment</span>
            </button>
            <div className="h-8 w-px bg-border mx-2 hidden md:block" />
            <button 
              onClick={handleDownloadPDF}
              className="h-11 w-11 flex items-center justify-center bg-surface border border-border rounded-2xl text-secondary hover:text-primary hover:bg-border transition-all" 
              title="Download PDF"
            >
              <Download className="h-5 w-5" />
            </button>
            <button 
              onClick={() => sendBookingWhatsApp(booking, orgDetails?.name || 'our company')}
              className="h-11 w-11 flex items-center justify-center bg-surface border border-border rounded-2xl text-secondary hover:text-primary hover:bg-border transition-all" 
              title="WhatsApp Message"
            >
              <MessageSquare className="h-5 w-5" />
            </button>
            {(profile?.role === 'admin' || profile?.role === 'developer') && booking.status !== 'CANCELLED' && (
              <button 
                onClick={() => setIsCancelModalOpen(true)}
                className="h-11 w-11 flex items-center justify-center bg-rose-50 border border-rose-100 text-rose-500 hover:bg-rose-100 transition-all rounded-2xl"
                title="Cancel Booking"
              >
                <XCircle className="h-5 w-5" />
              </button>
            )}
            <button onClick={onClose} className="h-11 w-11 flex items-center justify-center hover:bg-border rounded-2xl transition-all ml-2">
              <X className="h-6 w-6 text-secondary" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
           {/* Left Panel: Info */}
           <div className="w-full lg:w-96 border-r border-border bg-background/30 p-8 overflow-y-auto space-y-10 custom-scrollbar">
              <section className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                    <User className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-secondary">Hirer Identification</h4>
                </div>
                <div className="space-y-4 px-1">
                   <div className="flex flex-col gap-1">
                      <span 
                        onClick={() => setIsHirerProfileOpen(true)}
                        className="text-xl font-black text-primary hover:text-accent cursor-pointer flex items-center gap-2 group"
                      >
                        {booking.hirerName}
                        <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                      <div className="flex flex-wrap gap-3 mt-1">
                        <a href={`tel:${booking.contactNumber}`} className="text-xs font-bold text-indigo-600 flex items-center gap-1.5 hover:underline">
                          <Phone className="h-3 w-3" /> {booking.contactNumber}
                        </a>
                        {booking.alternateContactNumber && (
                          <a href={`tel:${booking.alternateContactNumber}`} className="text-xs font-bold text-secondary flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-all">
                            <span className="w-1 h-1 bg-border rounded-full" />
                            Alt: {booking.alternateContactNumber}
                          </a>
                        )}
                      </div>
                   </div>
                   <div className="flex items-start gap-3 p-4 bg-surface/50 rounded-2xl border border-border/50">
                      <MapPin className="h-4 w-4 text-secondary flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-secondary font-medium italic leading-relaxed">{booking.address}</span>
                   </div>
                </div>
              </section>

              <section className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-secondary">Duty Itinerary</h4>
                </div>
                <div className="space-y-4 px-1">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <span className="text-[10px] font-black text-secondary/60 uppercase tracking-widest">Departure</span>
                        <div className="p-4 bg-surface border border-border rounded-2xl space-y-1 shadow-sm">
                          <p className="text-sm font-black text-primary">{format(booking.departureDate.toDate(), 'dd MMM yyyy')}</p>
                          <p className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {booking.departureTime}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-[10px] font-black text-secondary/60 uppercase tracking-widest">Arrival</span>
                        <div className="p-4 bg-surface border border-border rounded-2xl space-y-1 shadow-sm">
                          <p className="text-sm font-black text-primary">{format(booking.arrivalDate.toDate(), 'dd MMM yyyy')}</p>
                          <p className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {booking.arrivalTime}
                          </p>
                        </div>
                      </div>
                   </div>

                   <div className="space-y-4 pt-2">
                      <div className="flex flex-col gap-1.5 p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Pickup Point</span>
                        <span className="text-sm font-bold text-primary flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-indigo-400" /> {(booking.pickupPoint || '-').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100/50">
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Destination</span>
                        <span className="text-sm font-bold text-primary flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-emerald-400" /> {(booking.destination || '-').toUpperCase()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-6 pt-2 px-2">
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black text-secondary/60 uppercase tracking-widest">Reference</span>
                            <span className="text-xs font-bold text-primary mt-1">{booking.refBy || 'Direct'}</span>
                         </div>
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black text-secondary/60 uppercase tracking-widest">Driver Allw.</span>
                            <span className="text-xs font-bold text-primary mt-1">₹{booking.driverAllowance}/day</span>
                         </div>
                      </div>
                   </div>
                </div>
              </section>

              <section className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                    <Truck className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-secondary">Operational Fleet</h4>
                </div>
                <div className="space-y-4 px-1">
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-secondary/60 uppercase tracking-widest">Required Category</span>
                      <span className="text-sm font-bold text-primary">{booking.vehicleRequired}</span>
                   </div>
                   {booking.vehicleId ? (
                     <div className="p-5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 text-white space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Active Assignment</p>
                          < Truck className="h-4 w-4 text-indigo-300" />
                        </div>
                        <div>
                          <p className="text-lg font-black tracking-tight">{booking.vehicleName}</p>
                          <div className="flex items-center gap-2 text-xs font-bold text-indigo-200 mt-1">
                            <User className="h-3 w-3" />
                            {booking.driverName}
                          </div>
                        </div>
                     </div>
                   ) : (
                     <div className="text-xs text-secondary font-medium italic bg-amber-50 p-4 rounded-2xl border border-dashed border-amber-200 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse" />
                        Awaiting fleet assignment
                     </div>
                   )}
                </div>
              </section>
           </div>           {/* Main Area: Tabs & Financials */}
           <div className="flex-1 flex flex-col bg-slate-50/50">
              {/* Financial Summary Strip */}
              <div className="p-8 bg-surface border-b border-border grid grid-cols-2 lg:grid-cols-4 gap-8">
                 <div className="space-y-1.5 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Agreed Deal</p>
                    <p className="text-2xl font-black text-primary tracking-tighter">{formatCurrency(booking.settlementAmount)}</p>
                 </div>
                 <div className="space-y-1.5 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em]">Extra Charges</p>
                    <p className="text-2xl font-black text-amber-700 tracking-tighter">{formatCurrency(booking.extraCharges || 0)}</p>
                 </div>
                 <div className="space-y-1.5 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Total Amount</p>
                    <p className="text-2xl font-black text-indigo-700 tracking-tighter">{formatCurrency(booking.finalAmount)}</p>
                 </div>
                 <div className="space-y-1.5 p-4 bg-surface rounded-2xl border-2 border-primary/10 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-5">
                       <CreditCard className="h-8 w-8 text-primary" />
                    </div>
                    <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Balance Left</p>
                    <p className={cn(
                      "text-3xl font-black tracking-tighter",
                      booking.balanceDue > 0 ? "text-danger" : "text-success"
                    )}>
                      {formatCurrency(booking.balanceDue)}
                    </p>
                 </div>
              </div>

              {/* Tabs Nav */}
              <div className="px-8 border-b border-border bg-background/50 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-10 h-16">
                   {(['overview', 'payments', 'activity'] as Tab[]).map(tab => (
                     <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "h-full text-[10px] font-black uppercase tracking-[0.25em] relative transition-all",
                          activeTab === tab ? "text-indigo-600" : "text-secondary hover:text-primary"
                        )}
                     >
                       {tab}
                       {activeTab === tab && (
                         <motion.div layoutId="activeTabBooking" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full" />
                       )}
                     </button>
                   ))}
                </div>
                
                {booking.status === 'VEHICLE ASSIGNED' && (
                  <button 
                    onClick={markDutyDone}
                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-5 py-2.5 rounded-2xl transition-all border border-emerald-200"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete Duty
                  </button>
                )}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                 <AnimatePresence mode="wait">
                    {activeTab === 'overview' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-10"
                      >
                         <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                            <div className="space-y-8">
                               <div className="flex items-center gap-3">
                                  <div className="h-6 w-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                                    <Info className="h-4 w-4" />
                                  </div>
                                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Booking Context</h4>
                               </div>
                               <div className="space-y-6">
                                  <div className="p-6 bg-surface rounded-3xl border border-border shadow-sm leading-relaxed text-secondary text-sm space-y-4">
                                     <p>This trip for <span className="font-bold text-primary">{booking.hirerName}</span> to <span className="font-bold text-primary">{booking.destination}</span> was officially logged on <span className="underline decoration-indigo-200 decoration-2 underline-offset-4">{format(booking.createdAt.toDate(), 'PPP')}</span>.</p>
                                     <p>Operational window is set from <span className="font-bold text-indigo-600">{format(booking.departureDate.toDate(), 'dd MMM')}</span> thru <span className="font-bold text-indigo-600">{format(booking.arrivalDate.toDate(), 'dd MMM')}</span>.</p>
                                  </div>
                                  <div className="p-6 bg-slate-900 rounded-3xl text-slate-300 relative overflow-hidden group">
                                     <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <MessageSquare className="h-12 w-12" />
                                     </div>
                                     <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Hirer Requirements / Notes</span>
                                     <p className="text-sm italic leading-relaxed">"{booking.notes || 'No specific notes recorded for this engagement'}"</p>
                                  </div>
                               </div>
                            </div>
                            
                            <div className="space-y-8">
                               <div className="flex items-center gap-3">
                                  <div className="h-6 w-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                                    <History className="h-4 w-4" />
                                  </div>
                                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Workflow Progress</h4>
                               </div>
                               <div className="grid grid-cols-1 gap-3">
                                  <TimelineCard label="Initial Log" subLabel="Booking entry finalized" active />
                                  <TimelineCard label="Commercials" subLabel={booking.totalPaid > 0 ? `Advance ₹${booking.totalPaid} Recv` : "Awaiting Deposit"} active={booking.totalPaid > 0} />
                                  <TimelineCard label="Fleet Readiness" subLabel={booking.vehicleId ? `${booking.vehicleName} Ready` : "Logistics Pending"} active={!!booking.vehicleId} />
                                  <TimelineCard label="Duty Execution" subLabel={booking.status === 'DUTY DONE' || booking.status === 'SETTLED' ? "Mission Success" : "On Schedule"} active={booking.status === 'DUTY DONE' || booking.status === 'SETTLED'} />
                                  <TimelineCard label="Settlement" subLabel={booking.status === 'SETTLED' ? "Account Closed" : "Final Dues Pending"} active={booking.status === 'SETTLED'} />
                               </div>
                            </div>
                         </div>
                      </motion.div>
                    )}

                    {activeTab === 'payments' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-8"
                      >
                         <div className="flex items-center justify-between">
                            <h4 className="text-sm font-black text-primary uppercase tracking-widest">Financial Ledger</h4>
                            <button 
                               onClick={() => setIsPaymentModalOpen(true)}
                               className="flex items-center gap-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2.5 rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                            >
                               <Plus className="h-4 w-4" />
                               <span>New Entry</span>
                            </button>
                         </div>
                         
                         <div className="bg-surface rounded-3xl border border-border shadow-sm overflow-hidden">
                            <table className="table w-full">
                               <thead>
                                  <tr className="bg-slate-50 border-b border-border">
                                     <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-secondary">Recording Date</th>
                                     <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-secondary">Channel</th>
                                     <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-secondary">Assigned To</th>
                                     <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-secondary text-right">Amount</th>
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-border/50">
                                  {payments.length === 0 ? (
                                    <tr>
                                       <td colSpan={4} className="text-center py-20 text-secondary italic text-xs font-medium">No financial transactions detected for this booking</td>
                                    </tr>
                                  ) : (
                                    payments.map(payment => (
                                      <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                                         <td className="px-6 py-4 text-xs font-black text-primary tracking-tight">{format(payment.paymentDate.toDate(), 'dd MMM yyyy')}</td>
                                         <td className="px-6 py-4">
                                           <span className="inline-flex px-3 py-1 rounded-full bg-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-tighter">
                                             {payment.paymentMode}
                                           </span>
                                         </td>
                                         <td className="px-6 py-4 text-[10px] text-secondary font-bold italic tracking-tight">{payment.receivedBy}</td>
                                         <td className="px-6 py-4 text-right">
                                           <span className="text-sm font-black text-primary tracking-tighter">{formatCurrency(payment.amount)}</span>
                                         </td>
                                      </tr>
                                    ))
                                  )}
                               </tbody>
                            </table>
                         </div>

                         {booking.totalPaid > 0 && (
                            <div className="p-8 bg-emerald-600 rounded-3xl text-white flex items-center justify-between shadow-xl shadow-emerald-100 group">
                               <div className="flex items-center gap-5">
                                  <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center text-white backdrop-blur-md">
                                     <CheckCircle2 className="h-8 w-8" />
                                  </div>
                                  <div>
                                     <p className="text-xs font-black uppercase tracking-widest text-emerald-100 mb-1">Total Liquidity Received</p>
                                     <p className="text-sm font-medium text-emerald-50 italic">Verified cumulative amount from all installments</p>
                                  </div>
                               </div>
                               <p className="text-4xl font-black tracking-tighter group-hover:scale-110 transition-transform">{formatCurrency(booking.totalPaid)}</p>
                            </div>
                         )}
                      </motion.div>
                    )}

                    {activeTab === 'activity' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-8"
                      >
                         <h4 className="text-sm font-black text-primary uppercase tracking-widest">Log Audit Trail</h4>
                         <div className="relative pl-8 space-y-10 border-l-2 border-indigo-100 ml-2">
                            {activity.map((item, idx) => (
                              <div key={item.id || idx} className="relative">
                                 <div className="absolute -left-[41px] top-0 h-6 w-6 rounded-full bg-indigo-50 border-4 border-white shadow-sm flex items-center justify-center">
                                    <div className="h-2 w-2 rounded-full bg-indigo-500" />
                                 </div>
                                 <div className="space-y-2 p-5 bg-surface rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between">
                                       <span className="text-xs font-black text-primary uppercase tracking-tight">{item.action}</span>
                                       <span className="text-[10px] font-bold text-secondary bg-slate-50 px-2.5 py-1 rounded-lg">
                                         {format(item.createdAt.toDate(), 'dd MMM, HH:mm')}
                                       </span>
                                    </div>
                                    <p className="text-xs text-secondary font-medium leading-relaxed">{item.details}</p>
                                    <div className="flex items-center gap-2 pt-1">
                                       <User className="h-3 w-3 text-indigo-400" />
                                       <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{item.createdBy}</span>
                                    </div>
                                 </div>
                              </div>
                            ))}
                         </div>
                      </motion.div>
                    )}
                 </AnimatePresence>
              </div>
           </div>
        </div>

        {/* Action Modals */}
        <AssignVehicleModal 
          isOpen={isAssignModalOpen} 
          onClose={() => setIsAssignModalOpen(false)} 
          booking={booking} 
        />
        <AddBookingPaymentModal 
          isOpen={isPaymentModalOpen} 
          onClose={() => setIsPaymentModalOpen(false)} 
          booking={booking} 
        />
        <CancelBookingModal 
          isOpen={isCancelModalOpen} 
          onClose={() => setIsCancelModalOpen(false)} 
          booking={booking} 
        />
        {booking.hirerId && (
          <HirerProfileModal
            isOpen={isHirerProfileOpen}
            onClose={() => setIsHirerProfileOpen(false)}
            hirerId={booking.hirerId}
          />
        )}
      </motion.div>
    </div>
  );
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const config: Record<string, string> = {
    'CONFIRMED': 'bg-blue-100 text-blue-700 border-blue-200',
    'ADVANCE PAID': 'bg-amber-100 text-amber-800 border-amber-200 shadow-amber-50',
    'VEHICLE ASSIGNED': 'bg-purple-100 text-purple-700 border-purple-200',
    'DUTY DONE': 'bg-orange-100 text-orange-700 border-orange-200',
    'SETTLED': 'bg-green-100 text-green-700 border-green-200',
    'CANCELLED': 'bg-red-100 text-red-700 border-red-200',
  };

  return (
    <span className={cn(
      "px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm transition-all",
      config[status] || 'bg-gray-100 text-gray-700'
    )}>
      {status}
    </span>
  );
}

function TimelineCard({ label, subLabel, active }: { label: string, subLabel: string, active: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-2xl border transition-all",
      active ? "bg-surface border-emerald-100 shadow-sm" : "bg-slate-50/50 border-slate-100 opacity-60"
    )}>
       <div className={cn(
         "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
         active ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-400"
       )}>
          {active ? <CheckCircle2 className="h-5 w-5" /> : <div className="h-1.5 w-1.5 bg-slate-400 rounded-full" />}
       </div>
       <div className="flex flex-col">
          <span className={cn("text-xs font-black uppercase tracking-tight", active ? "text-primary" : "text-secondary")}>{label}</span>
          <span className="text-[10px] font-bold text-secondary italic">{subLabel}</span>
       </div>
    </div>
  );
}
