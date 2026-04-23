import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  Timestamp,
  where,
  writeBatch,
  getDocs,
  getDoc,
  increment,
  limit
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Invoice, Receipt, Student, Organization, InvoiceStatus } from '../types';
import { 
  Search, 
  Plus, 
  Filter, 
  X, 
  Save, 
  FileText, 
  Edit2,
  CheckCircle2, 
  SkipForward,
  Download,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MoreVertical,
  AlertCircle,
  Clock,
  ArrowRight,
  Eye,
  CreditCard,
  Trash2,
  Users,
  School as SchoolIcon,
  Route as RouteIcon
} from 'lucide-react';
import { RaiseSingleInvoiceModal } from '../components/RaiseSingleInvoiceModal';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { InvoiceViewModal } from '../components/InvoiceViewModal';
import { ReceiptDetailModal } from '../components/ReceiptDetailModal';
import { EditInvoiceModal } from '../components/EditInvoiceModal';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfMonth, endOfMonth, isAfter, isBefore, addDays, parse, isValid } from 'date-fns';
import { generateInvoicePDF, generateReceiptPDF } from '../lib/pdf-service';
import { amountToWordsIndian } from '../lib/number-utils';

export function InvoiceReceipt() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'invoices' | 'receipts'>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [startMonth, setStartMonth] = useState(format(new Date(), 'MMMM yyyy'));
  const [endMonth, setEndMonth] = useState(format(new Date(), 'MMMM yyyy'));
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSchool, setFilterSchool] = useState('all');
  const [filterStand, setFilterStand] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Selection
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  
  // Modals
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isReceiptDetailModalOpen, setIsReceiptDetailModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [selectedInvoiceForEdit, setSelectedInvoiceForEdit] = useState<Invoice | null>(null);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<Invoice | null>(null);
  const [selectedReceiptForView, setSelectedReceiptForView] = useState<Receipt | null>(null);

  useEffect(() => {
    if (!profile || (profile.role !== 'admin' && profile.role !== 'accountant' && profile.role !== 'developer')) return;

    const unsubInvoices = onSnapshot(
      query(collection(db, 'invoices'), orderBy('createdAt', 'desc')), 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        setInvoices(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'invoices');
      }
    );

    const unsubReceipts = onSnapshot(
      query(collection(db, 'receipts'), orderBy('createdAt', 'desc')), 
      (snapshot) => {
        setReceipts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt)));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'receipts');
      }
    );

    const unsubStudents = onSnapshot(
      collection(db, 'students'), 
      (snapshot) => {
        setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'students');
      }
    );

    const unsubOrg = onSnapshot(
      doc(db, 'settings', 'organization'), 
      (snapshot) => {
        if (snapshot.exists()) setOrg(snapshot.data() as Organization);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/organization');
      }
    );

    setLoading(false);
    return () => {
      unsubInvoices();
      unsubReceipts();
      unsubStudents();
      unsubOrg();
    };
  }, [profile]);

  // Handle Overdue Status Updates
  useEffect(() => {
    if (!invoices.length || !profile || (profile.role !== 'admin' && profile.role !== 'developer')) return;

    const updateOverdue = async () => {
      const today = new Date();
      const overdueInvoices = invoices.filter(inv => 
        (inv.status === 'UNPAID' || inv.status === 'SENT') && 
        isBefore(inv.dueDate.toDate(), today)
      );

      if (overdueInvoices.length === 0) return;

      // Use a batch for efficiency
      const batch = writeBatch(db);
      overdueInvoices.forEach(inv => {
        batch.update(doc(db, 'invoices', inv.id), { 
          status: 'OVERDUE',
          updatedAt: serverTimestamp()
        });
        
        const timelineRef = doc(collection(db, 'students', inv.studentId, 'timeline'));
        batch.set(timelineRef, {
          event: 'Invoice Overdue',
          description: `Invoice ${inv.invoiceNumber} became overdue`,
          createdBy: 'System',
          createdAt: serverTimestamp()
        });
      });

      try {
        await batch.commit();
      } catch (error) {
        console.error('Error updating overdue invoices:', error);
      }
    };

    updateOverdue();
  }, [invoices, profile]);

  const stats = useMemo(() => {
    const outstanding = invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);
    const today = new Date();
    const next30Days = addDays(today, 30);
    
    const dueToday = invoices.filter(inv => 
      inv.status !== 'PAID' && 
      format(inv.dueDate.toDate(), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
    ).reduce((sum, inv) => sum + inv.balanceDue, 0);

    const due30Days = invoices.filter(inv => 
      inv.status !== 'PAID' && 
      isBefore(inv.dueDate.toDate(), next30Days) && 
      isAfter(inv.dueDate.toDate(), today)
    ).reduce((sum, inv) => sum + inv.balanceDue, 0);

    const overdue = invoices.filter(inv => inv.status === 'OVERDUE').reduce((sum, inv) => sum + inv.balanceDue, 0);

    return { outstanding, dueToday, due30Days, overdue };
  }, [invoices]);

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    // 2 years back to 1 year forward
    for (let i = -24; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      options.push(format(d, 'MMMM yyyy'));
    }
    return options;
  }, []);

  const filteredInvoices = invoices.filter(inv => {
    const name = inv.studentName || '';
    const invNum = inv.invoiceNumber || '';
    const search = searchTerm.toLowerCase();
    const matchesSearch = name.toLowerCase().includes(search) || 
                         invNum.toLowerCase().includes(search);
    
    // Range Filter
    const invDate = parse(inv.month, 'MMMM yyyy', new Date());
    const startDate = parse(startMonth, 'MMMM yyyy', new Date());
    const endDate = parse(endMonth, 'MMMM yyyy', new Date());
    
    const matchesMonth = isValid(invDate) && isValid(startDate) && isValid(endDate) &&
                        invDate >= startOfMonth(startDate) && invDate <= endOfMonth(endDate);

    const matchesSchool = filterSchool === 'all' || inv.schoolName === filterSchool;
    const matchesStand = filterStand === 'all' || inv.standName === filterStand;
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    return matchesSearch && matchesMonth && matchesSchool && matchesStand && matchesStatus;
  });

  const filteredReceipts = receipts.filter(rcp => {
    const name = rcp.studentName || '';
    const rcpNum = rcp.receiptNumber || '';
    const search = searchTerm.toLowerCase();
    const matchesSearch = name.toLowerCase().includes(search) || 
                         rcpNum.toLowerCase().includes(search);
    return matchesSearch;
  });

  const handleDownloadPDF = (type: 'invoice' | 'receipt', item: any) => {
    const defaultOrg: Organization = {
      name: 'Jagriti Tours & Travels',
      address_line1: 'E-10, Gali No-6, Tomar Colony, Burari',
      address_line2: 'Delhi',
      zip_code: '110084',
      phone: '9811387399',
      website: 'www.jagrititoursandtravels.com',
      email: 'jagrititours@gmail.com'
    };

    const organization = org || defaultOrg;
    
    try {
      let doc;
      if (type === 'invoice') {
        doc = generateInvoicePDF(item, organization);
      } else {
        let inv = invoices.find(i => i.id === item.invoiceId);
        if (!inv) {
          // Fallback if invoice is missing from the list
          inv = {
            invoiceNumber: item.invoiceNumber || 'N/A',
            invoiceDate: item.paymentDate, // Use payment date as fallback
            totalAmount: item.amountReceived || 0,
            paidAmount: item.amountReceived || 0,
            balanceDue: 0,
          } as any;
        }
        doc = generateReceiptPDF(item, inv, organization);
      }
      doc.save(`${type === 'invoice' ? item.invoiceNumber : item.receiptNumber}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const handleWhatsApp = (type: 'invoice' | 'receipt', item: any) => {
    let message = '';
    if (type === 'invoice') {
      message = `Dear ${item.fatherName}, Please find attached invoice [${item.invoiceNumber}] for [${item.month}] transport fees of ₹${item.totalAmount} for ${item.studentName}. Due Date: ${format(item.dueDate.toDate(), 'dd MMM yyyy')}. Thank you. - Jagriti Tours & Travels`;
    } else {
      const desc = item.description || `invoice [${item.invoiceNumber}]`;
      message = `Dear ${item.fatherName}, Payment of ₹${item.amountReceived} received for ${item.studentName} against ${desc}. Receipt No: [${item.receiptNumber}]. Thank you. - Jagriti Tours & Travels`;
    }
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://web.whatsapp.com/send?phone=91${item.phoneNumber}&text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    alert('PDF generated. Please download it and attach it to the WhatsApp message.');
    handleDownloadPDF(type, item);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-primary tracking-tight">Invoice & Receipt</h2>
          <p className="text-secondary font-medium">Manage billing and collections</p>
        </div>
        {activeTab === 'invoices' && (profile?.role === 'admin' || profile?.role === 'developer') && (
          <button
            onClick={() => setIsRaiseModalOpen(true)}
            className="btn-primary flex items-center justify-center space-x-2 shadow-lg shadow-accent/20"
          >
            <Plus className="h-5 w-5" />
            <span>Raise Invoices</span>
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Outstanding Receivables', value: stats.outstanding, icon: CreditCard, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Due Today', value: stats.dueToday, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'Due Within 30 Days', value: stats.due30Days, icon: Calendar, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Overdue', value: stats.overdue, icon: AlertCircle, color: 'text-danger', bg: 'bg-danger/10' },
        ].map((card, i) => (
          <div key={i} className="card bg-surface flex items-center space-x-4">
            <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", card.bg, card.color)}>
              <card.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">{card.label}</p>
              <p className="text-2xl font-black text-primary font-mono">{formatCurrency(card.value)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="card bg-surface p-0 overflow-hidden">
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('invoices')}
            className={cn(
              "flex-1 py-4 text-sm font-black transition-all",
              activeTab === 'invoices' ? "text-accent border-b-2 border-accent bg-accent/5" : "text-secondary hover:text-primary"
            )}
          >
            INVOICES
          </button>
          <button
            onClick={() => setActiveTab('receipts')}
            className={cn(
              "flex-1 py-4 text-sm font-black transition-all",
              activeTab === 'receipts' ? "text-accent border-b-2 border-accent bg-accent/5" : "text-secondary hover:text-primary"
            )}
          >
            RECEIPTS
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                <input
                  type="text"
                  placeholder={`Search student name or ${activeTab === 'invoices' ? 'invoice' : 'receipt'} number...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10 w-full bg-background border-border/50 focus:border-accent/50 transition-all"
                />
              </div>
              <button 
                className="btn-secondary px-4 flex items-center space-x-2"
                onClick={() => {/* Search is already handled by state update, but button provides visual feedback */}}
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {activeTab === 'invoices' && (
                <div className="flex items-center space-x-2 bg-background rounded-lg px-3 py-1 border border-border/50">
                  <Calendar className="h-3.5 w-3.5 text-secondary" />
                  <div className="flex items-center space-x-1">
                    <select
                      value={startMonth}
                      onChange={(e) => setStartMonth(e.target.value)}
                      className="bg-transparent text-[10px] font-bold text-primary focus:outline-none py-1"
                    >
                      {monthOptions.map(m => <option key={`start-${m}`} value={m}>{m}</option>)}
                    </select>
                    <span className="text-[10px] text-secondary font-bold">to</span>
                    <select
                      value={endMonth}
                      onChange={(e) => setEndMonth(e.target.value)}
                      className="bg-transparent text-[10px] font-bold text-primary focus:outline-none py-1"
                    >
                      {monthOptions.map(m => <option key={`end-${m}`} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex items-center space-x-2 bg-background rounded-lg px-3 py-1 border border-border/50">
                <Filter className="h-3.5 w-3.5 text-secondary" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-transparent text-xs font-bold text-primary focus:outline-none py-1"
                >
                  <option value="all">All Status</option>
                  <option value="UNPAID">Unpaid</option>
                  <option value="PAID">Paid</option>
                  <option value="PARTIAL">Partial</option>
                  <option value="OVERDUE">Overdue</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                {activeTab === 'invoices' ? (
                  <tr>
                    <th className="w-10">
                      <input 
                        type="checkbox" 
                        checked={selectedInvoices.length === filteredInvoices.length && filteredInvoices.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedInvoices(filteredInvoices.map(i => i.id));
                          else setSelectedInvoices([]);
                        }}
                      />
                    </th>
                    <th>Invoice No</th>
                    <th>Student</th>
                    <th>School & Stand</th>
                    <th>Month</th>
                    <th>Amount</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Receipt No</th>
                    <th>Student</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th>Fee Type</th>
                    <th>Received By</th>
                    <th>Notes</th>
                    <th className="text-right">Actions</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-border/30">
                {activeTab === 'invoices' ? (
                  filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-accent/5 transition-colors">
                      <td>
                        <input 
                          type="checkbox" 
                          checked={selectedInvoices.includes(inv.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedInvoices([...selectedInvoices, inv.id]);
                            else setSelectedInvoices(selectedInvoices.filter(id => id !== inv.id));
                          }}
                        />
                      </td>
                      <td className="font-bold text-primary">{inv.invoiceNumber}</td>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-bold text-primary">{inv.studentName}</span>
                          <span className="text-[10px] text-secondary uppercase tracking-wider">{inv.fatherName}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col text-xs text-secondary">
                          <span>{inv.schoolName}</span>
                          <span>{inv.standName}</span>
                        </div>
                      </td>
                      <td className="text-xs font-bold text-primary">{inv.month}</td>
                      <td className="font-bold text-primary">{formatCurrency(inv.totalAmount)}</td>
                      <td className={cn("font-black", inv.balanceDue > 0 ? "text-danger" : "text-success")}>
                        {formatCurrency(inv.balanceDue)}
                      </td>
                      <td>
                        <span className={cn(
                          "badge text-[10px]",
                          inv.status === 'PAID' ? "bg-success/10 text-success" :
                          inv.status === 'OVERDUE' ? "bg-danger/10 text-danger" :
                          inv.status === 'PARTIAL' ? "bg-warning/10 text-warning" : "bg-accent/10 text-accent"
                        )}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => {
                              setSelectedInvoiceForView(inv);
                              setIsViewModalOpen(true);
                            }}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-all"
                            title="View Invoice"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => {
                              if (inv.status === 'PAID') {
                                if (confirm('⚠️ This invoice is already marked as PAID. Editing it may affect the balance calculations. Are you sure you want to edit?')) {
                                  setSelectedInvoiceForEdit(inv);
                                  setIsEditModalOpen(true);
                                }
                              } else {
                                setSelectedInvoiceForEdit(inv);
                                setIsEditModalOpen(true);
                              }
                            }}
                            className="p-2 text-warning hover:bg-warning/10 rounded-lg transition-all"
                            title="Edit Invoice"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => {
                              setSelectedInvoiceForPayment(inv);
                              setIsPaymentModalOpen(true);
                            }}
                            className="p-2 text-success hover:bg-success/10 rounded-lg transition-all"
                            title="Record Payment"
                            disabled={inv.status === 'PAID'}
                          >
                            <CreditCard className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleWhatsApp('invoice', inv)}
                            className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-all"
                            title="Send WhatsApp"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDownloadPDF('invoice', inv)}
                            className="p-2 text-secondary hover:bg-border/50 rounded-lg transition-all"
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  filteredReceipts.map((rcp) => (
                    <tr key={rcp.id} className="hover:bg-accent/5 transition-colors">
                      <td className="font-bold text-primary">{rcp.receiptNumber}</td>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-bold text-primary">{rcp.studentName}</span>
                          <span className="text-[10px] text-secondary uppercase tracking-wider">{rcp.fatherName}</span>
                        </div>
                      </td>
                      <td className="text-xs text-secondary">{format(rcp.paymentDate.toDate(), 'dd MMM yyyy')}</td>
                      <td className="font-bold text-success">{formatCurrency(rcp.amountReceived)}</td>
                      <td className="text-xs font-bold text-primary">{rcp.paymentMode}</td>
                      <td className="text-xs text-secondary">{rcp.feeType}</td>
                      <td className="text-xs font-bold text-accent">{rcp.receivedBy}</td>
                      <td>
                        {rcp.notes ? (
                          <div className="group relative">
                            <MessageSquare className="h-4 w-4 text-accent cursor-help" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-surface border border-border rounded-lg shadow-xl text-[10px] text-primary z-50">
                              {rcp.notes}
                            </div>
                          </div>
                        ) : (
                          <span className="text-secondary">-</span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => {
                              setSelectedReceiptForView(rcp);
                              setIsReceiptDetailModalOpen(true);
                            }}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-all"
                            title="View Receipt"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleWhatsApp('receipt', rcp)}
                            className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-all"
                            title="Send WhatsApp"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDownloadPDF('receipt', rcp)}
                            className="p-2 text-secondary hover:bg-border/50 rounded-lg transition-all"
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
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
      </div>

      {/* Raise Invoices Modal */}
      <RaiseInvoicesModal 
        isOpen={isRaiseModalOpen} 
        onClose={() => setIsRaiseModalOpen(false)} 
        students={students}
        profile={profile}
      />

      {/* Record Payment Modal */}
      {selectedInvoiceForPayment && (
        <RecordPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
          }}
          invoice={selectedInvoiceForPayment}
          profile={profile}
        />
      )}

      {/* Edit Invoice Modal */}
      {selectedInvoiceForEdit && (
        <EditInvoiceModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedInvoiceForEdit(null);
          }}
          invoice={selectedInvoiceForEdit}
          profile={profile}
        />
      )}

      {/* Invoice View Modal */}
      {selectedInvoiceForView && (
        <InvoiceViewModal
          isOpen={isViewModalOpen}
          onClose={() => {
            setIsViewModalOpen(false);
            setSelectedInvoiceForView(null);
          }}
          invoice={selectedInvoiceForView}
          org={org}
          onEdit={() => {
            setIsViewModalOpen(false);
            if (selectedInvoiceForView.status === 'PAID') {
              if (confirm('⚠️ This invoice is already marked as PAID. Editing it may affect the balance calculations. Are you sure you want to edit?')) {
                setSelectedInvoiceForEdit(selectedInvoiceForView);
                setIsEditModalOpen(true);
              }
            } else {
              setSelectedInvoiceForEdit(selectedInvoiceForView);
              setIsEditModalOpen(true);
            }
          }}
          onRecordPayment={() => {
            setIsViewModalOpen(false);
            setSelectedInvoiceForPayment(selectedInvoiceForView);
            setIsPaymentModalOpen(true);
          }}
          onDownload={() => handleDownloadPDF('invoice', selectedInvoiceForView)}
          onWhatsApp={() => handleWhatsApp('invoice', selectedInvoiceForView)}
          onDelete={() => {
            if (confirm(`Are you sure you want to delete invoice ${selectedInvoiceForView.invoiceNumber}? This will also revert the student's balance.`)) {
              handleDeleteInvoice(selectedInvoiceForView);
              setIsViewModalOpen(false);
            }
          }}
        />
      )}

      {/* Receipt Detail Modal */}
      {selectedReceiptForView && (
        <ReceiptDetailModal
          isOpen={isReceiptDetailModalOpen}
          onClose={() => {
            setIsReceiptDetailModalOpen(false);
            setSelectedReceiptForView(null);
          }}
          receipt={selectedReceiptForView}
          invoice={invoices.find(i => i.id === selectedReceiptForView.invoiceId)}
          profile={profile}
        />
      )}
    </div>
  );

  async function handleDeleteInvoice(inv: Invoice) {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'invoices', inv.id));
      
      // Revert student balance
      batch.update(doc(db, 'students', inv.studentId), {
        totalBalance: increment(-inv.balanceDue)
      });
      
      // Timeline
      const timelineRef = doc(collection(db, 'students', inv.studentId, 'timeline'));
      batch.set(timelineRef, {
        event: 'Invoice Deleted',
        description: `Invoice ${inv.invoiceNumber} was deleted`,
        createdBy: profile?.full_name || 'System',
        createdAt: serverTimestamp()
      });
      
      await batch.commit();
      alert('Invoice deleted successfully.');
    } catch (error) {
      console.error('Error deleting invoice:', error);
      handleFirestoreError(error, OperationType.DELETE, `invoices/${inv.id}`);
    }
  }
}

function RaiseInvoicesModal({ isOpen, onClose, students, profile }: { isOpen: boolean, onClose: () => void, students: Student[], profile: any }) {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'MMMM yyyy'));
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [skippedStudentsInfo, setSkippedStudentsInfo] = useState<{ count: number, names: string, finalIds: string[] } | null>(null);
  const [filterSchool, setFilterSchool] = useState('all');
  const [filterStand, setFilterStand] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [batchDescription, setBatchDescription] = useState('');
  const [batchTerms, setBatchTerms] = useState('Due on Receipt');
  
  // Individual customizations: studentId -> { description, terms, schoolName, feeAmount, concession }
  const [customizations, setCustomizations] = useState<Record<string, { description?: string, terms?: string, schoolName?: string, feeAmount?: number, concession?: number }>>({});
  const [editingCustomizationId, setEditingCustomizationId] = useState<string | null>(null);

  // Filter eligible students
  const [eligibleStudents, setEligibleStudents] = useState<Student[]>([]);

  useEffect(() => {
    const fetchEligible = async () => {
      try {
        const filtered = students.filter(s => {
          if (!s.isActive) return false;
          const matchesSchool = filterSchool === 'all' || s.schoolName === filterSchool;
          const matchesStand = filterStand === 'all' || s.standName === filterStand;
          const matchesSearch = !searchTerm || 
            s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.fatherName.toLowerCase().includes(searchTerm.toLowerCase());
          return matchesSchool && matchesStand && matchesSearch;
        });

        // Check for skipped months
        const results = await Promise.all(filtered.map(async (s) => {
          try {
            const skipSnap = await getDocs(query(
              collection(db, 'students', s.id, 'skippedMonths'),
              where('month', '==', selectedMonth)
            ));
            return skipSnap.empty ? s : null;
          } catch (err) {
            console.error(`Error checking skipped months for student ${s.id}:`, err);
            return s; // Fallback to including the student if check fails
          }
        }));

        setEligibleStudents(results.filter((s): s is Student => s !== null));
      } catch (error) {
        console.error('Error fetching eligible students:', error);
        handleFirestoreError(error, OperationType.LIST, 'students/skippedMonths');
      }
    };

    fetchEligible();
  }, [students, filterSchool, filterStand, selectedMonth, searchTerm]);

  useEffect(() => {
    setSelectedStudents(eligibleStudents.map(s => s.id));
  }, [eligibleStudents]);

  const handleRaise = async (forceRaiseIds?: string[]) => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      const invoiceDate = serverTimestamp();
      const dueDate = Timestamp.fromDate(endOfMonth(new Date()));
      
      let finalSelectedStudents: string[] = [];

      if (forceRaiseIds) {
        finalSelectedStudents = forceRaiseIds;
        setShowConfirm(false);
      } else {
        // Check if invoices already exist for this month to prevent duplicates
        const existingInvoicesSnap = await getDocs(query(
          collection(db, 'invoices'),
          where('month', '==', selectedMonth)
        ));
        const existingStudentIds = new Set(existingInvoicesSnap.docs.map(d => d.data().studentId));
        
        const skippedStudents = selectedStudents.filter(id => existingStudentIds.has(id));
        finalSelectedStudents = selectedStudents.filter(id => !existingStudentIds.has(id));

        if (skippedStudents.length > 0) {
          const skippedNames = skippedStudents.map(id => students.find(s => s.id === id)?.studentName).filter(Boolean).join(', ');
          setSkippedStudentsInfo({ count: skippedStudents.length, names: skippedNames, finalIds: finalSelectedStudents });
          setShowConfirm(true);
          setLoading(false);
          return;
        }
      }

      if (finalSelectedStudents.length === 0) {
        setError('All selected students already have invoices for this month.');
        setLoading(false);
        return;
      }

      // Get last invoice number
      const q = query(collection(db, 'invoices'), orderBy('invoiceNumber', 'desc'), limit(1));
      const snap = await getDocs(q);
      let lastNum = 0;
      if (!snap.empty) {
        const lastInvoiceNumber = snap.docs[0].data().invoiceNumber;
        const parts = lastInvoiceNumber.split('-');
        if (parts.length > 1) {
          lastNum = parseInt(parts[1]);
        }
      }

      let currentBatch = writeBatch(db);
      let operationsCount = 0;
      let invoicesRaised = 0;

      for (let i = 0; i < finalSelectedStudents.length; i++) {
        const student = students.find(s => s.id === finalSelectedStudents[i])!;
        if (!student) continue;

        const cust = customizations[student.id] || {};
        const invoiceNumber = `JTT-${(lastNum + i + 1).toString().padStart(6, '0')}`;
        const currentFeeAmount = cust.feeAmount ?? student.feeAmount;
        const currentConcession = cust.concession ?? student.concession;
        const totalAmount = currentFeeAmount - currentConcession;
        
        const invoiceData = {
          invoiceNumber,
          studentId: student.id,
          studentName: student.studentName,
          fatherName: student.fatherName,
          schoolName: cust.schoolName || student.schoolName,
          standName: student.standName,
          address: student.address,
          phoneNumber: student.phoneNumber,
          invoiceDate,
          dueDate,
          month: selectedMonth,
          feeAmount: currentFeeAmount,
          profileConcession: student.concession,
          invoiceConcession: currentConcession - student.concession,
          concession: currentConcession,
          totalAmount,
          paidAmount: 0,
          balanceDue: totalAmount,
          status: 'UNPAID',
          itemDescription: cust.description || batchDescription || `${student.schoolName} [${student.standName}] Transport Fees`,
          terms: cust.terms || batchTerms || 'Due on Receipt',
          createdBy: profile.full_name,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const invRef = doc(collection(db, 'invoices'));
        currentBatch.set(invRef, invoiceData);

        // Update student balance
        currentBatch.update(doc(db, 'students', student.id), {
          totalBalance: increment(totalAmount)
        });

        // Add timeline
        const timelineRef = doc(collection(db, 'students', student.id, 'timeline'));
        currentBatch.set(timelineRef, {
          event: 'Invoice Raised',
          description: `Invoice ${invoiceNumber} raised for ${selectedMonth}`,
          createdBy: profile.full_name,
          createdAt: serverTimestamp()
        });

        operationsCount += 3;
        invoicesRaised++;
        
        // Firestore batch limit is 500 operations
        if (operationsCount >= 450) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          operationsCount = 0;
        }
      }

      if (operationsCount > 0) {
        await currentBatch.commit();
      }

      setSuccess(`Successfully raised ${invoicesRaised} invoices.`);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error raising invoices:', error);
      setError('Failed to raise invoices. Please check console for details.');
      handleFirestoreError(error, OperationType.CREATE, 'invoices');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-5xl rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[95vh]"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Bulk Raise Invoices</h3>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Generate invoices for multiple students</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {error && (
            <div className="p-4 bg-danger/10 border border-danger/20 rounded-2xl flex items-center space-x-3 text-danger font-bold">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 bg-success/10 border border-success/20 rounded-2xl flex items-center space-x-3 text-success font-bold">
              <CheckCircle2 className="h-5 w-5" />
              <span>{success}</span>
            </div>
          )}

          {showConfirm && skippedStudentsInfo && (
            <div className="p-6 bg-warning/10 border border-warning/20 rounded-3xl space-y-4">
              <div className="flex items-center space-x-3 text-warning">
                <AlertCircle className="h-6 w-6" />
                <h4 className="text-lg font-black">Duplicate Invoices Detected</h4>
              </div>
              <p className="text-sm text-secondary font-medium leading-relaxed">
                <strong>{skippedStudentsInfo.count}</strong> students already have invoices for <strong>{selectedMonth}</strong>:
                <br />
                <span className="text-xs opacity-75">{skippedStudentsInfo.names}</span>
                <br /><br />
                They will be skipped. Do you want to continue with the remaining <strong>{skippedStudentsInfo.finalIds.length}</strong> students?
              </p>
              <div className="flex space-x-3">
                <button 
                  onClick={() => {
                    setShowConfirm(false);
                    setSkippedStudentsInfo(null);
                  }}
                  className="flex-1 py-3 bg-surface border border-border rounded-xl font-bold hover:bg-border/50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleRaise(skippedStudentsInfo.finalIds)}
                  className="flex-1 py-3 bg-warning text-white rounded-xl font-bold hover:bg-warning/90 transition-colors"
                >
                  Yes, Continue
                </button>
              </div>
            </div>
          )}

          {/* Batch Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-accent/5 p-4 rounded-2xl border border-accent/10">
            <div className="space-y-2">
              <label className="label">Default Batch Description</label>
              <input
                type="text"
                value={batchDescription}
                onChange={(e) => setBatchDescription(e.target.value)}
                className="input w-full bg-background"
                placeholder="e.g. School Transport Fees"
              />
            </div>
            <div className="space-y-2">
              <label className="label">Default Batch Terms</label>
              <input
                type="text"
                value={batchTerms}
                onChange={(e) => setBatchTerms(e.target.value)}
                className="input w-full bg-background"
                placeholder="e.g. Due on Receipt"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="label">Select Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="input w-full bg-background"
              >
                {Array.from({ length: 16 }, (_, i) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() + (i - 3));
                  const m = format(d, 'MMMM yyyy');
                  return <option key={m} value={m}>{m}</option>;
                })}
              </select>
            </div>
            <div className="space-y-2">
              <label className="label">Filter School</label>
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className="input w-full bg-background"
              >
                <option key="all" value="all">All Schools</option>
                {Array.from(new Set(students.map(s => s.schoolName).filter(Boolean))).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="label">Filter Stand</label>
              <select
                value={filterStand}
                onChange={(e) => setFilterStand(e.target.value)}
                className="input w-full bg-background"
              >
                <option key="all" value="all">All Stands</option>
                {Array.from(new Set(students.map(s => s.standName).filter(Boolean))).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="label">Search Student</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
                <input
                  type="text"
                  placeholder="Name or Father Name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10 w-full bg-background"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-border rounded-2xl">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10">
                    <input 
                      type="checkbox" 
                      checked={selectedStudents.length === eligibleStudents.length && eligibleStudents.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedStudents(eligibleStudents.map(s => s.id));
                        else setSelectedStudents([]);
                      }}
                    />
                  </th>
                  <th>Student Name</th>
                  <th>School</th>
                  <th>Stand</th>
                  <th>Fee Amount</th>
                  <th className="text-right">Customize</th>
                </tr>
              </thead>
              <tbody>
                {eligibleStudents.map(s => (
                  <tr key={s.id}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedStudents.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedStudents([...selectedStudents, s.id]);
                          else setSelectedStudents(selectedStudents.filter(id => id !== s.id));
                        }}
                      />
                    </td>
                    <td className="font-bold text-primary">
                      {s.studentName}
                      {customizations[s.id] && (
                        <span className="ml-2 text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Customized</span>
                      )}
                    </td>
                    <td className="text-xs text-secondary">{customizations[s.id]?.schoolName || s.schoolName}</td>
                    <td className="text-xs text-secondary">{s.standName}</td>
                    <td className="font-bold text-primary">
                      {formatCurrency((customizations[s.id]?.feeAmount ?? s.feeAmount) - (customizations[s.id]?.concession ?? s.concession))}
                    </td>
                    <td className="text-right">
                      <button 
                        onClick={() => setEditingCustomizationId(s.id)}
                        className="p-2 text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-6 border-t border-border flex items-center justify-between bg-accent/5">
          <p className="text-sm font-bold text-secondary">
            {selectedStudents.length} students selected
          </p>
          <div className="flex space-x-3">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button 
              onClick={() => handleRaise()} 
              disabled={loading || selectedStudents.length === 0}
              className="btn-primary flex items-center space-x-2"
            >
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
              <span>Confirm & Raise Invoices</span>
            </button>
          </div>
        </div>

        {/* Individual Customization Modal */}
        {editingCustomizationId && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface w-full max-w-md rounded-3xl shadow-2xl border border-border overflow-hidden"
            >
              <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
                <h3 className="text-lg font-black text-primary tracking-tight">Customize Invoice</h3>
                <button onClick={() => setEditingCustomizationId(null)} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
                  <X className="h-5 w-5 text-secondary" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="label">School Name</label>
                  <input
                    type="text"
                    value={customizations[editingCustomizationId]?.schoolName || eligibleStudents.find(s => s.id === editingCustomizationId)?.schoolName || ''}
                    onChange={(e) => setCustomizations({
                      ...customizations,
                      [editingCustomizationId]: { ...customizations[editingCustomizationId], schoolName: e.target.value }
                    })}
                    className="input w-full bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <label className="label">Description</label>
                  <textarea
                    value={customizations[editingCustomizationId]?.description || batchDescription || ''}
                    onChange={(e) => setCustomizations({
                      ...customizations,
                      [editingCustomizationId]: { ...customizations[editingCustomizationId], description: e.target.value }
                    })}
                    className="input w-full bg-background min-h-[80px] resize-none"
                    placeholder="Student specific description..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="label">Terms</label>
                  <input
                    type="text"
                    value={customizations[editingCustomizationId]?.terms || batchTerms || ''}
                    onChange={(e) => setCustomizations({
                      ...customizations,
                      [editingCustomizationId]: { ...customizations[editingCustomizationId], terms: e.target.value }
                    })}
                    className="input w-full bg-background"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Fee Amount (₹)</label>
                    <input
                      type="number"
                      value={customizations[editingCustomizationId]?.feeAmount ?? eligibleStudents.find(s => s.id === editingCustomizationId)?.feeAmount ?? 0}
                      onChange={(e) => setCustomizations({
                        ...customizations,
                        [editingCustomizationId]: { ...customizations[editingCustomizationId], feeAmount: Number(e.target.value) }
                      })}
                      className="input w-full bg-background font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label">Concession (₹)</label>
                    <input
                      type="number"
                      value={customizations[editingCustomizationId]?.concession ?? eligibleStudents.find(s => s.id === editingCustomizationId)?.concession ?? 0}
                      onChange={(e) => setCustomizations({
                        ...customizations,
                        [editingCustomizationId]: { ...customizations[editingCustomizationId], concession: Number(e.target.value) }
                      })}
                      className="input w-full bg-background font-mono text-success"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button onClick={() => {
                    const newCust = { ...customizations };
                    delete newCust[editingCustomizationId];
                    setCustomizations(newCust);
                    setEditingCustomizationId(null);
                  }} className="btn-secondary text-danger border-danger/20 hover:bg-danger/5">Reset to Default</button>
                  <button onClick={() => setEditingCustomizationId(null)} className="btn-primary">Apply Changes</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
