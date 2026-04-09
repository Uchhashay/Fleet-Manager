import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signOut as firebaseSignOut, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Profile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeProfile: () => void;

    if (user) {
      const profileRef = doc(db, 'profiles', user.uid);
      unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Profile;
          if (user.email === 'dhruvsingh349@gmail.com') {
            data.role = 'admin';
          }
          setProfile(data);
        } else {
          if (user.email === 'dhruvsingh349@gmail.com') {
            setProfile({
              id: user.uid,
              email: user.email!,
              role: 'admin',
              full_name: user.displayName || 'Admin'
            });
          } else {
            setProfile(null);
          }
        }
        setLoading(false);
      }, (error) => {
        console.error('Error fetching profile:', error);
        setProfile(null);
        setLoading(false);
      });
    }

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [user]);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
