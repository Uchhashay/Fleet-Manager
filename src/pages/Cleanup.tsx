import React, { useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { Trash2, AlertTriangle, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const COLLECTIONS_TO_WIPE = [
  'buses',
  'cash_transactions',
  'company_expenses',
  'daily_records',
  'profiles',
  'salary_records',
  'staff',
  'bus_expenses',
  'fee_collections',
  'accountant_transactions'
];

export function Cleanup() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const wipeData = async () => {
    if (confirmText !== 'DELETE ALL DATA') {
      setError('Please type the confirmation phrase exactly.');
      return;
    }

    setLoading(true);
    setStatus('Initializing cleanup...');
    setError(null);
    setSuccess(false);

    try {
      const currentUserUid = auth.currentUser?.uid;

      for (const collectionName of COLLECTIONS_TO_WIPE) {
        setStatus(`Cleaning up ${collectionName}...`);
        let querySnapshot;
        try {
          querySnapshot = await getDocs(collection(db, collectionName));
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, collectionName);
          continue;
        }
        
        if (querySnapshot.empty) continue;

        // Firestore batches are limited to 500 operations
        const chunks = [];
        const docs = querySnapshot.docs;
        for (let i = 0; i < docs.length; i += 500) {
          chunks.push(docs.slice(i, i + 500));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach((document) => {
            // Special case: Don't delete the current admin's profile
            if (collectionName === 'profiles' && document.id === currentUserUid) {
              return;
            }
            batch.delete(doc(db, collectionName, document.id));
          });
          await batch.commit();
        }
      }

      setStatus('Cleanup completed successfully!');
      setSuccess(true);
      setConfirmText('');
    } catch (err: any) {
      console.error('Cleanup error:', err);
      try {
        handleFirestoreError(err, OperationType.WRITE, 'cleanup_batch');
      } catch (formattedError: any) {
        setError(formattedError.message || 'An error occurred during cleanup');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full space-y-8"
      >
        <div className="card !p-10 text-center space-y-8 border-danger/20">
          <div className="space-y-4">
            <div className="mx-auto h-20 w-20 rounded-3xl bg-danger/10 flex items-center justify-center text-danger border border-danger/20 relative">
              <ShieldAlert className="h-10 w-10 stroke-[1.5px]" />
              <div className="absolute -top-1 -right-1 h-4 w-4 bg-danger rounded-full border-2 border-surface animate-pulse" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight text-primary">System Cleanup</h2>
              <p className="text-sm text-secondary leading-relaxed">
                This will permanently delete all operational data from your database. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">
                Type "DELETE ALL DATA" to confirm
              </label>
              <input 
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE ALL DATA"
                className="input w-full border-danger/30 focus:border-danger text-center font-bold"
                disabled={loading || success}
              />
            </div>

            <AnimatePresence mode="wait">
              {status && !error && !success && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center space-x-3 rounded-2xl bg-surface border border-border p-4 text-xs font-bold text-secondary uppercase tracking-widest"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-danger" />
                  <span>{status}</span>
                </motion.div>
              )}

              {success && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center space-y-3 rounded-2xl bg-success/5 border border-success/20 p-6 text-success"
                >
                  <CheckCircle2 className="h-10 w-10" />
                  <span className="text-xs font-bold uppercase tracking-widest">Database Wiped Successfully</span>
                </motion.div>
              )}

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center space-x-3 rounded-2xl bg-danger/5 border border-danger/20 p-4 text-xs font-bold text-danger uppercase tracking-widest"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {!success && (
              <button
                onClick={wipeData}
                disabled={loading || confirmText !== 'DELETE ALL DATA'}
                className="btn-primary w-full flex items-center justify-center space-x-3 !py-4 bg-danger hover:bg-danger/90 border-none disabled:opacity-30 relative overflow-hidden group"
              >
                <Trash2 className="h-5 w-5 stroke-[1.5px] group-hover:shake" />
                <span>{loading ? 'Wiping Database...' : 'Wipe All Data'}</span>
              </button>
            )}
            
            <div className="pt-4 flex items-center justify-center space-x-2 text-[10px] font-bold text-secondary/40 uppercase tracking-[0.2em]">
              <AlertTriangle className="h-3 w-3" />
              <span>Critical Administrative Operation</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
