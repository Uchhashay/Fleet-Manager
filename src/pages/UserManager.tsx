import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, updateDoc, doc, query, orderBy } from 'firebase/firestore';
import { Profile, UserRole } from '../types';
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

  const roles: UserRole[] = ['admin', 'accountant', 'driver', 'helper'];

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
                    profile.role === 'accountant' ? "bg-success/10 border-success/20 text-success" :
                    "bg-secondary/5 border-border text-secondary"
                  )}>
                    {profile.role === 'admin' ? <Shield className="h-6 w-6 stroke-[1.5px]" /> : <Users className="h-6 w-6 stroke-[1.5px]" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-primary">{profile.full_name}</h3>
                    <p className="text-xs text-secondary font-medium">{profile.email || 'No email saved'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-secondary/40 mr-2">Assign Role:</span>
                  {roles.map((role) => (
                    <button
                      key={role}
                      onClick={() => updateRole(profile.id, role)}
                      disabled={updatingId === profile.id}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border",
                        profile.role === role 
                          ? "bg-primary text-surface border-primary shadow-lg shadow-primary/20" 
                          : "bg-surface text-secondary border-border hover:border-accent/50"
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
                  ))}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <div className="card bg-accent/5 border-accent/20 p-6">
        <div className="flex items-start space-x-4">
          <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-primary">Role Permissions Note</h4>
            <p className="text-xs text-secondary leading-relaxed">
              <span className="font-bold text-accent">Admin:</span> Full system access including cleanup and user management.<br />
              <span className="font-bold text-success">Accountant:</span> Can enter expenses, collections, and view their own reports.<br />
              <span className="font-bold text-primary">Driver/Helper:</span> Limited access to their own performance portals.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
