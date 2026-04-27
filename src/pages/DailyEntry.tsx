import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Bus, Staff, DailyRecord, School } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { logActivity } from '../lib/activity-logger';
import { Save, Plus, AlertCircle, CheckCircle2, Bus as BusIcon, Calendar, ChevronRight, ChevronLeft, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { FUEL_TYPES } from '../constants';

import { useAuth } from '../contexts/AuthContext';

export function DailyEntry() {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    bus_id: '',
    driver_id: '',
    helper_id: '',
    school_morning: 0,
    school_evening: 0,
    school_morning_name: '',
    school_evening_name: '',
    charter_morning: 0,
    charter_evening: 0,
    private_booking: 0,
    booking_details: '',
    fuel_amount: 0,
    fuel_type: FUEL_TYPES[0],
    driver_duty_payable: 0,
    driver_duty_paid: 0,
    helper_duty_payable: 0,
    helper_duty_paid: 0,
    is_holiday: false,
    notes: '',
    paid_by: 'accountant' as 'owner' | 'accountant'
  });

  useEffect(() => {
    if (profile?.role === 'admin' || profile?.role === 'developer') {
      setFormData(prev => ({ ...prev, paid_by: 'owner' }));
    } else {
      setFormData(prev => ({ ...prev, paid_by: 'accountant' }));
    }
  }, [profile?.role]);

  useEffect(() => {
    fetchInitialData();

    // Listen to schools
    const qSchools = query(collection(db, 'schools'), orderBy('name'));
    const unsubscribeSchools = onSnapshot(qSchools, (snap) => {
      setSchools(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as School)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'schools'));

    return () => unsubscribeSchools();
  }, []);

  async function fetchInitialData() {
    try {
      const [busesSnap, staffSnap] = await Promise.all([
        getDocs(query(collection(db, 'buses'), orderBy('registration_number'))),
        getDocs(query(collection(db, 'staff'), orderBy('full_name')))
      ]);

      const busesList = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
      const staffList = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));

      setBuses(busesList);
      setStaff(staffList);
      
      if (busesList.length) {
        setFormData(prev => ({ ...prev, bus_id: busesList[0].id }));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalCollection = 
    formData.school_morning + 
    formData.school_evening + 
    formData.charter_morning + 
    formData.charter_evening + 
    formData.private_booking;

  const netCollection = totalCollection;
  const netExpense = formData.fuel_amount + formData.driver_duty_paid + formData.helper_duty_paid;
  const netBalance = netCollection - netExpense;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'number' ? parseFloat(value) || 0 : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    // Safeguard: only submit if we are on the final step
    if (step < 4) {
      nextStep();
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const docRef = await addDoc(collection(db, 'daily_records'), {
        ...formData,
        created_by: auth.currentUser?.uid,
        created_at: serverTimestamp()
      });

      // Log Cash In (Collection)
      if (netCollection > 0) {
        try {
          await addDoc(collection(db, 'cash_transactions'), {
            date: formData.date,
            type: 'in',
            category: 'daily_collection',
            amount: netCollection,
            description: `Daily Collection: Bus ${buses.find(b => b.id === formData.bus_id)?.registration_number}`,
            linked_id: docRef.id,
            paid_by: formData.paid_by,
            created_by: auth.currentUser?.uid,
            created_at: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'cash_transactions');
        }
      }

      // Log Cash Out (Expenses)
      if (netExpense > 0) {
        try {
          await addDoc(collection(db, 'cash_transactions'), {
            date: formData.date,
            type: 'out',
            category: 'bus_expense',
            amount: netExpense,
            description: `Daily Expenses (Fuel/Duty): Bus ${buses.find(b => b.id === formData.bus_id)?.registration_number}`,
            linked_id: docRef.id,
            paid_by: formData.paid_by,
            created_by: auth.currentUser?.uid,
            created_at: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'cash_transactions');
        }
      }

      setMessage({ type: 'success', text: 'Record saved successfully!' });
      
      // Log activity
      if (profile) {
        const busNum = buses.find(b => b.id === formData.bus_id)?.registration_number || 'Unknown Bus';
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Daily Entry',
          `Created entry for ${busNum} on ${formData.date}`
        );
      }

      setStep(1);
      // Reset form partially
      setFormData(prev => ({
        ...prev,
        school_morning: 0,
        school_evening: 0,
        school_morning_name: '',
        school_evening_name: '',
        charter_morning: 0,
        charter_evening: 0,
        private_booking: 0,
        booking_details: '',
        fuel_amount: 0,
        driver_duty_payable: 0,
        driver_duty_paid: 0,
        helper_duty_payable: 0,
        helper_duty_paid: 0,
        notes: '',
        paid_by: (profile?.role === 'admin' || profile?.role === 'developer') ? 'owner' : 'accountant'
      }));
    } catch (error: any) {
      console.error('Error saving record:', error);
      if (error.message?.includes('insufficient permissions')) {
        setMessage({ type: 'error', text: 'Permission denied. Please check your role.' });
      } else {
        setMessage({ type: 'error', text: error.message || 'Failed to save record' });
      }
      handleFirestoreError(error, OperationType.CREATE, 'daily_records');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
    </div>
  );

  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const steps = [
    { id: 1, title: 'Bus & Date' },
    { id: 2, title: 'Staff' },
    { id: 3, title: 'Collections' },
    { id: 4, title: 'Finalize' }
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="flex flex-col space-y-2">
        <div className="flex items-center space-x-2 text-secondary">
          <ClipboardList className="h-4 w-4 stroke-[1.5px]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Data Entry</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Daily Entry</h1>
          <div className="flex items-center space-x-1.5">
            {steps.map(s => (
              <div 
                key={s.id} 
                className={cn(
                  "h-1 w-6 rounded-full transition-all duration-300",
                  s.id <= step ? "bg-accent" : "bg-border"
                )} 
              />
            ))}
          </div>
        </div>
      </header>

      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "flex items-center space-x-3 rounded-xl p-4 text-xs font-bold",
            message.type === 'success' ? "bg-success/10 text-success border border-success/20" : "bg-danger/10 text-danger border border-danger/20"
          )}
        >
          {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{message.text}</span>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 && (
              <div className="card space-y-8">
                <div>
                  <h2 className="text-sm font-bold text-primary tracking-tight mb-1">Step 1: Select Bus & Date</h2>
                  <p className="text-[10px] text-secondary font-medium">Choose the vehicle and operational date</p>
                </div>
                
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    {buses.map(bus => (
                      <button
                        key={bus.id}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, bus_id: bus.id }))}
                        className={cn(
                          "flex flex-col items-center justify-center rounded-xl border p-5 transition-all duration-300",
                          formData.bus_id === bus.id 
                            ? "border-accent bg-accent/5 text-accent" 
                            : "border-border bg-surface text-secondary hover:border-border-hover"
                        )}
                      >
                        <BusIcon className="mb-3 h-5 w-5 stroke-[1.5px]" />
                        <span className="text-xs font-bold tracking-tight">{bus.registration_number}</span>
                      </button>
                    ))}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="label">Operation Date</label>
                    <input
                      type="date"
                      name="date"
                      value={formData.date}
                      onChange={handleInputChange}
                      className="input"
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-surface border border-border p-4">
                    <div className="flex items-center space-x-3">
                      <div className="h-8 w-8 rounded-full bg-border/50 flex items-center justify-center text-secondary">
                        <Calendar className="h-4 w-4 stroke-[1.5px]" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-primary">Holiday / Sunday</span>
                        <p className="text-[10px] text-secondary font-medium">Skip collection fields</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, is_holiday: !prev.is_holiday }))}
                      className={cn(
                        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300",
                        formData.is_holiday ? "bg-accent" : "bg-border"
                      )}
                    >
                      <span className={cn(
                        "inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-300",
                        formData.is_holiday ? "translate-x-5" : "translate-x-1"
                      )} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="card space-y-8">
                <div>
                  <h2 className="text-sm font-bold text-primary tracking-tight mb-1">Step 2: Staff on Duty</h2>
                  <p className="text-[10px] text-secondary font-medium">Assign driver and helper for this trip</p>
                </div>

                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label className="label">Driver</label>
                    <select
                      name="driver_id"
                      value={formData.driver_id}
                      onChange={handleInputChange}
                      className="input"
                      required={!formData.is_holiday}
                    >
                      <option value="">Select Driver</option>
                      {staff.filter(s => s.role === 'driver').map(s => (
                        <option key={s.id} value={s.id}>{s.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="label">Helper</label>
                    <select
                      name="helper_id"
                      value={formData.helper_id}
                      onChange={handleInputChange}
                      className="input"
                      required={!formData.is_holiday}
                    >
                      <option value="">Select Helper</option>
                      {staff.filter(s => s.role === 'helper').map(s => (
                        <option key={s.id} value={s.id}>{s.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="card space-y-8">
                <div>
                  <h2 className="text-sm font-bold text-primary tracking-tight mb-1">Step 3: Collections</h2>
                  <p className="text-[10px] text-secondary font-medium">Enter revenue from different routes</p>
                </div>

                <div className={cn("grid gap-8", formData.is_holiday && "opacity-30 pointer-events-none")}>
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest">School Staff Route</h3>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <label className="label !mb-0 text-[10px]">Morning School</label>
                          <select
                            name="school_morning_name"
                            value={formData.school_morning_name}
                            onChange={handleInputChange}
                            className="input"
                          >
                            <option value="">Select School</option>
                            {schools.map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="label !mb-0 text-[10px]">Morning Amount (₹)</label>
                          <input 
                            type="number" 
                            inputMode="numeric" 
                            name="school_morning" 
                            value={formData.school_morning || ''} 
                            onChange={handleInputChange} 
                            className="input font-mono" 
                            placeholder="0" 
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <label className="label !mb-0 text-[10px]">Evening School</label>
                          <select
                            name="school_evening_name"
                            value={formData.school_evening_name}
                            onChange={handleInputChange}
                            className="input"
                          >
                            <option value="">Select School</option>
                            {schools.map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="label !mb-0 text-[10px]">Evening Amount (₹)</label>
                          <input 
                            type="number" 
                            inputMode="numeric" 
                            name="school_evening" 
                            value={formData.school_evening || ''} 
                            onChange={handleInputChange} 
                            className="input font-mono" 
                            placeholder="0" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest">Charter / Office Route</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="label !mb-0 text-[10px]">Morning (₹)</label>
                        <input type="number" inputMode="numeric" name="charter_morning" value={formData.charter_morning || ''} onChange={handleInputChange} className="input font-mono" placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <label className="label !mb-0 text-[10px]">Evening (₹)</label>
                        <input type="number" inputMode="numeric" name="charter_evening" value={formData.charter_evening || ''} onChange={handleInputChange} className="input font-mono" placeholder="0" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 pt-4 border-t border-border/50">
                    <div className="space-y-2">
                      <label className="label">Private Booking (₹)</label>
                      <input type="number" inputMode="numeric" name="private_booking" value={formData.private_booking || ''} onChange={handleInputChange} className="input font-mono" placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Booking Details</label>
                      <textarea 
                        name="booking_details" 
                        value={formData.booking_details} 
                        onChange={handleInputChange} 
                        className="input min-h-[100px] py-3" 
                        placeholder="e.g. Marriage party, School trip..." 
                      />
                    </div>
                  </div>

                  <div className="rounded-xl bg-accent/5 border border-accent/20 p-5 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Net Collection</span>
                    <span className="text-2xl font-bold text-accent font-mono tracking-tighter">{formatCurrency(netCollection)}</span>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="card space-y-8">
                <div>
                  <h2 className="text-sm font-bold text-primary tracking-tight mb-1">Step 4: Expenses & Finalize</h2>
                  <p className="text-[10px] text-secondary font-medium">Record fuel, duty payments and additional notes</p>
                </div>

                <div className={cn("grid gap-6", formData.is_holiday && "opacity-30 pointer-events-none")}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="label">Fuel Amount (₹)</label>
                      <input type="number" inputMode="numeric" name="fuel_amount" value={formData.fuel_amount || ''} onChange={handleInputChange} className="input font-mono" placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Fuel Type</label>
                      <select name="fuel_type" value={formData.fuel_type} onChange={handleInputChange} className="input">
                        {FUEL_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                    <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                      <div className="space-y-2">
                        <label className="label">Driver Duty (Payable)</label>
                        <p className="text-[10px] text-secondary font-medium mb-1 truncate">
                          {staff.find(s => s.id === formData.driver_id)?.full_name || 'No Driver Selected'}
                        </p>
                        <input type="number" inputMode="numeric" name="driver_duty_payable" value={formData.driver_duty_payable || ''} onChange={handleInputChange} className="input font-mono" placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <label className="label">Driver Duty (Paid)</label>
                        <div className="h-[15px]" /> {/* Spacer to align with name above */}
                        <input type="number" inputMode="numeric" name="driver_duty_paid" value={formData.driver_duty_paid || ''} onChange={handleInputChange} className="input font-mono" placeholder="0" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                      <div className="space-y-2">
                        <label className="label">Helper Duty (Payable)</label>
                        <p className="text-[10px] text-secondary font-medium mb-1 truncate">
                          {staff.find(s => s.id === formData.helper_id)?.full_name || 'No Helper Selected'}
                        </p>
                        <input type="number" inputMode="numeric" name="helper_duty_payable" value={formData.helper_duty_payable || ''} onChange={handleInputChange} className="input font-mono" placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <label className="label">Helper Duty (Paid)</label>
                        <div className="h-[15px]" />
                        <input type="number" inputMode="numeric" name="helper_duty_paid" value={formData.helper_duty_paid || ''} onChange={handleInputChange} className="input font-mono" placeholder="0" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-border/50">
                    <label className="label">Handled By (Cash)</label>
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
                  
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                    <div className="rounded-xl bg-danger/5 border border-danger/20 p-4">
                      <p className="text-[9px] font-bold text-danger uppercase tracking-widest mb-1">Net Expense</p>
                      <p className="text-lg font-bold text-danger font-mono tracking-tighter">{formatCurrency(netExpense)}</p>
                    </div>
                    <div className={cn("rounded-xl p-4 border", netBalance >= 0 ? "bg-success/5 border-success/20" : "bg-danger/5 border-danger/20")}>
                      <p className={cn("text-[9px] font-bold uppercase tracking-widest mb-1", netBalance >= 0 ? "text-success" : "text-danger")}>Net Balance</p>
                      <p className={cn("text-lg font-bold font-mono tracking-tighter", netBalance >= 0 ? "text-success" : "text-danger")}>{formatCurrency(netBalance)}</p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-border/50">
                    <label className="label">Notes</label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      rows={3}
                      className="input min-h-[100px] py-3"
                      placeholder="Any additional details about the trip..."
                    />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-6">
          <button
            type="button"
            onClick={prevStep}
            disabled={step === 1}
            className="btn-secondary flex items-center space-x-2 !px-6"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          
          <button
            key={step < 4 ? 'next' : 'submit'}
            type="button"
            onClick={step < 4 ? nextStep : () => handleSubmit()}
            disabled={saving}
            className={cn(
              "btn-primary flex items-center space-x-2",
              step < 4 ? "!px-8" : "!px-10"
            )}
          >
            {step < 4 ? (
              <>
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </>
            ) : (
              <>
                {saving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                ) : (
                  <Save className="h-4 w-4 stroke-[1.5px]" />
                )}
                <span>{saving ? 'Submitting...' : 'Submit'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
