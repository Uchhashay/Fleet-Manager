import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  orderBy, 
  query, 
  serverTimestamp 
} from 'firebase/firestore';
import { BankAccount } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../lib/activity-logger';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Plus, 
  Building2, 
  CreditCard, 
  ShieldCheck, 
  X, 
  Save, 
  AlertCircle, 
  CheckCircle2,
  Power,
  Landmark,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BankStatementUpload } from '../components/BankStatementUpload';
import { auth } from '../lib/firebase';

export function BankAccounts() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const initialFormData = {
    account_name: '',
    bank_name: '',
    account_number_last4: '',
    account_type: 'Current' as 'Current' | 'Savings' | 'Overdraft',
    overdraft_limit: 0,
    ifsc: '',
    opening_balance: 0
  };

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'bank_accounts'), orderBy('account_name'));
      const querySnapshot = await getDocs(q);
      const accountsList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as BankAccount));
      setAccounts(accountsList);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setMessage({ type: 'error', text: 'Failed to load bank accounts' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'number' ? parseFloat(value) || 0 : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.account_name.trim() || !formData.bank_name.trim() || !formData.ifsc.trim()) {
      setMessage({ type: 'error', text: 'Please fill all required fields' });
      return;
    }

    if (formData.account_number_last4.length !== 4 || !/^\d{4}$/.test(formData.account_number_last4)) {
      setMessage({ type: 'error', text: 'Account number last 4 digits must be exactly 4 digits' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (editingAccount) {
        const docRef = doc(db, 'bank_accounts', editingAccount.id);
        const updateData = {
          account_name: formData.account_name,
          bank_name: formData.bank_name,
          account_number_last4: formData.account_number_last4,
          account_type: formData.account_type,
          overdraft_limit: formData.account_type === 'Overdraft' ? formData.overdraft_limit : 0,
          ifsc: formData.ifsc,
          updated_at: serverTimestamp()
        };
        await updateDoc(docRef, updateData);
        
        if (profile) {
          await logActivity(
            profile.full_name,
            profile.role,
            'Edited',
            'Bank Accounts',
            `Updated bank account: ${formData.account_name} (${formData.bank_name})`
          );
        }
        setMessage({ type: 'success', text: 'Bank account updated successfully' });
      } else {
        const newAccount = {
          ...formData,
          current_balance: formData.opening_balance,
          is_active: true,
          created_at: serverTimestamp()
        };
        await addDoc(collection(db, 'bank_accounts'), newAccount);
        
        if (profile) {
          await logActivity(
            profile.full_name,
            profile.role,
            'Created',
            'Bank Accounts',
            `Added new bank account: ${formData.account_name} (${formData.bank_name})`
          );
        }
        setMessage({ type: 'success', text: 'Bank account created successfully' });
      }

      setFormData(initialFormData);
      setShowForm(false);
      setEditingAccount(null);
      fetchAccounts();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving account:', error);
      setMessage({ type: 'error', text: 'Failed to save bank account' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (account: BankAccount) => {
    try {
      const docRef = doc(db, 'bank_accounts', account.id);
      await updateDoc(docRef, {
        is_active: !account.is_active,
        updated_at: serverTimestamp()
      });
      
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Edited',
          'Bank Accounts',
          `${account.is_active ? 'Deactivated' : 'Activated'} bank account: ${account.account_name}`
        );
      }
      
      fetchAccounts();
    } catch (error) {
      console.error('Error toggling account status:', error);
      setMessage({ type: 'error', text: 'Failed to update account status' });
    }
  };

  const handleEditClick = (account: BankAccount) => {
    setEditingAccount(account);
    setFormData({
      account_name: account.account_name,
      bank_name: account.bank_name,
      account_number_last4: account.account_number_last4,
      account_type: account.account_type,
      overdraft_limit: account.overdraft_limit || 0,
      ifsc: account.ifsc,
      opening_balance: account.opening_balance
    });
    setShowForm(true);
  };

  const canEdit = profile?.role === 'admin' || profile?.role === 'developer';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <Landmark className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Finances</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Bank Accounts</h1>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center space-x-2 bg-surface border border-border text-primary px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-hover transition-all"
            >
              <Upload className="h-4 w-4" />
              <span>Upload Statement</span>
            </button>
            <button
              onClick={() => {
                setEditingAccount(null);
                setFormData(initialFormData);
                setShowForm(true);
              }}
              className="flex items-center space-x-2 bg-accent text-background px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-accent/20 hover:scale-105 transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Add Account</span>
            </button>
          </div>
        )}
      </header>

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

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {accounts.map((account) => (
              <motion.div
                key={account.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border bg-surface p-6 transition-all duration-300",
                  account.is_active ? "border-border hover:border-accent/30" : "border-border opacity-60 grayscale"
                )}
              >
                <div className="flex flex-col h-full justify-between space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-primary group-hover:text-accent transition-colors">{account.account_name}</h3>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider",
                        account.account_type === 'Current' ? "bg-blue-500/10 text-blue-500" : 
                        account.account_type === 'Savings' ? "bg-purple-500/10 text-purple-500" :
                        "bg-amber-500/10 text-amber-500"
                      )}>
                        {account.account_type} {account.account_type === 'Overdraft' && `(₹${account.overdraft_limit})`}
                      </span>
                    </div>
                    <p className="text-secondary text-xs flex items-center">
                      <Building2 className="h-3 w-3 mr-1 stroke-[1.5px]" />
                      {account.bank_name} • ****{account.account_number_last4}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Current Balance</p>
                    <p className="text-2xl font-bold font-mono tracking-tighter text-primary">
                      {formatCurrency(account.current_balance)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border/50">
                    <div className="flex items-center space-x-2">
                       {canEdit && (
                        <button
                          onClick={() => handleEditClick(account)}
                          className="p-2 rounded-lg bg-surface border border-border text-secondary hover:text-accent hover:border-accent/30 transition-all"
                        >
                          <CreditCard className="h-4 w-4 stroke-[1.5px]" />
                        </button>
                       )}
                    </div>
                    
                    {canEdit && (
                      <button
                        onClick={() => handleToggleActive(account)}
                        className={cn(
                          "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all",
                          account.is_active 
                            ? "bg-danger/10 text-danger hover:bg-danger/20" 
                            : "bg-success/10 text-success hover:bg-success/20"
                        )}
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>{account.is_active ? 'Deactivate' : 'Activate'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal Form */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg rounded-3xl border border-border bg-surface shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-primary">
                    {editingAccount ? 'Edit Account' : 'Add Bank Account'}
                  </h2>
                  <p className="text-sm text-secondary">Configure your bank account details</p>
                </div>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-2 rounded-xl bg-surface-hover text-secondary hover:text-primary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Account Name (e.g., Main Current)</label>
                    <input
                      name="account_name"
                      value={formData.account_name}
                      onChange={handleInputChange}
                      className="input"
                      placeholder="Enter account name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label">Bank Name</label>
                    <input
                      name="bank_name"
                      value={formData.bank_name}
                      onChange={handleInputChange}
                      className="input"
                      placeholder="HDFC, SBI, etc."
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Last 4 Digits</label>
                    <input
                      name="account_number_last4"
                      value={formData.account_number_last4}
                      onChange={handleInputChange}
                      className="input font-mono"
                      placeholder="1234"
                      maxLength={4}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label">Account Type</label>
                    <select
                      name="account_type"
                      value={formData.account_type}
                      onChange={handleInputChange}
                      className="input"
                    >
                      <option value="Current">Current</option>
                      <option value="Savings">Savings</option>
                      <option value="Overdraft">Overdraft</option>
                    </select>
                  </div>
                </div>

                {formData.account_type === 'Overdraft' && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <label className="label">Overdraft Limit (₹)</label>
                    <input
                      type="number"
                      name="overdraft_limit"
                      value={formData.overdraft_limit}
                      onChange={handleInputChange}
                      className="input font-mono"
                      placeholder="0.00"
                      required
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">IFSC Code</label>
                    <input
                      name="ifsc"
                      value={formData.ifsc}
                      onChange={handleInputChange}
                      className="input font-mono uppercase"
                      placeholder="HDFC0001234"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label">
                      Opening Balance (₹)
                      {editingAccount && (
                        <span className="block text-[8px] text-secondary mt-1 tracking-normal font-normal">Opening balance cannot be changed after creation</span>
                      )}
                    </label>
                    <input
                      type="number"
                      name="opening_balance"
                      value={formData.opening_balance}
                      onChange={handleInputChange}
                      className={cn("input font-mono", editingAccount && "opacity-50 cursor-not-allowed")}
                      placeholder="0.00"
                      disabled={!!editingAccount}
                      required
                    />
                  </div>
                </div>

                <div className="pt-4 flex flex-col md:flex-row gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 flex items-center justify-center space-x-2 bg-accent text-background py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {saving ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>{editingAccount ? 'Update Account' : 'Save Account'}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 bg-surface border border-border text-primary py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-hover transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BankStatementUpload 
        isOpen={showUploadModal} 
        onClose={() => setShowUploadModal(false)} 
        accounts={accounts.filter(a => a.is_active)} 
        currentUserId={auth.currentUser?.uid ?? ''} 
        currentUserName={profile?.full_name ?? ''} 
        onUploadComplete={(id) => {
          setShowUploadModal(false);
          setMessage({ type: 'success', text: 'Bank statement uploaded successfully' });
          setTimeout(() => setMessage(null), 3000);
        }}
      />
    </div>
  );
}
