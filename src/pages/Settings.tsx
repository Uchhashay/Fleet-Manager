import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, deleteDoc, onSnapshot, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebase-utils';
import { logActivity } from '../lib/activity-logger';
import { formatCurrency, cn } from '../lib/utils';
import { School, ActivityLog, BillTemplate } from '../types';
import { format } from 'date-fns';
import { 
  Wallet, 
  Save, 
  AlertCircle,
  CheckCircle2,
  Info,
  Plus,
  Trash2,
  School as SchoolIcon,
  History,
  Search,
  Filter as FilterIcon,
  Calendar as CalendarIcon,
  User as UserIcon,
  Building2,
  Globe,
  MapPin,
  Phone,
  Upload,
  Image as ImageIcon,
  BookTemplate
} from 'lucide-react';
import { motion } from 'framer-motion';

export function Settings() {
  const { profile } = useAuth();
  const [openingBalances, setOpeningBalances] = useState({
    owner: 0,
    accountant: 0
  });
  const [orgProfile, setOrgProfile] = useState({
    name: 'Jagriti Tours & Travels',
    industry: 'Travel/Hospitality',
    location: '',
    address_line1: 'E-10, Gali No-6, Tomar Colony, Burari',
    address_line2: 'Delhi',
    zip_code: '110084',
    phone: '9811387399',
    fax: '',
    website: 'www.jagrititoursandtravels.com',
    logo_url: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [addingSchool, setAddingSchool] = useState(false);

  // Bill Templates State
  const [billTemplates, setBillTemplates] = useState<BillTemplate[]>([]);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [addingTemplate, setAddingTemplate] = useState(false);

  // Activity Log State
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logFilters, setLogFilters] = useState({
    user: 'all',
    action: 'all',
    module: 'all',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchSettings();
    
    // Listen to schools
    const qSchools = query(collection(db, 'schools'), orderBy('name'));
    const unsubscribeSchools = onSnapshot(qSchools, (snap) => {
      setSchools(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as School)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'schools'));

    // Listen to bill templates
    const qTemplates = query(collection(db, 'settings', 'billTemplates', 'list'), orderBy('createdAt', 'desc'));
    const unsubscribeTemplates = onSnapshot(qTemplates, (snap) => {
      setBillTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillTemplate)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'billTemplates'));

    // Listen to logs
    const qLogs = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribeLogs = onSnapshot(qLogs, (snap) => {
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));
      setLogsLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'activity_logs'));

    return () => {
      unsubscribeSchools();
      unsubscribeTemplates();
      unsubscribeLogs();
    };
  }, []);

  async function fetchSettings() {
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'opening_balances'));
      if (settingsDoc.exists()) {
        setOpeningBalances(settingsDoc.data() as any);
      }

      const orgDoc = await getDoc(doc(db, 'settings', 'organization'));
      if (orgDoc.exists()) {
        setOrgProfile(prev => ({ ...prev, ...orgDoc.data() }));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveOrg() {
    setSavingOrg(true);
    setMessage(null);
    try {
      await setDoc(doc(db, 'settings', 'organization'), {
        ...orgProfile,
        updated_at: serverTimestamp(),
        updated_by: auth.currentUser?.uid
      });

      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Edited',
          'Settings',
          `Updated organization profile: ${orgProfile.name}`
        );
      }

      setMessage({ type: 'success', text: 'Organization profile updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/organization');
    } finally {
      setSavingOrg(false);
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        setMessage({ type: 'error', text: 'Logo file size must be less than 1MB' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setOrgProfile({ ...orgProfile, logo_url: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await setDoc(doc(db, 'settings', 'opening_balances'), {
        ...openingBalances,
        updated_at: serverTimestamp(),
        updated_by: auth.currentUser?.uid
      });

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Edited',
          'Settings',
          `Updated opening balances: Owner=${openingBalances.owner}, Accountant=${openingBalances.accountant}`
        );
      }

      setMessage({ type: 'success', text: 'Opening balances updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/opening_balances');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSchool() {
    if (!newSchoolName.trim()) return;
    setAddingSchool(true);
    try {
      await addDoc(collection(db, 'schools'), {
        name: newSchoolName.trim(),
        created_at: serverTimestamp()
      });

      // Log activity
      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Settings',
          `Added new school: ${newSchoolName.trim()}`
        );
      }

      setNewSchoolName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'schools');
    } finally {
      setAddingSchool(false);
    }
  }

  async function handleDeleteSchool(id: string) {
    if (!confirm('Are you sure you want to delete this school?')) return;
    const schoolToDelete = schools.find(s => s.id === id);
    try {
      await deleteDoc(doc(db, 'schools', id));

      // Log activity
      if (profile && schoolToDelete) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Deleted',
          'Settings',
          `Deleted school: ${schoolToDelete.name}`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'schools');
    }
  }

  async function handleAddTemplate() {
    if (!newTemplate.name.trim() || !newTemplate.content.trim()) return;
    setAddingTemplate(true);
    try {
      await addDoc(collection(db, 'settings', 'billTemplates', 'list'), {
        ...newTemplate,
        createdAt: serverTimestamp()
      });

      if (profile) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Created',
          'Settings',
          `Added bill template: ${newTemplate.name}`
        );
      }

      setNewTemplate({ name: '', content: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'billTemplates');
    } finally {
      setAddingTemplate(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;
    const templateToDelete = billTemplates.find(t => t.id === id);
    try {
      await deleteDoc(doc(db, 'settings', 'billTemplates', 'list', id));

      if (profile && templateToDelete) {
        await logActivity(
          profile.full_name,
          profile.role,
          'Deleted',
          'Settings',
          `Deleted bill template: ${templateToDelete.name}`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'billTemplates');
    }
  }

  const filteredLogs = logs.filter(log => {
    if (logFilters.user !== 'all' && log.user_role !== logFilters.user) return false;
    if (logFilters.action !== 'all' && log.action_type !== logFilters.action) return false;
    if (logFilters.module !== 'all' && log.module !== logFilters.module) return false;
    
    if (logFilters.startDate) {
      const start = new Date(logFilters.startDate);
      const logDate = log.timestamp?.toDate() || new Date();
      if (logDate < start) return false;
    }
    
    if (logFilters.endDate) {
      const end = new Date(logFilters.endDate);
      end.setHours(23, 59, 59, 999);
      const logDate = log.timestamp?.toDate() || new Date();
      if (logDate > end) return false;
    }
    
    return true;
  });

  const uniqueModules = Array.from(new Set(logs.map(l => l.module))).sort();
  const uniqueUsers = Array.from(new Set(logs.map(l => l.user_role))).sort();

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-primary tracking-tight">Settings</h2>
          <p className="text-secondary font-medium">Manage global application configurations</p>
        </div>
      </header>

      <div className="grid gap-8">
        {/* Organization Profile Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card space-y-8"
        >
          <div className="flex items-center space-x-3 border-b border-border pb-4">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <Building2 className="h-5 w-5 stroke-[1.5px]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-primary">Organization Profile</h3>
              <p className="text-xs text-secondary font-medium">Manage your company details and branding</p>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Logo Upload */}
            <div className="space-y-4">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Organization Logo</label>
              <div className="relative group">
                <div className={cn(
                  "h-48 w-full rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center overflow-hidden transition-all group-hover:border-accent/50",
                  orgProfile.logo_url ? "bg-surface" : "bg-surface/50"
                )}>
                  {orgProfile.logo_url ? (
                    <img 
                      src={orgProfile.logo_url} 
                      alt="Logo" 
                      className="h-full w-full object-contain p-4"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center space-y-2 text-secondary">
                      <ImageIcon className="h-10 w-10 stroke-[1px]" />
                      <p className="text-[10px] font-medium">No logo uploaded</p>
                    </div>
                  )}
                  <label className="absolute inset-0 cursor-pointer flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex flex-col items-center space-y-1">
                      <Upload className="h-6 w-6 text-primary" />
                      <span className="text-[10px] font-bold text-primary uppercase">Change Logo</span>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-secondary leading-relaxed">
                  Preferred: 240x240px @ 72 DPI
                </p>
                <p className="text-[10px] text-secondary leading-relaxed">
                  JPG, PNG, GIF, BMP (Max 1MB)
                </p>
              </div>
            </div>

            {/* Basic Info */}
            <div className="md:col-span-2 space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Organization Name</label>
                  <input
                    type="text"
                    value={orgProfile.name}
                    onChange={(e) => setOrgProfile({ ...orgProfile, name: e.target.value })}
                    className="input bg-background"
                    placeholder="e.g. Jagriti Tours & Travels"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Industry</label>
                  <input
                    type="text"
                    value={orgProfile.industry}
                    onChange={(e) => setOrgProfile({ ...orgProfile, industry: e.target.value })}
                    className="input bg-background"
                    placeholder="e.g. Travel/Hospitality"
                  />
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Location</label>
                  <div className="relative group">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary stroke-[1.5px]" />
                    <input
                      type="text"
                      value={orgProfile.location}
                      onChange={(e) => setOrgProfile({ ...orgProfile, location: e.target.value })}
                      className="input pl-10 bg-background"
                      placeholder="e.g. New Delhi, India"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Website URL</label>
                  <div className="relative group">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary stroke-[1.5px]" />
                    <input
                      type="text"
                      value={orgProfile.website}
                      onChange={(e) => setOrgProfile({ ...orgProfile, website: e.target.value })}
                      className="input pl-10 bg-background"
                      placeholder="www.example.com"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 pt-6 border-t border-border">
            <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Organization Address</h4>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Street Address 1</label>
                <input
                  type="text"
                  value={orgProfile.address_line1}
                  onChange={(e) => setOrgProfile({ ...orgProfile, address_line1: e.target.value })}
                  className="input bg-background"
                  placeholder="Street 1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Street Address 2</label>
                <input
                  type="text"
                  value={orgProfile.address_line2}
                  onChange={(e) => setOrgProfile({ ...orgProfile, address_line2: e.target.value })}
                  className="input bg-background"
                  placeholder="Street 2"
                />
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Zip/Postal Code</label>
                <input
                  type="text"
                  value={orgProfile.zip_code}
                  onChange={(e) => setOrgProfile({ ...orgProfile, zip_code: e.target.value })}
                  className="input bg-background font-mono"
                  placeholder="110001"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Phone Number</label>
                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary stroke-[1.5px]" />
                  <input
                    type="text"
                    value={orgProfile.phone}
                    onChange={(e) => setOrgProfile({ ...orgProfile, phone: e.target.value })}
                    className="input pl-10 bg-background font-mono"
                    placeholder="9876543210"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Fax Number</label>
                <input
                  type="text"
                  value={orgProfile.fax}
                  onChange={(e) => setOrgProfile({ ...orgProfile, fax: e.target.value })}
                  className="input bg-background font-mono"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center space-x-2">
              {message && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "flex items-center space-x-2 text-sm font-bold",
                    message.type === 'success' ? "text-success" : "text-danger"
                  )}
                >
                  {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span>{message.text}</span>
                </motion.div>
              )}
            </div>
            <button
              onClick={handleSaveOrg}
              disabled={savingOrg}
              className="btn-primary flex items-center space-x-2 !px-8"
            >
              {savingOrg ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
              ) : (
                <Save className="h-4 w-4 stroke-[1.5px]" />
              )}
              <span>{savingOrg ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </motion.div>

        {/* Opening Balances Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card space-y-6"
        >
          <div className="flex items-center space-x-3 border-b border-border pb-4">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <Wallet className="h-5 w-5 stroke-[1.5px]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-primary">Opening Balances</h3>
              <p className="text-xs text-secondary font-medium">Set the starting cash balance for Owner and Accountant</p>
            </div>
          </div>

          <div className="bg-accent/5 border border-accent/10 rounded-xl p-4 flex items-start space-x-3">
            <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
            <p className="text-xs text-secondary leading-relaxed">
              These balances will be added to the cumulative cash calculations across the entire app. 
              Use this to set the initial cash on hand when you first started using this system.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Owner Opening Balance</label>
              <div className="relative group">
                <input
                  type="number"
                  value={openingBalances.owner}
                  onChange={(e) => setOpeningBalances({ ...openingBalances, owner: Number(e.target.value) })}
                  className="input pl-10 bg-background border-border/50 group-hover:border-accent/50 transition-colors font-mono"
                  placeholder="0.00"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">₹</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Accountant Opening Balance</label>
              <div className="relative group">
                <input
                  type="number"
                  value={openingBalances.accountant}
                  onChange={(e) => setOpeningBalances({ ...openingBalances, accountant: Number(e.target.value) })}
                  className="input pl-10 bg-background border-border/50 group-hover:border-accent/50 transition-colors font-mono"
                  placeholder="0.00"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">₹</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center space-x-2">
              {message && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "flex items-center space-x-2 text-sm font-bold",
                    message.type === 'success' ? "text-success" : "text-danger"
                  )}
                >
                  {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span>{message.text}</span>
                </motion.div>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center space-x-2 !px-8"
            >
              {saving ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
              ) : (
                <Save className="h-4 w-4 stroke-[1.5px]" />
              )}
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </motion.div>

        {/* Bill Description Templates Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card space-y-6"
        >
          <div className="flex items-center space-x-3 border-b border-border pb-4">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <BookTemplate className="h-5 w-5 stroke-[1.5px]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-primary">Bill Templates</h3>
              <p className="text-xs text-secondary font-medium">Predefined descriptions for B2B billing line items</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Template Name</label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    placeholder="e.g., Monthly School Bus Hire"
                    className="input"
                  />
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Description Content</label>
                  <textarea
                    value={newTemplate.content}
                    onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                    placeholder="Enter the default description..."
                    className="input min-h-[42px] py-2 resize-none"
                  />
               </div>
            </div>
            <button
              onClick={handleAddTemplate}
              disabled={addingTemplate || !newTemplate.name.trim() || !newTemplate.content.trim()}
              className="btn-primary w-full flex items-center justify-center space-x-2"
            >
              {addingTemplate ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>Add Template</span>
            </button>
          </div>

          <div className="grid gap-4">
            {billTemplates.length === 0 ? (
              <div className="text-center py-8 bg-surface rounded-xl border border-dashed border-border">
                <p className="text-xs text-secondary font-medium">No templates created yet</p>
              </div>
            ) : (
              billTemplates.map(template => (
                <div 
                  key={template.id}
                  className="p-4 rounded-xl bg-surface border border-border group hover:border-accent/30 transition-all flex flex-col gap-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-primary">{template.name}</span>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="p-2 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-secondary italic whitespace-pre-line leading-relaxed">
                    {template.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* School Management Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card space-y-6"
        >
          <div className="flex items-center space-x-3 border-b border-border pb-4">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <SchoolIcon className="h-5 w-5 stroke-[1.5px]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-primary">School Names</h3>
              <p className="text-xs text-secondary font-medium">Manage the list of schools for Staff Route dropdowns</p>
            </div>
          </div>

          <div className="flex space-x-2">
            <input
              type="text"
              value={newSchoolName}
              onChange={(e) => setNewSchoolName(e.target.value)}
              placeholder="Enter school name..."
              className="input flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddSchool()}
            />
            <button
              onClick={handleAddSchool}
              disabled={addingSchool || !newSchoolName.trim()}
              className="btn-primary !py-2 !px-4 flex items-center space-x-2"
            >
              {addingSchool ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>Add</span>
            </button>
          </div>

          <div className="grid gap-3">
            {schools.length === 0 ? (
              <div className="text-center py-8 bg-surface rounded-xl border border-dashed border-border">
                <p className="text-xs text-secondary font-medium">No schools added yet</p>
              </div>
            ) : (
              schools.map(school => (
                <div 
                  key={school.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border group hover:border-accent/30 transition-all"
                >
                  <span className="text-sm font-medium text-primary">{school.name}</span>
                  <button
                    onClick={() => handleDeleteSchool(school.id)}
                    className="p-2 text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Activity Log Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card space-y-6"
        >
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <History className="h-5 w-5 stroke-[1.5px]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary">Activity Log</h3>
                <p className="text-xs text-secondary font-medium">Audit trail of system actions</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 bg-surface/50 p-4 rounded-xl border border-border">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">User Role</label>
              <select 
                value={logFilters.user}
                onChange={(e) => setLogFilters({ ...logFilters, user: e.target.value })}
                className="input !py-2 text-xs"
              >
                <option value="all">All Roles</option>
                {uniqueUsers.map(role => (
                  <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Action</label>
              <select 
                value={logFilters.action}
                onChange={(e) => setLogFilters({ ...logFilters, action: e.target.value as any })}
                className="input !py-2 text-xs"
              >
                <option value="all">All Actions</option>
                <option value="Created">Created</option>
                <option value="Edited">Edited</option>
                <option value="Deleted">Deleted</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Module</label>
              <select 
                value={logFilters.module}
                onChange={(e) => setLogFilters({ ...logFilters, module: e.target.value })}
                className="input !py-2 text-xs"
              >
                <option value="all">All Modules</option>
                {uniqueModules.map(mod => (
                  <option key={mod} value={mod}>{mod}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">Start Date</label>
              <input 
                type="date"
                value={logFilters.startDate}
                onChange={(e) => setLogFilters({ ...logFilters, startDate: e.target.value })}
                className="input !py-2 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-secondary tracking-wider ml-1">End Date</label>
              <input 
                type="date"
                value={logFilters.endDate}
                onChange={(e) => setLogFilters({ ...logFilters, endDate: e.target.value })}
                className="input !py-2 text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface border-b border-border">
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">User</th>
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">Action</th>
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">Module</th>
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">Details</th>
                  <th className="px-4 py-3 font-bold text-secondary uppercase tracking-widest">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {logsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-secondary">
                      <div className="flex items-center justify-center space-x-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
                        <span>Loading logs...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-secondary">
                      No activity logs found matching the filters.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-accent/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-primary">{log.user_name}</span>
                          <span className="text-[10px] text-secondary uppercase tracking-wider">{log.user_role}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          log.action_type === 'Created' ? "bg-success/10 text-success" :
                          log.action_type === 'Edited' ? "bg-accent/10 text-accent" :
                          "bg-danger/10 text-danger"
                        )}>
                          {log.action_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-primary">{log.module}</td>
                      <td className="px-4 py-3 text-secondary max-w-xs truncate" title={log.details}>
                        {log.details}
                      </td>
                      <td className="px-4 py-3 text-secondary font-mono">
                        {log.timestamp ? format(log.timestamp.toDate(), 'dd MMM yyyy HH:mm') : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
