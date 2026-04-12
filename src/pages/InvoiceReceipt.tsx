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
  Users,
  School as SchoolIcon,
  Route as RouteIcon
} from 'lucide-react';
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
    if (!profile || (profile.role !== 'admin' && profile.role !== 'accountant')) return;

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
    if (!invoices.length || !profile || profile.role !== 'admin') return;

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
      message = `Dear ${item.fatherName}, Payment of ₹${item.amountReceived} received for ${item.studentName} against invoice [${item.invoiceNumber}]. Receipt No: [${item.receiptNumber}]. Thank you. - Jagriti Tours & Travels`;
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
        {activeTab === 'invoices' && profile?.role === 'admin' && (
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
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10 w-full bg-background border-border/50"
              />
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
  const [filterSchool, setFilterSchool] = useState('all');
  const [filterStand, setFilterStand] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleRaise = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const invoiceDate = serverTimestamp();
      const dueDate = Timestamp.fromDate(endOfMonth(new Date()));
      
      // Check if invoices already exist for this month to prevent duplicates
      const existingInvoicesSnap = await getDocs(query(
        collection(db, 'invoices'),
        where('month', '==', selectedMonth)
      ));
      const existingStudentIds = new Set(existingInvoicesSnap.docs.map(d => d.data().studentId));
      
      const finalSelectedStudents = selectedStudents.filter(id => !existingStudentIds.has(id));

      if (finalSelectedStudents.length === 0) {
        alert('All selected students already have invoices for this month.');
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

        const invoiceNumber = `JTT-${(lastNum + i + 1).toString().padStart(6, '0')}`;
        const totalAmount = student.feeAmount - student.concession;
        
        const invoiceData = {
          invoiceNumber,
          studentId: student.id,
          studentName: student.studentName,
          fatherName: student.fatherName,
          schoolName: student.schoolName,
          standName: student.standName,
          address: student.address,
          phoneNumber: student.phoneNumber,
          invoiceDate,
          dueDate,
          month: selectedMonth,
          feeAmount: student.feeAmount,
          profileConcession: student.concession,
          invoiceConcession: 0,
          concession: student.concession,
          totalAmount,
          paidAmount: 0,
          balanceDue: totalAmount,
          status: 'UNPAID',
          itemDescription: `${student.schoolName} [${student.standName}] Transport Fees`,
          terms: 'Due on Receipt',
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

      alert(`Successfully raised ${invoicesRaised} invoices.`);
      onClose();
    } catch (error) {
      console.error('Error raising invoices:', error);
      handleFirestoreError(error, OperationType.CREATE, 'invoices');
      alert('Failed to raise invoices. Please check console for details.');
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
        className="bg-surface w-full max-w-4xl rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
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
                    <td className="font-bold text-primary">{s.studentName}</td>
                    <td className="text-xs text-secondary">{s.schoolName}</td>
                    <td className="text-xs text-secondary">{s.standName}</td>
                    <td className="font-bold text-primary">{formatCurrency(s.feeAmount - s.concession)}</td>
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
              onClick={handleRaise} 
              disabled={loading || selectedStudents.length === 0}
              className="btn-primary flex items-center space-x-2"
            >
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
              <span>Confirm & Raise Invoices</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RecordPaymentModal({ isOpen, onClose, invoice, profile }: { isOpen: boolean, onClose: () => void, invoice: Invoice, profile: any }) {
  const [amount, setAmount] = useState(invoice.balanceDue);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [mode, setMode] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Cash');
  const [type, setType] = useState<'Sunday Doorstep' | 'Regular via Driver'>('Regular via Driver');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // Get last receipt number
      const q = query(collection(db, 'receipts'), orderBy('receiptNumber', 'desc'), limit(1));
      const snap = await getDocs(q);
      let lastNum = 0;
      if (!snap.empty) {
        lastNum = parseInt(snap.docs[0].data().receiptNumber.split('-')[1]);
      }
      const receiptNumber = `RCP-${(lastNum + 1).toString().padStart(6, '0')}`;

      const receiptData = {
        receiptNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        studentId: invoice.studentId,
        studentName: invoice.studentName,
        fatherName: invoice.fatherName,
        address: invoice.address,
        phoneNumber: invoice.phoneNumber,
        paymentDate: Timestamp.fromDate(new Date(date)),
        paymentMode: mode,
        feeType: type,
        receivedBy: profile.full_name,
        amountReceived: amount,
        amountInWords: amountToWordsIndian(amount),
        notes,
        createdAt: serverTimestamp()
      };

      const rcpRef = doc(collection(db, 'receipts'));
      batch.set(rcpRef, receiptData);

      // Update invoice
      const newPaidAmount = invoice.paidAmount + amount;
      const newBalanceDue = invoice.totalAmount - newPaidAmount;
      const newStatus = newBalanceDue === 0 ? 'PAID' : 'PARTIAL';
      
      batch.update(doc(db, 'invoices', invoice.id), {
        paidAmount: newPaidAmount,
        balanceDue: newBalanceDue,
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      // Update student
      batch.update(doc(db, 'students', invoice.studentId), {
        totalBalance: increment(-amount)
      });

      // Add timeline
      const timelineRef = doc(collection(db, 'students', invoice.studentId, 'timeline'));
      batch.set(timelineRef, {
        event: 'Payment Recorded',
        description: `Payment of ₹${amount} received for ${invoice.month} (Receipt: ${receiptNumber})`,
        createdBy: profile.full_name,
        createdAt: serverTimestamp()
      });

      // Add to cash transactions if Cash
      if (mode === 'Cash') {
        const cashRef = doc(collection(db, 'cash_transactions'));
        batch.set(cashRef, {
          date: date,
          type: 'in',
          category: 'fee_collection',
          amount: amount,
          description: `Fee collection for ${invoice.schoolName}: ${invoice.studentName} (${invoice.month})`,
          linked_id: invoice.id,
          paid_by: profile.role === 'admin' ? 'owner' : 'accountant',
          created_by: auth.currentUser?.uid,
          created_at: serverTimestamp()
        });
      }

      await batch.commit();
      alert('Payment recorded successfully.');
      onClose();
    } catch (error) {
      console.error('Error recording payment:', error);
      handleFirestoreError(error, OperationType.WRITE, 'receipts');
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
        className="bg-surface w-full max-w-lg rounded-3xl shadow-2xl border border-border overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Record Payment</h3>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Against Invoice {invoice.invoiceNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-accent/5 p-4 rounded-2xl border border-accent/10 space-y-1">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Student Name</p>
            <p className="text-lg font-black text-primary">{invoice.studentName}</p>
            <p className="text-xs text-secondary">Outstanding for {invoice.month}: <span className="font-bold text-danger">{formatCurrency(invoice.balanceDue)}</span></p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Amount to Pay (₹)</label>
              <input
                required
                type="number"
                max={invoice.balanceDue}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="input w-full bg-background font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="label">Payment Date</label>
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input w-full bg-background"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Payment Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="input w-full bg-background"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="label">Fee Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="input w-full bg-background"
              >
                <option value="Regular via Driver">Regular via Driver</option>
                <option value="Sunday Doorstep">Sunday Doorstep</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="label">Internal Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input w-full bg-background min-h-[80px] resize-none"
              placeholder="Internal only notes..."
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button 
              type="submit" 
              disabled={loading || amount <= 0}
              className="btn-primary flex-1 flex items-center justify-center space-x-2"
            >
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>Record Payment</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function EditInvoiceModal({ isOpen, onClose, invoice, profile }: { isOpen: boolean, onClose: () => void, invoice: Invoice, profile: any }) {
  const [invoiceDate, setInvoiceDate] = useState(format(invoice.invoiceDate.toDate ? invoice.invoiceDate.toDate() : new Date(invoice.invoiceDate), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(format(invoice.dueDate.toDate ? invoice.dueDate.toDate() : new Date(invoice.dueDate), 'yyyy-MM-dd'));
  const [itemDescription, setItemDescription] = useState(invoice.itemDescription || `${invoice.schoolName} [${invoice.standName}] Transport Fees`);
  const [feeAmount, setFeeAmount] = useState(invoice.feeAmount);
  const [invoiceConcession, setInvoiceConcession] = useState(invoice.invoiceConcession || 0);
  const [notes, setNotes] = useState(invoice.notes || '');
  const [terms, setTerms] = useState(invoice.terms || 'Due on Receipt');
  const [loading, setLoading] = useState(false);

  const profileConcession = invoice.profileConcession || 0;
  const totalConcession = profileConcession + invoiceConcession;
  const totalAmount = feeAmount - totalConcession;
  const balanceDue = totalAmount - invoice.paidAmount;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const invoiceRef = doc(db, 'invoices', invoice.id);
      
      let newStatus = invoice.status;
      if (balanceDue <= 0) {
        newStatus = 'PAID';
      } else if (invoice.paidAmount > 0) {
        newStatus = 'PARTIAL';
      } else {
        newStatus = 'UNPAID';
      }

      const historyEntry = {
        editedBy: auth.currentUser?.uid || '',
        userName: profile.full_name,
        editedAt: new Date()
      };

      const updatedData = {
        invoiceDate: Timestamp.fromDate(new Date(invoiceDate)),
        dueDate: Timestamp.fromDate(new Date(dueDate)),
        itemDescription,
        feeAmount,
        invoiceConcession,
        concession: totalConcession,
        totalAmount,
        balanceDue,
        status: newStatus,
        notes,
        terms,
        editHistory: [...(invoice.editHistory || []), historyEntry],
        updatedAt: serverTimestamp()
      };

      batch.update(invoiceRef, updatedData);

      // Update student balance
      const balanceDiff = totalAmount - invoice.totalAmount;
      if (balanceDiff !== 0) {
        batch.update(doc(db, 'students', invoice.studentId), {
          totalBalance: increment(balanceDiff)
        });
      }

      // Timeline event
      const timelineRef = doc(collection(db, 'students', invoice.studentId, 'timeline'));
      batch.set(timelineRef, {
        event: 'Invoice Edited',
        description: `Invoice ${invoice.invoiceNumber} was edited by ${profile.full_name}`,
        createdBy: profile.full_name,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      alert('Invoice updated successfully.');
      onClose();
    } catch (error) {
      console.error('Error updating invoice:', error);
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoice.id}`);
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
        className="bg-surface w-full max-w-2xl rounded-3xl shadow-2xl border border-border overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center text-warning">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Edit Invoice</h3>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">{invoice.invoiceNumber} - {invoice.studentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Invoice Date</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="input w-full bg-background" required />
            </div>
            <div className="space-y-2">
              <label className="label">Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input w-full bg-background" required />
            </div>
          </div>

          <div className="space-y-2">
            <label className="label">Item Description</label>
            <input type="text" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} className="input w-full bg-background" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Fee Amount (Rate)</label>
              <input type="number" value={feeAmount} onChange={(e) => setFeeAmount(Number(e.target.value))} className="input w-full bg-background font-mono" required />
            </div>
            <div className="space-y-2">
              <label className="label">Invoice Concession</label>
              <input type="number" value={invoiceConcession} onChange={(e) => setInvoiceConcession(Number(e.target.value))} className="input w-full bg-background font-mono" />
              <p className="text-[10px] text-secondary font-bold">Profile Concession: {formatCurrency(profileConcession)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Terms</label>
              <input type="text" value={terms} onChange={(e) => setTerms(e.target.value)} className="input w-full bg-background" />
            </div>
            <div className="space-y-2">
              <label className="label">Internal Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full bg-background" placeholder="Internal only..." />
            </div>
          </div>

          <div className="bg-accent/5 p-4 rounded-2xl border border-accent/10 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary font-bold">Sub Total:</span>
              <span className="text-primary font-black font-mono">{formatCurrency(feeAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary font-bold">Total Discount:</span>
              <span className="text-danger font-black font-mono">-{formatCurrency(totalConcession)}</span>
            </div>
            <div className="flex justify-between text-lg border-t border-accent/10 pt-2">
              <span className="text-primary font-black">Total:</span>
              <span className="text-accent font-black font-mono">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary font-bold">Already Paid:</span>
              <span className="text-success font-black font-mono">{formatCurrency(invoice.paidAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span className="text-secondary">Balance Due:</span>
              <span className={cn("font-black font-mono", balanceDue > 0 ? "text-danger" : "text-success")}>{formatCurrency(balanceDue)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center space-x-2">
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function InvoiceViewModal({ isOpen, onClose, invoice, org, onEdit, onRecordPayment, onDownload, onWhatsApp, onDelete }: { 
  isOpen: boolean, 
  onClose: () => void, 
  invoice: Invoice, 
  org: Organization | null,
  onEdit: () => void,
  onRecordPayment: () => void,
  onDownload: () => void,
  onWhatsApp: () => void,
  onDelete: () => void
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-4xl rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <Eye className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-black text-primary tracking-tight">Invoice Preview</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={onEdit} className="p-2 text-warning hover:bg-warning/10 rounded-lg transition-all" title="Edit"><FileText className="h-4 w-4" /></button>
            <button onClick={onRecordPayment} disabled={invoice.status === 'PAID'} className="p-2 text-success hover:bg-success/10 rounded-lg transition-all" title="Record Payment"><CreditCard className="h-4 w-4" /></button>
            <button onClick={onDownload} className="p-2 text-secondary hover:bg-border/50 rounded-lg transition-all" title="Download"><Download className="h-4 w-4" /></button>
            <button onClick={onWhatsApp} className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-all" title="WhatsApp"><MessageSquare className="h-4 w-4" /></button>
            <button onClick={onDelete} className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-all" title="Delete"><X className="h-4 w-4" /></button>
            <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors ml-2"><X className="h-5 w-5 text-secondary" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white">
          {/* Invoice Header */}
          <div className="flex justify-between items-start">
            <div className="space-y-4">
              {org?.logo_url && <img src={org.logo_url} alt="Logo" className="h-16 w-auto object-contain" referrerPolicy="no-referrer" />}
              <div>
                <h4 className="text-2xl font-black text-primary">{org?.name || 'Jagriti Tours & Travels'}</h4>
                <p className="text-sm text-secondary">{org?.address_line1}, {org?.address_line2} - {org?.zip_code}</p>
                <p className="text-sm text-secondary">Phone: {org?.phone} | Email: {org?.email}</p>
              </div>
            </div>
            <div className="text-right space-y-2">
              <h2 className="text-5xl font-black text-accent/20">INVOICE</h2>
              <div className="space-y-1">
                <p className="text-sm font-bold text-primary">Invoice #: {invoice.invoiceNumber}</p>
                <p className="text-sm text-secondary">Date: {format(invoice.invoiceDate.toDate ? invoice.invoiceDate.toDate() : new Date(invoice.invoiceDate), 'dd MMM yyyy')}</p>
                <p className="text-sm text-secondary">Due Date: {format(invoice.dueDate.toDate ? invoice.dueDate.toDate() : new Date(invoice.dueDate), 'dd MMM yyyy')}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12">
            <div>
              <h5 className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2">Bill To:</h5>
              <p className="font-black text-primary text-lg">{invoice.studentName}</p>
              <p className="text-sm text-secondary">{invoice.address}</p>
              <p className="text-sm text-secondary">Phone: {invoice.phoneNumber}</p>
            </div>
          </div>

          {/* Table */}
          <div className="border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-accent text-white">
                <tr>
                  <th className="px-6 py-4 text-sm font-black">#</th>
                  <th className="px-6 py-4 text-sm font-black">Item & Description</th>
                  <th className="px-6 py-4 text-sm font-black text-right">Rate</th>
                  <th className="px-6 py-4 text-sm font-black text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-6 py-4 text-sm">1</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-primary">{invoice.itemDescription || `${invoice.schoolName} [${invoice.standName}] Transport Fees`}</p>
                    <p className="text-xs text-secondary">Month: {invoice.month}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-mono">{formatCurrency(invoice.feeAmount)}</td>
                  <td className="px-6 py-4 text-sm text-right font-mono">{formatCurrency(invoice.feeAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-secondary font-bold">Sub Total:</span>
                <span className="text-primary font-black font-mono">{formatCurrency(invoice.feeAmount)}</span>
              </div>
              {invoice.concession > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-secondary font-bold">Concession:</span>
                  <span className="text-danger font-black font-mono">-{formatCurrency(invoice.concession)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg border-t border-border pt-3">
                <span className="text-primary font-black">Total:</span>
                <span className="text-accent font-black font-mono">{formatCurrency(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm bg-accent/5 p-2 rounded-lg">
                <span className="text-secondary font-bold">Balance Due:</span>
                <span className="text-danger font-black font-mono">{formatCurrency(invoice.balanceDue)}</span>
              </div>
            </div>
          </div>

          {/* Amount in Words */}
          <div className="pt-8 border-t border-border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-1">Total in Words:</p>
            <p className="text-sm font-bold text-primary italic">{amountToWordsIndian(invoice.totalAmount)} Only</p>
          </div>

          {/* Internal Notes Section */}
          {invoice.notes && (
            <div className="p-4 bg-warning/10 border border-warning/20 rounded-2xl">
              <h5 className="text-xs font-black text-warning uppercase tracking-wider mb-2 flex items-center gap-2">
                <AlertCircle className="h-3 w-3" />
                Internal Notes (Not Printed)
              </h5>
              <p className="text-sm text-primary">{invoice.notes}</p>
            </div>
          )}

          {/* Edit History */}
          {invoice.editHistory && invoice.editHistory.length > 0 && (
            <div className="pt-8 border-t border-border">
              <h5 className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-4">Edit History:</h5>
              <div className="space-y-3">
                {invoice.editHistory.map((entry, idx) => (
                  <div key={idx} className="flex items-center space-x-3 text-xs">
                    <div className="h-2 w-2 rounded-full bg-accent" />
                    <span className="text-secondary">Edited by <span className="font-bold text-primary">{entry.userName}</span> on {format(entry.editedAt.toDate ? entry.editedAt.toDate() : new Date(entry.editedAt), 'dd MMM yyyy, hh:mm a')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ReceiptDetailModal({ isOpen, onClose, receipt, invoice, profile }: { 
  isOpen: boolean, 
  onClose: () => void, 
  receipt: Receipt, 
  invoice: Invoice | undefined,
  profile: any 
}) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState(receipt.notes || '');
  const [loading, setLoading] = useState(false);

  const handleSaveNotes = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'receipts', receipt.id), {
        notes,
        updatedAt: serverTimestamp()
      });
      setIsEditingNotes(false);
      alert('Notes updated successfully.');
    } catch (error) {
      console.error('Error updating receipt notes:', error);
      handleFirestoreError(error, OperationType.UPDATE, `receipts/${receipt.id}`);
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
        className="bg-surface w-full max-w-lg rounded-3xl shadow-2xl border border-border overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary tracking-tight">Receipt Details</h3>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">{receipt.receiptNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
            <X className="h-5 w-5 text-secondary" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Student</p>
              <p className="text-sm font-black text-primary">{receipt.studentName}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Amount Received</p>
              <p className="text-lg font-black text-success">{formatCurrency(receipt.amountReceived)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Payment Date</p>
              <p className="text-sm font-bold text-primary">{format(receipt.paymentDate.toDate ? receipt.paymentDate.toDate() : new Date(receipt.paymentDate), 'dd MMM yyyy')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Payment Mode</p>
              <p className="text-sm font-bold text-primary">{receipt.paymentMode}</p>
            </div>
          </div>

          {/* Internal Notes Section */}
          <div className="p-4 bg-warning/10 border border-warning/20 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-black text-warning uppercase tracking-wider flex items-center gap-2">
                <AlertCircle className="h-3 w-3" />
                Internal Notes (Not Printed)
              </h5>
              {!isEditingNotes && (
                <button 
                  onClick={() => setIsEditingNotes(true)}
                  className="text-[10px] font-bold text-warning hover:underline"
                >
                  Edit Notes
                </button>
              )}
            </div>
            
            {isEditingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input w-full bg-background min-h-[80px] text-sm resize-none"
                  placeholder="Add internal notes..."
                />
                <div className="flex justify-end space-x-2">
                  <button onClick={() => setIsEditingNotes(false)} className="px-3 py-1 text-[10px] font-bold text-secondary hover:bg-border/50 rounded-lg">Cancel</button>
                  <button 
                    onClick={handleSaveNotes} 
                    disabled={loading}
                    className="px-3 py-1 text-[10px] font-bold bg-warning text-white rounded-lg hover:bg-warning/90"
                  >
                    {loading ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-primary">{receipt.notes || 'No internal notes added.'}</p>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-border bg-accent/5 flex justify-end">
          <button onClick={onClose} className="btn-primary">Close</button>
        </div>
      </motion.div>
    </div>
  );
}
