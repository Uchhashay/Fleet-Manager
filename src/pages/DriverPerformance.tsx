import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Staff, DailyRecord, Bus } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  User, 
  Calendar, 
  Bus as BusIcon, 
  TrendingUp, 
  Wallet, 
  Activity, 
  ChevronLeft,
  Clock,
  Briefcase,
  ArrowUpRight,
  PieChart,
  History
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export function DriverPerformance() {
  const { id } = useParams<{ id: string }>();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id, dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      const [staffSnap, busesSnap, recordsSnap] = await Promise.all([
        getDoc(doc(db, 'staff', id!)),
        getDocs(collection(db, 'buses')),
        getDocs(query(
          collection(db, 'daily_records'),
          where('date', '>=', dateRange.start),
          where('date', '<=', dateRange.end),
          orderBy('date', 'desc')
        ))
      ]);

      if (staffSnap.exists()) {
        setStaff({ id: staffSnap.id, ...staffSnap.data() } as Staff);
      }

      setBuses(busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus)));
      
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyRecord));
      // Filter records where this staff was either driver or helper
      const filteredRecords = allRecords.filter(r => r.driver_id === id || r.helper_id === id);
      setRecords(filteredRecords);

    } catch (error) {
      console.error('Error fetching performance data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  if (!staff) return (
    <div className="text-center py-20">
      <p className="text-secondary font-medium">Staff member not found</p>
      <Link to="/staff" className="btn-secondary mt-4 inline-flex">Back to Staff</Link>
    </div>
  );

  // Stats Calculations
  const totalDays = records.length;
  const totalDuty = records.reduce((sum, r) => sum + (r.duty_paid || 0), 0);
  const totalCollections = records.reduce((sum, r) => {
    const revenue = (r.school_morning || 0) + (r.school_evening || 0) + 
                    (r.charter_morning || 0) + (r.charter_evening || 0) + 
                    (r.private_booking || 0);
    return sum + revenue - (r.booking_expense || 0);
  }, 0);

  const daysPerBus = records.reduce((acc, r) => {
    acc[r.bus_id] = (acc[r.bus_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const tripTypes = records.reduce((acc, r) => {
    if ((r.school_morning || 0) > 0 || (r.school_evening || 0) > 0) acc.school++;
    if ((r.charter_morning || 0) > 0 || (r.charter_evening || 0) > 0) acc.charter++;
    if ((r.private_booking || 0) > 0) acc.private++;
    return acc;
  }, { school: 0, charter: 0, private: 0 });

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-6">
        <Link 
          to="/staff" 
          className="flex items-center space-x-2 text-secondary hover:text-primary transition-colors w-fit"
        >
          <ChevronLeft className="h-4 w-4 stroke-[1.5px]" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Back to Directory</span>
        </Link>

        <div className="flex flex-col space-y-6 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div className="flex items-center space-x-6">
            <div className="h-20 w-20 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-3xl border border-accent/20">
              {staff.full_name[0]}
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold tracking-tight text-primary">{staff.full_name}</h1>
                <span className="badge bg-accent/10 text-accent uppercase tracking-widest">{staff.role}</span>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2 text-secondary">
                  <Calendar className="h-3.5 w-3.5 stroke-[1.5px]" />
                  <span className="text-xs font-medium">Joined {staff.join_date ? format(new Date(staff.join_date), 'dd MMM yyyy') : 'N/A'}</span>
                </div>
                <div className="flex items-center space-x-2 text-secondary">
                  <BusIcon className="h-3.5 w-3.5 stroke-[1.5px]" />
                  <span className="text-xs font-medium">
                    {buses.filter(b => b.id === staff.bus_id).map(b => b.registration_number).join(', ') || 'Floating Staff'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center bg-surface border border-border rounded-xl p-1 shadow-sm">
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="bg-transparent border-none text-[10px] font-bold uppercase tracking-widest text-primary focus:ring-0 px-3 py-2 cursor-pointer"
            />
            <div className="h-4 w-[1px] bg-border mx-1" />
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="bg-transparent border-none text-[10px] font-bold uppercase tracking-widest text-primary focus:ring-0 px-3 py-2 cursor-pointer"
            />
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Days Worked', value: totalDays, icon: Activity, color: 'text-primary' },
          { label: 'Duty Earned', value: formatCurrency(totalDuty), icon: Wallet, color: 'text-success' },
          { label: 'Collections', value: formatCurrency(totalCollections), icon: TrendingUp, color: 'text-accent' },
          { label: 'Avg / Shift', value: formatCurrency(totalCollections / (totalDays || 1)), icon: ArrowUpRight, color: 'text-warning' },
        ].map((stat, idx) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="card flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="label !mb-0">{stat.label}</p>
              <stat.icon className={cn("h-4 w-4 stroke-[1.5px]", stat.color)} />
            </div>
            <h3 className="text-2xl font-bold font-mono tracking-tighter text-primary">
              {stat.value}
            </h3>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Days per Bus */}
        <motion.div 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <div className="flex items-center space-x-2 mb-8">
            <BusIcon className="h-4 w-4 text-secondary stroke-[1.5px]" />
            <h3 className="text-sm font-bold text-primary tracking-tight">Deployment per Bus</h3>
          </div>
          <div className="space-y-4">
            {Object.entries(daysPerBus).map(([busId, count]) => {
              const bus = buses.find(b => b.id === busId);
              const percentage = (Number(count) / (totalDays || 1)) * 100;
              return (
                <div key={busId} className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-primary font-semibold">{bus?.registration_number || 'Unknown'}</span>
                    <span className="text-secondary font-bold font-mono">{count} Days</span>
                  </div>
                  <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      className="h-full bg-accent" 
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(daysPerBus).length === 0 && (
              <p className="text-center py-10 text-xs text-secondary font-medium">No deployment data</p>
            )}
          </div>
        </motion.div>

        {/* Trip Type Breakdown */}
        <motion.div 
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <div className="flex items-center space-x-2 mb-8">
            <PieChart className="h-4 w-4 text-secondary stroke-[1.5px]" />
            <h3 className="text-sm font-bold text-primary tracking-tight">Trip Type Distribution</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'School', value: tripTypes.school, color: 'bg-accent/10 text-accent' },
              { label: 'Charter', value: tripTypes.charter, color: 'bg-warning/10 text-warning' },
              { label: 'Private', value: tripTypes.private, color: 'bg-success/10 text-success' },
            ].map((type) => (
              <div key={type.label} className="text-center space-y-3">
                <div className={cn("inline-flex h-12 w-12 items-center justify-center rounded-full font-bold font-mono", type.color)}>
                  {type.value}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">{type.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Recent Shifts */}
      <div className="card !p-0 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center space-x-2">
            <History className="h-4 w-4 text-secondary stroke-[1.5px]" />
            <h3 className="text-sm font-bold text-primary tracking-tight">Recent Shifts</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bus</th>
                <th>Trip Details</th>
                <th className="text-right">Duty Paid</th>
                <th className="text-right">Collection</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, idx) => {
                const bus = buses.find(b => b.id === record.bus_id);
                const shiftCollection = (record.school_morning || 0) + (record.school_evening || 0) + 
                                   (record.charter_morning || 0) + (record.charter_evening || 0) + 
                                   (record.private_booking || 0) - (record.booking_expense || 0);
                return (
                  <motion.tr 
                    key={record.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.02 }}
                  >
                    <td className="text-secondary font-medium whitespace-nowrap">
                      {format(new Date(record.date), 'dd MMM yyyy')}
                    </td>
                    <td>
                      <span className="font-bold text-primary font-mono">{bus?.registration_number}</span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {record.school_morning > 0 && <span className="badge bg-accent/5 text-accent text-[9px]">Sch M</span>}
                        {record.school_evening > 0 && <span className="badge bg-accent/5 text-accent text-[9px]">Sch E</span>}
                        {record.charter_morning > 0 && <span className="badge bg-warning/5 text-warning text-[9px]">Chr M</span>}
                        {record.charter_evening > 0 && <span className="badge bg-warning/5 text-warning text-[9px]">Chr E</span>}
                        {record.private_booking > 0 && <span className="badge bg-success/5 text-success text-[9px]">Priv</span>}
                      </div>
                    </td>
                    <td className="text-right font-bold text-primary font-mono">{formatCurrency(record.duty_paid)}</td>
                    <td className="text-right font-bold text-accent font-mono">{formatCurrency(shiftCollection)}</td>
                  </motion.tr>
                );
              })}
              {records.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-secondary font-medium">No shift records found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
