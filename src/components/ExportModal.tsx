import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where,
  orderBy
} from 'firebase/firestore';
import { X, Download, FileText, Filter, Calendar, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { Student, School, Invoice, Receipt } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  schools: School[];
  stands: string[];
}

type ExportType = 'database' | 'outstanding' | 'monthly';
type ExportFormat = 'csv' | 'excel';

export function ExportModal({ isOpen, onClose, students, schools, stands }: ExportModalProps) {
  const [exportType, setExportType] = useState<ExportType>('database');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [filterSchool, setFilterSchool] = useState('all');
  const [filterStand, setFilterStand] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSession, setFilterSession] = useState('2025-26');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'MMMM yyyy'));
  const [loading, setLoading] = useState(false);

  const months = useMemo(() => {
    const options = [];
    const now = new Date();
    // 2 years back to 1 year forward
    for (let i = -24; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      options.push(format(d, 'MMMM yyyy'));
    }
    return options;
  }, []);

  const handleExport = async () => {
    setLoading(true);
    try {
      let dataToExport: any[] = [];
      let filename = `Jagriti_Students_${exportType}_${format(new Date(), 'yyyy-MM-dd')}`;

      // Apply Filters
      let filtered = students.filter(s => {
        const matchesSchool = filterSchool === 'all' || s.schoolName === filterSchool;
        const matchesStand = filterStand === 'all' || s.standName === filterStand;
        const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? s.isActive : !s.isActive);
        const matchesSession = filterSession === 'all' || s.session === filterSession;
        return matchesSchool && matchesStand && matchesStatus && matchesSession;
      });

      if (exportType === 'database') {
        dataToExport = filtered.map(s => ({
          'Student Name': s.studentName,
          'Father Name': s.fatherName,
          'Phone Number': s.phoneNumber,
          'School Name': s.schoolName,
          'Stand Name': s.standName,
          'Class': s.class,
          'Address': s.address,
          'Fee Amount': s.feeAmount,
          'Concession': s.concession,
          'Old Balance': s.oldBalance,
          'Total Balance': s.totalBalance,
          'Status': s.isActive ? 'Active' : 'Inactive',
          'Session': s.session,
          'Notes': s.notes || ''
        }));
      } else if (exportType === 'outstanding') {
        const outstanding = filtered.filter(s => s.totalBalance > 0);
        
        // Fetch invoice history for extra columns
        const results = await Promise.all(outstanding.map(async (s) => {
          const invSnap = await getDocs(query(collection(db, 'invoices'), where('studentId', '==', s.id)));
          const invoices = invSnap.docs.map(doc => doc.data() as Invoice);
          const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
          const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
          const overdueCount = invoices.filter(inv => inv.status === 'OVERDUE').length;
          
          return {
            'Student Name': s.studentName,
            'School': s.schoolName,
            'Stand': s.standName,
            'Phone': s.phoneNumber,
            'Total Invoiced': totalInvoiced,
            'Total Paid': totalPaid,
            'Outstanding Balance': s.totalBalance,
            'Months Overdue': overdueCount
          };
        }));
        dataToExport = results;
      } else if (exportType === 'monthly') {
        const invSnap = await getDocs(query(
          collection(db, 'invoices'), 
          where('month', '==', selectedMonth)
        ));
        const invoices = invSnap.docs.map(doc => doc.data() as Invoice);
        
        dataToExport = invoices
          .filter(inv => {
            const student = students.find(s => s.id === inv.studentId);
            if (!student) return false;
            const matchesSchool = filterSchool === 'all' || student.schoolName === filterSchool;
            const matchesStand = filterStand === 'all' || student.standName === filterStand;
            return matchesSchool && matchesStand;
          })
          .map(inv => ({
            'Student Name': inv.studentName,
            'School': inv.schoolName,
            'Stand': inv.standName,
            'Month': inv.month,
            'Invoice No': inv.invoiceNumber,
            'Amount': inv.totalAmount,
            'Status': inv.status
          }));
      }

      if (exportFormat === 'csv') {
        const csv = Papa.unparse(dataToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `${filename}.csv`);
      } else {
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Report");
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `${filename}.xlsx`);
      }

      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-surface w-full max-w-lg rounded-3xl shadow-2xl border border-border overflow-hidden"
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Export Data</h3>
                  <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Generate reports and database dumps</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-xl transition-colors">
                <X className="h-5 w-5 text-secondary" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Export Type */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-accent uppercase tracking-widest">What to Export</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'database', label: 'Student Database', desc: 'All student details and fee structures' },
                    { id: 'outstanding', label: 'Outstanding Balance Report', desc: 'Students with balance > 0' },
                    { id: 'monthly', label: 'Monthly Fee Report', desc: 'Fee status for a specific month' }
                  ].map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setExportType(type.id as ExportType)}
                      className={cn(
                        "flex items-start space-x-3 p-3 rounded-2xl border transition-all text-left",
                        exportType === type.id 
                          ? "bg-accent/5 border-accent ring-1 ring-accent" 
                          : "bg-background border-border hover:border-accent/50"
                      )}
                    >
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                        exportType === type.id ? "border-accent bg-accent" : "border-border"
                      )}>
                        {exportType === type.id && <div className="h-2 w-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-primary">{type.label}</p>
                        <p className="text-[10px] text-secondary font-medium">{type.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Filters */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-accent uppercase tracking-widest">Filters</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-secondary uppercase">School</label>
                    <select 
                      value={filterSchool}
                      onChange={(e) => setFilterSchool(e.target.value)}
                      className="input py-2 text-xs w-full bg-background"
                    >
                      <option value="all">All Schools</option>
                      {schools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-secondary uppercase">Stand</label>
                    <select 
                      value={filterStand}
                      onChange={(e) => setFilterStand(e.target.value)}
                      className="input py-2 text-xs w-full bg-background"
                    >
                      <option value="all">All Stands</option>
                      {stands.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-secondary uppercase">Session</label>
                    <select 
                      value={filterSession}
                      onChange={(e) => setFilterSession(e.target.value)}
                      className="input py-2 text-xs w-full bg-background"
                    >
                      <option value="all">All Sessions</option>
                      <option value="2024-25">2024-25</option>
                      <option value="2025-26">2025-26</option>
                      <option value="2026-27">2026-27</option>
                    </select>
                  </div>
                </div>
                {exportType === 'monthly' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-secondary uppercase">Month</label>
                    <select 
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="input py-2 text-xs w-full bg-background"
                    >
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                {exportType !== 'monthly' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-secondary uppercase">Status</label>
                    <select 
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="input py-2 text-xs w-full bg-background"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active Only</option>
                      <option value="inactive">Inactive Only</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Format */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-accent uppercase tracking-widest">Format</label>
                <div className="flex space-x-4">
                  <button 
                    onClick={() => setExportFormat('csv')}
                    className={cn(
                      "flex-1 py-3 rounded-xl border font-bold text-xs transition-all",
                      exportFormat === 'csv' ? "bg-primary text-white border-primary" : "bg-background text-secondary border-border"
                    )}
                  >
                    CSV
                  </button>
                  <button 
                    onClick={() => setExportFormat('excel')}
                    className={cn(
                      "flex-1 py-3 rounded-xl border font-bold text-xs transition-all",
                      exportFormat === 'excel' ? "bg-primary text-white border-primary" : "bg-background text-secondary border-border"
                    )}
                  >
                    Excel (.xlsx)
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border bg-surface flex space-x-3">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button 
                onClick={handleExport}
                disabled={loading}
                className="btn-primary flex-1 flex items-center justify-center space-x-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span>Download Report</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
