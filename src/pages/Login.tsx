import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  signInWithPopup,
  GoogleAuthProvider 
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Chrome, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const { user } = await signInWithPopup(auth, provider);
      
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      
      if (!profileSnap.exists()) {
        const role = user.email === 'dhruvsingh349@gmail.com' ? 'admin' : 'driver';
        await setDoc(profileRef, {
          full_name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          role: role,
          created_at: serverTimestamp()
        });
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Google Auth error:', err);
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      
      if (!profileSnap.exists()) {
        throw new Error('Account exists but no profile found. Please contact admin.');
      }
      
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-[400px] space-y-10"
      >
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tighter text-primary">
            JAGRITI<span className="text-accent">.</span>
          </h1>
          <p className="text-sm text-secondary font-medium tracking-wide uppercase">Fleet Management System</p>
        </div>

        <div className="card space-y-6">
          <form className="space-y-5" onSubmit={handleAuth}>
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-xs font-medium text-danger text-center"
              >
                {error}
              </motion.div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="label" htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  required
                  className="input w-full"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="label" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  className="input w-full"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
              {!loading && <ArrowRight className="h-4 w-4 stroke-[1.5px]" />}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
              <span className="bg-surface px-3 text-secondary">Secure Access</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="btn-secondary w-full flex items-center justify-center space-x-2"
          >
            <Chrome className="h-4 w-4 stroke-[1.5px]" />
            <span>Continue with Google</span>
          </button>
        </div>
        
        <div className="text-center">
          <p className="text-[11px] text-secondary font-medium uppercase tracking-widest">
            Internal Use Only &copy; 2026 Jagriti Fleet
          </p>
        </div>
      </motion.div>
    </div>
  );
}
