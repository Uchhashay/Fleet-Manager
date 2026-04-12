import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, setDoc, doc, serverTimestamp, addDoc, deleteDoc } from 'firebase/firestore';
import { Staff, SalaryRecord, CashTransaction } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Save, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Calculator, Calendar, User, Briefcase, Clock, Wallet, X, IndianRupee, History, ArrowDownRight, ArrowUpRight, MessageSquare, Trash2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../lib/activity-logger';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';

export function SalaryManager() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [salaries, setSalaries] = useState<Record<string, Partial<SalaryRecord>>>({});
  const [staffDuties, setStaffDuties] = useState<Record<string, any[]>>({});
  const [staffTransactions, setStaffTransactions] = useState<Record<string, CashTransaction[]>>({});
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({ 
    staffId: '', 
    amount: 0, 
    type: 'salary' as 'salary' | 'salary_advance' | 'duty_payment',
    paidBy: 'accountant' as 'owner' | 'accountant'
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  async function fetchData() {
    setLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
      const monthStr = format(currentMonth, 'yyyy-MM');
      const prevMonth = subMonths(currentMonth, 1);
      const prevMonthStr = format(prevMonth, 'yyyy-MM');
      const prevStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
      const prevEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd');

      const [staffSnap, recordsSnap, salariesSnap, cashSnap, prevSalariesSnap, prevCashSnap] = await Promise.all([
        getDocs(query(collection(db, 'staff'), orderBy('full_name'))),
        getDocs(query(collection(db, 'daily_records'), where('date', '>=', start), where('date', '<=', end))),
        getDocs(query(collection(db, 'salary_records'), where('month', '==', monthStr))),
        getDocs(query(
          collection(db, 'cash_transactions'), 
          where('date', '>=', start), 
          where('date', '<=', end),
          where('category', 'in', ['salary', 'salary_advance', 'duty_payment'])
        )),
        getDocs(query(collection(db, 'salary_records'), where('month', '==', prevMonthStr))),
        getDocs(query(
          collection(db, 'cash_transactions'), 
          where('date', '>=', prevStart), 
          where('date', '<=', prevEnd),
          where('category', 'in', ['salary', 'salary_advance'])
        ))
      ]);

      const staffList = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
      const recordsList = recordsSnap.docs.map(doc => doc.data());
      const salariesList = salariesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalaryRecord));
      const cashList = cashSnap.docs.map(doc => doc.data() as CashTransaction);
      
      const prevSalariesList = prevSalariesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalaryRecord));
      const prevCashList = prevCashSnap.docs.map(doc => doc.data() as CashTransaction);

      setStaff(staffList);

      const newSalaries: Record<string, Partial<SalaryRecord>> = {};
      const newStaffDuties: Record<string, any[]> = {};
      const newStaffTransactions: Record<string, CashTransaction[]> = {};
      
      staffList.forEach(s => {
        // Calculate Previous Month Balance (Opening Balance)
        const prevSalary = prevSalariesList.find(sal => sal.staff_id === s.id);
        let openingBalance = 0;
        if (prevSalary) {
          const prevTransactions = prevCashList.filter(t => t.staff_id === s.id);
          const prevPaid = prevTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
          openingBalance = (prevSalary.net_payable || 0) - prevPaid;
        }

        const staffRecords = recordsList.filter(r => 
          (r.driver_id === s.id || r.helper_id === s.id) && !r.is_holiday
        );
        newStaffDuties[s.id] = staffRecords;
        
        const staffTransactionsList = cashList.filter(t => t.staff_id === s.id);
        newStaffTransactions[s.id] = staffTransactionsList;

        const advanceAmount = staffTransactionsList
          .filter(t => t.category === 'salary_advance')
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const dutyPaidAmount = staffTransactionsList
          .filter(t => t.category === 'duty_payment')
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const salaryPaidAmount = staffTransactionsList
          .filter(t => t.category === 'salary')
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalPaid = advanceAmount + dutyPaidAmount + salaryPaidAmount;

        const workingDays = staffRecords.length || 0;

        const totalPayableDuty = staffRecords.reduce((sum, r) => {
          if (r.driver_id === s.id) return sum + (r.driver_duty_payable || 0);
          if (r.helper_id === s.id) return sum + (r.helper_duty_payable || 0);
          return sum;
        }, 0);

        const existingSalary = salariesList.find(sal => sal.staff_id === s.id);

        if (existingSalary) {
          // HISTORICAL LOCK: Use stored fixed_salary, don't overwrite from Staff Master
          // DUTY CONSISTENCY: Lock duty if Fully Paid
          const isLocked = existingSalary.status === 'paid';
          
          const dutyAmount = isLocked ? existingSalary.duty_amount : totalPayableDuty;
          const currentEarnings = (existingSalary.fixed_salary || 0) + 
                           (dutyAmount || 0) + 
                           (existingSalary.allowances || 0) + 
                           (existingSalary.adjustments || 0) - 
                           (existingSalary.deductions || 0);

          const netPayable = currentEarnings + openingBalance;
          const pending = netPayable - totalPaid;
          let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
          if (totalPaid === 0 && openingBalance === 0) status = 'unpaid';
          else if (pending <= 0) status = 'paid';
          else status = 'partial';

          newSalaries[s.id] = {
            ...existingSalary,
            duty_amount: dutyAmount,
            net_payable: netPayable,
            status: status
          };
        } else {
          const currentEarnings = (s.fixed_salary || 0) + totalPayableDuty;
          const netPayable = currentEarnings + openingBalance;
          const pending = netPayable - totalPaid;
          let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
          if (totalPaid === 0 && openingBalance === 0) status = 'unpaid';
          else if (pending <= 0) status = 'paid';
          else status = 'partial';

          newSalaries[s.id] = {
            staff_id: s.id,
            month: monthStr,
            working_days: workingDays,
            duty_amount: totalPayableDuty,
            fixed_salary: s.fixed_salary,
            adjustments: 0,
            allowances: 0,
            deductions: 0,
            net_payable: netPayable,
            status: status
          };
        }

        // Add dynamic fields for UI
        (newSalaries[s.id] as any).opening_balance = openingBalance;
        (newSalaries[s.id] as any).total_paid = totalPaid;
        (newSalaries[s.id] as any).advance_amount = advanceAmount;
        (newSalaries[s.id] as any).duty_paid_amount = dutyPaidAmount;
        (newSalaries[s.id] as any).pending_balance = (newSalaries[s.id].net_payable || 0) - totalPaid;
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

  const handleSalaryChange = (staffId: string, field: keyof SalaryRecord, value: any) => {
    setSalaries(prev => {
      const current = prev[staffId];
      const updated = { ...current, [field]: value };
      
      // Formula: Opening Balance + Base Salary + Duty Amount + Allowances + Adjustments - Deductions
      const opening = (updated as any).opening_balance || 0;
      const base = Number(updated.fixed_salary) || 0;
      const duty = Number(updated.duty_amount) || 0;
      const allowances = Number(updated.allowances) || 0;
      const adjustments = Number(updated.adjustments) || 0;
      const deductions = Number(updated.deductions) || 0;

      updated.net_payable = opening + base + duty + allowances + adjustments - deductions;
      
      // Update pending and status dynamically
      const totalPaid = (updated as any).total_paid || 0;
      (updated as any).pending_balance = updated.net_payable - totalPaid;
      
      const pending = (updated as any).pending_balance;
      if (totalPaid === 0) updated.status = 'unpaid';
      else if (pending <= 0) updated.status = 'paid';
      else updated.status = 'partial';
      
      return { ...prev, [staffId]: updated };
    });
  };

  const handleSave = async (staffId: string) => {
    setSaving(true);
    try {
      const salary = salaries[staffId];
      const recordId = `${staffId}_${salary.month}`;
      
      // Clean up dynamic UI fields before saving
      const { total_paid, advance_amount, pending_balance, opening_balance, ...dataToSave } = salary as any;
      
      await setDoc(doc(db, 'salary_records', recordId), {
        ...dataToSave,
        created_at: serverTimestamp()
      });

      // Log activity
      if (profile) {
        const staffMember = staff.find(s => s.id === staffId);
        await logActivity(
          profile.full_name,
          profile.role,
          'Edited',
          'Salary Management',
          `Updated salary record for ${staffMember?.full_name} for ${salary.month}`
        );
      }

      setMessage({ type: 'success', text: 'Salary record saved!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save salary' });
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentData.staffId || paymentData.amount <= 0) return;
    setSaving(true);
    try {
      const salary = salaries[paymentData.staffId];
      const recordId = `${paymentData.staffId}_${salary.month}`;
      const staffMember = staff.find(s => s.id === paymentData.staffId);

      let description = '';
      if (paymentData.type === 'salary_advance') description = `Advance for ${staffMember?.full_name}`;
      else if (paymentData.type === 'duty_payment') description = `Duty Payment for ${staffMember?.full_name}`;
      else description = `Salary payment for ${staffMember?.full_name}`;
      
      description += ` (${format(currentMonth, 'MMMM yyyy')})`;

      await addDoc(collection(db, 'cash_transactions'), {
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'out',
        category: paymentData.type,
        amount: paymentData.amount,
        description: description,
        linked_id: recordId,
        staff_id: paymentData.staffId,
        paid_by: paymentData.paidBy,
        created_by: auth.currentUser?.uid,
        created_at: serverTimestamp()
      });

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Salary Management',
          `Recorded ${paymentData.type.replace('_', ' ')} of ${formatCurrency(paymentData.amount)} for ${staffMember?.full_name}`
        );
      }

      setIsPaymentModalOpen(false);
      setPaymentData({ staffId: '', amount: 0, type: 'salary', paidBy: 'accountant' });
      fetchData(); // Refresh to update totals
      setMessage({ type: 'success', text: 'Payment recorded successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to record payment' });
    } finally {
      setSaving(false);
    }
  };

  const totals = { totalPayroll: 0, totalPaid: 0, pendingBalance: 0 };
  Object.values(salaries).forEach((s: any) => {
    const net = Number(s.net_payable) || 0;
    const paid = Number(s.total_paid) || 0;
    const pending = Number(s.pending_balance) || 0;
    
    totals.totalPayroll += net; // Total liability for the month
    totals.totalPaid += paid;
    totals.pendingBalance += pending > 0 ? pending : 0;
  });

  async function handleDeletePayment(transaction: any, staffName: string) {
    if (!confirm(`Are you sure you want to delete this payment of ${formatCurrency(transaction.amount)}?`)) return;
    
    try {
      await deleteDoc(doc(db, 'cash_transactions', transaction.id));
      
      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Deleted',
          'Salary Management',
          `Deleted ${transaction.type} payment of ${formatCurrency(transaction.amount)} for ${staffName}`
        );
      }
      
      setMessage({ type: 'success', text: 'Payment deleted successfully' });
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'cash_transactions');
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
            <Calculator className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Payroll Management</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Salary Manager</h1>
        </div>
        
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
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card bg-accent/5 border-accent/20">
          <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Total Monthly Payroll</p>
          <p className="text-2xl font-bold text-primary tracking-tight">
            {formatCurrency(totals.totalPayroll)}
          </p>
        </div>
        <div className="card bg-success/5 border-success/20">
          <p className="text-[10px] font-bold text-success uppercase tracking-widest mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-primary tracking-tight">
            {formatCurrency(totals.totalPaid)}
          </p>
        </div>
        <div className="card bg-warning/5 border-warning/20">
          <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-1">Pending Balance</p>
          <p className="text-2xl font-bold text-primary tracking-tight">
            {formatCurrency(totals.pendingBalance)}
          </p>
        </div>
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
        {staff.map((s, idx) => {
          const salary = salaries[s.id];
          if (!salary) return null;

          return (
            <motion.div 
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="card group hover:border-accent/30"
            >
              <div className="flex flex-col space-y-8 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
                <div className="flex items-center space-x-4">
                  <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-lg border border-accent/20">
                    {s.full_name[0]}
                  </div>
                  <div>
                    <h3 className="font-bold text-primary tracking-tight">{s.full_name}</h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <Briefcase className="h-3 w-3 text-secondary stroke-[1.5px]" />
                      <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{s.role}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6 lg:gap-8">
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Working Days</p>
                    <p className="font-bold text-primary font-mono">{salary.working_days}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Duty Amount</p>
                    <p className="font-bold text-primary font-mono">{formatCurrency(salary.duty_amount || 0)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Base Salary</p>
                    <p className="font-bold text-primary font-mono text-sm">{formatCurrency(salary.fixed_salary || 0)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-accent uppercase tracking-widest">Net Payable</p>
                    <p className="text-xl font-bold text-accent font-mono tracking-tighter">{formatCurrency(salary.net_payable || 0)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-success uppercase tracking-widest">Total Paid</p>
                    <p className="text-xl font-bold text-success font-mono tracking-tighter">{formatCurrency((salary as any).total_paid || 0)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-warning uppercase tracking-widest">Pending</p>
                    <p className="text-xl font-bold text-warning font-mono tracking-tighter">{formatCurrency((salary as any).pending_balance || 0)}</p>
                  </div>
                </div>

                <div className="flex items-center">
                  <button 
                    onClick={() => setExpandedStaff(expandedStaff === s.id ? null : s.id)}
                    className={cn(
                      "p-2 rounded-lg transition-all duration-300",
                      expandedStaff === s.id ? "bg-accent text-background" : "bg-surface text-secondary hover:text-accent border border-border"
                    )}
                  >
                    <History className={cn("h-5 w-5 stroke-[1.5px] transition-transform", expandedStaff === s.id && "rotate-180")} />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {expandedStaff === s.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-8 border-t border-border pt-8 space-y-10">
                      {/* Payroll Adjustments Section */}
                      <div className="space-y-6">
                        <div className="flex items-center space-x-2">
                          <Calculator className="h-3.5 w-3.5 text-accent" />
                          <h4 className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em]">Payroll Adjustments</h4>
                        </div>
                        
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                          <div className="space-y-2">
                            <label className="label">Allowances</label>
                            <input
                              type="number"
                              value={salary.allowances || ''}
                              onChange={(e) => handleSalaryChange(s.id, 'allowances', parseInt(e.target.value) || 0)}
                              className="input font-mono"
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="label">Adjustments</label>
                            <input
                              type="number"
                              value={salary.adjustments || ''}
                              onChange={(e) => handleSalaryChange(s.id, 'adjustments', parseInt(e.target.value) || 0)}
                              className="input font-mono"
                              placeholder="+/-"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="label">Deductions</label>
                            <div className="relative">
                              <input
                                type="number"
                                value={salary.deductions || ''}
                                onChange={(e) => handleSalaryChange(s.id, 'deductions', parseInt(e.target.value) || 0)}
                                className="input font-mono"
                                placeholder="0"
                              />
                              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary stroke-[1.5px]" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="label">Status</label>
                            <div className={cn(
                              "input flex items-center justify-center font-bold uppercase tracking-widest text-[10px]",
                              salary.status === 'paid' ? "bg-success/10 text-success border-success/20" :
                              salary.status === 'partial' ? "bg-warning/10 text-warning border-warning/20" :
                              "bg-secondary/10 text-secondary border-border"
                            )}>
                              {salary.status}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="label">Duty Paid</label>
                            <div className="flex items-center space-x-2 bg-surface p-3 rounded-xl border border-border">
                              <Clock className="h-4 w-4 text-secondary" />
                              <span className="font-mono font-bold text-primary">{formatCurrency((salary as any).duty_paid_amount || 0)}</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="label">Advance Paid</label>
                            <div className="flex items-center space-x-2 bg-surface p-3 rounded-xl border border-border">
                              <Wallet className="h-4 w-4 text-secondary" />
                              <span className="font-mono font-bold text-primary">{formatCurrency((salary as any).advance_amount || 0)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={() => handleSave(s.id)}
                            disabled={saving}
                            className="btn-primary flex items-center space-x-2 !px-8 !py-3"
                          >
                            {saving ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                            ) : (
                              <Save className="h-4 w-4 stroke-[1.5px]" />
                            )}
                            <span>Save Adjustments</span>
                          </button>
                        </div>
                      </div>

                      {/* Monthly Review / Notes Section */}
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                          <MessageSquare className="h-3.5 w-3.5 text-accent" />
                          <h4 className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em]">Monthly Review / Notes</h4>
                        </div>
                        <textarea
                          value={salary.notes || ''}
                          onChange={(e) => handleSalaryChange(s.id, 'notes', e.target.value)}
                          placeholder="Write a review or notes about performance, behavior, or special incidents for this month..."
                          className="input min-h-[100px] py-3 resize-none text-sm"
                        />
                      </div>

                      {/* Transaction & Duty History Section */}
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <History className="h-3.5 w-3.5 text-accent" />
                            <h4 className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em]">Transaction & Duty History</h4>
                          </div>
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => {
                                setPaymentData({ staffId: s.id, amount: salary.duty_amount || 0, type: 'duty_payment', paidBy: 'accountant' });
                                setIsPaymentModalOpen(true);
                              }}
                              className="btn-secondary flex items-center space-x-2 !py-2 !px-4 text-[10px]"
                            >
                              <Clock className="h-3 w-3 stroke-[1.5px]" />
                              <span>Pay Duty</span>
                            </button>
                            <button
                              onClick={() => {
                                setPaymentData({ staffId: s.id, amount: 0, type: 'salary_advance', paidBy: 'accountant' });
                                setIsPaymentModalOpen(true);
                              }}
                              className="btn-secondary flex items-center space-x-2 !py-2 !px-4 text-[10px]"
                            >
                              <Wallet className="h-3 w-3 stroke-[1.5px]" />
                              <span>Pay Advance</span>
                            </button>
                            <button
                              onClick={() => {
                                setPaymentData({ staffId: s.id, amount: (salary as any).pending_balance || 0, type: 'salary', paidBy: 'accountant' });
                                setIsPaymentModalOpen(true);
                              }}
                              className="btn-secondary flex items-center space-x-2 !py-2 !px-4 text-[10px]"
                            >
                              <IndianRupee className="h-3 w-3 stroke-[1.5px]" />
                              <span>Pay Salary</span>
                            </button>
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-border bg-surface/30">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-surface border-b border-border">
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest">Date</th>
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest">Type</th>
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest">Paid By</th>
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest">Description</th>
                                <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest text-right">Amount</th>
                                {profile?.role === 'admin' && <th className="px-4 py-3 text-[9px] font-bold text-secondary uppercase tracking-widest text-right">Actions</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {/* Combine and sort duties and transactions */}
                              {[
                                ...(staffDuties[s.id] || []).map(d => ({
                                  date: d.date,
                                  type: 'Duty',
                                  desc: `Duty Allowance (${s.role})`,
                                  amount: s.role === 'driver' ? d.driver_duty_payable : d.helper_duty_payable,
                                  isPayment: false
                                })),
                                ...(staffTransactions[s.id] || []).map(t => ({
                                  id: t.id,
                                  date: t.date,
                                  type: t.category === 'salary_advance' ? 'Advance' : 
                                        t.category === 'duty_payment' ? 'Duty Pay' : 'Salary',
                                  desc: t.description,
                                  amount: t.amount,
                                  isPayment: true,
                                  paidBy: t.paid_by
                                })),
                                ...( (salary as any).opening_balance !== 0 ? [{
                                  date: format(startOfMonth(currentMonth), 'yyyy-MM-dd'),
                                  type: 'Balance',
                                  desc: (salary as any).opening_balance < 0 ? 'Credit from Last Month' : 'Arrears from Last Month',
                                  amount: Math.abs((salary as any).opening_balance),
                                  isPayment: (salary as any).opening_balance < 0,
                                  isOpening: true
                                }] : [])
                              ].sort((a, b) => {
                                if ((a as any).isOpening) return -1;
                                if ((b as any).isOpening) return 1;
                                return new Date(b.date).getTime() - new Date(a.date).getTime();
                              }).map((item, iIdx) => (
                                <tr key={iIdx} className={cn("hover:bg-surface/50 transition-colors", (item as any).isOpening && "bg-accent/5")}>
                                  <td className="px-4 py-3 text-[11px] font-medium text-primary">
                                    {format(new Date(item.date), 'dd MMM yyyy')}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest",
                                      item.type === 'Duty' ? "bg-accent/10 text-accent" :
                                      item.type === 'Advance' ? "bg-warning/10 text-warning" :
                                      item.type === 'Balance' ? "bg-primary/10 text-primary" :
                                      "bg-success/10 text-success"
                                    )}>
                                      {item.type}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    {item.isPayment && (item as any).paidBy ? (
                                      <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">
                                        {(item as any).paidBy}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-secondary/40">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-[11px] text-secondary truncate max-w-[200px]">
                                    {item.desc}
                                  </td>
                                  <td className={cn(
                                    "px-4 py-3 text-[11px] font-bold font-mono text-right",
                                    item.isPayment ? "text-success" : "text-primary"
                                  )}>
                                    {item.isPayment ? '-' : ''}{formatCurrency(item.amount)}
                                  </td>
                                  {profile?.role === 'admin' && (
                                    <td className="px-4 py-3 text-right">
                                      {item.isPayment && !(item as any).isOpening && (
                                        <button
                                          onClick={() => handleDeletePayment(item, s.full_name)}
                                          className="p-1.5 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                                          title="Delete Payment"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                              {(!staffDuties[s.id]?.length && !staffTransactions[s.id]?.length) && (
                                <tr>
                                  <td colSpan={4} className="px-4 py-8 text-center text-[10px] text-secondary italic">
                                    No transaction or duty history for this month.
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

      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPaymentModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md card shadow-2xl border-accent/20"
            >
              <div className="mb-8 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-accent">
                    <Wallet className="h-3 w-3 stroke-[1.5px]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Record Payment</span>
                  </div>
                  <h3 className="text-xl font-bold text-primary">
                    {paymentData.type === 'salary_advance' ? 'Salary Advance' : 
                     paymentData.type === 'duty_payment' ? 'Duty Payment' : 'Salary Payment'}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsPaymentModalOpen(false)} 
                  className="p-2 text-secondary hover:text-primary hover:bg-surface rounded-full transition-colors"
                >
                  <X className="h-5 w-5 stroke-[1.5px]" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="label">Amount to Pay</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      value={paymentData.amount || ''}
                      onChange={(e) => setPaymentData({ ...paymentData, amount: parseInt(e.target.value) || 0 })}
                      className="input font-mono text-lg"
                      placeholder="Enter amount"
                      autoFocus
                    />
                    <IndianRupee className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="label">Paid By</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentData({ ...paymentData, paidBy: 'accountant' })}
                      className={cn(
                        "flex items-center justify-center space-x-2 p-3 rounded-xl border transition-all",
                        paymentData.paidBy === 'accountant' 
                          ? "bg-accent/10 border-accent text-accent font-bold" 
                          : "bg-surface border-border text-secondary hover:border-accent/50"
                      )}
                    >
                      <User className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-widest">Accountant</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentData({ ...paymentData, paidBy: 'owner' })}
                      className={cn(
                        "flex items-center justify-center space-x-2 p-3 rounded-xl border transition-all",
                        paymentData.paidBy === 'owner' 
                          ? "bg-accent/10 border-accent text-accent font-bold" 
                          : "bg-surface border-border text-secondary hover:border-accent/50"
                      )}
                    >
                      <User className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-widest">Owner</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-secondary">
                    <span>Staff Member</span>
                    <span className="text-primary">{staff.find(s => s.id === paymentData.staffId)?.full_name}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-secondary">
                    <span>Pending Balance</span>
                    <span className="text-warning">{formatCurrency((salaries[paymentData.staffId] as any)?.pending_balance || 0)}</span>
                  </div>
                </div>

                <button
                  onClick={handleRecordPayment}
                  disabled={saving || paymentData.amount <= 0}
                  className="btn-primary w-full flex items-center justify-center space-x-2 !py-4"
                >
                  {saving ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  ) : (
                    <Save className="h-4 w-4 stroke-[1.5px]" />
                  )}
                  <span>Confirm Payment</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
