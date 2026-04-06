import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Download, 
  Bus as BusIcon,
  Building2,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Filter,
  Wallet,
  GraduationCap
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { DailyRecord, BusExpense, CompanyExpense } from '../types';
import { motion } from 'framer-motion';

import { useAuth } from '../contexts/AuthContext';

interface LedgerEntry {
  id: string;
  date: string;
  type: 'Inflow' | 'Outflow';
  category: string;
  amount: number;
  description: string;
  source: 'Daily Entry' | 'Bus Expense' | 'Company Expense' | 'Fee Collection';
}

export function Cashbook() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    fetchLedger();
  }, [filters]);

  async function fetchLedger() {
    setLoading(true);
    try {
      const { startDate, endDate } = filters;

      // Fetch Daily Records
      let dailyQuery = query(
        collection(db, 'daily_records'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      if (profile?.role === 'accountant') {
        dailyQuery = query(dailyQuery, where('created_by', '==', auth.currentUser?.uid));
      }
      const dailySnap = await getDocs(dailyQuery);

      const dailyEntries: LedgerEntry[] = [];
      dailySnap.docs.forEach(doc => {
        const data = doc.data() as DailyRecord;
        const inflow = (data.school_morning || 0) + (data.school_evening || 0) + (data.charter_morning || 0) + (data.charter_evening || 0) + (data.private_booking || 0);
        const outflow = (data.fuel_amount || 0) + (data.duty_paid || 0);

        if (inflow > 0) {
          dailyEntries.push({
            id: `${doc.id}-in`,
            date: data.date,
            type: 'Inflow',
            category: 'Daily Collection',
            amount: inflow,
            description: `Bus ${data.bus_id} collections`,
            source: 'Daily Entry'
          });
        }
        if (outflow > 0) {
          dailyEntries.push({
            id: `${doc.id}-out`,
            date: data.date,
            type: 'Outflow',
            category: 'Daily Expense',
            amount: outflow,
            description: `Fuel & Duty for Bus ${data.bus_id}`,
            source: 'Daily Entry'
          });
        }
      });

      // Fetch Bus Expenses
      let busExpQuery = query(
        collection(db, 'bus_expenses'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      if (profile?.role === 'accountant') {
        busExpQuery = query(busExpQuery, where('created_by', '==', auth.currentUser?.uid));
      }
      const busExpSnap = await getDocs(busExpQuery);
      const busEntries: LedgerEntry[] = busExpSnap.docs.map(doc => {
        const data = doc.data() as BusExpense;
        return {
          id: doc.id,
          date: data.date,
          type: 'Outflow',
          category: data.category,
          amount: data.amount,
          description: data.description || `Bus ${data.bus_id} expense`,
          source: 'Bus Expense'
        };
      });

      // Fetch Company Expenses
      let compExpQuery = query(
        collection(db, 'company_expenses'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      if (profile?.role === 'accountant') {
        compExpQuery = query(compExpQuery, where('created_by', '==', auth.currentUser?.uid));
      }
      const compExpSnap = await getDocs(compExpQuery);
      const compEntries: LedgerEntry[] = compExpSnap.docs.map(doc => {
        const data = doc.data() as CompanyExpense;
        return {
          id: doc.id,
          date: data.date,
          type: 'Outflow',
          category: data.category,
          amount: data.amount,
          description: data.description || 'Company expense',
          source: 'Company Expense'
        };
      });

      // Fetch Fee Collections
      let feeQuery = query(
        collection(db, 'fee_collections'),
        where('date', '>=', Timestamp.fromDate(new Date(startDate))),
        where('date', '<=', Timestamp.fromDate(new Date(endDate)))
      );
      if (profile?.role === 'accountant') {
        feeQuery = query(feeQuery, where('recorded_by', '==', auth.currentUser?.uid));
      }
      const feeSnap = await getDocs(feeQuery);
      const feeEntries: LedgerEntry[] = feeSnap.docs.map(doc => {
        const data = doc.data();
        const date = data.date instanceof Timestamp ? format(data.date.toDate(), 'yyyy-MM-dd') : data.date;
        return {
          id: doc.id,
          date: date,
          type: 'Inflow',
          category: 'Fee Collection',
          amount: data.amount,
          description: `${data.student_name} - ${data.school_name}`,
          source: 'Fee Collection'
        };
      });

      const allEntries = [...dailyEntries, ...busEntries, ...compEntries, ...feeEntries].sort((a, b) => b.date.localeCompare(a.date));
      setEntries(allEntries);
    } catch (error) {
      console.error('Error fetching ledger:', error);
    } finally {
      setLoading(false);
    }
  }

  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Category', 'Source', 'Amount', 'Description'];
    const rows = entries.map(e => [
      e.date,
      e.type,
      e.category,
      e.source,
      e.amount,
      e.description
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `cashbook_${filters.startDate}_to_${filters.endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totals = entries.reduce((acc, e) => {
    if (e.type === 'Inflow') acc.inflow += e.amount;
    else acc.outflow += e.amount;
    return acc;
  }, { inflow: 0, outflow: 0 });

  const netBalance = totals.inflow - totals.outflow;

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <Wallet className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Financial Ledger</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Cashbook</h1>
        </div>
        <button
          onClick={exportToCSV}
          className="btn-secondary flex items-center space-x-2 !px-6"
        >
          <Download className="h-4 w-4 stroke-[1.5px]" />
          <span>Export CSV</span>
        </button>
      </header>

      {/* Filters & Summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 card flex flex-col justify-between"
        >
          <div className="flex items-center space-x-2 text-secondary mb-6">
            <Filter className="h-3 w-3 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Date Range</span>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="label">From</label>
              <div className="relative">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="input pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="label">To</label>
              <div className="relative">
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="input pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary pointer-events-none" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card bg-primary border-none flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="h-8 w-8 rounded-full bg-background/10 flex items-center justify-center text-background">
              <Wallet className="h-4 w-4 stroke-[1.5px]" />
            </div>
            <span className="text-[10px] font-bold text-background/60 uppercase tracking-widest">Net Balance</span>
          </div>
          <div>
            <h3 className="text-3xl font-bold text-background tracking-tighter font-mono">{formatCurrency(netBalance)}</h3>
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-background/10 pt-4">
              <div>
                <p className="text-[9px] font-bold uppercase text-background/40 mb-1">Total In</p>
                <p className="text-xs font-bold text-success font-mono">{formatCurrency(totals.inflow)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-background/40 mb-1">Total Out</p>
                <p className="text-xs font-bold text-danger font-mono">{formatCurrency(totals.outflow)}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Ledger Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Category</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mx-auto"></div>
                  </td>
                </tr>
              ) : entries.length > 0 ? (
                entries.map((entry, idx) => (
                  <motion.tr 
                    key={entry.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                  >
                    <td className="text-secondary font-medium whitespace-nowrap">
                      {format(new Date(entry.date), 'dd MMM yyyy')}
                    </td>
                    <td>
                      <div className="flex items-center space-x-2">
                        <div className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center",
                          entry.source === 'Daily Entry' ? "bg-accent/10 text-accent" : 
                          entry.source === 'Bus Expense' ? "bg-warning/10 text-warning" : 
                          entry.source === 'Fee Collection' ? "bg-success/10 text-success" :
                          "bg-secondary/10 text-secondary"
                        )}>
                          {entry.source === 'Daily Entry' ? <BusIcon className="h-3 w-3 stroke-[1.5px]" /> : 
                           entry.source === 'Bus Expense' ? <Receipt className="h-3 w-3 stroke-[1.5px]" /> : 
                           entry.source === 'Fee Collection' ? <GraduationCap className="h-3 w-3 stroke-[1.5px]" /> :
                           <Building2 className="h-3 w-3 stroke-[1.5px]" />}
                        </div>
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{entry.source}</span>
                      </div>
                    </td>
                    <td>
                      <span className="font-bold text-primary">{entry.category}</span>
                    </td>
                    <td className="text-secondary font-medium max-w-xs truncate">{entry.description}</td>
                    <td className={cn(
                      "text-right font-bold font-mono",
                      entry.type === 'Inflow' ? "text-success" : "text-danger"
                    )}>
                      <div className="flex items-center justify-end space-x-1">
                        <span>{entry.type === 'Inflow' ? '+' : '-'}{formatCurrency(entry.amount)}</span>
                        {entry.type === 'Inflow' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      </div>
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-secondary font-medium">
                    No entries found for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
