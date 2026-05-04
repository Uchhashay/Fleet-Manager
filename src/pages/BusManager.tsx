import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Bus } from '../types';
import { Plus, Bus as BusIcon, Trash2, Edit2, X, Save, Info, Users, BarChart2, ChevronDown, ChevronRight, Shield, Activity, Wind, Calendar, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { cn } from '../lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import { logActivity } from '../lib/activity-logger';

export function BusManager() {
  const { profile } = useAuth();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [formData, setFormData] = useState({
    registration_number: '',
    model: '',
    capacity: 0,
    bus_type: 'School Bus' as Bus['bus_type'],
    ac_type: 'AC' as Bus['ac_type'],
    is_active: true,
    purchase_date: '',
    insurance_expiry: '',
    fitness_expiry: '',
    permit_expiry: '',
    notes: ''
  });

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'buses'), orderBy('registration_number'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const busesList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
      setBuses(busesList);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'buses'));

    return () => unsubscribe();
  }, []);

  // Removed fetchBuses as it's replaced by onSnapshot hook logic above

  const handleOpenModal = (b?: Bus) => {
    if (b) {
      setEditingBus(b);
      setFormData({
        registration_number: b.registration_number,
        model: b.model,
        capacity: b.capacity,
        bus_type: b.bus_type || 'School Bus',
        ac_type: b.ac_type || 'AC',
        is_active: b.is_active ?? true,
        purchase_date: b.purchase_date || '',
        insurance_expiry: b.insurance_expiry || '',
        fitness_expiry: b.fitness_expiry || '',
        permit_expiry: b.permit_expiry || '',
        notes: b.notes || ''
      });
      setShowAdditionalDetails(false);
    } else {
      setEditingBus(null);
      setFormData({
        registration_number: '',
        model: '',
        capacity: 0,
        bus_type: 'School Bus',
        ac_type: 'AC',
        is_active: true,
        purchase_date: '',
        insurance_expiry: '',
        fitness_expiry: '',
        permit_expiry: '',
        notes: ''
      });
      setShowAdditionalDetails(false);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBus) {
        await updateDoc(doc(db, 'buses', editingBus.id), formData);
        if (profile) {
          await logActivity(
            profile.full_name,
            profile.role,
            'Edited',
            'Fleet Management',
            `Updated details for bus: ${formData.registration_number}`
          );
        }
      } else {
        await addDoc(collection(db, 'buses'), {
          ...formData,
          created_at: serverTimestamp()
        });
        if (profile) {
          await logActivity(
            profile.full_name,
            profile.role,
            'Created',
            'Fleet Management',
            `Added new vehicle: ${formData.registration_number} (${formData.model})`
          );
        }
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving bus:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bus?')) return;
    const busToDelete = buses.find(b => b.id === id);
    try {
      await deleteDoc(doc(db, 'buses', id));
      if (profile && busToDelete) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Deleted',
          'Fleet Management',
          `Deleted vehicle: ${busToDelete.registration_number}`
        );
      }
    } catch (error) {
      console.error('Error deleting bus:', error);
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
            <BusIcon className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Fleet Management</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Bus Directory</h1>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center space-x-2 !px-6"
        >
          <Plus className="h-4 w-4 stroke-[1.5px]" />
          <span>Add Vehicle</span>
        </button>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {buses.map((b, idx) => {
            const insuranceDays = b.insurance_expiry ? differenceInDays(parseISO(b.insurance_expiry), new Date()) : 100;
            const fitnessDays = b.fitness_expiry ? differenceInDays(parseISO(b.fitness_expiry), new Date()) : 100;
            const permitDays = b.permit_expiry ? differenceInDays(parseISO(b.permit_expiry), new Date()) : 100;
            const hasWarning = insuranceDays <= 30 || fitnessDays <= 30 || permitDays <= 30;

            return (
              <motion.div 
                key={b.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.05 }}
                className="card group hover:border-accent/30"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center text-accent border border-accent/20">
                        <BusIcon className="h-6 w-6 stroke-[1.5px]" />
                      </div>
                      <div className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                        b.is_active !== false ? "bg-success animate-pulse" : "bg-gray-400"
                      )} />
                    </div>
                    <div>
                      <h3 className="font-bold text-primary tracking-tight">{b.registration_number}</h3>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-[9px] font-bold text-secondary uppercase tracking-widest">{b.model}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface text-secondary border border-border uppercase font-bold tracking-tighter">
                          {b.bus_type || 'School Bus'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    <Link
                      to={`/admin/buses/${b.id}`}
                      className="p-2 text-secondary hover:text-primary hover:bg-surface rounded-lg transition-colors"
                      title="View Bus Profile"
                    >
                      <BarChart2 className="h-4 w-4 stroke-[1.5px]" />
                    </Link>
                    <button 
                      onClick={() => handleOpenModal(b)}
                      className="p-2 text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                    >
                      <Edit2 className="h-4 w-4 stroke-[1.5px]" />
                    </button>
                    <button 
                      onClick={() => handleDelete(b.id)}
                      className="p-2 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4 stroke-[1.5px]" />
                    </button>
                  </div>
                </div>

                {hasWarning && (
                  <div className="mt-4 p-2 rounded-lg bg-warning/5 border border-warning/10 flex items-center space-x-2">
                    <AlertTriangle className="h-3 w-3 text-warning" />
                    <span className="text-[9px] font-bold text-warning uppercase">Expiring Documents</span>
                  </div>
                )}

                <div className="mt-6 border-t border-border pt-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="space-y-0.5">
                      <p className="text-[8px] font-bold text-secondary uppercase tracking-widest">Capacity</p>
                      <p className="font-bold text-primary text-xs">{b.capacity} Seats</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[8px] font-bold text-secondary uppercase tracking-widest">Type</p>
                      <p className="font-bold text-primary text-xs">{b.ac_type || 'AC'}</p>
                    </div>
                  </div>
                  {b.is_active === false ? (
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest py-1 px-2 rounded-lg bg-gray-50 border border-gray-100">Inactive Fleet</span>
                  ) : (
                    <span className="text-[8px] font-bold text-success uppercase tracking-widest py-1 px-2 rounded-lg bg-success/5 border border-success/10">Active Fleet</span>
                  )}
                </div>
              </motion.div>
            );
          })}
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
              className="relative w-full max-w-lg card shadow-2xl border-accent/20 max-h-[90vh] overflow-y-auto"
            >
              <div className="mb-8 flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-md pb-4 z-10">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-accent">
                    <BusIcon className="h-3 w-3 stroke-[1.5px]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Vehicle Details</span>
                  </div>
                  <h3 className="text-xl font-bold text-primary">{editingBus ? 'Edit Vehicle' : 'Add New Vehicle'}</h3>
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
                  <label className="label">Registration Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DL 1PB 1234"
                    value={formData.registration_number}
                    onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                    className="input"
                  />
                </div>
                <div className="space-y-2">
                  <label className="label">Model</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TATA Starbus"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="input"
                  />
                </div>
                <div className="space-y-2">
                  <label className="label">Capacity</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      value={formData.capacity || ''}
                      onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                      className="input pr-12 font-mono"
                      placeholder="0"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-secondary uppercase tracking-widest">Seats</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Bus Type</label>
                    <select
                      value={formData.bus_type}
                      onChange={(e) => setFormData({ ...formData, bus_type: e.target.value as Bus['bus_type'] })}
                      className="input appearance-none"
                    >
                      <option value="School Bus">School Bus</option>
                      <option value="Coach">Coach</option>
                      <option value="Mini Bus">Mini Bus</option>
                      <option value="Tempo">Tempo</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="label">Climate Control</label>
                    <select
                      value={formData.ac_type}
                      onChange={(e) => setFormData({ ...formData, ac_type: e.target.value as Bus['ac_type'] })}
                      className="input appearance-none"
                    >
                      <option value="AC">AC</option>
                      <option value="Non-AC">Non-AC</option>
                    </select>
                  </div>
                </div>

                {/* Additional Details Collapsible */}
                <div className="border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdditionalDetails(!showAdditionalDetails)}
                    className="flex items-center justify-between w-full p-2 hover:bg-surface rounded-lg transition-colors"
                  >
                    <div className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-[0.1em] text-secondary">
                      {showAdditionalDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span>Additional Details (Optional)</span>
                    </div>
                  </button>

                  <AnimatePresence>
                    {showAdditionalDetails && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-4 pt-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="label">Purchase Date</label>
                              <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary/50" />
                                <input
                                  type="date"
                                  value={formData.purchase_date}
                                  onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                                  className="input !pl-10"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="label">Insurance Expiry</label>
                              <div className="relative">
                                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary/50" />
                                <input
                                  type="date"
                                  value={formData.insurance_expiry}
                                  onChange={(e) => setFormData({ ...formData, insurance_expiry: e.target.value })}
                                  className="input !pl-10"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="label">Fitness Expiry</label>
                              <div className="relative">
                                <Activity className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary/50" />
                                <input
                                  type="date"
                                  value={formData.fitness_expiry}
                                  onChange={(e) => setFormData({ ...formData, fitness_expiry: e.target.value })}
                                  className="input !pl-10"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="label">Permit Expiry</label>
                              <div className="relative">
                                <Wind className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary/50" />
                                <input
                                  type="date"
                                  value={formData.permit_expiry}
                                  onChange={(e) => setFormData({ ...formData, permit_expiry: e.target.value })}
                                  className="input !pl-10"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="label">Notes</label>
                            <textarea
                              value={formData.notes}
                              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                              className="input min-h-[80px]"
                              placeholder="General vehicle notes..."
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full flex items-center justify-center space-x-2 !py-4 mt-4"
                >
                  <Save className="h-4 w-4 stroke-[1.5px]" />
                  <span>{editingBus ? 'Update Vehicle' : 'Save Vehicle'}</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
