import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  where
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Hirer, Booking } from '../types';
import { 
  Search, 
  Users, 
  Phone, 
  Plus, 
  History, 
  TrendingUp, 
  Calendar, 
  MapPin, 
  FileText,
  Edit2,
  ExternalLink,
  ClipboardList
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { NewBookingModal } from '../components/NewBookingModal';
import { HirerProfileModal } from '../components/HirerProfileModal';

import { B2BClientDirectory } from '../components/B2BClientDirectory';

export function HirerDirectory() {
  const { profile } = useAuth();
  const [hirers, setHirers] = useState<Hirer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewBookingModalOpen, setIsNewBookingModalOpen] = useState(false);
  const [selectedHirerForBooking, setSelectedHirerForBooking] = useState<Hirer | null>(null);
  
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedHirerId, setSelectedHirerId] = useState<string | null>(null);
  const [isB2BDirectoryOpen, setIsB2BDirectoryOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'hirers'), orderBy('hirerName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHirers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Hirer)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'hirers'));

    return () => unsubscribe();
  }, []);

  const filteredHirers = useMemo(() => {
    return hirers.filter(hirer => 
      hirer.hirerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      hirer.contactNumber.includes(searchTerm)
    );
  }, [hirers, searchTerm]);

  const handleViewProfile = (hirerId: string) => {
    setSelectedHirerId(hirerId);
    setIsProfileModalOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-primary tracking-tight">Hirer Directory</h2>
          <p className="text-secondary font-medium italic">CRM & customer booking history</p>
        </div>
        <div className="flex items-center gap-2">
           <button 
             onClick={() => setIsB2BDirectoryOpen(true)}
             className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-xl text-primary text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
           >
             <Users className="h-4 w-4 text-accent" />
             B2B Partners
           </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-secondary" />
          <input 
            type="text" 
            placeholder="Search by hirer name or contact number..." 
            className="input pl-12 py-6 w-full text-lg font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden border border-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr className="bg-background/50">
                <th className="text-xs uppercase tracking-widest font-bold font-sans">Hirer Name</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans">Phone Number</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans text-center">Total Bookings</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans text-right">Total Revenue</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans text-center">Last Booking</th>
                <th className="text-xs uppercase tracking-widest font-bold font-sans text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    <div className="flex flex-col items-center gap-2">
                       <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                       <span className="text-xs font-bold text-secondary">Loading hirers...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredHirers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-20 text-secondary italic">No hirers found</td>
                </tr>
              ) : (
                filteredHirers.map((hirer) => (
                  <tr key={hirer.id} className="hover:bg-accent/5 transition-colors group">
                    <td className="font-bold text-primary">{hirer.hirerName}</td>
                    <td className="text-secondary font-medium">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-accent" />
                        {hirer.contactNumber}
                      </div>
                    </td>
                    <td className="text-center">
                      <span className="badge bg-primary/10 text-primary font-black">{hirer.totalBookings}</span>
                    </td>
                    <td className="text-right font-black text-success">
                      {formatCurrency(hirer.totalRevenue || 0)}
                    </td>
                    <td className="text-center text-xs text-secondary italic">
                      {hirer.createdAt ? format(hirer.createdAt.toDate(), 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleViewProfile(hirer.id)}
                          className="p-2 hover:bg-accent/10 hover:text-accent rounded-xl transition-all" 
                          title="View Profile"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        {(profile?.role === 'admin' || profile?.role === 'developer') && (
                          <button className="p-2 hover:bg-border rounded-xl text-secondary" title="Edit Hirer">
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            setSelectedHirerForBooking(hirer);
                            setIsNewBookingModalOpen(true);
                          }}
                          className="btn-primary py-1.5 px-3 text-[10px] space-x-1" 
                          title="New Booking"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Book</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewBookingModal 
        isOpen={isNewBookingModalOpen}
        onClose={() => {
          setIsNewBookingModalOpen(false);
          setSelectedHirerForBooking(null);
        }}
        hirer={selectedHirerForBooking}
      />

      {selectedHirerId && (
        <HirerProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => {
            setIsProfileModalOpen(false);
            setSelectedHirerId(null);
          }}
          hirerId={selectedHirerId}
        />
      )}

      {isB2BDirectoryOpen && (
        <B2BClientDirectory 
          isOpen={isB2BDirectoryOpen}
          onClose={() => setIsB2BDirectoryOpen(false)}
        />
      )}
    </div>
  );
}
