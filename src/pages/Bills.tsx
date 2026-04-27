import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  limit,
  Timestamp,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  increment
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Bill, B2BClient, BillStatus, Organization } from '../types';
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  ArrowUpRight, 
  ArrowDownRight, 
  Users, 
  MoreVertical,
  Download,
  Share2,
  CheckCircle,
  Eye,
  Edit2,
  Calendar,
  IndianRupee,
  Clock,
  AlertCircle
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { NewBillModal } from '../components/NewBillModal';
import { BillDetailModal } from '../components/BillDetailModal';
import { B2BClientDirectory } from '../components/B2BClientDirectory';
import { generateBillPDF } from '../lib/bill-pdf';
import { logActivity } from '../lib/activity-logger';

const STATUS_CONFIG: Record<BillStatus, { color: string, icon: any }> = {
  'DRAFT': { color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400', icon: Clock },
  'SENT': { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Share2 },
  'UNPAID': { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
  'PAID': { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
};

export default function Bills() {
  const { profile } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [clients, setClients] = useState<B2BClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  
  const [isNewBillModalOpen, setIsNewBillModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isClientDirectoryOpen, setIsClientDirectoryOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  
  const [orgDetails, setOrgDetails] = useState<Organization | null>(null);

  useEffect(() => {
    const unsubBills = onSnapshot(query(collection(db, 'bills'), orderBy('billDate', 'desc')), (snap) => {
      setBills(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bills'));

    const unsubClients = onSnapshot(collection(db, 'b2bClients'), (snap) => {
      setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as B2BClient)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'b2bClients'));

    const unsubOrg = onSnapshot(doc(db, 'settings', 'organization'), (snap) => {
      if (snap.exists()) setOrgDetails(snap.data() as Organization);
    });

    return () => {
      unsubBills();
      unsubClients();
      unsubOrg();
    };
  }, []);

  const filteredBills = useMemo(() => {
    return bills.filter(bill => {
      const matchesSearch = 
        bill.billNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.clientName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || bill.status === statusFilter;
      const matchesType = typeFilter === 'all' || bill.clientType === typeFilter;
      
      const billDate = bill.billDate.toDate();
      const matchesMonth = monthFilter === 'all' || format(billDate, 'yyyy-MM') === monthFilter;

      return matchesSearch && matchesStatus && matchesType && matchesMonth;
    });
  }, [bills, searchTerm, statusFilter, typeFilter, monthFilter]);

  const stats = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);

    const thisMonthBills = bills.filter(b => isWithinInterval(b.billDate.toDate(), { start, end }));
    
    return {
      totalThisMonth: thisMonthBills.length,
      revenueThisMonth: thisMonthBills.reduce((acc, curr) => acc + curr.totalAmount, 0),
      totalOutstanding: bills.reduce((acc, curr) => acc + (curr.status !== 'PAID' ? curr.balanceDue : 0), 0),
      totalClients: clients.length
    };
  }, [bills, clients]);

  const handleMarkAsDraft = async (bill: Bill) => {
    if (!profile) return;
    
    try {
      const billRef = doc(db, 'bills', bill.id);
      await updateDoc(billRef, {
        status: 'DRAFT',
        updatedAt: serverTimestamp()
      });
      
      logActivity(profile.full_name, profile.role, 'Edited', 'Bills', `Reverted Bill ${bill.billNumber} to Draft`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${bill.id}`);
    }
  };

  const handleMarkAsSent = async (bill: Bill) => {
    if (!profile) return;
    
    try {
      const billRef = doc(db, 'bills', bill.id);
      await updateDoc(billRef, {
        status: 'SENT',
        updatedAt: serverTimestamp()
      });
      
      logActivity(profile.full_name, profile.role, 'Edited', 'Bills', `Marked Bill ${bill.billNumber} as Sent`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${bill.id}`);
    }
  };

  const handleMarkAsUnpaid = async (bill: Bill) => {
    if (!profile) return;
    
    try {
      const billRef = doc(db, 'bills', bill.id);
      await updateDoc(billRef, {
        status: 'UNPAID',
        updatedAt: serverTimestamp()
      });
      
      logActivity(profile.full_name, profile.role, 'Edited', 'Bills', `Marked Bill ${bill.billNumber} as Unpaid`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${bill.id}`);
    }
  };

  const handleMarkAsPaid = async (bill: Bill) => {
    if (!profile) return;
    if (!window.confirm(`Are you sure you want to mark Bill ${bill.billNumber} as PAID? This will set Balance Due to 0.`)) return;
    
    try {
      const billRef = doc(db, 'bills', bill.id);
      await updateDoc(billRef, {
        status: 'PAID',
        advancePaid: bill.totalAmount,
        balanceDue: 0,
        updatedAt: serverTimestamp()
      });
      
      logActivity(profile.full_name, profile.role, 'Edited', 'Bills', `Marked Bill ${bill.billNumber} as Paid`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${bill.id}`);
    }
  };

  const handleDownload = (bill: Bill, withLetterhead: boolean) => {
    if (orgDetails) {
      generateBillPDF(bill, orgDetails, withLetterhead);
    }
  };

  const handleWhatsApp = (bill: Bill) => {
    const message = `Dear ${bill.contactPerson}, Please find attached bill ${bill.billNumber} from Jagriti Tours & Travels.\nAmount: ${formatCurrency(bill.totalAmount)}\n${bill.advancePaid > 0 ? `Advance Received: ${formatCurrency(bill.advancePaid)}` : ''}\n${bill.balanceDue > 0 ? `Balance Due: ${formatCurrency(bill.balanceDue)}` : ''}\nThank you for your business.\n- Jagriti Tours & Travels\n9811387399`;
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/91${bill.contactPerson}?text=${encoded}`, '_blank');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-primary tracking-tighter sm:text-5xl">
            B2B <span className="text-accent italic">Bills</span>
          </h1>
          <p className="text-secondary font-medium mt-1">Manage corporate and school travel billing.</p>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={() => setIsClientDirectoryOpen(true)}
             className="flex items-center gap-2 px-5 py-3 bg-surface border border-border rounded-2xl text-primary font-bold hover:bg-slate-50 transition-all shadow-sm"
           >
             <Users className="h-5 w-5 text-accent" />
             B2B Clients
           </button>
           {(profile?.role === 'admin' || profile?.role === 'developer') && (
             <button 
               onClick={() => setIsNewBillModalOpen(true)}
               className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-2xl font-bold hover:bg-accent/90 transition-all shadow-lg shadow-accent/20"
             >
               <Plus className="h-5 w-5" />
               New Bill
             </button>
           )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Bills This Month', value: stats.totalThisMonth, icon: FileText, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Revenue This Month', value: formatCurrency(stats.revenueThisMonth), icon: IndianRupee, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Total Outstanding', value: formatCurrency(stats.totalOutstanding), icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          { label: 'Total B2B Clients', value: stats.totalClients, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
        ].map((stat, i) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={stat.label}
            className="p-6 bg-surface border border-border rounded-3xl shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-2xl transition-transform group-hover:scale-110", stat.bg)}>
                <stat.icon className={cn("h-6 w-6", stat.color)} />
              </div>
            </div>
            <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">{stat.label}</p>
            <p className="text-2xl font-black text-primary mt-1 tracking-tighter">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-surface p-6 rounded-3xl border border-border shadow-sm">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-secondary group-focus-within:text-accent transition-colors" />
          <input
            type="text"
            placeholder="Search bills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-background border border-border rounded-2xl focus:outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent transition-all font-medium"
          />
        </div>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full px-4 py-3 bg-background border border-border rounded-2xl focus:outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent font-medium text-secondary"
        >
          <option value="all">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full px-4 py-3 bg-background border border-border rounded-2xl focus:outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent font-medium text-secondary"
        >
          <option value="all">All Client Types</option>
          <option value="School">School</option>
          <option value="Corporate">Corporate</option>
          <option value="Event">Event</option>
          <option value="Other">Other</option>
        </select>

        <input
          type="month"
          value={monthFilter === 'all' ? '' : monthFilter}
          onChange={(e) => setMonthFilter(e.target.value || 'all')}
          className="w-full px-4 py-3 bg-background border border-border rounded-2xl focus:outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent font-medium text-secondary"
        />
      </div>

      {/* Table */}
      <div className="bg-surface rounded-3xl border border-border shadow-sm overflow-hidden overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50/50 border-b border-border">
              <th className="px-6 py-5 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Bill No.</th>
              <th className="px-6 py-5 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Client</th>
              <th className="px-6 py-5 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Type</th>
              <th className="px-6 py-5 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Date</th>
              <th className="px-6 py-5 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Amount</th>
              <th className="px-6 py-5 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Advance</th>
              <th className="px-6 py-5 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Balance</th>
              <th className="px-6 py-5 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Status</th>
              <th className="px-6 py-5 text-[10px] font-black text-secondary uppercase tracking-[0.2em] text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredBills.map((bill) => (
              <tr 
                key={bill.id} 
                className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedBill(bill);
                  setIsDetailModalOpen(true);
                }}
              >
                <td className="px-6 py-5">
                  <span className="text-sm font-black text-primary tracking-tighter bg-accent/5 px-2 py-1 rounded-lg border border-accent/10">
                    {bill.billNumber}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-primary">{bill.clientName}</span>
                    <span className="text-[10px] text-secondary/60 uppercase font-black tracking-widest leading-none mt-1">{bill.contactPerson}</span>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-background border border-border rounded-lg text-secondary">
                    {bill.clientType}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <span className="text-xs font-bold text-secondary">
                    {format(bill.billDate.toDate(), 'dd MMM yyyy')}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <span className="text-sm font-black text-primary italic">
                    {formatCurrency(bill.totalAmount)}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <span className="text-xs font-bold text-secondary">
                    {bill.advancePaid > 0 ? formatCurrency(bill.advancePaid) : '-'}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <span className={cn(
                    "text-sm font-black italic",
                    bill.balanceDue > 0 ? "text-error" : "text-success"
                  )}>
                    {bill.balanceDue > 0 ? formatCurrency(bill.balanceDue) : 'Settled'}
                  </span>
                </td>
                <td className="px-6 py-5">
                   <StatusBadge status={bill.status} />
                </td>
                <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end">
                    <BillActions 
                      bill={bill} 
                      onDownload={handleDownload} 
                      onMarkAsSent={handleMarkAsSent}
                      onMarkAsPaid={handleMarkAsPaid}
                      onMarkAsDraft={handleMarkAsDraft}
                      onMarkAsUnpaid={handleMarkAsUnpaid}
                      onWhatsApp={handleWhatsApp}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan={9} className="px-6 py-20 text-center">
                   <div className="flex flex-col items-center gap-3">
                      <div className="h-10 w-10 border-4 border-accent border-r-transparent rounded-full animate-spin" />
                      <p className="text-sm font-bold text-secondary">Loading bills...</p>
                   </div>
                </td>
              </tr>
            )}
            {!loading && filteredBills.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-20 text-center">
                   <div className="flex flex-col items-center gap-4">
                      <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center">
                         <FileText className="h-8 w-8 text-secondary/30" />
                      </div>
                      <p className="text-secondary italic">No bills found matching your criteria.</p>
                   </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {isNewBillModalOpen && (
          <NewBillModal 
            isOpen={isNewBillModalOpen} 
            onClose={() => setIsNewBillModalOpen(false)} 
          />
        )}
        
        {isDetailModalOpen && selectedBill && (
          <BillDetailModal
            isOpen={isDetailModalOpen}
            onClose={() => {
              setIsDetailModalOpen(false);
              setSelectedBill(null);
            }}
            billId={selectedBill.id}
          />
        )}

        {isClientDirectoryOpen && (
          <B2BClientDirectory
            isOpen={isClientDirectoryOpen}
            onClose={() => setIsClientDirectoryOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status }: { status: BillStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
      config.color
    )}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

interface BillActionsProps {
  bill: Bill;
  onDownload: (bill: Bill, withLetterhead: boolean) => void;
  onMarkAsSent: (bill: Bill) => void;
  onMarkAsPaid: (bill: Bill) => void;
  onMarkAsDraft: (bill: Bill) => void;
  onMarkAsUnpaid: (bill: Bill) => void;
  onWhatsApp: (bill: Bill) => void;
}

function BillActions({ bill, onDownload, onMarkAsSent, onMarkAsPaid, onMarkAsDraft, onMarkAsUnpaid, onWhatsApp }: BillActionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClose = () => setIsOpen(false);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [isOpen]);

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    setIsOpen(false);
    action(); 
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "p-2 rounded-xl transition-all border",
          isOpen ? "bg-slate-100 border-border" : "hover:bg-slate-100 border-transparent"
        )}
      >
        <MoreVertical className="h-4 w-4 text-secondary" />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-2xl shadow-xl z-50 py-2 overflow-hidden"
          >
            <div className="px-4 py-2 border-b border-border mb-1">
              <p className="text-[10px] font-black text-secondary uppercase tracking-widest">Document Actions</p>
            </div>
            
            <button 
              onClick={(e) => handleAction(e, () => onWhatsApp(bill))}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-green-600 hover:bg-green-50 transition-colors text-left"
            >
              <Share2 className="h-4 w-4" />
              Share via WhatsApp
            </button>

            <button 
              onClick={(e) => handleAction(e, () => onDownload(bill, true))}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-primary hover:bg-slate-50 transition-colors text-left"
            >
              <Download className="h-4 w-4 text-accent" />
              Download (Hdr)
            </button>
            <button 
              onClick={(e) => handleAction(e, () => onDownload(bill, false))}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-primary hover:bg-slate-50 transition-colors text-left"
            >
              <FileText className="h-4 w-4 text-secondary" />
              Download (Plain)
            </button>

            <div className="px-4 py-2 border-y border-border my-1 bg-slate-50/50">
              <p className="text-[10px] font-black text-secondary uppercase tracking-widest">Status Transition</p>
            </div>

            {bill.status === 'DRAFT' && (
              <button 
                onClick={(e) => handleAction(e, () => onMarkAsSent(bill))}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-black text-blue-600 hover:bg-blue-50 transition-colors text-left"
              >
                <Share2 className="h-4 w-4" />
                Mark as Sent
              </button>
            )}

            {(bill.status === 'SENT' || bill.status === 'UNPAID') && (
              <button 
                onClick={(e) => handleAction(e, () => onMarkAsDraft(bill))}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-black text-secondary hover:bg-slate-50 transition-colors text-left"
              >
                <Clock className="h-4 w-4" />
                Revert to Draft
              </button>
            )}

            {bill.status === 'SENT' && (
              <button 
                onClick={(e) => handleAction(e, () => onMarkAsUnpaid(bill))}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-black text-amber-600 hover:bg-amber-50 transition-colors text-left"
              >
                <AlertCircle className="h-4 w-4" />
                Mark as Unpaid
              </button>
            )}

            {bill.status !== 'PAID' && (
              <button 
                onClick={(e) => handleAction(e, () => onMarkAsPaid(bill))}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-black text-success hover:bg-success/5 transition-colors text-left"
              >
                <CheckCircle className="h-4 w-4" />
                Mark as Fully Paid
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
