import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  Timestamp
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Invoice, Receipt, Student, School } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area
} from 'recharts';
import { 
  Calendar, 
  Filter, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  School as SchoolIcon,
  MapPin,
  Phone,
  MessageSquare,
  ExternalLink,
  Search,
  FileText,
  DollarSign
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, isAfter, isBefore, parse, isValid, differenceInMonths, eachMonthOfInterval } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { StudentProfileModal } from '../components/StudentProfileModal';

const ACCENT_PURPLE = '#7C3AED';
const COLORS = [ACCENT_PURPLE, '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#8B5CF6'];

type DateRange = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'custom';

export function FeeAnalysis() {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('this-month');
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  
  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<string[]>(['overview', 'school', 'stand', 'defaulters', 'trends']);

  // Modals
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<Student | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const unsubInvoices = onSnapshot(collection(db, 'invoices'), (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invoices'));

    const unsubReceipts = onSnapshot(collection(db, 'receipts'), (snapshot) => {
      setReceipts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'receipts'));

    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));

    const unsubSchools = onSnapshot(collection(db, 'schools'), (snapshot) => {
      setSchools(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as School)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'schools'));

    setLoading(false);
    return () => {
      unsubInvoices();
      unsubReceipts();
      unsubStudents();
      unsubSchools();
    };
  }, [profile]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  // Date Range Logic
  const period = useMemo(() => {
    const today = new Date();
    let start: Date;
    let end: Date = endOfMonth(today);

    switch (dateRange) {
      case 'this-month':
        start = startOfMonth(today);
        break;
      case 'last-month':
        start = startOfMonth(subMonths(today, 1));
        end = endOfMonth(subMonths(today, 1));
        break;
      case 'last-3':
        start = startOfMonth(subMonths(today, 2));
        break;
      case 'last-6':
        start = startOfMonth(subMonths(today, 5));
        break;
      case 'custom':
        start = new Date(customStart);
        end = new Date(customEnd);
        break;
      default:
        start = startOfMonth(today);
    }
    return { start, end };
  }, [dateRange, customStart, customEnd]);

  // Filtered Data
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const date = inv.createdAt?.toDate() || new Date();
      return date >= period.start && date <= period.end;
    });
  }, [invoices, period]);

  const filteredReceipts = useMemo(() => {
    return receipts.filter(rcp => {
      const date = rcp.paymentDate?.toDate() || new Date();
      return date >= period.start && date <= period.end;
    });
  }, [receipts, period]);

  // Stat Calculations
  const stats = useMemo(() => {
    const thisMonthStart = startOfMonth(new Date());
    const capturedThisMonth = receipts
      .filter(r => r.paymentDate?.toDate() >= thisMonthStart)
      .reduce((sum, r) => sum + r.amountReceived, 0);

    const outstanding = students.reduce((sum, s) => sum + (s.totalBalance || 0), 0);
    const activeCount = students.filter(s => s.isActive).length;

    // Defaulters: Students with totalBalance >= 2 * feeAmount (approx 2 months unpaid)
    const defaulters = students.filter(s => s.isActive && (s.totalBalance || 0) >= (s.feeAmount * 2));

    return {
      collectedThisMonth: capturedThisMonth,
      outstanding,
      activeCount,
      defaulterCount: defaulters.length
    };
  }, [receipts, students]);

  // Section 1: Collection Overview Data
  const collectionOverviewData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date()
    });

    let cumulativeTotal = 0;
    return months.map(month => {
      const monthStr = format(month, 'MMM yyyy');
      const invs = invoices.filter(i => i.month === format(month, 'MMMM yyyy'));
      const rcps = receipts.filter(r => {
        const d = r.paymentDate?.toDate();
        return d && format(d, 'MMM yyyy') === monthStr;
      });

      const invoiced = invs.reduce((sum, i) => sum + i.totalAmount, 0);
      const collected = rcps.reduce((sum, r) => sum + r.amountReceived, 0);
      cumulativeTotal += collected;

      return {
        name: format(month, 'MMM'),
        fullName: monthStr,
        invoiced,
        collected,
        outstanding: Math.max(0, invoiced - collected),
        cumulative: cumulativeTotal
      };
    });
  }, [invoices, receipts]);

  const feeTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    filteredReceipts.forEach(r => {
      const type = r.feeType || 'Other';
      types[type] = (types[type] || 0) + r.amountReceived;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [filteredReceipts]);

  const collectedByData = useMemo(() => {
    const sources: Record<string, number> = {};
    filteredReceipts.forEach(r => {
      const source = r.receivedBy || 'Unknown';
      sources[source] = (sources[source] || 0) + r.amountReceived;
    });
    return Object.entries(sources).map(([name, value]) => ({ name, value }));
  }, [filteredReceipts]);

  // Section 2: School Wise Breakdown
  const schoolBreakdown = useMemo(() => {
    const data: Record<string, { collected: number, outstanding: number, invoiced: number, studentCount: number }> = {};
    
    // Use students to get all schools and their student counts
    students.forEach(s => {
      const school = s.schoolName || 'Other';
      if (!data[school]) data[school] = { collected: 0, outstanding: 0, invoiced: 0, studentCount: 0 };
      if (s.isActive) data[school].studentCount++;
      data[school].outstanding += (s.totalBalance || 0);
    });

    // Use filtered invoices for invoiced amounts
    filteredInvoices.forEach(inv => {
      const school = inv.schoolName || 'Other';
      if (!data[school]) data[school] = { collected: 0, outstanding: 0, invoiced: 0, studentCount: 0 };
      data[school].invoiced += inv.totalAmount;
    });

    // Use filtered receipts for collected amounts
    filteredReceipts.forEach(rcp => {
      const student = students.find(s => s.id === rcp.studentId);
      const school = student?.schoolName || 'Other';
      if (!data[school]) data[school] = { collected: 0, outstanding: 0, invoiced: 0, studentCount: 0 };
      data[school].collected += rcp.amountReceived;
    });

    return Object.entries(data).map(([school, stats]) => ({
      school,
      ...stats,
      rate: stats.invoiced > 0 ? (stats.collected / stats.invoiced) * 100 : 0
    })).sort((a, b) => b.invoiced - a.invoiced);
  }, [filteredInvoices, filteredReceipts, students]);

  // Section 3: Stand Wise Breakdown
  const standBreakdown = useMemo(() => {
    const data: Record<string, { school: string, collected: number, outstanding: number, invoiced: number, studentCount: number }> = {};
    
    students.forEach(s => {
      const stand = s.standName || 'Direct';
      if (!data[stand]) data[stand] = { school: s.schoolName, collected: 0, outstanding: 0, invoiced: 0, studentCount: 0 };
      if (s.isActive) data[stand].studentCount++;
      data[stand].outstanding += (s.totalBalance || 0);
    });

    filteredInvoices.forEach(inv => {
      const stand = inv.standName || 'Direct';
      if (!data[stand]) data[stand] = { school: inv.schoolName, collected: 0, outstanding: 0, invoiced: 0, studentCount: 0 };
      data[stand].invoiced += inv.totalAmount;
    });

    filteredReceipts.forEach(rcp => {
      const student = students.find(s => s.id === rcp.studentId);
      const stand = student?.standName || 'Direct';
      if (!data[stand]) data[stand] = { school: student?.schoolName || 'No School', collected: 0, outstanding: 0, invoiced: 0, studentCount: 0 };
      data[stand].collected += rcp.amountReceived;
    });

    return Object.entries(data).map(([stand, stats]) => ({
      stand,
      ...stats,
      rate: stats.invoiced > 0 ? (stats.collected / stats.invoiced) * 100 : 0
    })).sort((a, b) => b.invoiced - a.invoiced);
  }, [filteredInvoices, filteredReceipts, students]);

  // Section 4: Defaulters
  const [defaulterFilter, setDefaulterFilter] = useState('2+');
  const [defaulterSchool, setDefaulterSchool] = useState('all');
  const [defaulterStand, setDefaulterStand] = useState('all');
  const [defaulterSearch, setDefaulterSearch] = useState('');
  const [defaulterSort, setDefaulterSort] = useState<'months' | 'amount'>('months');

  const defaultersList = useMemo(() => {
    const minMonths = parseInt(defaulterFilter);
    return students
      .filter(s => {
        if (!s.isActive) return false;
        const unpaidMonths = s.feeAmount > 0 ? Math.floor(s.totalBalance / s.feeAmount) : 0;
        const matchesMonths = unpaidMonths >= minMonths;
        const matchesSchool = defaulterSchool === 'all' || s.schoolName === defaulterSchool;
        const matchesStand = defaulterStand === 'all' || s.standName === defaulterStand;
        const matchesSearch = s.studentName.toLowerCase().includes(defaulterSearch.toLowerCase()) || 
                             s.fatherName.toLowerCase().includes(defaulterSearch.toLowerCase());
        return matchesMonths && matchesSchool && matchesStand && matchesSearch && s.totalBalance > 0;
      })
      .map(s => ({
        ...s,
        unpaidMonthsCount: s.feeAmount > 0 ? Math.floor(s.totalBalance / s.feeAmount) : 0
      }))
      .sort((a, b) => {
        if (defaulterSort === 'months') return b.unpaidMonthsCount - a.unpaidMonthsCount;
        return b.totalBalance - a.totalBalance;
      });
  }, [students, defaulterFilter, defaulterSchool, defaulterStand, defaulterSearch, defaulterSort]);

  // Section 5: Payment Mode Trends
  const paymentModeTrends = useMemo(() => {
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date()
    });

    return months.map(month => {
      const monthStr = format(month, 'MMM yyyy');
      const rcps = receipts.filter(r => {
        const d = r.paymentDate?.toDate();
        return d && format(d, 'MMM yyyy') === monthStr;
      });

      const modes: Record<string, number> = { Cash: 0, UPI: 0, 'Bank Transfer': 0 };
      rcps.forEach(r => {
        if (r.paymentMode in modes) {
          modes[r.paymentMode] += r.amountReceived;
        } else {
          // If other modes exist
          modes['Other'] = (modes['Other'] || 0) + r.amountReceived;
        }
      });

      return {
        name: format(month, 'MMM'),
        ...modes
      };
    });
  }, [receipts]);

  const paymentModeSummary = useMemo(() => {
    const total = filteredReceipts.reduce((sum, r) => sum + r.amountReceived, 0);
    const modes: Record<string, { amount: number, count: number }> = {};
    
    filteredReceipts.forEach(r => {
      const m = r.paymentMode || 'Unknown';
      if (!modes[m]) modes[m] = { amount: 0, count: 0 };
      modes[m].amount += r.amountReceived;
      modes[m].count++;
    });

    return Object.entries(modes).map(([mode, stats]) => ({
      mode,
      ...stats,
      percentage: total > 0 ? (stats.amount / total) * 100 : 0
    })).sort((a, b) => b.amount - a.amount);
  }, [filteredReceipts]);

  // Export Logic
  const handleExportCSV = () => {
    if (profile?.role === 'accountant') return; // Restriction

    const data = defaultersList.map(s => ({
      'Student Name': s.studentName,
      'Father Name': s.fatherName,
      'School': s.schoolName,
      'Stand': s.standName,
      'Phone': s.phoneNumber,
      'Unpaid Months': s.unpaidMonthsCount,
      'Outstanding': s.totalBalance,
      'Fee Amount': s.feeAmount
    }));

    if (data.length === 0) return alert('No data to export');

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => row[h as keyof typeof row]).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `defaulters_list_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sendWhatsAppReminder = (student: any) => {
    const message = `Dear ${student.fatherName}, This is a reminder that transport fees for ${student.studentName} are overdue for ${student.unpaidMonthsCount} months. Total outstanding amount: ₹${student.totalBalance}. Kindly clear your dues at earliest. Thank you. - Jagriti Tours & Travels`;
    const url = `https://web.whatsapp.com/send?phone=91${student.phoneNumber}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Rendering
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-primary tracking-tight">Tracking & Analysis</h2>
          <p className="text-secondary font-medium">Financial insights and collection performance</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center bg-surface border border-border p-1 rounded-xl shadow-sm">
            {(['this-month', 'last-month', 'last-3', 'last-6', 'custom'] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={cn(
                  "px-4 py-2 text-xs font-bold rounded-lg transition-all capitalize",
                  dateRange === range ? "bg-accent text-white shadow-md" : "text-secondary hover:text-primary"
                )}
              >
                {range.replace('-', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            disabled={profile?.role === 'accountant'}
            className="btn-primary flex items-center space-x-2 shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {dateRange === 'custom' && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-4 bg-surface p-4 rounded-2xl border border-border"
        >
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">Start Date</label>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input !bg-background" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">End Date</label>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input !bg-background" />
          </div>
        </motion.div>
      )}

      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Collected This Month" 
          value={formatCurrency(stats.collectedThisMonth)} 
          subLabel={`${filteredReceipts.length} successful payments`}
          icon={TrendingUp} 
          color="success" 
        />
        <StatCard 
          label="Total Outstanding" 
          value={formatCurrency(stats.outstanding)} 
          subLabel="Total receivables from all students"
          icon={AlertTriangle} 
          color="danger" 
        />
        <StatCard 
          label="Active Students" 
          value={stats.activeCount.toString()} 
          subLabel="Currently using transport service"
          icon={Users} 
          color="accent" 
        />
        <StatCard 
          label="Defaulters" 
          value={stats.defaulterCount.toString()} 
          subLabel="Students with 2+ months unpaid"
          icon={TrendingDown} 
          color="warning" 
        />
      </div>

      {/* Section 1: Collection Overview */}
      <AnalysisSection 
        id="overview" 
        title="Collection Overview" 
        isExpanded={expandedSections.includes('overview')} 
        onToggle={() => toggleSection('overview')}
      >
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-6">
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={collectionOverviewData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Legend iconType="circle" />
                  <Bar dataKey="invoiced" name="Invoiced" fill="#93C5FD" radius={[6, 6, 0, 0]} barSize={20} />
                  <Bar dataKey="collected" name="Collected" fill={ACCENT_PURPLE} radius={[6, 6, 0, 0]} barSize={20} />
                  <Line type="monotone" dataKey="cumulative" name="Cumulative Collection" stroke="#10B981" strokeWidth={3} dot={{ fill: '#10B981', r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-surface border border-border">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest italic mb-1">Period Invoiced</p>
                <p className="text-xl font-black text-primary">{formatCurrency(filteredInvoices.reduce((s, i) => s + i.totalAmount, 0))}</p>
              </div>
              <div className="p-4 rounded-2xl bg-surface border border-border">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest italic mb-1">Period Collected</p>
                <p className="text-xl font-black text-success">{formatCurrency(filteredReceipts.reduce((s, r) => s + r.amountReceived, 0))}</p>
              </div>
              <div className="p-4 rounded-2xl bg-surface border border-border">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest italic mb-1">Collection Rate</p>
                <p className="text-xl font-black text-accent">
                  {filteredInvoices.length > 0 
                    ? ((filteredReceipts.reduce((s, r) => s + r.amountReceived, 0) / filteredInvoices.reduce((s, i) => s + i.totalAmount, 1)) * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <h4 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-accent" />
                Fee Type Breakdown
              </h4>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={feeTypeData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {feeTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {feeTypeData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-medium text-secondary">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                      {d.name}
                    </div>
                    <span className="font-bold text-primary">{formatCurrency(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" />
                Collected By Breakdown
              </h4>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={collectedByData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {collectedByData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {collectedByData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-medium text-secondary">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(i + 3) % COLORS.length] }}></div>
                      {d.name}
                    </div>
                    <span className="font-bold text-primary">{formatCurrency(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AnalysisSection>

      {/* Section 2: School Breakdown */}
      <AnalysisSection 
        id="school" 
        title="School-wise Performance" 
        isExpanded={expandedSections.includes('school')} 
        onToggle={() => toggleSection('school')}
      >
        <div className="space-y-8">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={schoolBreakdown} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" hide />
                <YAxis dataKey="school" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#4B5563', fontWeight: 'bold' }} />
                <Tooltip />
                <Bar dataKey="collected" name="Collected" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="outstanding" name="Outstanding" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="overflow-x-auto border border-border rounded-2xl">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>School Name</th>
                  <th className="text-center">Students</th>
                  <th className="text-right">Invoiced</th>
                  <th className="text-right">Collected</th>
                  <th className="text-right">Outstanding</th>
                  <th className="text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {schoolBreakdown.map((s, idx) => (
                  <tr key={idx} className="hover:bg-accent/5">
                    <td className="font-bold text-primary">{s.school}</td>
                    <td className="text-center font-medium text-secondary">{s.studentCount}</td>
                    <td className="text-right font-bold text-primary">{formatCurrency(s.invoiced)}</td>
                    <td className="text-right font-bold text-success">{formatCurrency(s.collected)}</td>
                    <td className="text-right font-bold text-danger">{formatCurrency(s.outstanding)}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-border h-1.5 rounded-full overflow-hidden">
                          <div className="bg-accent h-full" style={{ width: `${Math.min(100, s.rate)}%` }}></div>
                        </div>
                        <span className="text-xs font-black text-accent">{s.rate.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AnalysisSection>

      {/* Section 3: Stand Breakdown */}
      <AnalysisSection 
        id="stand" 
        title="Stand/Route Analysis" 
        isExpanded={expandedSections.includes('stand')} 
        onToggle={() => toggleSection('stand')}
      >
        <div className="overflow-x-auto border border-border rounded-2xl">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Stand/Route Name</th>
                <th>Main School</th>
                <th className="text-center">Active Students</th>
                <th className="text-right">Period Collected</th>
                <th className="text-right">Total Outstanding</th>
                <th className="text-right">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {standBreakdown.map((s, idx) => (
                <tr key={idx} className="hover:bg-accent/5">
                  <td className="font-bold text-primary">{s.stand}</td>
                  <td className="text-xs text-secondary italic">{s.school}</td>
                  <td className="text-center font-medium text-secondary">{s.studentCount}</td>
                  <td className="text-right font-bold text-success">{formatCurrency(s.collected)}</td>
                  <td className="text-right font-bold text-danger">{formatCurrency(s.outstanding)}</td>
                  <td className="text-right">
                    <span className={cn(
                      "badge text-[10px]",
                      s.rate >= 80 ? "bg-success/10 text-success" : 
                      s.rate >= 50 ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"
                    )}>
                      {s.rate.toFixed(0)}% Collected
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AnalysisSection>

      {/* Section 4: Defaulters */}
      <AnalysisSection 
        id="defaulters" 
        title="Defaulters Management" 
        badge={`${defaultersList.length} Students`}
        isExpanded={expandedSections.includes('defaulters')} 
        onToggle={() => toggleSection('defaulters')}
      >
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row gap-4 p-4 bg-background rounded-2xl border border-border">
             <div className="flex-1 relative">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
               <input 
                 type="text" 
                 placeholder="Search student or father name..." 
                 value={defaulterSearch}
                 onChange={e => setDefaulterSearch(e.target.value)}
                 className="input pl-10 w-full"
               />
             </div>
             <div className="flex flex-wrap items-center gap-3">
               <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-xl border border-border">
                 <span className="text-[10px] font-bold text-secondary uppercase">Unpaid Months:</span>
                 <select value={defaulterFilter} onChange={e => setDefaulterFilter(e.target.value)} className="bg-transparent text-xs font-black text-primary focus:outline-none">
                    <option value="1+">1+</option>
                    <option value="2+">2+</option>
                    <option value="3+">3+</option>
                    <option value="4+">4+</option>
                 </select>
               </div>
               <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-xl border border-border">
                 <span className="text-[10px] font-bold text-secondary uppercase">School:</span>
                 <select value={defaulterSchool} onChange={e => setDefaulterSchool(e.target.value)} className="bg-transparent text-xs font-black text-primary focus:outline-none max-w-[150px]">
                    <option value="all">All Schools</option>
                    {schools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                 </select>
               </div>
               <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-xl border border-border">
                 <span className="text-[10px] font-bold text-secondary uppercase">Sort:</span>
                 <select 
                   value={defaulterSort} 
                   onChange={e => setDefaulterSort(e.target.value as any)} 
                   className="bg-transparent text-xs font-black text-primary focus:outline-none"
                 >
                    <option value="months">Most Months</option>
                    <option value="amount">Highest Amount</option>
                 </select>
               </div>
             </div>
          </div>

          <div className="overflow-x-auto border border-border rounded-2xl">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Student Info</th>
                  <th>School & Stand</th>
                  <th className="text-center">Unpaid Months</th>
                  <th className="text-right">Total Outstanding</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {defaultersList.map((s) => (
                  <tr key={s.id} className="hover:bg-accent/5">
                    <td>
                      <div className="flex flex-col">
                        <span className="font-bold text-primary">{s.studentName}</span>
                        <span className="text-[10px] text-secondary font-bold uppercase tracking-wider italic">Father: {s.fatherName}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs font-medium text-secondary">
                        <div className="flex items-center gap-1.5">
                          <SchoolIcon className="h-3 w-3" />
                          <span>{s.schoolName}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" />
                          <span>{s.standName}</span>
                        </div>
                      </div>
                    </td>
                    <td className="text-center">
                      <span className={cn(
                        "badge font-black",
                        s.unpaidMonthsCount >= 3 ? "bg-danger text-white border-none" : "bg-warning/10 text-warning"
                      )}>
                        {s.unpaidMonthsCount} Months
                      </span>
                    </td>
                    <td className="text-right font-black text-danger font-mono text-base">
                      {formatCurrency(s.totalBalance)}
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => {
                            setSelectedStudentForProfile(s);
                            setIsProfileModalOpen(true);
                          }}
                          className="p-2 text-secondary hover:text-accent hover:bg-accent/10 rounded-xl transition-all"
                          title="View Profile"
                        >
                          <Users className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => sendWhatsAppReminder(s)}
                          className="p-2 text-secondary hover:text-success hover:bg-success/10 rounded-xl transition-all"
                          title="WhatsApp Reminder"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                        <a 
                          href={`tel:${s.phoneNumber}`}
                          className="p-2 text-secondary hover:text-primary hover:bg-border rounded-xl transition-all"
                          title="Call"
                        >
                          <Phone className="h-4 w-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AnalysisSection>

      {/* Section 5: Payment Trends */}
      <AnalysisSection 
        id="trends" 
        title="Payment Mode Trends" 
        isExpanded={expandedSections.includes('trends')} 
        onToggle={() => toggleSection('trends')}
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentModeTrends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip />
                <Legend iconType="rect" />
                <Bar dataKey="Cash" fill="#10B981" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="UPI" fill={ACCENT_PURPLE} stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Bank Transfer" fill="#F59E0B" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto border border-border rounded-2xl h-fit">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th className="text-center">Count</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paymentModeSummary.map((s, idx) => (
                  <tr key={idx} className="hover:bg-accent/5">
                    <td className="font-bold text-primary">{s.mode}</td>
                    <td className="text-center font-medium text-secondary">{s.count}</td>
                    <td className="text-right font-bold text-primary">{formatCurrency(s.amount)}</td>
                    <td className="text-right">
                       <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-border h-1.5 rounded-full overflow-hidden">
                          <div className={cn(
                            "h-full",
                            s.mode === 'Cash' ? "bg-success" : 
                            s.mode === 'UPI' ? "bg-accent" : "bg-warning"
                          )} style={{ width: `${s.percentage}%` }}></div>
                        </div>
                        <span className="text-xs font-black text-secondary">{s.percentage.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AnalysisSection>

      {/* Profile Modal Integration */}
      {selectedStudentForProfile && (
        <StudentProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          student={selectedStudentForProfile}
          onEdit={() => {
            alert('To edit student details, please use the Student Database page.');
            setIsProfileModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, subLabel, icon: Icon, color }: { 
  label: string; 
  value: string; 
  subLabel: string;
  icon: any; 
  color: 'success' | 'danger' | 'accent' | 'warning' 
}) {
  const colors = {
    success: 'bg-success/10 text-success border-success/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
    accent: 'bg-accent/10 text-accent border-accent/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
  };

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="card bg-surface flex items-start justify-between shadow-sm hover:shadow-md transition-all group border-b-4 border-b-transparent hover:border-b-accent"
    >
      <div className="space-y-3">
        <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">{label}</p>
        <div className="space-y-1">
          <p className="text-3xl font-black text-primary tracking-tight font-mono">{value}</p>
          <p className="text-[10px] text-secondary font-medium italic">{subLabel}</p>
        </div>
      </div>
      <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", colors[color])}>
        <Icon className="h-6 w-6 stroke-[1.5px]" />
      </div>
    </motion.div>
  );
}

function AnalysisSection({ 
  id, 
  title, 
  badge, 
  children, 
  isExpanded, 
  onToggle 
}: { 
  id: string; 
  title: string; 
  badge?: string; 
  children: React.ReactNode; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  return (
    <div className="card bg-surface overflow-hidden shadow-sm border border-border/50">
      <button 
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2 hover:bg-background/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="h-8 w-1 bg-accent rounded-full"></div>
          <h3 className="text-lg font-black text-primary tracking-tight uppercase flex items-center gap-3">
            {title}
            {badge && <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-bold">{badge}</span>}
          </h3>
        </div>
        <div className="p-2 text-secondary">
          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="p-6 border-t border-border bg-surface">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
