import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Bus } from '../types';
import { Plus, Bus as BusIcon, Trash2, Edit2, X, Save, Info, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

export function BusManager() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [formData, setFormData] = useState({
    registration_number: '',
    model: '',
    capacity: 0
  });

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'buses'), orderBy('registration_number'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const busesList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
      setBuses(busesList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching buses:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Removed fetchBuses as it's replaced by onSnapshot hook logic above

  const handleOpenModal = (b?: Bus) => {
    if (b) {
      setEditingBus(b);
      setFormData({
        registration_number: b.registration_number,
        model: b.model,
        capacity: b.capacity
      });
    } else {
      setEditingBus(null);
      setFormData({
        registration_number: '',
        model: '',
        capacity: 0
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBus) {
        await updateDoc(doc(db, 'buses', editingBus.id), formData);
      } else {
        await addDoc(collection(db, 'buses'), {
          ...formData,
          created_at: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving bus:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bus?')) return;
    try {
      await deleteDoc(doc(db, 'buses', id));
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
          {buses.map((b, idx) => (
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
                  <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center text-accent border border-accent/20">
                    <BusIcon className="h-6 w-6 stroke-[1.5px]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary tracking-tight">{b.registration_number}</h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <Info className="h-3 w-3 text-secondary stroke-[1.5px]" />
                      <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{b.model}</span>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
              <div className="mt-8 border-t border-border pt-6 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-1.5 text-secondary">
                    <Users className="h-3 w-3 stroke-[1.5px]" />
                    <p className="text-[9px] font-bold uppercase tracking-widest">Capacity</p>
                  </div>
                  <p className="font-bold text-primary font-mono text-sm">{b.capacity} Seater</p>
                </div>
                <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
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
