import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Wallet, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  PlusCircle,
  Receipt,
  BookOpen,
  FileText,
  History,
  Bus as BusIcon,
  LayoutDashboard,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  GraduationCap,
  TrendingUp
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { DailyRecord, BusExpense, CompanyExpense, CashTransaction, Staff, Profile } from '../types';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

export function AccountantDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalCollections: 0,
    totalExpenses: 0,
    netProfit: 0,
    accountantCash: 0,
    ownerCash: 0,
    monthlyNetCash: 0,
    collectionsBreakdown: {
      cash: 0,
      nonCash: 0
    },
    cashBreakdown: {
      daily: 0,
      fees: 0,
      manualIn: 0,
      expenses: 0,
      salary: 0,
      transfers: 0
    }
  });
  const [recentRecords, setRecentRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountants, setAccountants] = useState<Profile[]>([]);
  const [selectedAccountantId, setSelectedAccountantId] = useState<string>(auth.currentUser?.uid || '');
  const [staffBalances, setStaffBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    if (profile?.role === 'admin') {
      // Listen to profiles
      const qProfiles = query(collection(db, 'profiles'), where('role', '==', 'accountant'));
      const unsubscribeProfiles = onSnapshot(qProfiles, async (snap) => {
        const profileList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile));
        
        // Also fetch from staff collection to be safe
        const staffSnap = await getDocs(query(collection(db, 'staff'), where('role', '==', 'accountant')));
        const staffList = staffSnap.docs.map(doc => ({ 
          id: doc.id, 
          full_name: doc.data().full_name,
          role: 'accountant' as any,
          email: ''
        } as Profile));

        // Merge lists, avoiding duplicates by ID
        const merged = [...profileList];
        staffList.forEach(s => {
          if (!merged.find(p => p.id === s.id)) {
            merged.push(s);
          }
        });
        
        setAccountants(merged);
        
        // Fetch balances for all
        const settingsSnap = await getDoc(doc(db, 'settings', 'opening_balances'));
        const openingBalances = settingsSnap.exists() ? settingsSnap.data() as any : { owner: 0, accountant: 0 };

        merged.forEach(async (acc) => {
          const cashSnap = await getDocs(query(
            collection(db, 'cash_transactions'),
            where('created_by', '==', acc.id)
          ));
          let bal = (acc.role === 'admin' || acc.id === auth.currentUser?.uid) ? (openingBalances.owner || 0) : (openingBalances.accountant || 0);
          cashSnap.docs.forEach(doc => {
            const t = doc.data();
            const paidBy = t.paid_by || 'accountant';
            // Only count towards this accountant's balance if they handled it
            if (paidBy === 'accountant') {
              if (t.type === 'in') bal += t.amount;
              else bal -= t.amount;
            }
          });
          setStaffBalances(prev => ({ ...prev, [acc.id]: bal }));
        });
      });
      return () => unsubscribeProfiles();
    }
  }, [profile]);

  useEffect(() => {
    if (auth.currentUser?.uid && !selectedAccountantId) {
      setSelectedAccountantId(auth.currentUser.uid);
    }
  }, [auth.currentUser]);

  useEffect(() => {
    if (selectedAccountantId) {
      fetchDashboardData();
    }
  }, [selectedAccountantId]);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const startStr = format(monthStart, 'yyyy-MM-dd');
      const endStr = format(monthEnd, 'yyyy-MM-dd');
      const targetUid = selectedAccountantId;

      // Fetch Buses and Staff
      const busesSnap = await getDocs(collection(db, 'buses'));
      const buses = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const staffSnap = await getDocs(collection(db, 'staff'));
      const staff = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));

      // Fetch Opening Balances
      const settingsSnap = await getDoc(doc(db, 'settings', 'opening_balances'));
      const openingBalances = settingsSnap.exists() ? settingsSnap.data() as any : { owner: 0, accountant: 0 };

      // Fetch Daily Records for the month (only for target accountant)
      const dailySnap = await getDocs(query(
        collection(db, 'daily_records'),
        where('date', '>=', startStr),
        where('date', '<=', endStr),
        where('created_by', '==', targetUid)
      ));

      let totalCollections = 0;
      let cashCollections = 0;
      let dailyExpenses = 0;
      dailySnap.docs.forEach(doc => {
        const data = doc.data() as DailyRecord;
        const amount = (data.school_morning || 0) + (data.school_evening || 0) + (data.charter_morning || 0) + (data.charter_evening || 0) + (data.private_booking || 0);
        totalCollections += amount;
        cashCollections += amount; // Daily records are always cash in this system
        dailyExpenses += (data.fuel_amount || 0) + (data.driver_duty_paid || 0) + (data.helper_duty_paid || 0);
      });

      // Fetch Bus Expenses for the month (only for target accountant)
      const busExpSnap = await getDocs(query(
        collection(db, 'bus_expenses'),
        where('date', '>=', startStr),
        where('date', '<=', endStr),
        where('created_by', '==', targetUid)
      ));
      let busExpenses = 0;
      busExpSnap.docs.forEach(doc => {
        busExpenses += (doc.data() as BusExpense).amount || 0;
      });

      // Fetch Company Expenses for the month (only for target accountant)
      const compExpSnap = await getDocs(query(
        collection(db, 'company_expenses'),
        where('date', '>=', startStr),
        where('date', '<=', endStr),
        where('created_by', '==', targetUid)
      ));
      let companyExpenses = 0;
      compExpSnap.docs.forEach(doc => {
        companyExpenses += (doc.data() as CompanyExpense).amount || 0;
      });

      // Fetch Fee Collections for the month (only for target accountant)
      const feeSnap = await getDocs(query(
        collection(db, 'fee_collections'),
        where('date', '>=', Timestamp.fromDate(monthStart)),
        where('date', '<=', Timestamp.fromDate(monthEnd)),
        where('recorded_by', '==', targetUid)
      ));
      let feeCollections = 0;
      let cashFees = 0;
      feeSnap.docs.forEach(doc => {
        const data = doc.data();
        feeCollections += data.amount || 0;
        if (data.payment_mode === 'Cash') {
          cashFees += data.amount || 0;
        }
      });

      totalCollections += feeCollections;
      cashCollections += cashFees;
      const totalExpenses = dailyExpenses + busExpenses + companyExpenses;

      // Fetch Accountant Cash Balance (only for target accountant)
      const cashSnap = await getDocs(query(
        collection(db, 'cash_transactions'),
        where('created_by', '==', targetUid)
      ));
      
      let accountantCash = openingBalances.accountant || 0;
      let ownerCash = openingBalances.owner || 0;
      const breakdown = {
        daily: 0,
        fees: 0,
        manualIn: 0,
        expenses: 0,
        salary: 0,
        transfers: 0
      };

      cashSnap.docs.forEach(doc => {
        const t = doc.data();
        const amount = Number(t.amount) || 0;
        const tDateStr = t.date; // "YYYY-MM-DD"
        const isThisMonth = tDateStr && tDateStr >= startStr && tDateStr <= endStr;
        const paidBy = t.paid_by || 'accountant'; // Default to accountant for legacy

        // Determine if this transaction belongs to the current view's ledger
        const isTargetLedger = (profile?.role === 'admin' && selectedAccountantId === auth.currentUser?.uid) 
          ? paidBy === 'owner' 
          : paidBy === 'accountant';

        if (t.type === 'in') {
          if (paidBy === 'accountant') accountantCash += amount;
          else ownerCash += amount;

          if (isThisMonth && isTargetLedger) {
            if (t.category === 'daily_collection') breakdown.daily += amount;
            else if (t.category === 'fee_collection') breakdown.fees += amount;
            else breakdown.manualIn += amount;
          }
        } else {
          if (paidBy === 'accountant') accountantCash -= amount;
          else ownerCash -= amount;

          if (isThisMonth && isTargetLedger) {
            if (['salary', 'salary_advance', 'duty_payment'].includes(t.category)) breakdown.salary += amount;
            else if (t.category === 'owner_transfer') breakdown.transfers += amount;
            else breakdown.expenses += amount;
          }
        }
      });

      const currentBalance = (profile?.role === 'admin' && selectedAccountantId === auth.currentUser?.uid) 
        ? ownerCash 
        : accountantCash;

      const monthlyNetCash = (breakdown.daily + breakdown.fees + breakdown.manualIn) - 
                            (breakdown.expenses + breakdown.salary + breakdown.transfers);

      // Fetch recent cash transactions (only for target accountant)
      const recentSnap = await getDocs(query(
        collection(db, 'cash_transactions'),
        where('created_by', '==', targetUid),
        orderBy('date', 'desc'),
        orderBy('created_at', 'desc'),
        limit(5)
      ));

      setStats({
        totalCollections,
        totalExpenses,
        netProfit: totalCollections - totalExpenses,
        accountantCash: currentBalance,
        ownerCash,
        monthlyNetCash,
        collectionsBreakdown: {
          cash: cashCollections,
          nonCash: totalCollections - cashCollections
        },
        cashBreakdown: breakdown
      });
      setRecentRecords(recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashTransaction)));
    } catch (error) {
      console.error('Error fetching accountant dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  const quickLinks = [
    { title: 'Cash In', icon: ArrowDownLeft, path: '/cashbook', state: { action: 'in' }, color: 'text-success' },
    { title: 'Cash Out', icon: ArrowUpRight, path: '/cashbook', state: { action: 'out' }, color: 'text-warning' },
    { title: 'Daily Entry', icon: PlusCircle, path: '/entry', color: 'text-accent' },
    { title: 'Fee Collection', icon: GraduationCap, path: '/fees', color: 'text-primary' },
    { title: 'Expense Entry', icon: Receipt, path: '/expenses', color: 'text-danger' },
    { title: 'Monthly Reports', icon: FileText, path: '/reports', color: 'text-warning' },
  ];

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-2">
        <div className="flex items-center space-x-2 text-secondary">
          <LayoutDashboard className="h-4 w-4 stroke-[1.5px]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Accountant Portal</span>
        </div>
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Accountant Dashboard</h1>
          
          <div className="flex items-center space-x-4">
            {profile?.role === 'admin' && (
              <div className="flex items-center space-x-2 bg-surface border border-border rounded-xl px-3 py-1.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">View As:</span>
                <select 
                  value={selectedAccountantId}
                  onChange={(e) => setSelectedAccountantId(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold text-accent focus:ring-0 cursor-pointer"
                >
                  <option value={auth.currentUser?.uid}>Me (Admin)</option>
                  {accountants.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.full_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="text-xs font-medium text-secondary bg-surface px-3 py-1.5 rounded-full border border-border">
              {format(new Date(), 'MMMM yyyy')}
            </div>
          </div>
        </div>
      </header>

      {profile?.role === 'admin' && (
        <div className="space-y-6">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-secondary" />
            <h3 className="text-sm font-bold text-primary tracking-tight">Accountant Cash Balances</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {accountants.map(acc => (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountantId(acc.id)}
                className={cn(
                  "card text-left transition-all",
                  selectedAccountantId === acc.id ? "border-accent ring-1 ring-accent" : "hover:border-accent/30"
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2">{acc.full_name}</p>
                <p className="text-xl font-bold font-mono tracking-tighter text-primary">{formatCurrency(staffBalances[acc.id] || 0)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-accent text-background border-none shadow-lg shadow-accent/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2 opacity-80">
              <Wallet className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Cash in Hand</span>
            </div>
          </div>
          <h3 className="text-4xl font-bold font-mono tracking-tighter">
            {formatCurrency(stats.accountantCash)}
          </h3>
          <p className="mt-1 text-[10px] opacity-70 font-medium text-background/80 mb-4">Total cumulative cash in hand</p>
          
          <div className="mt-4 pt-4 border-t border-background/20 space-y-3">
            <div className="flex justify-between text-[10px] font-medium">
              <span className="opacity-70">Monthly Net Cash</span>
              <span className="font-mono">{stats.monthlyNetCash >= 0 ? '+' : ''}{formatCurrency(stats.monthlyNetCash)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-medium">
              <span className="opacity-70">Cash Collections</span>
              <span className="font-mono">+{formatCurrency(stats.cashBreakdown.daily + stats.cashBreakdown.fees + stats.cashBreakdown.manualIn)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-medium">
              <span className="opacity-70">Cash Expenses</span>
              <span className="font-mono">-{formatCurrency(stats.cashBreakdown.expenses + stats.cashBreakdown.salary + stats.cashBreakdown.transfers)}</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card"
        >
          <div className="flex items-center space-x-2 text-success">
            <ArrowDownCircle className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Monthly Collections</span>
          </div>
          <h3 className="mt-4 text-3xl font-bold text-primary font-mono tracking-tighter">{formatCurrency(stats.totalCollections)}</h3>
          <div className="mt-2 flex items-center space-x-3 text-[9px] font-bold uppercase tracking-widest">
            <span className="text-success">Cash: {formatCurrency(stats.collectionsBreakdown.cash)}</span>
            {stats.collectionsBreakdown.nonCash > 0 && (
              <span className="text-secondary opacity-60">Other: {formatCurrency(stats.collectionsBreakdown.nonCash)}</span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-secondary font-medium">This month's total revenue</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <div className="flex items-center space-x-2 text-danger">
            <ArrowUpCircle className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Monthly Expenses</span>
          </div>
          <h3 className="mt-4 text-3xl font-bold text-primary font-mono tracking-tighter">{formatCurrency(stats.totalExpenses)}</h3>
          <p className="mt-1 text-[10px] text-secondary font-medium">Fuel, Duty, Bus & Company</p>
        </motion.div>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Quick Links */}
        <div className="space-y-6">
          <div className="flex items-center space-x-2">
            <PlusCircle className="h-4 w-4 text-secondary" />
            <h3 className="text-sm font-bold text-primary tracking-tight">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {quickLinks.map((link, idx) => (
              <Link
                key={link.title}
                to={link.path}
                state={link.state}
                className="card group hover:border-accent transition-all duration-300 flex flex-col items-center text-center py-8"
              >
                <div className={cn("mb-4 rounded-full p-3 bg-surface border border-border group-hover:bg-accent group-hover:text-background transition-colors duration-300", link.color)}>
                  <link.icon className="h-6 w-6 stroke-[1.5px]" />
                </div>
                <span className="text-xs font-bold text-primary tracking-tight">{link.title}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Entries */}
        <div className="card !p-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center space-x-2">
              <History className="h-4 w-4 text-secondary" />
              <h3 className="text-sm font-bold text-primary tracking-tight">Recent Entries</h3>
            </div>
          </div>
          <div className="divide-y divide-border/50 flex-1">
            {recentRecords.map((record) => (
              <div key={record.id} className="flex items-center justify-between p-5 hover:bg-border/20 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    record.type === 'in' ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  )}>
                    {record.type === 'in' ? <ArrowDownCircle className="h-5 w-5 stroke-[1.5px]" /> : <ArrowUpCircle className="h-5 w-5 stroke-[1.5px]" />}
                  </div>
                  <div>
                    <p className="font-bold text-primary text-xs">{record.description}</p>
                    <p className="text-[10px] text-secondary font-mono">{record.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-bold text-xs font-mono",
                    record.type === 'in' ? "text-success" : "text-warning"
                  )}>
                    {record.type === 'in' ? '+' : '-'}{formatCurrency(record.amount)}
                  </p>
                  <p className="text-[9px] text-secondary font-bold uppercase tracking-widest">{record.category.replace('_', ' ')}</p>
                </div>
              </div>
            ))}
            {recentRecords.length === 0 && (
              <div className="p-12 text-center text-secondary text-xs font-medium">
                No recent entries
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
