import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  doc, 
  onSnapshot,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Bill, Organization, BillStatus } from '../types';
import { 
  X, 
  FileText, 
  Download, 
  Share2, 
  CheckCircle, 
  Edit2, 
  History,
  User,
  Phone,
  MapPin,
  Calendar,
  AlertCircle,
  CreditCard,
  IndianRupee,
  Clock,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { generateBillPDF } from '../lib/bill-pdf';
import { logActivity } from '../lib/activity-logger';

interface BillDetailModalProps {
  billId: string;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_CONFIG: Record<BillStatus, { color: string, icon: any, label: string }> = {
  'DRAFT': { color: 'bg-gray-100 text-gray-700', icon: Clock, label: 'Draft' },
  'SENT': { color: 'bg-blue-100 text-blue-700', icon: Share2, label: 'Sent' },
  'UNPAID': { color: 'bg-amber-100 text-amber-700', icon: AlertCircle, label: 'Unpaid' },
  'PAID': { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Paid' },
};

export function BillDetailModal({ billId, isOpen, onClose }: BillDetailModalProps) {
  const { profile } = useAuth();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgDetails, setOrgDetails] = useState<Organization | null>(null);

  useEffect(() => {
    if (!isOpen || !billId) return;

    const unsub = onSnapshot(doc(db, 'bills', billId), (snap) => {
      if (snap.exists()) {
        setBill({ id: snap.id, ...snap.data() } as Bill);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, `bills/${billId}`));

    const unsubOrg = onSnapshot(doc(db, 'settings', 'organization'), (snap) => {
      if (snap.exists()) setOrgDetails(snap.data() as Organization);
    });

    return () => {
      unsub();
      unsubOrg();
    };
  }, [isOpen, billId]);

  const handleMarkAsDraft = async () => {
    if (!profile || !bill) return;

    try {
      await updateDoc(doc(db, 'bills', billId), {
        status: 'DRAFT',
        updatedAt: serverTimestamp()
      });
      logActivity(profile.full_name, profile.role, 'Edited', 'Bills', `Reverted Bill ${bill.billNumber} to Draft`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${billId}`);
    }
  };

  const handleMarkAsSent = async () => {
    if (!profile || !bill) return;

    try {
      await updateDoc(doc(db, 'bills', billId), {
        status: 'SENT',
        updatedAt: serverTimestamp()
      });
      logActivity(profile.full_name, profile.role, 'Edited', 'Bills', `Marked Bill ${bill.billNumber} as Sent`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${billId}`);
    }
  };

  const handleMarkAsUnpaid = async () => {
    if (!profile || !bill) return;

    try {
      await updateDoc(doc(db, 'bills', billId), {
        status: 'UNPAID',
        updatedAt: serverTimestamp()
      });
      logActivity(profile.full_name, profile.role, 'Edited', 'Bills', `Marked Bill ${bill.billNumber} as Unpaid`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${billId}`);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!profile || !bill) return;
    if (!window.confirm(`Are you sure you want to mark Bill ${bill.billNumber} as PAID? This will set Balance Due to 0.`)) return;

    try {
      await updateDoc(doc(db, 'bills', billId), {
        status: 'PAID',
        advancePaid: bill.totalAmount,
        balanceDue: 0,
        updatedAt: serverTimestamp()
      });
      logActivity(profile.full_name, profile.role, 'Edited', 'Bills', `Marked Bill ${bill.billNumber} as Paid`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bills/${billId}`);
    }
  };

  const handleDownload = (withLetterhead: boolean) => {
    if (bill && orgDetails) {
      generateBillPDF(bill, orgDetails, withLetterhead);
    }
  };

  const handleWhatsApp = () => {
    if (!bill) return;
    const message = `Dear ${bill.contactPerson}, Please find attached bill ${bill.billNumber} from Jagriti Tours & Travels.\nAmount: ${formatCurrency(bill.totalAmount)}\n${bill.advancePaid > 0 ? `Advance Received: ${formatCurrency(bill.advancePaid)}` : ''}\n${bill.balanceDue > 0 ? `Balance Due: ${formatCurrency(bill.balanceDue)}` : ''}\nThank you for your business.\n- Jagriti Tours & Travels\n9811387399`;
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/91${bill.contactPerson}?text=${encoded}`, '_blank');
  };

  if (!isOpen) return null;

  const status = bill?.status || 'DRAFT';
  const config = STATUS_CONFIG[status as BillStatus];
  const StatusIcon = config.icon;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm shadow-2xl overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-surface w-full max-w-5xl max-h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-border bg-background/50 flex flex-col md:flex-row md:items-center justify-between gap-6 shrink-0">
           <div className="flex items-center gap-5">
              <div className="h-12 w-12 md:h-16 md:w-16 rounded-3xl bg-accent/10 flex items-center justify-center text-accent shadow-inner">
                 <FileText className="h-6 w-6 md:h-8 md:w-8" />
              </div>
              <div>
                 <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl md:text-3xl font-black text-primary tracking-tighter leading-none">
                      {bill?.billNumber || 'Loading...'}
                    </h2>
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-wider",
                      config.color
                    )}>
                      <StatusIcon className="h-2.5 w-2.5 md:h-3 md:w-3" />
                      {config.label}
                    </span>
                 </div>
                 <p className="text-[10px] md:text-xs font-black text-secondary/60 uppercase tracking-widest leading-none italic">
                   Generated on {bill ? format(bill.billDate.toDate(), 'dd MMMM yyyy') : '...'}
                 </p>
              </div>
           </div>
           
           <div className="flex items-center gap-2 flex-wrap">
              <button 
                onClick={handleWhatsApp}
                className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-green-100 transition-all border border-green-200"
              >
                 <Share2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                 WA
              </button>
              <button 
                onClick={() => handleDownload(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-primary rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all border border-border"
              >
                 <Download className="h-3.5 w-3.5 md:h-4 md:w-4" />
                 Hdr
              </button>
              <button 
                onClick={() => handleDownload(false)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-primary rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all border border-border"
              >
                 <FileText className="h-3.5 w-3.5 md:h-4 md:w-4" />
                 Plain
              </button>
               {bill?.status === 'DRAFT' && (
                <button 
                  onClick={handleMarkAsSent}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all border border-blue-200"
                >
                   <Share2 className="h-4 w-4" />
                   Mark Sent
                </button>
              )}
              {(bill?.status === 'SENT' || bill?.status === 'UNPAID') && (
                <button 
                  onClick={handleMarkAsDraft}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-secondary rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all border border-border"
                >
                   <Clock className="h-4 w-4" />
                   To Draft
                </button>
              )}
              {bill?.status === 'SENT' && (
                <button 
                  onClick={handleMarkAsUnpaid}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-all border border-amber-200"
                >
                   <AlertCircle className="h-4 w-4" />
                   To Unpaid
                </button>
              )}
              {bill?.status !== 'PAID' && (
                <button 
                  onClick={handleMarkAsPaid}
                  className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-success/90 transition-all shadow-lg shadow-success/20"
                >
                   <CheckCircle className="h-3.5 w-3.5 md:h-4 md:w-4" />
                   Paid
                </button>
              )}
              <button onClick={onClose} className="h-10 w-10 flex items-center justify-center hover:bg-border rounded-xl transition-all ml-2 border border-border shadow-sm">
                 <X className="h-6 w-6 text-secondary" />
              </button>
           </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden">
           {/* Left Panel: Client Info */}
           <div className="w-full md:w-80 p-6 md:p-8 space-y-8 bg-background/30 overflow-y-auto custom-scrollbar shrink-0">
              <section className="space-y-4">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Client Details</h4>
                 <div className="space-y-6">
                    <div className="flex items-start gap-4">
                       <div className="mt-1 p-2 bg-accent/5 rounded-xl">
                          <User className="h-4 w-4 text-accent" />
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-secondary/40 uppercase">Client Name</p>
                          <p className="text-sm font-black text-primary tracking-tight">{bill?.clientName}</p>
                          <p className="text-xs font-bold text-secondary/60">{bill?.clientType}</p>
                       </div>
                    </div>
                    <div className="flex items-start gap-4">
                       <div className="mt-1 p-2 bg-accent/5 rounded-xl">
                          <Phone className="h-4 w-4 text-accent" />
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-secondary/40 uppercase">Contact Person</p>
                          <p className="text-sm font-black text-primary tracking-tight">{bill?.contactPerson}</p>
                          <p className="text-xs font-bold text-secondary/60">{bill?.contactNumber}</p>
                       </div>
                    </div>
                    <div className="flex items-start gap-4">
                       <div className="mt-1 p-2 bg-accent/5 rounded-xl">
                          <MapPin className="h-4 w-4 text-accent" />
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-secondary/40 uppercase">Address</p>
                          <p className="text-xs font-bold text-secondary italic leading-relaxed">{bill?.address}</p>
                       </div>
                    </div>
                 </div>
              </section>

              {bill?.notes && (
                <section className="space-y-4 pt-6 border-t border-border/50">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Internal Notes</h4>
                   <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl">
                      <p className="text-xs font-bold italic text-amber-900/60 leading-relaxed">
                         {bill.notes}
                      </p>
                   </div>
                </section>
              )}

              <section className="space-y-4 pt-6 border-t border-border/50">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Activity Timeline</h4>
                 <div className="space-y-4">
                    <div className="flex items-start gap-3">
                       <div className="h-2 w-2 rounded-full bg-accent mt-1.5" />
                       <div>
                          <p className="text-[10px] font-black text-primary">Bill Generated</p>
                          <p className="text-[9px] text-secondary/60">by {bill?.createdBy} on {bill ? format(bill.createdAt.toDate(), 'dd MMM, HH:mm') : ''}</p>
                       </div>
                    </div>
                    {bill?.updatedAt && bill?.updatedAt.seconds !== bill?.createdAt.seconds && (
                       <div className="flex items-start gap-3">
                          <div className="h-2 w-2 rounded-full bg-slate-300 mt-1.5" />
                          <div>
                             <p className="text-[10px] font-black text-primary">Last Modified</p>
                             <p className="text-[9px] text-secondary/60">{format(bill.updatedAt.toDate(), 'dd MMM, HH:mm')}</p>
                          </div>
                       </div>
                    )}
                 </div>
              </section>
           </div>

           {/* Right Panel: Content */}
           <div className="flex-1 p-8 bg-slate-50/50 overflow-y-auto custom-scrollbar">
              <div className="space-y-8">
                 {/* Particulars */}
                 <section className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Particulars / Line Items</h4>
                    <div className="bg-surface rounded-3xl border border-border shadow-sm overflow-hidden">
                       <table className="w-full text-left">
                          <thead>
                             <tr className="bg-background/50 border-b border-border">
                                <th className="px-6 py-4 text-[10px] font-black text-secondary uppercase tracking-widest w-16">#</th>
                                <th className="px-6 py-4 text-[10px] font-black text-secondary uppercase tracking-widest">Description</th>
                                <th className="px-6 py-4 text-[10px] font-black text-secondary uppercase tracking-widest text-right w-40">Amount</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                             {bill?.lineItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                   <td className="px-6 py-4 text-xs font-black text-secondary/40">{idx + 1}</td>
                                   <td className="px-6 py-4 text-sm font-bold text-primary leading-relaxed whitespace-pre-line">{item.description}</td>
                                   <td className="px-6 py-4 text-right text-sm font-black text-primary">{formatCurrency(item.amount)}</td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </section>

                 {/* Summary */}
                 <div className="flex justify-end pt-4">
                    <div className="w-full max-w-sm space-y-4">
                       <div className="p-8 bg-primary rounded-[2.5rem] shadow-2xl shadow-primary/20 space-y-6">
                          <div className="space-y-2">
                             <div className="flex items-center justify-between text-white/50 text-[10px] font-black uppercase tracking-widest">
                                <span>Sub Total</span>
                                <span className="text-white">{formatCurrency(bill?.subTotal || 0)}</span>
                             </div>
                             {bill && bill.advancePaid > 0 && (
                                <div className="flex items-center justify-between text-white/50 text-[10px] font-black uppercase tracking-widest">
                                   <span>Advance Received</span>
                                   <span className="text-success-light">- {formatCurrency(bill.advancePaid)}</span>
                                </div>
                             )}
                          </div>
                          <div className="h-px bg-white/10" />
                          <div className="space-y-1">
                             <p className="text-[10px] font-black text-accent uppercase tracking-[0.25em]">
                                {bill && bill.balanceDue > 0 ? 'Balance Due' : 'Total Amount'}
                             </p>
                             <p className="text-5xl font-black text-white tracking-tighter">
                                {formatCurrency(bill && bill.balanceDue > 0 ? bill.balanceDue : bill?.totalAmount || 0)}
                             </p>
                             {bill && bill.advancePaid > 0 && bill.advanceDate && (
                                <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mt-2 bg-white/5 px-2 py-1 rounded inline-block">
                                   Pd via {bill.advanceMode} on {format(bill.advanceDate.toDate(), 'dd MMM yyyy')}
                                </p>
                             )}
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
