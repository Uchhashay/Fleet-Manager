import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { writeBatch, doc, increment, limit, collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, Timestamp, getDocs } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Plus, 
  Download, 
  X, 
  Save,
  GraduationCap,
  School,
  CreditCard,
  Calendar,
  Filter,
  ChevronDown,
  Search
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { FeeCollection, Student } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { logActivity } from '../lib/activity-logger';
import { motion, AnimatePresence } from 'framer-motion';
import { applyPaymentToInvoices } from '../lib/invoice-utils';
import { amountToWordsIndian } from '../lib/number-utils';

import { useAuth } from '../contexts/AuthContext';

export function FeeCollectionPage() {
  const { profile } = useAuth();
  const [collections, setCollections] = useState<FeeCollection[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    student_name: '',
    receipt_no: '',
    school_name: '',
    received_by: '',
    amount: 0,
    payment_mode: 'Cash' as 'Cash' | 'Online' | 'Cheque',
    fee_type: 'Regular Fee',
    notes: '',
    paid_by: 'accountant' as 'owner' | 'accountant'
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'students'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (profile?.role === 'admin') {
      setFormData(prev => ({ ...prev, paid_by: 'owner' }));
    } else {
      setFormData(prev => ({ ...prev, paid_by: 'accountant' }));
    }
  }, [profile?.role]);

  const [filters, setFilters] = useState({
    month: format(new Date(), 'yyyy-MM'),
    school: 'all',
    mode: 'all'
  });

  const feeTypes = ["Sunday Fee Collection", "Regular Fee", "Annual Fee", "Other"];
  const paymentModes = ["Cash", "Online", "Cheque"];
  const schools = ["RNSN", "Rosary", "Apex B-2", "Other"];
  const collectors = ["Dhruv", "Jai", "Other"];

  useEffect(() => {
    setLoading(true);
    const start = Timestamp.fromDate(startOfMonth(new Date(filters.month)));
    const end = Timestamp.fromDate(endOfMonth(new Date(filters.month)));

    let q = query(
      collection(db, 'fee_collections'),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeCollection));

      if (filters.school !== 'all') {
        list = list.filter(c => c.school_name === filters.school);
      }
      if (filters.mode !== 'all') {
        list = list.filter(c => c.payment_mode === filters.mode);
      }

      setCollections(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'fee_collections');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filters]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const feeRef = doc(collection(db, 'fee_collections'));
      
      const txData = {
        ...formData,
        student_id: selectedStudent?.id || null,
        date: Timestamp.fromDate(new Date(formData.date)),
        data_entry_by: auth.currentUser?.email?.split('@')[0] || 'Unknown',
        recorded_by: auth.currentUser?.uid,
        created_at: serverTimestamp()
      };

      batch.set(feeRef, txData);

      // If a student is selected, update their balance and create a receipt
      if (selectedStudent) {
        // Apply payment to invoices using FIFO
        const linkedInvoices = await applyPaymentToInvoices(batch, selectedStudent.id, formData.amount);

        // Update student balance
        batch.update(doc(db, 'students', selectedStudent.id), {
          totalBalance: increment(-formData.amount)
        });

        // Add timeline
        const timelineRef = doc(collection(db, 'students', selectedStudent.id, 'timeline'));
        const invoiceInfo = linkedInvoices.length > 0 
          ? `Adjusted against: ${linkedInvoices.map(li => li.invoiceNumber).join(', ')}`
          : 'No pending invoices found to adjust against.';
          
        batch.set(timelineRef, {
          event: 'Fee Collected',
          description: `Collected ₹${formData.amount} via Fee Collection module (${formData.payment_mode}). ${invoiceInfo}`,
          createdBy: profile?.full_name || 'System',
          createdAt: serverTimestamp()
        });

        // Create a receipt
        const q = query(collection(db, 'receipts'), orderBy('receiptNumber', 'desc'), limit(1));
        const snap = await getDocs(q);
        let lastNum = 0;
        if (!snap.empty) {
          const lastReceiptNumber = snap.docs[0].data().receiptNumber;
          const parts = lastReceiptNumber.split('-');
          if (parts.length > 1) {
            lastNum = parseInt(parts[1]);
          }
        }
        const receiptNumber = `RCP-${(lastNum + 1).toString().padStart(6, '0')}`;

        const receiptRef = doc(collection(db, 'receipts'));
        
        // Generate description from months
        const monthsPaid = linkedInvoices
          .filter(li => li.invoiceId !== 'ADVANCE')
          .map(li => li.month);
        const uniqueMonths = [...new Set(monthsPaid)];
        const hasAdvance = linkedInvoices.some(li => li.invoiceId === 'ADVANCE');
        
        let description = uniqueMonths.length > 0 
          ? `Fees for ${uniqueMonths.join(', ')}`
          : 'Transport Fees';
          
        if (hasAdvance) {
          description += uniqueMonths.length > 0 ? ' (incl. Advance)' : 'Advance Payment';
        }
        
        if (formData.notes) description = formData.notes;

        batch.set(receiptRef, {
          receiptNumber,
          invoiceId: linkedInvoices[0]?.invoiceId || 'N/A',
          invoiceNumber: linkedInvoices[0]?.invoiceNumber || 'N/A',
          studentId: selectedStudent.id,
          studentName: selectedStudent.studentName,
          fatherName: selectedStudent.fatherName,
          address: selectedStudent.address,
          phoneNumber: selectedStudent.phoneNumber,
          paymentDate: Timestamp.fromDate(new Date(formData.date)),
          paymentMode: formData.payment_mode,
          feeType: formData.fee_type,
          receivedBy: formData.received_by || profile?.full_name || 'System',
          amountReceived: formData.amount,
          amountInWords: amountToWordsIndian(formData.amount),
          linkedInvoices,
          description,
          notes: formData.notes,
          createdAt: serverTimestamp()
        });
      }

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Fee Collection',
          `Collected ${formatCurrency(formData.amount)} from ${formData.student_name} (${formData.school_name})`
        );
      }

      if (formData.payment_mode === 'Cash') {
        const cashRef = doc(collection(db, 'cash_transactions'));
        batch.set(cashRef, {
          date: formData.date,
          type: 'in',
          category: 'fee_collection',
          amount: formData.amount,
          description: `Fee collection for ${formData.school_name}: ${formData.student_name}`,
          linked_id: feeRef.id,
          paid_by: formData.paid_by,
          created_by: auth.currentUser?.uid,
          created_at: serverTimestamp()
        });
      }

      await batch.commit();

      setIsModalOpen(false);
      setSelectedStudent(null);
      setSearchTerm('');
      setFormData({
        date: new Date().toISOString().split('T')[0],
        student_name: '',
        receipt_no: '',
        school_name: '',
        received_by: '',
        amount: 0,
        payment_mode: 'Cash',
        fee_type: 'Regular Fee',
        notes: '',
        paid_by: profile?.role === 'admin' ? 'owner' : 'accountant'
      });
    } catch (error: any) {
      console.error('Error saving fee collection:', error);
      handleFirestoreError(error, OperationType.CREATE, 'fee_collections');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Student', 'School', 'Amount', 'Mode', 'Type', 'Collected By'];
    const rows = collections.map(c => [
      format(c.date instanceof Timestamp ? c.date.toDate() : new Date(c.date), 'yyyy-MM-dd'),
      c.student_name,
      c.school_name,
      c.amount,
      c.payment_mode,
      c.fee_type,
      c.received_by
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `fee_collections_${filters.month}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalFees = collections.reduce((acc, c) => acc + c.amount, 0);
  const cashFees = collections.filter(c => c.payment_mode === 'Cash').reduce((acc, c) => acc + c.amount, 0);
  const onlineFees = collections.filter(c => c.payment_mode === 'Online').reduce((acc, c) => acc + c.amount, 0);

  const topSchool = Object.entries(collections.reduce((acc, c) => {
    acc[c.school_name] = (acc[c.school_name] || 0) + c.amount;
    return acc;
  }, {} as Record<string, number>)).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || 'N/A';

  return (
    <div className="space-y-10">
      <header className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-secondary">
            <GraduationCap className="h-4 w-4 stroke-[1.5px]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Revenue Management</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Fee Collection</h1>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center space-x-2 !px-6"
        >
          <Plus className="h-4 w-4 stroke-[1.5px]" />
          <span>Add Fee Record</span>
        </button>
      </header>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <GraduationCap className="h-4 w-4 stroke-[1.5px]" />
            </div>
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Total Collected</span>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-primary tracking-tighter font-mono">{formatCurrency(totalFees)}</h3>
            <p className="text-[10px] text-secondary font-medium mt-1">{collections.length} Records this month</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center text-success">
              <CreditCard className="h-4 w-4 stroke-[1.5px]" />
            </div>
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Cash vs Online</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-secondary uppercase">Cash</span>
              <span className="text-xs font-bold text-primary font-mono">{formatCurrency(cashFees)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-secondary uppercase">Online</span>
              <span className="text-xs font-bold text-primary font-mono">{formatCurrency(onlineFees)}</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center text-warning">
              <School className="h-4 w-4 stroke-[1.5px]" />
            </div>
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Top School</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-primary tracking-tight">{topSchool}</h3>
            <p className="text-[10px] text-secondary font-medium mt-1">Highest revenue contributor</p>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="card space-y-6">
        <div className="flex items-center space-x-2 text-secondary mb-2">
          <Filter className="h-3 w-3 stroke-[1.5px]" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Filter Records</span>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label className="label">Month</label>
            <div className="relative">
              <input
                type="month"
                value={filters.month}
                onChange={(e) => setFilters({ ...filters, month: e.target.value })}
                className="input pr-10"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary pointer-events-none" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="label">School</label>
            <select
              value={filters.school}
              onChange={(e) => setFilters({ ...filters, school: e.target.value })}
              className="input"
            >
              <option value="all">All Schools</option>
              {schools.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="label">Payment Mode</label>
            <select
              value={filters.mode}
              onChange={(e) => setFilters({ ...filters, mode: e.target.value })}
              className="input"
            >
              <option value="all">All Modes</option>
              {paymentModes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={exportToCSV}
              className="btn-secondary flex w-full items-center justify-center space-x-2 !py-[11px]"
            >
              <Download className="h-4 w-4 stroke-[1.5px]" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Student</th>
                <th>School</th>
                <th>Mode</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mx-auto"></div>
                  </td>
                </tr>
              ) : collections.length > 0 ? (
                collections.map((c, idx) => (
                  <motion.tr 
                    key={c.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <td className="text-secondary font-medium">
                      {format(c.date instanceof Timestamp ? c.date.toDate() : new Date(c.date), 'dd MMM yyyy')}
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-bold text-primary">{c.student_name}</span>
                        <span className="text-[9px] text-secondary font-bold uppercase tracking-widest">{c.fee_type}</span>
                      </div>
                    </td>
                    <td className="text-secondary font-medium">{c.school_name}</td>
                    <td>
                      <span className={cn(
                        "badge",
                        c.payment_mode === 'Cash' ? "badge-warning" : "badge-accent"
                      )}>
                        {c.payment_mode}
                      </span>
                    </td>
                    <td className="text-right font-bold text-primary font-mono">
                      {formatCurrency(c.amount)}
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-secondary font-medium">
                    No fee collections found for this month
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-surface border border-border shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border p-6">
                <div>
                  <h3 className="text-lg font-bold text-primary tracking-tight">Add Fee Record</h3>
                  <p className="text-[10px] text-secondary font-medium">Record a new student fee payment</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="rounded-full p-2 text-secondary hover:bg-border/50 transition-colors"
                >
                  <X className="h-5 w-5 stroke-[1.5px]" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Date</label>
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label">Receipt No</label>
                    <input
                      type="text"
                      value={formData.receipt_no}
                      onChange={(e) => setFormData({ ...formData, receipt_no: e.target.value })}
                      className="input"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="label">Search Student</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input"
                      placeholder="Search by name, school or stand..."
                    />
                    {searchTerm && !selectedStudent && (
                      <div className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {students
                          .filter(s => {
                            const name = s.studentName || '';
                            const school = s.schoolName || '';
                            const stand = s.standName || '';
                            const search = searchTerm.toLowerCase();
                            
                            return name.toLowerCase().includes(search) ||
                                   school.toLowerCase().includes(search) ||
                                   stand.toLowerCase().includes(search);
                          })
                          .slice(0, 10)
                          .map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setSelectedStudent(s);
                                setSearchTerm(s.studentName);
                                setFormData({
                                  ...formData,
                                  student_name: s.studentName,
                                  school_name: s.schoolName
                                });
                              }}
                              className="w-full px-4 py-2 text-left hover:bg-accent/5 transition-colors border-b border-border/50 last:border-0"
                            >
                              <p className="text-sm font-bold text-primary">{s.studentName}</p>
                              <p className="text-[10px] text-secondary">{s.schoolName} • {s.standName} • {s.class}</p>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {selectedStudent && (
                  <div className="bg-accent/5 p-4 rounded-2xl border border-accent/10 space-y-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Selected Student</p>
                        <p className="text-sm font-black text-primary">{selectedStudent.studentName}</p>
                        <p className="text-[10px] text-secondary">{selectedStudent.schoolName} • {selectedStudent.standName}</p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          setSelectedStudent(null);
                          setSearchTerm('');
                          setFormData({ ...formData, student_name: '', school_name: '' });
                        }}
                        className="text-[10px] font-bold text-danger hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="pt-2 mt-2 border-t border-accent/10">
                      <p className="text-[10px] text-secondary">Outstanding Balance: <span className="font-bold text-danger">{formatCurrency(selectedStudent.totalBalance)}</span></p>
                    </div>
                  </div>
                )}

                {!selectedStudent && (
                  <>
                    <div className="space-y-2">
                      <label className="label">Student Name (Manual)</label>
                      <input
                        type="text"
                        required
                        value={formData.student_name}
                        onChange={(e) => setFormData({ ...formData, student_name: e.target.value })}
                        className="input"
                        placeholder="Full name"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="label">School Name (Manual)</label>
                      <select
                        required
                        value={formData.school_name}
                        onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                        className="input"
                      >
                        <option value="">Select School</option>
                        {schools.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Amount (₹)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      required
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })}
                      className="input font-mono"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label">Payment Mode</label>
                    <select
                      required
                      value={formData.payment_mode}
                      onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value as any })}
                      className="input"
                    >
                      {paymentModes.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="label">Fee Type</label>
                    <select
                      required
                      value={formData.fee_type}
                      onChange={(e) => setFormData({ ...formData, fee_type: e.target.value })}
                      className="input"
                    >
                      {feeTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="label">Collected By</label>
                    <select
                      required
                      value={formData.received_by}
                      onChange={(e) => setFormData({ ...formData, received_by: e.target.value })}
                      className="input"
                    >
                      <option value="">Select Collector</option>
                      {collectors.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="label">Handled By (Cash Balance)</label>
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

                <div className="space-y-2">
                  <label className="label">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input min-h-[80px] py-3"
                    placeholder="Any additional details..."
                  />
                </div>

                <div className="pt-4 border-t border-border">
                  <button
                    type="submit"
                    className="btn-primary w-full flex items-center justify-center space-x-2 !py-4"
                  >
                    <Save className="h-4 w-4 stroke-[1.5px]" />
                    <span>Save Fee Record</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
