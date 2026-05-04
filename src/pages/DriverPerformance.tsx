import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { Staff, DailyRecord, Bus, CashTransaction, SalaryRecord, Organization } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { 
  User, 
  Calendar, 
  Bus as BusIcon, 
  TrendingUp, 
  Wallet, 
  Activity, 
  ChevronLeft,
  Briefcase,
  ArrowUpRight,
  PieChart,
  History,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  DollarSign,
  Download,
  Send,
  Trash2,
  FileText,
  FileSpreadsheet,
  Shield,
  MapPin,
  UserCircle,
  PhoneCall,
  Save,
  Info,
  Edit2,
  X
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { generateStaffStatementPDF, generateDutyHistoryPDF } from '../lib/pdf-service';
import { exportToExcel } from '../lib/excel-utils';
import { toast } from 'react-hot-toast';
import { updateDoc } from 'firebase/firestore';

interface StaffComment {
  id: string;
  text: string;
  createdBy: string;
  createdByRole: string;
  createdAt: any;
}

export function DriverPerformance() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [comments, setComments] = useState<StaffComment[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'personal' | 'insights' | 'history' | 'statement' | 'comments'>('personal');
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isPersonalEditing, setIsPersonalEditing] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [personalFormData, setPersonalFormData] = useState({
    phone: '',
    emergency_contact_name: '',
    emergency_contact_number: '',
    home_address: '',
    identity_type: '' as Staff['identity_type'],
    identity_number: '',
    date_of_birth: ''
  });
  
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (id) {
      fetchData();
      
      // Subscribe to comments
      const q = query(collection(db, 'staff', id, 'comments'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snap) => {
        setComments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StaffComment)));
      }, (error) => {
        console.error('Error listening to comments:', error);
        // Silently fail or log, but don't crash the whole view if comments fail
      });

      return () => unsubscribe();
    }
  }, [id, dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      const [staffSnap, busesSnap, recordsSnap, salariesSnap, cashSnap, orgSnap] = await Promise.all([
        getDoc(doc(db, 'staff', id!)),
        getDocs(collection(db, 'buses')),
        getDocs(collection(db, 'daily_records')),
        getDocs(query(
          collection(db, 'salary_records'),
          where('staff_id', '==', id),
          orderBy('month', 'desc')
        )),
        getDocs(query(
          collection(db, 'cash_transactions'),
          where('staff_id', '==', id)
        )),
        getDoc(doc(db, 'settings', 'organization'))
      ]);

      if (staffSnap.exists()) {
        const staffData = { id: staffSnap.id, ...staffSnap.data() } as Staff;
        setStaff(staffData);
        setPersonalFormData({
          phone: staffData.phone || '',
          emergency_contact_name: staffData.emergency_contact_name || '',
          emergency_contact_number: staffData.emergency_contact_number || '',
          home_address: staffData.home_address || '',
          identity_type: staffData.identity_type || 'Aadhaar Card',
          identity_number: staffData.identity_number || '',
          date_of_birth: staffData.date_of_birth || ''
        });
      }

      setBuses(busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus)));
      
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyRecord));
      const staffRecords = allRecords
        .filter(r => r.driver_id === id || r.helper_id === id)
        .sort((a, b) => {
          const dateCompare = (b.date || '').localeCompare(a.date || '');
          if (dateCompare !== 0) return dateCompare;
          
          const aTime = a.created_at?.toMillis?.() || 0;
          const bTime = b.created_at?.toMillis?.() || 0;
          return bTime - aTime;
        });
      setRecords(staffRecords);

      setSalaries(salariesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalaryRecord)));
      setTransactions(cashSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashTransaction)));

      if (orgSnap.exists()) {
        setOrganization(orgSnap.data() as Organization);
      }

    } catch (error) {
      console.error('Error fetching performance data:', error);
      handleFirestoreError(error, OperationType.GET, 'DriverPerformance');
    } finally {
      setLoading(false);
    }
  }

  // Stats Calculations
  const calculations = useMemo(() => {
    // Split entries into Opening and Range
    const allDutyEntries = records.map(r => {
      const bus = buses.find(b => b.id === r.bus_id);
      const payable = r.driver_id === id ? (r.driver_duty_payable || 0) : (r.helper_duty_payable || 0);
      return {
        id: `duty-${r.id}`,
        date: r.date,
        description: `Duty Allowance: ${bus?.registration_number || 'N/A'}`,
        type: 'accrual' as const,
        amount: payable,
        createdAt: r.created_at
      };
    }).filter(e => e.amount > 0);

    const allSalaryEntries = salaries.map(s => {
      const baseAmount = (s.fixed_salary || 0) + (s.allowances || 0) + (s.adjustments || 0) - (s.deductions || 0);
      return {
        id: `sal-${s.id}`,
        date: s.month + '-28',
        description: `Fixed Salary & Adj. - ${format(new Date(s.month + '-01'), 'MMMM yyyy')}`,
        type: 'accrual' as const,
        amount: baseAmount,
        createdAt: null
      };
    }).filter(e => e.amount > 0);

    const allPaymentEntries = [
      ...transactions.map(t => ({
        id: t.id,
        date: t.date,
        description: `Payment: ${t.category.replace('_', ' ').toUpperCase()}${t.description ? ' - ' + t.description : ''}`,
        type: 'payment' as const,
        amount: t.amount || 0,
        createdAt: t.created_at
      })),
      ...records.map(r => {
        const paid = r.driver_id === id ? (r.driver_duty_paid || 0) : (r.helper_duty_paid || 0);
        return {
          id: `paid-${r.id}`,
          date: r.date,
          description: `Daily Duty Payment - Bus ${buses.find(b => b.id === r.bus_id)?.registration_number || 'N/A'}`,
          type: 'payment' as const,
          amount: paid,
          createdAt: r.created_at
        };
      }).filter(e => e.amount > 0)
    ].filter(e => e.amount > 0);

    const fullLedger = [...allDutyEntries, ...allSalaryEntries, ...allPaymentEntries].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;

      // Same date: Accrual first
      if (a.type !== b.type) {
        return a.type === 'accrual' ? -1 : 1;
      }

      // Same type: Use createdAt if available
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return aTime - bTime;
    });

    // Calculate Opening Balance for the period
    const openingBalanceEntries = fullLedger.filter(item => item.date < dateRange.start);
    const openingBalance = openingBalanceEntries.reduce((sum, item) => {
      return item.type === 'accrual' ? sum + item.amount : sum - item.amount;
    }, 0);

    const rangeEntryItems = fullLedger.filter(item => item.date >= dateRange.start && item.date <= dateRange.end);
    
    // Create viewable ledger with balance
    let currentBalance = openingBalance;
    const ledgerWithBalance = rangeEntryItems.map(item => {
      if (item.type === 'accrual') {
        currentBalance += item.amount;
      } else {
        currentBalance -= item.amount;
      }
      return { ...item, runningBalance: currentBalance };
    });

    const totalEarnedLifetime = allDutyEntries.reduce((sum, e) => sum + e.amount, 0) + allSalaryEntries.reduce((sum, e) => sum + e.amount, 0);
    const totalPaidLifetime = allPaymentEntries.reduce((sum, e) => sum + e.amount, 0);
    const totalPendingLifetime = totalEarnedLifetime - totalPaidLifetime;

    const startMonth = format(new Date(dateRange.start), 'yyyy-MM');
    const endMonth = format(new Date(dateRange.end), 'yyyy-MM');

    const filteredSalaries = salaries.filter(s => s.month >= startMonth && s.month <= endMonth);
    const filteredTransactions = transactions.filter(t => 
      ['salary', 'salary_advance', 'duty_payment'].includes(t.category) &&
      t.date >= dateRange.start && t.date <= dateRange.end
    );

    const totalDaysWorked = new Set(records.filter(r => r.date >= dateRange.start && r.date <= dateRange.end).map(r => r.date)).size;
    const totalDuties = records.filter(r => r.date >= dateRange.start && r.date <= dateRange.end).length;

    const rangeRecords = records.filter(r => r.date >= dateRange.start && r.date <= dateRange.end);
    
    const totalPayableRange = rangeRecords.reduce((sum, r) => {
      if (r.driver_id === id) return sum + (r.driver_duty_payable || 0);
      if (r.helper_id === id) return sum + (r.helper_duty_payable || 0);
      return sum;
    }, 0);

    const totalDutyPaidRange = rangeRecords.reduce((sum, r) => {
      if (r.driver_id === id) return sum + (r.driver_duty_paid || 0);
      if (r.helper_id === id) return sum + (r.helper_duty_paid || 0);
      return sum;
    }, 0);

    const totalCollections = rangeRecords.reduce((sum, r) => {
      const revenue = (r.school_morning || 0) + (r.school_evening || 0) + 
                      (r.charter_morning || 0) + (r.charter_evening || 0) + 
                      (r.private_booking || 0);
      return sum + revenue;
    }, 0);

    const daysPerBus = rangeRecords.reduce((acc, r) => {
      acc[r.bus_id] = (acc[r.bus_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const tripTypes = rangeRecords.reduce((acc, r) => {
      if ((r.school_morning || 0) > 0 || (r.school_evening || 0) > 0) acc.school++;
      if ((r.charter_morning || 0) > 0 || (r.charter_evening || 0) > 0) acc.charter++;
      if ((r.private_booking || 0) > 0) acc.private++;
      return acc;
    }, { school: 0, charter: 0, private: 0 });

    return {
      totalDaysWorked,
      totalDuties,
      totalEarned: totalEarnedLifetime,
      totalPaid: totalPaidLifetime,
      totalPending: totalPendingLifetime,
      totalPayableRange,
      totalDutyPaidRange,
      totalCollections,
      daysPerBus,
      tripTypes,
      filteredSalaries,
      filteredTransactions,
      openingBalance,
      ledger: [...ledgerWithBalance].reverse()
    };

  }, [records, salaries, transactions, id, dateRange]);

  const filteredHistoryRecords = useMemo(() => {
    return records.filter(r => r.date >= dateRange.start && r.date <= dateRange.end);
  }, [records, dateRange]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !profile) return;
    
    setSubmittingComment(true);
    try {
      await addDoc(collection(db, 'staff', id!, 'comments'), {
        text: newComment.trim(),
        createdBy: profile.full_name,
        createdByRole: profile.role,
        createdAt: serverTimestamp()
      });
      setNewComment('');
      toast.success('Comment added');
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentDelete = async (commentId: string) => {
    if (profile?.role !== 'admin') {
      toast.error('Only admins can delete comments');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    try {
      await deleteDoc(doc(db, 'staff', id!, 'comments', commentId));
      toast.success('Comment deleted');
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
    }
  };

  const handleDownloadStatement = () => {
    if (!staff || !organization) return;
    const ledgerData = [...calculations.ledger].reverse();
    if (ledgerData.length === 0) {
      toast.error('No transactions found for the selected period');
      return;
    }
    const pdfDoc = generateStaffStatementPDF(
      staff,
      calculations.filteredSalaries,
      ledgerData,
      organization,
      dateRange,
      {
        totalEarned: calculations.totalEarned,
        totalPaid: calculations.totalPaid,
        totalPending: calculations.totalPending,
        totalDuties: calculations.totalDuties,
        totalDaysWorked: calculations.totalDaysWorked
      }
    );
    pdfDoc.save(`${staff.full_name}_Statement_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleDownloadDutyHistory = () => {
    if (!staff || !organization) return;
    if (filteredHistoryRecords.length === 0) {
      toast.error('No records found for the selected period');
      return;
    }
    const summary = {
      totalPayable: calculations.totalPayableRange,
      totalPaid: calculations.totalDutyPaidRange,
      totalBalance: calculations.totalPayableRange - calculations.totalDutyPaidRange,
      totalCollections: calculations.totalCollections
    };
    
    const pdfDoc = generateDutyHistoryPDF(staff, filteredHistoryRecords, buses, organization, dateRange, summary);
    pdfDoc.save(`${staff.full_name}_DutyHistory_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleExportDutyHistoryExcel = () => {
    if (!staff) return;
    if (filteredHistoryRecords.length === 0) {
      toast.error('No records found for the selected period');
      return;
    }
    const data = filteredHistoryRecords.map(r => {
      const bus = buses.find(b => b.id === r.bus_id);
      const payable = r.driver_id === id ? (r.driver_duty_payable || 0) : (r.helper_duty_payable || 0);
      const paid = r.driver_id === id ? (r.driver_duty_paid || 0) : (r.helper_duty_paid || 0);
      const collection = (r.school_morning || 0) + (r.school_evening || 0) + 
                         (r.charter_morning || 0) + (r.charter_evening || 0) + 
                         (r.private_booking || 0);
      
      return {
        'Date': format(new Date(r.date), 'dd-MM-yyyy'),
        'Bus': bus?.registration_number || 'N/A',
        'Duty Payable': payable,
        'Duty Paid': paid,
        'Balance': payable - paid,
        'Collection': collection,
        'Trips': [
          r.school_morning > 0 ? 'SchM' : '',
          r.school_evening > 0 ? 'SchE' : '',
          r.charter_morning > 0 ? 'ChrM' : '',
          r.charter_evening > 0 ? 'ChrE' : '',
          r.private_booking > 0 ? 'Priv' : ''
        ].filter(Boolean).join(', ')
      };
    });

    exportToExcel(data, `${staff.full_name}_DutyHistory`, 'Duty History');
  };

  const handleExportStatementExcel = () => {
    if (!staff) return;
    const ledgerData = [...calculations.ledger].reverse();
    if (ledgerData.length === 0) {
      toast.error('No transactions found for the selected period');
      return;
    }
    const data = ledgerData.map(item => ({
      'Date': item.date,
      'Description': item.description,
      'Type': item.type.toUpperCase(),
      'Amount (+)': item.type === 'accrual' ? item.amount : 0,
      'Payment (-)': item.type === 'payment' ? item.amount : 0,
      'Running Balance': item.runningBalance
    }));

    exportToExcel(data, `${staff.full_name}_Statement`, 'Statement');
  };

  const handleUpdatePersonal = async () => {
    if (!staff) return;
    try {
      await updateDoc(doc(db, 'staff', staff.id), personalFormData);
      setStaff({ ...staff, ...personalFormData });
      setIsPersonalEditing(false);
      toast.success('Personal information updated');
    } catch (error) {
      console.error('Error updating personal info:', error);
      toast.error('Failed to update personal information');
    }
  };

  const handleToggleStatus = async () => {
    if (!staff) return;
    try {
      const newStatus = staff.is_active !== false ? false : true;
      await updateDoc(doc(db, 'staff', staff.id), { is_active: newStatus });
      setStaff({ ...staff, is_active: newStatus });
      setIsStatusModalOpen(false);
      toast.success(`Staff marked as ${newStatus ? 'active' : 'inactive'}`);
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('Failed to update status');
    }
  };

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

  return (
    <div className="space-y-10 pb-20">
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
                <div className="flex items-center space-x-2">
                  <div className={cn(
                    "flex items-center px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest",
                    staff.is_active !== false 
                      ? "bg-success/10 text-success border-success/20" 
                      : "bg-gray-100 text-gray-500 border-gray-200"
                  )}>
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full mr-2",
                      staff.is_active !== false ? "bg-success animate-pulse" : "bg-gray-400"
                    )} />
                    {staff.is_active !== false ? "Active" : "Inactive"}
                  </div>
                  <button
                    onClick={() => setIsStatusModalOpen(true)}
                    className="text-[10px] font-bold text-accent hover:underline uppercase tracking-widest"
                  >
                    Mark as {staff.is_active !== false ? 'Inactive' : 'Active'}
                  </button>
                </div>
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

          <div className="flex items-center space-x-4">
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
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center space-x-1 border-b border-border mb-8 scrollbar-hide overflow-x-auto">
        {[
          { id: 'personal', label: 'Personal Info', icon: UserCircle },
          { id: 'insights', label: 'Driver Insights', icon: PieChart },
          { id: 'history', label: 'Work History', icon: History },
          { id: 'statement', label: 'Statement', icon: DollarSign },
          { id: 'comments', label: 'Comments', icon: MessageSquare },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center space-x-2 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative whitespace-nowrap",
              activeTab === tab.id ? "text-accent" : "text-secondary hover:text-primary"
            )}
          >
            <tab.icon className={cn("h-4 w-4 stroke-[1.5px]", activeTab === tab.id ? "text-accent" : "text-secondary")} />
            <span>{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTabProp"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'personal' && (
          <motion.div
            key="personal"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-primary tracking-tight">Staff Information</h3>
                <p className="text-xs text-secondary font-medium mt-1">Manage personal and identity documents</p>
              </div>
              {!isPersonalEditing ? (
                <button
                  onClick={() => setIsPersonalEditing(true)}
                  className="btn-secondary !py-2 !px-6 flex items-center space-x-2"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Edit Personal Info</span>
                </button>
              ) : (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setIsPersonalEditing(false)}
                    className="p-2.5 text-secondary hover:text-primary hover:bg-surface rounded-xl transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleUpdatePersonal}
                    className="btn-primary !py-2.5 !px-8 flex items-center space-x-2"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Changes</span>
                  </button>
                </div>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Contact Details */}
              <div className="card space-y-6">
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                    <PhoneCall className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary">Contact Details</h4>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Phone Number</p>
                    {isPersonalEditing ? (
                      <input
                        type="tel"
                        value={personalFormData.phone}
                        onChange={(e) => setPersonalFormData({ ...personalFormData, phone: e.target.value })}
                        className="input !py-2 text-sm"
                      />
                    ) : (
                      <p className="font-bold text-primary">{staff.phone || '—'}</p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Emergency Name</p>
                      {isPersonalEditing ? (
                        <input
                          type="text"
                          value={personalFormData.emergency_contact_name}
                          onChange={(e) => setPersonalFormData({ ...personalFormData, emergency_contact_name: e.target.value })}
                          className="input !py-2 text-sm"
                        />
                      ) : (
                        <p className="font-bold text-primary">{staff.emergency_contact_name || '—'}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Emergency Phone</p>
                      {isPersonalEditing ? (
                        <input
                          type="tel"
                          value={personalFormData.emergency_contact_number}
                          onChange={(e) => setPersonalFormData({ ...personalFormData, emergency_contact_number: e.target.value })}
                          className="input !py-2 text-sm"
                        />
                      ) : (
                        <p className="font-bold text-primary">{staff.emergency_contact_number || '—'}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Identity Details */}
              <div className="card space-y-6">
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Shield className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary">Identity Details</h4>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Identity Type</p>
                      {isPersonalEditing ? (
                        <select
                          value={personalFormData.identity_type}
                          onChange={(e) => setPersonalFormData({ ...personalFormData, identity_type: e.target.value as Staff['identity_type'] })}
                          className="input !py-2 text-sm"
                        >
                          <option value="Aadhaar Card">Aadhaar Card</option>
                          <option value="PAN Card">PAN Card</option>
                          <option value="Driving License">Driving License</option>
                          <option value="Voter ID">Voter ID</option>
                          <option value="Passport">Passport</option>
                        </select>
                      ) : (
                        <p className="font-bold text-primary">{staff.identity_type || '—'}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Identity Number</p>
                      {isPersonalEditing ? (
                        <input
                          type="text"
                          value={personalFormData.identity_number}
                          onChange={(e) => setPersonalFormData({ ...personalFormData, identity_number: e.target.value })}
                          className="input !py-2 text-sm"
                        />
                      ) : (
                        <p className="font-bold text-primary">{staff.identity_number || '—'}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Date of Birth</p>
                      {isPersonalEditing ? (
                        <input
                          type="date"
                          value={personalFormData.date_of_birth}
                          onChange={(e) => setPersonalFormData({ ...personalFormData, date_of_birth: e.target.value })}
                          className="input !py-2 text-sm"
                        />
                      ) : (
                        <p className="font-bold text-primary">{staff.date_of_birth ? format(new Date(staff.date_of_birth), 'dd MMM yyyy') : '—'}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Date of Joining</p>
                      <p className="font-bold text-primary">{staff.join_date ? format(new Date(staff.join_date), 'dd MMM yyyy') : '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Address Details */}
              <div className="card space-y-6 md:col-span-2">
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center text-success">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary">Address Details</h4>
                </div>
                
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Home Address</p>
                  {isPersonalEditing ? (
                    <textarea
                      value={personalFormData.home_address}
                      onChange={(e) => setPersonalFormData({ ...personalFormData, home_address: e.target.value })}
                      className="input min-h-[100px] !py-3 text-sm"
                      placeholder="Enter full home address..."
                    />
                  ) : (
                    <p className="font-bold text-primary leading-relaxed max-w-2xl whitespace-pre-wrap">{staff.home_address || 'Address information not provided.'}</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'insights' && (
          <motion.div 
            key="insights"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-10"
          >
            {/* Summary Cards */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Days Present', value: calculations.totalDaysWorked, sub: 'Selected period', icon: Activity, color: 'text-accent' },
                { label: 'Duty Entries', value: calculations.totalDuties, sub: 'Selected period', icon: Briefcase, color: 'text-primary' },
                { label: 'Lifetime Earned', value: formatCurrency(calculations.totalEarned), sub: 'Overall earnings', icon: Wallet, color: 'text-success' },
                { label: 'Current Balance', value: formatCurrency(calculations.totalPending), sub: 'Total outstanding', icon: AlertCircle, color: calculations.totalPending > 0 ? 'text-danger' : 'text-success' },
              ].map((stat, idx) => (
                <div key={stat.label} className="card flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <p className="label !mb-0">{stat.label}</p>
                    <stat.icon className={cn("h-4 w-4 stroke-[1.5px]", stat.color)} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-bold font-mono tracking-tighter text-primary">
                      {stat.value}
                    </h3>
                    <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">{stat.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Days per Bus */}
              <div className="card">
                <div className="flex items-center space-x-2 mb-8">
                  <BusIcon className="h-4 w-4 text-secondary stroke-[1.5px]" />
                  <h3 className="text-sm font-bold text-primary tracking-tight">Deployment per Bus</h3>
                </div>
                <div className="space-y-4">
                  {Object.entries(calculations.daysPerBus).map(([busId, count]) => {
                    const bus = buses.find(b => b.id === busId);
                    const percentage = (Number(count) / (calculations.totalDuties || 1)) * 100;
                    return (
                      <div key={busId} className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-primary font-semibold">{bus?.registration_number || 'Unknown'}</span>
                          <span className="text-secondary font-bold font-mono">{count} Duties</span>
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
                  {Object.keys(calculations.daysPerBus).length === 0 && (
                    <p className="text-center py-10 text-xs text-secondary font-medium">No deployment data</p>
                  )}
                </div>
              </div>

              {/* Trip Type Breakdown */}
              <div className="card">
                <div className="flex items-center space-x-2 mb-8">
                  <PieChart className="h-4 w-4 text-secondary stroke-[1.5px]" />
                  <h3 className="text-sm font-bold text-primary tracking-tight">Trip Type Distribution</h3>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'School', value: calculations.tripTypes.school, color: 'bg-accent/10 text-accent' },
                    { label: 'Charter', value: calculations.tripTypes.charter, color: 'bg-warning/10 text-warning' },
                    { label: 'Private', value: calculations.tripTypes.private, color: 'bg-success/10 text-success' },
                  ].map((type) => (
                    <div key={type.label} className="text-center space-y-3">
                      <div className={cn("inline-flex h-12 w-12 items-center justify-center rounded-full font-bold font-mono text-lg", type.color)}>
                        {type.value}
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">{type.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-secondary">
                    <Calendar className="h-4 w-4 stroke-[1.5px]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Statement History</span>
                  </div>
                  <button
                    onClick={() => {
                      const headers = ['Date', 'Description', 'Type', 'Amount', 'Balance'];
                      const rows = calculations.ledger.map(item => [
                        item.date,
                        item.description,
                        item.type,
                        item.amount,
                        (item as any).runningBalance
                      ]);
                      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement("a");
                      const url = URL.createObjectURL(blob);
                      link.setAttribute("href", url);
                      link.setAttribute("download", `statement_${staff?.full_name}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
                      link.style.visibility = 'hidden';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="flex items-center space-x-2 text-[10px] font-bold text-accent uppercase tracking-widest hover:text-accent/80 transition-colors"
                  >
                    <Download className="h-3 w-3" />
                    <span>Download CSV</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div 
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="card bg-surface/50">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-1">Duty Payable</p>
                <p className="text-xl font-bold text-primary font-mono">{formatCurrency(calculations.totalPayableRange)}</p>
              </div>
              <div className="card bg-surface/50">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-1">Duty Paid</p>
                <p className="text-xl font-bold text-success font-mono">{formatCurrency(calculations.totalDutyPaidRange)}</p>
              </div>
              <div className="card bg-surface/50">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-1">Duty Balance</p>
                <p className={cn(
                  "text-xl font-bold font-mono",
                  (calculations.totalPayableRange - calculations.totalDutyPaidRange) > 0 ? "text-danger" : "text-success"
                )}>
                  {formatCurrency(calculations.totalPayableRange - calculations.totalDutyPaidRange)}
                </p>
              </div>
              <div className="card bg-surface/50">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-1">Total Revenue</p>
                <p className="text-xl font-bold text-accent font-mono">{formatCurrency(calculations.totalCollections)}</p>
              </div>
            </div>

            <div className="card !p-0 overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div className="flex items-center space-x-2">
                  <History className="h-4 w-4 text-secondary stroke-[1.5px]" />
                  <h3 className="text-sm font-bold text-primary tracking-tight">Duty History</h3>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={handleDownloadDutyHistory}
                    className="btn-secondary !py-2 !px-4 flex items-center space-x-2"
                    title="Download PDF"
                  >
                    <FileText className="h-3.5 w-3.5 stroke-[1.5px]" />
                    <span className="text-[10px] font-bold uppercase">PDF</span>
                  </button>
                  <button 
                    onClick={handleExportDutyHistoryExcel}
                    className="btn-secondary !py-2 !px-4 flex items-center space-x-2"
                    title="Download Excel"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 stroke-[1.5px]" />
                    <span className="text-[10px] font-bold uppercase">Excel</span>
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Bus</th>
                      <th>Trip Details</th>
                      <th className="text-right">Payable</th>
                      <th className="text-right">Paid</th>
                      <th className="text-right">Balance</th>
                      <th className="text-right">Collection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryRecords.map((record, idx) => {
                      const bus = buses.find(b => b.id === record.bus_id);
                      const shiftCollection = (record.school_morning || 0) + (record.school_evening || 0) + 
                                         (record.charter_morning || 0) + (record.charter_evening || 0) + 
                                         (record.private_booking || 0);
                      const dutyPayable = record.driver_id === id ? (record.driver_duty_payable || 0) : (record.helper_duty_payable || 0);
                      const dutyPaid = record.driver_id === id ? (record.driver_duty_paid || 0) : (record.helper_duty_paid || 0);
                      const shiftBalance = dutyPayable - dutyPaid;
                      return (
                        <tr key={record.id}>
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
                          <td className="text-right font-bold text-primary font-mono">{formatCurrency(dutyPayable)}</td>
                          <td className="text-right font-bold text-success font-mono">{formatCurrency(dutyPaid)}</td>
                          <td className={cn("text-right font-bold font-mono", shiftBalance > 0 ? "text-danger" : "text-success")}>
                            {formatCurrency(shiftBalance)}
                          </td>
                          <td className="text-right font-bold text-accent font-mono">{formatCurrency(shiftCollection)}</td>
                        </tr>
                      );
                    })}
                    {records.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-secondary font-medium">No shift records found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'statement' && (
          <motion.div 
            key="statement"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xl font-bold text-primary">Statement of Accounts</h3>
                <p className="text-xs text-secondary font-medium mt-1 uppercase tracking-widest">Financial ledger for this period</p>
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={handleDownloadStatement}
                  className="btn-secondary !py-2 !px-4 flex items-center space-x-2"
                  title="Download PDF"
                >
                  <FileText className="h-3.5 w-3.5 stroke-[1.5px]" />
                  <span className="text-[10px] font-bold uppercase">PDF</span>
                </button>
                <button 
                  onClick={handleExportStatementExcel}
                  className="btn-secondary !py-2 !px-4 flex items-center space-x-2"
                  title="Download Excel"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 stroke-[1.5px]" />
                  <span className="text-[10px] font-bold uppercase">Excel</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card bg-accent/5 border-accent/20">
                <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Lifetime Earned</p>
                <p className="text-2xl font-bold text-primary tracking-tight font-mono">{formatCurrency(calculations.totalEarned)}</p>
              </div>
              <div className="card bg-success/5 border-success/20">
                <p className="text-[10px] font-bold text-success uppercase tracking-widest mb-1">Lifetime Received</p>
                <p className="text-2xl font-bold text-primary tracking-tight font-mono">{formatCurrency(calculations.totalPaid)}</p>
              </div>
              <div className="card bg-danger/5 border-danger/20">
                <p className="text-[10px] font-bold text-danger uppercase tracking-widest mb-1">Current Balance</p>
                <p className="text-2xl font-bold text-primary tracking-tight font-mono">{formatCurrency(calculations.totalPending)}</p>
              </div>
            </div>

            <div className="card !p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="text-right">Accrual (+)</th>
                      <th className="text-right">Payment (-)</th>
                      <th className="text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculations.openingBalance !== 0 && (
                      <tr className="bg-surface/50 border-b border-border">
                        <td className="text-xs font-medium text-secondary italic">Opening</td>
                        <td className="text-xs text-secondary italic">Balance before {format(new Date(dateRange.start), 'dd MMM yyyy')}</td>
                        <td className="text-right font-mono text-primary font-bold">
                          {calculations.openingBalance > 0 ? `+${formatCurrency(calculations.openingBalance)}` : '—'}
                        </td>
                        <td className="text-right font-mono text-success font-bold">
                          {calculations.openingBalance < 0 ? `-${formatCurrency(Math.abs(calculations.openingBalance))}` : '—'}
                        </td>
                        <td className={cn(
                          "text-right font-mono font-bold",
                          calculations.openingBalance > 0 ? "text-danger" : "text-success"
                        )}>
                          {formatCurrency(calculations.openingBalance)}
                        </td>
                      </tr>
                    )}
                    {calculations.ledger.map((item) => (
                      <tr key={item.id} className="hover:bg-surface/50 transition-colors">
                        <td className="text-xs font-medium text-secondary whitespace-nowrap">
                          {format(new Date(item.date), 'dd MMM yyyy')}
                        </td>
                        <td className="font-bold text-primary text-xs">
                          {item.description}
                        </td>
                        <td className="text-right font-mono text-primary font-bold">
                          {item.type === 'accrual' ? `+${formatCurrency(item.amount)}` : '-'}
                        </td>
                        <td className="text-right font-mono text-success font-bold">
                          {item.type === 'payment' ? `-${formatCurrency(item.amount)}` : '-'}
                        </td>
                        <td className={cn(
                          "text-right font-mono font-bold",
                          item.runningBalance > 0 ? "text-danger" : "text-success"
                        )}>
                          {formatCurrency(item.runningBalance)}
                        </td>
                      </tr>
                    ))}
                    {calculations.ledger.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-secondary font-medium uppercase tracking-[0.2em] text-[10px]">No transaction history found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'comments' && (
          <motion.div 
            key="comments"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid gap-8 lg:grid-cols-3"
          >
            <div className="lg:col-span-2 space-y-6">
              <div className="card space-y-6">
                <h3 className="text-sm font-bold text-primary flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4 text-accent stroke-[1.5px]" />
                  <span>Internal Profile Notes</span>
                </h3>

                <form onSubmit={handleCommentSubmit} className="space-y-4">
                  <div className="relative">
                    <textarea
                      required
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a new internal note about this staff member..."
                      className="input min-h-[120px] py-4 pr-12 resize-none text-sm transition-all focus:border-accent/50"
                    />
                    <button
                      type="submit"
                      disabled={submittingComment || !newComment.trim()}
                      className={cn(
                        "absolute bottom-4 right-4 p-2 rounded-lg transition-all",
                        newComment.trim() ? "bg-accent text-background shadow-lg shadow-accent/20" : "bg-surface text-secondary cursor-not-allowed"
                      )}
                    >
                      {submittingComment ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                      ) : (
                        <Send className="h-4 w-4 stroke-[1.5px]" />
                      )}
                    </button>
                  </div>
                  <p className="text-[9px] font-bold text-secondary uppercase tracking-widest text-right">Visible to Admins & Accountants only</p>
                </form>

                <div className="space-y-6 mt-10">
                  {comments.map((comment, idx) => (
                    <motion.div 
                      key={comment.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex space-x-4 p-4 rounded-2xl bg-surface/50 border border-border/50 group relative"
                    >
                      <div className="h-10 w-10 shrink-0 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm">
                        {comment.createdBy[0]}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-primary text-xs">{comment.createdBy}</span>
                            <span className="text-[9px] font-bold text-accent bg-accent/5 px-2 py-0.5 rounded-full uppercase tracking-tighter">{comment.createdByRole}</span>
                          </div>
                          <span className="text-[10px] font-medium text-secondary">
                            {comment.createdAt ? format(comment.createdAt.toDate(), 'dd MMM yyyy • HH:mm') : 'Just now'}
                          </span>
                        </div>
                        <p className="text-sm text-secondary leading-relaxed font-medium">
                          {comment.text}
                        </p>
                      </div>
                      
                      {profile?.role === 'admin' && (
                        <button 
                          onClick={() => handleCommentDelete(comment.id)}
                          className="absolute top-4 right-4 p-1.5 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                  {comments.length === 0 && (
                    <div className="text-center py-10 space-y-2">
                      <div className="h-12 w-12 bg-surface rounded-full flex items-center justify-center mx-auto text-secondary/30">
                        <MessageSquare className="h-6 w-6 stroke-[1.5px]" />
                      </div>
                      <p className="text-xs text-secondary font-bold uppercase tracking-widest">No internal notes yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="card bg-accent/5 border-accent/20">
                <h4 className="text-xs font-bold text-accent uppercase tracking-[0.2em] mb-4">Note Usage Policy</h4>
                <div className="space-y-4 text-xs font-medium text-secondary leading-relaxed">
                  <p>• Logs absences, feedback or behavioral incidents.</p>
                  <p>• Internal use only—not visible to staff members.</p>
                  <p>• Only admins can delete existing logs.</p>
                  <p>• Use professional language for audits.</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isStatusModalOpen && staff && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/80 backdrop-blur-[4px]"
              onClick={() => setIsStatusModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm card bg-background shadow-2xl border-accent/10"
            >
              <div className="flex flex-col items-center text-center p-4">
                <div className={cn(
                  "h-16 w-16 rounded-full flex items-center justify-center mb-6",
                  staff.is_active !== false ? "bg-danger/10" : "bg-success/10"
                )}>
                  {staff.is_active !== false ? (
                      <AlertCircle className="h-8 w-8 text-danger" />
                  ) : (
                      <CheckCircle2 className="h-8 w-8 text-success" />
                  )}
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">
                  Mark as {staff.is_active !== false ? 'Inactive' : 'Active'}?
                </h3>
                <p className="text-sm text-secondary mb-8">
                  {staff.is_active !== false 
                    ? `Mark ${staff.full_name} as Inactive? They will no longer appear in duty assignments.`
                    : `Mark ${staff.full_name} as Active? They will be available for duty assignments again.`
                  }
                </p>
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button
                    onClick={() => setIsStatusModalOpen(false)}
                    className="px-4 py-3 rounded-xl border border-border text-xs font-bold text-secondary hover:bg-surface"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleToggleStatus}
                    className={cn(
                      "px-4 py-3 rounded-xl text-white text-xs font-bold shadow-lg uppercase tracking-[0.1em]",
                      staff.is_active !== false 
                        ? "bg-danger hover:bg-danger/90 shadow-danger/20" 
                        : "bg-success hover:bg-success/90 shadow-success/20"
                    )}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
