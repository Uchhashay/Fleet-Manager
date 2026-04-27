import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  doc,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Hirer, Booking, BookingStatus } from '../types';
import { 
  X, 
  User, 
  Phone, 
  MapPin, 
  Calendar, 
  History, 
  TrendingUp, 
  CreditCard,
  FileText,
  MessageSquare,
  ExternalLink,
  ChevronRight,
  Clock,
  MapPin as MapPinIcon,
  CheckCircle2,
  XCircle,
  Truck
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface HirerProfileModalProps {
  hirerId: string;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { color: string, icon: any }> = {
  'CONFIRMED': { color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  'ADVANCE PAID': { color: 'bg-amber-100 text-amber-800', icon: CreditCard },
  'VEHICLE ASSIGNED': { color: 'bg-purple-100 text-purple-700', icon: Truck },
  'DUTY DONE': { color: 'bg-orange-100 text-orange-700', icon: Calendar },
  'SETTLED': { color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  'CANCELLED': { color: 'bg-red-100 text-red-700', icon: XCircle },
};

export function HirerProfileModal({ hirerId, isOpen, onClose }: HirerProfileModalProps) {
  const { profile } = useAuth();
  const [hirer, setHirer] = useState<Hirer | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings'>('overview');

  useEffect(() => {
    if (!isOpen || !hirerId) return;

    setLoading(true);
    
    // Fetch hirer data
    const unsubHirer = onSnapshot(doc(db, 'hirers', hirerId), (snap) => {
      if (snap.exists()) {
        setHirer({ id: snap.id, ...snap.data() } as Hirer);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, `hirers/${hirerId}`));

    // Fetch hirer bookings
    const q = query(
      collection(db, 'bookings'),
      where('hirerId', '==', hirerId),
      orderBy('departureDate', 'desc')
    );
    const unsubBookings = onSnapshot(q, (snap) => {
      setBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bookings'));

    return () => {
      unsubHirer();
      unsubBookings();
    };
  }, [isOpen, hirerId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-surface w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 border-b border-border bg-background/50 flex items-center justify-between">
          <div className="flex items-center gap-5">
             <div className="h-16 w-16 rounded-3xl bg-accent/10 flex items-center justify-center text-accent shadow-inner">
                <User className="h-8 w-8" />
             </div>
             <div>
                <h2 className="text-3xl font-black text-primary tracking-tighter leading-none mb-1">
                  {hirer?.hirerName || 'Loading...'}
                </h2>
                <div className="flex items-center gap-3">
                   <span className="text-[10px] font-black text-secondary/60 uppercase tracking-widest italic">
                     Customer Profile
                   </span>
                </div>
             </div>
          </div>
          <button onClick={onClose} className="h-11 w-11 flex items-center justify-center hover:bg-border rounded-2xl transition-all">
            <X className="h-6 w-6 text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
           {/* Left Panel: Info */}
           <div className="w-full lg:w-80 border-r border-border bg-background/30 p-8 overflow-y-auto space-y-10 custom-scrollbar">
              <section className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Contact Information</h4>
                <div className="space-y-4">
                   <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-accent mt-0.5" />
                      <div>
                        <p className="text-[10px] font-black text-secondary/50 uppercase">Phone Number</p>
                        <p className="text-sm font-bold text-primary tracking-tighter">{hirer?.contactNumber}</p>
                      </div>
                   </div>
                   {hirer?.alternateNumber && (
                     <div className="flex items-start gap-3">
                        <Phone className="h-4 w-4 text-secondary mt-0.5 opacity-50" />
                        <div>
                          <p className="text-[10px] font-black text-secondary/50 uppercase">Alternate Number</p>
                          <p className="text-sm font-bold text-primary tracking-tighter">{hirer.alternateNumber}</p>
                        </div>
                     </div>
                   )}
                   <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-accent mt-0.5" />
                      <div>
                        <p className="text-[10px] font-black text-secondary/50 uppercase">Address</p>
                        <p className="text-xs font-semibold text-secondary italic leading-relaxed">{hirer?.address}</p>
                      </div>
                   </div>
                </div>
              </section>

              <section className="space-y-4 pt-4 border-t border-border/50">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Account Metrics</h4>
                <div className="grid grid-cols-1 gap-3">
                   <div className="p-4 bg-surface border border-border rounded-2xl shadow-sm">
                      <p className="text-[10px] font-black text-secondary/60 uppercase">Total Bookings</p>
                      <p className="text-xl font-black text-primary">{hirer?.totalBookings || 0}</p>
                   </div>
                   <div className="p-4 bg-surface border border-border rounded-2xl shadow-sm">
                      <p className="text-[10px] font-black text-secondary/60 uppercase">Total Revenue</p>
                      <p className="text-xl font-black text-success tracking-tighter">{formatCurrency(hirer?.totalRevenue || 0)}</p>
                   </div>
                </div>
              </section>

              {hirer?.notes && (
                <section className="space-y-4 pt-4 border-t border-border/50">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Internal Notes</h4>
                  <p className="text-xs text-secondary italic leading-relaxed bg-surface/50 p-4 rounded-2xl border border-border/50">
                    {hirer.notes}
                  </p>
                </section>
              )}
           </div>

           {/* Main Area */}
           <div className="flex-1 flex flex-col bg-slate-50/50">
              {/* Tabs Nav */}
              <div className="px-8 border-b border-border bg-background/50 flex items-center gap-10 h-16 shadow-sm z-10">
                 {(['overview', 'bookings'] as const).map(tab => (
                   <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "h-full text-[10px] font-black uppercase tracking-[0.25em] relative transition-all",
                        activeTab === tab ? "text-accent" : "text-secondary hover:text-primary"
                      )}
                   >
                     {tab}
                     {activeTab === tab && (
                       <motion.div layoutId="activeTabHirer" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />
                     )}
                   </button>
                 ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <AnimatePresence mode="wait">
                  {activeTab === 'overview' && (
                    <motion.div
                      key="overview"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="card border-border shadow-sm p-6 space-y-4">
                           <div className="flex items-center gap-3 text-accent mb-2">
                              <History className="h-5 w-5" />
                              <h3 className="font-black text-primary uppercase tracking-widest text-xs">Recent Activity</h3>
                           </div>
                           <div className="space-y-4">
                              {bookings.slice(0, 3).map(booking => (
                                <div key={booking.id} className="flex flex-col p-3 bg-background/50 rounded-xl border border-border shadow-sm">
                                   <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] font-black text-primary">{booking.dutySlipNumber}</span>
                                      <StatusBadge status={booking.status} />
                                   </div>
                                   <p className="text-xs font-bold text-secondary">{booking.destination}</p>
                                   <p className="text-[9px] text-secondary/60 mt-1">{format(booking.departureDate.toDate(), 'dd MMM yyyy')}</p>
                                </div>
                              ))}
                              {bookings.length === 0 && (
                                <p className="text-xs text-secondary italic text-center py-4">No recent bookings found</p>
                              )}
                           </div>
                        </div>

                        <div className="card border-border shadow-sm p-6 space-y-4">
                           <div className="flex items-center gap-3 text-success mb-2">
                              <TrendingUp className="h-5 w-5" />
                              <h3 className="font-black text-primary uppercase tracking-widest text-xs">Lifetime Value</h3>
                           </div>
                           <div className="space-y-6 flex flex-col justify-center h-full">
                              <div className="text-center">
                                 <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">Total Contribution</p>
                                 <p className="text-4xl font-black text-primary tracking-tighter font-mono">{formatCurrency(hirer?.totalRevenue || 0)}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="text-center p-3 bg-success/5 rounded-2xl border border-success/10">
                                    <p className="text-[9px] font-black text-success uppercase">Avg. Booking</p>
                                    <p className="text-lg font-black text-primary">
                                      {hirer?.totalBookings ? formatCurrency(hirer.totalRevenue / hirer.totalBookings) : '₹0'}
                                    </p>
                                 </div>
                                 <div className="text-center p-3 bg-accent/5 rounded-2xl border border-accent/10">
                                    <p className="text-[9px] font-black text-accent uppercase">Loyalty Score</p>
                                    <p className="text-lg font-black text-primary">{hirer?.totalBookings || 0}</p>
                                 </div>
                              </div>
                           </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'bookings' && (
                    <motion.div
                      key="bookings"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      <div className="overflow-x-auto rounded-2xl border border-border shadow-sm bg-surface">
                        <table className="table w-full">
                          <thead>
                            <tr className="bg-background/50 border-b border-border">
                              <th className="text-[10px] uppercase font-black tracking-widest text-secondary p-4">Slip No.</th>
                              <th className="text-[10px] uppercase font-black tracking-widest text-secondary p-4">Date</th>
                              <th className="text-[10px] uppercase font-black tracking-widest text-secondary p-4">Destination</th>
                              <th className="text-[10px] uppercase font-black tracking-widest text-secondary p-4 text-right">Amount</th>
                              <th className="text-[10px] uppercase font-black tracking-widest text-secondary p-4 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                            {bookings.map(booking => (
                              <tr key={booking.id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="p-4 font-mono font-bold text-xs text-secondary">{booking.dutySlipNumber}</td>
                                <td className="p-4 text-xs font-semibold text-primary">
                                   {format(booking.departureDate.toDate(), 'dd MMM yyyy')}
                                </td>
                                <td className="p-4 text-xs font-bold text-primary">{booking.destination}</td>
                                <td className="p-4 text-right">
                                   <span className="text-xs font-black text-primary tracking-tight">{formatCurrency(booking.finalAmount)}</span>
                                </td>
                                <td className="p-4 text-center">
                                   <StatusBadge status={booking.status} />
                                </td>
                              </tr>
                            ))}
                            {bookings.length === 0 && (
                              <tr>
                                <td colSpan={5} className="text-center py-20 text-secondary italic text-xs">No bookings history available for this hirer.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
           </div>
        </div>
      </motion.div>
    </div>
  );
}

function StatusBadge({ status }: { status: BookingStatus | string }) {
  const config = STATUS_CONFIG[status] || { color: 'bg-gray-100 text-gray-700', icon: Calendar };
  const Icon = config.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
      config.color
    )}>
      <Icon className="h-2.5 w-2.5" />
      {status}
    </span>
  );
}
