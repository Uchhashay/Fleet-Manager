import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { DailyRecord, Bus } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { Download, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Table as TableIcon, Bus as BusIcon, Filter, LayoutGrid, AlertCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

import { useSearchParams } from 'react-router-dom';

export function MonthlyView() {
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [selectedBus, setSelectedBus] = useState<string>(searchParams.get('busId') || 'all');
  const [currentMonth, setCurrentMonth] = useState(
    searchParams.get('month') ? new Date(searchParams.get('month')!) : new Date()
  );
  const [loading, setLoading] = useState(true);
  const [busesLoading, setBusesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    'school_staff', 'charter_office', 'private', 'net_coll', 'net_exp', 'balance'
  ]));
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);

  const toggleColumn = (col: string) => {
    const next = new Set(visibleColumns);
    if (next.has(col)) {
      if (next.size > 1) next.delete(col);
    } else {
      next.add(col);
    }
    setVisibleColumns(next);
  };

  const columns = [
    { id: 'school_staff', label: 'School Staff' },
    { id: 'charter_office', label: 'Charter/Office' },
    { id: 'private', label: 'Private' },
    { id: 'net_coll', label: 'Net Collection' },
    { id: 'net_exp', label: 'Net Expense' },
    { id: 'balance', label: 'Balance' },
  ];

  useEffect(() => {
    fetchBuses();
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [currentMonth, selectedBus]);

  async function fetchBuses() {
    setBusesLoading(true);
    try {
      const busesSnap = await getDocs(query(collection(db, 'buses'), orderBy('registration_number')));
      const busesList = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
      setBuses(busesList);
    } catch (err) {
      console.error('Error fetching buses:', err);
      setError('Failed to load buses. Please check your connection.');
    } finally {
      setBusesLoading(false);
    }
  }

  async function fetchRecords() {
    setLoading(true);
    setError(null);
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

    try {
      let q = query(
        collection(db, 'daily_records'),
        where('date', '>=', start),
        where('date', '<=', end)
      );

      if (selectedBus && selectedBus !== 'all') {
        q = query(q, where('bus_id', '==', selectedBus));
      }

      const recordsSnap = await getDocs(q);
      const recordsList = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyRecord));
      
      // Sort in memory to avoid complex index requirements
      const sortedList = recordsList.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setRecords(sortedList);
    } catch (err) {
      console.error('Error fetching records:', err);
      try {
        handleFirestoreError(err, OperationType.GET, 'daily_records');
      } catch (e: any) {
        setError(e.message);
      }
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
      'Private Booking', 'Booking Details', 'Net Collection', 'Net Expense', 'Balance'
    ];
    
    const csvData = daysInMonth.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayRecords = records.filter(r => r.date === dateStr);
      
      // If 'all' buses, sum them up for the day
      const school_morning = dayRecords.reduce((sum, r) => sum + (r.school_morning || 0), 0);
      const school_evening = dayRecords.reduce((sum, r) => sum + (r.school_evening || 0), 0);
      const charter_morning = dayRecords.reduce((sum, r) => sum + (r.charter_morning || 0), 0);
      const charter_evening = dayRecords.reduce((sum, r) => sum + (r.charter_evening || 0), 0);
      const private_booking = dayRecords.reduce((sum, r) => sum + (r.private_booking || 0), 0);
      const fuel_amount = dayRecords.reduce((sum, r) => sum + (r.fuel_amount || 0), 0);
      const duty_paid = dayRecords.reduce((sum, r) => sum + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0);
      const netCollection = school_morning + school_evening + charter_morning + charter_evening + private_booking;
      const netExpense = fuel_amount + duty_paid;
      
      return [
        dateStr,
        school_morning,
        school_evening,
        charter_morning,
        charter_evening,
        private_booking,
        `"${dayRecords.map(r => r.booking_details).filter(Boolean).join('; ')}"`,
        netCollection,
        netExpense,
        netCollection - netExpense
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
    net_expense: acc.net_expense + (curr.fuel_amount || 0) + (curr.driver_duty_paid || 0) + (curr.helper_duty_paid || 0),
  }), {
    school_morning: 0, school_evening: 0, charter_morning: 0, 
    charter_evening: 0, private_booking: 0, net_expense: 0
  });

  const totalNetCollection = 
    (totals.school_morning + totals.school_evening + totals.charter_morning + totals.charter_evening + totals.private_booking);

  if (loading || busesLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <div className="rounded-full bg-danger/10 p-3 text-danger">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-bold text-primary">Something went wrong</h3>
        <p className="text-sm text-secondary max-w-md mx-auto mt-1">
          {error.includes('{') ? 'A database error occurred. Please check your security rules or indexes.' : error}
        </p>
      </div>
      <button 
        onClick={() => { setError(null); fetchBuses(); fetchRecords(); }}
        className="btn-primary"
      >
        Try Again
      </button>
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
              <option value="all">All Buses</option>
              {buses.map(bus => (
                <option key={bus.id} value={bus.id}>{bus.registration_number}</option>
              ))}
            </select>
            <BusIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary stroke-[1.5px]" />
            <Filter className="absolute right-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary stroke-[1.5px] pointer-events-none" />
          </div>

          <div className="relative">
            <button 
              onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
              className="btn-secondary flex items-center space-x-2 !py-2.5"
            >
              <LayoutGrid className="h-4 w-4 stroke-[1.5px]" />
              <span>Columns</span>
            </button>
            
            <AnimatePresence>
              {isColumnSelectorOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-20" 
                    onClick={() => setIsColumnSelectorOpen(false)}
                  />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 z-30 w-56 bg-surface border border-border rounded-xl shadow-xl p-2"
                  >
                    <div className="space-y-1">
                      {columns.map(col => (
                        <button
                          key={col.id}
                          onClick={() => toggleColumn(col.id)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors",
                            visibleColumns.has(col.id) ? "bg-accent/10 text-accent" : "text-secondary hover:bg-surface/50"
                          )}
                        >
                          <span>{col.label}</span>
                          {visibleColumns.has(col.id) && (
                            <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
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
                    <th className="sticky left-0 z-10 bg-surface px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Date</th>
                    {visibleColumns.has('school_staff') && (
                      <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-secondary border-x border-border/30" colSpan={2}>School Staff</th>
                    )}
                    {visibleColumns.has('charter_office') && (
                      <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-secondary border-x border-border/30" colSpan={2}>Charter/Office</th>
                    )}
                    {visibleColumns.has('private') && (
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Private</th>
                    )}
                    {visibleColumns.has('net_coll') && (
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Net Coll.</th>
                    )}
                    {visibleColumns.has('net_exp') && (
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Net Exp.</th>
                    )}
                    {visibleColumns.has('balance') && (
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Balance</th>
                    )}
                  </tr>
                  <tr className="bg-surface/30 border-b border-border text-[9px] font-bold uppercase tracking-widest text-secondary/60">
                    <th className="sticky left-0 z-10 bg-surface px-6 py-2"></th>
                    {visibleColumns.has('school_staff') && (
                      <>
                        <th className="px-6 py-2 text-center border-x border-border/20">AM</th>
                        <th className="px-6 py-2 text-center border-x border-border/20">PM</th>
                      </>
                    )}
                    {visibleColumns.has('charter_office') && (
                      <>
                        <th className="px-6 py-2 text-center border-x border-border/20">AM</th>
                        <th className="px-6 py-2 text-center border-x border-border/20">PM</th>
                      </>
                    )}
                    {visibleColumns.has('private') && <th className="px-6 py-2"></th>}
                    {visibleColumns.has('net_coll') && <th className="px-6 py-2"></th>}
                    {visibleColumns.has('net_exp') && <th className="px-6 py-2"></th>}
                    {visibleColumns.has('balance') && <th className="px-6 py-2"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {daysInMonth.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayRecords = records.filter(r => r.date === dateStr);
                    const hasData = dayRecords.length > 0;
                    
                    const school_morning = dayRecords.reduce((sum, r) => sum + (r.school_morning || 0), 0);
                    const school_evening = dayRecords.reduce((sum, r) => sum + (r.school_evening || 0), 0);
                    const charter_morning = dayRecords.reduce((sum, r) => sum + (r.charter_morning || 0), 0);
                    const charter_evening = dayRecords.reduce((sum, r) => sum + (r.charter_evening || 0), 0);
                    const private_booking = dayRecords.reduce((sum, r) => sum + (r.private_booking || 0), 0);
                    const fuel_amount = dayRecords.reduce((sum, r) => sum + (r.fuel_amount || 0), 0);
                    const duty_paid = dayRecords.reduce((sum, r) => sum + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0);
                    
                    const netCollection = school_morning + school_evening + charter_morning + charter_evening + private_booking;
                    const netExpense = fuel_amount + duty_paid;
                    const balance = netCollection - netExpense;

                    return (
                      <tr key={day.toISOString()} className={cn(
                        "group transition-colors",
                        hasData ? "hover:bg-accent/5" : "bg-surface/20 text-secondary/40"
                      )}>
                        <td className="sticky left-0 z-10 bg-background px-6 py-4 font-mono text-xs group-hover:bg-accent/5 transition-colors border-r border-border/10">
                          {format(day, 'dd MMM')}
                        </td>
                        {visibleColumns.has('school_staff') && (
                          <>
                            <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">{hasData ? school_morning : '-'}</td>
                            <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">{hasData ? school_evening : '-'}</td>
                          </>
                        )}
                        {visibleColumns.has('charter_office') && (
                          <>
                            <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">{hasData ? charter_morning : '-'}</td>
                            <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">{hasData ? charter_evening : '-'}</td>
                          </>
                        )}
                        {visibleColumns.has('private') && (
                          <td className="px-6 py-4 font-mono text-xs">
                            <div>{hasData ? private_booking : '-'}</div>
                            {dayRecords.some(r => r.booking_details) && (
                              <div className="text-[10px] text-secondary font-sans mt-0.5 max-w-[120px] truncate" title={dayRecords.map(r => r.booking_details).filter(Boolean).join(', ')}>
                                {dayRecords.map(r => r.booking_details).filter(Boolean).join(', ')}
                              </div>
                            )}
                          </td>
                        )}
                        {visibleColumns.has('net_coll') && (
                          <td className="px-6 py-4 font-mono text-xs font-bold text-primary">{hasData ? netCollection : '-'}</td>
                        )}
                        {visibleColumns.has('net_exp') && (
                          <td className="px-6 py-4 font-mono text-xs text-danger/70">{hasData ? netExpense : '-'}</td>
                        )}
                        {visibleColumns.has('balance') && (
                          <td className={cn(
                            "px-6 py-4 font-mono text-xs font-bold",
                            balance > 0 ? "text-success" : balance < 0 ? "text-danger" : ""
                          )}>
                            {hasData ? balance : '-'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-surface border-t-2 border-border font-bold text-primary">
                  <tr>
                    <td className="sticky left-0 z-10 bg-surface px-6 py-6 text-[10px] uppercase tracking-widest border-r border-border/10">Totals</td>
                    {visibleColumns.has('school_staff') && (
                      <>
                        <td className="px-6 py-6 text-center font-mono text-sm border-x border-border/20">{totals.school_morning}</td>
                        <td className="px-6 py-6 text-center font-mono text-sm border-x border-border/20">{totals.school_evening}</td>
                      </>
                    )}
                    {visibleColumns.has('charter_office') && (
                      <>
                        <td className="px-6 py-6 text-center font-mono text-sm border-x border-border/20">{totals.charter_morning}</td>
                        <td className="px-6 py-6 text-center font-mono text-sm border-x border-border/20">{totals.charter_evening}</td>
                      </>
                    )}
                    {visibleColumns.has('private') && <td className="px-6 py-6 font-mono text-sm">{totals.private_booking}</td>}
                    {visibleColumns.has('net_coll') && <td className="px-6 py-6 font-mono text-sm text-accent">{totalNetCollection}</td>}
                    {visibleColumns.has('net_exp') && <td className="px-6 py-6 font-mono text-sm text-danger">{totals.net_expense}</td>}
                    {visibleColumns.has('balance') && (
                      <td className={cn(
                        "px-6 py-6 font-mono text-sm",
                        totalNetCollection - totals.net_expense >= 0 ? "text-success" : "text-danger"
                      )}>
                        {totalNetCollection - totals.net_expense}
                      </td>
                    )}
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
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayRecords = records.filter(r => r.date === dateStr);
                  const hasData = dayRecords.length > 0;
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  
                  const netCollection = dayRecords.reduce((sum, r) => 
                    sum + (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0), 0);

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
                        {hasData && (
                          <div className="flex space-x-1">
                            <div className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                          </div>
                        )}
                      </div>
                      
                      {hasData && (
                        <div className="space-y-2">
                          <div className="rounded-lg bg-accent/5 border border-accent/10 px-2 py-1.5 transition-colors group-hover:bg-accent/10">
                            <p className="text-[9px] font-bold text-accent uppercase tracking-widest mb-0.5">Net Coll.</p>
                            <p className="text-xs font-bold text-primary font-mono">{formatCurrency(netCollection)}</p>
                          </div>
                          
                          <div className="flex flex-wrap gap-1">
                            {dayRecords.some(r => r.private_booking > 0) && (
                              <div className="rounded-md bg-success/10 border border-success/20 px-1.5 py-0.5 text-[8px] font-bold text-success uppercase tracking-widest">
                                Private
                              </div>
                            )}
                            {dayRecords.some(r => r.is_holiday) && (
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
