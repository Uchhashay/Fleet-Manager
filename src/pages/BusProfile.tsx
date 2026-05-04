import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  serverTimestamp, 
  orderBy, 
  onSnapshot,
  Timestamp 
} from 'firebase/firestore';
import { 
  Bus, 
  DailyRecord, 
  BusExpense, 
  BusMaintenanceRecord, 
  BusComment,
  Staff
} from '../types';
import { 
  BarChart3, 
  Calendar, 
  TrendingUp, 
  Fuel, 
  Wrench, 
  MessageSquare, 
  History, 
  ArrowLeft,
  Shield,
  Activity,
  Wind,
  Plus,
  Trash2,
  Edit3,
  Clock,
  User,
  MoreVertical,
  CheckCircle2,
  AlertTriangle,
  Info,
  DollarSign,
  Briefcase,
  StickyNote,
  Save,
  X
} from 'lucide-react';
import { format, subMonths, isWithinInterval, startOfMonth, endOfMonth, parseISO, differenceInDays } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Legend,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { logActivity } from '../lib/activity-logger';

type TabType = 'overview' | 'logbook' | 'expenses' | 'maintenance' | 'comments';

export default function BusProfile() {
  const { busId } = useParams<{ busId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [bus, setBus] = useState<Bus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [expenses, setExpenses] = useState<BusExpense[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<BusMaintenanceRecord[]>([]);
  const [comments, setComments] = useState<BusComment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  
  const [maintSubcategoryFilter, setMaintSubcategoryFilter] = useState('All');
  const [maintMonthFilter, setMaintMonthFilter] = useState('all');

  const [isNoteAddingOpen, setIsNoteAddingOpen] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<BusMaintenanceRecord | null>(null);

  const [maintFormData, setMaintFormData] = useState({
    category: 'maintenance_repairs',
    subcategory: 'Engine oil',
    paid_by: 'Owner' as 'Owner' | 'Accountant'
  });

  const subcategoryOptions: { [key: string]: string[] } = {
    maintenance_repairs: ['Engine oil', 'Steering oil', 'Tyres', 'Body work', 'CNG cylinder testing', 'Internal Mechanical Work', 'Internal Technical Work'],
    licensing_registration: ['CNG cylinder testing', 'Permit', 'Fitness', 'Vehicle Tax'],
    insurance: ['Comprehensive', 'Third Party', 'Renewal'],
    traffic_police: ['Entry', 'Challan', 'Crane']
  };

  const maintPills = [
    'All', 'Engine oil', 'Steering oil', 'Tyres', 'Body work', 'CNG cylinder testing', 
    'Internal Mechanical Work', 'Internal Technical Work', 'Permit', 
    'Fitness', 'Vehicle Tax', 'Insurance', 'Traffic Police'
  ];
  
  useEffect(() => {
    if (!busId) return;
    
    const fetchBus = async () => {
      try {
        const busDoc = await getDoc(doc(db, 'buses', busId));
        if (busDoc.exists()) {
          setBus({ id: busDoc.id, ...busDoc.data() } as Bus);
        } else {
          navigate('/admin/buses');
        }
      } catch (error) {
        console.error('Error fetching bus:', error);
      }
    };
    
    const fetchStaff = async () => {
      const staffSnap = await getDocs(collection(db, 'staff'));
      setStaff(staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));
    };

    fetchBus();
    fetchStaff();
  }, [busId, navigate]);

  useEffect(() => {
    if (!busId) return;

    // Daily Records
    const recordsQuery = query(
      collection(db, 'daily_records'),
      where('bus_id', '==', busId),
      where('date', '>=', dateRange.start),
      where('date', '<=', dateRange.end),
      orderBy('date', 'desc')
    );
    const unsubRecords = onSnapshot(recordsQuery, (snap) => {
      setDailyRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyRecord)));
    });

    // Expenses
    const expQuery = query(
      collection(db, 'bus_expenses'),
      where('bus_id', '==', busId),
      where('date', '>=', dateRange.start),
      where('date', '<=', dateRange.end),
      orderBy('date', 'desc')
    );
    const unsubExp = onSnapshot(expQuery, (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BusExpense)));
    });

    // Maintenance (Subcollection)
    const maintQuery = query(
      collection(db, 'buses', busId, 'maintenanceLog'),
      orderBy('date', 'desc')
    );
    const unsubMaint = onSnapshot(maintQuery, (snap) => {
      setMaintenanceRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BusMaintenanceRecord)));
    });

    // Comments (Subcollection)
    const commQuery = query(
      collection(db, 'buses', busId, 'comments'),
      orderBy('created_at', 'desc')
    );
    const unsubComm = onSnapshot(commQuery, (snap) => {
      setComments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BusComment)));
    });

    setLoading(false);

    return () => {
      unsubRecords();
      unsubExp();
      unsubMaint();
      unsubComm();
    };
  }, [busId, dateRange]);

  const stats = useMemo(() => {
    const totalCollection = dailyRecords.reduce((sum, r) => 
      sum + (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0), 0
    );
    const totalFuel = dailyRecords.reduce((sum, r) => sum + (r.fuel_amount || 0), 0);
    const totalDuties = dailyRecords.length;
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    
    const manualMaintSpent = maintenanceRecords.reduce((sum, m) => sum + (m.cost || 0), 0);
    const expenseMaintSpent = expenses.filter(e => 
      ['maintenance_repairs', 'licensing_registration', 'insurance', 'traffic_police'].includes(e.category)
    ).reduce((sum, e) => sum + (e.amount || 0), 0);
    
    const totalMaintSpent = manualMaintSpent + expenseMaintSpent;
    const netRevenue = totalCollection - totalFuel - totalExpenses;

    return { 
      totalCollection, 
      totalFuel, 
      totalDuties, 
      netRevenue, 
      totalExpenses,
      totalMaintSpent,
      manualMaintSpent,
      expenseMaintSpent
    };
  }, [dailyRecords, expenses, maintenanceRecords]);

  const mergedMaintenance = useMemo(() => {
    const manualSource = maintenanceRecords.map(m => ({
      id: m.id,
      date: m.date,
      type: m.type,
      subcategory: 'Manual Entry',
      description: m.description,
      cost: m.cost,
      source: 'manual' as const,
      workshop: m.workshop,
      odometer: m.odometer,
      next_service_date: m.next_service_date
    }));

    const expenseSource = expenses
      .filter(e => ['maintenance_repairs', 'licensing_registration', 'insurance', 'traffic_police'].includes(e.category))
      .map(e => ({
        id: e.id,
        date: e.date,
        type: e.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        subcategory: e.subcategory,
        description: e.description,
        cost: e.amount,
        source: 'expense' as const,
        workshop: '',
        odometer: 0,
        next_service_date: ''
      }));

    let combined = [...manualSource, ...expenseSource].sort((a, b) => b.date.localeCompare(a.date));

    if (maintSubcategoryFilter !== 'All') {
      combined = combined.filter(m => 
        m.subcategory.toLowerCase() === maintSubcategoryFilter.toLowerCase() ||
        m.type.toLowerCase().includes(maintSubcategoryFilter.toLowerCase())
      );
    }

    if (maintMonthFilter !== 'all') {
      combined = combined.filter(m => m.date.startsWith(maintMonthFilter));
    }

    return combined;
  }, [maintenanceRecords, expenses, maintSubcategoryFilter, maintMonthFilter]);

  const maintMonths = useMemo(() => {
    const months = new Set<string>();
    maintenanceRecords.forEach(m => months.add(m.date.substring(0, 7)));
    expenses.forEach(e => {
       if (['maintenance_repairs', 'licensing_registration', 'insurance', 'traffic_police'].includes(e.category)) {
         months.add(e.date.substring(0, 7));
       }
    });
    return Array.from(months).sort().reverse();
  }, [maintenanceRecords, expenses]);

  const handleStatusToggle = async () => {
    if (!bus || !busId) return;
    const newStatus = !bus.is_active;
    if (!confirm(`Are you sure you want to mark this bus as ${newStatus ? 'Active' : 'Inactive'}?`)) return;

    try {
      await updateDoc(doc(db, 'buses', busId), { is_active: newStatus });
      setBus({ ...bus, is_active: newStatus });
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Edited',
          'Fleet Management',
          `Changed status for bus ${bus.registration_number} to ${newStatus ? 'Active' : 'Inactive'}`
        );
      }
    } catch (error) {
      console.error('Error toggling status:', error);
    }
  };

  const performanceData = useMemo(() => {
    const months: { [key: string]: { name: string, revenue: number, expenses: number } } = {};
    
    // Last 6 months inclusive
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, 'MMM yyyy');
      months[key] = { name: key, revenue: 0, expenses: 0 };
    }

    dailyRecords.forEach(r => {
      const key = format(parseISO(r.date), 'MMM yyyy');
      if (months[key]) {
        months[key].revenue += (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0);
      }
    });

    expenses.forEach(e => {
      const key = format(parseISO(e.date), 'MMM yyyy');
      if (months[key]) {
        months[key].expenses += (e.amount || 0);
      }
    });

    return Object.values(months);
  }, [dailyRecords, expenses]);

  const handleUpdateNote = async (recordId: string) => {
    try {
      await updateDoc(doc(db, 'daily_records', recordId), { notes: noteValue });
      setIsNoteAddingOpen(null);
      setNoteValue('');
    } catch (error) {
      console.error('Error updating note:', error);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busId || !noteValue.trim() || !profile) return;

    try {
      await addDoc(collection(db, 'buses', busId, 'comments'), {
        text: noteValue,
        created_by: profile.full_name,
        created_by_role: profile.role,
        created_at: serverTimestamp()
      });
      setNoteValue('');
    } catch (error) {
       handleFirestoreError(error, OperationType.CREATE, 'bus_comments');
    }
  };

  if (loading || !bus) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
      </div>
    );
  }

  const insuranceExpDays = bus.insurance_expiry ? differenceInDays(parseISO(bus.insurance_expiry), new Date()) : 100;
  const fitnessExpDays = bus.fitness_expiry ? differenceInDays(parseISO(bus.fitness_expiry), new Date()) : 100;
  const permitExpDays = bus.permit_expiry ? differenceInDays(parseISO(bus.permit_expiry), new Date()) : 100;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
        <div className="space-y-4">
          <Link 
            to="/admin/buses" 
            className="flex items-center space-x-2 text-secondary hover:text-accent transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Back to Buses</span>
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-4xl font-bold tracking-tight text-primary">{bus.registration_number}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] px-2 py-1 rounded-lg bg-surface text-secondary border border-border uppercase font-bold tracking-tighter">
                {bus.bus_type || 'School Bus'} • {bus.capacity} Seats
              </span>
              <span className={cn(
                "text-[10px] px-2 py-1 rounded-lg border uppercase font-bold tracking-tighter",
                bus.ac_type === 'AC' ? "bg-accent/5 text-accent border-accent/20" : "bg-surface text-secondary border-border"
              )}>
                {bus.ac_type || 'Non-AC'}
              </span>
              <button
                onClick={handleStatusToggle}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-lg border uppercase font-bold tracking-tighter transition-all",
                  bus.is_active !== false 
                    ? "bg-success/10 text-success border-success/20 hover:bg-success/20" 
                    : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                )}
              >
                {bus.is_active !== false ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center bg-surface border border-border rounded-xl p-1 shadow-sm">
          {[
            { label: 'This Month', days: 30 },
            { label: 'Last 3 Months', days: 90 },
            { label: 'Last 6 Months', days: 180 }
          ].map((range) => (
            <button
              key={range.label}
              onClick={() => setDateRange({
                start: format(subMonths(new Date(), range.days / 30), 'yyyy-MM-dd'),
                end: format(new Date(), 'yyyy-MM-dd')
              })}
              className={cn(
                "px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                differenceInDays(new Date(), parseISO(dateRange.start)) === range.days
                  ? "bg-accent text-white shadow-md"
                  : "text-secondary hover:text-primary"
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-1 border-b border-border overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'logbook', label: 'Logbook', icon: History },
          { id: 'expenses', label: 'Expenses', icon: TrendingUp },
          { id: 'maintenance', label: 'Maintenance Log', icon: Wrench },
          { id: 'comments', label: 'Comments', icon: MessageSquare }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={cn(
              "flex items-center space-x-2 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative",
              activeTab === tab.id 
                ? "text-accent" 
                : "text-secondary hover:text-primary"
            )}
          >
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Summary Cards */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="card bg-accent text-white border-none shadow-xl shadow-accent/10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-2 opacity-80">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Total Collection</span>
                    </div>
                  </div>
                  <h3 className="text-3xl font-bold tracking-tighter font-mono">{formatCurrency(stats.totalCollection)}</h3>
                </div>
                <div className="card">
                  <div className="flex items-center space-x-2 text-secondary mb-6">
                    <Fuel className="h-4 w-4 text-warning" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Fuel Cost</span>
                  </div>
                  <h3 className="text-2xl font-bold text-primary tracking-tight font-mono">{formatCurrency(stats.totalFuel)}</h3>
                </div>
                <div className="card">
                  <div className="flex items-center space-x-2 text-secondary mb-6">
                    <Briefcase className="h-4 w-4 text-accent" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Duties Done</span>
                  </div>
                  <h3 className="text-2xl font-bold text-primary tracking-tight font-mono">{stats.totalDuties} Trips</h3>
                </div>
                <div className="card">
                  <div className="flex items-center space-x-2 text-secondary mb-6">
                    <DollarSign className={cn("h-4 w-4", stats.netRevenue >= 0 ? "text-success" : "text-danger")} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Net Revenue</span>
                  </div>
                  <h3 className={cn(
                    "text-2xl font-bold tracking-tight font-mono",
                    stats.netRevenue >= 0 ? "text-success" : "text-danger"
                  )}>{formatCurrency(stats.netRevenue)}</h3>
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-3">
                {/* Bus Details */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="card">
                    <h4 className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-6">Vehicle Details</h4>
                    <div className="space-y-4">
                      {[
                        { label: 'Registration', value: bus.registration_number },
                        { label: 'Model', value: bus.model },
                        { label: 'Type', value: bus.bus_type || 'School Bus' },
                        { label: 'Capacity', value: `${bus.capacity} Seater` },
                        { label: 'Climate', value: bus.ac_type || 'Non-AC' },
                        { label: 'Purchase Date', value: bus.purchase_date || 'Not Set' }
                      ].map((item) => (
                        <div key={item.label} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                          <span className="text-xs text-secondary font-medium">{item.label}</span>
                          <span className="text-xs font-bold text-primary">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <h4 className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-6">Document Compliance</h4>
                    <div className="space-y-4">
                      {[
                        { label: 'Insurance', date: bus.insurance_expiry, days: insuranceExpDays, icon: Shield },
                        { label: 'Fitness', date: bus.fitness_expiry, days: fitnessExpDays, icon: Activity },
                        { label: 'Permit', date: bus.permit_expiry, days: permitExpDays, icon: Wind }
                      ].map((doc) => (
                        <div key={doc.label} className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border">
                          <div className="flex items-center space-x-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              doc.days <= 0 ? "bg-danger/10 text-danger" : doc.days <= 30 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                            )}>
                              <doc.icon className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-primary uppercase">{doc.label}</p>
                                <p className="text-[9px] text-secondary font-medium">{doc.date || 'Exp: Not Set'}</p>
                            </div>
                          </div>
                          {doc.date && (
                             <span className={cn(
                               "text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-tighter",
                               doc.days <= 0 ? "bg-danger/10 text-danger" : doc.days <= 30 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                             )}>
                               {doc.days <= 0 ? 'Expired' : doc.days <= 30 ? `Due ${doc.days}d` : 'Valid'}
                             </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Revenue Trend & Driver History */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="card">
                    <h4 className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-6">Monthly Performance</h4>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={performanceData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                          <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                          <YAxis fontSize={10} axisLine={false} tickLine={false} />
                          <RechartsTooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                          />
                          <Bar dataKey="revenue" fill="#7C3AED" radius={[4, 4, 0, 0]} name="Collection" />
                          <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} name="Expenses" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="card">
                    <h4 className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-6">Driver History (Last 30 Days)</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-[10px] font-bold text-secondary uppercase tracking-widest bg-surface/50">
                          <tr>
                            <th className="px-4 py-3">Driver Name</th>
                            <th className="px-4 py-3">Days Driven</th>
                            <th className="px-4 py-3 text-right">Avg. Collection</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {Array.from(new Set(dailyRecords.map(r => r.driver_id))).filter(id => id).map(driverId => {
                            const driverRecords = dailyRecords.filter(r => r.driver_id === driverId);
                            const avgColl = driverRecords.reduce((sum, r) => 
                              sum + (r.school_morning || 0) + (r.school_evening || 0) + (r.charter_morning || 0) + (r.charter_evening || 0) + (r.private_booking || 0), 0
                            ) / driverRecords.length;
                            const driverName = staff.find(s => s.id === driverId)?.full_name || 'Unknown';
                            
                            return (
                              <tr key={driverId} className="hover:bg-surface/50 transition-colors">
                                <td className="px-4 py-4 font-bold text-primary">{driverName}</td>
                                <td className="px-4 py-4 text-xs text-secondary">{driverRecords.length} Days</td>
                                <td className="px-4 py-4 text-right font-mono font-bold text-success">{formatCurrency(avgColl)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logbook' && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid gap-4 sm:grid-cols-4">
                 <div className="card bg-surface/30 border-dashed p-4">
                    <p className="text-[9px] font-bold text-secondary uppercase mb-1">Collection</p>
                    <p className="text-lg font-bold text-primary font-mono">{formatCurrency(stats.totalCollection)}</p>
                 </div>
                 <div className="card bg-surface/30 border-dashed p-4">
                    <p className="text-[9px] font-bold text-secondary uppercase mb-1">Fuel Intake</p>
                    <p className="text-lg font-bold text-primary font-mono">{formatCurrency(stats.totalFuel)}</p>
                 </div>
                 <div className="card bg-surface/30 border-dashed p-4">
                    <p className="text-[9px] font-bold text-secondary uppercase mb-1">Days in Service</p>
                    <p className="text-lg font-bold text-primary font-mono">{dailyRecords.length} Active</p>
                 </div>
                 <div className="card bg-surface/30 border-dashed p-4">
                    <p className="text-[9px] font-bold text-secondary uppercase mb-1">Dairies Entries</p>
                    <p className="text-lg font-bold text-primary font-mono">{dailyRecords.filter(r => r.notes).length} Notes</p>
                 </div>
              </div>

              <div className="card !p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-surface/50 text-[10px] font-bold text-secondary uppercase tracking-widest">
                       <tr>
                         <th className="px-6 py-4">Date</th>
                         <th className="px-6 py-4">Crew</th>
                         <th className="px-6 py-4">Routes</th>
                         <th className="px-6 py-4 text-right">Fuel</th>
                         <th className="px-6 py-4 text-right">Net</th>
                         <th className="px-6 py-4">Notes</th>
                         <th className="px-6 py-4 sticky right-0 bg-surface shadow-[-10px_0_15px_-5px_rgba(0,0,0,0.05)]">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {dailyRecords.map(record => {
                        const driver = staff.find(s => s.id === record.driver_id)?.full_name || 'None';
                        const helper = staff.find(s => s.id === record.helper_id)?.full_name || 'None';
                        const total = (record.school_morning || 0) + (record.school_evening || 0) + (record.charter_morning || 0) + (record.charter_evening || 0) + (record.private_booking || 0);

                        return (
                          <React.Fragment key={record.id}>
                            <tr className="hover:bg-surface/30 transition-colors group">
                              <td className="px-6 py-4 font-mono text-xs font-bold text-primary">{record.date}</td>
                              <td className="px-6 py-4">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold text-primary">{driver}</p>
                                  <p className="text-[9px] text-secondary font-medium tracking-tight">H: {helper}</p>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {record.school_morning_name && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-accent/5 text-accent text-[8px] font-bold uppercase border border-accent/10">
                                      {record.school_morning_name}
                                    </span>
                                  )}
                                  {record.charter_morning > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-secondary/5 text-secondary text-[8px] font-bold uppercase border border-secondary/10">
                                      Charter
                                    </span>
                                  )}
                                  {record.private_booking > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-warning/5 text-warning text-[8px] font-bold uppercase border border-warning/10">
                                      Private
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-danger">-{record.fuel_amount || 0}</td>
                              <td className="px-6 py-4 text-right font-mono font-bold text-success">{formatCurrency(total)}</td>
                              <td className="px-6 py-4">
                                {record.notes ? (
                                  <button 
                                    onClick={() => {
                                      setIsNoteAddingOpen(isNoteAddingOpen === record.id ? null : record.id);
                                      setNoteValue(record.notes || '');
                                    }}
                                    className="p-1.5 rounded-lg bg-accent/5 text-accent hover:bg-accent/10 transition-colors"
                                    title={record.notes}
                                  >
                                    <StickyNote className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => {
                                      setIsNoteAddingOpen(record.id);
                                      setNoteValue('');
                                    }}
                                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-secondary hover:text-accent hover:bg-accent/5 transition-all"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right sticky right-0 bg-background/95 backdrop-blur-sm shadow-[-10px_0_15px_-5px_rgba(0,0,0,0.05)]">
                                <button className="p-2 text-secondary hover:text-primary transition-colors">
                                  <Edit3 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                            {isNoteAddingOpen === record.id && (
                              <tr className="bg-accent/[0.02]">
                                <td colSpan={7} className="px-6 py-4">
                                  <div className="flex items-start space-x-4">
                                    <div className="flex-1">
                                      <textarea
                                        value={noteValue}
                                        onChange={(e) => setNoteValue(e.target.value)}
                                        placeholder="Add bus log entry (e.g. punctures, route changes, mechanical issues)..."
                                        className="w-full input min-h-[80px]"
                                      />
                                    </div>
                                    <div className="flex flex-col space-y-2">
                                      <button 
                                        onClick={() => handleUpdateNote(record.id)}
                                        className="btn-primary !p-2"
                                      >
                                        <Save className="h-4 w-4" />
                                      </button>
                                      <button 
                                        onClick={() => setIsNoteAddingOpen(null)}
                                        className="btn-secondary !p-2"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="space-y-8">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="card">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Total Expenses</p>
                  <h3 className="text-2xl font-bold font-mono text-primary tracking-tighter">{formatCurrency(stats.totalExpenses)}</h3>
                </div>
                <div className="card border-l-4 border-l-warning">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Fuel Intake</p>
                  <h3 className="text-xl font-bold font-mono text-primary tracking-tighter">{formatCurrency(stats.totalFuel)}</h3>
                </div>
                <div className="card border-l-4 border-l-accent">
                   <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Maintenance</p>
                   <h3 className="text-xl font-bold font-mono text-primary tracking-tighter">
                     {formatCurrency(expenses.filter(e => e.category === 'maintenance_repairs').reduce((sum, e) => sum + (e.amount || 0), 0))}
                   </h3>
                </div>
                <div className="card border-l-4 border-l-secondary">
                   <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Misc. Costs</p>
                   <h3 className="text-xl font-bold font-mono text-primary tracking-tighter">
                     {formatCurrency(expenses.filter(e => e.category === 'misc_docs' || e.category === 'cleaning').reduce((sum, e) => sum + (e.amount || 0), 0))}
                   </h3>
                </div>
              </div>

              <div className="card !p-0">
                <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h4 className="text-sm font-bold text-primary uppercase">Expense Breakdown</h4>
                  <div className="flex items-center space-x-2">
                    <select className="input !py-2 !text-xs appearance-none pr-8">
                      <option>All Categories</option>
                      <option>Fuel</option>
                      <option>Maintenance</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface/50 text-[10px] font-bold text-secondary uppercase tracking-widest">
                       <tr>
                         <th className="px-6 py-4">Date</th>
                         <th className="px-6 py-4">Category</th>
                         <th className="px-6 py-4">Item Details</th>
                         <th className="px-6 py-4 text-right">Amount</th>
                         <th className="px-6 py-4">Paid By</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {expenses.map(expense => (
                        <tr key={expense.id} className="hover:bg-surface/30 transition-colors">
                           <td className="px-6 py-4 font-mono text-xs">{expense.date}</td>
                           <td className="px-6 py-4">
                             <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-accent/5 text-accent border border-accent/10 uppercase">
                               {expense.category.replace('_', ' ')}
                             </span>
                           </td>
                           <td className="px-6 py-4">
                             <div className="space-y-0.5">
                               <p className="text-xs font-bold text-primary">{expense.subcategory || 'General'}</p>
                               <p className="text-[9px] text-secondary line-clamp-1">{expense.description}</p>
                             </div>
                           </td>
                           <td className="px-6 py-4 text-right font-mono font-bold text-danger">{formatCurrency(expense.amount)}</td>
                           <td className="px-6 py-4 text-[10px] font-bold uppercase text-secondary tracking-widest">{expense.paid_by}</td>
                        </tr>
                      ))}
                      {expenses.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-secondary font-medium italic">No expenses recorded for this period</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-primary tracking-tight">Maintenance History</h3>
                  <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Service & Repair Logbook</p>
                </div>
                <div className="flex flex-col space-y-1 items-end">
                  <button 
                    onClick={() => {
                      setEditingMaintenance(null);
                      setIsMaintenanceModalOpen(true);
                    }}
                    className="btn-primary flex items-center space-x-2 !px-4"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Record</span>
                  </button>
                </div>
              </div>

              {/* Maintenance Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="card bg-accent/5 border-accent/20">
                  <p className="text-[9px] font-bold text-accent uppercase mb-1">Total Maintenance Spent</p>
                  <p className="text-xl font-bold text-primary font-mono">{formatCurrency(stats.totalMaintSpent)}</p>
                </div>
                <div className="card">
                  <p className="text-[9px] font-bold text-secondary uppercase mb-1">From Expenses</p>
                  <p className="text-lg font-bold text-primary font-mono">{formatCurrency(stats.expenseMaintSpent)}</p>
                </div>
                <div className="card">
                  <p className="text-[9px] font-bold text-secondary uppercase mb-1">Manual Entries</p>
                  <p className="text-lg font-bold text-primary font-mono">{formatCurrency(stats.manualMaintSpent)}</p>
                </div>
                <div className="card">
                  <p className="text-[9px] font-bold text-secondary uppercase mb-1">Last Service Date</p>
                  <p className="text-lg font-bold text-primary font-mono">
                    {mergedMaintenance.length > 0 ? mergedMaintenance[0].date : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Maintenance Filters */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-secondary uppercase ml-1">Filter by Month</label>
                    <select 
                      value={maintMonthFilter}
                      onChange={(e) => setMaintMonthFilter(e.target.value)}
                      className="input !py-1.5 !px-3 appearance-none !text-xs !bg-background pr-10"
                    >
                      <option value="all">Every Month</option>
                      {maintMonths.map(m => (
                        <option key={m} value={m}>{format(parseISO(`${m}-01`), 'MMMM yyyy')}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-2">
                  {maintPills.map(pill => (
                    <button
                      key={pill}
                      onClick={() => setMaintSubcategoryFilter(pill)}
                      className={cn(
                        "px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border",
                        maintSubcategoryFilter === pill 
                          ? "bg-accent text-white border-accent shadow-md shadow-accent/20" 
                          : "bg-surface text-secondary border-border hover:border-accent/30"
                      )}
                    >
                      {pill}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card !p-0 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border">
                  <table className="w-full text-left text-sm table-auto">
                    <thead className="bg-surface/50 text-[10px] font-bold text-secondary uppercase tracking-widest">
                       <tr>
                         <th className="px-4 py-4">Date</th>
                         <th className="px-4 py-4">Details</th>
                         <th className="px-4 py-4 text-right">Cost</th>
                         <th className="px-4 py-4 text-right">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {mergedMaintenance.map(m => {
                        const nextServiceDays = m.next_service_date ? differenceInDays(parseISO(m.next_service_date), new Date()) : null;

                        return (
                          <tr key={m.id} className="hover:bg-surface/30 transition-colors group">
                             <td className="px-4 py-4 vertical-top border-r border-border/5 lg:border-r-0">
                               <div className="space-y-1 min-w-[80px]">
                                 <p className="font-mono text-xs font-bold text-primary">{m.date}</p>
                                 {m.next_service_date && (
                                   <div className={cn(
                                     "flex items-center space-x-1 text-[8px] font-bold uppercase py-0.5 px-1.5 rounded-md border inline-flex",
                                     nextServiceDays! <= 0 ? "bg-danger/5 border-danger/10 text-danger" : nextServiceDays! <= 30 ? "bg-warning/5 border-warning/10 text-warning" : "bg-success/5 border-success/10 text-success"
                                   )}>
                                     <Clock className="h-2 w-2" />
                                     <span>Next: {m.next_service_date}</span>
                                   </div>
                                 )}
                               </div>
                             </td>
                             <td className="px-4 py-4">
                               <div className="flex flex-col space-y-2">
                                 <div className="flex flex-wrap items-center gap-1.5">
                                   <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border text-primary uppercase whitespace-nowrap">
                                     {m.type}
                                   </span>
                                   <span className="text-[8px] font-bold text-secondary uppercase tracking-tighter whitespace-nowrap">
                                     {m.subcategory}
                                   </span>
                                 </div>
                                 <p className="text-xs text-primary font-medium line-clamp-2 max-w-sm">{m.description}</p>
                                 <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] font-bold uppercase tracking-wider text-secondary/60">
                                   {m.workshop && <span className="flex items-center gap-1"><Wrench className="h-2.5 w-2.5" /> {m.workshop}</span>}
                                   {m.odometer > 0 && <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" /> {m.odometer} km</span>}
                                 </div>
                               </div>
                             </td>
                             <td className="px-4 py-4 text-right">
                               <p className={cn(
                                 "font-mono font-bold text-sm",
                                 m.cost > 0 ? "text-danger" : "text-secondary"
                               )}>{formatCurrency(m.cost)}</p>
                             </td>
                             <td className="px-4 py-4 text-right">
                               <div className="flex items-center justify-end space-x-1">
                                 {m.source === 'manual' ? (
                                   <>
                                      <button className="p-1.5 text-secondary hover:text-accent rounded-lg hover:bg-accent/5">
                                        <Edit3 className="h-4 w-4" />
                                      </button>
                                      <button className="p-1.5 text-secondary hover:text-danger rounded-lg hover:bg-danger/5">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                   </>
                                 ) : (
                                   <button 
                                     onClick={() => navigate('/admin/expenses')}
                                     className="p-1.5 text-secondary hover:text-primary rounded-lg hover:bg-surface"
                                     title="Go to Expenses module to edit"
                                   >
                                     <ArrowLeft className="h-4 w-4 rotate-180" />
                                   </button>
                                 )}
                               </div>
                             </td>
                          </tr>
                        );
                      })}
                      {mergedMaintenance.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-secondary font-medium italic">
                            No maintenance records found matching your filters
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="card space-y-8 flex flex-col min-h-[300px]">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-primary tracking-tight">Internal Discussion</h3>
                <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Team Notes & Handover Log</p>
              </div>

              <div className="flex-1 space-y-6">
                {comments.map((comment, idx) => (
                  <motion.div 
                    key={comment.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-start space-x-4"
                  >
                    <div className="h-10 w-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-bold text-accent shrink-0">
                      {comment.created_by[0]}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-baseline space-x-2">
                        <span className="text-xs font-bold text-primary">{comment.created_by}</span>
                        <span className="text-[9px] font-bold text-secondary uppercase tracking-tighter bg-surface px-1.5 py-0.5 rounded border border-border">
                          {comment.created_by_role}
                        </span>
                        <span className="text-[9px] text-secondary font-medium">
                          {comment.created_at ? format(comment.created_at.toDate(), 'PP • p') : 'Pending'}
                        </span>
                      </div>
                      <p className="text-sm text-primary bg-surface/50 p-4 rounded-2xl rounded-tl-none border border-border/50 leading-relaxed shadow-sm">
                        {comment.text}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="pt-6 border-t border-border">
                <form onSubmit={handleAddComment} className="flex items-end space-x-4">
                  <div className="flex-1">
                    <textarea
                      value={noteValue}
                      onChange={(e) => setNoteValue(e.target.value)}
                      placeholder="Add a comment about this bus (e.g. maintenance updates, route assignments)..."
                      className="input min-h-[100px] !py-4"
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary !p-4 self-end">
                    <MessageSquare className="h-5 w-5" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Maintenance Modal */}
      <AnimatePresence>
        {isMaintenanceModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMaintenanceModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg card shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-3">
                   <div className="p-2 rounded-xl bg-accent/10 text-accent">
                      <Wrench className="h-5 w-5" />
                   </div>
                   <h3 className="text-xl font-bold text-primary">Log Maintenance</h3>
                </div>
                <button onClick={() => setIsMaintenanceModalOpen(false)} className="p-2 hover:bg-surface rounded-full">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const data = new FormData(form);
                  
                  try {
                    const cost = parseFloat(data.get('cost') as string) || 0;
                    const date = data.get('date') as string;
                    const category = maintFormData.category;
                    const subcategory = maintFormData.subcategory;
                    const description = data.get('description') as string;
                    const workshop = data.get('workshop') as string;
                    const odometer = parseInt(data.get('odometer') as string) || 0;
                    const next_service_date = data.get('next_service_date') as string;

                    const maintenanceRecord = {
                      date,
                      type: category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                      description,
                      cost,
                      workshop,
                      odometer,
                      next_service_date,
                      added_by: profile?.full_name || 'Admin',
                      created_at: serverTimestamp(),
                      source: 'manual'
                    };

                    const expenseRecord = {
                      bus_id: busId,
                      date,
                      category,
                      subcategory,
                      amount: cost,
                      description: `Maintenance: ${description}`,
                      paid_by: maintFormData.paid_by,
                      created_at: serverTimestamp(),
                      added_by: profile?.full_name || 'Admin'
                    };

                    // 1. Add to maintenanceLog subcollection
                    await addDoc(collection(db, 'buses', busId!, 'maintenanceLog'), maintenanceRecord);
                    
                    // 2. Add to bus_expenses collection
                    await addDoc(collection(db, 'bus_expenses'), expenseRecord);

                    setIsMaintenanceModalOpen(false);
                    if (profile) {
                      await logActivity(
                        profile.full_name,
                        profile.role,
                        'Created',
                        'Fleet Management',
                        `Logged maintenance record for ${bus.registration_number}`
                      );
                    }
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="space-y-6"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Service Date</label>
                    <input type="date" name="date" required className="input" defaultValue={format(new Date(), 'yyyy-MM-dd')} />
                  </div>
                  <div className="space-y-2">
                    <label className="label">Category</label>
                    <select 
                      name="category" 
                      required 
                      className="input"
                      value={maintFormData.category}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setMaintFormData({
                          ...maintFormData,
                          category: cat,
                          subcategory: subcategoryOptions[cat][0]
                        });
                      }}
                    >
                      <option value="maintenance_repairs">Maintenance & Repairs</option>
                      <option value="licensing_registration">Licensing & Registration</option>
                      <option value="insurance">Insurance</option>
                      <option value="traffic_police">Traffic Police</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Subcategory</label>
                    <select 
                      name="subcategory" 
                      required 
                      className="input"
                      value={maintFormData.subcategory}
                      onChange={(e) => setMaintFormData({ ...maintFormData, subcategory: e.target.value })}
                    >
                      {subcategoryOptions[maintFormData.category].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="label">Paid By</label>
                    <div className="flex bg-surface p-1 rounded-xl border border-border">
                      {['Owner', 'Accountant'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setMaintFormData({ ...maintFormData, paid_by: p as any })}
                          className={cn(
                            "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                            maintFormData.paid_by === p 
                              ? "bg-accent text-white shadow-sm" 
                              : "text-secondary hover:text-primary"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="label">Description of Work</label>
                  <textarea name="description" required className="input min-h-[100px]" placeholder="Detailed notes on what was fixed or replaced..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Total Cost (₹)</label>
                    <input type="number" name="cost" required className="input" placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <label className="label">Workshop / Vendor</label>
                    <input type="text" name="workshop" className="input" placeholder="Service Center Name" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                   <div className="space-y-2">
                     <label className="label">Odometer (km)</label>
                     <input type="number" name="odometer" className="input" placeholder="e.g. 45000" />
                   </div>
                   <div className="space-y-2">
                     <label className="label">Next Service Reminder</label>
                     <input type="date" name="next_service_date" className="input" />
                   </div>
                </div>

                <button type="submit" className="btn-primary w-full !py-4 flex items-center justify-center space-x-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Save Record</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
