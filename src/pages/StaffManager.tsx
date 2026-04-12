import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Staff, UserRole } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { UserPlus, Trash2, Edit2, X, Save, Users, Briefcase, IndianRupee, Clock, BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../lib/activity-logger';

export function StaffManager() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    role: 'driver' as UserRole,
    fixed_salary: 0,
    duty_rate: 0
  });

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'staff'), orderBy('full_name'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const staffList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
      setStaff(staffList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching staff:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Removed fetchStaff as it's replaced by onSnapshot hook logic above

  const handleOpenModal = (s?: Staff) => {
    if (s) {
      setEditingStaff(s);
      setFormData({
        full_name: s.full_name,
        role: s.role,
        fixed_salary: s.fixed_salary,
        duty_rate: s.duty_rate || 0
      });
    } else {
      setEditingStaff(null);
      setFormData({
        full_name: '',
        role: 'driver',
        fixed_salary: 0,
        duty_rate: 0
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStaff) {
        await updateDoc(doc(db, 'staff', editingStaff.id), formData);
        if (profile) {
          await logActivity(
            profile.full_name,
            profile.role,
            'Edited',
            'Staff Management',
            `Updated details for staff member: ${formData.full_name}`
          );
        }
      } else {
        await addDoc(collection(db, 'staff'), {
          ...formData,
          created_at: serverTimestamp()
        });
        if (profile) {
          await logActivity(
            profile.full_name,
            profile.role,
            'Created',
            'Staff Management',
            `Added new staff member: ${formData.full_name} (${formData.role})`
          );
        }
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving staff:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    const staffToDelete = staff.find(s => s.id === id);
    try {
      await deleteDoc(doc(db, 'staff', id));
      if (profile && staffToDelete) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Deleted',
          'Staff Management',
          `Deleted staff member: ${staffToDelete.full_name}`
        );
      }
    } catch (error) {
      console.error('Error deleting staff:', error);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <Users className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Human Resources</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Staff Directory</h1>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center space-x-2 !px-6"
        >
          <UserPlus className="h-4 w-4 stroke-[1.5px]" />
          <span>Add Member</span>
        </button>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {staff.map((s, idx) => (
            <motion.div 
              key={s.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: idx * 0.05 }}
              className="card group hover:border-accent/30"
            >
              <div className="flex items-start justify-between">
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
                <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link 
                    to={`/admin/drivers/${s.id}`}
                    className="p-2 text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                    title="View Performance"
                  >
                    <BarChart2 className="h-4 w-4 stroke-[1.5px]" />
                  </Link>
                  <button 
                    onClick={() => handleOpenModal(s)}
                    className="p-2 text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                  >
                    <Edit2 className="h-4 w-4 stroke-[1.5px]" />
                  </button>
                  <button 
                    onClick={() => handleDelete(s.id)}
                    className="p-2 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4 stroke-[1.5px]" />
                  </button>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-6">
                <div className="space-y-1">
                  <div className="flex items-center space-x-1 text-secondary">
                    <IndianRupee className="h-2.5 w-2.5" />
                    <p className="text-[9px] font-bold uppercase tracking-wider">Base Salary</p>
                  </div>
                  <p className="font-bold text-primary font-mono text-sm">{formatCurrency(s.fixed_salary)}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-1 text-secondary">
                    <Briefcase className="h-2.5 w-2.5" />
                    <p className="text-[9px] font-bold uppercase tracking-wider">Duty Rate</p>
                  </div>
                  <p className="font-bold text-primary font-mono text-sm">{formatCurrency(s.duty_rate || 0)}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md card shadow-2xl border-accent/20"
            >
              <div className="mb-8 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-accent">
                    <UserPlus className="h-3 w-3 stroke-[1.5px]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Member Details</span>
                  </div>
                  <h3 className="text-xl font-bold text-primary">{editingStaff ? 'Edit Member' : 'Add New Member'}</h3>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="p-2 text-secondary hover:text-primary hover:bg-surface rounded-full transition-colors"
                >
                  <X className="h-5 w-5 stroke-[1.5px]" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="label">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="input"
                    placeholder="e.g. Rajesh Kumar"
                  />
                </div>

                <div className="space-y-2">
                  <label className="label">Role</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['driver', 'helper'].map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setFormData({ ...formData, role: role as 'driver' | 'helper' })}
                        className={cn(
                          "rounded-xl border px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all duration-300",
                          formData.role === role 
                            ? "bg-accent text-background border-accent" 
                            : "bg-surface text-secondary border-border hover:border-border-hover"
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Base Salary</label>
                    <input
                      type="number"
                      required
                      value={formData.fixed_salary || ''}
                      onChange={(e) => setFormData({ ...formData, fixed_salary: parseInt(e.target.value) || 0 })}
                      className="input text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label">Duty Rate</label>
                    <input
                      type="number"
                      value={formData.duty_rate || ''}
                      onChange={(e) => setFormData({ ...formData, duty_rate: parseInt(e.target.value) || 0 })}
                      className="input text-sm font-mono"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full flex items-center justify-center space-x-2 !py-4 mt-4"
                >
                  <Save className="h-4 w-4 stroke-[1.5px]" />
                  <span>{editingStaff ? 'Update Member' : 'Save Member'}</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
