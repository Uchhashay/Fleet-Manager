import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
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
  LayoutDashboard
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { DailyRecord, BusExpense, CompanyExpense, CashTransaction } from '../types';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export function AccountantDashboard() {
  const [stats, setStats] = useState({
    totalCollections: 0,
    totalExpenses: 0,
    netProfit: 0,
    accountantCash: 0
  });
  const [recentRecords, setRecentRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      // Fetch Daily Records for the month (only for this accountant)
      const dailySnap = await getDocs(query(
        collection(db, 'daily_records'),
        where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
        where('date', '<=', format(monthEnd, 'yyyy-MM-dd')),
        where('created_by', '==', auth.currentUser?.uid)
      ));

      let totalCollections = 0;
      let dailyExpenses = 0;
      dailySnap.docs.forEach(doc => {
        const data = doc.data() as DailyRecord;
        totalCollections += (data.school_morning || 0) + (data.school_evening || 0) + (data.charter_morning || 0) + (data.school_evening || 0) + (data.private_booking || 0);
        dailyExpenses += (data.fuel_amount || 0) + (data.duty_paid || 0);
      });

      // Fetch Bus Expenses for the month (only for this accountant)
      const busExpSnap = await getDocs(query(
        collection(db, 'bus_expenses'),
        where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
        where('date', '<=', format(monthEnd, 'yyyy-MM-dd')),
        where('created_by', '==', auth.currentUser?.uid)
      ));
      let busExpenses = 0;
      busExpSnap.docs.forEach(doc => {
        busExpenses += (doc.data() as BusExpense).amount || 0;
      });

      // Fetch Company Expenses for the month (only for this accountant)
      const compExpSnap = await getDocs(query(
        collection(db, 'company_expenses'),
        where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
        where('date', '<=', format(monthEnd, 'yyyy-MM-dd')),
        where('created_by', '==', auth.currentUser?.uid)
      ));
      let companyExpenses = 0;
      compExpSnap.docs.forEach(doc => {
        companyExpenses += (doc.data() as CompanyExpense).amount || 0;
      });

      // Fetch Fee Collections for the month (only for this accountant)
      const feeSnap = await getDocs(query(
        collection(db, 'fee_collections'),
        where('date', '>=', Timestamp.fromDate(monthStart)),
        where('date', '<=', Timestamp.fromDate(monthEnd)),
        where('recorded_by', '==', auth.currentUser?.uid)
      ));
      let feeCollections = 0;
      feeSnap.docs.forEach(doc => {
        feeCollections += doc.data().amount || 0;
      });

      totalCollections += feeCollections;
      const totalExpenses = dailyExpenses + busExpenses + companyExpenses;

      // Fetch Accountant Cash Balance (only for this accountant)
      const cashSnap = await getDocs(query(
        collection(db, 'cash_transactions'),
        where('created_by', '==', auth.currentUser?.uid)
      ));
      let accountantCash = 0;
      cashSnap.docs.forEach(doc => {
        const t = doc.data();
        if (t.type === 'in') accountantCash += t.amount;
        else accountantCash -= t.amount;
      });

      // Fetch recent cash transactions (only for this accountant)
      const recentSnap = await getDocs(query(
        collection(db, 'cash_transactions'),
        where('created_by', '==', auth.currentUser?.uid),
        orderBy('date', 'desc'),
        orderBy('created_at', 'desc'),
        limit(5)
      ));

      setStats({
        totalCollections,
        totalExpenses,
        netProfit: totalCollections - totalExpenses,
        accountantCash
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
    { title: 'Daily Entry', icon: PlusCircle, path: '/entry', color: 'text-accent' },
    { title: 'Expense Logging', icon: Receipt, path: '/expenses', color: 'text-danger' },
    { title: 'Cash Management', icon: Wallet, path: '/cash', color: 'text-success' },
    { title: 'Monthly Reports', icon: FileText, path: '/reports', color: 'text-warning' },
  ];

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-2">
        <div className="flex items-center space-x-2 text-secondary">
          <LayoutDashboard className="h-4 w-4 stroke-[1.5px]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Accountant Portal</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Accountant Dashboard</h1>
          <div className="text-xs font-medium text-secondary bg-surface px-3 py-1.5 rounded-full border border-border">
            {format(new Date(), 'MMMM yyyy')}
          </div>
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-accent text-background border-none shadow-lg shadow-accent/20"
        >
          <div className="flex items-center space-x-2 opacity-80">
            <Wallet className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Accountant Cash Balance</span>
          </div>
          <h3 className="mt-4 text-3xl font-bold font-mono tracking-tighter">{formatCurrency(stats.accountantCash)}</h3>
          <p className="mt-1 text-[10px] opacity-70 font-medium text-background/80">Actual cash in hand with accountant</p>
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
