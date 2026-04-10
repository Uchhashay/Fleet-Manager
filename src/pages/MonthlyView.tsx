import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { DailyRecord, Bus, Staff, School } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { Download, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Table as TableIcon, Bus as BusIcon, Filter, LayoutGrid, AlertCircle, X, User, Fuel, Receipt, Info, Edit2, Save, RotateCcw, Check } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { writeBatch, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

import { useSearchParams } from 'react-router-dom';

export function MonthlyView() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedBus, setSelectedBus] = useState<string>(searchParams.get('busId') || 'all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const monthParam = searchParams.get('month');
    const startParam = searchParams.get('start');
    if (monthParam) return new Date(monthParam);
    if (startParam) return new Date(startParam);
    return new Date();
  });
  const [loading, setLoading] = useState(true);
  const [busesLoading, setBusesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    'driver_helper', 'school_staff', 'charter_office', 'private', 'fuel', 'net_coll', 'net_exp', 'balance'
  ]));
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);

  // Bulk Edit State
  const [isEditMode, setIsEditMode] = useState(false);
  const [localChanges, setLocalChanges] = useState<Record<string, DailyRecord | Partial<DailyRecord>>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant';

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
    { id: 'driver_helper', label: 'Driver/Helper' },
    { id: 'school_staff', label: 'School Staff' },
    { id: 'charter_office', label: 'Charter/Office' },
    { id: 'private', label: 'Private' },
    { id: 'fuel', label: 'Fuel' },
    { id: 'net_coll', label: 'Net Collection' },
    { id: 'net_exp', label: 'Net Expense' },
    { id: 'balance', label: 'Balance' },
  ];

  useEffect(() => {
    fetchInitialData();

    // Listen to schools
    const qSchools = query(collection(db, 'schools'), orderBy('name'));
    const unsubscribeSchools = onSnapshot(qSchools, (snap) => {
      setSchools(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as School)));
    });

    return () => unsubscribeSchools();
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [currentMonth, selectedBus]);

  async function fetchInitialData() {
    setBusesLoading(true);
    try {
      const [busesSnap, staffSnap] = await Promise.all([
        getDocs(query(collection(db, 'buses'), orderBy('registration_number'))),
        getDocs(query(collection(db, 'staff'), orderBy('full_name')))
      ]);
      
      const busesList = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
      const staffList = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
      
      setBuses(busesList);
      setStaff(staffList);
    } catch (err) {
      console.error('Error fetching initial data:', err);
      setError('Failed to load initial data. Please check your connection.');
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
      'Date', 'Bus', 'Driver', 'Helper', 'School Morning', 'School Evening', 'Charter Morning', 'Charter Evening', 
      'Private Booking', 'Booking Details', 'Fuel Amount', 'Duty Paid', 'Net Collection', 'Net Expense', 'Balance'
    ];
    
    const csvData = daysInMonth.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayRecords = records.filter(r => r.date === dateStr);
      
      return dayRecords.map(r => {
        const bus = buses.find(b => b.id === r.bus_id);
        const driver = staff.find(s => s.id === r.driver_id);
        const helper = staff.find(s => s.id === r.helper_id);
        const netCollection = (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0);
        const netExpense = (r.fuel_amount || 0) + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0);

        return [
          dateStr,
          bus?.registration_number || 'N/A',
          driver?.full_name || 'N/A',
          helper?.full_name || 'N/A',
          r.school_morning_name || r.school_morning || 0,
          r.school_evening_name || r.school_evening || 0,
          r.charter_morning || 0,
          r.charter_evening || 0,
          r.private_booking || 0,
          `"${r.booking_details || ''}"`,
          r.fuel_amount || 0,
          (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0),
          netCollection,
          netExpense,
          netCollection - netExpense
        ].join(',');
      }).join('\n');
    }).filter(Boolean);

    const csvString = [headers.join(','), ...csvData].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Jagriti_Fleet_${format(currentMonth, 'MMM_yyyy')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveBulk = async () => {
    if (Object.keys(localChanges).length === 0) {
      setIsEditMode(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      
      (Object.values(localChanges) as DailyRecord[]).forEach(record => {
        const docRef = record.id 
          ? doc(db, 'daily_records', record.id)
          : doc(collection(db, 'daily_records'));
          
        const dataToSave = {
          ...record,
          id: record.id || docRef.id,
          created_by: record.created_by || profile?.id || 'unknown',
          created_at: record.created_at || now,
        };
        
        batch.set(docRef, dataToSave, { merge: true });
      });

      await batch.commit();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchRecords();
      setIsEditMode(false);
      setLocalChanges({});
    } catch (err) {
      console.error('Error saving bulk changes:', err);
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLocalChange = (date: string, busId: string, field: keyof DailyRecord, value: any, existingRecord?: DailyRecord) => {
    const key = existingRecord?.id || `${date}_${busId}`;
    const currentRecord = (localChanges[key] as DailyRecord) || existingRecord || {
      date,
      bus_id: busId,
      driver_id: '',
      helper_id: '',
      school_morning: 0,
      school_evening: 0,
      charter_morning: 0,
      charter_evening: 0,
      private_booking: 0,
      fuel_amount: 0,
      driver_duty_paid: 0,
      helper_duty_paid: 0,
      is_holiday: false,
    } as Partial<DailyRecord>;

    const updatedRecord = { ...currentRecord, [field]: value };
    
    setLocalChanges(prev => ({
      ...prev,
      [key]: updatedRecord
    }));
  };

  const totals = records.reduce((acc, curr) => {
    const record = localChanges[curr.id] || curr;
    return {
      school_morning: acc.school_morning + (record.school_morning || 0),
      school_evening: acc.school_evening + (record.school_evening || 0),
      charter_morning: acc.charter_morning + (record.charter_morning || 0),
      charter_evening: acc.charter_evening + (record.charter_evening || 0),
      private_booking: acc.private_booking + (record.private_booking || 0),
      net_expense: acc.net_expense + (record.fuel_amount || 0) + (record.driver_duty_paid || 0) + (record.helper_duty_paid || 0),
    };
  }, {
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
        onClick={() => { setError(null); fetchInitialData(); fetchRecords(); }}
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

          {canEdit && (
            <div className="flex items-center space-x-2">
              {!isEditMode ? (
                <button
                  onClick={() => {
                    setIsEditMode(true);
                    setViewMode('table');
                  }}
                  className="btn-secondary flex items-center space-x-2 !py-2.5 !bg-accent/5 !text-accent hover:!bg-accent/10 border-accent/20"
                >
                  <Edit2 className="h-4 w-4 stroke-[1.5px]" />
                  <span>Bulk Edit</span>
                </button>
              ) : (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setIsEditMode(false);
                      setLocalChanges({});
                    }}
                    className="btn-secondary flex items-center space-x-2 !py-2.5"
                    disabled={saving}
                  >
                    <RotateCcw className="h-4 w-4 stroke-[1.5px]" />
                    <span>Cancel</span>
                  </button>
                  <button
                    onClick={handleSaveBulk}
                    className="btn-primary flex items-center space-x-2 !py-2.5"
                    disabled={saving}
                  >
                    {saving ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : saveSuccess ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Save className="h-4 w-4 stroke-[1.5px]" />
                    )}
                    <span>{saving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Changes'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {isEditMode && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-accent/5 border border-accent/20 rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
              <Info className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-primary">Bulk Edit Mode Active</p>
              <p className="text-xs text-secondary">You can now edit numbers directly in the table. Click Save to apply changes.</p>
            </div>
          </div>
          {selectedBus === 'all' && (
            <div className="flex items-center space-x-2 text-warning">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Editing all buses at once. Be careful!</span>
            </div>
          )}
        </motion.div>
      )}

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
                    {visibleColumns.has('driver_helper') && (
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Driver/Helper</th>
                    )}
                    {visibleColumns.has('school_staff') && (
                      <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-secondary border-x border-border/30" colSpan={2}>School Names</th>
                    )}
                    {visibleColumns.has('charter_office') && (
                      <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-secondary border-x border-border/30" colSpan={2}>Charter/Office</th>
                    )}
                    {visibleColumns.has('private') && (
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Private</th>
                    )}
                    {visibleColumns.has('fuel') && (
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Fuel</th>
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
                    {visibleColumns.has('driver_helper') && <th className="px-6 py-2"></th>}
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
                    {visibleColumns.has('fuel') && <th className="px-6 py-2"></th>}
                    {visibleColumns.has('net_coll') && <th className="px-6 py-2"></th>}
                    {visibleColumns.has('net_exp') && <th className="px-6 py-2"></th>}
                    {visibleColumns.has('balance') && <th className="px-6 py-2"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {daysInMonth.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayRecords = records.filter(r => r.date === dateStr);
                    
                    // Determine which rows to show for this day
                    let rowsToShow: { record?: DailyRecord; date: string; busId: string }[] = [];
                    
                    if (selectedBus !== 'all' || isEditMode) {
                      // Specific bus view OR Bulk Edit mode: show individual rows
                      if (dayRecords.length > 0) {
                        rowsToShow = dayRecords.map(r => ({ record: r, date: dateStr, busId: r.bus_id }));
                      } else {
                        rowsToShow = [{ date: dateStr, busId: selectedBus === 'all' ? '' : selectedBus }];
                      }
                    } else {
                      // All buses view AND NOT in edit mode: show summarized row
                      rowsToShow = [{ date: dateStr, busId: 'all' }];
                    }

                    return rowsToShow.map((row, idx) => {
                      const record = row.record;
                      const r = (localChanges[record?.id || `${row.date}_${row.busId}`] as DailyRecord) || record;
                      
                      // If summarized row, calculate totals for the day
                      const isSummarized = row.busId === 'all' && !isEditMode;
                      
                      const school_morning = isSummarized 
                        ? dayRecords.reduce((sum, rec) => sum + (rec.school_morning || 0), 0)
                        : (r?.school_morning || 0);
                      const school_evening = isSummarized
                        ? dayRecords.reduce((sum, rec) => sum + (rec.school_evening || 0), 0)
                        : (r?.school_evening || 0);
                      const charter_morning = isSummarized
                        ? dayRecords.reduce((sum, rec) => sum + (rec.charter_morning || 0), 0)
                        : (r?.charter_morning || 0);
                      const charter_evening = isSummarized
                        ? dayRecords.reduce((sum, rec) => sum + (rec.charter_evening || 0), 0)
                        : (r?.charter_evening || 0);
                      const private_booking = isSummarized
                        ? dayRecords.reduce((sum, rec) => sum + (rec.private_booking || 0), 0)
                        : (r?.private_booking || 0);
                      const fuel_amount = isSummarized
                        ? dayRecords.reduce((sum, rec) => sum + (rec.fuel_amount || 0), 0)
                        : (r?.fuel_amount || 0);
                      const duty_paid = isSummarized
                        ? dayRecords.reduce((sum, rec) => sum + (rec.driver_duty_paid || 0) + (rec.helper_duty_paid || 0), 0)
                        : ((r?.driver_duty_paid || 0) + (r?.helper_duty_paid || 0));
                      
                      const hasData = isSummarized ? dayRecords.length > 0 : (!!record || !!localChanges[`${row.date}_${row.busId}`]);
                      
                      const netCollection = school_morning + school_evening + charter_morning + charter_evening + private_booking;
                      const netExpense = fuel_amount + duty_paid;
                      const balance = netCollection - netExpense;

                      return (
                        <tr 
                          key={record?.id || `${row.date}_${row.busId}_${idx}`} 
                          onClick={() => !isEditMode && hasData && setSelectedDay(day)}
                          className={cn(
                            "group transition-colors",
                            !isEditMode && hasData ? "cursor-pointer hover:bg-accent/5" : "bg-surface/5",
                            !hasData && !isEditMode && "opacity-40"
                          )}
                        >
                          <td className="sticky left-0 z-10 bg-background px-6 py-4 font-mono text-xs group-hover:bg-accent/5 transition-colors border-r border-border/10">
                            <div className="flex flex-col">
                              <span>{format(day, 'dd MMM')}</span>
                              {selectedBus === 'all' && (
                                <div className="mt-1">
                                  {isEditMode ? (
                                    <select
                                      value={r?.bus_id || ''}
                                      onChange={(e) => handleLocalChange(row.date, e.target.value, 'bus_id', e.target.value, record)}
                                      className="text-[8px] bg-background border border-border rounded px-1 py-0.5 font-bold uppercase"
                                    >
                                      <option value="">Select Bus</option>
                                      {buses.map(b => (
                                        <option key={b.id} value={b.id}>{b.registration_number}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-[8px] text-secondary uppercase font-bold">
                                      {isSummarized 
                                        ? (dayRecords.length > 0 ? `${dayRecords.length} Buses` : 'No Entry')
                                        : (buses.find(b => b.id === r?.bus_id)?.registration_number || 'No Entry')
                                      }
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          {visibleColumns.has('driver_helper') && (
                            <td className="px-6 py-4 text-xs border-x border-border/10">
                              {isEditMode ? (
                                <div className="flex flex-col space-y-1 min-w-[120px]">
                                  <select
                                    value={r?.driver_id || ''}
                                    onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'driver_id', e.target.value, record)}
                                    className="text-[10px] bg-background border border-border rounded px-1 py-0.5"
                                  >
                                    <option value="">Select Driver</option>
                                    {staff.filter(s => s.role === 'driver').map(s => (
                                      <option key={s.id} value={s.id}>{s.full_name}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={r?.helper_id || ''}
                                    onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'helper_id', e.target.value, record)}
                                    className="text-[10px] bg-background border border-border rounded px-1 py-0.5"
                                  >
                                    <option value="">Select Helper</option>
                                    {staff.filter(s => s.role === 'helper').map(s => (
                                      <option key={s.id} value={s.id}>{s.full_name}</option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <div className="flex flex-col space-y-0.5">
                                  <span className="font-bold text-primary truncate max-w-[100px]">
                                    {isSummarized ? '-' : (staff.find(s => s.id === r?.driver_id)?.full_name || '-')}
                                  </span>
                                  <span className="text-[10px] text-secondary truncate max-w-[100px]">
                                    {isSummarized ? '-' : (staff.find(s => s.id === r?.helper_id)?.full_name || '-')}
                                  </span>
                                </div>
                              )}
                            </td>
                          )}
                          {visibleColumns.has('school_staff') && (
                            <>
                              <td className="px-6 py-4 text-center text-xs border-x border-border/10">
                                {isEditMode ? (
                                  <select
                                    value={r?.school_morning_name || ''}
                                    onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'school_morning_name', e.target.value, record)}
                                    className="w-24 text-[10px] bg-background border border-border rounded px-1 py-0.5"
                                  >
                                    <option value="">Select School</option>
                                    {schools.map(s => (
                                      <option key={s.id} value={s.name}>{s.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="flex flex-col items-center">
                                    <span className="font-bold text-primary truncate max-w-[80px]" title={r?.school_morning_name}>
                                      {isSummarized ? '-' : (r?.school_morning_name || '-')}
                                    </span>
                                    {school_morning > 0 && (
                                      <span className="text-[9px] text-secondary font-mono">{formatCurrency(school_morning)}</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center text-xs border-x border-border/10">
                                {isEditMode ? (
                                  <select
                                    value={r?.school_evening_name || ''}
                                    onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'school_evening_name', e.target.value, record)}
                                    className="w-24 text-[10px] bg-background border border-border rounded px-1 py-0.5"
                                  >
                                    <option value="">Select School</option>
                                    {schools.map(s => (
                                      <option key={s.id} value={s.name}>{s.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="flex flex-col items-center">
                                    <span className="font-bold text-primary truncate max-w-[80px]" title={r?.school_evening_name}>
                                      {isSummarized ? '-' : (r?.school_evening_name || '-')}
                                    </span>
                                    {school_evening > 0 && (
                                      <span className="text-[9px] text-secondary font-mono">{formatCurrency(school_evening)}</span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </>
                          )}
                          {visibleColumns.has('charter_office') && (
                            <>
                              <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">
                                {isEditMode ? (
                                  <input 
                                    type="number" 
                                    value={charter_morning}
                                    onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'charter_morning', Number(e.target.value), record)}
                                    className="w-16 text-center bg-background border border-border rounded px-1 py-0.5"
                                  />
                                ) : (hasData ? charter_morning : '-')}
                              </td>
                              <td className="px-6 py-4 text-center font-mono text-xs border-x border-border/10">
                                {isEditMode ? (
                                  <input 
                                    type="number" 
                                    value={charter_evening}
                                    onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'charter_evening', Number(e.target.value), record)}
                                    className="w-16 text-center bg-background border border-border rounded px-1 py-0.5"
                                  />
                                ) : (hasData ? charter_evening : '-')}
                              </td>
                            </>
                          )}
                          {visibleColumns.has('private') && (
                            <td className="px-6 py-4 font-mono text-xs">
                              {isEditMode ? (
                                <div className="flex flex-col space-y-1">
                                  <input 
                                    type="number" 
                                    value={private_booking}
                                    onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'private_booking', Number(e.target.value), record)}
                                    className="w-20 bg-background border border-border rounded px-1 py-0.5"
                                  />
                                  <input 
                                    type="text" 
                                    placeholder="Details"
                                    value={r?.booking_details || ''}
                                    onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'booking_details', e.target.value, record)}
                                    className="w-32 text-[10px] bg-background border border-border rounded px-1 py-0.5"
                                  />
                                </div>
                              ) : (
                                <>
                                  <div>{hasData ? private_booking : '-'}</div>
                                  {r?.booking_details && (
                                    <div className="text-[10px] text-secondary font-sans mt-0.5 max-w-[120px] truncate" title={r.booking_details}>
                                      {r.booking_details}
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          )}
                          {visibleColumns.has('fuel') && (
                            <td className="px-6 py-4 font-mono text-xs text-warning/80">
                              {isEditMode ? (
                                <input 
                                  type="number" 
                                  value={fuel_amount}
                                  onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'fuel_amount', Number(e.target.value), record)}
                                  className="w-20 bg-background border border-border rounded px-1 py-0.5"
                                />
                              ) : (hasData ? fuel_amount : '-')}
                            </td>
                          )}
                          {visibleColumns.has('net_coll') && (
                            <td className="px-6 py-4 font-mono text-xs font-bold text-primary">{hasData ? netCollection : '-'}</td>
                          )}
                          {visibleColumns.has('net_exp') && (
                            <td className="px-6 py-4 font-mono text-xs text-danger/70">
                              {isEditMode ? (
                                <div className="flex flex-col space-y-1">
                                  <div className="flex items-center space-x-1">
                                    <span className="text-[8px] text-secondary">D:</span>
                                    <input 
                                      type="number" 
                                      value={r?.driver_duty_paid || 0}
                                      onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'driver_duty_paid', Number(e.target.value), record)}
                                      className="w-16 bg-background border border-border rounded px-1 py-0.5"
                                    />
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <span className="text-[8px] text-secondary">H:</span>
                                    <input 
                                      type="number" 
                                      value={r?.helper_duty_paid || 0}
                                      onChange={(e) => handleLocalChange(row.date, r?.bus_id || row.busId, 'helper_duty_paid', Number(e.target.value), record)}
                                      className="w-16 bg-background border border-border rounded px-1 py-0.5"
                                    />
                                  </div>
                                </div>
                              ) : (hasData ? netExpense : '-')}
                            </td>
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
                    });
                  })}
                </tbody>
                <tfoot className="bg-surface border-t-2 border-border font-bold text-primary">
                  <tr>
                    <td className="sticky left-0 z-10 bg-surface px-6 py-6 text-[10px] uppercase tracking-widest border-r border-border/10">Totals</td>
                    {visibleColumns.has('driver_helper') && <td className="px-6 py-6 border-x border-border/20"></td>}
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
                    {visibleColumns.has('fuel') && <td className="px-6 py-6 font-mono text-sm text-warning">{records.reduce((sum, r) => sum + (r.fuel_amount || 0), 0)}</td>}
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
                      onClick={() => hasData && setSelectedDay(day)}
                      className={cn(
                        "min-h-[140px] bg-background p-4 transition-all hover:bg-surface/30 group relative",
                        hasData ? "cursor-pointer" : "",
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

      <AnimatePresence>
        {selectedDay && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDay(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-border bg-surface/50">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                    <CalendarIcon className="h-5 w-5 stroke-[1.5px]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary">{format(selectedDay, 'EEEE, dd MMMM yyyy')}</h3>
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Daily Performance Summary</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedDay(null)}
                  className="p-2 rounded-lg hover:bg-border/50 text-secondary hover:text-primary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {(() => {
                  const dayRecords = records.filter(r => r.date === format(selectedDay, 'yyyy-MM-dd'));
                  const totalColl = dayRecords.reduce((sum, r) => 
                    sum + (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0), 0);
                  const totalExp = dayRecords.reduce((sum, r) => 
                    sum + (r.fuel_amount || 0) + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0);
                  const totalBal = totalColl - totalExp;

                  return (
                    <>
                      {dayRecords.length > 1 && (
                        <div className="p-6 rounded-2xl bg-accent text-white shadow-xl shadow-accent/20">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">Combined Daily Total</p>
                              <h4 className="text-2xl font-bold font-mono">{formatCurrency(totalBal)}</h4>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
                              <LayoutGrid className="h-6 w-6" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                            <div>
                              <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Total Collection</p>
                              <p className="text-sm font-bold font-mono">{formatCurrency(totalColl)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Total Expense</p>
                              <p className="text-sm font-bold font-mono">{formatCurrency(totalExp)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {dayRecords.map((record, idx) => {
                        const bus = buses.find(b => b.id === record.bus_id);
                        const driver = staff.find(s => s.id === record.driver_id);
                        const helper = staff.find(s => s.id === record.helper_id);
                        const netCollection = (record.school_morning || 0) + (record.school_evening || 0) + (record.charter_morning || 0) + (record.charter_evening || 0) + (record.private_booking || 0);
                        const netExpense = (record.fuel_amount || 0) + (record.driver_duty_paid || 0) + (record.helper_duty_paid || 0);

                        return (
                          <div key={record.id} className={cn("space-y-6", (idx > 0 || dayRecords.length > 1) && "pt-8 border-t border-border")}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                  <BusIcon className="h-4 w-4 stroke-[1.5px]" />
                                </div>
                                <span className="text-sm font-bold text-primary">{bus?.registration_number || 'Unknown Bus'}</span>
                              </div>
                              {record.is_holiday && (
                                <span className="px-2 py-1 rounded-md bg-warning/10 text-warning text-[8px] font-bold uppercase tracking-widest">Holiday</span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="card bg-background/50 border-border/30 p-4">
                                <div className="flex items-center space-x-2 mb-3">
                                  <User className="h-3 w-3 text-secondary" />
                                  <span className="text-[9px] font-bold text-secondary uppercase tracking-widest">Crew Details</span>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-secondary">Driver</span>
                                    <span className="text-xs font-bold text-primary">{driver?.full_name || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-secondary">Helper</span>
                                    <span className="text-xs font-bold text-primary">{helper?.full_name || 'N/A'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="card bg-background/50 border-border/30 p-4">
                                <div className="flex items-center space-x-2 mb-3">
                                  <Fuel className="h-3 w-3 text-secondary" />
                                  <span className="text-[9px] font-bold text-secondary uppercase tracking-widest">Fuel & Expenses</span>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-secondary">Fuel Amount</span>
                                    <span className="text-xs font-bold text-warning">{formatCurrency(record.fuel_amount || 0)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-secondary">Duty Paid</span>
                                    <span className="text-xs font-bold text-danger">{formatCurrency((record.driver_duty_paid || 0) + (record.helper_duty_paid || 0))}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="flex items-center space-x-2">
                                <Receipt className="h-3 w-3 text-secondary" />
                                <span className="text-[9px] font-bold text-secondary uppercase tracking-widest">Collection Breakdown</span>
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 rounded-xl bg-surface border border-border">
                                  <p className="text-[8px] font-bold text-secondary uppercase tracking-widest mb-1">School</p>
                                  <p className="text-xs font-bold text-primary font-mono">{formatCurrency((record.school_morning || 0) + (record.school_evening || 0))}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-surface border border-border">
                                  <p className="text-[8px] font-bold text-secondary uppercase tracking-widest mb-1">Charter</p>
                                  <p className="text-xs font-bold text-primary font-mono">{formatCurrency((record.charter_morning || 0) + (record.charter_evening || 0))}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-surface border border-border">
                                  <p className="text-[8px] font-bold text-secondary uppercase tracking-widest mb-1">Private</p>
                                  <p className="text-xs font-bold text-primary font-mono">{formatCurrency(record.private_booking || 0)}</p>
                                </div>
                              </div>
                            </div>

                            {record.booking_details && (
                              <div className="p-4 rounded-xl bg-accent/5 border border-accent/10">
                                <div className="flex items-center space-x-2 mb-2">
                                  <Info className="h-3 w-3 text-accent" />
                                  <span className="text-[9px] font-bold text-accent uppercase tracking-widest">Booking Details</span>
                                </div>
                                <p className="text-xs text-primary leading-relaxed">{record.booking_details}</p>
                              </div>
                            )}

                            <div className="flex items-center justify-between p-4 rounded-xl bg-primary text-background">
                              <div>
                                <p className="text-[9px] font-bold text-background/60 uppercase tracking-widest">Net Profit/Loss</p>
                                <p className="text-xl font-bold font-mono">{formatCurrency(netCollection - netExpense)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] font-bold text-background/60 uppercase tracking-widest">Total Collection</p>
                                <p className="text-sm font-bold font-mono">{formatCurrency(netCollection)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {dayRecords.length === 0 && (
                        <div className="py-12 text-center">
                          <p className="text-secondary font-medium">No records found for this date.</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
