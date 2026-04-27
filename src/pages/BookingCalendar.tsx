import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  Timestamp
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Booking, BookingStatus } from '../types';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Plus
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  addDays
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_COLORS: Record<string, string> = {
  'CONFIRMED': 'bg-blue-500',
  'ADVANCE PAID': 'bg-yellow-500',
  'VEHICLE ASSIGNED': 'bg-purple-500',
  'DUTY DONE': 'bg-orange-500',
  'SETTLED': 'bg-green-500',
  'CANCELLED': 'bg-red-500',
};

import { BookingDetailModal } from '../components/BookingDetailModal';

export function BookingCalendar() {
  const { profile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    // For calendar, we probably want to load more than just one month for smooth transitions
    // but startOfMonth(subMonths(currentDate, 1)) to endOfMonth(addMonths(currentDate, 1))
    const q = query(collection(db, 'bookings'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bookings'));

    return () => unsubscribe();
  }, []);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  return (
    <div className="space-y-8 h-full flex flex-col">
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-primary tracking-tight">Calendar View</h2>
          <p className="text-secondary font-medium italic">Monitor upcoming duties and fleet availability</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface border border-border p-1 rounded-xl shadow-sm">
            <button onClick={prevMonth} className="p-2 hover:bg-border rounded-lg text-secondary transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="px-6 text-sm font-black text-primary min-w-[150px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-border rounded-lg text-secondary transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <button onClick={goToToday} className="btn-secondary py-2.5 px-4 text-xs font-bold whitespace-nowrap">Today</button>
          {(profile?.role === 'admin' || profile?.role === 'developer') && (
            <button className="btn-primary py-2.5 px-4 text-xs font-bold flex items-center gap-2 whitespace-nowrap">
              <Plus className="h-4 w-4" />
              <span>New Booking</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[700px] card p-0 overflow-hidden border border-border shadow-md bg-surface flex flex-col">
        {/* Calendar Header: Weekdays */}
        <div className="grid grid-cols-7 border-b border-border bg-background/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-secondary border-r border-border last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 flex-1 overflow-auto bg-border/20 gap-[1px]">
          {days.map((day, idx) => {
            const dayBookings = bookings.filter(b => b.departureDate && isSameDay(b.departureDate.toDate(), day));
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isTodayDay = isToday(day);

            return (
              <div 
                key={day.toString()} 
                className={cn(
                  "min-h-[120px] bg-surface p-2 transition-all group flex flex-col",
                  !isCurrentMonth && "bg-background/20 opacity-50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={cn(
                    "h-7 w-7 flex items-center justify-center text-xs font-bold rounded-lg transition-transform",
                    isTodayDay ? "bg-accent text-white scale-110 shadow-lg shadow-accent/20" : "text-primary group-hover:scale-110"
                  )}>
                    {format(day, 'd')}
                  </span>
                  {dayBookings.length > 0 && (
                    <span className="text-[10px] font-black text-secondary leading-none">
                      {dayBookings.length} {dayBookings.length === 1 ? 'Duty' : 'Duties'}
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
                  {dayBookings.map((booking) => (
                    <motion.div
                      layoutId={booking.id}
                      key={booking.id}
                      onClick={() => {
                        setSelectedBookingId(booking.id);
                        setIsDetailModalOpen(true);
                      }}
                      className={cn(
                        "p-1.5 rounded-lg text-white text-[10px] font-bold leading-tight shadow-sm cursor-pointer hover:brightness-110 transition-all truncate",
                        STATUS_COLORS[booking.status] || 'bg-primary'
                      )}
                      title={`${booking.hirerName} - ${booking.destination}`}
                    >
                      <div className="flex items-center gap-1">
                        <Clock className="h-2 w-2 flex-shrink-0" />
                        <span className="truncate">{booking.dutySlipNumber} | {booking.destination}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-6 p-4 bg-surface rounded-2xl border border-border shadow-sm">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-full shadow-sm", color)}></div>
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{status}</span>
          </div>
        ))}
      </div>

      {selectedBookingId && (
        <BookingDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedBookingId(null);
          }}
          bookingId={selectedBookingId}
        />
      )}
    </div>
  );
}
