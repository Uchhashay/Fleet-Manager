import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  Timestamp,
  doc,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Booking, BookingStatus } from '../types';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronRight, 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Phone,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Truck,
  Download,
  MessageSquare,
  Eye,
  FileText,
  Edit2,
  Trash2,
  CreditCard
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isToday, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { generateDutySlipPDF } from '../lib/pdf-service';
import { BookingPayment, Organization } from '../types';
import { sendBookingWhatsApp } from '../lib/whatsapp-utils';
import { NewBookingModal } from '../components/NewBookingModal';
import { BookingDetailModal } from '../components/BookingDetailModal';
import { HirerProfileModal } from '../components/HirerProfileModal';

const STATUS_CONFIG: Record<BookingStatus, { color: string, icon: any }> = {
  'CONFIRMED': { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: CheckCircle2 },
  'ADVANCE PAID': { color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: CreditCard },
  'VEHICLE ASSIGNED': { color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: Truck },
  'DUTY DONE': { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: Calendar },
  'SETTLED': { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  'CANCELLED': { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

export function AllBookings() {
  const { profile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>(format(new Date(), 'yyyy-MM'));

  // Modal states
  const [isNewBookingModalOpen, setIsNewBookingModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedHirerId, setSelectedHirerId] = useState<string | null>(null);
  const [isHirerProfileOpen, setIsHirerProfileOpen] = useState(false);

  // Printing states
  const [orgDetails, setOrgDetails] = useState<Organization | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const snap = await getDoc(doc(db, 'settings', 'organization'));
      if (snap.exists()) setOrgDetails(snap.data() as Organization);
    };
    fetchSettings();
  }, []);

  const handlePrintClick = async (booking: Booking) => {
    // Fetch payments first to ensure data is ready
    let payments: BookingPayment[] = [];
    try {
      const paymentsSnap = await getDocs(query(collection(db, 'bookings', booking.id, 'payments'), orderBy('paymentDate', 'desc')));
      payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BookingPayment));
    } catch (error) {
      console.error("Error fetching payments for print:", error);
    }

    if (orgDetails) {
      const pdf = generateDutySlipPDF(booking, payments, orgDetails);
      pdf.save(`duty-slip-${booking.dutySlipNumber}.pdf`);
    } else {
      // Fallback if settings not loaded
      const snap = await getDoc(doc(db, 'settings', 'organization'));
      const org = snap.exists() ? snap.data() as Organization : {} as Organization;
      const pdf = generateDutySlipPDF(booking, payments, org);
      pdf.save(`duty-slip-${booking.dutySlipNumber}.pdf`);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('departureDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bookings'));

    return () => unsubscribe();
  }, []);

  const filteredBookings = useMemo(() => {
    return bookings.filter(booking => {
      const matchesSearch = 
        booking.hirerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.dutySlipNumber.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
      
      const depDate = booking.departureDate?.toDate();
      const matchesMonth = !monthFilter || (depDate && format(depDate, 'yyyy-MM') === monthFilter);

      return matchesSearch && matchesStatus && matchesMonth;
    });
  }, [bookings, searchTerm, statusFilter, monthFilter]);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    
    const todayDuties = bookings.filter(b => b.departureDate && isToday(b.departureDate.toDate())).length;
    const monthBookings = bookings.filter(b => b.createdAt && b.createdAt.toDate() >= startOfCurrentMonth).length;
    const totalOutstanding = bookings.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
    const monthRevenue = bookings
      .filter(b => b.createdAt && b.createdAt.toDate() >= startOfCurrentMonth)
      .reduce((sum, b) => sum + (b.totalPaid || 0), 0);

    return { todayDuties, monthBookings, totalOutstanding, monthRevenue };
  }, [bookings]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-primary tracking-tight">All Bookings</h2>
          <p className="text-secondary font-medium italic">Manage duty slips and tour bookings</p>
        </div>
        {(profile?.role === 'admin' || profile?.role === 'developer') && (
          <button 
            onClick={() => setIsNewBookingModalOpen(true)}
            className="btn-primary flex items-center space-x-2 shadow-lg shadow-accent/20"
          >
            <Plus className="h-5 w-5" />
            <span>New Booking</span>
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <BookingStatCard label="Today's Duties" value={stats.todayDuties} icon={Calendar} color="accent" />
        <BookingStatCard label="This Month Bookings" value={stats.monthBookings} icon={FileText} color="primary" />
        <BookingStatCard label="Total Outstanding" value={formatCurrency(stats.totalOutstanding)} icon={AlertCircle} color="danger" />
        <BookingStatCard label="This Month Revenue" value={formatCurrency(stats.monthRevenue)} icon={CreditCard} color="success" />
      </div>

      {/* Filters */}
      <div className="bg-surface p-4 rounded-2xl border border-border flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
          <input 
            type="text" 
            placeholder="Search hirer, destination, or DS number..." 
            className="input pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select 
          className="input min-w-[150px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="CONFIRMED">CONFIRMED</option>
          <option value="ADVANCE PAID">ADVANCE PAID</option>
          <option value="VEHICLE ASSIGNED">VEHICLE ASSIGNED</option>
          <option value="DUTY DONE">DUTY DONE</option>
          <option value="SETTLED">SETTLED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
        <input 
          type="month" 
          className="input min-w-[150px]"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden border border-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr className="bg-background/50">
                <th className="text-xs uppercase tracking-widest font-bold font-sans">Slip No.</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans">Hirer</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans">Dep. Date</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans">Destination</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans">Vehicle/Driver</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans text-right">Amount</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans text-right">Balance</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans text-center">Status</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10">
                    <div className="flex flex-col items-center gap-2">
                       <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                       <span className="text-xs font-bold text-secondary animate-pulse">Loading bookings...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-20">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-16 w-16 rounded-full bg-border/20 flex items-center justify-center text-secondary">
                        <FileText className="h-8 w-8" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl font-bold text-primary">No bookings found</p>
                        <p className="text-xs text-secondary italic">Try adjusting your filters or search term</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr 
                    key={booking.id} 
                    className="hover:bg-accent/5 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedBooking(booking);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    <td className="font-mono font-bold text-xs text-secondary">{booking.dutySlipNumber}</td>
                    <td>
                      <div className="flex flex-col">
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedHirerId(booking.hirerId);
                            setIsHirerProfileOpen(true);
                          }}
                          className="font-bold text-primary text-sm hover:text-accent cursor-pointer transition-colors"
                        >
                          {booking.hirerName}
                        </span>
                        <span className="text-[10px] text-secondary flex items-center gap-1">
                          <Phone className="h-2 w-2" /> {booking.contactNumber}
                        </span>
                      </div>
                    </td>
                    <td className="text-xs font-medium text-secondary">
                      {booking.departureDate ? format(booking.departureDate.toDate(), 'dd MMM yyyy') : '-'}
                      <div className="text-[10px] font-bold italic opacity-60 flex items-center gap-1">
                        <Clock className="h-2 w-2" /> {booking.departureTime}
                      </div>
                    </td>
                    <td className="text-sm font-semibold text-primary">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-accent" />
                        {booking.destination}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col text-[10px] space-y-1">
                        <div className="flex items-center gap-1 text-secondary font-bold">
                          <Truck className="h-3 w-3" />
                          <span>{booking.vehicleName || booking.vehicleRequired}</span>
                        </div>
                        <div className="flex items-center gap-1 text-secondary">
                          <User className="h-3 w-3" />
                          <span>{booking.driverName || 'Not Assigned'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-black text-primary">{formatCurrency(booking.finalAmount)}</span>
                        <span className="text-[10px] text-success font-bold">Paid: {formatCurrency(booking.totalPaid)}</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <span className={cn(
                        "text-sm font-black font-mono",
                        booking.balanceDue > 0 ? "text-danger" : "text-success"
                      )}>
                        {formatCurrency(booking.balanceDue)}
                      </span>
                    </td>
                    <td className="text-center">
                      <StatusBadge status={booking.status} />
                    </td>
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                       <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBooking(booking);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-2 hover:bg-border rounded-lg text-secondary" 
                            title="View Detail"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              sendBookingWhatsApp(booking, 'our company');
                            }}
                            className="p-2 hover:bg-border rounded-lg text-secondary" 
                            title="WhatsApp Message"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintClick(booking);
                            }}
                            className="p-2 hover:bg-border rounded-lg text-secondary" 
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <NewBookingModal 
        isOpen={isNewBookingModalOpen} 
        onClose={() => setIsNewBookingModalOpen(false)} 
      />
      {selectedBooking && (
        <BookingDetailModal 
          isOpen={isDetailModalOpen} 
          onClose={() => setIsDetailModalOpen(false)} 
          bookingId={selectedBooking.id} 
        />
      )}
      {selectedHirerId && (
        <HirerProfileModal
          isOpen={isHirerProfileOpen}
          onClose={() => setIsHirerProfileOpen(false)}
          hirerId={selectedHirerId}
        />
      )}
    </div>
  );
}

function BookingStatCard({ label, value, icon: Icon, color }: { label: string, value: string | number, icon: any, color: string }) {
  const colors: Record<string, string> = {
    accent: 'bg-accent/10 text-accent border-accent/20',
    primary: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-success/10 text-success border-success/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
  };

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="card bg-surface flex items-start justify-between shadow-sm hover:shadow-md transition-all border border-border/50"
    >
      <div className="space-y-4">
        <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">{label}</p>
        <p className="text-3xl font-black text-primary tracking-tight font-mono">{value}</p>
      </div>
      <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", colors[color] || colors.primary)}>
        <Icon className="h-6 w-6 stroke-[1.5px]" />
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const config = STATUS_CONFIG[status] || { color: 'bg-gray-100 text-gray-700', icon: AlertCircle };
  const Icon = config.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm",
      config.color
    )}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}
