import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { formatCurrency, cn } from '../lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Bus as BusIcon, 
  Users,
  ArrowUpRight,
  ArrowDownRight,
  GraduationCap,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { AccountantTransaction, FeeCollection, Bus, Staff, Profile } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

export function Dashboard() {
  const [showCombined, setShowCombined] = useState(false);
  const [accountantIds, setAccountantIds] = useState<string[]>([]);
  const [rawData, setRawData] = useState<{
    records: any[],
    busExpenses: any[],
    companyExpenses: any[],
    feeCollections: any[],
    cashTransactions: any[],
    buses: Bus[],
    staff: Staff[]
  } | null>(null);

  const [stats, setStats] = useState({
    totalCollections: 0,
    totalBusExpenses: 0,
    totalCompanyExpenses: 0,
    netProfit: 0,
    workingDays: 0,
    accountantCash: 0,
    ownerCash: 0,
    totalCash: 0
  });
  const [busStats, setBusStats] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState<any[]>([]);
  const [staffOverview, setStaffOverview] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (rawData) {
      calculateStats();
    }
  }, [showCombined, rawData, accountantIds]);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const now = new Date();
      const sixMonthsAgo = subMonths(startOfMonth(now), 5);
      const sixMonthsAgoStr = format(sixMonthsAgo, 'yyyy-MM-dd');
      const nowStr = format(endOfMonth(now), 'yyyy-MM-dd');

      // Fetch Accountants
      const accountantsSnap = await getDocs(query(collection(db, 'profiles'), where('role', '==', 'accountant')));
      const accIds = accountantsSnap.docs.map(doc => doc.id);
      setAccountantIds(accIds);

      // 1. Fetch Daily Records for last 6 months
      const recordsSnap = await getDocs(query(
        collection(db, 'daily_records'),
        where('date', '>=', sixMonthsAgoStr),
        where('date', '<=', nowStr)
      ));
      const records = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 2. Fetch Bus Expenses for last 6 months
      const busExpensesSnap = await getDocs(query(
        collection(db, 'bus_expenses'),
        where('date', '>=', sixMonthsAgoStr),
        where('date', '<=', nowStr)
      ));
      const busExpenses = busExpensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 3. Fetch Company Expenses for last 6 months
      const companyExpensesSnap = await getDocs(query(
        collection(db, 'company_expenses'),
        where('date', '>=', sixMonthsAgoStr),
        where('date', '<=', nowStr)
      ));
      const companyExpenses = companyExpensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 4. Fetch Fee Collections for last 6 months
      const feeCollectionsSnap = await getDocs(query(
        collection(db, 'fee_collections'),
        where('date', '>=', Timestamp.fromDate(sixMonthsAgo)),
        where('date', '<=', Timestamp.fromDate(now))
      ));
      const feeCollections = feeCollectionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 5. Fetch Cash Transactions
      const cashSnap = await getDocs(collection(db, 'cash_transactions'));
      const cashTransactions = cashSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 6. Fetch Buses and Staff
      const busesSnap = await getDocs(collection(db, 'buses'));
      const buses = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
      const staffSnap = await getDocs(collection(db, 'staff'));
      const staff = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));

      setRawData({
        records,
        busExpenses,
        companyExpenses,
        feeCollections,
        cashTransactions,
        buses,
        staff
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  function calculateStats() {
    if (!rawData) return;

    const { records: allRecords, busExpenses: allBusExpenses, companyExpenses: allCompanyExpenses, feeCollections: allFeeCollections, cashTransactions, buses, staff } = rawData;

    // Filter based on toggle
    const records = showCombined ? allRecords : allRecords.filter(r => !accountantIds.includes(r.created_by));
    const busExpenses = showCombined ? allBusExpenses : allBusExpenses.filter(e => !accountantIds.includes(e.created_by));
    const companyExpenses = showCombined ? allCompanyExpenses : allCompanyExpenses.filter(e => !accountantIds.includes(e.created_by));
    const feeCollections = showCombined ? allFeeCollections : allFeeCollections.filter(f => !accountantIds.includes(f.recorded_by));

    // Calculate Cash Balances
    let accountantCash = 0;
    let ownerCash = 0;
    cashTransactions.forEach(t => {
      const amount = Number(t.amount) || 0;
      const paidBy = t.paid_by || 'accountant';
      if (t.type === 'in') {
        if (paidBy === 'accountant') accountantCash += amount;
        else ownerCash += amount;
      } else {
        if (paidBy === 'accountant') accountantCash -= amount;
        else ownerCash -= amount;
      }
    });

    // Current Month Filter for KPIs
    const now = new Date();
    const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEndStr = format(endOfMonth(now), 'yyyy-MM-dd');
    
    const currentRecords = records.filter((r: any) => r.date >= monthStartStr && r.date <= monthEndStr);
    const currentBusExpenses = busExpenses.filter((e: any) => e.date >= monthStartStr && e.date <= monthEndStr);
    const currentCompanyExpenses = companyExpenses.filter((e: any) => e.date >= monthStartStr && e.date <= monthEndStr);
    const currentFeeCollections = feeCollections.filter((f: any) => {
      const date = f.date instanceof Timestamp ? f.date.toDate() : new Date(f.date);
      return date >= startOfMonth(now) && date <= endOfMonth(now);
    });
    const currentCashTransactions = cashTransactions.filter((t: any) => t.date >= monthStartStr && t.date <= monthEndStr);

    // Calculate KPIs
    const totalCollections = currentRecords.reduce((sum, r: any) => 
      sum + (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0), 0) +
      currentFeeCollections.reduce((sum, f: any) => sum + (f.amount || 0), 0);
    
    const dailyFuel = currentRecords.reduce((sum, r: any) => sum + (r.fuel_amount || 0), 0);
    const dailyDuty = currentRecords.reduce((sum, r: any) => sum + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0);
    const otherBusExpenses = currentBusExpenses.reduce((sum, e: any) => sum + (e.amount || 0), 0);
    const totalBusExpenses = dailyFuel + dailyDuty + otherBusExpenses;

    const totalCompanyExpenses = currentCompanyExpenses.reduce((sum, e: any) => sum + (e.amount || 0), 0);
    const salaryPayments = currentCashTransactions
      .filter((t: any) => ['salary', 'salary_advance', 'duty_payment'].includes(t.category))
      .reduce((sum, t: any) => sum + (t.amount || 0), 0);

    const workingDays = new Set(currentRecords.map((r: any) => r.date)).size;

    setStats({
      totalCollections,
      totalBusExpenses,
      totalCompanyExpenses: totalCompanyExpenses + salaryPayments,
      netProfit: totalCollections - totalBusExpenses - totalCompanyExpenses - salaryPayments,
      workingDays,
      accountantCash,
      ownerCash,
      totalCash: accountantCash + ownerCash
    });

    // Bus Comparison Cards
    const busComparison = buses.map((bus: any) => {
      const busRecords = currentRecords.filter((r: any) => r.bus_id === bus.id);
      const busExp = currentBusExpenses.filter((e: any) => e.bus_id === bus.id);
      
      const collections = busRecords.reduce((sum, r: any) => 
        sum + (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0), 0);
      
      const fuel = busRecords.reduce((sum, r: any) => sum + (r.fuel_amount || 0), 0);
      const duty = busRecords.reduce((sum, r: any) => sum + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0);
      const other = busExp.reduce((sum, e: any) => sum + (e.amount || 0), 0);

      return {
        name: bus.registration_number,
        vehicle_no: bus.registration_number,
        collections,
        expenses: fuel + duty + other,
        breakdown: {
          school: busRecords.reduce((sum, r: any) => sum + (r.school_morning || 0) + (r.school_evening || 0), 0),
          charter: busRecords.reduce((sum, r: any) => sum + (r.charter_morning || 0) + (r.charter_evening || 0), 0),
          private: busRecords.reduce((sum, r: any) => sum + (r.private_booking || 0), 0),
        }
      };
    });
    setBusStats(busComparison);

    // Revenue vs Expense Chart (Last 6 months)
    const months = Array.from({ length: 6 }, (_, i) => subMonths(new Date(), i)).reverse();
    const chart = months.map(month => {
      const start = format(startOfMonth(month), 'yyyy-MM-dd');
      const end = format(endOfMonth(month), 'yyyy-MM-dd');

      const rs = records.filter((r: any) => r.date >= start && r.date <= end);
      const be = busExpenses.filter((e: any) => e.date >= start && e.date <= end);
      const ce = companyExpenses.filter((e: any) => e.date >= start && e.date <= end);
      const ct = cashTransactions.filter((t: any) => t.date >= start && t.date <= end);
      const fc = feeCollections.filter((f: any) => {
        const date = f.date instanceof Timestamp ? f.date.toDate() : new Date(f.date);
        return date >= startOfMonth(month) && date <= endOfMonth(month);
      });

      const school = rs.reduce((sum, r: any) => sum + (r.school_morning || 0) + (r.school_evening || 0), 0);
      const charter = rs.reduce((sum, r: any) => sum + (r.charter_morning || 0) + (r.charter_evening || 0), 0);
      const private_booking = rs.reduce((sum, r: any) => sum + (r.private_booking || 0), 0);
      const fees = fc.reduce((sum, f: any) => sum + (f.amount || 0), 0);

      const totalExp = rs.reduce((sum, r: any) => sum + (r.fuel_amount || 0) + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0) + 
                       be.reduce((sum, e: any) => sum + (e.amount || 0), 0) + 
                       ce.reduce((sum, e: any) => sum + (e.amount || 0), 0) +
                       ct.filter((t: any) => ['salary', 'salary_advance', 'duty_payment'].includes(t.category)).reduce((sum, t: any) => sum + (t.amount || 0), 0);

      return {
        name: format(month, 'MMM'),
        school,
        charter,
        private: private_booking + fees,
        totalExpenses: totalExp
      };
    });
    setChartData(chart);

    // Expense Breakdown Donut
    const categories = {
      fuel: dailyFuel + currentBusExpenses.filter((e: any) => e.category === 'fuel').reduce((sum, e: any) => sum + e.amount, 0),
      maintenance: currentBusExpenses.filter((e: any) => e.category === 'maintenance_repairs').reduce((sum, e: any) => sum + e.amount, 0),
      regulatory: currentBusExpenses.filter((e: any) => ['traffic_police', 'licensing_registration', 'interstate_regulatory'].includes(e.category)).reduce((sum, e: any) => sum + e.amount, 0),
      salary: salaryPayments,
      overhead: totalCompanyExpenses
    };
    setExpenseBreakdown([
      { name: 'Fuel', value: categories.fuel, color: '#7c5cfc' },
      { name: 'Maintenance', value: categories.maintenance, color: '#ef4444' },
      { name: 'Regulatory', value: categories.regulatory, color: '#f59e0b' },
      { name: 'Salaries', value: categories.salary, color: '#3b82f6' },
      { name: 'Overhead', value: categories.overhead, color: '#22c55e' },
    ]);

    // Staff Overview
    const staffList = staff.map((s: any) => {
      const days = currentRecords.filter((r: any) => r.driver_id === s.id || r.helper_id === s.id).length;
      const bus = buses.find(b => b.id === s.bus_id);
      return {
        name: s.full_name,
        role: s.role,
        bus: bus?.registration_number || 'Unassigned',
        days,
        status: 'Active'
      };
    });
    setStaffOverview(staffList);

    // Recent Activity
    const recent = currentRecords.slice(0, 10).map((r: any) => {
      const bus = buses.find(b => b.id === r.bus_id);
      return {
        date: r.date,
        bus: bus?.registration_number,
        amount: (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0),
        type: 'Collection'
      };
    });
    setRecentActivity(recent);
  }

  if (loading) return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-2">
        <div className="flex items-center space-x-2 text-secondary">
          <Activity className="h-4 w-4 stroke-[1.5px]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">System Overview</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Admin Dashboard</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-surface p-1 rounded-xl border border-border shadow-sm">
              <div className="relative group">
                <button
                  onClick={() => setShowCombined(false)}
                  className={cn(
                    "px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                    !showCombined ? "bg-accent text-white shadow-md" : "text-secondary hover:text-primary"
                  )}
                >
                  Owner Only
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-surface border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <p className="text-[10px] font-medium text-primary leading-relaxed">
                    Shows only your records. Ideal for private tracking of owner-level transactions.
                  </p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-border"></div>
                </div>
              </div>

              <div className="relative group">
                <button
                  onClick={() => setShowCombined(true)}
                  className={cn(
                    "px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                    showCombined ? "bg-accent text-white shadow-md" : "text-secondary hover:text-primary"
                  )}
                >
                  Combined
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-surface border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <p className="text-[10px] font-medium text-primary leading-relaxed">
                    Shows all records from you and all accountants. Provides a complete view of company operations.
                  </p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-border"></div>
                </div>
              </div>
            </div>
            <div className="text-xs font-medium text-secondary bg-surface px-3 py-1.5 rounded-full border border-border">
              {format(new Date(), 'MMMM yyyy')}
            </div>
          </div>
        </div>
      </header>

      {/* Top KPI Bar */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Collections', value: stats.totalCollections, color: 'text-success' },
          { label: 'Total Expenses', value: stats.totalBusExpenses + stats.totalCompanyExpenses, color: 'text-danger' },
          { label: 'Net Profit', value: stats.netProfit, color: 'text-accent' },
          { label: 'Working Days', value: stats.workingDays, isCurrency: false, color: 'text-primary' },
        ].map((kpi) => (
          <motion.div 
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card flex flex-col justify-between"
          >
            <p className="label">{kpi.label}</p>
            <h3 className={cn("text-3xl font-bold font-mono tracking-tighter", kpi.color)}>
              {kpi.isCurrency === false ? kpi.value : formatCurrency(kpi.value)}
            </h3>
          </motion.div>
        ))}
      </div>

      {/* Cash Balances Section */}
      <div className="grid gap-6 sm:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-accent/5 border-accent/20"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent">Total Cash in Hand</p>
            <DollarSign className="h-4 w-4 text-accent stroke-[1.5px]" />
          </div>
          <h3 className="text-3xl font-bold font-mono tracking-tighter text-primary">
            {formatCurrency(stats.totalCash)}
          </h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card bg-success/5 border-success/20"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-success">Accountant Cash</p>
            <Users className="h-4 w-4 text-success stroke-[1.5px]" />
          </div>
          <h3 className="text-3xl font-bold font-mono tracking-tighter text-primary">
            {formatCurrency(stats.accountantCash)}
          </h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card bg-warning/5 border-warning/20"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-warning">Owner Cash</p>
            <Users className="h-4 w-4 text-warning stroke-[1.5px]" />
          </div>
          <h3 className="text-3xl font-bold font-mono tracking-tighter text-primary">
            {formatCurrency(stats.ownerCash)}
          </h3>
        </motion.div>
      </div>

      {/* Bus Comparison Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {busStats.map((bus, idx) => (
          <motion.div 
            key={bus.name}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="card space-y-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-primary tracking-tight">{bus.name}</h3>
                <p className="text-xs text-secondary font-mono">{bus.vehicle_no}</p>
              </div>
              <div className={cn(
                "badge",
                bus.collections - bus.expenses >= 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
              )}>
                <span className="font-mono">{formatCurrency(bus.collections - bus.expenses)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 py-4 border-y border-border/50">
              <div className="space-y-1">
                <p className="label !mb-0 text-[10px]">School</p>
                <p className="text-sm font-bold font-mono">{formatCurrency(bus.breakdown.school)}</p>
              </div>
              <div className="space-y-1 border-x border-border/50 px-4">
                <p className="label !mb-0 text-[10px]">Charter</p>
                <p className="text-sm font-bold font-mono">{formatCurrency(bus.breakdown.charter)}</p>
              </div>
              <div className="space-y-1">
                <p className="label !mb-0 text-[10px]">Private</p>
                <p className="text-sm font-bold font-mono">{formatCurrency(bus.breakdown.private)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-secondary font-medium">Monthly Efficiency</span>
                <span className="font-mono font-bold text-primary">
                  {Math.round((bus.expenses / bus.collections) * 100) || 0}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (bus.expenses / bus.collections) * 100)}%` }}
                  className="h-full bg-accent" 
                />
              </div>
              <div className="flex justify-between text-[10px] text-secondary font-mono">
                <span>{formatCurrency(bus.expenses)} EXP</span>
                <span>{formatCurrency(bus.collections)} COLL</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue vs Expense Chart */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-bold text-primary tracking-tight">Revenue vs Expenses</h3>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5">
                <div className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">Revenue</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <div className="h-2 w-2 rounded-full bg-danger" />
                <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">Expenses</span>
              </div>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f1f1f" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#717171', fontSize: 10, fontWeight: 600 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#717171', fontSize: 10, fontWeight: 600 }} 
                />
                <Tooltip 
                  cursor={{ fill: '#1f1f1f' }}
                  contentStyle={{ 
                    backgroundColor: '#111111', 
                    border: '1px solid #1f1f1f', 
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  itemStyle={{ color: '#f0f0f0' }}
                />
                <Bar dataKey="school" stackId="a" fill="#7c5cfc" radius={[0, 0, 0, 0]} />
                <Bar dataKey="charter" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="private" stackId="a" fill="#4f46e5" radius={[0, 0, 0, 0]} />
                <Bar dataKey="totalExpenses" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="card flex flex-col">
          <h3 className="text-sm font-bold text-primary tracking-tight mb-8">Expense Breakdown</h3>
          <div className="h-64 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenseBreakdown}
                  innerRadius={70}
                  outerRadius={90}
                  paddingAngle={8}
                  dataKey="value"
                  stroke="none"
                >
                  {expenseBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#111111', 
                    border: '1px solid #1f1f1f', 
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 space-y-3">
            {expenseBreakdown.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-secondary font-medium">{item.name}</span>
                </div>
                <span className="font-mono font-bold text-primary">{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Staff Overview */}
        <div className="card">
          <h3 className="text-sm font-bold text-primary tracking-tight mb-6">Staff Overview</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="pb-4 font-bold uppercase tracking-wider">Name</th>
                  <th className="pb-4 font-bold uppercase tracking-wider">Role</th>
                  <th className="pb-4 font-bold uppercase tracking-wider text-center">Days</th>
                  <th className="pb-4 font-bold uppercase tracking-wider text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {staffOverview.map((s, i) => (
                  <tr key={i} className="group hover:bg-border/20 transition-colors">
                    <td className="py-4 font-semibold text-primary">{s.name}</td>
                    <td className="py-4 text-secondary capitalize">{s.role}</td>
                    <td className="py-4 text-center text-primary font-bold font-mono">{s.days}</td>
                    <td className="py-4 text-right">
                      <span className="badge bg-success/10 text-success">
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h3 className="text-sm font-bold text-primary tracking-tight mb-6">Recent Activity</h3>
          <div className="space-y-1">
            {recentActivity.map((activity, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-border/20 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center text-success">
                    <ArrowUpRight className="h-4 w-4 stroke-[1.5px]" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-primary">{activity.bus}</p>
                    <p className="text-[10px] text-secondary font-medium">{format(new Date(activity.date), 'dd MMM yyyy')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-success font-mono">+{formatCurrency(activity.amount)}</p>
                  <p className="text-[9px] text-secondary font-bold uppercase tracking-widest">{activity.type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
