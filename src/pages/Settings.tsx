import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, deleteDoc, onSnapshot, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { logActivity } from '../lib/activity-logger';
import { formatCurrency, cn } from '../lib/utils';
import { School, ActivityLog } from '../types';
import { format } from 'date-fns';
import { 
  Wallet, 
  Save, 
  AlertCircle,
  CheckCircle2,
  Info,
  Plus,
  Trash2,
  School as SchoolIcon,
  History,
  Search,
  Filter as FilterIcon,
  Calendar as CalendarIcon,
  User as UserIcon
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
  const [schools, setSchools] = useState<School[]>([]);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [addingSchool, setAddingSchool] = useState(false);

  // Activity Log State
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logFilters, setLogFilters] = useState({
    user: 'all',
    action: 'all',
    module: 'all',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchSettings();
    
    // Listen to schools
    const qSchools = query(collection(db, 'schools'), orderBy('name'));
    const unsubscribeSchools = onSnapshot(qSchools, (snap) => {
      setSchools(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as School)));
    });

    // Listen to logs
    const qLogs = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribeLogs = onSnapshot(qLogs, (snap) => {
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));
      setLogsLoading(false);
    });

    return () => {
      unsubscribeSchools();
      unsubscribeLogs();
    };
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

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Edited',
          'Settings',
          `Updated opening balances: Owner=${openingBalances.owner}, Accountant=${openingBalances.accountant}`
        );
      }

      setMessage({ type: 'success', text: 'Opening balances updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/opening_balances');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSchool() {
    if (!newSchoolName.trim()) return;
    setAddingSchool(true);
    try {
      await addDoc(collection(db, 'schools'), {
        name: newSchoolName.trim(),
        created_at: serverTimestamp()
      });

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Settings',
          `Added new school: ${newSchoolName.trim()}`
        );
      }

      setNewSchoolName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'schools');
    } finally {
      setAddingSchool(false);
    }
  }

  async function handleDeleteSchool(id: string) {
    if (!confirm('Are you sure you want to delete this school?')) return;
    const schoolToDelete = schools.find(s => s.id === id);
    try {
      await deleteDoc(doc(db, 'schools', id));

      // Log activity
      if (profile && schoolToDelete) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Deleted',
          'Settings',
          `Deleted school: ${schoolToDelete.name}`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'schools');
    }
  }

  const filteredLogs = logs.filter(log => {
    if (logFilters.user !== 'all' && log.user_role !== logFilters.user) return false;
    if (logFilters.action !== 'all' && log.action_type !== logFilters.action) return false;
    if (logFilters.module !== 'all' && log.module !== logFilters.module) return false;
    
    if (logFilters.startDate) {
      const start = new Date(logFilters.startDate);
      const logDate = log.timestamp?.toDate() || new Date();
      if (logDate < start) return false;
    }
    
    if (logFilters.endDate) {
      const end = new Date(logFilters.endDate);
      end.setHours(23, 59, 59, 999);
      const logDate = log.timestamp?.toDate() || new Date();
      if (logDate > end) return false;
    }
    
    return true;
  });

  const uniqueModules = Array.from(new Set(logs.map(l => l.module))).sort();
  const uniqueUsers = Array.from(new Set(logs.map(l => l.user_role))).sort();

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

        {/* School Management Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card space-y-6"
        >
          <div className="flex items-center space-x-3 border-b border-border pb-4">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <SchoolIcon className="h-5 w-5 stroke-[1.5px]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-primary">School Names</h3>
              <p className="text-xs text-secondary font-medium">Manage the list of schools for Staff Route dropdowns</p>
            </div>
          </div>

          <div className="flex space-x-2">
            <input
              type="text"
              value={newSchoolName}
              onChange={(e) => setNewSchoolName(e.target.value)}
              placeholder="Enter school name..."
              className="input flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddSchool()}
            />
            <button
              onClick={handleAddSchool}
              disabled={addingSchool || !newSchoolName.trim()}
              className="btn-primary !py-2 !px-4 flex items-center space-x-2"
            >
              {addingSchool ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>Add</span>
            </button>
          </div>

          <div className="grid gap-3">
            {schools.length === 0 ? (
              <div className="text-center py-8 bg-surface rounded-xl border border-dashed border-border">
                <p className="text-xs text-secondary font-medium">No schools added yet</p>
              </div>
            ) : (
              schools.map(school => (
                <div 
                  key={school.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border group hover:border-accent/30 transition-all"
                >
                  <span className="text-sm font-medium text-primary">{school.name}</span>
                  <button
                    onClick={() => handleDeleteSchool(school.id)}
                    className="p-2 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Activity Log Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card space-y-6"
        >
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <History className="h-5 w-5 stroke-[1.5px]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary">Activity Log</h3>
                <p className="text-xs text-secondary font-medium">Audit trail of system actions</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 bg-surface/50 p-4 rounded-xl border border-border">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">User Role</label>
              <select 
                value={logFilters.user}
                onChange={(e) => setLogFilters({ ...logFilters, user: e.target.value })}
                className="input !py-2 text-xs"
              >
                <option value="all">All Roles</option>
                {uniqueUsers.map(role => (
                  <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Action</label>
              <select 
                value={logFilters.action}
                onChange={(e) => setLogFilters({ ...logFilters, action: e.target.value as any })}
                className="input !py-2 text-xs"
              >
                <option value="all">All Actions</option>
                <option value="Created">Created</option>
                <option value="Edited">Edited</option>
                <option value="Deleted">Deleted</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Module</label>
              <select 
                value={logFilters.module}
                onChange={(e) => setLogFilters({ ...logFilters, module: e.target.value })}
                className="input !py-2 text-xs"
              >
                <option value="all">All Modules</option>
                {uniqueModules.map(mod => (
                  <option key={mod} value={mod}>{mod}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Start Date</label>
              <input 
                type="date"
                value={logFilters.startDate}
                onChange={(e) => setLogFilters({ ...logFilters, startDate: e.target.value })}
                className="input !py-2 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">End Date</label>
              <input 
                type="date"
                value={logFilters.endDate}
                onChange={(e) => setLogFilters({ ...logFilters, endDate: e.target.value })}
                className="input !py-2 text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface border-b border-border">
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">User</th>
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">Action</th>
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">Module</th>
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">Details</th>
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {logsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-secondary">
                      <div className="flex items-center justify-center space-x-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
                        <span>Loading logs...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-secondary">
                      No activity logs found matching the filters.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-accent/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-primary">{log.user_name}</span>
                          <span className="text-[10px] text-secondary uppercase tracking-wider">{log.user_role}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          log.action_type === 'Created' ? "bg-success/10 text-success" :
                          log.action_type === 'Edited' ? "bg-accent/10 text-accent" :
                          "bg-danger/10 text-danger"
                        )}>
                          {log.action_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-primary">{log.module}</td>
                      <td className="px-4 py-3 text-secondary max-w-xs truncate" title={log.details}>
                        {log.details}
                      </td>
                      <td className="px-4 py-3 text-secondary font-mono">
                        {log.timestamp ? format(log.timestamp.toDate(), 'dd MMM yyyy HH:mm') : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
