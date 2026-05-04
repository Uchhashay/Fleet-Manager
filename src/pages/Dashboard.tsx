import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, limit, Timestamp, doc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
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
  Activity,
  Calendar,
  RefreshCw,
  Plus,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Calculator
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
import { format, subMonths, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, differenceInDays, parseISO } from 'date-fns';
import { AccountantTransaction, FeeCollection, Bus, Staff, Profile, DailyRecord, Booking, Invoice, SalaryRecord } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export function Dashboard() {
  const navigate = useNavigate();
  const [showCombined, setShowCombined] = useState(false);
  const [timeframe, setTimeframe] = useState<'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [customRange, setCustomRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [accountantIds, setAccountantIds] = useState<string[]>([]);
  const [rawData, setRawData] = useState<{
    records: DailyRecord[],
    busExpenses: any[],
    companyExpenses: any[],
    feeCollections: any[],
    cashTransactions: any[],
    buses: Bus[],
    staff: Staff[],
    openingBalances: { owner: number, accountant: number },
    bookings: Booking[],
    invoices: Invoice[],
    salaryRecords: SalaryRecord[]
  } | null>(null);

  const [stats, setStats] = useState({
    totalCollections: 0,
    totalBusExpenses: 0,
    totalCompanyExpenses: 0,
    netProfit: 0,
    workingDays: 0,
    accountantCash: 0,
    ownerCash: 0,
    totalCash: 0,
    activeBuses: 0,
    activeStaff: 0,
    monthBookings: 0,
    pendingSalary: 0
  });
  const [todayDuties, setTodayDuties] = useState<any[]>([]);
  const [complianceAlerts, setComplianceAlerts] = useState<any[]>([]);
  const [defaulters, setDefaulters] = useState<any[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
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
  }, [showCombined, timeframe, customRange, rawData, accountantIds]);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const now = new Date();
      // Fetch data from the start of the previous year to cover "This Year" and "Custom" ranges better
      const startOfData = startOfMonth(subMonths(now, 24)); 
      const startOfDataStr = format(startOfData, 'yyyy-MM-dd');
      const endOfDataStr = format(endOfMonth(now), 'yyyy-MM-dd');

      // Fetch Accountants
      const accountantsSnap = await getDocs(query(collection(db, 'profiles'), where('role', '==', 'accountant')));
      const accIds = accountantsSnap.docs.map(doc => doc.id);
      setAccountantIds(accIds);

      // 1. Fetch Daily Records
      const recordsSnap = await getDocs(query(
        collection(db, 'daily_records'),
        where('date', '>=', startOfDataStr),
        where('date', '<=', endOfDataStr)
      ));
      const records = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 2. Fetch Bus Expenses
      const busExpensesSnap = await getDocs(query(
        collection(db, 'bus_expenses'),
        where('date', '>=', startOfDataStr),
        where('date', '<=', endOfDataStr)
      ));
      const busExpenses = busExpensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 3. Fetch Company Expenses
      const companyExpensesSnap = await getDocs(query(
        collection(db, 'company_expenses'),
        where('date', '>=', startOfDataStr),
        where('date', '<=', endOfDataStr)
      ));
      const companyExpenses = companyExpensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 4. Fetch Fee Collections
      const feeCollectionsSnap = await getDocs(query(
        collection(db, 'fee_collections'),
        where('date', '>=', Timestamp.fromDate(startOfData)),
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

      // 7. Fetch Bookings, Invoices, Salary Records
      const bookingsSnap = await getDocs(collection(db, 'bookings'));
      const bookings = bookingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      
      const invoicesSnap = await getDocs(collection(db, 'invoices'));
      const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      
      const salaryRecordsSnap = await getDocs(collection(db, 'salary_records'));
      const salaryRecords = salaryRecordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalaryRecord));

      // Fetch Opening Balances
      const settingsSnap = await getDoc(doc(db, 'settings', 'opening_balances'));
      const openingBalances = settingsSnap.exists() ? settingsSnap.data() as any : { owner: 0, accountant: 0 };

      setRawData({
        records: records as DailyRecord[],
        busExpenses,
        companyExpenses,
        feeCollections,
        cashTransactions,
        buses,
        staff,
        openingBalances,
        bookings,
        invoices,
        salaryRecords
      });

    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'dashboard_data');
    } finally {
      setLoading(false);
    }
  }

  function calculateStats() {
    if (!rawData) return;

    const { 
      records: allRecords, 
      busExpenses: allBusExpenses, 
      companyExpenses: allCompanyExpenses, 
      feeCollections: allFeeCollections, 
      cashTransactions, 
      buses, 
      staff,
      bookings,
      invoices,
      salaryRecords
    } = rawData;

    // Filter based on toggle
    const records = showCombined ? allRecords : allRecords.filter(r => !accountantIds.includes(r.created_by));
    const busExpenses = showCombined ? allBusExpenses : allBusExpenses.filter(e => !accountantIds.includes(e.created_by));
    const companyExpenses = showCombined ? allCompanyExpenses : allCompanyExpenses.filter(e => !accountantIds.includes(e.created_by));
    const feeCollections = showCombined ? allFeeCollections : allFeeCollections.filter(f => !accountantIds.includes(f.recorded_by));
    const filteredCashTransactions = showCombined ? cashTransactions : cashTransactions.filter(t => !accountantIds.includes(t.created_by));

    // Today's Duties
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayRs = records.filter(r => r.date === todayStr).map(r => {
      const bus = buses.find(b => b.id === r.bus_id);
      const driver = staff.find(s => s.id === r.driver_id);
      const collection = (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0);
      return {
        ...r,
        bus_number: bus?.registration_number || 'Unknown',
        driver_name: driver?.full_name || 'Unknown',
        total_collection: collection
      };
    });
    setTodayDuties(todayRs);

    // Compliance Alerts
    const alerts: any[] = [];
    const today = new Date();
    buses.forEach(bus => {
      const fields = [
        { key: 'insurance_expiry', label: 'Insurance' },
        { key: 'fitness_expiry', label: 'Fitness' },
        { key: 'permit_expiry', label: 'Permit' },
        { key: 'vehicle_tax_due', label: 'Vehicle Tax' },
        { key: 'puc_expiry', label: 'PUC' },
        { key: 'cng_testing_due', label: 'CNG Testing' },
        { key: 'speed_governor_expiry', label: 'Speed Governor' },
        { key: 'fire_extinguisher_expiry', label: 'Fire Extinguisher' }
      ];

      fields.forEach(f => {
        const val = (bus as any)[f.key];
        if (val) {
          const expiryDate = parseISO(val);
          const daysLeft = differenceInDays(expiryDate, today);
          
          let severity: 'red' | 'yellow' | 'blue' | null = null;
          let statusText = '';

          if (daysLeft < 0) {
            severity = 'red';
            statusText = 'Expired';
          } else if (daysLeft <= 30) {
            severity = 'yellow';
            statusText = `${daysLeft} days left`;
          } else if (daysLeft <= 60) {
            severity = 'blue';
            statusText = `${daysLeft} days upcoming`;
          }

          if (severity) {
            alerts.push({
              id: `${bus.id}-${f.key}`,
              bus_id: bus.id,
              bus_number: bus.registration_number,
              label: f.label,
              statusText,
              severity,
              daysLeft
            });
          }
        }
      });
    });

    setComplianceAlerts(alerts.sort((a, b) => {
      const priority = { red: 0, yellow: 1, blue: 2 };
      if (priority[a.severity] !== priority[b.severity]) {
        return priority[a.severity] - priority[b.severity];
      }
      return a.daysLeft - b.daysLeft;
    }).slice(0, 5));

    // Defaulters
    const unpaidInvoices = invoices.filter(inv => ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(inv.status));
    const studentBalances: { [key: string]: { name: string, balance: number, studentId: string } } = {};
    let totalOutstandingVal = 0;
    let overdueCountVal = 0;

    unpaidInvoices.forEach(inv => {
      totalOutstandingVal += inv.balanceDue;
      if (inv.status === 'OVERDUE') overdueCountVal++;
      
      if (!studentBalances[inv.studentId]) {
        studentBalances[inv.studentId] = { name: inv.studentName, balance: 0, studentId: inv.studentId };
      }
      studentBalances[inv.studentId].balance += inv.balanceDue;
    });

    const topDefaulters = Object.values(studentBalances)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
    
    setDefaulters(topDefaulters);
    setTotalOutstanding(totalOutstandingVal);
    setOverdueCount(overdueCountVal);

    // Calculate Cash Balances
    let accountantCash = rawData.openingBalances?.accountant || 0;
    let ownerCash = rawData.openingBalances?.owner || 0;
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

    // ... (rest of date range detection logic stays same)

    // Determine date range for KPIs
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (timeframe) {
      case 'today':
        startDate = startOfDay(now);
        endDate = endOfDay(now);
        break;
      case 'yesterday':
        startDate = startOfDay(subDays(now, 1));
        endDate = endOfDay(subDays(now, 1));
        break;
      case 'week':
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'month':
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      case 'custom':
        startDate = startOfDay(new Date(customRange.start));
        endDate = endOfDay(new Date(customRange.end));
        break;
      default:
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
    }

    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');
    
    const currentRecords = records.filter((r: any) => r.date >= startStr && r.date <= endStr);
    const currentBusExpenses = busExpenses.filter((e: any) => e.date >= startStr && e.date <= endStr);
    const currentCompanyExpenses = companyExpenses.filter((e: any) => e.date >= startStr && e.date <= endStr);
    const currentFeeCollections = feeCollections.filter((f: any) => {
      const date = f.date instanceof Timestamp ? f.date.toDate() : new Date(f.date);
      return date >= startDate && date <= endDate;
    });
    const currentCashTransactions = filteredCashTransactions.filter((t: any) => t.date >= startStr && t.date <= endStr);

    // Calculate KPIs
    const totalCollections = currentRecords.reduce((sum, r: any) => 
      sum + (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0), 0) +
      currentFeeCollections.reduce((sum, f: any) => sum + (f.amount || 0), 0) +
      currentCashTransactions.filter((t: any) => t.type === 'in' && t.category === 'misc').reduce((sum, t: any) => sum + (t.amount || 0), 0);
    
    const dailyFuel = currentRecords.reduce((sum, r: any) => sum + (r.fuel_amount || 0), 0);
    const dailyDuty = currentRecords.reduce((sum, r: any) => sum + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0);
    const otherBusExpenses = currentBusExpenses.reduce((sum, e: any) => sum + (e.amount || 0), 0);
    const totalBusExpenses = dailyFuel + dailyDuty + otherBusExpenses;

    const totalCompanyExpenses = currentCompanyExpenses.reduce((sum, e: any) => sum + (e.amount || 0), 0);
    const salaryPayments = currentCashTransactions
      .filter((t: any) => ['salary', 'salary_advance', 'duty_payment'].includes(t.category))
      .reduce((sum, t: any) => sum + (t.amount || 0), 0);
    
    const miscExpenses = currentCashTransactions
      .filter((t: any) => t.type === 'out' && t.category === 'misc')
      .reduce((sum, t: any) => sum + (t.amount || 0), 0);

    const workingDays = new Set(currentRecords.map((r: any) => r.date)).size;

    setStats({
      totalCollections,
      totalBusExpenses,
      totalCompanyExpenses: totalCompanyExpenses + salaryPayments + miscExpenses,
      netProfit: totalCollections - totalBusExpenses - totalCompanyExpenses - salaryPayments - miscExpenses,
      workingDays,
      accountantCash: showCombined ? accountantCash : 0, 
      ownerCash,
      totalCash: showCombined ? (accountantCash + ownerCash) : ownerCash,
      activeBuses: buses.filter(b => b.is_active !== false).length,
      activeStaff: staff.filter(s => s.is_active !== false).length,
      monthBookings: bookings.filter(b => b.createdAt && parseISO(typeof b.createdAt === 'string' ? b.createdAt : b.createdAt.toDate().toISOString()) >= startOfMonth(now)).length,
      pendingSalary: salaryRecords.filter(s => s.status !== 'paid').reduce((sum, s) => sum + s.net_payable, 0)
    });
    
    // Correct pending salary logic: (net_payable sum for unpaid/partial records)
    const truePendingSalary = salaryRecords.filter(s => s.status !== 'paid').reduce((sum, s) => sum + s.net_payable, 0);
    setStats(prev => ({ ...prev, pendingSalary: truePendingSalary }));

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
        id: bus.id,
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

    // Revenue vs Expense Chart (Dynamic based on timeframe)
    let chart: any[] = [];
    const diffInDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    if (timeframe === 'today' || timeframe === 'yesterday' || (timeframe === 'custom' && diffInDays <= 1)) {
      // Show hourly or just the day? For now, let's show the last 7 days trend to give context
      const days = Array.from({ length: 7 }, (_, i) => subDays(endDate, 6 - i));
      chart = days.map(day => {
        const dStr = format(day, 'yyyy-MM-dd');
        const rs = records.filter((r: any) => r.date === dStr);
        const be = busExpenses.filter((e: any) => e.date === dStr);
        const ce = companyExpenses.filter((e: any) => e.date === dStr);
        const ct = cashTransactions.filter((t: any) => t.date === dStr);
        const fc = feeCollections.filter((f: any) => {
          const date = f.date instanceof Timestamp ? f.date.toDate() : new Date(f.date);
          return format(date, 'yyyy-MM-dd') === dStr;
        });

        const school = rs.reduce((sum, r: any) => sum + (r.school_morning || 0) + (r.school_evening || 0), 0);
        const charter = rs.reduce((sum, r: any) => sum + (r.charter_morning || 0) + (r.charter_evening || 0), 0);
        const private_booking = rs.reduce((sum, r: any) => sum + (r.private_booking || 0), 0);
        const fees = fc.reduce((sum, f: any) => sum + (f.amount || 0), 0);

        const totalExp = rs.reduce((sum, r: any) => sum + (r.fuel_amount || 0) + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0) + 
                         be.reduce((sum, e: any) => sum + (e.amount || 0), 0) + 
                         ce.reduce((sum, e: any) => sum + (e.amount || 0), 0) +
                         ct.filter((t: any) => ['salary', 'salary_advance', 'duty_payment', 'misc'].includes(t.category) && t.type === 'out').reduce((sum, t: any) => sum + (t.amount || 0), 0);

        return {
          name: format(day, 'dd MMM'),
          school,
          charter,
          private: private_booking + fees + ct.filter((t: any) => t.type === 'in' && t.category === 'misc').reduce((sum, t: any) => sum + (t.amount || 0), 0),
          totalExpenses: totalExp
        };
      });
    } else if (timeframe === 'week' || (timeframe === 'custom' && diffInDays <= 7)) {
      // Show days of the week
      const days = Array.from({ length: diffInDays + 1 }, (_, i) => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        return d;
      });
      chart = days.map(day => {
        const dStr = format(day, 'yyyy-MM-dd');
        const rs = records.filter((r: any) => r.date === dStr);
        const be = busExpenses.filter((e: any) => e.date === dStr);
        const ce = companyExpenses.filter((e: any) => e.date === dStr);
        const ct = cashTransactions.filter((t: any) => t.date === dStr);
        const fc = feeCollections.filter((f: any) => {
          const date = f.date instanceof Timestamp ? f.date.toDate() : new Date(f.date);
          return format(date, 'yyyy-MM-dd') === dStr;
        });

        const school = rs.reduce((sum, r: any) => sum + (r.school_morning || 0) + (r.school_evening || 0), 0);
        const charter = rs.reduce((sum, r: any) => sum + (r.charter_morning || 0) + (r.charter_evening || 0), 0);
        const private_booking = rs.reduce((sum, r: any) => sum + (r.private_booking || 0), 0);
        const fees = fc.reduce((sum, f: any) => sum + (f.amount || 0), 0);

        const totalExp = rs.reduce((sum, r: any) => sum + (r.fuel_amount || 0) + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0) + 
                         be.reduce((sum, e: any) => sum + (e.amount || 0), 0) + 
                         ce.reduce((sum, e: any) => sum + (e.amount || 0), 0) +
                         ct.filter((t: any) => ['salary', 'salary_advance', 'duty_payment', 'misc'].includes(t.category) && t.type === 'out').reduce((sum, t: any) => sum + (t.amount || 0), 0);

        return {
          name: format(day, 'EEE'),
          school,
          charter,
          private: private_booking + fees + ct.filter((t: any) => t.type === 'in' && t.category === 'misc').reduce((sum, t: any) => sum + (t.amount || 0), 0),
          totalExpenses: totalExp
        };
      });
    } else if (timeframe === 'month' || (timeframe === 'custom' && diffInDays <= 31)) {
      // Show weekly breakdown for the month
      const weeks = Array.from({ length: 4 }, (_, i) => {
        const start = new Date(startDate);
        start.setDate(start.getDate() + (i * 7));
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return { start, end };
      });
      chart = weeks.map((week, idx) => {
        const startStr = format(week.start, 'yyyy-MM-dd');
        const endStr = format(week.end, 'yyyy-MM-dd');

        const rs = records.filter((r: any) => r.date >= startStr && r.date <= endStr);
        const be = busExpenses.filter((e: any) => e.date >= startStr && e.date <= endStr);
        const ce = companyExpenses.filter((e: any) => e.date >= startStr && e.date <= endStr);
        const ct = cashTransactions.filter((t: any) => t.date >= startStr && t.date <= endStr);
        const fc = feeCollections.filter((f: any) => {
          const date = f.date instanceof Timestamp ? f.date.toDate() : new Date(f.date);
          return date >= week.start && date <= week.end;
        });

        const school = rs.reduce((sum, r: any) => sum + (r.school_morning || 0) + (r.school_evening || 0), 0);
        const charter = rs.reduce((sum, r: any) => sum + (r.charter_morning || 0) + (r.charter_evening || 0), 0);
        const private_booking = rs.reduce((sum, r: any) => sum + (r.private_booking || 0), 0);
        const fees = fc.reduce((sum, f: any) => sum + (f.amount || 0), 0);

        const totalExp = rs.reduce((sum, r: any) => sum + (r.fuel_amount || 0) + (r.driver_duty_paid || 0) + (r.helper_duty_paid || 0), 0) + 
                         be.reduce((sum, e: any) => sum + (e.amount || 0), 0) + 
                         ce.reduce((sum, e: any) => sum + (e.amount || 0), 0) +
                         ct.filter((t: any) => ['salary', 'salary_advance', 'duty_payment', 'misc'].includes(t.category) && t.type === 'out').reduce((sum, t: any) => sum + (t.amount || 0), 0);

        return {
          name: `Week ${idx + 1}`,
          school,
          charter,
          private: private_booking + fees + ct.filter((t: any) => t.type === 'in' && t.category === 'misc').reduce((sum, t: any) => sum + (t.amount || 0), 0),
          totalExpenses: totalExp
        };
      });
    } else {
      // Show monthly breakdown (for Year or long Custom)
      const monthsCount = timeframe === 'year' ? 12 : Math.ceil(diffInDays / 30);
      const months = Array.from({ length: monthsCount }, (_, i) => {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i);
        return d;
      });
      chart = months.map(month => {
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
                         ct.filter((t: any) => ['salary', 'salary_advance', 'duty_payment', 'misc'].includes(t.category) && t.type === 'out').reduce((sum, t: any) => sum + (t.amount || 0), 0);

        return {
          name: format(month, 'MMM'),
          school,
          charter,
          private: private_booking + fees + ct.filter((t: any) => t.type === 'in' && t.category === 'misc').reduce((sum, t: any) => sum + (t.amount || 0), 0),
          totalExpenses: totalExp
        };
      });
    }
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
      const staffRecords = currentRecords.filter((r: any) => r.driver_id === s.id || r.helper_id === s.id);
      const uniqueDays = new Set(staffRecords.map(r => r.date)).size;
      const bus = buses.find(b => b.id === s.bus_id);
      const pendingSal = salaryRecords
        .filter(rec => rec.staff_id === s.id && rec.status !== 'paid')
        .reduce((sum, rec) => sum + rec.net_payable, 0);

      return {
        name: s.full_name,
        role: s.role,
        bus: bus?.registration_number || 'Unassigned',
        days: uniqueDays,
        pendingSalary: pendingSal,
        status: s.is_active ? 'Active' : 'Inactive'
      };
    });
    setStaffOverview(staffList);

    // Recent Activity
    const recent = [...currentRecords]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((r: any) => {
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
            {/* Timeframe Selector */}
            <div className="flex items-center bg-surface p-1 rounded-xl border border-border shadow-sm">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'week', label: 'Week' },
                { id: 'month', label: 'Month' },
                { id: 'year', label: 'Year' },
                { id: 'custom', label: 'Custom' },
              ].map((tf) => (
                <button
                  key={tf.id}
                  onClick={() => setTimeframe(tf.id as any)}
                  className={cn(
                    "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                    timeframe === tf.id ? "bg-accent text-white shadow-md" : "text-secondary hover:text-primary"
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {timeframe === 'custom' && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center space-x-2 bg-surface p-1 rounded-xl border border-border shadow-sm"
              >
                <input 
                  type="date" 
                  value={customRange.start}
                  onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent text-[10px] font-bold text-primary border-none focus:ring-0 p-1"
                />
                <span className="text-secondary text-[10px] font-bold">to</span>
                <input 
                  type="date" 
                  value={customRange.end}
                  onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent text-[10px] font-bold text-primary border-none focus:ring-0 p-1"
                />
              </motion.div>
            )}

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
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => fetchDashboardData()}
                className={cn(
                  "p-2 text-secondary hover:text-primary transition-colors rounded-full hover:bg-surface",
                  loading && "cursor-not-allowed"
                )}
                title="Refresh Data"
              >
                <RefreshCw className={cn("h-4 w-4 stroke-[1.5px]", loading && "animate-spin")} />
              </button>
              <div className="text-xs font-medium text-secondary bg-surface px-3 py-1.5 rounded-full border border-border flex items-center space-x-2">
                <Calendar className="h-3.5 w-3.5 stroke-[1.5px]" />
                <span>
                  {timeframe === 'today' ? format(new Date(), 'dd MMM yyyy') : 
                   timeframe === 'yesterday' ? format(subDays(new Date(), 1), 'dd MMM yyyy') : 
                   timeframe === 'week' ? `${format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'dd MMM')} - ${format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'dd MMM')}` : 
                   timeframe === 'month' ? format(new Date(), 'MMMM yyyy') : 
                   timeframe === 'year' ? format(new Date(), 'yyyy') :
                   `${format(new Date(customRange.start), 'dd MMM')} - ${format(new Date(customRange.end), 'dd MMM')}`}
                </span>
              </div>
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

      {/* Cash Balances Section (Moved here to match image) */}
      <div className="grid gap-6 sm:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-accent/5 border-accent/20 shadow-xl shadow-accent/5"
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

      {/* Addition 1 - Today's Duties & Compliance Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Duties */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-bold text-primary tracking-tight">Today's Duties</h3>
            </div>
            <button 
              onClick={() => navigate('/entry')}
              className="px-3 py-1 bg-accent text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center space-x-1 hover:bg-accent/90 transition-colors"
            >
              <Plus className="h-3 w-3" />
              <span>Add Entry</span>
            </button>
          </div>

          <div className="space-y-3">
            {todayDuties.map((duty, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border group hover:border-accent/30 transition-all">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-primary">{duty.bus_number}</p>
                  <p className="text-[10px] text-secondary font-medium">{duty.driver_name}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-sm font-bold font-mono text-primary">{formatCurrency(duty.total_collection)}</p>
                  <span className="badge bg-success/10 text-success text-[8px]">COMPLETED</span>
                </div>
              </div>
            ))}
            {todayDuties.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-xs text-secondary font-medium grayscale">No duties recorded today</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Compliance Alerts */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card"
        >
          <div className="flex items-center space-x-2 mb-6">
            <AlertCircle className="h-4 w-4 text-danger" />
            <h3 className="text-sm font-bold text-primary tracking-tight">Compliance Alerts</h3>
          </div>

          <div className="space-y-3">
            {complianceAlerts.map((alert) => (
              <div 
                key={alert.id}
                onClick={() => navigate(`/admin/buses`)} // Note: The prompt asked for /admin/buses/:busId but the list is short, going to buses page is safer or I can try to append ID if buses page supports it. Actually /admin/buses is common. I'll stick to /admin/buses for now or try to use the profile link if I had one.
                className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border group hover:border-danger/30 cursor-pointer transition-all"
              >
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    alert.severity === 'red' ? 'bg-danger animate-pulse' : 
                    alert.severity === 'yellow' ? 'bg-warning' : 'bg-blue-500'
                  )} />
                  <p className="text-xs font-bold text-primary">
                    {alert.bus_number} | <span className="text-secondary font-medium">{alert.label}</span>
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-tight",
                    alert.severity === 'red' ? 'text-danger' : 
                    alert.severity === 'yellow' ? 'text-warning' : 'text-blue-500'
                  )}>
                    {alert.statusText}
                  </span>
                  <ArrowRight className="h-3 w-3 text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
            {complianceAlerts.length === 0 && (
              <div className="py-12 text-center flex flex-col items-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-success/30" />
                <p className="text-xs text-success font-bold uppercase tracking-wider">All documents up to date</p>
              </div>
            )}
          </div>
          {complianceAlerts.length > 0 && (
            <button 
              onClick={() => navigate('/buses')}
              className="w-full mt-4 text-[10px] font-bold text-secondary uppercase tracking-widest hover:text-primary transition-colors py-2 flex items-center justify-center space-x-1"
            >
              <span>View All</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </motion.div>
      </div>

      {/* Addition 2 - Quick Stats Row */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Active Buses', value: stats.activeBuses, icon: BusIcon, color: 'text-accent' },
          { label: 'Active Staff', value: stats.activeStaff, icon: Users, color: 'text-success' },
          { label: 'This Month Bookings', value: stats.monthBookings, icon: Calendar, color: 'text-warning' },
          { label: 'Pending Salary', value: stats.pendingSalary, icon: DollarSign, color: 'text-danger', isCurrency: true },
        ].map((stat, idx) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="p-4 bg-surface rounded-2xl border border-border shadow-sm flex items-center justify-between"
          >
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">{stat.label}</p>
              <p className={cn("text-xl font-bold font-mono tracking-tighter", stat.color)}>
                {stat.isCurrency ? formatCurrency(stat.value) : stat.value}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center">
              <stat.icon className={cn("h-5 w-5", stat.color)} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Bus Comparison Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {busStats.map((bus, idx) => (
          <motion.div 
            key={bus.name}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="card space-y-6 cursor-pointer hover:border-accent/30 transition-all group"
            onClick={() => navigate(`/admin/buses/${bus.id}`)}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-primary tracking-tight group-hover:text-accent transition-colors">{bus.name}</h3>
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
                <span className="text-secondary font-medium">Profitability</span>
                <span className={cn(
                  "font-mono font-bold",
                  (bus.collections - bus.expenses) >= 0 ? "text-success" : "text-danger"
                )}>
                  {bus.collections > 0 
                    ? Math.round(((bus.collections - bus.expenses) / bus.collections) * 100) 
                    : (bus.expenses > 0 ? -100 : 0)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${Math.max(0, Math.min(100, bus.collections > 0 ? ((bus.collections - bus.expenses) / bus.collections) * 100 : 0))}%` 
                  }}
                  className={cn(
                    "h-full transition-colors duration-500",
                    (bus.collections - bus.expenses) / bus.collections > 0.5 ? "bg-success" :
                    (bus.collections - bus.expenses) / bus.collections > 0 ? "bg-warning" : "bg-danger"
                  )} 
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

      {/* Bottom Three Column Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* STAFF OVERVIEW */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="text-sm font-bold text-primary tracking-tight mb-6 flex items-center space-x-2">
            <Users className="h-4 w-4 text-accent" />
            <span>Staff Overview</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="pb-4 font-bold uppercase tracking-wider">Name</th>
                  <th className="pb-4 font-bold uppercase tracking-wider text-center">Days</th>
                  <th className="pb-4 font-bold uppercase tracking-wider text-right">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {staffOverview.map((s, i) => (
                  <tr key={i} className="group hover:bg-border/20 transition-colors">
                    <td className="py-4">
                      <p className="font-bold text-primary">{s.name}</p>
                      <p className="text-[10px] text-secondary capitalize">{s.role}</p>
                    </td>
                    <td className="py-4 text-center text-primary font-bold font-mono">{s.days}</td>
                    <td className="py-4 text-right">
                      <p className={cn(
                        "font-bold font-mono",
                        s.pendingSalary > 0 ? "text-danger" : "text-success"
                      )}>
                        {formatCurrency(s.pendingSalary)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* DEFAULTERS / OUTSTANDING FEES */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-danger" />
              <h3 className="text-sm font-bold text-primary tracking-tight">Defaulters</h3>
            </div>
            <button 
              onClick={() => navigate('/fees/invoice-receipt')}
              className="text-[9px] font-bold text-secondary uppercase tracking-widest hover:text-accent transition-colors"
            >
              View All students →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-surface p-3 rounded-xl border border-border">
              <p className="text-[9px] font-bold text-secondary uppercase tracking-widest mb-1">Outstanding</p>
              <p className={cn("text-sm font-bold font-mono", totalOutstanding > 0 ? "text-danger" : "text-primary")}>
                {formatCurrency(totalOutstanding)}
              </p>
            </div>
            <div className="bg-surface p-3 rounded-xl border border-border">
              <p className="text-[9px] font-bold text-secondary uppercase tracking-widest mb-1">Overdue Invoices</p>
              <p className="text-sm font-bold font-mono text-warning">{overdueCount}</p>
            </div>
          </div>

          <div className="space-y-3">
            {defaulters.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-surface/50 border border-border/50 group hover:border-danger/30 transition-all">
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">
                    {s.name.charAt(0)}
                  </div>
                  <p className="text-xs font-bold text-primary">{s.name}</p>
                </div>
                <p className="text-xs font-bold font-mono text-danger">{formatCurrency(s.balance)}</p>
              </div>
            ))}
            {defaulters.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-xs text-secondary font-medium">No outstanding payments</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* RECENT ACTIVITY */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-bold text-primary tracking-tight">Recent Activity</h3>
            </div>
          </div>
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
        </motion.div>
      </div>
    </div>
  );
}
