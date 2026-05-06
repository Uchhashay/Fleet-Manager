import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, setDoc, doc, serverTimestamp, addDoc, deleteDoc } from 'firebase/firestore';
import { Staff, SalaryRecord, CashTransaction, DailyRecord } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Save, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Calculator, Calendar, User, Briefcase, Clock, Wallet, X, IndianRupee, History, ArrowDownRight, ArrowUpRight, MessageSquare, Trash2, Download, Plus, Filter, UserX, UserCheck, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, isSameMonth, parseISO } from 'date-fns';
import { generateSalarySlipPDF } from '../lib/pdf-service';
import { Organization } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../lib/activity-logger';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';

export function SalaryManager() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [salaries, setSalaries] = useState<Record<string, SalaryRecord>>({});
  const [staffDuties, setStaffDuties] = useState<Record<string, DailyRecord[]>>({});
  const [staffTransactions, setStaffTransactions] = useState<Record<string, CashTransaction[]>>({});
  const [allMonthlySalaries, setAllMonthlySalaries] = useState<SalaryRecord[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<any>(null);
  const [staffNameForDelete, setStaffNameForDelete] = useState('');
  
  const [paymentData, setPaymentData] = useState({ 
    amount: 0, 
    type: 'salary' as 'salary' | 'salary_advance' | 'duty_payment',
    paidBy: 'accountant' as 'owner' | 'accountant',
    description: ''
  });

  const [generationData, setGenerationData] = useState({
    fixed_salary: 0,
    allowances: 0,
    deductions: 0,
    notes: ''
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  async function fetchData() {
    setLoading(true);
    try {
      const monthStr = format(currentMonth, 'yyyy-MM');
      const thirteenMonthsAgo = startOfMonth(subMonths(new Date(), 13));
      const thirteenMonthsAgoStr = format(thirteenMonthsAgo, 'yyyy-MM-dd');
      const startOfCurrentMonthStr = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const endOfCurrentMonthStr = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      // Fetch all collections with individual error handling to prevent total failure
      const fetches = {
        staff: getDocs(collection(db, 'staff')),
        records: getDocs(query(collection(db, 'daily_records'), where('date', '>=', thirteenMonthsAgoStr))),
        salaries: getDocs(query(collection(db, 'salary_records'), where('month', '>=', format(thirteenMonthsAgo, 'yyyy-MM')))),
        cash: getDocs(query(collection(db, 'cash_transactions'), where('date', '>=', thirteenMonthsAgoStr))),
        org: getDocs(collection(db, 'organization'))
      };

      const results = await Promise.allSettled(Object.values(fetches));
      
      const snaps: any = {};
      Object.keys(fetches).forEach((key, idx) => {
        const result = results[idx];
        if (result.status === 'fulfilled') {
          snaps[key] = result.value;
        } else {
          console.error(`Error fetching ${key}:`, result.reason);
          snaps[key] = { docs: [], empty: true };
        }
      });

      const staffList = snaps.staff.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Staff)).sort((a: Staff, b: Staff) => a.full_name.localeCompare(b.full_name));
      const allRecords = snaps.records.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as DailyRecord));
      const allSalaries = snaps.salaries.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as SalaryRecord));
      const allCash = snaps.cash.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as CashTransaction));
      if (!snaps.org.empty) {
        setOrganization({ id: snaps.org.docs[0].id, ...snaps.org.docs[0].data() } as any);
      }

      setStaff(staffList);
      setAllMonthlySalaries(allSalaries);

      const newSalaries: Record<string, SalaryRecord> = {};
      const newStaffDuties: Record<string, DailyRecord[]> = {};
      const newStaffTransactions: Record<string, CashTransaction[]> = {};
      
      staffList.forEach(s => {
        const staffAllRecords = allRecords.filter(r => r.driver_id === s.id || r.helper_id === s.id);
        const staffAllSalaries = allSalaries.filter(sal => sal.staff_id === s.id);
        const staffAllCash = allCash.filter(t => t.staff_id === s.id);

        // Filter current month data for UI
        const currentMonthRecords = staffAllRecords.filter(r => r.date >= startOfCurrentMonthStr && r.date <= endOfCurrentMonthStr);
        const currentMonthTransactions = staffAllCash.filter(t => t.date >= startOfCurrentMonthStr && t.date <= endOfCurrentMonthStr);
        
        newStaffDuties[s.id] = currentMonthRecords.sort((a, b) => b.date.localeCompare(a.date));
        newStaffTransactions[s.id] = staffAllCash.sort((a, b) => b.date.localeCompare(a.date));

        const existingSalary = staffAllSalaries.find(sal => sal.month === monthStr);
        if (existingSalary) {
          // Calculate total paid across all time (within our 13m window)
          // For real production we might need a lifetime count or a proper ledger
          // But for this overhauled version, we'll use existing total_paid logic or re-calculate
          const totalPaidForRecord = staffAllCash
            .filter(t => t.linked_id === existingSalary.id)
            .reduce((sum, t) => sum + t.amount, 0);
          
          newSalaries[s.id] = {
            ...existingSalary,
            total_paid: totalPaidForRecord,
            pending_balance: (existingSalary.net_payable || 0) - totalPaidForRecord
          } as any;
        }
      });

      setSalaries(newSalaries);
      setStaffDuties(newStaffDuties);
      setStaffTransactions(newStaffTransactions);
    } catch (error) {
      console.error('Error fetching salary data:', error);
    } finally {
      setLoading(false);
    }
  }

  const calculateDutyAmount = (staffMember: Staff) => {
    const records = staffDuties[staffMember.id] || [];
    return records.reduce((sum, r) => {
      const payable = r.driver_id === staffMember.id ? (r.driver_duty_payable || 0) : (r.helper_duty_payable || 0);
      return sum + payable;
    }, 0);
  };

  const calculateWorkingDays = (staffMember: Staff) => {
    const records = staffDuties[staffMember.id] || [];
    const uniqueDates = new Set(records.map(r => r.date));
    return uniqueDates.size;
  };

  const handleGenerateSalary = async () => {
    if (!selectedStaff) return;
    setSaving(true);
    try {
      const monthStr = format(currentMonth, 'yyyy-MM');
      const dutyAmount = calculateDutyAmount(selectedStaff);
      const workingDays = calculateWorkingDays(selectedStaff);
      
      const netPayable = generationData.fixed_salary + dutyAmount + generationData.allowances - generationData.deductions;
      
      const salaryRecord: Omit<SalaryRecord, 'id'> = {
        staff_id: selectedStaff.id,
        month: monthStr,
        fixed_salary: generationData.fixed_salary,
        duty_amount: dutyAmount,
        working_days: workingDays,
        adjustments: generationData.allowances - generationData.deductions,
        allowances: generationData.allowances,
        deductions: generationData.deductions,
        notes: generationData.notes,
        net_payable: netPayable,
        total_paid: 0,
        pending_balance: netPayable,
        status: 'unpaid',
        created_at: serverTimestamp() as any
      };

      const recordId = `${selectedStaff.id}_${monthStr}`;
      await setDoc(doc(db, 'salary_records', recordId), salaryRecord as any);

      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Salary Management',
          `Generated salary for ${selectedStaff.full_name} for ${monthStr}`
        );
      }

      setIsGenerateModalOpen(false);
      fetchData();
      setMessage({ type: 'success', text: 'Salary generated successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to generate salary' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleUpdateSalary = async () => {
    if (!selectedStaff || !salaries[selectedStaff.id]) return;
    setSaving(true);
    try {
      const salary = salaries[selectedStaff.id];
      const netPayable = (salary.fixed_salary || 0) + (salary.duty_amount || 0) + generationData.allowances - generationData.deductions;
      
      const updatedData = {
        fixed_salary: generationData.fixed_salary,
        allowances: generationData.allowances,
        deductions: generationData.deductions,
        notes: generationData.notes,
        net_payable: netPayable,
        pending_balance: netPayable - ((salary as any).total_paid || 0),
        updated_at: serverTimestamp()
      };

      await setDoc(doc(db, 'salary_records', salary.id), updatedData, { merge: true });

      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Edited',
          'Salary Management',
          `Updated salary record for ${selectedStaff.full_name} for ${salary.month}`
        );
      }

      setIsEditModalOpen(false);
      fetchData();
      setMessage({ type: 'success', text: 'Salary record updated!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update salary' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedStaff || paymentData.amount <= 0) return;
    setSaving(true);
    try {
      const monthStr = format(currentMonth, 'yyyy-MM');
      const salary = salaries[selectedStaff.id];
      const recordId = salary?.id || `${selectedStaff.id}_${monthStr}`;

      let description = paymentData.description || '';
      if (!description) {
        if (paymentData.type === 'salary_advance') description = `Advance Payment - ${format(currentMonth, 'MMM yyyy')}`;
        else if (paymentData.type === 'duty_payment') description = `Duty Payment - ${format(currentMonth, 'MMM yyyy')}`;
        else description = `Salary Payment - ${format(currentMonth, 'MMM yyyy')}`;
      }

      await addDoc(collection(db, 'cash_transactions'), {
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'out',
        category: paymentData.type,
        amount: paymentData.amount,
        description: description,
        linked_id: recordId,
        staff_id: selectedStaff.id,
        paid_by: paymentData.paidBy,
        created_by: auth.currentUser?.uid,
        created_at: serverTimestamp()
      });

      // Update salary status if it exists
      if (salary) {
        const newTotalPaid = ((salary as any).total_paid || 0) + paymentData.amount;
        const pending = salary.net_payable - newTotalPaid;
        let newStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
        if (newTotalPaid >= salary.net_payable) newStatus = 'paid';
        else if (newTotalPaid > 0) newStatus = 'partial';
        
        await setDoc(doc(db, 'salary_records', salary.id), {
          status: newStatus,
          total_paid: newTotalPaid,
          pending_balance: pending
        }, { merge: true });
      }

      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Salary Management',
          `Recorded ${paymentData.type} of ${formatCurrency(paymentData.amount)} for ${selectedStaff.full_name}`
        );
      }

      setIsPaymentModalOpen(false);
      fetchData();
      setMessage({ type: 'success', text: 'Payment recorded successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to record payment' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDownloadSlip = (staffId: string) => {
    const salary = salaries[staffId];
    const sMember = staff.find(s => s.id === staffId);
    const transactions = staffTransactions[staffId]?.filter(t => t.linked_id === salary.id) || [];
    
    if (salary && sMember && organization) {
      const doc = generateSalarySlipPDF(salary, sMember, transactions, organization);
      doc.save(`Salary_Slip_${sMember.full_name}_${salary.month}.pdf`);
    }
  };

  const monthStr = format(currentMonth, 'yyyy-MM');
  const filteredStaff = staff.filter(s => showInactive ? true : s.is_active !== false);

  const stats = {
    monthlyPayroll: Object.values(salaries).reduce((sum, s) => sum + (s.net_payable || 0), 0),
    totalPaid: Object.values(staffTransactions).flat().filter(t => {
      // Find transactions for this month's salary records
      const linkedSalary = allMonthlySalaries.find(s => s.id === t.linked_id && s.month === monthStr);
      return !!linkedSalary;
    }).reduce((sum, t) => sum + t.amount, 0),
    notGenerated: staff.filter(s => s.is_active !== false && !salaries[s.id]).length
  };
  stats.totalPaid = Object.values(salaries).reduce((sum, s) => sum + ((s as any).total_paid || 0), 0);
  const pendingBalance = stats.monthlyPayroll - stats.totalPaid;

  async function handleDeletePayment(transaction: any, staffName: string) {
    if (!transaction.id) {
      const errorMsg = 'Error: Transaction ID missing. Cannot delete.';
      console.error(errorMsg, transaction);
      alert(errorMsg);
      setMessage({ type: 'error', text: errorMsg });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    
    setTransactionToDelete(transaction);
    setStaffNameForDelete(staffName);
    setIsDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!transactionToDelete) return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, 'cash_transactions', transactionToDelete.id));

      // Update the salary record if linked
      if (transactionToDelete.linked_id) {
        const salary = allMonthlySalaries.find(s => s.id === transactionToDelete.linked_id);
        if (salary) {
          const newTotalPaid = Math.max(0, ((salary as any).total_paid || 0) - transactionToDelete.amount);
          const newPending = (salary.net_payable || 0) - newTotalPaid;
          let newStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
          if (newTotalPaid >= salary.net_payable) newStatus = 'paid';
          else if (newTotalPaid > 0) newStatus = 'partial';

          await setDoc(doc(db, 'salary_records', salary.id), {
            total_paid: newTotalPaid,
            pending_balance: newPending,
            status: newStatus
          }, { merge: true });
        }
      }
      
      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Deleted',
          'Salary Management',
          `Deleted payment of ${formatCurrency(transactionToDelete.amount)} for ${staffNameForDelete}`
        );
      }
      
      setMessage({ type: 'success', text: 'Payment deleted successfully' });
      setIsDeleteConfirmOpen(false);
      setTransactionToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      setMessage({ type: 'error', text: 'Failed to delete payment' });
      handleFirestoreError(error, OperationType.DELETE, 'cash_transactions');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-6 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <Calculator className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Payroll Management</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Salary Manager</h1>
        </div>
        
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:space-x-4 sm:space-y-0">
          <button 
            onClick={() => setShowInactive(!showInactive)}
            className={cn(
              "flex items-center space-x-2 px-4 py-2.5 rounded-xl border transition-all text-xs font-bold uppercase tracking-widest",
              showInactive 
                ? "bg-warning/10 border-warning/30 text-warning" 
                : "bg-surface border-border text-secondary hover:border-accent/50"
            )}
          >
            {showInactive ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
            <span>{showInactive ? 'Showing All Staff' : 'Hide Inactive'}</span>
          </button>

          <div className="flex items-center bg-surface border border-border rounded-xl p-1 shadow-sm">
            <button 
              onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
              className="p-2 text-secondary hover:text-primary hover:bg-background rounded-lg transition-colors"
            >
              <ChevronLeft className="h-4 w-4 stroke-[1.5px]" />
            </button>
            <div className="flex items-center space-x-2 px-4">
              <Calendar className="h-3.5 w-3.5 text-accent stroke-[1.5px]" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">
                {format(currentMonth, 'MMMM yyyy')}
              </span>
            </div>
            <button 
              onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
              className="p-2 text-secondary hover:text-primary hover:bg-background rounded-lg transition-colors"
            >
              <ChevronRight className="h-4 w-4 stroke-[1.5px]" />
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card bg-accent/5 border-accent/20">
          <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Total Monthly Payroll</p>
          <p className="text-2xl font-bold text-primary tracking-tight font-mono">
            {formatCurrency(stats.monthlyPayroll)}
          </p>
        </div>
        <div className="card bg-success/5 border-success/20">
          <p className="text-[10px] font-bold text-success uppercase tracking-widest mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-primary tracking-tight font-mono">
            {formatCurrency(stats.totalPaid)}
          </p>
        </div>
        <div className="card bg-warning/5 border-warning/20">
          <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-1">Pending Balance</p>
          <p className="text-2xl font-bold text-primary tracking-tight font-mono">
            {formatCurrency(pendingBalance)}
          </p>
        </div>
        <button 
          onClick={() => {
            const firstUngenerated = document.getElementById('ungenerated-section');
            firstUngenerated?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="card bg-secondary/5 border-secondary/20 hover:border-secondary/40 transition-all text-left group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Not Generated</p>
            <AlertCircle className="h-4 w-4 text-secondary/40 group-hover:text-secondary transition-colors" />
          </div>
          <p className="text-2xl font-bold text-primary tracking-tight font-mono">
            {stats.notGenerated} Staff
          </p>
        </button>
      </div>

      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "flex items-center space-x-3 rounded-xl p-4 text-sm font-medium",
              message.type === 'success' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            )}
          >
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {filteredStaff.map((s, idx) => {
          const salary = salaries[s.id];
          const isGenerated = !!salary;
          const dutyAmount = calculateDutyAmount(s);
          const workingDays = calculateWorkingDays(s);
          const isInactive = s.is_active === false;

          return (
            <motion.div 
              key={s.id}
              id={!isGenerated ? 'ungenerated-section' : undefined}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                "card group transition-all duration-300",
                !isGenerated ? "border-dashed border-2 bg-background/50" : "hover:border-accent/30",
                isInactive && "opacity-60 grayscale-[0.5]"
              )}
            >
              <div className="flex flex-col space-y-6 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
                <div className="flex items-center justify-between lg:justify-start lg:space-x-4">
                  <div className="flex items-center space-x-4">
                    <div className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg border",
                      isInactive ? "bg-secondary/10 border-secondary/20 text-secondary" : "bg-accent/10 border-accent/20 text-accent"
                    )}>
                      {s.full_name[0]}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-primary tracking-tight">{s.full_name}</h3>
                        {isInactive && (
                          <span className="px-2 py-0.5 rounded-full bg-danger/10 text-danger text-[8px] font-bold uppercase tracking-widest border border-danger/20">
                            Inactive
                          </span>
                        )}
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border",
                          s.staff_type === 'PERMANENT' ? "bg-info/10 text-info border-info/20" : "bg-warning/10 text-warning border-warning/20"
                        )}>
                          {s.staff_type || 'PERMANENT'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <Briefcase className="h-3 w-3 text-secondary stroke-[1.5px]" />
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{s.role}</span>
                      </div>
                    </div>
                  </div>

                  {!isGenerated && (
                    <button
                      onClick={() => {
                        setSelectedStaff(s);
                        setGenerationData({
                          fixed_salary: s.fixed_salary || 0,
                          allowances: 0,
                          deductions: 0,
                          notes: ''
                        });
                        setIsGenerateModalOpen(true);
                      }}
                      className="lg:hidden btn-primary !py-2 !px-4 text-[10px] flex items-center space-x-2"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Generate</span>
                    </button>
                  )}
                </div>

                {!isGenerated ? (
                  <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:space-y-0 lg:space-x-8">
                    <div className="grid grid-cols-2 gap-4 lg:flex lg:items-center lg:space-x-8">
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Base Salary</p>
                        <p className="font-bold text-primary text-sm">{formatCurrency(s.fixed_salary || 0)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Est. Duty</p>
                        <p className="font-bold text-primary text-sm">{formatCurrency(dutyAmount)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-info uppercase tracking-widest">Working Days</p>
                        <p className="font-bold text-info text-sm">{workingDays} Days</p>
                      </div>
                    </div>
                    
                    <div className="hidden lg:block lg:w-px lg:h-8 lg:bg-border/60"></div>
                    
                    <div className="flex items-center justify-between space-x-4">
                      <div className="flex items-center space-x-2 text-warning/80">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-[11px] font-medium">Salary not generated</span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedStaff(s);
                          setGenerationData({
                            fixed_salary: s.fixed_salary || 0,
                            allowances: 0,
                            deductions: 0,
                            notes: ''
                          });
                          setIsGenerateModalOpen(true);
                        }}
                        className="hidden lg:flex btn-primary !py-2.5 !px-6 text-[11px] font-bold uppercase tracking-widest items-center space-x-2 group-hover:scale-105 transition-transform"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Generate Salary</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6 lg:gap-8">
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Days / Duty</p>
                        <p className="font-bold text-primary font-mono text-sm leading-tight">
                          {salary.working_days}d / {formatCurrency(salary.duty_amount)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Allowance / Ded.</p>
                        <p className="font-bold text-primary font-mono text-sm leading-tight">
                          +{formatCurrency(salary.allowances)} / -{formatCurrency(salary.deductions)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-accent uppercase tracking-widest">Net Payable</p>
                        <p className="text-xl font-bold text-accent font-mono tracking-tighter">{formatCurrency(salary.net_payable)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-success uppercase tracking-widest">Total Paid</p>
                        <p className="text-xl font-bold text-success font-mono tracking-tighter">{formatCurrency((salary as any).total_paid || 0)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-warning uppercase tracking-widest">Pending</p>
                        <p className="text-xl font-bold text-warning font-mono tracking-tighter">{formatCurrency((salary as any).pending_balance || 0)}</p>
                      </div>
                      <div className="flex flex-col justify-center items-start lg:items-end">
                        <div className={cn(
                          "px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-[0.2em] border",
                          salary.status === 'paid' ? "bg-success/5 border-success/20 text-success" :
                          salary.status === 'partial' ? "bg-warning/5 border-warning/20 text-warning" :
                          "bg-danger/5 border-danger/20 text-danger"
                        )}>
                          {salary.status}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 pt-4 border-t border-border lg:pt-0 lg:border-t-0 lg:pl-6">
                      <button 
                        onClick={() => handleDownloadSlip(s.id)}
                        title="Download Slip"
                        className="p-2.5 rounded-xl bg-surface border border-border text-secondary hover:text-accent hover:border-accent/30 transition-all shadow-sm"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedStaff(s);
                          setPaymentData({ amount: (salary as any).pending_balance || 0, type: 'salary', paidBy: 'accountant', description: '' });
                          setIsPaymentModalOpen(true);
                        }}
                        className="flex-1 lg:flex-none btn-secondary !py-2.5 !px-4 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center space-x-2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Payment</span>
                      </button>
                      <button 
                        onClick={() => setExpandedStaff(expandedStaff === s.id ? null : s.id)}
                        className={cn(
                          "p-2.5 rounded-xl transition-all duration-300 shadow-sm border",
                          expandedStaff === s.id ? "bg-accent border-accent text-background" : "bg-surface border-border text-secondary hover:bg-background"
                        )}
                      >
                        <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", expandedStaff === s.id && "rotate-180")} />
                      </button>
                    </div>
                  </>
                )}
              </div>

              <AnimatePresence>
                {expandedStaff === s.id && isGenerated && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-8 border-t border-border pt-8 space-y-8">
                      <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-2 bg-surface px-3 py-1.5 rounded-lg border border-border/60">
                            <Calendar className="h-3 w-3 text-secondary" />
                            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Created: {salary.created_at ? format(salary.created_at.toDate(), 'dd MMM yyyy') : 'N/A'}</span>
                          </div>
                          {salary.notes && (
                            <div className="flex items-center space-x-2 text-secondary italic text-xs">
                              <MessageSquare className="h-3 w-3" />
                              <span className="truncate max-w-[200px]">{salary.notes}</span>
                            </div>
                          )}
                        </div>
                        
                        {(profile?.role === 'admin' || profile?.role === 'developer') && (
                          <button
                            onClick={() => {
                              setSelectedStaff(s);
                              setGenerationData({
                                fixed_salary: salary.fixed_salary,
                                allowances: salary.allowances,
                                deductions: salary.deductions,
                                notes: salary.notes || ''
                              });
                              setIsEditModalOpen(true);
                            }}
                            className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-widest text-accent hover:text-accent/80 transition-colors"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>Edit Adjustments</span>
                          </button>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center space-x-2 text-secondary/60">
                          <History className="h-3 w-3" />
                          <h4 className="text-[9px] font-bold uppercase tracking-widest">Recent Payments</h4>
                        </div>
                        
                        <div className="overflow-hidden rounded-xl bg-surface/30 border border-border/60">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-surface/50 border-b border-border/60">
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest">Date</th>
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest">Type</th>
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest">Paid By</th>
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest">Description</th>
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest text-right">Amount</th>
                                {(profile?.role === 'admin' || profile?.role === 'developer') && <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest text-right">Actions</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                              {staffTransactions[s.id]?.filter(t => t.linked_id === salary.id).length ? (
                                staffTransactions[s.id]
                                  ?.filter(t => t.linked_id === salary.id)
                                  .map((t, tIdx) => (
                                    <tr key={t.id || tIdx} className="hover:bg-surface/50 transition-colors">
                                      <td className="px-4 py-3 text-[11px] font-medium text-primary">
                                        {format(new Date(t.date), 'dd MMM yyyy')}
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className={cn(
                                          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border",
                                          t.category === 'salary_advance' ? "bg-warning/10 text-warning border-warning/20" :
                                          t.category === 'duty_payment' ? "bg-info/10 text-info border-info/20" :
                                          "bg-success/10 text-success border-success/20"
                                        )}>
                                          {t.category?.replace('salary_', '').replace('_', ' ')}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-[10px] font-bold text-secondary uppercase">
                                        {t.paid_by || 'Staff'}
                                      </td>
                                      <td className="px-4 py-3 text-[11px] text-secondary truncate max-w-[200px]">
                                        {t.description}
                                      </td>
                                      <td className="px-4 py-3 text-[11px] font-bold font-mono text-right text-success">
                                        {formatCurrency(t.amount)}
                                      </td>
                                      {(profile?.role === 'admin' || profile?.role === 'developer') && (
                                        <td className="px-4 py-3 text-right">
                                          <button
                                            onClick={() => handleDeletePayment(t, s.full_name)}
                                            className="p-1.5 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  ))
                              ) : (
                                <tr>
                                  <td colSpan={6} className="px-4 py-8 text-center text-[10px] text-secondary italic">
                                    No payments recorded for this salary record.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Generate Salary Modal */}
      <AnimatePresence>
        {isGenerateModalOpen && selectedStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border bg-accent/5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-primary">Generate Salary</h2>
                    <p className="text-xs text-secondary mt-1">{selectedStaff.full_name} · {format(currentMonth, 'MMMM yyyy')}</p>
                  </div>
                  <button onClick={() => setIsGenerateModalOpen(false)} className="p-2 hover:bg-background rounded-lg transition-colors">
                    <X className="h-5 w-5 text-secondary" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-info/5 border border-info/20">
                    <p className="text-[10px] font-bold text-info uppercase tracking-widest mb-1">Working Days</p>
                    <p className="text-lg font-bold text-primary">{calculateWorkingDays(selectedStaff)} Days</p>
                  </div>
                  <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
                    <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Duty Amount</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(calculateDutyAmount(selectedStaff))}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="label">Base Salary (Editable)</label>
                    <input
                      type="number"
                      value={generationData.fixed_salary || ''}
                      onChange={(e) => setGenerationData({ ...generationData, fixed_salary: parseInt(e.target.value) || 0 })}
                      className="input font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="label">Allowances</label>
                      <input
                        type="number"
                        value={generationData.allowances || ''}
                        onChange={(e) => setGenerationData({ ...generationData, allowances: parseInt(e.target.value) || 0 })}
                        className="input font-mono"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Deductions</label>
                      <input
                        type="number"
                        value={generationData.deductions || ''}
                        onChange={(e) => setGenerationData({ ...generationData, deductions: parseInt(e.target.value) || 0 })}
                        className="input font-mono"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="label">Notes / Remarks</label>
                    <textarea
                      value={generationData.notes}
                      onChange={(e) => setGenerationData({ ...generationData, notes: e.target.value })}
                      className="input min-h-[80px] py-3 resize-none"
                      placeholder="Add any performance notes or reasons for adjustments..."
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-border">
                  <div>
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Est. Net Payable</p>
                    <p className="text-2xl font-bold text-accent font-mono">
                      {formatCurrency(
                        (generationData.fixed_salary || 0) + 
                        calculateDutyAmount(selectedStaff) + 
                        (generationData.allowances || 0) - 
                        (generationData.deductions || 0)
                      )}
                    </p>
                  </div>
                  <button
                    onClick={handleGenerateSalary}
                    disabled={saving}
                    className="btn-primary !px-8 !py-3 flex items-center space-x-2"
                  >
                    {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" /> : <Save className="h-4 w-4" />}
                    <span>Create Record</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Salary Modal */}
      <AnimatePresence>
        {isEditModalOpen && selectedStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border bg-accent/5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-primary">Edit Adjustments</h2>
                    <p className="text-xs text-secondary mt-1">{selectedStaff.full_name} · {format(currentMonth, 'MMMM yyyy')}</p>
                  </div>
                  <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-background rounded-lg transition-colors">
                    <X className="h-5 w-5 text-secondary" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="label">Base Salary</label>
                    <input
                      type="number"
                      value={generationData.fixed_salary || ''}
                      onChange={(e) => setGenerationData({ ...generationData, fixed_salary: parseInt(e.target.value) || 0 })}
                      className="input font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="label">Allowances</label>
                      <input
                        type="number"
                        value={generationData.allowances || ''}
                        onChange={(e) => setGenerationData({ ...generationData, allowances: parseInt(e.target.value) || 0 })}
                        className="input font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Deductions</label>
                      <input
                        type="number"
                        value={generationData.deductions || ''}
                        onChange={(e) => setGenerationData({ ...generationData, deductions: parseInt(e.target.value) || 0 })}
                        className="input font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="label">Notes</label>
                    <textarea
                      value={generationData.notes}
                      onChange={(e) => setGenerationData({ ...generationData, notes: e.target.value })}
                      className="input min-h-[100px] py-3"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end space-x-3 border-t border-border">
                  <button onClick={() => setIsEditModalOpen(false)} className="btn-secondary">Cancel</button>
                  <button
                    onClick={handleUpdateSalary}
                    disabled={saving}
                    className="btn-primary flex items-center space-x-2"
                  >
                    {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />}
                    <span>Update Record</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Record Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && selectedStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border bg-success/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-primary">Record Payment</h2>
                      <p className="text-xs text-secondary mt-1">{selectedStaff.full_name}</p>
                    </div>
                  </div>
                  <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-background rounded-lg transition-colors">
                    <X className="h-5 w-5 text-secondary" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Payment Type</label>
                    <select
                      value={paymentData.type}
                      onChange={(e) => {
                        const type = e.target.value;
                        const salary = salaries[selectedStaff.id];
                        let amount = 0;
                        if (type === 'salary') amount = (salary as any)?.pending_balance || 0;
                        if (type === 'duty_payment') amount = (salary as any)?.duty_amount || 0;
                        setPaymentData({ ...paymentData, type: type as any, amount });
                      }}
                      className="input"
                    >
                      <option value="salary">Salary Payment</option>
                      <option value="duty_payment">Duty / Allowance</option>
                      <option value="salary_advance">Advance Payment</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="label">Paid By</label>
                    <select
                      value={paymentData.paidBy}
                      onChange={(e) => setPaymentData({ ...paymentData, paidBy: e.target.value as any })}
                      className="input"
                    >
                      <option value="accountant">Accountant</option>
                      <option value="admin">Admin / Office</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="label">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-bold font-mono">₹</span>
                    <input
                      type="number"
                      value={paymentData.amount || ''}
                      onChange={(e) => setPaymentData({ ...paymentData, amount: parseInt(e.target.value) || 0 })}
                      className="input pl-8 font-mono text-xl text-success"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="label">Description / Note</label>
                  <input
                    type="text"
                    value={paymentData.description || ''}
                    onChange={(e) => setPaymentData({ ...paymentData, description: e.target.value })}
                    className="input"
                    placeholder="E.g., Partial salary pay for May..."
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3 border-t border-border">
                  <button onClick={() => setIsPaymentModalOpen(false)} className="btn-secondary">Cancel</button>
                  <button
                    onClick={handleRecordPayment}
                    disabled={saving || paymentData.amount <= 0}
                    className="btn-primary !bg-success hover:!bg-success/90 flex items-center space-x-2"
                  >
                    {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />}
                    <span>Confirm Payment</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteConfirmOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-surface rounded-2xl border border-border shadow-2xl p-6 overflow-hidden"
            >
              <div className="text-center space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center">
                  <Trash2 className="h-8 w-8 text-danger stroke-[1.5px]" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-primary">Delete Payment</h3>
                  <p className="text-sm text-secondary leading-relaxed px-4">
                    Are you sure you want to delete this payment of <span className="font-bold text-primary font-mono">{formatCurrency(transactionToDelete?.amount)}</span> for <span className="font-bold text-primary">{staffNameForDelete}</span>? This action cannot be undone.
                  </p>
                </div>

                <div className="flex flex-col space-y-3 pt-2">
                  <button
                    onClick={confirmDelete}
                    disabled={saving}
                    className="btn-primary !bg-danger !border-transparent !text-white flex items-center justify-center space-x-2 !py-4"
                  >
                    {saving ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <Trash2 className="h-4 w-4 stroke-[1.5px]" />
                    )}
                    <span>Delete Permanently</span>
                  </button>
                  <button
                    onClick={() => setIsDeleteConfirmOpen(false)}
                    disabled={saving}
                    className="btn-secondary !py-4 text-xs uppercase tracking-widest font-bold"
                  >
                    Cancel
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
