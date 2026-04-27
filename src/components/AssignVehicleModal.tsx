import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where,
  doc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { Booking, Bus, Staff } from '../types';
import { X, Truck, User, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface AssignVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
}

export function AssignVehicleModal({ isOpen, onClose, booking }: AssignVehicleModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Staff[]>([]);
  
  const [selectedBusId, setSelectedBusId] = useState(booking.vehicleId || '');
  const [selectedDriverId, setSelectedDriverId] = useState(booking.driverId || '');
  const [driverAllowance, setDriverAllowance] = useState(booking.driverAllowance || 150);

  useEffect(() => {
    if (isOpen) {
      fetchFleet();
    }
  }, [isOpen]);

  const fetchFleet = async () => {
    try {
      const busesSnap = await getDocs(collection(db, 'buses'));
      setBuses(busesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bus)));

      const driversSnap = await getDocs(query(collection(db, 'staff'), where('role', '==', 'driver')));
      setDrivers(driversSnap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)));
    } catch (error) {
      console.error('Error fetching fleet:', error);
    }
  };

  const handleAssign = async () => {
    if (!profile || !selectedBusId || !selectedDriverId) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      const bookingRef = doc(db, 'bookings', booking.id);
      
      const selectedBus = buses.find(b => b.id === selectedBusId);
      const selectedDriver = drivers.find(d => d.id === selectedDriverId);

      batch.update(bookingRef, {
        vehicleId: selectedBusId,
        vehicleName: selectedBus?.registration_number,
        driverId: selectedDriverId,
        driverName: selectedDriver?.full_name,
        driverAllowance: Number(driverAllowance),
        status: 'VEHICLE ASSIGNED',
        updatedAt: serverTimestamp()
      });

      const activityRef = doc(collection(db, 'bookings', booking.id, 'activity'));
      batch.set(activityRef, {
        action: 'Vehicle & Driver Assigned',
        details: `Assiged ${selectedBus?.registration_number} with Driver ${selectedDriver?.full_name}. Allowance: ₹${driverAllowance}`,
        createdAt: serverTimestamp(),
        createdBy: profile.full_name
      });

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
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <Truck className="h-6 w-6" />
             </div>
             <div>
                <h3 className="text-lg font-black text-primary">Assign Fleet</h3>
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">{booking.dutySlipNumber}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border rounded-xl">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
           <div className="space-y-2">
              <label className="label">Select Vehicle</label>
              <select 
                className="input w-full"
                value={selectedBusId}
                onChange={(e) => setSelectedBusId(e.target.value)}
              >
                <option value="">Choose a bus...</option>
                {buses.map(bus => (
                  <option key={bus.id} value={bus.id}>
                    {bus.registration_number} ({bus.capacity} Seater)
                  </option>
                ))}
              </select>
           </div>

           <div className="space-y-2">
              <label className="label">Select Driver</label>
              <select 
                className="input w-full"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
              >
                <option value="">Choose a driver...</option>
                {drivers.map(driver => (
                  <option key={driver.id} value={driver.id}>
                    {driver.full_name}
                  </option>
                ))}
              </select>
           </div>

           <div className="space-y-2">
              <label className="label">Driver Allowance (₹ / Day)</label>
              <input 
                type="number" 
                className="input w-full"
                value={driverAllowance}
                onChange={(e) => setDriverAllowance(Number(e.target.value))}
              />
           </div>

           <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 italic leading-relaxed">
                Assigning a vehicle and driver will update the booking status to <strong>VEHICLE ASSIGNED</strong>.
              </p>
           </div>
        </div>

        <div className="p-6 bg-background/50 border-t border-border flex gap-3">
           <button onClick={onClose} className="btn-secondary flex-1 py-3 font-bold">Cancel</button>
           <button 
             onClick={handleAssign}
             disabled={loading || !selectedBusId || !selectedDriverId}
             className="btn-primary flex-1 py-3 font-bold flex items-center justify-center gap-2"
           >
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Assign Fleet</span>
                </>
              )}
           </button>
        </div>
      </motion.div>
    </div>
  );
}
