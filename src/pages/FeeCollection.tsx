import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { writeBatch, doc, getDoc, increment, limit, collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, Timestamp, getDocs } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Plus, 
  Download, 
  X, 
  Save,
  GraduationCap,
  School,
  CreditCard,
  Edit2,
  Calendar,
  Filter,
  ChevronDown,
  Search,
  FileText,
  Trash2,
  MessageCircle
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { FeeCollection, Student, Receipt, Invoice, Organization, Profile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { logActivity } from '../lib/activity-logger';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  applyPaymentToInvoices, 
  revertPaymentFromInvoices,
  reallocatePayment
} from '../lib/invoice-utils';
import { amountToWordsIndian } from '../lib/number-utils';
import { generateReceiptPDF } from '../lib/pdf-service';

import { useAuth } from '../contexts/AuthContext';

export function FeeCollectionPage() {
  const { profile } = useAuth();
  const [collections, setCollections] = useState<FeeCollection[]>([]);
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [accountants, setAccountants] = useState<Profile[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<FeeCollection | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<FeeCollection | null>(null);
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
    getDoc(doc(db, 'settings', 'organization')).then(snap => {
      if (snap.exists()) setOrg(snap.data() as Organization);
    });
  }, []);

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
    dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    dateTo: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    school: 'all',
    mode: 'all',
    receivedBy: 'all',
    collector: 'all'
  });

  useEffect(() => {
    if (profile?.role === 'accountant') {
      setFilters(prev => ({ ...prev, receivedBy: profile.id }));
    } else {
      setFilters(prev => ({ ...prev, receivedBy: 'all' }));
    }
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    const fetchAccountants = async () => {
      try {
        const q = query(collection(db, 'profiles'), where('role', 'in', ['accountant', 'admin', 'developer']));
        const snap = await getDocs(q);
        setAccountants(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile)));
      } catch (error) {
        console.error('Error fetching accountants:', error);
      }
    };
    fetchAccountants();
  }, []);

  const feeTypes = ["Sunday Fee Collection", "Regular Fee", "Annual Fee", "Other"];
  const paymentModes = ["Cash", "Online", "Cheque"];
  const schools = ["RNSN", "Rosary", "Apex B-2", "Other"];
  const collectors = ["Dhruv", "Jai", "KSR", "Other"];

  useEffect(() => {
    setLoading(true);
    const start = Timestamp.fromDate(new Date(filters.dateFrom));
    const end = Timestamp.fromDate(new Date(filters.dateTo + 'T23:59:59'));

    let q = query(
      collection(db, 'fee_collections'),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'desc')
    );

    if (profile?.role === 'accountant') {
      q = query(q, where('createdBy.userId', '==', profile.id));
    }

    const unsubscribe = onSnapshot(q, (snap) => {
      let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeCollection));

      if (filters.school !== 'all') {
        list = list.filter(c => c.school_name === filters.school);
      }
      if (filters.mode !== 'all') {
        list = list.filter(c => c.payment_mode === filters.mode);
      }
      if (filters.collector !== 'all') {
        list = list.filter(c => c.received_by === filters.collector);
      }
      if (filters.receivedBy === 'owner') {
        list = list.filter(c => c.createdBy?.role === 'owner');
      } else if (filters.receivedBy !== 'all' && filters.receivedBy !== 'owner') {
        list = list.filter(c => c.createdBy?.userId === filters.receivedBy);
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
      const feeRef = editingCollection 
        ? doc(db, 'fee_collections', editingCollection.id)
        : doc(collection(db, 'fee_collections'));

      let receiptId = editingCollection?.receipt_id || null;
      let receiptNumberStr = editingCollection?.receipt_number || null;

      // If it's a new record and a student is selected, prepare the receipt info
      if (!editingCollection && selectedStudent) {
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
        receiptNumberStr = `RCP-${(lastNum + 1).toString().padStart(6, '0')}`;
        receiptId = doc(collection(db, 'receipts')).id;
      }
      
      const txData = {
        ...formData,
        student_id: selectedStudent?.id || null,
        receipt_id: receiptId,
        receipt_number: receiptNumberStr,
        date: Timestamp.fromDate(new Date(formData.date)),
        data_entry_by: auth.currentUser?.email?.split('@')[0] || 'Unknown',
        recorded_by: auth.currentUser?.uid,
        createdBy: {
          userId: profile?.id || auth.currentUser?.uid || 'unknown',
          name: profile?.full_name || 'Unknown',
          role: profile?.role === 'admin' || profile?.role === 'developer' ? 'owner' : 'accountant'
        },
        updated_at: serverTimestamp(),
        ...(editingCollection ? {} : { created_at: serverTimestamp() })
      };

      if (editingCollection) {
        batch.update(feeRef, txData);
      } else {
        batch.set(feeRef, txData);
      }

      // If a student is selected, update their balance and create/update a receipt
      if (selectedStudent) {
        if (editingCollection) {
          // 1. Reallocate payment across invoices correctly (handles stale data internally)
          let oldLinkedInvoices = [];
          if (editingCollection.receipt_id) {
            const oldReceiptSnap = await getDoc(doc(db, 'receipts', editingCollection.receipt_id));
            if (oldReceiptSnap.exists()) {
              const oldReceipt = oldReceiptSnap.data() as Receipt;
              oldLinkedInvoices = oldReceipt.linkedInvoices || [];
            }
          }

          const linkedInvoices = await reallocatePayment(
            batch, 
            selectedStudent.id, 
            oldLinkedInvoices, 
            formData.amount
          );
          
          // 3. Update student balance (revert old, apply new)
          const oldAmount = editingCollection.amount || 0;
          const oldStudentId = editingCollection.student_id;
          
          if (oldStudentId && oldStudentId !== selectedStudent.id) {
            // Student changed: Revert old, apply new to different students
            batch.update(doc(db, 'students', oldStudentId), {
              totalBalance: increment(oldAmount)
            });
            batch.update(doc(db, 'students', selectedStudent.id), {
              totalBalance: increment(-formData.amount)
            });
          } else {
            // Same student: Just update the difference
            const balanceDiff = formData.amount - oldAmount;
            if (balanceDiff !== 0) {
              batch.update(doc(db, 'students', selectedStudent.id), {
                totalBalance: increment(-balanceDiff)
              });
            }
          }

          // 4. Update the receipt
          const receiptRef = doc(db, 'receipts', receiptId!);
          const monthsPaid = linkedInvoices.filter(li => li.invoiceId !== 'ADVANCE').map(li => li.month);
          const uniqueMonths = [...new Set(monthsPaid)];
          const hasAdvance = linkedInvoices.some(li => li.invoiceId === 'ADVANCE');
          let description = uniqueMonths.length > 0 ? `Fees for ${uniqueMonths.join(', ')}` : 'Transport Fees';
          if (hasAdvance) description += uniqueMonths.length > 0 ? ' (incl. Advance)' : 'Advance Payment';
          if (formData.notes) description = formData.notes;

          batch.set(receiptRef, {
            receiptNumber: receiptNumberStr,
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
            updatedAt: serverTimestamp(),
            createdAt: editingCollection.created_at || serverTimestamp()
          });

          // Timeline
          const timelineRef = doc(collection(db, 'students', selectedStudent.id, 'timeline'));
          batch.set(timelineRef, {
            event: 'Fee Adjusted',
            description: `Fee record updated. Amount: ₹${oldAmount} -> ₹${formData.amount}. Invoices recalculated.`,
            createdBy: profile?.full_name || 'System',
            createdAt: serverTimestamp()
          });
        } else {
          // Apply payment to invoices using FIFO for NEW records
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
          const receiptRef = doc(db, 'receipts', receiptId!);
          
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
            receiptNumber: receiptNumberStr,
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
      }

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          editingCollection ? 'Edited' : 'Created',
          'Fee Collection',
          `${editingCollection ? 'Updated' : 'Collected'} ${formatCurrency(formData.amount)} from ${formData.student_name} (${formData.school_name})`
        );
      }

      // Update Cash Transaction
      const cashQ = query(
        collection(db, 'cash_transactions'),
        where('category', '==', 'fee_collection'),
        where('linked_id', '==', feeRef.id)
      );
      const cashSnap = await getDocs(cashQ);

      if (formData.payment_mode === 'Cash') {
        const cashData = {
          date: formData.date,
          type: 'in',
          category: 'fee_collection',
          amount: formData.amount,
          description: `Fee Collection: ${formData.student_name} (${formData.fee_type}) - ${formData.school_name}`,
          linked_id: feeRef.id,
          paid_by: formData.paid_by,
          created_by: auth.currentUser?.uid,
          updated_at: serverTimestamp(),
          source: 'fee_collection'
        };

        if (cashSnap.empty) {
          const cashRef = doc(collection(db, 'cash_transactions'));
          batch.set(cashRef, { ...cashData, created_at: serverTimestamp() });
        } else {
          // Identify and update/consolidate duplicate cash transactions if any
          cashSnap.docs.forEach((docSnap, index) => {
            if (index === 0) {
              batch.update(docSnap.ref, cashData);
            } else {
              // Delete any accidentally created duplicates
              batch.delete(docSnap.ref);
            }
          });
        }
      } else if (!cashSnap.empty) {
        // If it was cash before but now it's online/cheque, delete all linked cash records
        cashSnap.docs.forEach(docSnap => batch.delete(docSnap.ref));
      }

      await batch.commit();

      setIsModalOpen(false);
      setEditingCollection(null);
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
    link.setAttribute("download", `fee_collections_${filters.dateFrom}_to_${filters.dateTo}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEdit = (collection: FeeCollection) => {
    setEditingCollection(collection);
    const selected = students.find(s => s.id === collection.student_id) || 
                    students.find(s => s.studentName === collection.student_name);
    setSelectedStudent(selected || null);
    setSearchTerm(collection.student_name);
    setFormData({
      date: format(collection.date instanceof Timestamp ? collection.date.toDate() : new Date(collection.date), 'yyyy-MM-dd'),
      student_name: collection.student_name,
      receipt_no: collection.receipt_no || '',
      school_name: collection.school_name,
      received_by: collection.received_by || '',
      amount: collection.amount,
      payment_mode: collection.payment_mode,
      fee_type: collection.fee_type,
      notes: collection.notes || '',
      paid_by: collection.paid_by || (profile?.role === 'admin' ? 'owner' : 'accountant')
    });
    setIsModalOpen(true);
  };

  const handleDownloadReceipt = async (feeEntry: FeeCollection) => {
    setLoading(true);
    let receiptData: Receipt | null = null;
    
    try {
      // 1. Try by receipt_id
      if (feeEntry.receipt_id) {
        const receiptSnap = await getDoc(doc(db, 'receipts', feeEntry.receipt_id));
        if (receiptSnap.exists()) {
          receiptData = { id: receiptSnap.id, ...receiptSnap.data() } as Receipt;
        }
      }

      // 2. Try searching by receipt number if still null
      if (!receiptData && (feeEntry.receipt_number || feeEntry.receipt_no)) {
        const rcpNum = feeEntry.receipt_number || feeEntry.receipt_no;
        const q = query(
          collection(db, 'receipts'),
          where('receiptNumber', '==', rcpNum),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          receiptData = { id: snap.docs[0].id, ...docData } as Receipt;
        }
      }

      // 3. Fallback: Construct a virtual receipt object from the collection data (for legacy records)
      if (!receiptData) {
        const student = students.find(s => s.id === feeEntry.student_id) || 
                       students.find(s => s.studentName === feeEntry.student_name);
        
        receiptData = {
          id: 'VIRTUAL-' + feeEntry.id,
          receiptNumber: feeEntry.receipt_number || feeEntry.receipt_no || 'N/A',
          studentId: feeEntry.student_id || student?.id || 'N/A',
          studentName: feeEntry.student_name,
          fatherName: student?.fatherName || 'N/A',
          address: student?.address || 'N/A',
          phoneNumber: student?.phoneNumber || 'N/A',
          paymentDate: feeEntry.date,
          paymentMode: feeEntry.payment_mode,
          feeType: feeEntry.fee_type,
          receivedBy: feeEntry.received_by || 'System',
          amountReceived: feeEntry.amount,
          amountInWords: amountToWordsIndian(feeEntry.amount),
          description: feeEntry.notes || feeEntry.fee_type,
          createdAt: feeEntry.date,
          linkedInvoices: []
        } as Receipt;
      }

      // 4. Find linked invoice for the PDF (reusing logic from InvoiceReceipt.tsx)
      let inv: Invoice | undefined;
      if (receiptData.invoiceId && receiptData.invoiceId !== 'N/A') {
        const invSnap = await getDoc(doc(db, 'invoices', receiptData.invoiceId));
        if (invSnap.exists()) {
          inv = { id: invSnap.id, ...invSnap.data() } as Invoice;
        }
      }

      if (!inv) {
        // Same fallback used in Receipts tab
        inv = {
          invoiceNumber: receiptData.invoiceNumber || 'N/A',
          invoiceDate: receiptData.paymentDate,
          totalAmount: receiptData.amountReceived || 0,
          paidAmount: receiptData.amountReceived || 0,
          balanceDue: 0,
        } as any;
      }

      // Get organization info
      let orgData = org;
      if (!orgData) {
        const orgSnap = await getDoc(doc(db, 'settings', 'organization'));
        if (orgSnap.exists()) {
          orgData = orgSnap.data() as Organization;
          setOrg(orgData);
        }
      }

      const defaultOrg: Organization = {
        name: 'Jagriti Tours & Travels',
        address_line1: 'E-10, Gali No-6, Tomar Colony, Burari',
        address_line2: 'Delhi',
        zip_code: '110084',
        phone: '9811387399',
        website: 'www.jagrititoursandtravels.com',
        email: 'jagrititours@gmail.com'
      };

      const organization = orgData || defaultOrg;

      generateReceiptPDF(receiptData, inv, organization).save(`${receiptData.receiptNumber || 'receipt'}.pdf`);
    } catch (error) {
      console.error('Error downloading receipt:', error);
      alert('Failed to generate receipt PDF.');
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsApp = async (feeEntry: FeeCollection) => {
    const student = students.find(s => s.id === feeEntry.student_id) || 
                   students.find(s => s.studentName === feeEntry.student_name);
    if (!student || !student.phoneNumber) {
      alert('Student phone number not found.');
      return;
    }

    const phone = student.phoneNumber.replace(/\D/g, '');
    const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;
    
    // Construct message to match InvoiceReceipt.tsx format
    const desc = feeEntry.notes || feeEntry.fee_type || 'Transport Fees';
    const message = `Dear ${student.fatherName}, Payment of ₹${feeEntry.amount} received for ${feeEntry.student_name} against ${desc}. Receipt No: [${feeEntry.receipt_number || feeEntry.receipt_no || 'N/A'}]. Thank you. - Jagriti Tours & Travels`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${formattedPhone}?text=${encodedMessage}`, '_blank');
  };

  const handleDelete = (feeEntry: FeeCollection) => {
    if (profile?.role !== 'admin' && profile?.role !== 'developer') {
      alert('Only administrators can delete fee records.');
      return;
    }
    setEntryToDelete(feeEntry);
  };

  const confirmDelete = async () => {
    if (!entryToDelete) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Revert from invoices
      if (entryToDelete.receipt_id) {
        const receiptSnap = await getDoc(doc(db, 'receipts', entryToDelete.receipt_id));
        if (receiptSnap.exists()) {
          const receipt = receiptSnap.data() as Receipt;
          if (receipt.linkedInvoices && receipt.linkedInvoices.length > 0) {
            await revertPaymentFromInvoices(batch, receipt.linkedInvoices);
          }
          // Delete receipt
          batch.delete(doc(db, 'receipts', entryToDelete.receipt_id));
        }
      }

      // 2. Revert student balance
      if (entryToDelete.student_id) {
        batch.update(doc(db, 'students', entryToDelete.student_id), {
          totalBalance: increment(entryToDelete.amount)
        });

        // Timeline
        const timelineRef = doc(collection(db, 'students', entryToDelete.student_id, 'timeline'));
        batch.set(timelineRef, {
          event: 'Fee Deleted',
          description: `Fee record for ${formatCurrency(entryToDelete.amount)} was deleted. Balance reverted.`,
          createdBy: profile?.full_name || 'System',
          createdAt: serverTimestamp()
        });
      }

      // 3. Delete cash transaction
      const cashQ = query(
        collection(db, 'cash_transactions'),
        where('category', '==', 'fee_collection'),
        where('linked_id', '==', entryToDelete.id)
      );
      const cashSnap = await getDocs(cashQ);
      cashSnap.forEach(d => batch.delete(d.ref));

      // 4. Delete fee record
      batch.delete(doc(db, 'fee_collections', entryToDelete.id));

      await batch.commit();
      
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Deleted',
          'Fee Collection',
          `Deleted fee record of ${formatCurrency(entryToDelete.amount)} for ${entryToDelete.student_name}`
        );
      }
      setEntryToDelete(null);
    } catch (error) {
      console.error('Error deleting fee record:', error);
      alert('Failed to delete fee record.');
    } finally {
      setLoading(false);
    }
  };

  const filteredCollections = collections.filter(c => 
    c.student_name.toLowerCase().includes(listSearchQuery.toLowerCase())
  );

  const totalFees = filteredCollections.reduce((acc, c) => acc + c.amount, 0);
  const cashFees = filteredCollections.filter(c => c.payment_mode === 'Cash').reduce((acc, c) => acc + c.amount, 0);
  const onlineFees = filteredCollections.filter(c => c.payment_mode === 'Online').reduce((acc, c) => acc + c.amount, 0);

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
            <p className="text-[10px] text-secondary font-medium mt-1">{filteredCollections.length} Records shown</p>
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="space-y-2 lg:col-span-2">
            <label className="label">Search Student</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name..."
                value={listSearchQuery}
                onChange={(e) => setListSearchQuery(e.target.value)}
                className="input pl-10"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary pointer-events-none" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="label">Date From</label>
            <div className="relative">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="input pr-10"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary pointer-events-none" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="label">Date To</label>
            <div className="relative">
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
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
          <div className="space-y-2">
            <label className="label">Received By</label>
            <select
              value={filters.receivedBy}
              onChange={(e) => setFilters({ ...filters, receivedBy: e.target.value })}
              className="input"
              disabled={profile?.role === 'accountant'}
            >
              <option value="all">All</option>
              <option value="owner">Owner</option>
              {accountants.filter(acc => acc.role === 'accountant').map(acc => (
                <option key={acc.id} value={acc.id}>{acc.full_name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="label">Collector</label>
            <select
              value={filters.collector}
              onChange={(e) => setFilters({ ...filters, collector: e.target.value })}
              className="input"
            >
              <option value="all">All Collectors</option>
              {collectors.map(c => <option key={c} value={c}>{c}</option>)}
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
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mx-auto"></div>
                  </td>
                </tr>
              ) : filteredCollections.length > 0 ? (
                filteredCollections.map((c, idx) => (
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
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleDelete(c)}
                          title="Delete Record"
                          className="p-2 text-secondary hover:text-danger transition-colors"
                        >
                          <Trash2 className="h-4 w-4 stroke-[1.5px]" />
                        </button>
                        <button
                          onClick={() => handleWhatsApp(c)}
                          title="Share on WhatsApp"
                          className="p-2 text-secondary hover:text-success transition-colors"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadReceipt(c)}
                          title="Download Receipt"
                          className="p-2 text-secondary hover:text-accent transition-colors"
                        >
                          <FileText className="h-4 w-4 stroke-[1.5px]" />
                        </button>
                        <button
                          onClick={() => handleEdit(c)}
                          title="Edit Record"
                          className="p-2 text-secondary hover:text-accent transition-colors"
                        >
                          <Edit2 className="h-4 w-4 stroke-[1.5px]" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-secondary font-medium">
                    No fee collections found for selected range
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
                  <h3 className="text-lg font-bold text-primary tracking-tight">
                    {editingCollection ? 'Edit Fee Record' : 'Add Fee Record'}
                  </h3>
                  <p className="text-[10px] text-secondary font-medium">
                    {editingCollection ? 'Modify an existing fee record' : 'Record a new student fee payment'}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingCollection(null);
                  }} 
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {entryToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface max-w-md w-full rounded-3xl shadow-2xl border border-border p-8"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-16 w-16 rounded-2xl bg-danger/10 flex items-center justify-center text-danger">
                  <Trash2 className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Are you sure?</h3>
                  <p className="text-sm text-secondary mt-2">
                    This will delete the fee record for <span className="font-bold text-primary">{entryToDelete.student_name}</span>. 
                    Linked invoices will be recalculated and the student's balance will be reverted.
                  </p>
                </div>
                <div className="flex w-full gap-3 pt-4">
                  <button
                    onClick={() => setEntryToDelete(null)}
                    disabled={loading}
                    className="btn-secondary flex-1 !py-3"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={loading}
                    className="btn-danger flex-1 !py-3 shadow-lg shadow-danger/20"
                  >
                    {loading ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
