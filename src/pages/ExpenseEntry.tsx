import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  writeBatch, 
  doc, 
  updateDoc, 
  deleteDoc, 
  where, 
  Timestamp,
  getDoc,
  limit
} from 'firebase/firestore';
import { Bus, Staff, BankAccount, PaymentMode } from '../types';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { logActivity } from '../lib/activity-logger';
import { recordBankTransaction, reverseBankTransaction, fetchActiveBankAccounts } from '../lib/bank-utils';
import { 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  Building2, 
  Bus as BusIcon,
  Receipt,
  Calendar,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  FileText,
  History,
  PlusCircle,
  Filter,
  Download,
  Search,
  Pencil,
  Trash2,
  X,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface ExpenseRecord {
  id: string;
  type: 'bus' | 'company';
  date: string;
  bus_id?: string;
  category: string;
  subcategory: string;
  amount: number;
  description: string;
  receipt_ref?: string;
  paid_by: 'owner' | 'accountant';
  created_by?: string;
  created_at: any;
  updated_at?: any;
  has_history?: boolean;
  last_edit?: {
    editedBy: string;
    editedAt: any;
  };
}

interface EditHistory {
  id: string;
  editedBy: string;
  editedByRole: string;
  editedAt: any;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  maintenance_repairs: 'Maintenance & Repairs',
  traffic_police: 'Traffic & Police',
  licensing_registration: 'Licensing & Registration',
  fuel: 'Fuel',
  insurance: 'Insurance',
  interstate_regulatory: 'Interstate & Regulatory',
  office_supplies: 'Office Supplies',
  utilities: 'Utilities',
  rent: 'Rent',
  miscellaneous: 'Miscellaneous'
};

const getCategoryLabel = (value: string) => CATEGORY_LABELS[value] || value;

import { EXPENSE_CATEGORIES } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export function ExpenseEntry() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'add' | 'list'>('add');
  const [step, setStep] = useState(1);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [type, setType] = useState<'bus' | 'company'>('bus');

  // Activity Log State
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<ExpenseRecord[]>([]);
  const [categories, setCategories] = useState<{ label: string, value: string, subcategories: string[] }[]>([]);
  const [filters, setFilters] = useState({
    type: 'all',
    bus_id: 'all',
    category: 'all',
    month: format(new Date(), 'yyyy-MM'),
    paid_by: 'all'
  });

  // Edit Modal State
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ExpenseRecord | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    bus_id: '',
    category: '',
    subcategory: '',
    amount: 0,
    description: '',
    receipt_ref: '',
    paid_by: 'accountant' as 'owner' | 'accountant',
    payment_mode: 'Cash' as PaymentMode,
    account_id: '',
    reference_number: ''
  });

  useEffect(() => {
    if (profile?.role === 'admin') {
      setFormData(prev => ({ ...prev, paid_by: 'owner' }));
    } else {
      setFormData(prev => ({ ...prev, paid_by: 'accountant' }));
    }
  }, [profile?.role]);

  const expenseCategories = type === 'bus' ? EXPENSE_CATEGORIES.BUS : EXPENSE_CATEGORIES.COMPANY;
  const selectedCategory = expenseCategories.find(c => c.value === formData.category);

  useEffect(() => {
    fetchBuses();
    fetchActiveBankAccounts().then(setBankAccounts);
    if (activeTab === 'list') {
      fetchExpenses();
    }
  }, [activeTab]);

  useEffect(() => {
    applyFilters();
  }, [expenses, filters]);

  useEffect(() => {
    // Dynamically update categories based on filtered type
    const cats = filters.type === 'company' 
      ? EXPENSE_CATEGORIES.COMPANY 
      : filters.type === 'bus' 
        ? EXPENSE_CATEGORIES.BUS 
        : [...EXPENSE_CATEGORIES.BUS, ...EXPENSE_CATEGORIES.COMPANY];
    
    // Remove duplicates if any
    const uniqueCats = Array.from(new Set(cats.map(c => c.value)))
      .map(val => cats.find(c => c.value === val)!);
    
    setCategories(uniqueCats);
  }, [filters.type]);

  const fetchExpenses = async () => {
    setFetching(true);
    try {
      const busQ = query(collection(db, 'bus_expenses'), orderBy('date', 'desc'));
      const compQ = query(collection(db, 'company_expenses'), orderBy('date', 'desc'));

      const [busSnap, compSnap] = await Promise.all([
        getDocs(busQ),
        getDocs(compQ)
      ]);

      const busList = busSnap.docs.map(doc => ({ 
        id: doc.id, 
        type: 'bus', 
        ...doc.data() 
      } as ExpenseRecord));

      const compList = compSnap.docs.map(doc => ({ 
        id: doc.id, 
        type: 'company', 
        ...doc.data() 
      } as ExpenseRecord));

      const combined = [...busList, ...compList].sort((a, b) => b.date.localeCompare(a.date));
      setExpenses(combined);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setFetching(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...expenses];

    if (filters.type !== 'all') {
      filtered = filtered.filter(e => e.type === filters.type);
    }

    if (filters.bus_id !== 'all') {
      filtered = filtered.filter(e => e.bus_id === filters.bus_id);
    }

    if (filters.category !== 'all') {
      filtered = filtered.filter(e => e.category === filters.category);
    }

    if (filters.paid_by !== 'all') {
      filtered = filtered.filter(e => e.paid_by === filters.paid_by);
    }

    if (filters.month) {
      const [year, month] = filters.month.split('-');
      filtered = filtered.filter(e => {
        const d = parseISO(e.date);
        return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
      });
    }

    setFilteredExpenses(filtered);
  };

  useEffect(() => {
    // Reset category and subcategory when type changes
    setFormData(prev => ({ ...prev, category: '', subcategory: '' }));
  }, [type]);

  useEffect(() => {
    // Reset subcategory when category changes
    setFormData(prev => ({ ...prev, subcategory: '' }));
  }, [formData.category]);

  async function fetchBuses() {
    try {
      const busesSnap = await getDocs(query(collection(db, 'buses'), orderBy('registration_number')));
      const busesList = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
      setBuses(busesList);
      if (busesList.length > 0) setFormData(prev => ({ ...prev, bus_id: busesList[0].id }));
    } catch (error) {
      console.error('Error fetching buses:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'number' ? parseFloat(value) || 0 : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleExport = (exportFormat: 'csv' | 'excel', scope: 'filtered' | 'all') => {
    const dataToExport = scope === 'filtered' ? filteredExpenses : expenses;
    const exportData = dataToExport.map(e => ({
      'Date': e.date,
      'Bus Number': e.type === 'bus' ? buses.find(b => b.id === e.bus_id)?.registration_number || e.bus_id : 'Company',
      'Category': getCategoryLabel(e.category),
      'Subcategory': e.subcategory || 'N/A',
      'Description': e.description,
      'Amount': e.amount,
      'Paid By': e.paid_by.charAt(0).toUpperCase() + e.paid_by.slice(1),
      'Added By': e.created_by || 'Unknown',
      'Created Date': e.created_at ? format(e.created_at instanceof Timestamp ? e.created_at.toDate() : new Date(e.created_at), 'yyyy-MM-dd HH:mm') : 'N/A',
      'Last Edited': e.updated_at ? format(e.updated_at instanceof Timestamp ? e.updated_at.toDate() : new Date(e.updated_at), 'yyyy-MM-dd HH:mm') : 'None',
      'Last Edited By': e.last_edit?.editedBy || 'N/A'
    }));

    const filename = `JTT_Expenses_${format(new Date(), 'yyyy-MM-dd')}`;

    if (exportFormat === 'csv') {
      const csv = Papa.unparse(exportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `${filename}.csv`);
    } else {
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `${filename}.xlsx`);
    }
  };

  const handleEdit = async (updatedData: Partial<ExpenseRecord>) => {
    if (!editingExpense) return;
    setSaving(true);
    try {
      const table = editingExpense.type === 'bus' ? 'bus_expenses' : 'company_expenses';
      const expenseRef = doc(db, table, editingExpense.id);
      
      const changes: { field: string, oldValue: any, newValue: any }[] = [];
      const fieldsToWatch = ['date', 'category', 'subcategory', 'description', 'amount', 'paid_by'];
      
      fieldsToWatch.forEach(field => {
        if (updatedData[field as keyof typeof updatedData] !== editingExpense[field as keyof typeof editingExpense]) {
          changes.push({
            field,
            oldValue: editingExpense[field as keyof typeof editingExpense],
            newValue: updatedData[field as keyof typeof updatedData]
          });
        }
      });

      if (changes.length === 0) {
        setEditingExpense(null);
        return;
      }

      const batch = writeBatch(db);

      // 1. Update expense document
      batch.update(expenseRef, {
        ...updatedData,
        updated_at: serverTimestamp()
      });

      // 2. Update linked cash transaction
      const ctQuery = query(
        collection(db, 'cash_transactions'),
        where('linked_id', '==', editingExpense.id),
        limit(1)
      );
      const ctSnap = await getDocs(ctQuery);
      if (!ctSnap.empty) {
        const ctRef = doc(db, 'cash_transactions', ctSnap.docs[0].id);
        batch.update(ctRef, {
          date: updatedData.date,
          amount: updatedData.amount,
          paid_by: updatedData.paid_by,
          description: `${editingExpense.type === 'bus' ? 'Bus' : 'Company'} Expense: ${updatedData.category}${updatedData.subcategory ? ` (${updatedData.subcategory})` : ''} - ${updatedData.description}`,
          updated_at: serverTimestamp()
        });
      }

      // Also sync linked bank transaction if exists
      const btQuery = query(
        collection(db, 'bank_transactions'),
        where('linked_id', '==', editingExpense.id),
        limit(1)
      );
      const btSnap = await getDocs(btQuery);
      if (!btSnap.empty) {
        batch.update(doc(db, 'bank_transactions', btSnap.docs[0].id), {
          date: updatedData.date,
          amount: updatedData.amount,
          description: `${editingExpense.type === 'bus' ? 'Bus' : 'Company'} Expense: ${updatedData.category}${updatedData.subcategory ? ` (${updatedData.subcategory})` : ''} - ${updatedData.description}`,
        });
      }

      // 3. Add to edit history
      const historyRef = doc(collection(db, table, editingExpense.id, 'editHistory'));
      batch.set(historyRef, {
        editedBy: profile?.full_name || 'Unknown',
        editedByRole: profile?.role || 'Unknown',
        editedAt: serverTimestamp(),
        changes
      });

      await batch.commit();

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Edited',
          'Expense Entry',
          `Updated ${editingExpense.type} expense: ${editingExpense.category} - ${changes.map(c => `${c.field}: ${c.oldValue} -> ${c.newValue}`).join(', ')}`
        );
      }
      
      // Update local state
      setExpenses(prev => prev.map(e => {
        if (e.id === editingExpense.id) {
          return {
            ...e,
            ...updatedData,
            updated_at: new Date(),
            last_edit: {
              editedBy: profile?.full_name || 'Unknown',
              editedAt: new Date()
            }
          };
        }
        return e;
      }));

      setMessage({ type: 'success', text: 'Expense updated successfully' });
      setEditingExpense(null);
    } catch (error) {
      console.error('Error updating expense:', error);
      setMessage({ type: 'error', text: 'Failed to update expense' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      const table = deleteConfirm.type === 'bus' ? 'bus_expenses' : 'company_expenses';
      const batch = writeBatch(db);

      // 1. Delete expense
      batch.delete(doc(db, table, deleteConfirm.id));

      // 2. Delete linked cash transaction
      const ctQuery = query(
        collection(db, 'cash_transactions'),
        where('linked_id', '==', deleteConfirm.id),
        limit(1)
      );
      const ctSnap = await getDocs(ctQuery);
      if (!ctSnap.empty) {
        batch.delete(doc(db, 'cash_transactions', ctSnap.docs[0].id));
      }

      // Also reverse any linked bank transaction
      const btQuery = query(
        collection(db, 'bank_transactions'),
        where('linked_id', '==', deleteConfirm.id),
        limit(1)
      );
      const btSnap = await getDocs(btQuery);
      if (!btSnap.empty) {
        await reverseBankTransaction(btSnap.docs[0].id);
      }

      await batch.commit();

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Deleted',
          'Expense Entry',
          `Deleted ${deleteConfirm.type} expense: ${deleteConfirm.category} ₹${deleteConfirm.amount} on ${deleteConfirm.date}`
        );
      }

      setExpenses(prev => prev.filter(e => e.id !== deleteConfirm.id));
      setMessage({ type: 'success', text: 'Expense deleted successfully' });
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting expense:', error);
      setMessage({ type: 'error', text: 'Failed to delete expense' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (step < 3) {
      nextStep();
      return;
    }

    if (formData.payment_mode !== 'Cash' && !formData.account_id) {
      setMessage({ type: 'error', text: 'Please select a bank account for non-cash payments' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const table = type === 'bus' ? 'bus_expenses' : 'company_expenses';
      const payload = {
        ...formData,
        created_by: auth.currentUser?.uid,
        created_at: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, table), payload);

      const description = `${type === 'bus' ? 'Bus' : 'Company'} Expense: ${formData.category}${formData.subcategory ? ` (${formData.subcategory})` : ''} - ${formData.description}`;

      if (formData.payment_mode === 'Cash') {
        await addDoc(collection(db, 'cash_transactions'), {
          date: formData.date,
          type: 'out',
          category: type === 'bus' ? 'bus_expense' : 'office_expense',
          amount: formData.amount,
          description,
          linked_id: docRef.id,
          paid_by: formData.paid_by,
          payment_mode: 'Cash',
          source_module: 'expense_entry',
          created_by: auth.currentUser?.uid,
          created_at: serverTimestamp()
        });
      } else {
        await recordBankTransaction({
          date: formData.date,
          type: 'out',
          amount: formData.amount,
          description,
          category: type === 'bus' ? 'bus_expense' : 'office_expense',
          account_id: formData.account_id,
          payment_mode: formData.payment_mode,
          reference_number: formData.reference_number,
          linked_id: docRef.id,
          source_module: 'expense_entry',
          created_by: auth.currentUser?.uid ?? ''
        });
      }

      setMessage({ type: 'success', text: 'Expense saved successfully!' });

      // Log activity
      if (profile) {
        const busNum = type === 'bus' ? buses.find(b => b.id === formData.bus_id)?.registration_number : 'Company';
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Expense Entry',
          `Created ${type} expense for ${busNum}: ${formData.category} - ${formData.amount}`
        );
      }

      setStep(1);
      setFormData(prev => ({ 
        ...prev, 
        amount: 0, 
        description: '', 
        receipt_ref: '', 
        category: '', 
        subcategory: '', 
        paid_by: profile?.role === 'admin' ? 'owner' : 'accountant',
        payment_mode: 'Cash',
        account_id: '',
        reference_number: ''
      }));
      
      setTimeout(() => setMessage(null), 3000);
      if (activeTab === 'list') fetchExpenses();
    } catch (error: any) {
      console.error('Error saving expense:', error);
      if (error.message?.includes('insufficient permissions')) {
        setMessage({ type: 'error', text: 'Permission denied. Please check your role.' });
      } else {
        setMessage({ type: 'error', text: error.message || 'Failed to save expense' });
      }
      handleFirestoreError(error, OperationType.CREATE, type === 'bus' ? 'bus_expenses' : 'company_expenses');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  const nextStep = () => setStep(s => Math.min(s + 1, 3));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  // Revised Summary calculations for the slim stats bar
  const currentMonthStart = startOfMonth(new Date());
  const currentMonthEnd = endOfMonth(new Date());
  const lastMonthStart = startOfMonth(new Date(new Date().setMonth(new Date().getMonth() - 1)));
  const lastMonthEnd = endOfMonth(new Date(new Date().setMonth(new Date().getMonth() - 1)));

  const stats = {
    thisMonth: filteredExpenses.filter(e => isWithinInterval(parseISO(e.date), { start: currentMonthStart, end: currentMonthEnd })).reduce((sum, e) => sum + e.amount, 0),
    lastMonth: filteredExpenses.filter(e => isWithinInterval(parseISO(e.date), { start: lastMonthStart, end: lastMonthEnd })).reduce((sum, e) => sum + e.amount, 0),
    bus: filteredExpenses.filter(e => e.type === 'bus').reduce((sum, e) => sum + e.amount, 0),
    company: filteredExpenses.filter(e => e.type === 'company').reduce((sum, e) => sum + e.amount, 0),
  };

  const diff = stats.thisMonth - stats.lastMonth;
  const isBetter = stats.thisMonth <= stats.lastMonth;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <Receipt className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Expenses</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            {activeTab === 'add' ? 'Expense Entry' : 'Activity Log'}
          </h1>
        </div>

        <div className="flex items-center bg-surface/50 backdrop-blur-sm p-1 rounded-xl border border-border">
          <button
            onClick={() => setActiveTab('add')}
            className={cn(
              "flex items-center space-x-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
              activeTab === 'add' ? "bg-accent text-background shadow-lg" : "text-secondary hover:text-primary"
            )}
          >
            <PlusCircle className="h-4 w-4" />
            <span>Add Expense</span>
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={cn(
              "flex items-center space-x-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
              activeTab === 'list' ? "bg-accent text-background shadow-lg" : "text-secondary hover:text-primary"
            )}
          >
            <History className="h-4 w-4" />
            <span>Activity Log</span>
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'add' ? (
          <motion.div
            key="add-expense"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-auto max-w-xl space-y-8"
          >
            <div className="flex items-center justify-between mb-4 text-xs font-bold uppercase tracking-widest text-secondary/50">
              <div className="flex items-center space-x-1.5">
                {[1, 2, 3].map(s => (
                  <div 
                    key={s} 
                    className={cn(
                      "h-1 w-6 rounded-full transition-all duration-300",
                      s === step ? "bg-accent w-10" : s < step ? "bg-accent/40" : "bg-border"
                    )} 
                  />
                ))}
              </div>
            </div>

            {message && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex items-center space-x-3 rounded-xl p-4 text-sm font-medium",
                  message.type === 'success' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                )}
              >
                {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <span>{message.text}</span>
              </motion.div>
            )}

            <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div 
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8"
                  >
                    <div className="space-y-4">
                      <label className="label">Expense Type</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setType('bus')}
                          className={cn(
                            "flex flex-col items-center justify-center rounded-2xl border-2 p-8 transition-all duration-300 group",
                            type === 'bus' 
                              ? "border-accent bg-accent/5 text-accent" 
                              : "border-border bg-surface text-secondary hover:border-border-hover"
                          )}
                        >
                          <BusIcon className={cn(
                            "mb-3 h-8 w-8 stroke-[1.5px] transition-transform duration-300",
                            type === 'bus' ? "scale-110" : "group-hover:scale-105"
                          )} />
                          <span className="text-xs font-bold uppercase tracking-widest">Bus Expense</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setType('company')}
                          className={cn(
                            "flex flex-col items-center justify-center rounded-2xl border-2 p-8 transition-all duration-300 group",
                            type === 'company' 
                              ? "border-accent bg-accent/5 text-accent" 
                              : "border-border bg-surface text-secondary hover:border-border-hover"
                          )}
                        >
                          <Building2 className={cn(
                            "mb-3 h-8 w-8 stroke-[1.5px] transition-transform duration-300",
                            type === 'company' ? "scale-110" : "group-hover:scale-105"
                          )} />
                          <span className="text-xs font-bold uppercase tracking-widest">Company</span>
                        </button>
                      </div>
                    </div>

                    {type === 'bus' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-2"
                      >
                        <label className="label">Select Bus</label>
                        <div className="relative">
                          <select
                            name="bus_id"
                            value={formData.bus_id}
                            onChange={handleInputChange}
                            className="input appearance-none pr-10"
                            required
                          >
                            <option value="">Choose a vehicle</option>
                            {buses.map(bus => (
                              <option key={bus.id} value={bus.id}>{bus.registration_number}</option>
                            ))}
                          </select>
                          <BusIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary pointer-events-none stroke-[1.5px]" />
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div 
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8"
                  >
                    <div className="space-y-4">
                      <label className="label">Category</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {expenseCategories.map(cat => (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, category: cat.value }))}
                            className={cn(
                              "rounded-xl border px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all duration-300 text-left",
                              formData.category === cat.value 
                                ? "bg-accent text-background border-accent" 
                                : "bg-surface text-secondary border-border hover:border-border-hover"
                            )}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedCategory && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4"
                      >
                        <label className="label">Subcategory</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {selectedCategory.subcategories.map(sub => (
                            <button
                              key={sub}
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, subcategory: sub }))}
                              className={cn(
                                "rounded-lg border px-3 py-2 text-[9px] font-bold uppercase tracking-wider transition-all duration-300",
                                formData.subcategory === sub 
                                  ? "bg-accent/20 text-accent border-accent" 
                                  : "bg-surface text-secondary border-border hover:border-border-hover"
                              )}
                            >
                              {sub}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    <div className="space-y-2">
                      <label className="label">Amount (₹)</label>
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="numeric"
                          name="amount"
                          value={formData.amount || ''}
                          onChange={handleInputChange}
                          className="input text-3xl font-bold tracking-tighter font-mono py-6"
                          placeholder="0.00"
                          required
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary font-mono text-sm">INR</div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div 
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-2">
                      <label className="label">Date</label>
                      <div className="relative">
                        <input
                          type="date"
                          name="date"
                          value={formData.date}
                          onChange={handleInputChange}
                          className="input pr-10"
                          required
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary pointer-events-none stroke-[1.5px]" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="label">Paid By</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, paid_by: 'accountant' })}
                          className={cn(
                            "flex items-center justify-center space-x-2 p-3 rounded-xl border transition-all",
                            formData.paid_by === 'accountant' 
                              ? "bg-accent/10 border-accent text-accent font-bold" 
                              : "bg-surface border-border text-secondary hover:border-accent/50"
                          )}
                        >
                          <span className="text-xs uppercase tracking-widest">Accountant</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, paid_by: 'owner' })}
                          className={cn(
                            "flex items-center justify-center space-x-2 p-3 rounded-xl border transition-all",
                            formData.paid_by === 'owner' 
                              ? "bg-accent/10 border-accent text-accent font-bold" 
                              : "bg-surface border-border text-secondary hover:border-accent/50"
                          )}
                        >
                          <span className="text-xs uppercase tracking-widest">Owner</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="label">Payment Mode</label>
                        <select 
                          value={formData.payment_mode}
                          onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value as PaymentMode, account_id: '', reference_number: '' })}
                          className="input"
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="NEFT">NEFT</option>
                          <option value="RTGS">RTGS</option>
                          <option value="IMPS">IMPS</option>
                          <option value="Cheque">Cheque</option>
                        </select>
                      </div>

                      {formData.payment_mode !== 'Cash' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="space-y-2">
                            <label className="label">Bank Account</label>
                            <select 
                              value={formData.account_id}
                              onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                              className="input"
                              required
                            >
                              <option value="">Select bank account</option>
                              {bankAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.account_name} — ****{a.account_number_last4}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="label">Reference / UTR Number</label>
                            <input 
                              type="text"
                              value={formData.reference_number}
                              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                              className="input"
                              placeholder="Leave blank if unknown"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="label">Description</label>
                      <div className="relative">
                        <textarea
                          name="description"
                          value={formData.description}
                          onChange={handleInputChange}
                          rows={3}
                          className="input py-3 min-h-[100px] resize-none"
                          placeholder="Add details about this expense..."
                        />
                        <FileText className="absolute right-3 top-3 h-4 w-4 text-secondary pointer-events-none stroke-[1.5px]" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="label">Receipt Reference</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="receipt_ref"
                          value={formData.receipt_ref}
                          onChange={handleInputChange}
                          className="input pr-10"
                          placeholder="Bill number or reference ID"
                        />
                        <Receipt className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary pointer-events-none stroke-[1.5px]" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between pt-6 border-t border-border">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={step === 1}
                  className="btn-secondary flex items-center space-x-2 !px-6 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 stroke-[1.5px]" />
                  <span>Back</span>
                </button>
                
                {step < 3 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="btn-primary flex items-center space-x-2 !px-8"
                  >
                    <span>Next Step</span>
                    <ChevronRight className="h-4 w-4 stroke-[1.5px]" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={saving}
                    className="btn-primary flex items-center space-x-2 !px-10"
                  >
                    {saving ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    ) : (
                      <Save className="h-4 w-4 stroke-[1.5px]" />
                    )}
                    <span>Save Record</span>
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="activity-log"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Enhanced Stats Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-4 flex flex-col justify-between border-l-4 border-l-accent bg-surface/30">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60">This Month</span>
                <div className="flex items-end justify-between mt-1">
                  <span className="text-2xl font-bold tracking-tighter font-mono">₹{stats.thisMonth.toLocaleString()}</span>
                  <div className={cn(
                    "flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold",
                    isBetter ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  )}>
                    {isBetter ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <span>{Math.abs(diff).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="card p-4 flex flex-col justify-between border-l-4 border-l-secondary bg-surface/30">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60">Bus Totals</span>
                <div className="mt-1">
                  <span className="text-2xl font-bold tracking-tighter font-mono">₹{stats.bus.toLocaleString()}</span>
                </div>
              </div>

              <div className="card p-4 flex flex-col justify-between border-l-4 border-l-primary bg-surface/30">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60">Company Totals</span>
                <div className="mt-1">
                  <span className="text-2xl font-bold tracking-tighter font-mono">₹{stats.company.toLocaleString()}</span>
                </div>
              </div>

              <div className="card p-4 flex flex-col justify-between border-l-4 border-l-border bg-surface/30">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60">Last Month</span>
                <div className="mt-1">
                  <span className="text-2xl font-bold tracking-tighter font-mono text-secondary">₹{stats.lastMonth.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="card grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 p-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Type</label>
                <select 
                  value={filters.type}
                  onChange={(e) => setFilters(f => ({ ...f, type: e.target.value, category: 'all' }))}
                  className="input py-2 text-xs"
                >
                  <option value="all">All Types</option>
                  <option value="bus">Bus</option>
                  <option value="company">Company</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Bus</label>
                <select 
                  value={filters.bus_id}
                  disabled={filters.type === 'company'}
                  onChange={(e) => setFilters(f => ({ ...f, bus_id: e.target.value }))}
                  className="input py-2 text-xs disabled:opacity-50"
                >
                  <option value="all">All Buses</option>
                  {buses.map(b => (
                    <option key={b.id} value={b.id}>{b.registration_number}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Category</label>
                <select 
                  value={filters.category}
                  onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))}
                  className="input py-2 text-xs"
                >
                  <option value="all">All Categories</option>
                  {categories.map(c => (
                    <option key={c.value} value={c.value}>{getCategoryLabel(c.value)}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Month</label>
                <input 
                  type="month"
                  value={filters.month}
                  onChange={(e) => setFilters(f => ({ ...f, month: e.target.value }))}
                  className="input py-2 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Paid By</label>
                <select 
                  value={filters.paid_by}
                  onChange={(e) => setFilters(f => ({ ...f, paid_by: e.target.value }))}
                  className="input py-2 text-xs"
                >
                  <option value="all">All</option>
                  <option value="owner">Owner</option>
                  <option value="accountant">Accountant</option>
                </select>
              </div>

              <div className="flex items-end">
                <ExportModal onExport={handleExport} />
              </div>
            </div>

            {/* Expenses Table */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-hover/30 border-b border-border">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Date</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Bus/Target</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Category</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Subcategory</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Description</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary text-right">Amount</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Paid By</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary text-center">Edited</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fetching ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mx-auto"></div>
                        </td>
                      </tr>
                    ) : filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center text-sm text-secondary">
                          No expenses found matching filters
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map((expense) => (
                        <tr key={expense.id} className="hover:bg-surface/50 transition-colors group text-left">
                          <td className="px-6 py-4 text-xs font-medium">{expense.date}</td>
                          <td className="px-6 py-4 text-xs font-bold">
                            {expense.type === 'bus' 
                              ? buses.find(b => b.id === expense.bus_id)?.registration_number || expense.bus_id 
                              : 'Company'
                            }
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {getCategoryLabel(expense.category)}
                          </td>
                          <td className="px-6 py-4 text-[10px] text-secondary">
                            {expense.subcategory}
                          </td>
                          <td className="px-6 py-4 text-xs text-secondary max-w-[200px] truncate" title={expense.description}>
                            {expense.description}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-bold font-mono">₹{expense.amount.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-secondary">
                              {expense.paid_by}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {expense.updated_at && (
                              <div className="relative group/tooltip inline-block">
                                <History className="h-4 w-4 text-accent mx-auto" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:block bg-surface text-secondary text-[10px] p-2 rounded shadow-xl border border-border whitespace-nowrap z-50">
                                  Last edited by {expense.last_edit?.editedBy} on {format(expense.updated_at instanceof Timestamp ? expense.updated_at.toDate() : new Date(expense.updated_at), 'yyyy-MM-dd HH:mm')}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {(profile?.role === 'admin' || profile?.role === 'developer') && (
                                <>
                                  <button
                                    onClick={() => setEditingExpense(expense)}
                                    className="p-1.5 text-secondary hover:text-accent transition-colors"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(expense)}
                                    className="p-1.5 text-secondary hover:text-danger transition-colors"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      {editingExpense && (
        <EditExpenseModal 
          expense={editingExpense} 
          onClose={() => setEditingExpense(null)} 
          onSave={handleEdit}
          saving={saving}
          buses={buses}
        />
      )}

      {deleteConfirm && (
        <DeleteConfirmModal 
          expense={deleteConfirm} 
          onClose={() => setDeleteConfirm(null)} 
          onConfirm={handleDelete}
          saving={saving}
        />
      )}
    </div>
  );
}

// Sub-components
function ExportModal({ onExport }: { onExport: (format: 'csv' | 'excel', scope: 'filtered' | 'all') => void }) {
  const [show, setShow] = useState(false);
  const [format, setFormat] = useState<'csv' | 'excel'>('csv');
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');

  return (
    <>
      <button 
        onClick={() => setShow(true)}
        className="btn-secondary w-full py-2 text-xs flex items-center justify-center space-x-2"
      >
        <Download className="h-4 w-4" />
        <span>Export</span>
      </button>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card max-w-md w-full p-6 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Export Expenses</h2>
              <button onClick={() => setShow(false)}><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="label">Format</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setFormat('csv')}
                    className={cn("p-3 rounded-xl border text-xs font-bold uppercase tracking-widest", format === 'csv' ? "border-accent bg-accent/5 text-accent" : "border-border")}
                  >CSV</button>
                  <button 
                    onClick={() => setFormat('excel')}
                    className={cn("p-3 rounded-xl border text-xs font-bold uppercase tracking-widest", format === 'excel' ? "border-accent bg-accent/5 text-accent" : "border-border")}
                  >Excel</button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="label">What to Export</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setScope('filtered')}
                    className={cn("p-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest", scope === 'filtered' ? "border-accent bg-accent/5 text-accent" : "border-border")}
                  >Filtered View</button>
                  <button 
                    onClick={() => setScope('all')}
                    className={cn("p-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest", scope === 'all' ? "border-accent bg-accent/5 text-accent" : "border-border")}
                  >All Expenses</button>
                </div>
              </div>
            </div>

            <button 
              onClick={() => { onExport(format, scope); setShow(false); }}
              className="btn-primary w-full py-3"
            >Download {format.toUpperCase()}</button>
          </motion.div>
        </div>
      )}
    </>
  );
}

function EditExpenseModal({ expense, onClose, onSave, saving, buses }: { expense: ExpenseRecord, onClose: () => void, onSave: (data: Partial<ExpenseRecord>) => void, saving: boolean, buses: Bus[] }) {
  const expenseCategoriesList = expense.type === 'bus' ? EXPENSE_CATEGORIES.BUS : EXPENSE_CATEGORIES.COMPANY;
  const [formData, setFormData] = useState({
    date: expense.date,
    category: expense.category,
    subcategory: expense.subcategory,
    amount: expense.amount,
    description: expense.description,
    paid_by: expense.paid_by
  });

  const selectedCategory = expenseCategoriesList.find(c => c.value === formData.category);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card max-w-xl w-full p-6 space-y-6 my-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Edit {expense.type === 'bus' ? 'Bus' : 'Company'} Expense</h2>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
          <div className="space-y-1.5">
            <label className="label">Date</label>
            <input 
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(f => ({ ...f, date: e.target.value }))}
              className="input py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="label">Amount</label>
            <input 
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              className="input py-2 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="label">Category</label>
            <select 
              value={formData.category}
              onChange={(e) => setFormData(f => ({ ...f, category: e.target.value, subcategory: '' }))}
              className="input py-2 text-sm"
            >
              {expenseCategoriesList.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="label">Subcategory</label>
            <select 
              value={formData.subcategory}
              onChange={(e) => setFormData(f => ({ ...f, subcategory: e.target.value }))}
              className="input py-2 text-sm"
            >
              <option value="">None</option>
              {selectedCategory?.subcategories.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 space-y-1.5 text-left">
            <label className="label">Paid By</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setFormData(f => ({ ...f, paid_by: 'accountant' }))}
                className={cn("p-2 rounded-xl border text-xs font-bold uppercase tracking-widest", formData.paid_by === 'accountant' ? "border-accent bg-accent/5 text-accent" : "border-border")}
              >Accountant</button>
              <button 
                onClick={() => setFormData(f => ({ ...f, paid_by: 'owner' }))}
                className={cn("p-2 rounded-xl border text-xs font-bold uppercase tracking-widest", formData.paid_by === 'owner' ? "border-accent bg-accent/5 text-accent" : "border-border")}
              >Owner</button>
            </div>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label className="label">Description</label>
            <textarea 
              value={formData.description}
              onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
              className="input min-h-[100px] py-2 text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex space-x-3 pt-4">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button 
            onClick={() => onSave(formData)} 
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DeleteConfirmModal({ expense, onClose, onConfirm, saving }: { expense: ExpenseRecord, onClose: () => void, onConfirm: () => void, saving: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card max-w-sm w-full p-6 space-y-6 text-center"
      >
        <div className="mx-auto w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center">
          <Trash2 className="h-8 w-8 text-danger" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Delete Expense?</h2>
          <p className="text-sm text-secondary">
            Delete this ₹{expense.amount.toLocaleString()} expense for {expense.category}? This cannot be undone.
          </p>
        </div>
        <div className="flex space-x-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button 
            onClick={onConfirm} 
            disabled={saving}
            className="btn-danger flex-1"
          >
            {saving ? 'Deleting...' : 'Confirm Delete'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
