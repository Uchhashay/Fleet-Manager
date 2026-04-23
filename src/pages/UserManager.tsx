import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, updateDoc, doc, query, orderBy } from 'firebase/firestore';
import { Profile, UserRole, UserPermissions } from '../types';
import { Users, Shield, UserCircle, Check, Loader2, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

export function UserManager() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function fetchProfiles() {
    setLoading(true);
    try {
      const q = query(collection(db, 'profiles'));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile));
      setProfiles(list);
    } catch (error) {
      console.error('Error fetching profiles:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateRole(userId: string, newRole: UserRole) {
    const profile = profiles.find(p => p.id === userId);
    if (profile?.email === 'dhruvsingh349@gmail.com') {
      console.error('Cannot change role for primary admin');
      return;
    }
    
    setUpdatingId(userId);
    try {
      await updateDoc(doc(db, 'profiles', userId), {
        role: newRole
      });
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to update role. Check security rules.');
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredProfiles = profiles.filter(p => 
    (p.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    p.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const roles: UserRole[] = ['admin', 'accountant', 'developer', 'driver', 'helper'];
  const [editingPermissions, setEditingPermissions] = useState<Profile | null>(null);

  const defaultPermissions: UserPermissions = {
    payroll: { view: true, edit: false },
    cashbook: { view: true, edit: false },
    fleet: { view: true, edit: false },
    fees: { view: true, edit: false },
    settings: { view: false, edit: false },
  };

  async function updatePermissions(userId: string, permissions: UserPermissions) {
    setUpdatingId(userId);
    try {
      await updateDoc(doc(db, 'profiles', userId), {
        permissions
      });
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, permissions } : p));
      setEditingPermissions(null);
    } catch (error) {
      console.error('Error updating permissions:', error);
      alert('Failed to update permissions.');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-primary">User Access Control</h1>
          <p className="text-sm text-secondary font-medium tracking-wide uppercase">Manage system roles and permissions</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary/50" />
          <input 
            type="text"
            placeholder="Search users..."
            className="input w-full pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Loading system profiles...</p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="card text-center py-12">
            <UserCircle className="h-12 w-12 text-secondary/20 mx-auto mb-4" />
            <p className="text-secondary font-medium">No users found matching your search.</p>
          </div>
        ) : (
          filteredProfiles.map((profile) => (
            <motion.div 
              key={profile.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card group hover:border-accent/30 transition-all duration-300"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center space-x-4">
                  <div className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center border transition-colors",
                    profile.role === 'admin' ? "bg-accent/10 border-accent/20 text-accent" :
                    profile.role === 'developer' ? "bg-purple-500/10 border-purple-500/20 text-purple-500" :
                    profile.role === 'accountant' ? "bg-success/10 border-success/20 text-success" :
                    "bg-secondary/5 border-border text-secondary"
                  )}>
                    {profile.role === 'admin' ? <Shield className="h-6 w-6 stroke-[1.5px]" /> : 
                     profile.role === 'developer' ? <Shield className="h-6 w-6 stroke-[1.5px] text-purple-500" /> :
                     <Users className="h-6 w-6 stroke-[1.5px]" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-primary">{profile.full_name}</h3>
                      {profile.role === 'developer' && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 text-[8px] font-bold uppercase tracking-tighter border border-purple-500/20">Dev</span>
                      )}
                    </div>
                    <p className="text-xs text-secondary font-medium">{profile.email || 'No email saved'}</p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-secondary/40 mr-2">Assign Role:</span>
                    {roles.map((role) => {
                      const isLockedAdmin = profile.email === 'dhruvsingh349@gmail.com';
                      const isDisabled = updatingId === profile.id || (isLockedAdmin && role !== 'admin' && role !== 'developer');
                      
                      // Special case: Dhruv can be Admin or Developer
                      if (isLockedAdmin && role !== 'admin' && role !== 'developer') return null;

                      return (
                        <button
                          key={role}
                          onClick={() => updateRole(profile.id, role)}
                          disabled={isDisabled}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border",
                            profile.role === role 
                              ? (role === 'developer' ? "bg-purple-500 text-surface border-purple-500 shadow-lg shadow-purple-500/20" : "bg-primary text-surface border-primary shadow-lg shadow-primary/20")
                              : "bg-surface text-secondary border-border hover:border-accent/50",
                            isLockedAdmin && profile.role === role && "cursor-default opacity-100"
                          )}
                        >
                          {updatingId === profile.id && profile.role !== role ? (
                            <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                          ) : (
                            <div className="flex items-center space-x-1">
                              {profile.role === role && <Check className="h-3 w-3" />}
                              <span>{role}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setEditingPermissions(profile)}
                    className="flex items-center space-x-2 px-4 py-2 bg-accent/5 hover:bg-accent/10 rounded-xl text-accent transition-all border border-accent/10 hover:border-accent/30"
                    title="Edit Permissions"
                  >
                    <Shield className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">Edit</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {editingPermissions && (
        <PermissionsModal 
          profile={editingPermissions}
          onClose={() => setEditingPermissions(null)}
          onSave={(perms) => updatePermissions(editingPermissions.id, perms)}
          defaultPermissions={defaultPermissions}
        />
      )}

      <div className="card bg-accent/5 border-accent/20 p-6">
        <div className="flex items-start space-x-4">
          <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-primary">Role Permissions Note</h4>
            <p className="text-xs text-secondary leading-relaxed">
              <span className="font-bold text-accent">Admin:</span> Full system access including cleanup and user management.<br />
              <span className="font-bold text-purple-500">Developer:</span> Advanced system-level actions, data cleanup, and dummy data tools.<br />
              <span className="font-bold text-success">Accountant:</span> Can enter expenses, collections, and view their own reports.<br />
              <span className="font-bold text-primary">Driver/Helper:</span> Limited access to their own performance portals.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PermissionsModalProps {
  profile: Profile;
  onClose: () => void;
  onSave: (permissions: UserPermissions) => void;
  defaultPermissions: UserPermissions;
}

function PermissionsModal({ profile, onClose, onSave, defaultPermissions }: PermissionsModalProps) {
  const [permissions, setPermissions] = useState<UserPermissions>(profile.permissions || defaultPermissions);

  const modules = ['payroll', 'cashbook', 'fleet', 'fees', 'settings'] as const;

  const togglePermission = (module: keyof UserPermissions, type: 'view' | 'edit') => {
    setPermissions(prev => ({
      ...prev,
      [module]: {
        ...prev[module],
        [type]: !prev[module][type]
      }
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/20 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card w-full max-w-2xl shadow-2xl border-accent/20"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">Edit Permissions</h2>
              <p className="text-xs text-secondary font-medium">{profile.full_name} ({profile.role})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary/10 rounded-lg text-secondary">&times;</button>
        </div>

        <div className="overflow-hidden border border-border rounded-2xl mb-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/5 border-b border-border">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary">Module</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary text-center">View Access</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-secondary text-center">Edit Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {modules.map((module) => (
                <tr key={module} className="hover:bg-accent/5 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-primary capitalize">{module}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <input 
                      type="checkbox"
                      checked={permissions[module].view}
                      onChange={() => togglePermission(module, 'view')}
                      className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <input 
                      type="checkbox"
                      checked={permissions[module].edit}
                      onChange={() => togglePermission(module, 'edit')}
                      className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end space-x-3">
          <button onClick={onClose} className="btn-secondary px-6">Cancel</button>
          <button onClick={() => onSave(permissions)} className="btn-primary px-6">Save Permissions</button>
        </div>
      </motion.div>
    </div>
  );
}
