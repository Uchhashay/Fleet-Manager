import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  BarChart3, 
  Download, 
  TrendingUp,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Bus as BusIcon,
  Fuel,
  Wrench,
  UserCheck,
  Calendar,
  PieChart,
  Activity,
  ChevronRight
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { DailyRecord, BusExpense, CompanyExpense, Bus, CashTransaction } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuth } from '../contexts/AuthContext';

interface BusReport {
  busId: string;
  registrationNumber: string;
  collection: number;
  fuel: number;
  duty: number;
  maintenance: number;
  net: number;
}

import { Link, useNavigate } from 'react-router-dom';

export function AccountantReports() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [summary, setSummary] = useState({
    totalCollection: 0,
    totalFuel: 0,
    totalDuty: 0,
    totalMaintenance: 0,
    companyExpenses: 0,
    netProfit: 0
  });
  const [busReports, setBusReports] = useState<BusReport[]>([]);

  useEffect(() => {
    fetchReportData();
  }, [month]);

  async function fetchReportData() {
    setLoading(true);
    try {
      const start = format(startOfMonth(new Date(month)), 'yyyy-MM-dd');
      const end = format(endOfMonth(new Date(month)), 'yyyy-MM-dd');

      // Fetch Buses
      const busesSnap = await getDocs(collection(db, 'buses'));
      const buses = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));

      // Fetch Daily Records
      let dailyQuery = query(
        collection(db, 'daily_records'),
        where('date', '>=', start),
        where('date', '<=', end)
      );
      if (profile?.role === 'accountant') {
        dailyQuery = query(dailyQuery, where('created_by', '==', auth.currentUser?.uid));
      }
      const dailySnap = await getDocs(dailyQuery);
      const dailyRecords = dailySnap.docs.map(doc => doc.data() as DailyRecord);

      // Fetch Bus Expenses
      let busExpQuery = query(
        collection(db, 'bus_expenses'),
        where('date', '>=', start),
        where('date', '<=', end)
      );
      if (profile?.role === 'accountant') {
        busExpQuery = query(busExpQuery, where('created_by', '==', auth.currentUser?.uid));
      }
      const busExpSnap = await getDocs(busExpQuery);
      const busExpenses = busExpSnap.docs.map(doc => doc.data() as BusExpense);

      // Fetch Company Expenses
      let compExpQuery = query(
        collection(db, 'company_expenses'),
        where('date', '>=', start),
        where('date', '<=', end)
      );
      if (profile?.role === 'accountant') {
        compExpQuery = query(compExpQuery, where('created_by', '==', auth.currentUser?.uid));
      }
      const compExpSnap = await getDocs(compExpQuery);
      let companyExpensesTotal = 0;
      compExpSnap.docs.forEach(doc => {
        companyExpensesTotal += (doc.data() as CompanyExpense).amount || 0;
      });

      // Fetch Fee Collections
      let feeQuery = query(
        collection(db, 'fee_collections'),
        where('date', '>=', Timestamp.fromDate(startOfMonth(new Date(month)))),
        where('date', '<=', Timestamp.fromDate(endOfMonth(new Date(month))))
      );
      if (profile?.role === 'accountant') {
        feeQuery = query(feeQuery, where('recorded_by', '==', auth.currentUser?.uid));
      }
      const feeSnap = await getDocs(feeQuery);
      let feeCollectionsTotal = 0;
      feeSnap.docs.forEach(doc => {
        feeCollectionsTotal += doc.data().amount || 0;
      });

      // Fetch Cash Transactions (Salary/Misc)
      let cashQuery = query(
        collection(db, 'cash_transactions'),
        where('date', '>=', start),
        where('date', '<=', end)
      );
      if (profile?.role === 'accountant') {
        cashQuery = query(cashQuery, where('created_by', '==', auth.currentUser?.uid));
      }
      const cashSnap = await getDocs(cashQuery);
      const cashTransactions = cashSnap.docs.map(doc => doc.data() as CashTransaction);
      const manualSalaryTotal = cashTransactions.filter(t => t.category === 'salary').reduce((sum, t) => sum + (t.amount || 0), 0);
      const miscExpensesTotal = cashTransactions.filter(t => t.type === 'out' && t.category !== 'salary' && t.category !== 'bus_expense').reduce((sum, t) => sum + (t.amount || 0), 0);
      const miscIncomeTotal = cashTransactions.filter(t => t.type === 'in' && t.category !== 'fee_collection').reduce((sum, t) => sum + (t.amount || 0), 0);

      const reports: BusReport[] = buses.map(bus => {
        const busDaily = dailyRecords.filter(r => r.bus_id === bus.id);
        const busExp = busExpenses.filter(e => e.bus_id === bus.id);

        const collectionTotal = busDaily.reduce((sum, r) => sum + (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0), 0);
        const fuelTotal = busDaily.reduce((sum, r) => sum + (r.fuel_amount || 0), 0);
        const dutyTotal = busDaily.reduce((sum, r) => sum + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0);
        const maintenanceTotal = busExp.filter(e => e.category === 'maintenance_repairs').reduce((sum, e) => sum + (e.amount || 0), 0);
        const otherBusExp = busExp.filter(e => e.category !== 'maintenance_repairs').reduce((sum, e) => sum + (e.amount || 0), 0);

        const totalOutflow = fuelTotal + dutyTotal + maintenanceTotal + otherBusExp;

        return {
          busId: bus.id,
          registrationNumber: bus.registration_number,
          collection: collectionTotal,
          fuel: fuelTotal,
          duty: dutyTotal,
          maintenance: maintenanceTotal,
          net: collectionTotal - totalOutflow
        };
      });

      const totalCollection = reports.reduce((sum, r) => sum + r.collection, 0) + feeCollectionsTotal + miscIncomeTotal;
      const totalFuel = reports.reduce((sum, r) => sum + r.fuel, 0);
      const totalDuty = reports.reduce((sum, r) => sum + r.duty, 0) + manualSalaryTotal;
      const totalMaintenance = reports.reduce((sum, r) => sum + r.maintenance, 0);
      
      setSummary({
        totalCollection,
        totalFuel,
        totalDuty,
        totalMaintenance,
        companyExpenses: companyExpensesTotal + miscExpensesTotal,
        netProfit: totalCollection - (totalFuel + totalDuty + totalMaintenance + companyExpensesTotal + miscExpensesTotal)
      });
      setBusReports(reports);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <BarChart3 className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Financial Intelligence</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Monthly Reports</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="relative">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="input !py-2 !pl-10 !pr-4 bg-surface appearance-none"
            />
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary stroke-[1.5px]" />
          </div>
          <button className="btn-secondary flex items-center space-x-2 !py-2">
            <Download className="h-4 w-4 stroke-[1.5px]" />
            <span>Export</span>
          </button>
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-accent text-white border-none shadow-xl shadow-accent/20"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2 opacity-80">
              <TrendingUp className="h-4 w-4 stroke-[1.5px]" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Net Profit</span>
            </div>
            <Activity className="h-4 w-4 opacity-50" />
          </div>
          <h3 className="text-3xl font-bold tracking-tighter font-mono">{formatCurrency(summary.netProfit)}</h3>
          <p className="mt-2 text-[10px] font-medium text-white/60 uppercase tracking-widest">After all expenses</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card"
        >
          <div className="flex items-center space-x-2 text-secondary mb-6">
            <ArrowDownCircle className="h-4 w-4 stroke-[1.5px] text-success" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Total Collection</span>
          </div>
          <h3 className="text-2xl font-bold text-primary tracking-tight font-mono">{formatCurrency(summary.totalCollection)}</h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <div className="flex items-center space-x-2 text-secondary mb-6">
            <Fuel className="h-4 w-4 stroke-[1.5px] text-danger" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Fuel Expense</span>
          </div>
          <h3 className="text-2xl font-bold text-primary tracking-tight font-mono">{formatCurrency(summary.totalFuel)}</h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          <div className="flex items-center space-x-2 text-secondary mb-6">
            <Wrench className="h-4 w-4 stroke-[1.5px] text-warning" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Maintenance</span>
          </div>
          <h3 className="text-2xl font-bold text-primary tracking-tight font-mono">{formatCurrency(summary.totalMaintenance)}</h3>
        </motion.div>
      </div>

      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-lg bg-surface flex items-center justify-center border border-border">
              <BusIcon className="h-4 w-4 text-secondary stroke-[1.5px]" />
            </div>
            <h3 className="text-lg font-bold text-primary tracking-tight">Vehicle Performance</h3>
          </div>
          <div className="h-px flex-1 bg-border/50 mx-6 hidden sm:block" />
          <div className="flex items-center space-x-2 text-secondary">
            <PieChart className="h-3.5 w-3.5 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Fleet Breakdown</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {busReports.map((report, idx) => (
            <motion.div 
              key={report.busId}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="card group hover:border-accent/30"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                  <div className="h-12 w-12 rounded-full bg-accent/10 text-accent flex items-center justify-center border border-accent/20">
                    <BusIcon className="h-6 w-6 stroke-[1.5px]" />
                  </div>
                  <div>
                    <h4 className="font-bold text-primary tracking-tight">{report.registrationNumber}</h4>
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Monthly Performance</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-xl font-bold font-mono tracking-tighter", 
                    report.net >= 0 ? "text-success" : "text-danger"
                  )}>
                    {formatCurrency(report.net)}
                  </p>
                  <p className="text-[9px] uppercase font-bold text-secondary tracking-[0.2em] mt-0.5">Net Balance</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-surface/50 border border-border/50 group-hover:border-accent/10 transition-colors">
                  <p className="text-[9px] font-bold text-secondary uppercase tracking-widest mb-2">Collection</p>
                  <p className="text-sm font-bold text-primary font-mono">{formatCurrency(report.collection)}</p>
                </div>
                <div className="p-4 rounded-xl bg-surface/50 border border-border/50 group-hover:border-accent/10 transition-colors">
                  <p className="text-[9px] font-bold text-secondary uppercase tracking-widest mb-2">Fuel</p>
                  <p className="text-sm font-bold text-primary font-mono">{formatCurrency(report.fuel)}</p>
                </div>
                <div className="p-4 rounded-xl bg-surface/50 border border-border/50 group-hover:border-accent/10 transition-colors">
                  <p className="text-[9px] font-bold text-secondary uppercase tracking-widest mb-2">Duty</p>
                  <p className="text-sm font-bold text-primary font-mono">{formatCurrency(report.duty)}</p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-end">
                <button 
                  onClick={() => navigate(`/monthly?busId=${report.busId}&month=${month}`)}
                  className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center space-x-1 hover:space-x-2 transition-all"
                >
                  <span>View Details</span>
                  <ChevronRight className="h-3 w-3 stroke-[2px]" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
