import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  setDoc, 
  doc, 
  serverTimestamp, 
  Timestamp,
  getDocs,
  query,
  orderBy,
  WriteBatch,
  writeBatch,
  increment,
  getDoc
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { cn } from '../lib/utils';
import { Hirer, Booking, BookingStatus } from '../types';
import { X, Search, User, Phone, MapPin, Calendar, Clock, CreditCard, DollarSign, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { generateNextDutySlipNumber } from '../lib/booking-utils';
import { motion, AnimatePresence } from 'framer-motion';

interface NewBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  hirer?: Hirer | null;
}

export function NewBookingModal({ isOpen, onClose, hirer }: NewBookingModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Hirer Search & Selection
  const [hirers, setHirers] = useState<Hirer[]>([]);
  const [hirerSearch, setHirerSearch] = useState('');
  const [selectedHirer, setSelectedHirer] = useState<Hirer | null>(null);
  const [isSearchingHirer, setIsSearchingHirer] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Booking Form State
  const [formData, setFormData] = useState({
    hirerName: '',
    contactNumber: '',
    alternateContactNumber: '',
    address: '',
    pickupPoint: '',
    refBy: '',
    destination: '',
    departureDate: format(new Date(), 'yyyy-MM-dd'),
    departureTime: '06:00',
    arrivalDate: format(new Date(), 'yyyy-MM-dd'),
    arrivalTime: '21:00',
    vehicleRequired: '',
    settlementAmount: 0,
    driverAllowance: 150,
    notes: '',
  });

  // Advance Payment State
  const [advancePayment, setAdvancePayment] = useState({
    amount: 0,
    paymentMode: 'Cash' as 'Cash' | 'UPI' | 'Bank Transfer',
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  useEffect(() => {
    if (isOpen) {
      if (hirer) {
        setSelectedHirer(hirer);
        setHirerSearch(hirer.hirerName);
        setFormData(prev => ({
          ...prev,
          hirerName: hirer.hirerName,
          contactNumber: hirer.contactNumber,
          alternateContactNumber: hirer.alternateNumber || '',
          address: hirer.address,
          refBy: hirer.refBy || '',
          pickupPoint: '',
          destination: '',
        }));
      } else {
        setSelectedHirer(null);
        setHirerSearch('');
        setFormData({
          hirerName: '',
          contactNumber: '',
          alternateContactNumber: '',
          address: '',
          pickupPoint: '',
          refBy: '',
          destination: '',
          departureDate: format(new Date(), 'yyyy-MM-dd'),
          departureTime: '06:00',
          arrivalDate: format(new Date(), 'yyyy-MM-dd'),
          arrivalTime: '21:00',
          vehicleRequired: '',
          settlementAmount: 0,
          driverAllowance: 150,
          notes: '',
        });
      }
      fetchHirers();
    }
  }, [isOpen, hirer]);

  const fetchHirers = async () => {
    try {
      const q = query(collection(db, 'hirers'), orderBy('hirerName', 'asc'));
      const snapshot = await getDocs(q);
      setHirers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Hirer)));
    } catch (error) {
      console.error('Error fetching hirers:', error);
    }
  };

  const filteredHirers = hirers.filter(h => 
    h.hirerName.toLowerCase().includes(hirerSearch.toLowerCase()) ||
    h.contactNumber.includes(hirerSearch)
  );

  const handleSelectHirer = (hirer: Hirer) => {
    setSelectedHirer(hirer);
    setHirerSearch(hirer.hirerName);
    setFormData(prev => ({
      ...prev,
      hirerName: hirer.hirerName,
      contactNumber: hirer.contactNumber,
      alternateContactNumber: hirer.alternateNumber || '',
      address: hirer.address,
      refBy: hirer.refBy || '',
    }));
    setIsSearchingHirer(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      const dsNumber = await generateNextDutySlipNumber();
      
      let hirerId = selectedHirer?.id;
      
      // 1. Handle New Hirer Creation
      if (!hirerId) {
        const hirerRef = doc(collection(db, 'hirers'));
        hirerId = hirerRef.id;
        batch.set(hirerRef, {
          hirerName: formData.hirerName,
          contactNumber: formData.contactNumber,
          alternateNumber: formData.alternateContactNumber,
          address: formData.address,
          refBy: formData.refBy,
          totalBookings: 1,
          totalRevenue: formData.settlementAmount,
          createdAt: serverTimestamp(),
        });
      } else {
        // Update existing hirer
        batch.update(doc(db, 'hirers', hirerId), {
          totalBookings: increment(1),
          totalRevenue: increment(formData.settlementAmount),
        });
      }

      // 2. Prepare Booking Data
      const bookingRef = doc(collection(db, 'bookings'));
      const status: BookingStatus = advancePayment.amount > 0 ? 'ADVANCE PAID' : 'CONFIRMED';
      
      const finalAmount = formData.settlementAmount;
      const totalPaid = advancePayment.amount;
      const balanceDue = finalAmount - totalPaid;

      batch.set(bookingRef, {
        dutySlipNumber: dsNumber,
        bookingDate: serverTimestamp(),
        departureDate: Timestamp.fromDate(new Date(formData.departureDate)),
        arrivalDate: Timestamp.fromDate(new Date(formData.arrivalDate)),
        departureTime: formData.departureTime,
        arrivalTime: formData.arrivalTime,
        hirerId,
        hirerName: formData.hirerName,
        contactNumber: formData.contactNumber,
        alternateContactNumber: formData.alternateContactNumber,
        address: formData.address,
        pickupPoint: formData.pickupPoint,
        destination: formData.destination,
        vehicleRequired: formData.vehicleRequired,
        driverAllowance: Number(formData.driverAllowance),
        refBy: formData.refBy,
        settlementAmount: Number(formData.settlementAmount),
        extraCharges: 0,
        finalAmount: Number(finalAmount),
        totalPaid: Number(totalPaid),
        balanceDue: Number(balanceDue),
        status,
        notes: formData.notes,
        createdBy: profile.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Handle Advance Payment
      if (advancePayment.amount > 0) {
        const paymentRef = doc(collection(db, 'bookings', bookingRef.id, 'payments'));
        batch.set(paymentRef, {
          amount: Number(advancePayment.amount),
          paymentDate: Timestamp.fromDate(new Date(advancePayment.paymentDate)),
          paymentMode: advancePayment.paymentMode,
          receivedBy: profile.full_name,
          notes: advancePayment.notes || 'Advance Payment',
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bookings');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-surface w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-background/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <Plus className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Create New Booking</h3>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest italic">New Duty Slip Entry</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border rounded-xl transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-10">
          {/* Hirer Section */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <User className="h-4 w-4 text-accent" />
              <h4 className="text-xs font-black uppercase tracking-widest text-primary italic">Hirer Information</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative" ref={dropdownRef}>
                <label className="label">Hirer Name</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                  <input 
                    type="text" 
                    className="input pl-10 w-full"
                    placeholder="Search or enter name..."
                    value={hirerSearch}
                    onChange={(e) => {
                      setHirerSearch(e.target.value);
                      setFormData(prev => ({ ...prev, hirerName: e.target.value }));
                      setIsSearchingHirer(true);
                      setSelectedHirer(null);
                    }}
                    required
                  />
                </div>
                <AnimatePresence>
                  {isSearchingHirer && hirerSearch && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-10 left-0 right-0 mt-2 bg-surface border border-border rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto"
                    >
                      {filteredHirers.map(hirer => (
                        <button
                          key={hirer.id}
                          type="button"
                          onClick={() => handleSelectHirer(hirer)}
                          className="w-full px-4 py-3 text-left hover:bg-accent/5 flex items-center justify-between border-b border-border last:border-b-0"
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-primary">{hirer.hirerName}</span>
                            <span className="text-[10px] text-secondary">{hirer.contactNumber}</span>
                          </div>
                          <span className="text-[10px] font-black text-accent uppercase tracking-tighter">Existing</span>
                        </button>
                      ))}
                      {filteredHirers.length === 0 && (
                        <div className="p-4 text-center">
                          <p className="text-xs text-secondary italic">No matching hirer found. A new record will be created.</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="label">Contact Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                    <input 
                      type="tel" 
                      className="input pl-10 w-full font-mono text-sm"
                      placeholder="e.g. 9811XXXXXX"
                      value={formData.contactNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, contactNumber: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="label">Alternate Contact (Optional)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                    <input 
                      type="tel" 
                      className="input pl-10 w-full font-mono text-sm"
                      placeholder="Alternate number"
                      value={formData.alternateContactNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, alternateContactNumber: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="label">Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-secondary" />
                  <textarea 
                    className="input pl-10 w-full min-h-[80px]"
                    placeholder="Enter hirer's full address..."
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    required
                  ></textarea>
                </div>
              </div>
            </div>
          </section>

          {/* Booking Details */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Calendar className="h-4 w-4 text-accent" />
              <h4 className="text-xs font-black uppercase tracking-widest text-primary italic">Booking Details</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="md:col-span-2 lg:col-span-1 space-y-2">
                <label className="label">Pickup Point</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                  <input 
                    type="text" 
                    className="input pl-10 w-full"
                    placeholder="e.g. Delhi Cantt, Metro Gate..."
                    value={formData.pickupPoint}
                    onChange={(e) => setFormData(prev => ({ ...prev, pickupPoint: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="md:col-span-2 lg:col-span-1 space-y-2">
                <label className="label">Destination</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                  <input 
                    type="text" 
                    className="input pl-10 w-full"
                    placeholder="e.g. Haridwar, Jaipur..."
                    value={formData.destination}
                    onChange={(e) => setFormData(prev => ({ ...prev, destination: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="label">Departure Date</label>
                <input 
                  type="date" 
                  className="input w-full"
                  value={formData.departureDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, departureDate: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="label">Departure Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                  <input 
                    type="time" 
                    className="input pl-10 w-full"
                    value={formData.departureTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, departureTime: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="lg:col-start-2 space-y-2">
                <label className="label">Arrival Date</label>
                <input 
                  type="date" 
                  className="input w-full"
                  value={formData.arrivalDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, arrivalDate: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="label">Arrival Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                  <input 
                    type="time" 
                    className="input pl-10 w-full"
                    value={formData.arrivalTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, arrivalTime: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="label">Vehicle Required</label>
                <input 
                  type="text" 
                  className="input w-full"
                  placeholder="e.g. BUS 52 SEATER AC"
                  value={formData.vehicleRequired}
                  onChange={(e) => setFormData(prev => ({ ...prev, vehicleRequired: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="label">Settlement Amount (₹)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                  <input 
                    type="number" 
                    className="input pl-10 w-full font-black text-primary"
                    placeholder="Total deal amount"
                    value={formData.settlementAmount || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, settlementAmount: Number(e.target.value) }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="label">Ref. By</label>
                <input 
                  type="text" 
                  className="input w-full"
                  value={formData.refBy}
                  onChange={(e) => setFormData(prev => ({ ...prev, refBy: e.target.value }))}
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3 space-y-2">
                <label className="label">Internal Notes</label>
                <textarea 
                  className="input w-full min-h-[60px]"
                  placeholder="Any special instructions..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                ></textarea>
              </div>
            </div>
          </section>

          {/* Advance Payment Section */}
          <section className="p-6 bg-accent/5 rounded-3xl border border-accent/20 space-y-6">
            <div className="flex items-center gap-2 border-b border-accent/20 pb-2">
              <CreditCard className="h-4 w-4 text-accent" />
              <h4 className="text-xs font-black uppercase tracking-widest text-accent italic">Initial Advance (Optional)</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <label className="label">Advance Amount</label>
                <input 
                  type="number" 
                  className="input w-full bg-surface"
                  value={advancePayment.amount || ''}
                  onChange={(e) => setAdvancePayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                />
              </div>

              <div className="space-y-2">
                <label className="label">Payment Mode</label>
                <select 
                  className="input w-full bg-surface"
                  value={advancePayment.paymentMode}
                  onChange={(e) => setAdvancePayment(prev => ({ ...prev, paymentMode: e.target.value as any }))}
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="label">Payment Date</label>
                <input 
                  type="date" 
                  className="input w-full bg-surface"
                  value={advancePayment.paymentDate}
                  onChange={(e) => setAdvancePayment(prev => ({ ...prev, paymentDate: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <label className="label">Received By</label>
                <input 
                  type="text" 
                  className="input w-full bg-surface opacity-60 cursor-not-allowed"
                  value={profile.full_name}
                  disabled
                />
              </div>
            </div>
          </section>
        </form>

        <div className="p-6 bg-background/50 border-t border-border flex items-center justify-between">
          <div className="hidden md:block">
            <p className="text-[10px] text-secondary font-bold uppercase tracking-widest italic">Review details before submitting</p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1 md:flex-none py-3 px-8 text-sm font-bold"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary flex-1 md:flex-none py-3 px-12 text-sm font-bold flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Create Booking</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
