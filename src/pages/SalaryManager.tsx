import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, setDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore';
import { Staff, SalaryRecord, CashTransaction } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Save, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Calculator, Calendar, User, Briefcase, Clock, Wallet } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export function SalaryManager() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [salaries, setSalaries] = useState<Record<string, Partial<SalaryRecord>>>({});
  const [saving, setSaving] = useState(false);
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

      const [staffSnap, recordsSnap, salariesSnap, cashSnap] = await Promise.all([
        getDocs(query(collection(db, 'staff'), orderBy('full_name'))),
        getDocs(query(collection(db, 'daily_records'), where('date', '>=', start), where('date', '<=', end))),
        getDocs(query(collection(db, 'salary_records'), where('month', '==', monthStr))),
        getDocs(query(
          collection(db, 'cash_transactions'), 
          where('date', '>=', start), 
          where('date', '<=', end),
          where('category', '==', 'salary')
        ))
      ]);

      const staffList = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
      const recordsList = recordsSnap.docs.map(doc => doc.data());
      const salariesList = salariesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalaryRecord));
      const cashList = cashSnap.docs.map(doc => doc.data() as CashTransaction);

      setStaff(staffList);

      const newSalaries: Record<string, Partial<SalaryRecord>> = {};
      
      staffList.forEach(s => {
        const staffRecords = recordsList.filter(r => 
          (r.driver_id === s.id || r.helper_id === s.id) && !r.is_holiday
        );
        const staffCash = cashList.filter(t => t.staff_id === s.id);

        const workingDays = staffRecords.length || 0;

        const totalPayableDuty = staffRecords.reduce((sum, r) => {
          if (r.driver_id === s.id) return sum + (r.driver_duty_payable || 0);
          if (r.helper_id === s.id) return sum + (r.helper_duty_payable || 0);
          return sum;
        }, 0);

        const totalPaidDuty = staffRecords.reduce((sum, r) => {
          if (r.driver_id === s.id) return sum + (r.driver_duty_paid || 0);
          if (r.helper_id === s.id) return sum + (r.helper_duty_paid || 0);
          return sum;
        }, 0);

        const totalCashPaid = staffCash.reduce((sum, t) => sum + (t.amount || 0), 0);

        const existingSalary = salariesList.find(sal => sal.staff_id === s.id);

        if (existingSalary) {
          newSalaries[s.id] = existingSalary;
        } else {
          newSalaries[s.id] = {
            staff_id: s.id,
            month: monthStr,
            working_days: workingDays,
            duty_amount: totalPayableDuty,
            fixed_salary: s.fixed_salary,
            advance: totalPaidDuty + totalCashPaid, // Daily paid duty + manual cash payments
            deductions: 0,
            net_payable: (s.fixed_salary || 0) + totalPayableDuty - (totalPaidDuty + totalCashPaid),
            status: 'pending'
          };
        }
      });

      setSalaries(newSalaries);
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
      
      // Recalculate net payable
      if (field === 'advance' || field === 'deductions') {
        updated.net_payable = (updated.fixed_salary || 0) + (updated.duty_amount || 0) - (updated.advance || 0) - (updated.deductions || 0);
      }
      
      return { ...prev, [staffId]: updated };
    });
  };

  const handleSave = async (staffId: string) => {
    setSaving(true);
    try {
      const salary = salaries[staffId];
      const recordId = `${staffId}_${salary.month}`;
      await setDoc(doc(db, 'salary_records', recordId), {
        ...salary,
        created_at: serverTimestamp()
      });

      // If marked as paid, record a cash transaction for any remaining balance
      if (salary.status === 'paid' && (salary.net_payable || 0) > 0) {
        const existingTx = await getDocs(query(
          collection(db, 'cash_transactions'),
          where('linked_id', '==', recordId)
        ));
        
        if (existingTx.empty) {
          const staffMember = staff.find(s => s.id === staffId);
          await addDoc(collection(db, 'cash_transactions'), {
            date: format(new Date(), 'yyyy-MM-dd'),
            type: 'out',
            category: 'salary',
            amount: salary.net_payable,
            description: `Salary payment for ${staffMember?.full_name} (${format(currentMonth, 'MMMM yyyy')})`,
            linked_id: recordId,
            created_at: serverTimestamp()
          });
        }
      }

      setMessage({ type: 'success', text: 'Salary record saved!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save salary' });
    } finally {
      setSaving(false);
    }
  };

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

                <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Working Days</p>
                    <p className="font-bold text-primary font-mono">{salary.working_days}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Duty Amount</p>
                    <p className="font-bold text-primary font-mono">{formatCurrency(salary.duty_amount || 0)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Fixed Salary</p>
                    <p className="font-bold text-primary font-mono">{formatCurrency(salary.fixed_salary || 0)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-accent uppercase tracking-widest">Net Payable</p>
                    <p className="text-xl font-bold text-accent font-mono tracking-tighter">{formatCurrency(salary.net_payable || 0)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-10 grid gap-6 border-t border-border pt-8 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <label className="label">Advance</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={salary.advance || ''}
                      onChange={(e) => handleSalaryChange(s.id, 'advance', parseInt(e.target.value) || 0)}
                      className="input font-mono"
                      placeholder="0"
                    />
                    <Wallet className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary stroke-[1.5px]" />
                  </div>
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
                  <select
                    value={salary.status}
                    onChange={(e) => handleSalaryChange(s.id, 'status', e.target.value)}
                    className="input"
                  >
                    <option value="pending">Pending Payment</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => handleSave(s.id)}
                    disabled={saving}
                    className="btn-primary w-full flex items-center justify-center space-x-2 !py-3"
                  >
                    {saving ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    ) : (
                      <Save className="h-4 w-4 stroke-[1.5px]" />
                    )}
                    <span>Save Record</span>
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
