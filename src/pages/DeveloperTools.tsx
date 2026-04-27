import React, { useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, writeBatch, doc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { Trash2, AlertTriangle, Loader2, CheckCircle2, ShieldAlert, Database, Plus, Users, Bus, Receipt, CreditCard, Calendar, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays } from 'date-fns';
import { cn } from '../lib/utils';

const COLLECTIONS_TO_WIPE = [
  'buses',
  'cash_transactions',
  'company_expenses',
  'daily_records',
  'profiles',
  'salary_records',
  'staff',
  'bus_expenses',
  'fee_collections',
  'accountant_transactions',
  'settings',
  'students',
  'invoices',
  'receipts',
  'activity_logs',
  'schools'
];

export function DeveloperTools() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [activeTab, setActiveTab] = useState<'cleanup' | 'dummy'>('cleanup');

  const wipeData = async () => {
    if (confirmText !== 'DELETE ALL DATA') {
      setError('Please type the confirmation phrase exactly.');
      return;
    }

    setLoading(true);
    setStatus('Initializing cleanup...');
    setError(null);
    setSuccess(false);

    try {
      const currentUserUid = auth.currentUser?.uid;

      for (const collectionName of COLLECTIONS_TO_WIPE) {
        setStatus(`Cleaning up ${collectionName}...`);
        let querySnapshot;
        try {
          querySnapshot = await getDocs(collection(db, collectionName));
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, collectionName);
          continue;
        }
        
        if (querySnapshot.empty) continue;

        const chunks = [];
        const docs = querySnapshot.docs;
        for (let i = 0; i < docs.length; i += 500) {
          chunks.push(docs.slice(i, i + 500));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach((document) => {
            if (collectionName === 'profiles' && document.id === currentUserUid) {
              return;
            }
            batch.delete(doc(db, collectionName, document.id));
          });
          await batch.commit();
        }
      }

      setStatus('Cleanup completed successfully!');
      setSuccess(true);
      setConfirmText('');
    } catch (err: any) {
      console.error('Cleanup error:', err);
      setError(err.message || 'An error occurred during cleanup');
    } finally {
      setLoading(false);
    }
  };

  const generateDummyData = async (type: string) => {
    setLoading(true);
    setStatus(`Generating dummy ${type}...`);
    setError(null);
    setSuccess(false);

    try {
      if (type === 'Employees') {
        const staffRef = collection(db, 'staff');
        const names = ['Amit Kumar', 'Rajesh Singh', 'Suresh Sharma', 'Vijay Yadav', 'Deepak Gupta'];
        for (const name of names) {
          await addDoc(staffRef, {
            full_name: name,
            role: Math.random() > 0.5 ? 'driver' : 'helper',
            fixed_salary: 15000 + Math.floor(Math.random() * 5000),
            is_active: true,
            created_at: new Date().toISOString()
          });
        }
      } else if (type === 'Buses') {
        const busRef = collection(db, 'buses');
        const models = ['Tata Starbus', 'Ashok Leyland', 'Eicher Skyline'];
        for (let i = 1; i <= 5; i++) {
          await addDoc(busRef, {
            registration_number: `UP-14-BT-${1000 + i}`,
            model: models[Math.floor(Math.random() * models.length)],
            capacity: 40 + Math.floor(Math.random() * 20)
          });
        }
      } else if (type === 'Fee Database') {
        const studentRef = collection(db, 'students');
        const schools = ['DPS', 'St. Mary', 'Global Academy'];
        for (let i = 1; i <= 10; i++) {
          await addDoc(studentRef, {
            studentName: `Student ${i}`,
            fatherName: `Father ${i}`,
            phoneNumber: `987654321${i}`,
            schoolName: schools[Math.floor(Math.random() * schools.length)],
            standName: `Stand ${Math.floor(Math.random() * 5) + 1}`,
            class: `${Math.floor(Math.random() * 12) + 1}`,
            address: `Address ${i}, City`,
            dateOfJoining: serverTimestamp(),
            feeAmount: 2000 + Math.floor(Math.random() * 1000),
            concession: 0,
            oldBalance: 0,
            totalBalance: 0,
            isActive: true,
            session: '2025-26',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } else if (type === 'Monthly Entry') {
        const busesSnap = await getDocs(collection(db, 'buses'));
        const staffSnap = await getDocs(collection(db, 'staff'));
        const schoolsSnap = await getDocs(collection(db, 'schools'));
        
        if (busesSnap.empty || staffSnap.empty) {
          throw new Error('Please generate Buses and Employees first!');
        }

        const buses = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const staff = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const schools = schoolsSnap.docs.map(doc => doc.data().name);
        const drivers = staff.filter((s: any) => s.role === 'driver');
        const helpers = staff.filter((s: any) => s.role === 'helper');

        if (drivers.length === 0) throw new Error('No drivers found. Please generate Employees first.');

        const dailyRecordsRef = collection(db, 'daily_records');
        const today = new Date();
        
        // Generate for last 60 days
        for (let i = 0; i < 60; i++) {
          const currentDate = subDays(today, i);
          const dateStr = format(currentDate, 'yyyy-MM-dd');
          const isSunday = currentDate.getDay() === 0;

          // Use a batch for each day to be more efficient
          const batch = writeBatch(db);
          let count = 0;

          for (const bus of buses) {
            const driver = drivers[Math.floor(Math.random() * drivers.length)];
            const helper = helpers.length > 0 ? helpers[Math.floor(Math.random() * helpers.length)] : null;
            const schoolMorning = schools.length > 0 ? schools[Math.floor(Math.random() * schools.length)] : 'Morning Route';
            const schoolEvening = schools.length > 0 ? schools[Math.floor(Math.random() * schools.length)] : 'Evening Route';

            const recordRef = doc(dailyRecordsRef);
            batch.set(recordRef, {
              date: dateStr,
              bus_id: bus.id,
              driver_id: driver.id,
              helper_id: helper?.id || '',
              is_holiday: isSunday,
              school_morning: isSunday ? 0 : 1500 + Math.floor(Math.random() * 500),
              school_evening: isSunday ? 0 : 1500 + Math.floor(Math.random() * 500),
              school_morning_name: isSunday ? '' : schoolMorning,
              school_evening_name: isSunday ? '' : schoolEvening,
              charter_morning: !isSunday && Math.random() > 0.8 ? 1200 : 0,
              charter_evening: !isSunday && Math.random() > 0.8 ? 1200 : 0,
              private_booking: !isSunday && Math.random() > 0.9 ? 2000 : 0,
              fuel_amount: isSunday ? 0 : 1500 + Math.floor(Math.random() * 1000),
              fuel_type: 'CNG',
              driver_duty_payable: isSunday ? 0 : 500,
              driver_duty_paid: isSunday ? 0 : 500,
              helper_duty_payable: isSunday || !helper ? 0 : 300,
              helper_duty_paid: isSunday || !helper ? 0 : 300,
              paid_by: 'owner',
              created_by: auth.currentUser?.uid || 'system',
              created_at: serverTimestamp()
            });
            count++;
          }
          
          if (count > 0) {
            await batch.commit();
          }
          setStatus(`Generating dummy Monthly Entry... Day ${i+1}/60`);
        }
      } else if (type === 'Invoices & Receipts') {
        const studentSnap = await getDocs(collection(db, 'students'));
        if (studentSnap.empty) throw new Error('Please generate Fee Database (students) first.');
        
        const students = studentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const invoiceRef = collection(db, 'invoices');
        const receiptRef = collection(db, 'receipts');
        const today = new Date();
        
        for (const student of students as any) {
          // Generate 3 invoices for each student: Overdue, Due Today, and Future
          const scenarios = [
            { month: format(subDays(today, 60), 'MMMM yyyy'), dueDate: subDays(today, 30), status: 'OVERDUE' },
            { month: format(today, 'MMMM yyyy'), dueDate: today, status: 'UNPAID' },
            { month: format(today, 'MMMM yyyy'), dueDate: subDays(today, -15), status: 'SENT' }
          ];
          
          for (const scenario of scenarios) {
            const invNum = `DUMMY-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
            const total = student.feeAmount || 2500;
            
            const invDoc = await addDoc(invoiceRef, {
              invoiceNumber: invNum,
              studentId: student.id,
              studentName: student.studentName,
              fatherName: student.fatherName,
              schoolName: student.schoolName,
              standName: student.standName,
              invoiceDate: serverTimestamp(),
              dueDate: Timestamp.fromDate(scenario.dueDate),
              month: scenario.month,
              feeAmount: total,
              totalAmount: total,
              paidAmount: scenario.status === 'PAID' ? total : 0,
              balanceDue: scenario.status === 'PAID' ? 0 : total,
              status: scenario.status,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });

            // If overdue, maybe add a partial receipt
            if (scenario.status === 'OVERDUE' && Math.random() > 0.5) {
              const amount = 500;
              await addDoc(receiptRef, {
                receiptNumber: `RCP-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
                invoiceId: invDoc.id,
                invoiceNumber: invNum,
                studentId: student.id,
                studentName: student.studentName,
                fatherName: student.fatherName,
                amountReceived: amount,
                paymentMode: 'Cash',
                paymentDate: serverTimestamp(),
                receivedBy: 'Admin',
                createdAt: serverTimestamp()
              });
              
              // Update invoice
              const batch = writeBatch(db);
              batch.update(invDoc, {
                paidAmount: amount,
                balanceDue: total - amount,
                status: 'PARTIAL'
              });
              await batch.commit();
            }
          }
        }
      }

      setStatus(`${type} generated successfully!`);
      setSuccess(true);
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || `An error occurred while generating ${type}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Developer Tools</h1>
          <p className="text-sm text-secondary font-medium tracking-wide uppercase">Advanced system management & testing</p>
        </div>
        
        <div className="flex bg-surface border border-border p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('cleanup')}
            className={cn(
              "px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === 'cleanup' ? "bg-primary text-surface shadow-lg" : "text-secondary hover:bg-secondary/5"
            )}
          >
            Cleanup
          </button>
          <button 
            onClick={() => setActiveTab('dummy')}
            className={cn(
              "px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === 'dummy' ? "bg-primary text-surface shadow-lg" : "text-secondary hover:bg-secondary/5"
            )}
          >
            Dummy Data
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'cleanup' ? (
          <motion.div 
            key="cleanup"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="card border-danger/20 space-y-8 !p-10"
          >
            <div className="flex items-start space-x-6">
              <div className="h-16 w-16 rounded-2xl bg-danger/10 flex items-center justify-center text-danger shrink-0 border border-danger/20">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-primary">System Reset</h2>
                <p className="text-sm text-secondary leading-relaxed">
                  Permanently delete all operational data. This action is irreversible and should only be used for testing or system re-initialization.
                </p>
              </div>
            </div>

            <div className="space-y-6 max-w-md">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">
                  Type "DELETE ALL DATA" to confirm
                </label>
                <input 
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE ALL DATA"
                  className="input w-full border-danger/30 focus:border-danger text-center font-bold"
                  disabled={loading || success}
                />
              </div>

              {status && !error && !success && (
                <div className="flex items-center space-x-3 rounded-2xl bg-surface border border-border p-4 text-xs font-bold text-secondary uppercase tracking-widest">
                  <Loader2 className="h-4 w-4 animate-spin text-danger" />
                  <span>{status}</span>
                </div>
              )}

              {success && (
                <div className="flex flex-col items-center space-y-3 rounded-2xl bg-success/5 border border-success/20 p-6 text-success">
                  <CheckCircle2 className="h-10 w-10" />
                  <span className="text-xs font-bold uppercase tracking-widest">Database Wiped Successfully</span>
                </div>
              )}

              {error && (
                <div className="flex items-center space-x-3 rounded-2xl bg-danger/5 border border-danger/20 p-4 text-xs font-bold text-danger uppercase tracking-widest">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              {!success && (
                <button
                  onClick={wipeData}
                  disabled={loading || confirmText !== 'DELETE ALL DATA'}
                  className="btn-primary w-full flex items-center justify-center space-x-3 !py-4 bg-danger hover:bg-danger/90 border-none disabled:opacity-30"
                >
                  <Trash2 className="h-5 w-5" />
                  <span>{loading ? 'Wiping Database...' : 'Wipe All Data'}</span>
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="dummy"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: 'Employees', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                { title: 'Buses', icon: Bus, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
                { title: 'Fee Database', icon: Database, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                { title: 'Monthly Entry', icon: Calendar, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                { title: 'Invoices & Receipts', icon: FileText, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
              ].map((item) => (
                <button
                  key={item.title}
                  onClick={() => generateDummyData(item.title)}
                  disabled={loading}
                  className={cn(
                    "card group hover:border-accent/30 transition-all duration-300 text-left space-y-4",
                    loading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center border", item.bg, item.color, item.border)}>
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary">{item.title}</h3>
                    <p className="text-xs text-secondary">Generate sample records for testing</p>
                  </div>
                  <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-accent group-hover:translate-x-1 transition-transform">
                    <Plus className="h-3 w-3 mr-1" />
                    <span>Add Dummy Data</span>
                  </div>
                </button>
              ))}
            </div>

            <AnimatePresence>
              {(status || error || success) && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card p-6 border-accent/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-accent" />
                      ) : success ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-danger" />
                      )}
                      <span className={cn(
                        "text-sm font-bold uppercase tracking-widest",
                        success ? "text-success" : error ? "text-danger" : "text-primary"
                      )}>
                        {status || error}
                      </span>
                    </div>
                    {!loading && (
                      <button 
                        onClick={() => { setStatus(null); setError(null); setSuccess(false); }}
                        className="text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-primary"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
