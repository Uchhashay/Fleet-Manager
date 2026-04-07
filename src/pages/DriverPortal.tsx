import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { SalaryRecord } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Calendar, 
  DollarSign, 
  History, 
  ChevronRight,
  CheckCircle2,
  User,
  Activity,
  TrendingUp,
  Wallet,
  ArrowUpRight
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export function DriverPortal() {
  const { user, profile } = useAuth();
  const [currentSalary, setCurrentSalary] = useState<Partial<SalaryRecord> | null>(null);
  const [history, setHistory] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDriverData();
    }
  }, [user]);

  async function fetchDriverData() {
    setLoading(true);
    try {
      const monthStr = format(new Date(), 'yyyy-MM');
      
      // Find staff ID for this user (assuming full_name matches for now, or we need a staff_id in profile)
      const staffSnap = await getDocs(query(collection(db, 'staff'), where('full_name', '==', profile?.full_name)));
      const staffDoc = staffSnap.docs[0];
      
      if (staffDoc) {
        const staffId = staffDoc.id;
        
        // Fetch current month salary
        const salarySnap = await getDocs(query(
          collection(db, 'salary_records'),
          where('staff_id', '==', staffId),
          where('month', '==', monthStr)
        ));
        
        if (!salarySnap.empty) {
          setCurrentSalary(salarySnap.docs[0].data() as SalaryRecord);
        }

        // Fetch history
        const historySnap = await getDocs(query(
          collection(db, 'salary_records'),
          where('staff_id', '==', staffId),
          orderBy('month', 'desc'),
          limit(6)
        ));
        
        setHistory(historySnap.docs.map(doc => doc.data() as SalaryRecord));
      }
    } catch (error) {
      console.error('Error fetching driver data:', error);
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
            <User className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Staff Dashboard</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Welcome, {profile?.full_name}</h1>
          <p className="text-sm text-secondary">Here is your duty and salary overview for {format(new Date(), 'MMMM yyyy')}</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-bold uppercase tracking-widest">
            {profile?.role}
          </div>
          <div className="h-8 w-8 rounded-full bg-surface border border-border flex items-center justify-center">
            <Activity className="h-4 w-4 text-secondary stroke-[1.5px]" />
          </div>
        </div>
      </header>

      {/* Current Month Stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <div className="flex items-center space-x-2 text-secondary mb-6">
            <Calendar className="h-4 w-4 stroke-[1.5px] text-accent" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Working Days</span>
          </div>
          <h3 className="text-3xl font-bold text-primary tracking-tighter font-mono">{currentSalary?.working_days || 0}</h3>
          <p className="mt-2 text-[10px] font-medium text-secondary uppercase tracking-widest">Current Month</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <div className="flex items-center space-x-2 text-secondary mb-6">
            <TrendingUp className="h-4 w-4 stroke-[1.5px] text-success" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Duty Earned</span>
          </div>
          <h3 className="text-3xl font-bold text-primary tracking-tighter font-mono">{formatCurrency(currentSalary?.duty_amount || 0)}</h3>
          <p className="mt-2 text-[10px] font-medium text-secondary uppercase tracking-widest">Based on duty rate</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card bg-accent text-white border-none shadow-xl shadow-accent/20"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2 opacity-80">
              <Wallet className="h-4 w-4 stroke-[1.5px]" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Net Receivable</span>
            </div>
            <ArrowUpRight className="h-4 w-4 opacity-50" />
          </div>
          <h3 className="text-3xl font-bold tracking-tighter font-mono">{formatCurrency(currentSalary?.net_payable || 0)}</h3>
          <p className="mt-2 text-[10px] font-medium text-white/60 uppercase tracking-widest">Final Payout</p>
        </motion.div>
      </div>

      {/* Salary History */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-lg bg-surface flex items-center justify-center border border-border">
              <History className="h-4 w-4 text-secondary stroke-[1.5px]" />
            </div>
            <h3 className="text-lg font-bold text-primary tracking-tight">Salary History</h3>
          </div>
          <div className="h-px flex-1 bg-border/50 mx-6 hidden sm:block" />
          <div className="flex items-center space-x-2 text-secondary">
            <span className="text-[10px] font-bold uppercase tracking-widest">Last 6 Months</span>
          </div>
        </div>

        <div className="card !p-0 overflow-hidden border-border/50">
          <div className="divide-y divide-border/50">
            <AnimatePresence mode="popLayout">
              {history.length > 0 ? history.map((item, idx) => (
                <motion.div 
                  key={item.month}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center justify-between p-6 hover:bg-surface transition-colors group"
                >
                  <div className="flex items-center space-x-5">
                    <div className="h-12 w-12 rounded-2xl bg-surface border border-border flex items-center justify-center text-secondary group-hover:border-accent/30 group-hover:text-accent transition-all">
                      <Calendar className="h-5 w-5 stroke-[1.5px]" />
                    </div>
                    <div>
                      <p className="font-bold text-primary tracking-tight">{format(new Date(item.month + '-01'), 'MMMM yyyy')}</p>
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mt-1">{item.working_days} Days Worked</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-8">
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary font-mono tracking-tighter">{formatCurrency(item.net_payable)}</p>
                      <div className="flex items-center justify-end space-x-1.5 mt-1">
                        {item.status === 'paid' ? (
                          <>
                            <div className="h-1 w-1 rounded-full bg-success animate-pulse" />
                            <span className="text-[9px] font-bold text-success uppercase tracking-widest">Paid</span>
                          </>
                        ) : (
                          <>
                            <div className="h-1 w-1 rounded-full bg-warning animate-pulse" />
                            <span className="text-[9px] font-bold text-warning uppercase tracking-widest">Pending</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-surface border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                      <ChevronRight className="h-4 w-4 text-secondary stroke-[1.5px]" />
                    </div>
                  </div>
                </motion.div>
              )) : (
                <div className="p-20 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-surface border border-border flex items-center justify-center mx-auto">
                    <History className="h-5 w-5 text-secondary/30 stroke-[1.5px]" />
                  </div>
                  <p className="text-sm font-medium text-secondary">No salary history found</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
