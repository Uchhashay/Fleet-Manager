import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  limit,
  where
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { B2BClient, Bill } from '../types';
import { 
  X, 
  Plus, 
  Search, 
  Users, 
  Phone, 
  MapPin, 
  ExternalLink,
  Table as TableIcon,
  Filter,
  MoreVertical,
  ChevronRight,
  TrendingUp,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface B2BClientDirectoryProps {
  isOpen: boolean;
  onClose: () => void;
}

export function B2BClientDirectory({ isOpen, onClose }: B2BClientDirectoryProps) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<B2BClient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const q = query(collection(db, 'b2bClients'), orderBy('clientName'));
    const unsub = onSnapshot(q, (snap) => {
      setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as B2BClient)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'b2bClients'));

    return () => unsub();
  }, [isOpen]);

  const filteredClients = useMemo(() => {
    return clients.filter(c => 
      c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.contactNumber.includes(searchTerm)
    );
  }, [clients, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm shadow-2xl overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-6xl max-h-[95vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-border bg-background/50 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
           <div className="flex items-center gap-5">
              <div className="h-12 w-12 md:h-16 md:w-16 rounded-3xl bg-accent/10 flex items-center justify-center text-accent shadow-inner">
                 <Users className="h-6 w-6 md:h-8 md:w-8" />
              </div>
              <div>
                 <h2 className="text-xl md:text-3xl font-black text-primary tracking-tighter">B2B Client <span className="text-accent italic">Directory</span></h2>
                 <p className="text-[10px] md:text-xs font-black text-secondary/60 uppercase tracking-widest leading-none mt-1">Manage corporate partners</p>
              </div>
           </div>
           
           <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="relative group flex-1 md:w-80">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-secondary group-focus-within:text-accent transition-colors" />
                 <input
                    type="text"
                    placeholder="Search clients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 md:pl-12 pr-4 py-2 md:py-3 bg-background border border-border rounded-2xl focus:outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent transition-all font-medium text-sm"
                 />
              </div>
              <button 
                onClick={onClose}
                className="h-10 w-10 flex items-center justify-center hover:bg-border rounded-xl transition-all border border-border shadow-sm shrink-0"
              >
                <X className="h-6 w-6 text-secondary" />
              </button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-slate-50/50">
           {selectedClientId ? (
             <ClientProfileSection 
                clientId={selectedClientId} 
                onBack={() => setSelectedClientId(null)} 
             />
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClients.map(client => (
                   <motion.div 
                      layoutId={client.id}
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className="bg-surface border border-border rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
                   >
                      <div className="flex items-start justify-between mb-4">
                         <div className="h-12 w-12 rounded-2xl bg-accent/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all">
                            <span className="text-lg font-black">{client.clientName[0].toUpperCase()}</span>
                         </div>
                         <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-slate-100 rounded-full text-secondary">
                            {client.clientType}
                         </span>
                      </div>
                      
                      <h3 className="text-xl font-black text-primary mb-1 group-hover:text-accent transition-colors">{client.clientName}</h3>
                      <div className="space-y-3 mt-4">
                         <div className="flex items-center gap-2.5 text-secondary">
                            <Phone className="h-3.5 w-3.5 opacity-40" />
                            <span className="text-xs font-bold leading-none">{client.contactNumber}</span>
                         </div>
                         <div className="flex items-center gap-2.5 text-secondary">
                            <User className="h-3.5 w-3.5 opacity-40" />
                            <span className="text-xs font-bold leading-none">{client.contactPerson}</span>
                         </div>
                         <div className="flex items-start gap-2.5 text-secondary">
                            <MapPin className="h-3.5 w-3.5 opacity-40 mt-0.5" />
                            <span className="text-xs font-bold leading-tight line-clamp-2 italic">{client.address}</span>
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-border/50">
                         <div>
                            <p className="text-[9px] font-black text-secondary/40 uppercase tracking-widest">Total Bills</p>
                            <p className="text-sm font-black text-primary">{client.totalBills || 0}</p>
                         </div>
                         <div>
                            <p className="text-[9px] font-black text-secondary/40 uppercase tracking-widest">Revenue</p>
                            <p className="text-sm font-black text-success">{formatCurrency(client.totalRevenue || 0)}</p>
                         </div>
                      </div>
                   </motion.div>
                ))}

                <button 
                  onClick={() => {/* Open add client specifically? */}}
                  className="bg-accent/5 border-2 border-dashed border-accent/20 rounded-[2rem] p-6 flex flex-col items-center justify-center gap-3 group hover:bg-accent/10 transition-all min-h-[220px]"
                >
                   <div className="h-14 w-14 rounded-full bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 transition-all">
                      <Plus className="h-7 w-7" />
                   </div>
                   <p className="text-sm font-black text-accent uppercase tracking-widest">Register Client</p>
                </button>
             </div>
           )}
        </div>
      </motion.div>
    </div>
  );
}

function ClientProfileSection({ clientId, onBack }: { clientId: string, onBack: () => void }) {
  const [client, setClient] = useState<B2BClient | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubClient = onSnapshot(doc(db, 'b2bClients', clientId), (snap) => {
      if (snap.exists()) setClient({ id: snap.id, ...snap.data() } as B2BClient);
    });

    const q = query(
      collection(db, 'bills'),
      where('clientId', '==', clientId),
      orderBy('billDate', 'desc')
    );
    const unsubBills = onSnapshot(q, (snap) => {
      setBills(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill)));
      setLoading(false);
    });

    return () => {
      unsubClient();
      unsubBills();
    };
  }, [clientId]);

  if (!client) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
       <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-white rounded-xl transition-all text-secondary"
          >
             <X className="h-5 w-5" />
          </button>
          <h3 className="text-2xl font-black text-primary tracking-tighter">Client <span className="text-accent italic">Profile</span></h3>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left info */}
          <div className="lg:col-span-4 space-y-6">
             <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm">
                <div className="flex flex-col items-center text-center mb-10">
                   <div className="h-24 w-24 rounded-[2rem] bg-accent/5 flex items-center justify-center text-accent text-4xl font-black shadow-inner mb-4">
                      {client.clientName[0].toUpperCase()}
                   </div>
                   <h2 className="text-2xl font-black text-primary leading-none mb-2">{client.clientName}</h2>
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 bg-slate-100 rounded-full text-secondary">
                      {client.clientType}
                   </span>
                </div>

                <div className="space-y-6">
                   <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-background border border-border rounded-xl">
                         <User className="h-4 w-4 text-accent" />
                      </div>
                      <div className="text-left">
                         <p className="text-[9px] font-black text-secondary/40 uppercase">Contact Person</p>
                         <p className="text-sm font-bold text-primary">{client.contactPerson}</p>
                      </div>
                   </div>
                   <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-background border border-border rounded-xl">
                         <Phone className="h-4 w-4 text-accent" />
                      </div>
                      <div className="text-left">
                         <p className="text-[9px] font-black text-secondary/40 uppercase">Phone Number</p>
                         <p className="text-sm font-bold text-primary">{client.contactNumber}</p>
                      </div>
                   </div>
                   {client.gstNumber && (
                     <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-background border border-border rounded-xl">
                           <FileText className="h-4 w-4 text-accent" />
                        </div>
                        <div className="text-left">
                           <p className="text-[9px] font-black text-secondary/40 uppercase">GST Number</p>
                           <p className="text-sm font-bold text-primary">{client.gstNumber}</p>
                        </div>
                     </div>
                   )}
                   <div className="flex items-start gap-4">
                      <div className="p-2.5 bg-background border border-border rounded-xl">
                         <MapPin className="h-4 w-4 text-accent" />
                      </div>
                      <div className="text-left">
                         <p className="text-[9px] font-black text-secondary/40 uppercase">Office Address</p>
                         <p className="text-xs font-bold text-secondary italic leading-relaxed">{client.address}</p>
                      </div>
                   </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-10 pt-8 border-t border-border/50">
                   <div className="bg-slate-50 p-4 rounded-2xl text-center">
                      <TrendingUp className="h-5 w-5 text-success mx-auto mb-2" />
                      <p className="text-[9px] font-black text-secondary/40 uppercase mb-1">Total Revenue</p>
                      <p className="text-lg font-black text-primary tracking-tighter">{formatCurrency(client.totalRevenue || 0)}</p>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-2xl text-center">
                      <FileText className="h-5 w-5 text-accent mx-auto mb-2" />
                      <p className="text-[9px] font-black text-secondary/40 uppercase mb-1">Total Bills</p>
                      <p className="text-lg font-black text-primary tracking-tighter">{client.totalBills || 0}</p>
                   </div>
                </div>
             </div>
          </div>

          {/* Right Bills List */}
          <div className="lg:col-span-8 space-y-6">
             <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Billing History</h4>
                <button 
                  className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 transition-all shadow-lg shadow-accent/20"
                >
                  <Plus className="h-4 w-4" />
                  New Bill
                </button>
             </div>

             <div className="bg-surface rounded-3xl border border-border shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left">
                   <thead>
                      <tr className="bg-background/50 border-b border-border">
                         <th className="px-6 py-4 text-[9px] font-black text-secondary uppercase tracking-widest">Bill No.</th>
                         <th className="px-6 py-4 text-[9px] font-black text-secondary uppercase tracking-widest">Date</th>
                         <th className="px-6 py-4 text-[9px] font-black text-secondary uppercase tracking-widest text-right">Amount</th>
                         <th className="px-6 py-4 text-[9px] font-black text-secondary uppercase tracking-widest text-center">Status</th>
                         <th className="px-6 py-4 text-[9px] font-black text-secondary uppercase tracking-widest text-right"></th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-border/30">
                      {bills.map(bill => (
                         <tr key={bill.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4">
                               <span className="text-xs font-bold text-primary group-hover:text-accent transition-colors">{bill.billNumber}</span>
                            </td>
                            <td className="px-6 py-4">
                               <span className="text-xs text-secondary font-medium">{format(bill.billDate.toDate(), 'dd MMM yyyy')}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                               <span className="text-xs font-black text-primary">{formatCurrency(bill.totalAmount)}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                               <span className={cn(
                                 "inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter",
                                 bill.status === 'PAID' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                               )}>
                                 {bill.status}
                               </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                               <button className="p-2 hover:bg-accent/5 rounded-lg text-secondary hover:text-accent transition-all">
                                  <ExternalLink className="h-4 w-4" />
                               </button>
                            </td>
                         </tr>
                      ))}
                      {bills.length === 0 && (
                        <tr>
                           <td colSpan={5} className="px-6 py-12 text-center">
                              <p className="text-xs text-secondary italic">No billing history found for this client.</p>
                           </td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>
          </div>
       </div>
    </div>
  );
}

// Fixed import for User which was used in B2BClientDirectory
import { User as UserIcon } from 'lucide-react';
const User = UserIcon;
