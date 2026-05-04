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
  increment,
  getDocs,
  limit,
  Timestamp
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { B2BClient, Bill, BillLineItem, BillTemplate } from '../types';
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  Search, 
  UserPlus, 
  AlertCircle,
  FileText,
  Calendar,
  IndianRupee,
  ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { logActivity } from '../lib/activity-logger';

interface NewBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillClientId?: string;
}

export function NewBillModal({ isOpen, onClose, prefillClientId }: NewBillModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<B2BClient[]>([]);
  const [templates, setTemplates] = useState<BillTemplate[]>([]);
  
  // Form State
  const [selectedClient, setSelectedClient] = useState<B2BClient | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [lineItems, setLineItems] = useState<BillLineItem[]>([{ description: '', amount: 0 }]);
  const [hasAdvance, setHasAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceDate, setAdvanceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [advanceMode, setAdvanceMode] = useState('UPI');
  const [notes, setNotes] = useState('');

  // New Client Form
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({
    clientName: '',
    contactPerson: '',
    contactNumber: '',
    address: '',
    clientType: 'School' as any
  });

  useEffect(() => {
    // Fetch Clients
    const unsubClients = onSnapshot(query(collection(db, 'b2bClients'), orderBy('clientName')), (snap) => {
      const clientList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as B2BClient));
      setClients(clientList);
      
      if (prefillClientId) {
        const prefilled = clientList.find(c => c.id === prefillClientId);
        if (prefilled) setSelectedClient(prefilled);
      }
    });

    // Fetch Templates
    const unsubTemplates = onSnapshot(collection(db, 'settings', 'billTemplates', 'list'), (snap) => {
      setTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillTemplate)));
    });

    // Auto-generate Bill Number
    const generateBillNumber = async () => {
       const q = query(collection(db, 'bills'), orderBy('billNumber', 'desc'), limit(1));
       const snap = await getDocs(q);
       if (snap.empty) {
         setBillNumber('BILL-000001');
       } else {
         const lastNum = snap.docs[0].data().billNumber;
         const num = parseInt(lastNum.split('-')[1]) + 1;
         setBillNumber(`BILL-${num.toString().padStart(6, '0')}`);
       }
    };
    generateBillNumber();

    return () => {
      unsubClients();
      unsubTemplates();
    };
  }, [prefillClientId]);

  const subTotal = useMemo(() => lineItems.reduce((acc, curr) => acc + curr.amount, 0), [lineItems]);
  const totalAmount = subTotal;
  const balanceDue = hasAdvance ? totalAmount - advanceAmount : totalAmount;

  const filteredClients = clients.filter(c => 
    c.clientName.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.contactPerson.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: '', amount: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleUpdateLineItem = (index: number, field: keyof BillLineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const handleApplyTemplate = (index: number, template: BillTemplate) => {
    let content = template.content;
    if (selectedClient) {
      content = content.replace('[Client Name]', selectedClient.clientName);
    }
    const now = new Date();
    content = content.replace('[Month Year]', format(now, 'MMMM yyyy'));
    
    handleUpdateLineItem(index, 'description', content);
  };

  const handleCreateClient = async () => {
    if (!newClient.clientName.trim()) {
      alert("Client Name is required");
      return;
    }
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'b2bClients'), {
        clientName: newClient.clientName.trim(),
        contactPerson: newClient.contactPerson || '',
        contactNumber: newClient.contactNumber || '',
        address: newClient.address || '',
        clientType: newClient.clientType || 'Other',
        totalBills: 0,
        totalRevenue: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsAddingClient(false);
      setClientSearch('');
      // Selected client will be updated by the listener
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'b2bClients');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedClient || !billNumber) return;

    setLoading(true);
    try {
      const billData: any = {
        billNumber,
        billDate: Timestamp.fromDate(new Date(billDate)),
        clientId: selectedClient.id,
        clientName: selectedClient.clientName,
        clientType: selectedClient.clientType,
        contactPerson: selectedClient.contactPerson,
        contactNumber: selectedClient.contactNumber,
        address: selectedClient.address,
        lineItems,
        subTotal,
        totalAmount,
        balanceDue,
        status: balanceDue <= 0 ? 'PAID' : 'DRAFT',
        notes,
        createdBy: profile.full_name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (hasAdvance && advanceDate) {
        billData.advancePaid = advanceAmount;
        billData.advanceDate = Timestamp.fromDate(new Date(advanceDate));
        billData.advanceMode = advanceMode;
      } else {
        billData.advancePaid = 0;
      }

      await addDoc(collection(db, 'bills'), billData);
      
      // Update Client Stats
      const clientRef = doc(db, 'b2bClients', selectedClient.id);
      await updateDoc(clientRef, {
        totalBills: increment(1),
        totalRevenue: increment(totalAmount),
        updatedAt: serverTimestamp()
      });

      logActivity(profile.full_name, profile.role, 'Created', 'Bills', `Generated Bill ${billNumber} for ${selectedClient.clientName}`);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bills');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm shadow-2xl overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-surface w-full max-w-4xl max-h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-border bg-background/50 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-4">
              <div className="h-12 w-12 md:h-14 md:w-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shadow-inner">
                 <FileText className="h-6 w-6 md:h-7 md:w-7" />
              </div>
              <div>
                 <h2 className="text-2xl md:text-3xl font-black text-primary tracking-tighter">New <span className="text-accent italic">Bill</span></h2>
                 <p className="text-[10px] md:text-xs font-black text-secondary/60 uppercase tracking-widest leading-none mt-1">Generate B2B Invoice</p>
              </div>
           </div>
           <button onClick={onClose} className="h-10 w-10 flex items-center justify-center hover:bg-border rounded-xl transition-all shadow-sm border border-border">
              <X className="h-6 w-6 text-secondary" />
           </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-10 custom-scrollbar">
           {/* Client Selection */}
           <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Client Selection</h4>
                 {!isAddingClient && (
                    <button 
                      type="button"
                      onClick={() => setIsAddingClient(true)}
                      className="text-[10px] font-black text-accent uppercase tracking-widest flex items-center gap-1.5 hover:underline"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Add New Client
                    </button>
                 )}
              </div>

              {isAddingClient ? (
                <div className="p-6 bg-accent/5 rounded-3xl border border-accent/20 space-y-4 animate-in fade-in slide-in-from-top-2">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black text-secondary/60 uppercase ml-1">Client Name</label>
                         <input 
                           type="text"
                           value={newClient.clientName}
                           onChange={e => setNewClient({...newClient, clientName: e.target.value})}
                           className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none font-bold"
                           placeholder="e.g. DPS School"
                         />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black text-secondary/60 uppercase ml-1">Client Type</label>
                         <select 
                           value={newClient.clientType}
                           onChange={e => setNewClient({...newClient, clientType: e.target.value as any})}
                           className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none font-bold"
                         >
                           <option value="School">School</option>
                           <option value="Corporate">Corporate</option>
                           <option value="Event">Event</option>
                           <option value="Other">Other</option>
                         </select>
                      </div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black text-secondary/60 uppercase ml-1">Contact Person</label>
                         <input 
                           type="text"
                           value={newClient.contactPerson}
                           onChange={e => setNewClient({...newClient, contactPerson: e.target.value})}
                           className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none font-bold"
                         />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black text-secondary/60 uppercase ml-1">Phone Number</label>
                         <input 
                           type="text"
                           value={newClient.contactNumber}
                           onChange={e => setNewClient({...newClient, contactNumber: e.target.value})}
                           className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none font-bold"
                         />
                      </div>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-secondary/60 uppercase ml-1">Address</label>
                      <input 
                        type="text"
                        value={newClient.address}
                        onChange={e => setNewClient({...newClient, address: e.target.value})}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none font-bold"
                      />
                   </div>
                   <div className="flex items-center gap-3 pt-2">
                      <button 
                        type="button"
                        onClick={handleCreateClient}
                        className="flex-1 py-3 bg-accent text-white rounded-2xl font-bold hover:bg-accent/90 transition-all shadow-lg shadow-accent/20"
                      >
                        Create Client
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIsAddingClient(false)}
                        className="px-6 py-3 bg-slate-100 text-secondary rounded-2xl font-bold hover:bg-slate-200 transition-all"
                      >
                        Cancel
                      </button>
                   </div>
                </div>
              ) : (
                <div className="space-y-1.5 flex-1">
                   <label className="text-[10px] font-black text-secondary/60 uppercase ml-1">Search & Select Client</label>
                   <div className="relative">
                      <div 
                        className="w-full p-4 bg-background border border-border rounded-2xl flex items-center justify-between cursor-pointer hover:border-accent transition-all group shadow-sm focus-within:ring-2 focus-within:ring-accent/10"
                        onClick={() => setIsClientSearchOpen(!isClientSearchOpen)}
                      >
                         <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all">
                               <Search className="h-5 w-5" />
                            </div>
                            {selectedClient ? (
                               <div>
                                  <p className="text-sm font-black text-primary">{selectedClient.clientName}</p>
                                  <p className="text-[10px] font-bold text-secondary/60">{selectedClient.contactPerson} • {selectedClient.contactNumber}</p>
                               </div>
                            ) : (
                               <p className="text-sm font-bold text-secondary">Click to search clients...</p>
                            )}
                         </div>
                         <ChevronDown className={cn("h-5 w-5 text-secondary transition-transform", isClientSearchOpen && "rotate-180")} />
                      </div>

                      {isClientSearchOpen && (
                         <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-2xl shadow-2xl z-[120] py-2 animate-in fade-in zoom-in-95 backdrop-blur-sm">
                            <div className="px-4 pb-2 border-b border-border sticky top-0 bg-surface/90 z-10">
                               <input 
                                 type="text"
                                 value={clientSearch}
                                 onChange={e => setClientSearch(e.target.value)}
                                 placeholder="Type client name or contact number..."
                                 className="w-full py-2 bg-transparent border-none focus:ring-0 outline-none text-sm font-bold placeholder:text-secondary/40"
                                 autoFocus
                                 onClick={(e) => e.stopPropagation()}
                               />
                            </div>
                            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                               {filteredClients.map(client => (
                                  <button
                                    key={client.id}
                                    type="button"
                                    onClick={(e) => {
                                       e.stopPropagation();
                                       setSelectedClient(client);
                                       setIsClientSearchOpen(false);
                                       setClientSearch('');
                                    }}
                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/5 group transition-colors text-left border-b border-border/10 last:border-0"
                                  >
                                     <div>
                                        <p className="text-sm font-black text-primary group-hover:text-accent transition-colors">{client.clientName}</p>
                                        <p className="text-[10px] font-bold text-secondary/60 group-hover:text-secondary transition-colors">{client.contactPerson}</p>
                                     </div>
                                     <span className="text-[9px] font-black text-secondary/40 group-hover:text-accent uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-full">{client.clientType}</span>
                                  </button>
                               ))}
                               {filteredClients.length === 0 && (
                                  <div className="px-4 py-10 text-center">
                                     <p className="text-xs text-secondary italic">No clients found matching "{clientSearch}"</p>
                                     <button type="button" onClick={() => setIsAddingClient(true)} className="text-accent font-black underline mt-2 text-xs">Add As New Client?</button>
                                  </div>
                               )}
                            </div>
                         </div>
                      )}
                   </div>
                </div>
              )}
           </div>

           {/* Bill Details */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50/50 rounded-3xl border border-border/50">
              <div className="space-y-1.5">
                 <label className="text-[10px] font-black text-secondary/60 uppercase ml-1 flex items-center gap-1.5">
                    <FileText className="h-3 w-3" />
                    Bill Number
                 </label>
                 <input 
                   type="text"
                   value={billNumber}
                   onChange={e => setBillNumber(e.target.value)}
                   className="w-full px-6 py-3 bg-white border border-border rounded-2xl focus:ring-4 focus:ring-accent/10 focus:border-accent outline-none font-bold text-primary shadow-sm"
                 />
              </div>
              <div className="space-y-1.5">
                 <label className="text-[10px] font-black text-secondary/60 uppercase ml-1 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    Bill Date
                 </label>
                 <input 
                   type="date"
                   value={billDate}
                   onChange={e => setBillDate(e.target.value)}
                   className="w-full px-6 py-3 bg-white border border-border rounded-2xl focus:ring-4 focus:ring-accent/10 focus:border-accent outline-none font-bold text-primary shadow-sm"
                 />
              </div>
           </div>

           {/* Line Items */}
           <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Particulars / Description</h4>
                 <button 
                   type="button"
                   onClick={handleAddLineItem}
                   className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all border border-accent/20"
                 >
                   <Plus className="h-4 w-4" />
                   Add Item
                 </button>
              </div>

              <div className="space-y-4">
                 {lineItems.map((item, index) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={index} 
                      className="grid grid-cols-12 gap-4 items-start pb-4 border-b border-border/30 last:border-0"
                    >
                       <div className="col-span-8 space-y-2">
                          <textarea 
                            value={item.description}
                            onChange={e => handleUpdateLineItem(index, 'description', e.target.value)}
                            placeholder="Description of service..."
                            className="w-full px-4 py-3 bg-background border border-border rounded-2xl focus:border-accent outline-none text-sm font-bold min-h-[80px]"
                          />
                          <div className="flex flex-wrap gap-2">
                             {templates.map(tpl => (
                                <button
                                  key={tpl.id}
                                  type="button"
                                  onClick={() => handleApplyTemplate(index, tpl)}
                                  className="px-3 py-1 bg-slate-100 hover:bg-accent/10 hover:text-accent rounded-lg text-[9px] font-bold text-secondary uppercase transition-all"
                                >
                                   {tpl.name}
                                </button>
                             ))}
                          </div>
                       </div>
                       <div className="col-span-3 space-y-1.5">
                          <div className="relative">
                             <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary" />
                             <input 
                               type="number"
                               value={item.amount || ''}
                               onChange={e => handleUpdateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                               className="w-full pl-8 pr-4 py-3 bg-background border border-border rounded-xl focus:border-accent outline-none text-sm font-bold"
                               placeholder="0.00"
                             />
                          </div>
                       </div>
                       <div className="col-span-1 pt-3">
                          <button 
                            type="button" 
                            onClick={() => handleRemoveLineItem(index)}
                            className="p-3 text-secondary hover:text-error hover:bg-error/10 rounded-xl transition-all"
                          >
                             <Trash2 className="h-5 w-5" />
                          </button>
                       </div>
                    </motion.div>
                 ))}
              </div>
           </div>

           {/* Advance Section */}
           <div className="space-y-6">
              <div className="flex items-center justify-between p-6 bg-slate-50 border border-border rounded-3xl">
                 <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-background flex items-center justify-center border border-border shadow-sm">
                       <CheckCircle className={cn("h-6 w-6 transition-colors", hasAdvance ? "text-success" : "text-secondary/20")} />
                    </div>
                    <div>
                       <p className="text-sm font-black text-primary">Advance Received?</p>
                       <p className="text-xs text-secondary font-medium">Record partial payment if any.</p>
                    </div>
                 </div>
                 <button 
                   type="button"
                   onClick={() => setHasAdvance(!hasAdvance)}
                   className={cn(
                     "w-12 h-6 rounded-full relative transition-all duration-300",
                     hasAdvance ? "bg-success" : "bg-slate-300"
                   )}
                 >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm",
                      hasAdvance ? "left-7" : "left-1"
                    )} />
                 </button>
              </div>

              {hasAdvance && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-secondary/60 uppercase ml-1 italic">Advance Amount</label>
                      <div className="relative">
                         <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                         <input 
                           type="number"
                           value={advanceAmount || ''}
                           onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                           className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-2xl focus:border-accent outline-none font-bold"
                           placeholder="0"
                         />
                      </div>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-secondary/60 uppercase ml-1 italic">Payment Date</label>
                      <input 
                        type="date"
                        value={advanceDate}
                        onChange={e => setAdvanceDate(e.target.value)}
                        className="w-full px-4 py-3 bg-background border border-border rounded-2xl focus:border-accent outline-none font-bold"
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-secondary/60 uppercase ml-1 italic">Payment Mode</label>
                      <select 
                        value={advanceMode}
                        onChange={e => setAdvanceMode(e.target.value)}
                        className="w-full px-4 py-3 bg-background border border-border rounded-2xl focus:border-accent outline-none font-bold"
                      >
                         <option value="Cash">Cash</option>
                         <option value="UPI">UPI</option>
                         <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                   </div>
                </motion.div>
              )}
           </div>

           {/* Totals & Notes */}
           <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1 space-y-4">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Internal Notes</h4>
                 <textarea 
                   value={notes}
                   onChange={e => setNotes(e.target.value)}
                   placeholder="Any internal notes or references..."
                   className="w-full h-32 px-5 py-4 bg-amber-50/30 border border-amber-100 rounded-3xl focus:border-amber-300 outline-none text-xs font-bold italic text-amber-900/70"
                 />
              </div>
              <div className="w-full lg:w-80 space-y-4">
                 <div className="p-8 bg-primary rounded-[2.5rem] shadow-2xl shadow-primary/20 space-y-6">
                    <div className="space-y-2">
                       <div className="flex items-center justify-between text-white/60 text-[10px] font-black uppercase tracking-widest">
                          <span>Sub Total</span>
                          <span>{formatCurrency(subTotal)}</span>
                       </div>
                       {hasAdvance && (
                          <div className="flex items-center justify-between text-white/60 text-[10px] font-black uppercase tracking-widest">
                             <span>Advance Paid</span>
                             <span className="text-white">- {formatCurrency(advanceAmount)}</span>
                          </div>
                       )}
                    </div>
                    <div className="h-px bg-white/10" />
                    <div className="space-y-1">
                       <p className="text-[10px] font-black text-accent uppercase tracking-[0.25em]">Balance Due</p>
                       <p className="text-4xl font-black text-white tracking-tighter group-hover:scale-105 transition-transform">{formatCurrency(balanceDue)}</p>
                    </div>
                 </div>
                 <button 
                   type="submit"
                   disabled={loading || !selectedClient || lineItems.every(i => !i.description)}
                   className="w-full py-5 bg-accent text-white rounded-[2rem] font-black text-lg uppercase tracking-widest hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-accent/20 flex items-center justify-center gap-3"
                 >
                   {loading ? (
                     <div className="h-6 w-6 border-4 border-white border-r-transparent rounded-full animate-spin" />
                   ) : (
                     <Save className="h-6 w-6" />
                   )}
                   Generate Bill
                 </button>
              </div>
           </div>
        </form>
      </motion.div>
    </div>
  );
}

// Fixed import for CheckCircle which was duplicated
import { CheckCircle as CheckCircleIcon } from 'lucide-react';
// I'll use the already imported one
const CheckCircle = CheckCircleIcon;
