import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  serverTimestamp, 
  limit,
  where,
  doc,
  updateDoc,
  increment,
  Timestamp
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { formatCurrency, cn } from '../lib/utils';
import { Student, StudentComment, StudentTimelineEvent, StudentTransaction, Invoice, Receipt, Organization } from '../types';
import { 
  X, 
  Edit2, 
  Plus, 
  MessageSquare, 
  History, 
  CreditCard, 
  LayoutDashboard,
  ChevronDown,
  FileText,
  CheckCircle2,
  SkipForward,
  Send,
  Calendar,
  User,
  Phone,
  MapPin,
  School,
  Route,
  Clock,
  Download,
  MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { generateStatementPDF } from '../lib/pdf-service';

interface StudentProfileModalProps {
  student: Student;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (student: Student) => void;
}

type TabType = 'overview' | 'comments' | 'transactions' | 'statement' | 'timeline';

export function StudentProfileModal({ student, isOpen, onClose, onEdit }: StudentProfileModalProps) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [comments, setComments] = useState<StudentComment[]>([]);
  const [timeline, setTimeline] = useState<StudentTimelineEvent[]>([]);
  const [transactions, setTransactions] = useState<StudentTransaction[]>([]);
  const [studentInvoices, setStudentInvoices] = useState<Invoice[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [dateRange, setDateRange] = useState({
    start: subMonths(new Date(), 6),
    end: new Date()
  });
  const [newComment, setNewComment] = useState('');
  const [isTransactionMenuOpen, setIsTransactionMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !student.id) return;

    const commentsQuery = query(
      collection(db, 'students', student.id, 'comments'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
      setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudentComment)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `students/${student.id}/comments`);
    });

    const timelineQuery = query(
      collection(db, 'students', student.id, 'timeline'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeTimeline = onSnapshot(timelineQuery, (snapshot) => {
      setTimeline(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudentTimelineEvent)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `students/${student.id}/timeline`);
    });

    const transactionsQuery = query(
      collection(db, 'students', student.id, 'transactions'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudentTransaction)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `students/${student.id}/transactions`);
    });

    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('studentId', '==', student.id),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeInvoices = onSnapshot(invoicesQuery, (snapshot) => {
      setStudentInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    });

    const unsubscribeOrg = onSnapshot(doc(db, 'settings', 'organization'), (snapshot) => {
      if (snapshot.exists()) setOrg(snapshot.data() as Organization);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/organization');
    });

    return () => {
      unsubscribeComments();
      unsubscribeTimeline();
      unsubscribeTransactions();
      unsubscribeInvoices();
      unsubscribeOrg();
    };
  }, [isOpen, student.id]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !profile) return;

    try {
      await addDoc(collection(db, 'students', student.id, 'comments'), {
        text: newComment.trim(),
        createdBy: profile.full_name,
        createdAt: serverTimestamp()
      });
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleTransaction = async (type: 'invoice' | 'receipt' | 'skip') => {
    if (!profile) return;
    setLoading(true);
    setIsTransactionMenuOpen(false);

    try {
      const amount = type === 'invoice' ? student.feeAmount - student.concession : 0;
      const month = format(new Date(), 'MMMM yyyy');
      
      if (type === 'skip') {
        await addDoc(collection(db, 'students', student.id, 'skippedMonths'), {
          month,
          reason: 'Manually skipped',
          skippedBy: profile.full_name,
          skippedAt: serverTimestamp()
        });
      }

      const transactionData = {
        type,
        month,
        amount,
        status: type === 'invoice' ? 'unpaid' : 'paid',
        invoiceNo: type === 'invoice' ? `INV-${Date.now().toString().slice(-6)}` : '',
        createdAt: serverTimestamp(),
        createdBy: profile.full_name
      };

      await addDoc(collection(db, 'students', student.id, 'transactions'), transactionData);

      // Add to timeline
      await addDoc(collection(db, 'students', student.id, 'timeline'), {
        event: type === 'invoice' ? 'Invoice Raised' : type === 'receipt' ? 'Payment Recorded' : 'Month Skipped',
        description: `${type === 'invoice' ? 'Invoice' : type === 'receipt' ? 'Payment' : 'Skip'} for ${month}`,
        createdBy: profile.full_name,
        createdAt: serverTimestamp()
      });

      // Update student balance if needed
      if (type === 'invoice') {
        await updateDoc(doc(db, 'students', student.id), {
          totalBalance: increment(amount)
        });
      }

    } catch (error) {
      console.error('Error recording transaction:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mock data for chart (last 6 months collections)
  const chartData = [
    { month: 'Oct', amount: 1200 },
    { month: 'Nov', amount: 1500 },
    { month: 'Dec', amount: 1100 },
    { month: 'Jan', amount: 1800 },
    { month: 'Feb', amount: 1400 },
    { month: 'Mar', amount: 1600 },
  ];

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (date instanceof Timestamp) return format(date.toDate(), 'MMM dd, yyyy');
    if (date instanceof Date) return format(date, 'MMM dd, yyyy');
    try {
      return format(new Date(date), 'MMM dd, yyyy');
    } catch (e) {
      return 'N/A';
    }
  };

  const formatDateTime = (date: any) => {
    if (!date) return 'Just now';
    if (date instanceof Timestamp) return format(date.toDate(), 'MMM dd, yyyy • hh:mm a');
    if (date instanceof Date) return format(date, 'MMM dd, yyyy • hh:mm a');
    try {
      return format(new Date(date), 'MMM dd, yyyy • hh:mm a');
    } catch (e) {
      return 'Just now';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 backdrop-blur-sm p-0 md:p-4">
        <motion.div
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          className="bg-surface w-full h-full md:max-w-6xl md:h-[90vh] md:rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4 bg-accent/5">
            <div className="flex items-center space-x-4">
              <div className="h-14 w-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent text-2xl font-black">
                {student.studentName.charAt(0)}
              </div>
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-primary tracking-tight">{student.studentName}</h2>
                <div className="flex items-center space-x-2">
                  <span className={cn(
                    "badge text-[10px]",
                    student.isActive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  )}>
                    {student.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-xs text-secondary font-medium">Joined {formatDate(student.dateOfJoining)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3 bg-background/50 px-4 py-2 rounded-2xl border border-border/50">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Status</span>
                  <span className={cn("text-xs font-black", student.isActive ? "text-success" : "text-danger")}>
                    {student.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative cursor-default",
                    student.isActive ? "bg-success" : "bg-border"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                    student.isActive ? "left-7" : "left-1"
                  )} />
                </div>
              </div>

              <div className="h-8 w-px bg-border hidden md:block" />

              <div className="flex items-center space-x-3">
              <button
                onClick={() => onEdit(student)}
                className="btn-secondary flex items-center space-x-2"
              >
                <Edit2 className="h-4 w-4" />
                <span className="hidden sm:inline">Edit</span>
              </button>

              <div className="relative">
                <button
                  onClick={() => setIsTransactionMenuOpen(!isTransactionMenuOpen)}
                  className="btn-primary flex items-center space-x-2 shadow-lg shadow-accent/20"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Transaction</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", isTransactionMenuOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isTransactionMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-2xl shadow-xl z-50 overflow-hidden"
                    >
                      <button 
                        onClick={() => handleTransaction('invoice')}
                        className="w-full px-4 py-3 text-left hover:bg-accent/5 flex items-center space-x-3 text-sm font-bold text-primary transition-colors"
                      >
                        <FileText className="h-4 w-4 text-accent" />
                        <span>🧾 Raise Invoice</span>
                      </button>
                      <button 
                        onClick={() => handleTransaction('receipt')}
                        className="w-full px-4 py-3 text-left hover:bg-accent/5 flex items-center space-x-3 text-sm font-bold text-primary transition-colors border-t border-border/50"
                      >
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span>✅ Record Payment</span>
                      </button>
                      <button 
                        onClick={() => handleTransaction('skip')}
                        className="w-full px-4 py-3 text-left hover:bg-accent/5 flex items-center space-x-3 text-sm font-bold text-primary transition-colors border-t border-border/50"
                      >
                        <SkipForward className="h-4 w-4 text-warning" />
                        <span>⏭️ Skip This Month</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-border/50 rounded-xl transition-colors"
              >
                <X className="h-6 w-6 text-secondary" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Panel */}
            <div className="w-full md:w-80 border-r border-border bg-background/30 p-6 space-y-8 overflow-y-auto">
              <section className="space-y-4">
                <h4 className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">Contact Information</h4>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <User className="h-4 w-4 text-secondary mt-0.5" />
                    <div>
                      <p className="text-xs text-secondary font-medium">Father's Name</p>
                      <p className="text-sm font-bold text-primary">{student.fatherName}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Phone className="h-4 w-4 text-secondary mt-0.5" />
                    <div>
                      <p className="text-xs text-secondary font-medium">Phone Number</p>
                      <p className="text-sm font-bold text-primary font-mono">{student.phoneNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <MapPin className="h-4 w-4 text-secondary mt-0.5" />
                    <div>
                      <p className="text-xs text-secondary font-medium">Address</p>
                      <p className="text-sm font-bold text-primary leading-relaxed">{student.address}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h4 className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">Academic & Route</h4>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <School className="h-4 w-4 text-secondary mt-0.5" />
                    <div>
                      <p className="text-xs text-secondary font-medium">School</p>
                      <p className="text-sm font-bold text-primary">{student.schoolName}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Route className="h-4 w-4 text-secondary mt-0.5" />
                    <div>
                      <p className="text-xs text-secondary font-medium">Stand / Route</p>
                      <p className="text-sm font-bold text-primary">{student.standName}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <LayoutDashboard className="h-4 w-4 text-secondary mt-0.5" />
                    <div>
                      <p className="text-xs text-secondary font-medium">Class</p>
                      <p className="text-sm font-bold text-primary">{student.class}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Calendar className="h-4 w-4 text-secondary mt-0.5" />
                    <div>
                      <p className="text-xs text-secondary font-medium">Session</p>
                      <p className="text-sm font-bold text-accent">{student.session}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h4 className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">Dates</h4>
                <div className="flex items-start space-x-3">
                  <Calendar className="h-4 w-4 text-secondary mt-0.5" />
                  <div>
                    <p className="text-xs text-secondary font-medium">Date of Joining</p>
                    <p className="text-sm font-bold text-primary">
                      {formatDate(student.dateOfJoining)}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Right Panel Summary (Visible on top of tabs on mobile) */}
              <div className="p-6 bg-surface border-b border-border grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Outstanding Balance</p>
                  <p className={cn(
                    "text-2xl font-black font-mono",
                    student.totalBalance > 0 ? "text-danger" : "text-success"
                  )}>
                    {formatCurrency(student.totalBalance)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Monthly Fee</p>
                  <p className="text-2xl font-black text-primary font-mono">{formatCurrency(student.feeAmount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Concession</p>
                  <p className="text-2xl font-black text-success font-mono">{formatCurrency(student.concession)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Last Payment</p>
                  <p className="text-lg font-bold text-primary">Mar 15, 2024</p>
                </div>
              </div>

              {/* Tabs Navigation */}
              <div className="px-6 border-b border-border flex items-center space-x-8 overflow-x-auto scrollbar-hide">
                {[
                  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                  { id: 'comments', label: 'Comments', icon: MessageSquare },
                  { id: 'transactions', label: 'Transactions', icon: CreditCard },
                  { id: 'statement', label: 'Statement', icon: FileText },
                  { id: 'timeline', label: 'Timeline', icon: History },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={cn(
                      "flex items-center space-x-2 py-4 border-b-2 transition-all relative",
                      activeTab === tab.id 
                        ? "border-accent text-accent" 
                        : "border-transparent text-secondary hover:text-primary"
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    <span className="text-sm font-bold">{tab.label}</span>
                    {tab.id === 'comments' && comments.length > 0 && (
                      <span className="bg-accent text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                        {comments.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <AnimatePresence mode="wait">
                  {activeTab === 'overview' && (
                    <motion.div
                      key="overview"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="space-y-8"
                    >
                      <div className="card bg-background/50 border-border/50 p-6">
                        <h3 className="text-sm font-black text-primary mb-6 flex items-center space-x-2">
                          <CreditCard className="h-4 w-4 text-accent" />
                          <span>Collection History (Last 6 Months)</span>
                        </h3>
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                              <XAxis 
                                dataKey="month" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 12, fontWeight: 600, fill: '#64748B' }}
                              />
                              <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 12, fontWeight: 600, fill: '#64748B' }}
                                tickFormatter={(value) => `₹${value}`}
                              />
                              <Tooltip 
                                cursor={{ fill: 'rgba(124, 58, 237, 0.05)' }}
                                contentStyle={{ 
                                  borderRadius: '16px', 
                                  border: 'none', 
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                  padding: '12px'
                                }}
                              />
                              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                                {chartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#7C3AED' : '#C4B5FD'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="card bg-accent/5 border-accent/10 p-4">
                          <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Total Paid</p>
                          <p className="text-2xl font-black text-primary">₹8,400</p>
                        </div>
                        <div className="card bg-warning/5 border-warning/10 p-4">
                          <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-1">Months Skipped</p>
                          <p className="text-2xl font-black text-primary">1</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'comments' && (
                    <motion.div
                      key="comments"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="h-full flex flex-col"
                    >
                      <div className="flex-1 space-y-4 mb-6">
                        {comments.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-40 text-secondary">
                            <MessageSquare className="h-12 w-12 opacity-20 mb-2" />
                            <p className="text-sm font-medium">No comments yet</p>
                          </div>
                        ) : (
                          comments.map(comment => (
                            <div key={comment.id} className="card bg-background/50 border-border/50 p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-accent">{comment.createdBy}</span>
                                <span className="text-[10px] text-secondary font-medium">
                                  {formatDateTime(comment.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-primary leading-relaxed">{comment.text}</p>
                            </div>
                          ))
                        )}
                      </div>
                      <form onSubmit={handleAddComment} className="relative">
                        <input
                          type="text"
                          placeholder="Add a comment..."
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          className="input w-full pr-12 bg-background border-border/50 h-12 rounded-2xl"
                        />
                        <button
                          type="submit"
                          disabled={!newComment.trim()}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-accent hover:bg-accent/10 rounded-xl transition-all disabled:opacity-50"
                        >
                          <Send className="h-5 w-5" />
                        </button>
                      </form>
                    </motion.div>
                  )}

                  {activeTab === 'transactions' && (
                    <motion.div
                      key="transactions"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="space-y-4"
                    >
                      {transactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-secondary">
                          <CreditCard className="h-12 w-12 opacity-20 mb-2" />
                          <p className="text-sm font-medium">No transactions recorded</p>
                        </div>
                      ) : (
                        transactions.map(tx => (
                          <div key={tx.id} className="card bg-background/50 border-border/50 p-4 flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center",
                                tx.type === 'invoice' ? "bg-accent/10 text-accent" : 
                                tx.type === 'receipt' ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                              )}>
                                {tx.type === 'invoice' ? <FileText className="h-5 w-5" /> : 
                                 tx.type === 'receipt' ? <CheckCircle2 className="h-5 w-5" /> : <SkipForward className="h-5 w-5" />}
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-black text-primary">
                                    {tx.type === 'invoice' ? `Invoice ${tx.invoiceNo}` : 
                                     tx.type === 'receipt' ? 'Payment Received' : 'Month Skipped'}
                                  </span>
                                  <span className="text-[10px] font-bold text-secondary uppercase tracking-wider bg-background px-2 py-0.5 rounded-md">
                                    {tx.month}
                                  </span>
                                </div>
                                <p className="text-[10px] text-secondary font-medium">
                                  {formatDateTime(tx.createdAt)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-primary">{formatCurrency(tx.amount)}</p>
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest",
                                tx.status === 'paid' ? "text-success" : 
                                tx.status === 'unpaid' ? "text-danger" : "text-warning"
                              )}>
                                {tx.status}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}

                  {activeTab === 'statement' && (
                    <motion.div
                      key="statement"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="space-y-6"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center space-x-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">From</label>
                            <input 
                              type="date" 
                              value={format(dateRange.start, 'yyyy-MM-dd')}
                              onChange={(e) => setDateRange({ ...dateRange, start: new Date(e.target.value) })}
                              className="input py-1 px-3 text-xs bg-background"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">To</label>
                            <input 
                              type="date" 
                              value={format(dateRange.end, 'yyyy-MM-dd')}
                              onChange={(e) => setDateRange({ ...dateRange, end: new Date(e.target.value) })}
                              className="input py-1 px-3 text-xs bg-background"
                            />
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => {
                              if (!org) return;
                              const doc = generateStatementPDF(student, studentInvoices, org, dateRange);
                              doc.save(`Statement_${student.studentName}.pdf`);
                            }}
                            className="btn-secondary py-2 flex items-center space-x-2"
                          >
                            <Download className="h-4 w-4" />
                            <span>PDF</span>
                          </button>
                          <button 
                            onClick={() => {
                              const totalOutstanding = studentInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0);
                              const unpaidCount = studentInvoices.filter(inv => inv.status !== 'PAID').length;
                              const message = `Dear ${student.fatherName}, Please find attached account statement for ${student.studentName}. Total outstanding: ₹${totalOutstanding} (${unpaidCount} months unpaid). Kindly clear dues at earliest. - Jagriti Tours & Travels`;
                              const encodedMessage = encodeURIComponent(message);
                              const whatsappUrl = `https://web.whatsapp.com/send?phone=91${student.phoneNumber}&text=${encodedMessage}`;
                              window.open(whatsappUrl, '_blank');
                              alert('Statement PDF generated. Please download it and attach it to the WhatsApp message.');
                              if (org) {
                                const doc = generateStatementPDF(student, studentInvoices, org, dateRange);
                                doc.save(`Statement_${student.studentName}.pdf`);
                              }
                            }}
                            className="btn-primary py-2 flex items-center space-x-2"
                          >
                            <MessageCircle className="h-4 w-4" />
                            <span>WhatsApp</span>
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto border border-border rounded-2xl">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Invoice No</th>
                              <th>Month</th>
                              <th>Amount</th>
                              <th>Paid</th>
                              <th>Balance</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentInvoices.map(inv => (
                              <tr key={inv.id}>
                                <td className="font-bold text-primary">{inv.invoiceNumber}</td>
                                <td className="text-xs text-secondary">{inv.month}</td>
                                <td className="font-bold text-primary">{formatCurrency(inv.totalAmount)}</td>
                                <td className="text-success">{formatCurrency(inv.paidAmount)}</td>
                                <td className="text-danger font-bold">{formatCurrency(inv.balanceDue)}</td>
                                <td>
                                  <span className={cn(
                                    "badge text-[10px]",
                                    inv.status === 'PAID' ? "bg-success/10 text-success" :
                                    inv.status === 'OVERDUE' ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"
                                  )}>
                                    {inv.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="card bg-accent/5 border-accent/10 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-accent uppercase tracking-widest">Total Outstanding</p>
                          <p className="text-3xl font-black text-primary font-mono">
                            {formatCurrency(studentInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-secondary font-medium italic">"Please clear all dues at earliest. Thank you."</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'timeline' && (
                    <motion.div
                      key="timeline"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="space-y-6 pl-4 border-l-2 border-border/50 ml-2"
                    >
                      {timeline.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-secondary border-l-0 -ml-6">
                          <History className="h-12 w-12 opacity-20 mb-2" />
                          <p className="text-sm font-medium">No activity recorded</p>
                        </div>
                      ) : (
                        timeline.map((event, index) => (
                          <div key={event.id} className="relative">
                            <div className="absolute -left-[25px] top-0 h-4 w-4 rounded-full bg-surface border-2 border-accent" />
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-black text-primary">{event.event}</span>
                                <span className="text-[10px] text-secondary font-medium flex items-center space-x-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{formatDateTime(event.createdAt)}</span>
                                </span>
                              </div>
                              <p className="text-xs text-secondary leading-relaxed">{event.description}</p>
                              <p className="text-[10px] font-bold text-accent uppercase tracking-widest">By {event.createdBy}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
