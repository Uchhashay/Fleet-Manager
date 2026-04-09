import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, Timestamp, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
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
  GraduationCap,
  X,
  PlusCircle,
  User
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { DailyRecord, BusExpense, CompanyExpense, CashTransaction, Staff } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';

import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';

interface LedgerEntry {
  id: string;
  date: string;
  type: 'Inflow' | 'Outflow';
  category: string;
  amount: number;
  description: string;
  source: 'Daily Entry' | 'Bus Expense' | 'Company Expense' | 'Fee Collection' | 'Manual Entry';
  paid_by?: 'owner' | 'accountant';
  staff_id?: string;
}

export function Cashbook() {
  const { profile } = useAuth();
  const location = useLocation();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'accountant' | 'owner'>('accountant');
  const [activeForm, setActiveForm] = useState<'in' | 'out' | null>(null);
  const [filters, setFilters] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });

  const [formData, setFormData] = useState({
    type: 'in' as 'in' | 'out',
    category: 'owner_transfer' as CashTransaction['category'],
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    staff_id: '',
    paid_by: 'owner' as 'owner' | 'accountant'
  });

  useEffect(() => {
    fetchLedger();
    fetchStaff();
  }, [filters, viewMode]);

  useEffect(() => {
    const state = location.state as { action?: 'in' | 'out' };
    if (state?.action) {
      setActiveForm(state.action);
      setFormData(prev => ({
        ...prev,
        type: state.action!,
        category: state.action === 'in' ? 'owner_transfer' : 'overhead',
        paid_by: profile?.role === 'admin' ? 'owner' : 'accountant'
      }));
    }
  }, [location.state, profile?.role]);

  async function fetchStaff() {
    try {
      const snap = await getDocs(query(collection(db, 'staff'), orderBy('full_name')));
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  }

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
      const dailySnap = await getDocs(dailyQuery);

      const dailyEntries: LedgerEntry[] = [];
      dailySnap.docs.forEach(doc => {
        const data = doc.data() as DailyRecord;
        const paidBy = data.paid_by || 'accountant';
        if (paidBy !== viewMode) return;

        const inflow = (data.school_morning || 0) + (data.school_evening || 0) + (data.charter_morning || 0) + (data.charter_evening || 0) + (data.private_booking || 0);
        const outflow = (data.fuel_amount || 0) + (data.driver_duty_paid || 0) + (data.helper_duty_paid || 0);

        if (inflow > 0) {
          dailyEntries.push({
            id: `${doc.id}-in`,
            date: data.date,
            type: 'Inflow',
            category: 'Daily Collection',
            amount: inflow,
            description: `Bus ${data.bus_id} collections`,
            source: 'Daily Entry',
            paid_by: paidBy
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
            source: 'Daily Entry',
            paid_by: paidBy
          });
        }
      });

      // Fetch Bus Expenses
      let busExpQuery = query(
        collection(db, 'bus_expenses'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      const busExpSnap = await getDocs(busExpQuery);
      const busEntries: LedgerEntry[] = busExpSnap.docs
        .map(doc => {
          const data = doc.data() as BusExpense;
          const paidBy = data.paid_by || 'accountant';
          return {
            id: doc.id,
            date: data.date,
            type: 'Outflow' as const,
            category: data.category,
            amount: data.amount,
            description: data.description || `Bus ${data.bus_id} expense`,
            source: 'Bus Expense' as const,
            paid_by: paidBy
          };
        })
        .filter(e => e.paid_by === viewMode);

      // Fetch Company Expenses
      let compExpQuery = query(
        collection(db, 'company_expenses'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      const compExpSnap = await getDocs(compExpQuery);
      const compEntries: LedgerEntry[] = compExpSnap.docs
        .map(doc => {
          const data = doc.data() as CompanyExpense;
          const paidBy = data.paid_by || 'accountant';
          return {
            id: doc.id,
            date: data.date,
            type: 'Outflow' as const,
            category: data.category,
            amount: data.amount,
            description: data.description || 'Company expense',
            source: 'Company Expense' as const,
            paid_by: paidBy
          };
        })
        .filter(e => e.paid_by === viewMode);

      // Fetch Fee Collections
      let feeQuery = query(
        collection(db, 'fee_collections'),
        where('date', '>=', Timestamp.fromDate(new Date(startDate))),
        where('date', '<=', Timestamp.fromDate(new Date(endDate)))
      );
      const feeSnap = await getDocs(feeQuery);
      const feeEntries: LedgerEntry[] = feeSnap.docs
        .map(doc => {
          const data = doc.data();
          const date = data.date instanceof Timestamp ? format(data.date.toDate(), 'yyyy-MM-dd') : data.date;
          const paidBy = data.paid_by || 'accountant';
          return {
            id: doc.id,
            date: date,
            type: 'Inflow' as const,
            category: 'Fee Collection',
            amount: data.amount,
            description: `${data.student_name} - ${data.school_name}`,
            source: 'Fee Collection' as const,
            paid_by: paidBy
          };
        })
        .filter(e => e.paid_by === viewMode);

      // Fetch Manual Cash Transactions
      let cashQuery = query(
        collection(db, 'cash_transactions'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      const cashSnap = await getDocs(cashQuery);
      const manualEntries: LedgerEntry[] = cashSnap.docs
        .map(doc => {
          const data = doc.data() as CashTransaction;
          const paidBy = data.paid_by || 'accountant';
          return {
            id: doc.id,
            date: data.date,
            type: data.type === 'in' ? 'Inflow' : 'Outflow' as const,
            category: data.category.replace('_', ' '),
            amount: data.amount,
            description: data.description,
            source: 'Manual Entry' as const,
            paid_by: paidBy,
            staff_id: data.staff_id
          } as LedgerEntry;
        })
        .filter(e => e.paid_by === viewMode);

      const allEntries = [...dailyEntries, ...busEntries, ...compEntries, ...feeEntries, ...manualEntries].sort((a, b) => b.date.localeCompare(a.date));
      setEntries(allEntries);
    } catch (error) {
      console.error('Error fetching ledger:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.amount || !formData.description) return;
    if ((formData.category === 'salary' || formData.category === 'salary_advance' || formData.category === 'duty_payment') && !formData.staff_id) {
      alert('Please select a staff member');
      return;
    }

    try {
      const amount = Number(formData.amount);
      const transactionData: any = {
        ...formData,
        amount,
        created_by: auth.currentUser?.uid,
        created_at: serverTimestamp()
      };

      // If it's a salary-related payment, add linked_id for SalaryManager compatibility
      if ((formData.category === 'salary' || formData.category === 'salary_advance' || formData.category === 'duty_payment') && formData.staff_id) {
        const monthStr = format(new Date(formData.date), 'yyyy-MM');
        transactionData.linked_id = `${formData.staff_id}_${monthStr}`;
      }

      await addDoc(collection(db, 'cash_transactions'), transactionData);

      setActiveForm(null);
      setFormData({
        type: 'in',
        category: 'owner_transfer',
        amount: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        staff_id: '',
        paid_by: profile?.role === 'admin' ? 'owner' : 'accountant'
      });
      fetchLedger();
    } catch (error) {
      console.error('Error adding transaction:', error);
      handleFirestoreError(error, OperationType.CREATE, 'cash_transactions');
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
      <header className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <Wallet className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Financial Ledger</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Cashbook</h1>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex bg-surface p-1.5 rounded-xl border border-border shadow-inner mr-2">
            <button
              onClick={() => setViewMode('accountant')}
              className={cn(
                "px-6 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300",
                viewMode === 'accountant' 
                  ? "bg-primary text-background shadow-lg scale-105" 
                  : "text-secondary hover:text-primary hover:bg-primary/5"
              )}
            >
              Accountant
            </button>
            <button
              onClick={() => setViewMode('owner')}
              className={cn(
                "px-6 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300",
                viewMode === 'owner' 
                  ? "bg-primary text-background shadow-lg scale-105" 
                  : "text-secondary hover:text-primary hover:bg-primary/5"
              )}
            >
              Owner
            </button>
          </div>
          
          <button
            onClick={exportToCSV}
            className="btn-secondary flex items-center space-x-2 !px-6"
          >
            <Download className="h-4 w-4 stroke-[1.5px]" />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {/* Quick Action Buttons */}
      {(profile?.role === 'admin' || profile?.role === 'accountant') && (
        <div className="grid gap-6 sm:grid-cols-2">
          <motion.button
            whileHover={{ y: -4, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setFormData({ 
                ...formData, 
                type: 'in', 
                category: 'owner_transfer', 
                paid_by: profile?.role === 'admin' ? 'owner' : 'accountant' 
              });
              setActiveForm(activeForm === 'in' ? null : 'in');
            }}
            className={cn(
              "group relative overflow-hidden card border-2 text-left transition-all duration-500",
              activeForm === 'in' 
                ? "border-success bg-success/5 shadow-2xl shadow-success/20 scale-[1.02] z-10" 
                : "border-transparent bg-surface hover:border-success/30 hover:shadow-xl"
            )}
          >
            {/* Background Pattern */}
            <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
              <ArrowUpRight className="h-32 w-32 -mb-8 -mr-8 rotate-12" />
            </div>

            <div className="flex items-center space-x-6 relative z-10">
              <div className={cn(
                "h-20 w-20 rounded-3xl flex items-center justify-center transition-all duration-500 shadow-lg",
                activeForm === 'in' 
                  ? "bg-success text-background rotate-12 scale-110" 
                  : "bg-success/10 text-success group-hover:bg-success group-hover:text-background group-hover:rotate-6"
              )}>
                <ArrowUpRight className="h-10 w-10 stroke-[2.5px]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-primary tracking-tight">Record Cash In</h3>
                <p className="text-sm text-secondary font-medium max-w-[200px] leading-tight">Add capital, transfers, or miscellaneous income</p>
              </div>
            </div>
            {activeForm === 'in' && (
              <div className="absolute top-6 right-6 h-3 w-3 rounded-full bg-success animate-ping" />
            )}
          </motion.button>

          <motion.button
            whileHover={{ y: -4, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setFormData({ 
                ...formData, 
                type: 'out', 
                category: 'overhead', 
                paid_by: profile?.role === 'admin' ? 'owner' : 'accountant' 
              });
              setActiveForm(activeForm === 'out' ? null : 'out');
            }}
            className={cn(
              "group relative overflow-hidden card border-2 text-left transition-all duration-500",
              activeForm === 'out' 
                ? "border-warning bg-warning/5 shadow-2xl shadow-warning/20 scale-[1.02] z-10" 
                : "border-transparent bg-surface hover:border-warning/30 hover:shadow-xl"
            )}
          >
            {/* Background Pattern */}
            <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
              <ArrowDownRight className="h-32 w-32 -mb-8 -mr-8 -rotate-12" />
            </div>

            <div className="flex items-center space-x-6 relative z-10">
              <div className={cn(
                "h-20 w-20 rounded-3xl flex items-center justify-center transition-all duration-500 shadow-lg",
                activeForm === 'out' 
                  ? "bg-warning text-background -rotate-12 scale-110" 
                  : "bg-warning/10 text-warning group-hover:bg-warning group-hover:text-background group-hover:-rotate-6"
              )}>
                <ArrowDownRight className="h-10 w-10 stroke-[2.5px]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-primary tracking-tight">Record Cash Out</h3>
                <p className="text-sm text-secondary font-medium max-w-[200px] leading-tight">Record expenses, salaries, or office overheads</p>
              </div>
            </div>
            {activeForm === 'out' && (
              <div className="absolute top-6 right-6 h-3 w-3 rounded-full bg-warning animate-ping" />
            )}
          </motion.button>
        </div>
      )}

      {/* Inline Entry Form */}
      <AnimatePresence>
        {activeForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className={cn(
              "card border-2 transition-colors duration-500",
              activeForm === 'in' ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5"
            )}>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "h-10 w-10 rounded-2xl flex items-center justify-center",
                    activeForm === 'in' ? "bg-success text-surface" : "bg-warning text-surface"
                  )}>
                    {activeForm === 'in' ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary tracking-tight">
                      {activeForm === 'in' ? `Record ${formData.paid_by === 'owner' ? 'Owner' : 'Accountant'} Cash In` : `Record ${formData.paid_by === 'owner' ? 'Owner' : 'Accountant'} Cash Out`}
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
                      {activeForm === 'in' ? `Money added by ${formData.paid_by}` : `Expenses paid by ${formData.paid_by}`}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveForm(null)}
                  className="p-2 hover:bg-surface rounded-full transition-colors text-secondary hover:text-primary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <label className="label flex items-center space-x-2">
                    <Calendar className="h-3 w-3" />
                    <span>Date</span>
                  </label>
                  <input 
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="input bg-surface"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="label flex items-center space-x-2">
                    <Filter className="h-3 w-3" />
                    <span>Category</span>
                  </label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any, staff_id: '' })}
                    className="input bg-surface"
                    required
                  >
                      {activeForm === 'in' ? (
                        <>
                          <option value="owner_transfer">Owner Capital/Transfer</option>
                          <option value="misc">Miscellaneous Income</option>
                        </>
                      ) : (
                        <>
                          <option value="overhead">Overhead/Office Expense</option>
                          <option value="salary">Salary Payment</option>
                          <option value="salary_advance">Salary Advance</option>
                          <option value="duty_payment">Duty Payment</option>
                          <option value="bus_expense">Bus Expense</option>
                          <option value="loan_payment">Loan Payment</option>
                          <option value="insurance">Insurance</option>
                          <option value="misc">Miscellaneous Expense</option>
                        </>
                      )}
                  </select>
                </div>

                {(formData.category === 'salary' || formData.category === 'salary_advance' || formData.category === 'duty_payment') && (
                  <div className="space-y-2">
                    <label className="label flex items-center space-x-2">
                      <User className="h-3 w-3" />
                      <span>Staff Member</span>
                    </label>
                    <select 
                      value={formData.staff_id}
                      onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })}
                      className="input bg-surface"
                      required
                    >
                      <option value="">Select Staff</option>
                      {staff.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="label flex items-center space-x-2">
                    <Wallet className="h-3 w-3" />
                    <span>Amount</span>
                  </label>
                  <input 
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="input bg-surface font-mono"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="space-y-2 md:col-span-2 lg:col-span-2">
                  <label className="label flex items-center space-x-2">
                    <Filter className="h-3 w-3" />
                    <span>Description</span>
                  </label>
                  <input 
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input bg-surface"
                    placeholder="What was this for?"
                    required
                  />
                </div>

                <div className="flex items-end">
                  <button type="submit" className={cn(
                    "btn-primary w-full py-3.5 shadow-lg transition-all active:scale-95",
                    activeForm === 'in' ? "bg-success hover:bg-success/90 shadow-success/20" : "bg-warning hover:bg-warning/90 shadow-warning/20"
                  )}>
                    Save {activeForm === 'in' ? 'Income' : 'Expense'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters & Summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="lg:col-span-2 card flex flex-col justify-between border-2 border-border/50 bg-surface/50 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2 text-secondary">
              <Calendar className="h-4 w-4 stroke-[1.5px]" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Date Range Filter</span>
            </div>
            <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">From Date</label>
              <div className="relative group">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="input pr-10 bg-background border-border/50 group-hover:border-accent/50 transition-colors"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary group-hover:text-accent transition-colors pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">To Date</label>
              <div className="relative group">
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="input pr-10 bg-background border-border/50 group-hover:border-accent/50 transition-colors"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary group-hover:text-accent transition-colors pointer-events-none" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="card bg-primary border-none flex flex-col justify-between relative overflow-hidden group"
        >
          {/* Decorative background element */}
          <div className="absolute -right-8 -top-8 h-32 w-32 bg-background/5 rounded-full blur-3xl group-hover:bg-background/10 transition-colors duration-500" />
          
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div className="h-10 w-10 rounded-xl bg-background/10 flex items-center justify-center text-background shadow-inner">
              <Wallet className="h-5 w-5 stroke-[1.5px]" />
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-background/60 uppercase tracking-widest block">Net Balance</span>
              <span className="text-[10px] font-medium text-background/40">{viewMode === 'owner' ? "Owner's Funds" : "Accountant's Cash"}</span>
            </div>
          </div>
          <div className="relative z-10">
            <h3 className="text-4xl font-bold text-background tracking-tighter font-mono mb-6">
              {formatCurrency(netBalance)}
            </h3>
            <div className="grid grid-cols-2 gap-4 border-t border-background/10 pt-6">
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-success" />
                  <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Total Inflow</p>
                </div>
                <p className="text-sm font-bold text-success font-mono">{formatCurrency(totals.inflow)}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-warning" />
                  <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Total Outflow</p>
                </div>
                <p className="text-sm font-bold text-warning font-mono">{formatCurrency(totals.outflow)}</p>
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
                          entry.source === 'Manual Entry' ? "bg-primary/10 text-primary" :
                          "bg-secondary/10 text-secondary"
                        )}>
                          {entry.source === 'Daily Entry' ? <BusIcon className="h-3 w-3 stroke-[1.5px]" /> : 
                           entry.source === 'Bus Expense' ? <Receipt className="h-3 w-3 stroke-[1.5px]" /> : 
                           entry.source === 'Fee Collection' ? <GraduationCap className="h-3 w-3 stroke-[1.5px]" /> :
                           entry.source === 'Manual Entry' ? <Wallet className="h-3 w-3 stroke-[1.5px]" /> :
                           <Building2 className="h-3 w-3 stroke-[1.5px]" />}
                        </div>
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{entry.source}</span>
                      </div>
                    </td>
                    <td>
                      <span className="font-bold text-primary">{entry.category}</span>
                    </td>
                    <td className="max-w-xs">
                      <div className="flex flex-col">
                        <span className="text-secondary font-medium truncate">{entry.description}</span>
                        {entry.staff_id && (
                          <span className="text-[9px] text-accent font-bold uppercase tracking-wider mt-0.5">
                            Staff: {staff.find(s => s.id === entry.staff_id)?.full_name || 'Unknown'}
                          </span>
                        )}
                      </div>
                    </td>
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
