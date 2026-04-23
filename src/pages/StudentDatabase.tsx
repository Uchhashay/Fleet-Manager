import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  Timestamp,
  writeBatch,
  increment
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { logActivity } from '../lib/activity-logger';
import { formatCurrency, cn } from '../lib/utils';
import { Student, School } from '../types';
import { StudentProfileModal } from '../components/StudentProfileModal';
import { ImportModal } from '../components/ImportModal';
import { ExportModal } from '../components/ExportModal';
import { 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Filter, 
  X, 
  Save, 
  Users, 
  UserCheck, 
  Calendar,
  ChevronLeft, 
  ChevronRight,
  MoreVertical,
  Phone,
  MapPin,
  School as SchoolIcon,
  Route as RouteIcon,
  Info,
  DollarSign,
  Upload,
  Download,
  FileText
} from 'lucide-react';
import { RaiseSingleInvoiceModal } from '../components/RaiseSingleInvoiceModal';
import { motion, AnimatePresence } from 'framer-motion';

export function StudentDatabase() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSchool, setFilterSchool] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStand, setFilterStand] = useState('all');
  const [filterSession, setFilterSession] = useState('2025-26');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Form State
  const [formData, setFormData] = useState({
    studentName: '',
    fatherName: '',
    phoneNumber: '',
    schoolName: '',
    standName: '',
    class: '',
    address: '',
    dateOfJoining: new Date().toISOString().split('T')[0],
    feeAmount: 0,
    concession: 0,
    oldBalance: 0,
    isActive: true,
    session: '2025-26',
    notes: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'students'), orderBy('studentName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const studentData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Student[];
      setStudents(studentData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
      setLoading(false);
    });

    const qSchools = query(collection(db, 'schools'), orderBy('name'));
    const unsubscribeSchools = onSnapshot(qSchools, (snapshot) => {
      setSchools(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as School)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'schools');
    });

    return () => {
      unsubscribe();
      unsubscribeSchools();
    };
  }, []);

  const totalBalance = Number(formData.feeAmount) - Number(formData.concession) + Number(formData.oldBalance);

  const filteredStudents = students.filter(student => {
    const name = student.studentName || '';
    const school = student.schoolName || '';
    const stand = student.standName || '';
    
    const matchesSearch = 
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      school.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stand.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSchool = filterSchool === 'all' || student.schoolName === filterSchool;
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? student.isActive : !student.isActive);
    const matchesStand = filterStand === 'all' || student.standName === filterStand;
    const matchesSession = filterSession === 'all' || student.session === filterSession;

    return matchesSearch && matchesSchool && matchesStatus && matchesStand && matchesSession;
  });

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const stats = {
    total: students.length,
    active: students.filter(s => s.isActive).length,
    outstanding: students.reduce((acc, s) => acc + (s.totalBalance || 0), 0)
  };

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const handleRowClick = (student: Student) => {
    setSelectedStudent(student);
    setIsProfileModalOpen(true);
  };

  const [selectedStudentForInvoice, setSelectedStudentForInvoice] = useState<Student | null>(null);
  const [isRaiseInvoiceModalOpen, setIsRaiseInvoiceModalOpen] = useState(false);

  const handleOpenModal = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      const joiningDate = student.dateOfJoining instanceof Timestamp 
        ? student.dateOfJoining.toDate().toISOString().split('T')[0]
        : new Date(student.dateOfJoining).toISOString().split('T')[0];
        
      setFormData({
        studentName: student.studentName,
        fatherName: student.fatherName,
        phoneNumber: student.phoneNumber,
        schoolName: student.schoolName,
        standName: student.standName,
        class: student.class,
        address: student.address,
        dateOfJoining: joiningDate,
        feeAmount: student.feeAmount,
        concession: student.concession,
        oldBalance: student.oldBalance,
        isActive: student.isActive,
        session: student.session || '2025-26',
        notes: student.notes || ''
      });
    } else {
      setEditingStudent(null);
      setFormData({
        studentName: '',
        fatherName: '',
        phoneNumber: '',
        schoolName: '',
        standName: '',
        class: '',
        address: '',
        dateOfJoining: new Date().toISOString().split('T')[0],
        feeAmount: 0,
        concession: 0,
        oldBalance: 0,
        isActive: true,
        session: '2025-26',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const studentData: any = {
        ...formData,
        feeAmount: Number(formData.feeAmount),
        concession: Number(formData.concession),
        oldBalance: Number(formData.oldBalance),
        dateOfJoining: Timestamp.fromDate(new Date(formData.dateOfJoining)),
        updatedAt: serverTimestamp()
      };

      if (editingStudent) {
        // Calculate balance adjustment if oldBalance changed
        const oldBalanceDiff = Number(formData.oldBalance) - (editingStudent.oldBalance || 0);
        if (oldBalanceDiff !== 0) {
          studentData.totalBalance = increment(oldBalanceDiff);
        } else {
          // Don't overwrite totalBalance if oldBalance hasn't changed
          delete studentData.totalBalance;
        }

        await updateDoc(doc(db, 'students', editingStudent.id), studentData);
        
        // Check for status change for timeline
        if (editingStudent.isActive !== formData.isActive) {
          const event = formData.isActive ? 'Student Rejoined' : 'Student Left';
          const description = formData.isActive ? 'Status changed to Active' : 'Status changed to Inactive';
          await addDoc(collection(db, 'students', editingStudent.id, 'timeline'), {
            event,
            description,
            createdBy: profile?.full_name || 'System',
            createdAt: serverTimestamp()
          });
        }

        if (profile) {
          await logActivity(profile.full_name, profile.role, 'Edited', 'Fees', `Updated student: ${formData.studentName}`);
        }
      } else {
        const docRef = await addDoc(collection(db, 'students'), {
          ...studentData,
          totalBalance: Number(formData.feeAmount) - Number(formData.concession) + Number(formData.oldBalance),
          createdAt: serverTimestamp()
        });

        // Add "Student Joined" timeline event
        await addDoc(collection(db, 'students', docRef.id, 'timeline'), {
          event: 'Student Joined',
          description: 'Initial registration',
          createdBy: profile?.full_name || 'System',
          createdAt: serverTimestamp()
        });

        if (profile) {
          await logActivity(profile.full_name, profile.role, 'Created', 'Fees', `Added new student: ${formData.studentName}`);
        }
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingStudent ? OperationType.UPDATE : OperationType.CREATE, 'students');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (student: Student) => {
    if (profile?.role !== 'admin') {
      alert('Only administrators can delete students.');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${student.studentName}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'students', student.id));
      if (profile) {
        await logActivity(profile.full_name, profile.role, 'Deleted', 'Fees', `Deleted student: ${student.studentName}`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'students');
    }
  };

  const uniqueStands = Array.from(new Set(students.map(s => s.standName).filter(Boolean))).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-primary tracking-tight">Student Database</h2>
          <p className="text-secondary font-medium">Manage student records and fee structures</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="btn-secondary flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          {(profile?.role === 'admin' || profile?.role === 'developer') && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="btn-secondary flex items-center space-x-2"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
          )}
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary flex items-center justify-center space-x-2 shadow-lg shadow-accent/20"
          >
            <Plus className="h-5 w-5" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card bg-surface flex items-center space-x-4">
          <div className="h-12 w-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Total Students</p>
            <p className="text-2xl font-black text-primary">{stats.total}</p>
          </div>
        </div>
        <div className="card bg-surface flex items-center space-x-4">
          <div className="h-12 w-12 rounded-2xl bg-success/10 flex items-center justify-center text-success">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Active Students</p>
            <p className="text-2xl font-black text-primary">{stats.active}</p>
          </div>
        </div>
        <div className="card bg-surface flex items-center space-x-4">
          <div className="h-12 w-12 rounded-2xl bg-danger/10 flex items-center justify-center text-danger">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Total Outstanding</p>
            <p className="text-2xl font-black text-primary font-mono">{formatCurrency(stats.outstanding)}</p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="card bg-surface space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
            <input
              type="text"
              placeholder="Search by name, school, or stand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full bg-background border-border/50"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center space-x-2 bg-background rounded-lg px-3 py-1 border border-border/50">
              <Calendar className="h-3.5 w-3.5 text-secondary" />
              <select
                value={filterSession}
                onChange={(e) => setFilterSession(e.target.value)}
                className="bg-transparent text-xs font-bold text-primary focus:outline-none py-1"
              >
                <option value="all">All Sessions</option>
                <option value="2024-25">2024-25</option>
                <option value="2025-26">2025-26</option>
                <option value="2026-27">2026-27</option>
              </select>
            </div>
            <div className="flex items-center space-x-2 bg-background rounded-lg px-3 py-1 border border-border/50">
              <Filter className="h-3.5 w-3.5 text-secondary" />
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className="bg-transparent text-xs font-bold text-primary focus:outline-none py-1"
              >
                <option key="all-schools" value="all">All Schools</option>
                {schools.map(school => (
                  <option key={school.id} value={school.name}>{school.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-2 bg-background rounded-lg px-3 py-1 border border-border/50">
              <RouteIcon className="h-3.5 w-3.5 text-secondary" />
              <select
                value={filterStand}
                onChange={(e) => setFilterStand(e.target.value)}
                className="bg-transparent text-xs font-bold text-primary focus:outline-none py-1"
              >
                <option key="all-stands" value="all">All Stands</option>
                {uniqueStands.map(stand => (
                  <option key={`stand-${stand}`} value={stand}>{stand}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-2 bg-background rounded-lg px-3 py-1 border border-border/50">
              <UserCheck className="h-3.5 w-3.5 text-secondary" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-transparent text-xs font-bold text-primary focus:outline-none py-1"
              >
                <option key="all-status" value="all">All Status</option>
                <option key="active-status" value="active">Active</option>
                <option key="inactive-status" value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card bg-surface p-0 overflow-hidden border-border/50">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Student Details</th>
                <th>Session</th>
                <th>School & Stand</th>
                <th>Class</th>
                <th>Contact</th>
                <th>Fee Details</th>
                <th>Balance</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {paginatedStudents.map((student) => (
                <tr 
                  key={student.id} 
                  onClick={() => handleRowClick(student)}
                  className="hover:bg-accent/5 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-primary group-hover:text-accent transition-colors">{student.studentName}</span>
                      <span className="text-[10px] text-secondary uppercase tracking-wider">S/O: {student.fatherName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-accent bg-accent/5 px-2 py-1 rounded-md">
                      {student.session}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-1.5 text-xs text-secondary">
                        <SchoolIcon className="h-3 w-3" />
                        <span>{student.schoolName}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs text-secondary">
                        <RouteIcon className="h-3 w-3" />
                        <span>{student.standName}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-primary">{student.class}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-1.5 text-xs text-secondary">
                      <Phone className="h-3 w-3" />
                      <span>{student.phoneNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-primary">{formatCurrency(student.feeAmount)}</span>
                      {student.concession > 0 && (
                        <span className="text-[10px] text-success font-bold">-{formatCurrency(student.concession)} Conc.</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-xs font-black",
                      student.totalBalance > 0 ? "text-danger" : "text-success"
                    )}>
                      {formatCurrency(student.totalBalance)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "badge",
                      student.isActive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                    )}>
                      {student.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setSelectedStudentForInvoice(student);
                          setIsRaiseInvoiceModalOpen(true);
                        }}
                        className="p-2 text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                        title="Raise Invoice"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleOpenModal(student)}
                        className="p-2 text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                        title="Edit Student"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      {(profile?.role === 'admin' || profile?.role === 'developer') && (
                        <button
                          onClick={() => handleDelete(student)}
                          className="p-2 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                          title="Delete Student"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-surface border-t border-border/50 flex items-center justify-between">
            <p className="text-xs text-secondary font-medium">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredStudents.length)} of {filteredStudents.length} students
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-border hover:bg-surface disabled:opacity-50 transition-all"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-primary px-4">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-border hover:bg-surface disabled:opacity-50 transition-all"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface w-full max-w-2xl rounded-3xl shadow-2xl border border-border overflow-hidden"
            >
              <div className="p-6 border-b border-border flex items-center justify-between bg-accent/5">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                    {editingStudent ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-primary tracking-tight">
                      {editingStudent ? 'Edit Student' : 'Add New Student'}
                    </h3>
                    <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">
                      {editingStudent ? 'Update existing record' : 'Create a new student profile'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-border/50 rounded-xl transition-colors"
                >
                  <X className="h-5 w-5 text-secondary" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">Basic Information</h4>
                    <div className="space-y-2">
                      <label className="label">Student Name</label>
                      <input
                        required
                        type="text"
                        value={formData.studentName}
                        onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                        className="input w-full bg-background"
                        placeholder="Full Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Father's Name</label>
                      <input
                        required
                        type="text"
                        value={formData.fatherName}
                        onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                        className="input w-full bg-background"
                        placeholder="Father's Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Phone Number</label>
                      <input
                        required
                        type="tel"
                        value={formData.phoneNumber}
                        onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                        className="input w-full bg-background font-mono"
                        placeholder="10-digit number"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Address</label>
                      <textarea
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="input w-full bg-background min-h-[80px] resize-none"
                        placeholder="Full Address"
                      />
                    </div>
                  </div>

                  {/* Academic Info */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">Academic & Route</h4>
                    <div className="space-y-2">
                      <label className="label">School Name</label>
                      <select
                        required
                        value={formData.schoolName}
                        onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                        className="input w-full bg-background"
                      >
                        <option key="select-school-placeholder" value="">Select School</option>
                        {schools.map(school => (
                          <option key={`form-school-${school.id}`} value={school.name}>{school.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="label">Stand Name (Route)</label>
                      <input
                        required
                        type="text"
                        value={formData.standName}
                        onChange={(e) => setFormData({ ...formData, standName: e.target.value })}
                        className="input w-full bg-background"
                        placeholder="e.g. B-1, Main Gate"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label">School Session</label>
                      <select
                        required
                        value={formData.session}
                        onChange={(e) => setFormData({ ...formData, session: e.target.value })}
                        className="input w-full bg-background"
                      >
                        <option value="2024-25">2024-25</option>
                        <option value="2025-26">2025-26</option>
                        <option value="2026-27">2026-27</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="label">Class</label>
                      <input
                        required
                        type="text"
                        value={formData.class}
                        onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                        className="input w-full bg-background"
                        placeholder="e.g. 10th-A"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Date of Joining</label>
                      <input
                        required
                        type="date"
                        value={formData.dateOfJoining}
                        onChange={(e) => setFormData({ ...formData, dateOfJoining: e.target.value })}
                        className="input w-full bg-background"
                      />
                    </div>
                  </div>
                </div>

                {/* Fee Structure */}
                <div className="space-y-4 pt-4 border-t border-border">
                  <h4 className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">Fee Structure</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="label">Monthly Fee (₹)</label>
                      <input
                        required
                        type="number"
                        value={formData.feeAmount}
                        onChange={(e) => setFormData({ ...formData, feeAmount: Number(e.target.value) })}
                        className="input w-full bg-background font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Concession (₹)</label>
                      <input
                        type="number"
                        value={formData.concession}
                        onChange={(e) => setFormData({ ...formData, concession: Number(e.target.value) })}
                        className="input w-full bg-background font-mono text-success"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Old Balance (₹)</label>
                      <input
                        type="number"
                        value={formData.oldBalance}
                        onChange={(e) => setFormData({ ...formData, oldBalance: Number(e.target.value) })}
                        className="input w-full bg-background font-mono text-danger"
                      />
                    </div>
                  </div>
                  
                  <div className="bg-accent/5 rounded-2xl p-4 flex items-center justify-between border border-accent/10">
                    <div className="flex items-center space-x-2 text-secondary">
                      <Info className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Total Monthly Balance</span>
                    </div>
                    <span className={cn(
                      "text-xl font-black font-mono",
                      totalBalance > 0 ? "text-danger" : "text-success"
                    )}>
                      {formatCurrency(totalBalance)}
                    </span>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
                  <div className="space-y-2">
                    <label className="label">Internal Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="input w-full bg-background min-h-[80px] resize-none"
                      placeholder="Any internal notes about the student..."
                    />
                  </div>
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-surface border border-border">
                      <div>
                        <p className="text-xs font-bold text-primary">Active Status</p>
                        <p className="text-[10px] text-secondary font-medium">Is the student currently using the service?</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                        className={cn(
                          "w-12 h-6 rounded-full transition-all relative",
                          formData.isActive ? "bg-success" : "bg-border"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                          formData.isActive ? "left-7" : "left-1"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex items-center space-x-2 !px-10"
                  >
                    {loading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>{editingStudent ? 'Update Student' : 'Save Student'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {selectedStudent && (
        <StudentProfileModal
          student={selectedStudent}
          isOpen={isProfileModalOpen}
          onClose={() => {
            setIsProfileModalOpen(false);
            setSelectedStudent(null);
          }}
          onEdit={(student) => {
            setIsProfileModalOpen(false);
            handleOpenModal(student);
          }}
        />
      )}

      <ImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={(count) => {
          alert(`${count} students imported successfully!`);
        }}
      />

      <ExportModal 
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        students={students}
        schools={schools}
        stands={uniqueStands}
      />
      {/* Raise Invoice Modal */}
      {selectedStudentForInvoice && (
        <RaiseSingleInvoiceModal
          isOpen={isRaiseInvoiceModalOpen}
          onClose={() => {
            setIsRaiseInvoiceModalOpen(false);
            setSelectedStudentForInvoice(null);
          }}
          student={selectedStudentForInvoice}
          profile={profile}
        />
      )}
    </div>
  );
}
