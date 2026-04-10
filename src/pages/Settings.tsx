import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Wallet, 
  Save, 
  AlertCircle,
  CheckCircle2,
  Info
} from 'lucide-react';
import { motion } from 'framer-motion';

export function Settings() {
  const { profile } = useAuth();
  const [openingBalances, setOpeningBalances] = useState({
    owner: 0,
    accountant: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'opening_balances'));
      if (settingsDoc.exists()) {
        setOpeningBalances(settingsDoc.data() as any);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'settings/opening_balances');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await setDoc(doc(db, 'settings', 'opening_balances'), {
        ...openingBalances,
        updated_at: serverTimestamp(),
        updated_by: auth.currentUser?.uid
      });
      setMessage({ type: 'success', text: 'Opening balances updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/opening_balances');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-primary tracking-tight">Settings</h2>
          <p className="text-secondary font-medium">Manage global application configurations</p>
        </div>
      </header>

      <div className="grid gap-8">
        {/* Opening Balances Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card space-y-6"
        >
          <div className="flex items-center space-x-3 border-b border-border pb-4">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <Wallet className="h-5 w-5 stroke-[1.5px]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-primary">Opening Balances</h3>
              <p className="text-xs text-secondary font-medium">Set the starting cash balance for Owner and Accountant</p>
            </div>
          </div>

          <div className="bg-accent/5 border border-accent/10 rounded-xl p-4 flex items-start space-x-3">
            <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
            <p className="text-xs text-secondary leading-relaxed">
              These balances will be added to the cumulative cash calculations across the entire app. 
              Use this to set the initial cash on hand when you first started using this system.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Owner Opening Balance</label>
              <div className="relative group">
                <input
                  type="number"
                  value={openingBalances.owner}
                  onChange={(e) => setOpeningBalances({ ...openingBalances, owner: Number(e.target.value) })}
                  className="input pl-10 bg-background border-border/50 group-hover:border-accent/50 transition-colors font-mono"
                  placeholder="0.00"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">₹</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Accountant Opening Balance</label>
              <div className="relative group">
                <input
                  type="number"
                  value={openingBalances.accountant}
                  onChange={(e) => setOpeningBalances({ ...openingBalances, accountant: Number(e.target.value) })}
                  className="input pl-10 bg-background border-border/50 group-hover:border-accent/50 transition-colors font-mono"
                  placeholder="0.00"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">₹</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center space-x-2">
              {message && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "flex items-center space-x-2 text-sm font-bold",
                    message.type === 'success' ? "text-success" : "text-danger"
                  )}
                >
                  {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span>{message.text}</span>
                </motion.div>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center space-x-2 !px-8"
            >
              {saving ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
              ) : (
                <Save className="h-4 w-4 stroke-[1.5px]" />
              )}
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
