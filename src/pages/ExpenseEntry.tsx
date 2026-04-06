import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Bus } from '../types';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
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
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { EXPENSE_CATEGORIES } from '../constants';

export function ExpenseEntry() {
  const [step, setStep] = useState(1);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [type, setType] = useState<'bus' | 'company'>('bus');

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    bus_id: '',
    category: '',
    subcategory: '',
    amount: 0,
    description: '',
    receipt_ref: ''
  });

  const categories = type === 'bus' ? EXPENSE_CATEGORIES.BUS : EXPENSE_CATEGORIES.COMPANY;
  const selectedCategory = categories.find(c => c.value === formData.category);

  useEffect(() => {
    fetchBuses();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      // Log cash transaction
      try {
        await addDoc(collection(db, 'cash_transactions'), {
          date: formData.date,
          type: 'out',
          category: type === 'bus' ? 'bus_expense' : 'office_expense',
          amount: formData.amount,
          description: `${type === 'bus' ? 'Bus' : 'Company'} Expense: ${formData.category}${formData.subcategory ? ` (${formData.subcategory})` : ''} - ${formData.description}`,
          linked_id: docRef.id,
          created_at: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'cash_transactions');
      }

      setMessage({ type: 'success', text: 'Expense saved successfully!' });
      setStep(1);
      setFormData(prev => ({ ...prev, amount: 0, description: '', receipt_ref: '', category: '', subcategory: '' }));
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
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

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <header className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-secondary">
              <Receipt className="h-4 w-4 stroke-[1.5px]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Expense Management</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">New Expense</h1>
          </div>
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

        <AnimatePresence mode="wait">
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
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
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
                        <option key={bus.id} value={bus.id}>{bus.registration_number} — {bus.name}</option>
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
                  {categories.map(cat => (
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

        {/* Navigation Buttons */}
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
              type="submit"
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
    </div>
  );
}
