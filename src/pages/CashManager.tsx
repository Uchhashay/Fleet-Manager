import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where, limit, setDoc, doc, getDocs } from 'firebase/firestore';
import { CashTransaction, Staff } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  History, 
  Filter,
  Download,
  Calendar,
  Tag,
  FileText,
  TrendingUp,
  TrendingDown,
  User
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuth } from '../contexts/AuthContext';

export function CashManager() {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeForm, setActiveForm] = useState<'in' | 'out' | null>(null);
  const [formData, setFormData] = useState({
    type: 'in' as 'in' | 'out',
    category: 'owner_transfer' as CashTransaction['category'],
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    staff_id: ''
  });

  const [stats, setStats] = useState({
    totalIn: 0,
    totalOut: 0,
    balance: 0
  });

  useEffect(() => {
    fetchStaff();
    
    let q = query(
      collection(db, 'cash_transactions'),
      orderBy('date', 'desc'),
      orderBy('created_at', 'desc'),
      limit(100)
    );

    if (profile?.role === 'accountant') {
      q = query(
        collection(db, 'cash_transactions'),
        where('created_by', '==', auth.currentUser?.uid),
        orderBy('date', 'desc'),
        orderBy('created_at', 'desc'),
        limit(100)
      );
    }

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashTransaction));
      setTransactions(data);

      const allIn = data.filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0);
      const allOut = data.filter(t => t.type === 'out').reduce((sum, t) => sum + t.amount, 0);
      setStats({
        totalIn: allIn,
        totalOut: allOut,
        balance: allIn - allOut
      });
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'cash_transactions');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile?.role]);

  async function fetchStaff() {
    try {
      const snap = await getDocs(query(collection(db, 'staff'), orderBy('full_name')));
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  }

  // Removed fetchTransactions as it's replaced by onSnapshot hook logic above

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.amount || !formData.description) return;

    try {
      const amount = Number(formData.amount);
      const docRef = await addDoc(collection(db, 'cash_transactions'), {
        ...formData,
        amount,
        created_by: auth.currentUser?.uid,
        created_at: serverTimestamp()
      });

      setActiveForm(null);
      setFormData({
        type: 'in',
        category: 'owner_transfer',
        amount: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        staff_id: ''
      });
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Cash Management</h1>
          <p className="text-secondary text-sm font-medium mt-1">Track cash in hand and miscellaneous expenses</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => {
              setFormData({ ...formData, type: 'in', category: 'owner_transfer' });
              setActiveForm(activeForm === 'in' ? null : 'in');
            }}
            className={cn(
              "btn-primary flex items-center space-x-2 bg-success hover:bg-success/90 border-none",
              activeForm === 'in' && "ring-2 ring-success ring-offset-2"
            )}
          >
            <ArrowDownLeft className="h-4 w-4 stroke-[2.5px]" />
            <span>Cash In</span>
          </button>
          <button 
            onClick={() => {
              setFormData({ ...formData, type: 'out', category: 'overhead' });
              setActiveForm(activeForm === 'out' ? null : 'out');
            }}
            className={cn(
              "btn-primary flex items-center space-x-2 bg-warning hover:bg-warning/90 border-none",
              activeForm === 'out' && "ring-2 ring-warning ring-offset-2"
            )}
          >
            <ArrowUpRight className="h-4 w-4 stroke-[2.5px]" />
            <span>Cash Out</span>
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-accent/5 border-accent/20"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent">Cash in Hand</p>
            <Wallet className="h-4 w-4 text-accent stroke-[1.5px]" />
          </div>
          <h3 className="text-3xl font-bold font-mono tracking-tighter text-primary">
            {formatCurrency(stats.balance)}
          </h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="label !mb-0">Total Received</p>
            <TrendingUp className="h-4 w-4 text-success stroke-[1.5px]" />
          </div>
          <h3 className="text-2xl font-bold font-mono tracking-tighter text-success">
            {formatCurrency(stats.totalIn)}
          </h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="label !mb-0">Total Spent</p>
            <TrendingDown className="h-4 w-4 text-warning stroke-[1.5px]" />
          </div>
          <h3 className="text-2xl font-bold font-mono tracking-tighter text-warning">
            {formatCurrency(stats.totalOut)}
          </h3>
        </motion.div>
      </div>

      {/* Inline Entry Form */}
      <AnimatePresence>
        {activeForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className={cn(
              "card border-2 transition-colors duration-500",
              activeForm === 'in' ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5"
            )}>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "h-10 w-10 rounded-2xl flex items-center justify-center",
                    activeForm === 'in' ? "bg-success text-surface" : "bg-warning text-surface"
                  )}>
                    {activeForm === 'in' ? <ArrowDownLeft className="h-6 w-6" /> : <ArrowUpRight className="h-6 w-6" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary tracking-tight">
                      {activeForm === 'in' ? 'Record Cash Inflow' : 'Record Cash Outflow'}
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
                      {activeForm === 'in' ? 'Money received into the system' : 'Miscellaneous business expenses'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveForm(null)}
                  className="btn-secondary !p-2 rounded-full"
                >
                  <Plus className="h-5 w-5 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <label className="label flex items-center space-x-2">
                    <Calendar className="h-3 w-3" />
                    <span>Date</span>
                  </label>
                  <input 
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="input bg-surface"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="label flex items-center space-x-2">
                    <Tag className="h-3 w-3" />
                    <span>Category</span>
                  </label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any, staff_id: '' })}
                    className="input bg-surface"
                    required
                  >
                      {activeForm === 'in' ? (
                        <>
                          <option value="owner_transfer">Received from Owner</option>
                          <option value="fee_collection">Fee Collection</option>
                          <option value="misc">Miscellaneous Income</option>
                        </>
                      ) : (
                        <>
                          <option value="salary">Salary Payment</option>
                          <option value="bus_expense">Bus Expense</option>
                          <option value="overhead">Overhead/Office Expense</option>
                          <option value="loan_payment">Loan Payment</option>
                          <option value="insurance">Insurance</option>
                          <option value="misc">Miscellaneous Expense</option>
                        </>
                      )}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="label flex items-center space-x-2">
                    <Wallet className="h-3 w-3" />
                    <span>Amount</span>
                  </label>
                  <input 
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="input bg-surface font-mono"
                    placeholder="0.00"
                    required
                  />
                </div>

                {formData.category === 'salary' && (
                  <div className="space-y-2 md:col-span-2 lg:col-span-1">
                    <label className="label flex items-center space-x-2">
                      <User className="h-3 w-3" />
                      <span>Select Staff Member</span>
                    </label>
                    <select 
                      value={formData.staff_id}
                      onChange={(e) => {
                        const s = staff.find(st => st.id === e.target.value);
                        setFormData({ 
                          ...formData, 
                          staff_id: e.target.value,
                          description: s ? `Salary payment for ${s.full_name}` : formData.description
                        });
                      }}
                      className="input bg-surface"
                      required
                    >
                      <option value="">Choose staff...</option>
                      {staff.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={cn(
                  "space-y-2",
                  formData.category === 'salary' ? "md:col-span-2 lg:col-span-2" : "md:col-span-2 lg:col-span-2"
                )}>
                  <label className="label flex items-center space-x-2">
                    <FileText className="h-3 w-3" />
                    <span>Description</span>
                  </label>
                  <input 
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input bg-surface"
                    placeholder="What was this for?"
                    required
                  />
                </div>

                <div className="flex items-end">
                  <button type="submit" className={cn(
                    "btn-primary w-full py-3.5 shadow-lg transition-all active:scale-95",
                    activeForm === 'in' ? "bg-success hover:bg-success/90 shadow-success/20" : "bg-warning hover:bg-warning/90 shadow-warning/20"
                  )}>
                    Save {activeForm === 'in' ? 'Income' : 'Expense'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction List */}
      <div className="card !p-0 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center space-x-2">
            <History className="h-4 w-4 text-secondary stroke-[1.5px]" />
            <h3 className="text-sm font-bold text-primary tracking-tight">Transaction History</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 text-secondary hover:text-primary transition-colors">
              <Filter className="h-4 w-4 stroke-[1.5px]" />
            </button>
            <button className="p-2 text-secondary hover:text-primary transition-colors">
              <Download className="h-4 w-4 stroke-[1.5px]" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                {profile?.role === 'admin' && <th>Recorded By</th>}
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, idx) => (
                <motion.tr 
                  key={t.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.01 }}
                >
                  <td className="text-secondary font-medium whitespace-nowrap">
                    {format(new Date(t.date), 'dd MMM yyyy')}
                  </td>
                  <td>
                    <span className={cn(
                      "badge uppercase tracking-widest text-[9px]",
                      t.type === 'in' ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    )}>
                      {t.category.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="text-primary font-medium">
                    {t.description}
                    {t.staff_id && (
                      <span className="block text-[10px] text-secondary mt-0.5">
                        Staff: {staff.find(s => s.id === t.staff_id)?.full_name || 'Unknown'}
                      </span>
                    )}
                  </td>
                  {profile?.role === 'admin' && (
                    <td className="text-secondary text-[10px] font-bold uppercase tracking-widest">
                      {t.created_by === auth.currentUser?.uid ? 'Me' : 'Staff'}
                    </td>
                  )}
                  <td className={cn(
                    "text-right font-bold font-mono",
                    t.type === 'in' ? "text-success" : "text-warning"
                  )}>
                    {t.type === 'in' ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                </motion.tr>
              ))}
              {transactions.length === 0 && !loading && (
                <tr>
                  <td colSpan={profile?.role === 'admin' ? 5 : 4} className="py-12 text-center text-secondary font-medium">No transactions recorded</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Removed in favor of inline forms */}
    </div>
  );
}
