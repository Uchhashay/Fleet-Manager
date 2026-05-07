import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, Timestamp, addDoc, serverTimestamp, orderBy, doc, getDoc, deleteDoc, orderBy as firestoreOrderBy } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Download, 
  Bus as BusIcon,
  Building2,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Filter,
  Wallet,
  GraduationCap,
  X,
  PlusCircle,
  User,
  Trash2,
  Landmark,
  Building2 as BankIcon
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { DailyRecord, BusExpense, CompanyExpense, CashTransaction, Staff, BankAccount, BankTransaction } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { logActivity } from '../lib/activity-logger';
import { fetchActiveBankAccounts } from '../lib/bank-utils';

import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';

interface LedgerEntry {
  id: string;
  date: string;
  type: 'Inflow' | 'Outflow';
  category: string;
  amount: number;
  description: string;
  source: 'Daily Entry' | 'Bus Expense' | 'Company Expense' | 'Fee Collection' | 'Manual Entry';
  paid_by?: 'owner' | 'accountant';
  staff_id?: string;
  linked_id?: string;
  running_balance?: number;
  created_by?: string;
  recorded_by?: string;
  created_at?: any;
}

export function Cashbook() {
  const { profile } = useAuth();
  const location = useLocation();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [totalCashInHand, setTotalCashInHand] = useState(0);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [accountants, setAccountants] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [viewMode, setViewMode] = useState<'accountant' | 'owner'>((profile?.role === 'admin' || profile?.role === 'developer') ? 'owner' : 'accountant');
  const [selectedAccountantId, setSelectedAccountantId] = useState<string>(auth.currentUser?.uid || '');
  const [activeForm, setActiveForm] = useState<'in' | 'out' | null>(null);
  const [filters, setFilters] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });

  const [ledgerMode, setLedgerMode] = useState<'cash' | 'bank'>('cash');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [bankEntries, setBankEntries] = useState<BankTransaction[]>([]);
  const [bankOpeningBalance, setBankOpeningBalance] = useState(0);
  const [bankRunningBalance, setBankRunningBalance] = useState(0);
  const [bankLoading, setBankLoading] = useState(false);

  const [formData, setFormData] = useState({
    type: 'in' as 'in' | 'out',
    category: 'owner_transfer' as CashTransaction['category'],
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    staff_id: '',
    paid_by: 'owner' as 'owner' | 'accountant'
  });

  useEffect(() => {
    if (profile?.role) {
      const defaultView = (profile.role === 'admin' || profile.role === 'developer') ? 'owner' : 'accountant';
      setViewMode(defaultView);
      setFormData(prev => ({
        ...prev,
        paid_by: defaultView
      }));
    }
  }, [profile?.role]);

  useEffect(() => {
    fetchLedger();
    fetchStaff();
  }, [filters, viewMode, selectedAccountantId]);

  useEffect(() => {
    if (ledgerMode === 'bank') {
      fetchActiveBankAccounts().then(accounts => {
        setBankAccounts(accounts);
        if (accounts.length > 0 && !selectedBankAccountId) {
          setSelectedBankAccountId(accounts[0].id);
        }
      });
    }
  }, [ledgerMode]);

  useEffect(() => {
    if (!selectedBankAccountId || ledgerMode !== 'bank') return;
    fetchBankLedger();
  }, [selectedBankAccountId, filters, ledgerMode]);

  async function fetchBankLedger() {
    setBankLoading(true);
    try {
      const account = bankAccounts.find(a => a.id === selectedBankAccountId);
      if (!account) return;

      const allTxSnap = await getDocs(query(
        collection(db, 'bank_transactions'),
        where('account_id', '==', selectedBankAccountId),
        firestoreOrderBy('date', 'asc')
      ));

      const allTx = allTxSnap.docs.map(d => ({ id: d.id, ...d.data() } as BankTransaction));

      // Opening balance = account opening_balance + all transactions before startDate
      let openingBal = account.opening_balance;
      allTx.forEach(tx => {
        if (tx.date < filters.startDate) {
          openingBal = tx.type === 'in' ? openingBal + tx.amount : openingBal - tx.amount;
        }
      });
      setBankOpeningBalance(openingBal);

      // Filter to date range
      const filtered = allTx.filter(tx => tx.date >= filters.startDate && tx.date <= filters.endDate);

      // Compute running balance
      let running = openingBal;
      const withRunning = filtered.map(tx => {
        running = tx.type === 'in' ? running + tx.amount : running - tx.amount;
        return { ...tx, running_balance: running };
      });
      setBankRunningBalance(running);
      setBankEntries(withRunning.reverse()); // newest first for display
    } catch (error) {
      console.error('Error fetching bank ledger:', error);
    } finally {
      setBankLoading(false);
    }
  }

  useEffect(() => {
    const state = location.state as { action?: 'in' | 'out' };
    if (state?.action) {
      setActiveForm(state.action);
      setFormData(prev => ({
        ...prev,
        type: state.action!,
        category: state.action === 'in' ? 'owner_transfer' : 'salary',
        paid_by: (profile?.role === 'admin' || profile?.role === 'developer') ? 'owner' : 'accountant'
      }));
    }
  }, [location.state, profile?.role]);

  async function fetchStaff() {
    try {
      const snap = await getDocs(query(collection(db, 'staff'), orderBy('full_name')));
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  }

  async function fetchLedger() {
    setLoading(true);
    try {
      const { startDate, endDate } = filters;

      // Get global opening balance from settings
      const settingsDoc = await getDoc(doc(db, 'settings', 'opening_balances'));
      const openingBalances = settingsDoc.exists() ? settingsDoc.data() : { owner: 0, accountant: 0 };
      
      const isOwner = profile?.role === 'admin' || profile?.role === 'developer';
      const targetUid = isOwner ? selectedAccountantId : profile?.id;
      
      // 1. Get ALL transactions
      const masterCashSnap = await getDocs(collection(db, 'cash_transactions'));
      
      // Accountant view: only their own transactions
      // Owner view: EVERYTHING for total cash in hand, or filtered if they want specific accountant
      let masterBalance = 0;
      if (viewMode === 'owner') {
        masterBalance = Number(openingBalances.owner || 0);
        masterCashSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.type === 'in') masterBalance += Number(data.amount || 0);
          else masterBalance -= Number(data.amount || 0);
        });
      } else {
        masterBalance = Number(openingBalances.accountant || 0);
        masterCashSnap.docs.forEach(doc => {
          const data = doc.data();
          if ((data.paid_by === 'accountant' || !data.paid_by) && (data.created_by === targetUid || !targetUid)) {
            if (data.type === 'in') masterBalance += Number(data.amount || 0);
            else masterBalance -= Number(data.amount || 0);
          }
        });
      }
      setTotalCashInHand(masterBalance);

      // 2. Calculate Opening Balance for the filtered list (everything before startDate)
      let listRunningBal = viewMode === 'owner' ? Number(openingBalances.owner || 0) : Number(openingBalances.accountant || 0);
      masterCashSnap.docs.forEach(doc => {
        const data = doc.data();
        const matchesView = viewMode === 'owner' || ((data.paid_by === 'accountant' || !data.paid_by) && (data.created_by === targetUid || !targetUid));
        
        if (matchesView && data.date < startDate) {
          const amount = Number(data.amount || 0);
          if (data.type === 'in') listRunningBal += amount;
          else listRunningBal -= amount;
        }
      });
      setOpeningBalance(listRunningBal);

      // 3. Get transactions for the CURRENT range to show in the list
      const ledgerEntries: LedgerEntry[] = masterCashSnap.docs
        .map(doc => {
          const data = doc.data();
          const category = data.category || 'misc';
          const normalizedCategory = category.toLowerCase().replace('_', ' ');
          
          // Better source detection
          let source: LedgerEntry['source'] = 'Manual Entry';
          if (data.source === 'daily_entry' || data.linked_id?.startsWith('DE-') || data.source_module === 'Daily Entry') source = 'Daily Entry';
          else if (category === 'salary' || category === 'salary_advance' || category === 'duty_payment') source = 'Manual Entry'; // Will label as Staff Payment
          else if (data.category === 'bus_expense' || (data.linked_id && !data.category?.includes('salary'))) source = 'Bus Expense';
          else if (data.category === 'fee_collection' || data.source_module === 'Fee Collection') source = 'Fee Collection';
          else if (data.category === 'office_expense' || data.source_module === 'Company Expense') source = 'Company Expense';

          if (category.includes('salary') || category.includes('duty_payment')) {
            source = 'Manual Entry'; // Use manual to allow editing/deletion but we can label it specifically if needed
          }

          // Description enrichment
          let description = data.description || '';
          if (data.staff_id) {
            const s = staff.find(st => st.id === data.staff_id);
            if (s && !description.includes(s.full_name)) {
              description = `${description} [${s.full_name}]`.trim();
            }
          }

          const recordRole = data.paid_by || 'accountant';
          const matchesView = viewMode === 'owner' || (recordRole === 'accountant' && (data.created_by === targetUid || !targetUid));

          return {
            id: doc.id,
            date: data.date,
            type: data.type === 'in' ? 'Inflow' : 'Outflow',
            category: normalizedCategory.charAt(0).toUpperCase() + normalizedCategory.slice(1),
            amount: Number(data.amount) || 0,
            description,
            source: data.source_module || source,
            paid_by: recordRole,
            staff_id: data.staff_id,
            linked_id: data.linked_id,
            created_at: data.created_at,
            created_by: data.created_by
          } as LedgerEntry;
        })
        .filter(e => {
          const recordRole = e.paid_by || 'accountant';
          const matchesView = viewMode === 'owner' || (recordRole === 'accountant' && (e.created_by === targetUid || !targetUid));
          return matchesView && e.date >= startDate && e.date <= endDate;
        })
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          const aTime = a.created_at instanceof Timestamp ? a.created_at.toMillis() : 0;
          const bTime = b.created_at instanceof Timestamp ? b.created_at.toMillis() : 0;
          return aTime - bTime;
        });

      // 4. Calculate running balance for the list entries
      ledgerEntries.forEach(entry => {
        if (entry.type === 'Inflow') listRunningBal += entry.amount;
        else listRunningBal -= entry.amount;
        entry.running_balance = listRunningBal;
      });

      // 5. Sort descending for display
      ledgerEntries.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        const aTime = a.created_at instanceof Timestamp ? a.created_at.toMillis() : 0;
        const bTime = b.created_at instanceof Timestamp ? b.created_at.toMillis() : 0;
        return bTime - aTime;
      });

      setEntries(ledgerEntries);
    } catch (error) {
      console.error('Error fetching ledger:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.amount || !formData.description) return;
    if ((formData.category === 'salary' || formData.category === 'salary_advance' || formData.category === 'duty_payment') && !formData.staff_id) {
      alert('Please select a staff member');
      return;
    }

    try {
      const amount = Number(formData.amount);
      const transactionData: any = {
        ...formData,
        amount,
        created_by: auth.currentUser?.uid,
        created_at: serverTimestamp()
      };

      // If it's a salary-related payment, add linked_id for SalaryManager compatibility
      if ((formData.category === 'salary' || formData.category === 'salary_advance' || formData.category === 'duty_payment') && formData.staff_id) {
        const monthStr = format(new Date(formData.date), 'yyyy-MM');
        transactionData.linked_id = `${formData.staff_id}_${monthStr}`;
      }

      await addDoc(collection(db, 'cash_transactions'), transactionData);

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Cashbook',
          `Created manual ${formData.type === 'in' ? 'inflow' : 'outflow'} of ${formatCurrency(amount)}: ${formData.description}`
        );
      }

      setActiveForm(null);
      setFormData({
        type: 'in',
        category: 'owner_transfer',
        amount: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        staff_id: '',
        paid_by: (profile?.role === 'admin' || profile?.role === 'developer') ? 'owner' : 'accountant'
      });
      fetchLedger();
    } catch (error) {
      console.error('Error adding transaction:', error);
      handleFirestoreError(error, OperationType.CREATE, 'cash_transactions');
    }
  }

  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Category', 'Source', 'Amount', 'Description'];
    const rows = entries.map(e => [
      e.date,
      e.type,
      e.category,
      e.source,
      e.amount,
      e.description
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `cashbook_${filters.startDate}_to_${filters.endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totals = entries.reduce((acc, e) => {
    if (e.type === 'Inflow') acc.inflow += e.amount;
    else acc.outflow += e.amount;
    return acc;
  }, { inflow: 0, outflow: 0 });

  const netBalance = totals.inflow - totals.outflow;

  const bankTotals = bankEntries.reduce((acc, e) => {
    if (e.type === 'in') acc.inflow += e.amount;
    else acc.outflow += e.amount;
    return acc;
  }, { inflow: 0, outflow: 0 });

  const bankNetBalance = bankTotals.inflow - bankTotals.outflow;

  async function handleDeleteEntry(entry: LedgerEntry) {
    if (!confirm(`Are you sure you want to delete this ${entry.source} entry?`)) return;
    
    try {
      let collectionName = '';
      let docId = entry.id;

      if (entry.source === 'Manual Entry') {
        collectionName = 'cash_transactions';
      } else if (entry.source === 'Daily Entry') {
        collectionName = 'daily_records';
        docId = entry.id.split('-')[0]; // Remove -in or -out
      } else if (entry.source === 'Bus Expense') {
        collectionName = 'bus_expenses';
      } else if (entry.source === 'Company Expense') {
        collectionName = 'company_expenses';
      } else if (entry.source === 'Fee Collection') {
        collectionName = 'fee_collections';
      }

      if (collectionName) {
        await deleteDoc(doc(db, collectionName, docId));
        
        // Log activity
        if (profile) {
          await logActivity(
            profile.full_name,
            profile.role,
            'Deleted',
            'Cashbook',
            `Deleted ${entry.source} entry: ${entry.description} (${formatCurrency(entry.amount)})`
          );
        }
        
        setMessage({ type: 'success', text: 'Entry deleted successfully' });
        fetchLedger();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'ledger');
    }
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <Wallet className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Financial Ledger</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Cashbook</h1>
        </div>
        <div className="flex items-center space-x-3">
          {(profile?.role === 'admin' || profile?.role === 'developer') && (
            <div className="flex bg-surface p-1.5 rounded-xl border border-border shadow-inner mr-2">
              <button
                onClick={() => setViewMode('accountant')}
                className={cn(
                  "px-6 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300",
                  viewMode === 'accountant' 
                    ? "bg-primary text-background shadow-lg scale-105" 
                    : "text-secondary hover:text-primary hover:bg-primary/5"
                )}
              >
                Accountant
              </button>
              <button
                onClick={() => setViewMode('owner')}
                className={cn(
                  "px-6 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all duration-300",
                  viewMode === 'owner' 
                    ? "bg-primary text-background shadow-lg scale-105" 
                    : "text-secondary hover:text-primary hover:bg-primary/5"
                )}
              >
                Owner
              </button>
            </div>
          )}
          
          <button
            onClick={exportToCSV}
            className="btn-secondary flex items-center space-x-2 !px-6"
          >
            <Download className="h-4 w-4 stroke-[1.5px]" />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-xl border flex items-center justify-between",
            message.type === 'success' ? "bg-success/10 border-success/20 text-success" :
            message.type === 'error' ? "bg-danger/10 border-danger/20 text-danger" :
            "bg-accent/10 border-accent/20 text-accent"
          )}
        >
          <div className="flex items-center space-x-3">
            <div className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center",
              message.type === 'success' ? "bg-success text-background" :
              message.type === 'error' ? "bg-danger text-background" :
              "bg-accent text-background"
            )}>
              <Receipt className="h-4 w-4" />
            </div>
            <p className="text-sm font-bold">{message.text}</p>
          </div>
          <button onClick={() => setMessage(null)} className="p-1 hover:bg-black/5 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {/* Quick Action Buttons */}
      {(profile?.role === 'admin' || profile?.role === 'accountant' || profile?.role === 'developer') && (
        <div className="grid gap-6 sm:grid-cols-2">
          <motion.button
            whileHover={{ y: -4, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if ((profile?.role === 'admin' || profile?.role === 'developer') && viewMode === 'accountant') {
                setMessage({ type: 'info', text: 'Please toggle to "Owner" mode to record cash entries.' });
                setTimeout(() => setMessage(null), 5000);
                return;
              }
              setFormData({ 
                ...formData, 
                type: 'in', 
                category: 'owner_transfer', 
                paid_by: (profile?.role === 'admin' || profile?.role === 'developer') ? 'owner' : 'accountant' 
              });
              setActiveForm(activeForm === 'in' ? null : 'in');
            }}
            className={cn(
              "group relative overflow-hidden card border-2 text-left transition-all duration-500",
              activeForm === 'in' 
                ? "border-success bg-success/5 shadow-2xl shadow-success/20 scale-[1.02] z-10" 
                : "border-transparent bg-surface hover:border-success/30 hover:shadow-xl"
            )}
          >
            {/* Background Pattern */}
            <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
              <ArrowUpRight className="h-32 w-32 -mb-8 -mr-8 rotate-12" />
            </div>

            <div className="flex items-center space-x-6 relative z-10">
              <div className={cn(
                "h-20 w-20 rounded-3xl flex items-center justify-center transition-all duration-500 shadow-lg",
                activeForm === 'in' 
                  ? "bg-success text-background rotate-12 scale-110" 
                  : "bg-success/10 text-success group-hover:bg-success group-hover:text-background group-hover:rotate-6"
              )}>
                <ArrowUpRight className="h-10 w-10 stroke-[2.5px]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-primary tracking-tight">Record Cash In</h3>
                <p className="text-sm text-secondary font-medium max-w-[200px] leading-tight">Add capital, transfers, or miscellaneous income</p>
              </div>
            </div>
            {activeForm === 'in' && (
              <div className="absolute top-6 right-6 h-3 w-3 rounded-full bg-success animate-ping" />
            )}
          </motion.button>

          <motion.button
            whileHover={{ y: -4, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if ((profile?.role === 'admin' || profile?.role === 'developer') && viewMode === 'accountant') {
                setMessage({ type: 'info', text: 'Please toggle to "Owner" mode to record cash entries.' });
                setTimeout(() => setMessage(null), 5000);
                return;
              }
              setFormData({ 
                ...formData, 
                type: 'out', 
                category: 'salary', 
                paid_by: (profile?.role === 'admin' || profile?.role === 'developer') ? 'owner' : 'accountant' 
              });
              setActiveForm(activeForm === 'out' ? null : 'out');
            }}
            className={cn(
              "group relative overflow-hidden card border-2 text-left transition-all duration-500",
              activeForm === 'out' 
                ? "border-warning bg-warning/5 shadow-2xl shadow-warning/20 scale-[1.02] z-10" 
                : "border-transparent bg-surface hover:border-warning/30 hover:shadow-xl"
            )}
          >
            {/* Background Pattern */}
            <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
              <ArrowDownRight className="h-32 w-32 -mb-8 -mr-8 -rotate-12" />
            </div>

            <div className="flex items-center space-x-6 relative z-10">
              <div className={cn(
                "h-20 w-20 rounded-3xl flex items-center justify-center transition-all duration-500 shadow-lg",
                activeForm === 'out' 
                  ? "bg-warning text-background -rotate-12 scale-110" 
                  : "bg-warning/10 text-warning group-hover:bg-warning group-hover:text-background group-hover:-rotate-6"
              )}>
                <ArrowDownRight className="h-10 w-10 stroke-[2.5px]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-primary tracking-tight">Record Cash Out</h3>
                <p className="text-sm text-secondary font-medium max-w-[200px] leading-tight">Record expenses, salaries, or office overheads</p>
              </div>
            </div>
            {activeForm === 'out' && (
              <div className="absolute top-6 right-6 h-3 w-3 rounded-full bg-warning animate-ping" />
            )}
          </motion.button>
        </div>
      )}

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
                    {activeForm === 'in' ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary tracking-tight">
                      {activeForm === 'in' ? `Record ${formData.paid_by === 'owner' ? 'Owner' : 'Accountant'} Cash In` : `Record ${formData.paid_by === 'owner' ? 'Owner' : 'Accountant'} Cash Out`}
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
                      {activeForm === 'in' ? `Money added by ${formData.paid_by}` : `Expenses paid by ${formData.paid_by}`}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveForm(null)}
                  className="p-2 hover:bg-surface rounded-full transition-colors text-secondary hover:text-primary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                    <Filter className="h-3 w-3" />
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
                          <option value="owner_transfer">Owner Capital/Transfer</option>
                          <option value="misc">Miscellaneous Income</option>
                        </>
                      ) : (
                        <>
                          <option value="salary">Salary Payment</option>
                          <option value="salary_advance">Salary Advance</option>
                          <option value="duty_payment">Duty Payment</option>
                          <option value="misc">Miscellaneous</option>
                        </>
                      )}
                  </select>
                </div>

                {(formData.category === 'salary' || formData.category === 'salary_advance' || formData.category === 'duty_payment') && (
                  <div className="space-y-2">
                    <label className="label flex items-center space-x-2">
                      <User className="h-3 w-3" />
                      <span>Staff Member</span>
                    </label>
                    <select 
                      value={formData.staff_id}
                      onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })}
                      className="input bg-surface"
                      required
                    >
                      <option value="">Select Staff</option>
                      {staff.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                      ))}
                    </select>
                  </div>
                )}

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

                <div className="space-y-2 md:col-span-2 lg:col-span-2">
                  <label className="label flex items-center space-x-2">
                    <Filter className="h-3 w-3" />
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

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setLedgerMode('cash')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${ledgerMode === 'cash' ? 'bg-accent text-white' : 'bg-surface text-secondary'}`}
        >
          <Wallet className="h-4 w-4" /> Cash Ledger
        </button>
        <button
          onClick={() => setLedgerMode('bank')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${ledgerMode === 'bank' ? 'bg-accent text-white' : 'bg-surface text-secondary'}`}
        >
          <Landmark className="h-4 w-4" /> Bank Ledger
        </button>
      </div>

      {/* Filters & Summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="lg:col-span-2 card flex flex-col justify-between border-2 border-border/50 bg-surface/50 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2 text-secondary">
                <Calendar className="h-4 w-4 stroke-[1.5px]" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Filters</span>
              </div>
              {(profile?.role === 'admin' || profile?.role === 'developer') && viewMode === 'accountant' && (
                <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-left-4 duration-500">
                  <div className="h-4 w-[1px] bg-border mx-2" />
                  <User className="h-4 w-4 text-accent" />
                  <select
                    value={selectedAccountantId}
                    onChange={(e) => setSelectedAccountantId(e.target.value)}
                    className="bg-transparent border-none text-[10px] font-bold uppercase tracking-widest focus:ring-0 cursor-pointer text-primary"
                  >
                    <option value={auth.currentUser?.uid}>My Ledger</option>
                    {accountants.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.full_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">From Date</label>
              <div className="relative group">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="input pr-10 bg-background border-border/50 group-hover:border-accent/50 transition-colors"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary group-hover:text-accent transition-colors pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">To Date</label>
              <div className="relative group">
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="input pr-10 bg-background border-border/50 group-hover:border-accent/50 transition-colors"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary group-hover:text-accent transition-colors pointer-events-none" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="card bg-primary border-none flex flex-col justify-between relative overflow-hidden group"
        >
          {/* Decorative background element */}
          <div className="absolute -right-8 -top-8 h-32 w-32 bg-background/5 rounded-full blur-3xl group-hover:bg-background/10 transition-colors duration-500" />
          
          {ledgerMode === 'cash' ? (
            <>
              <div className="flex items-center justify-between mb-8 relative z-10">
                <div className="h-10 w-10 rounded-xl bg-background/10 flex items-center justify-center text-background shadow-inner">
                  <Wallet className="h-5 w-5 stroke-[1.5px]" />
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-background/60 uppercase tracking-widest block">Current Balance</span>
                  <span className="text-[10px] font-medium text-background/40">{viewMode === 'owner' ? "Owner's Total Cash" : "Accountant's Total Cash"}</span>
                </div>
              </div>
              <div className="relative z-10">
                <h3 className="text-4xl font-bold text-background tracking-tighter font-mono mb-6">
                  {formatCurrency(totalCashInHand)}
                </h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6 border-t border-background/10 pt-6">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-background/40" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Opening Bal.</p>
                    </div>
                    <p className="text-sm font-bold text-background/80 font-mono">{formatCurrency(openingBalance)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Period Net</p>
                    </div>
                    <p className="text-sm font-bold text-accent font-mono">{formatCurrency(totals.inflow - totals.outflow)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Closing Bal.</p>
                    </div>
                    <p className="text-sm font-bold text-background/80 font-mono">{formatCurrency(openingBalance + totals.inflow - totals.outflow)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-success" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Period Inflow</p>
                    </div>
                    <p className="text-sm font-bold text-success font-mono">{formatCurrency(totals.inflow)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-warning" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Period Outflow</p>
                    </div>
                    <p className="text-sm font-bold text-warning font-mono">{formatCurrency(totals.outflow)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-8 relative z-10">
                <div className="h-10 w-10 rounded-xl bg-background/10 flex items-center justify-center text-background shadow-inner">
                  <Landmark className="h-5 w-5 stroke-[1.5px]" />
                </div>
                <div className="text-right flex-1 ml-4">
                  <span className="text-[10px] font-bold text-background/60 uppercase tracking-widest block">Bank Account</span>
                  <select
                    className="bg-transparent border-none text-lg font-bold text-background p-0 m-0 focus:ring-0 cursor-pointer w-full text-right"
                    value={selectedBankAccountId}
                    onChange={e => setSelectedBankAccountId(e.target.value)}
                  >
                    {bankAccounts.map(a => (
                      <option key={a.id} value={a.id} className="text-primary">
                        {a.account_name} — ****{a.account_number_last4}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="relative z-10">
                <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-background/40" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Opening Bal.</p>
                    </div>
                    <p className="text-sm font-bold text-background/80 font-mono">{formatCurrency(bankOpeningBalance)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Period Net</p>
                    </div>
                    <p className={cn(
                      "text-sm font-bold font-mono",
                      bankNetBalance < 0 ? "text-danger-light" : "text-accent"
                    )}>
                      {formatCurrency(bankNetBalance)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Closing Bal.</p>
                    </div>
                    <p className={cn(
                      "text-sm font-bold font-mono",
                      bankRunningBalance < 0 ? "text-danger-light" : "text-background/80"
                    )}>
                      {formatCurrency(bankRunningBalance)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-success" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Period Inflow</p>
                    </div>
                    <p className="text-sm font-bold text-success font-mono">{formatCurrency(bankTotals.inflow)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-warning" />
                      <p className="text-[9px] font-bold uppercase text-background/40 tracking-wider">Period Outflow</p>
                    </div>
                    <p className="text-sm font-bold text-warning font-mono">{formatCurrency(bankTotals.outflow)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Ledger Table */}
      {ledgerMode === 'cash' && (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Cash in Hand</th>
                  {profile?.role === 'admin' && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mx-auto"></div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {entries.map((entry, idx) => (
                      <motion.tr 
                        key={entry.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.02 }}
                      >
                        <td className="text-secondary font-medium whitespace-nowrap">
                          {format(new Date(entry.date), 'dd MMM yyyy')}
                        </td>
                        <td>
                          <div className="flex items-center space-x-2">
                            <div className={cn(
                              "h-6 w-6 rounded-full flex items-center justify-center",
                              entry.source === 'Daily Entry' ? "bg-accent/10 text-accent" : 
                              entry.source === 'Bus Expense' ? "bg-warning/10 text-warning" : 
                              entry.source === 'Fee Collection' ? "bg-success/10 text-success" :
                              entry.source === 'Manual Entry' ? "bg-primary/10 text-primary" :
                              "bg-secondary/10 text-secondary"
                            )}>
                              {entry.source === 'Daily Entry' ? <BusIcon className="h-3 w-3 stroke-[1.5px]" /> : 
                              entry.source === 'Bus Expense' ? <Receipt className="h-3 w-3 stroke-[1.5px]" /> : 
                              entry.source === 'Fee Collection' ? <GraduationCap className="h-3 w-3 stroke-[1.5px]" /> :
                              entry.source === 'Manual Entry' ? <Wallet className="h-3 w-3 stroke-[1.5px]" /> :
                              <Building2 className="h-3 w-3 stroke-[1.5px]" />}
                            </div>
                            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{entry.source}</span>
                          </div>
                        </td>
                        <td>
                          <span className="font-bold text-primary">{entry.category}</span>
                        </td>
                        <td className="max-w-xs">
                          <div className="flex flex-col">
                            <span className="text-secondary font-medium truncate">{entry.description}</span>
                            {entry.staff_id && (
                              <span className="text-[9px] text-accent font-bold uppercase tracking-wider mt-0.5">
                                Staff: {staff.find(s => s.id === entry.staff_id)?.full_name || 'Unknown'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={cn(
                          "text-right font-bold font-mono",
                          entry.type === 'Inflow' ? "text-success" : "text-danger"
                        )}>
                          <div className="flex items-center justify-end space-x-1">
                            <span>{entry.type === 'Inflow' ? '+' : '-'}{formatCurrency(entry.amount)}</span>
                            {entry.type === 'Inflow' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          </div>
                        </td>
                        <td className="text-right font-bold font-mono text-primary">
                          {formatCurrency(entry.running_balance || 0)}
                        </td>
                        {profile?.role === 'admin' && (
                          <td className="text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteEntry(entry);
                              }}
                              className="p-2 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                              title="Delete Entry"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </motion.tr>
                    ))}
                    
                    {entries.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-secondary font-medium">
                          No entries found for this period
                        </td>
                      </tr>
                    )}

                    {/* Opening Balance Row */}
                    <tr className="bg-surface/30 border-t-2 border-border/50">
                      <td className="text-secondary font-bold italic">Before {format(new Date(filters.startDate), 'dd MMM yyyy')}</td>
                      <td colSpan={3} className="text-center text-[10px] font-bold uppercase tracking-widest text-secondary/50">Opening Balance Brought Forward</td>
                      <td className="text-right font-bold font-mono text-secondary italic">
                        {formatCurrency(openingBalance)}
                      </td>
                      <td className="text-right font-bold font-mono text-primary italic">
                        {formatCurrency(openingBalance)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ledgerMode === 'bank' && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Opening Balance</p>
              <p className="font-mono font-bold text-primary">{formatCurrency(bankOpeningBalance)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Closing Balance</p>
              <p className={`font-mono font-bold ${bankRunningBalance < 0 ? 'text-danger' : 'text-primary'}`}>
                {formatCurrency(bankRunningBalance)}
              </p>
            </div>
          </div>
          {bankLoading ? (
            <div className="text-center py-8 text-secondary text-sm">Loading...</div>
          ) : bankEntries.length === 0 ? (
            <div className="text-center py-8 text-secondary text-sm">No transactions in this period</div>
          ) : (
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Mode</th>
                  <th>Reference</th>
                  <th className="text-right">In</th>
                  <th className="text-right">Out</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {bankEntries.map(tx => (
                  <tr key={tx.id}>
                    <td className="text-xs">{tx.date}</td>
                    <td className="text-xs">{tx.description}</td>
                    <td className="text-xs font-bold">{tx.payment_mode}</td>
                    <td className="text-xs text-secondary">{tx.reference_number || '—'}</td>
                    <td className="text-xs text-right font-mono text-success">
                      {tx.type === 'in' ? formatCurrency(tx.amount) : '—'}
                    </td>
                    <td className="text-xs text-right font-mono text-danger">
                      {tx.type === 'out' ? formatCurrency(tx.amount) : '—'}
                    </td>
                    <td className={`text-xs text-right font-mono font-bold ${(tx as any).running_balance < 0 ? 'text-danger' : 'text-primary'}`}>
                      {formatCurrency((tx as any).running_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
