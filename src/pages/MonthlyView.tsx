import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { DailyRecord, Bus } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Download, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Table as TableIcon, Bus as BusIcon, Filter, LayoutGrid } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export function MonthlyView() {
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [selectedBus, setSelectedBus] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  useEffect(() => {
    fetchBuses();
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [currentMonth, selectedBus]);

  async function fetchBuses() {
    const busesSnap = await getDocs(query(collection(db, 'buses'), orderBy('registration_number')));
    const busesList = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
    setBuses(busesList);
    if (busesList.length > 0) setSelectedBus(busesList[0].id);
  }

  async function fetchRecords() {
    setLoading(true);
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

    try {
      let q = query(
        collection(db, 'daily_records'),
        where('date', '>=', start),
        where('date', '<=', end),
        orderBy('date', 'asc')
      );

      if (selectedBus) {
        q = query(q, where('bus_id', '==', selectedBus));
      }

      const recordsSnap = await getDocs(q);
      const recordsList = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyRecord));
      setRecords(recordsList);
    } catch (error) {
      console.error('Error fetching records:', error);
    } finally {
      setLoading(false);
    }
  }

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const exportToCSV = () => {
    const headers = [
      'Date', 'School Morning', 'School Evening', 'Charter Morning', 'Charter Evening', 
      'Private Booking', 'Booking Expense', 'Net Collection', 'Fuel Amount', 'Balance'
    ];
    
    const csvData = daysInMonth.map(day => {
      const record = records.find(r => isSameDay(new Date(r.date), day));
      const netCollection = record ? 
        ((record.school_morning || 0) + (record.school_evening || 0) + (record.charter_morning || 0) + (record.charter_evening || 0) + (record.private_booking || 0)) - (record.booking_expense || 0) 
        : 0;
      
      return [
        format(day, 'yyyy-MM-dd'),
        record?.school_morning || 0,
        record?.school_evening || 0,
        record?.charter_morning || 0,
        record?.charter_evening || 0,
        record?.private_booking || 0,
        record?.booking_expense || 0,
        netCollection,
        record?.fuel_amount || 0,
        netCollection - (record?.fuel_amount || 0)
      ].join(',');
    });

    const csvString = [headers.join(','), ...csvData].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Jagriti_Fleet_${format(currentMonth, 'MMM_yyyy')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totals = records.reduce((acc, curr) => ({
    school_morning: acc.school_morning + (curr.school_morning || 0),
    school_evening: acc.school_evening + (curr.school_evening || 0),
    charter_morning: acc.charter_morning + (curr.charter_morning || 0),
    charter_evening: acc.charter_evening + (curr.charter_evening || 0),
    private_booking: acc.private_booking + (curr.private_booking || 0),
    booking_expense: acc.booking_expense + (curr.booking_expense || 0),
    fuel_amount: acc.fuel_amount + (curr.fuel_amount || 0),
  }), {
    school_morning: 0, school_evening: 0, charter_morning: 0, 
    charter_evening: 0, private_booking: 0, booking_expense: 0, fuel_amount: 0
  });

  const totalNetCollection = 
    (totals.school_morning + totals.school_evening + totals.charter_morning + totals.charter_evening + totals.private_booking) 
    - totals.booking_expense;

  if (loading && records.length === 0) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-6 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <CalendarIcon className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Operational Insights</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Monthly Overview</h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center bg-surface border border-border rounded-xl p-1 shadow-sm">
            <button 
              onClick={() => setViewMode('table')}
              className={cn(
                "flex items-center space-x-2 rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
                viewMode === 'table' ? "bg-background text-primary shadow-sm" : "text-secondary hover:text-primary"
              )}
            >
              <TableIcon className="h-3 w-3 stroke-[1.5px]" />
              <span>Table</span>
            </button>
            <button 
              onClick={() => setViewMode('calendar')}
              className={cn(
                "flex items-center space-x-2 rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
                viewMode === 'calendar' ? "bg-background text-primary shadow-sm" : "text-secondary hover:text-primary"
              )}
            >
              <LayoutGrid className="h-3 w-3 stroke-[1.5px]" />
              <span>Calendar</span>
            </button>
          </div>

          <div className="flex items-center bg-surface border border-border rounded-xl p-1 shadow-sm">
            <button 
              onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
              className="p-2 text-secondary hover:text-primary hover:bg-background rounded-lg transition-colors"
            >
              <ChevronLeft className="h-4 w-4 stroke-[1.5px]" />
            </button>
            <span className="px-4 text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button 
              onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
              className="p-2 text-secondary hover:text-primary hover:bg-background rounded-lg transition-colors"
            >
              <ChevronRight className="h-4 w-4 stroke-[1.5px]" />
            </button>
          </div>

          <div className="relative">
            <select
              value={selectedBus}
              onChange={(e) => setSelectedBus(e.target.value)}
              className="input !py-2.5 !pl-10 !pr-10 appearance-none bg-surface"
            >
              {buses.map(bus => (
                <option key={bus.id} value={bus.id}>{bus.registration_number}</option>
              ))}
            </select>
            <BusIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary stroke-[1.5px]" />
            <Filter className="absolute right-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary stroke-[1.5px] pointer-events-none" />
          </div>

          <button
            onClick={exportToCSV}
            className="btn-secondary flex items-center space-x-2 !py-2.5"
          >
            <Download className="h-4 w-4 stroke-[1.5px]" />
            <span>Export</span>
          </button>
        </div>
      </header>

      <motion.div 
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {viewMode === 'table' ? (
          <div className="card overflow-hidden !p-0 border-border/50">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-surface/50 border-b border-border">
                    <th className="sticky left-0 z-10 bg-surface/50 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Date</th>
                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-secondary border-x border-border/30" colSpan={2}>School Staff</th>
                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-secondary border-x border-border/30" colSpan={2}>Charter/Office</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Private</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Expense</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Net Coll.</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Fuel</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Balance</th>
                  </tr>
                  <tr className="bg-surface/30 border-b border-border text-[9px] font-bold uppercase tracking-widest text-secondary/60">
                    <th className="sticky left-0 z-10 bg-surface/30 px-6 py-2"></th>
                    <th className="px-6 py-2 text-center border-x border-border/20">AM</th>
                    <th className="px-6 py-2 text-center border-x border-border/20">PM</th>
                    <th className="px-6 py-2 text-center border-x border-border/20">AM</th>
                    <th className="px-6 py-2 text-center border-x border-border/20">PM</th>
                    <th className="px-6 py-2"></th>
                    <th className="px-6 py-2"></th>
                    <th className="px-6 py-2"></th>
                    <th className="px-6 py-2"></th>
                    <th className="px-6 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {daysInMonth.map(day => {
                    const record = records.find(r => isSameDay(new Date(r.date), day));
                    const netCollection = record ? 
                      ((record.school_morning || 0) + (record.school_evening || 0) + (record.charter_morning || 0) + (record.charter_evening || 0) + (record.private_booking || 0)) - (record.booking_expense || 0) 
                      : 0;
                    const balance = netCollection - (record?.fuel_amount || 0);

                    return (
                      <tr key={day.toISOString()} className={cn(
                        "group transition-colors",
                        record ? "hover:bg-accent/5" : "bg-surface/20 text-secondary/40"
                      )}>
                        <td className="sticky left-0 z-10 bg-background px-6 py-4 font-mono text-xs group-hover:bg-accent/5 transition-colors">
                          {format(day, 'dd MMM')}
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">{record?.school_morning || '-'}</td>
                        <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">{record?.school_evening || '-'}</td>
                        <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">{record?.charter_morning || '-'}</td>
                        <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">{record?.charter_evening || '-'}</td>
                        <td className="px-6 py-4 font-mono text-xs">{record?.private_booking || '-'}</td>
                        <td className="px-6 py-4 font-mono text-xs text-danger/70">{record?.booking_expense || '-'}</td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-primary">{netCollection || '-'}</td>
                        <td className="px-6 py-4 font-mono text-xs text-danger/70">{record?.fuel_amount || '-'}</td>
                        <td className={cn(
                          "px-6 py-4 font-mono text-xs font-bold",
                          balance > 0 ? "text-success" : balance < 0 ? "text-danger" : ""
                        )}>
                          {balance || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-surface border-t-2 border-border font-bold text-primary">
                  <tr>
                    <td className="sticky left-0 z-10 bg-surface px-6 py-6 text-[10px] uppercase tracking-widest">Totals</td>
                    <td className="px-6 py-6 text-center font-mono text-sm border-x border-border/20">{totals.school_morning}</td>
                    <td className="px-6 py-6 text-center font-mono text-sm border-x border-border/20">{totals.school_evening}</td>
                    <td className="px-6 py-6 text-center font-mono text-sm border-x border-border/20">{totals.charter_morning}</td>
                    <td className="px-6 py-6 text-center font-mono text-sm border-x border-border/20">{totals.charter_evening}</td>
                    <td className="px-6 py-6 font-mono text-sm">{totals.private_booking}</td>
                    <td className="px-6 py-6 font-mono text-sm text-danger">{totals.booking_expense}</td>
                    <td className="px-6 py-6 font-mono text-sm text-accent">{totalNetCollection}</td>
                    <td className="px-6 py-6 font-mono text-sm text-danger">{totals.fuel_amount}</td>
                    <td className={cn(
                      "px-6 py-6 font-mono text-sm",
                      totalNetCollection - totals.fuel_amount >= 0 ? "text-success" : "text-danger"
                    )}>
                      {totalNetCollection - totals.fuel_amount}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="card !p-0 overflow-hidden border-border/50">
            <div className="grid grid-cols-7 gap-px bg-border/30">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-surface/50 py-4 text-center text-[10px] font-bold text-secondary uppercase tracking-[0.2em]">
                  {day}
                </div>
              ))}
              {(() => {
                const start = startOfWeek(startOfMonth(currentMonth));
                const end = endOfWeek(endOfMonth(currentMonth));
                const calendarDays = eachDayOfInterval({ start, end });

                return calendarDays.map(day => {
                  const record = records.find(r => isSameDay(new Date(r.date), day));
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const netCollection = record ? 
                    ((record.school_morning || 0) + (record.school_evening || 0) + (record.charter_morning || 0) + (record.charter_evening || 0) + (record.private_booking || 0)) - (record.booking_expense || 0) 
                    : 0;

                  return (
                    <div 
                      key={day.toISOString()} 
                      className={cn(
                        "min-h-[140px] bg-background p-4 transition-all hover:bg-surface/30 group relative",
                        !isCurrentMonth && "opacity-20 pointer-events-none"
                      )}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className={cn(
                          "text-xs font-bold font-mono",
                          isSameDay(day, new Date()) ? "flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/20" : "text-secondary"
                        )}>
                          {format(day, 'd')}
                        </span>
                        {record && (
                          <div className="flex space-x-1">
                            <div className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                          </div>
                        )}
                      </div>
                      
                      {record && (
                        <div className="space-y-2">
                          <div className="rounded-lg bg-accent/5 border border-accent/10 px-2 py-1.5 transition-colors group-hover:bg-accent/10">
                            <p className="text-[9px] font-bold text-accent uppercase tracking-widest mb-0.5">Net Coll.</p>
                            <p className="text-xs font-bold text-primary font-mono">{formatCurrency(netCollection)}</p>
                          </div>
                          
                          <div className="flex flex-wrap gap-1">
                            {record.private_booking > 0 && (
                              <div className="rounded-md bg-success/10 border border-success/20 px-1.5 py-0.5 text-[8px] font-bold text-success uppercase tracking-widest">
                                Private
                              </div>
                            )}
                            {record.is_holiday && (
                              <div className="rounded-md bg-warning/10 border border-warning/20 px-1.5 py-0.5 text-[8px] font-bold text-warning uppercase tracking-widest">
                                Holiday
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
