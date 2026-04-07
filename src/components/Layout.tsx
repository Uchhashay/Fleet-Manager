import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Calendar, 
  Users, 
  Settings,
  LogOut,
  Bus as BusIcon,
  IndianRupee,
  DollarSign,
  Wallet,
  GraduationCap,
  BarChart3,
  Moon,
  Sun,
  MoreHorizontal,
  Trash2,
  UserCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const navItems = [
    { 
      label: 'Dashboard', 
      path: '/', 
      icon: LayoutDashboard, 
      roles: ['admin', 'accountant', 'driver', 'helper'] 
    },
    { 
      label: 'Entry', 
      path: '/entry', 
      icon: PlusCircle, 
      roles: ['admin', 'accountant'] 
    },
    { 
      label: 'Expenses', 
      path: '/expenses', 
      icon: DollarSign, 
      roles: ['admin', 'accountant'] 
    },
    { 
      label: 'Accountant', 
      path: '/accountant', 
      icon: LayoutDashboard, 
      roles: ['admin', 'accountant'] 
    },
    { 
      label: 'Cash Book', 
      path: '/cashbook', 
      icon: Wallet, 
      roles: ['admin', 'accountant'] 
    },
    { 
      label: 'Fees', 
      path: '/fees', 
      icon: GraduationCap, 
      roles: ['admin', 'accountant'] 
    },
    { 
      label: 'Monthly', 
      path: '/monthly', 
      icon: Calendar, 
      roles: ['admin'] 
    },
    { 
      label: 'Reports', 
      path: '/reports', 
      icon: BarChart3, 
      roles: ['admin', 'accountant'] 
    },
    { 
      label: 'Staff', 
      path: '/staff', 
      icon: Users, 
      roles: ['admin'] 
    },
    { 
      label: 'Salaries', 
      path: '/salaries', 
      icon: IndianRupee, 
      roles: ['admin'] 
    },
    { 
      label: 'Buses', 
      path: '/buses', 
      icon: BusIcon, 
      roles: ['admin'] 
    },
    { 
      label: 'Cleanup', 
      path: '/cleanup', 
      icon: Trash2, 
      roles: ['admin'] 
    },
    { 
      label: 'Users', 
      path: '/users', 
      icon: UserCircle, 
      roles: ['admin'] 
    },
  ];

  const filteredNavItems = navItems.filter(item => 
    !item.roles || (profile && item.roles.includes(profile.role))
  );

  // For mobile bottom nav, we only show the first 4-5 items and a "More" or just the most important ones
  const mobileNavItems = filteredNavItems.slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col bg-background text-primary transition-colors duration-300 md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-64 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-20 items-center px-8">
          <h1 className="text-xl font-bold tracking-tighter text-primary">
            JAGRITI<span className="text-accent">.</span>
          </h1>
        </div>
        
        <nav className="flex-1 space-y-1 px-4 py-4 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "group flex items-center space-x-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-secondary hover:bg-border/50 hover:text-primary"
                )}
              >
                <item.icon className={cn("h-5 w-5 stroke-[1.5px]", isActive ? "text-accent" : "text-secondary group-hover:text-primary")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-6 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs">
                {profile?.full_name?.[0] || 'U'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-xs font-semibold text-primary">{profile?.full_name}</p>
                <p className="truncate text-[10px] text-secondary uppercase tracking-wider">{profile?.role}</p>
              </div>
            </div>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-md hover:bg-border/50 text-secondary hover:text-primary transition-colors"
            >
              {isDarkMode ? <Sun className="h-4 w-4 stroke-[1.5px]" /> : <Moon className="h-4 w-4 stroke-[1.5px]" />}
            </button>
          </div>
          
          <button
            onClick={() => signOut()}
            className="flex w-full items-center space-x-3 rounded-lg px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 transition-colors"
          >
            <LogOut className="h-4 w-4 stroke-[1.5px]" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64">
        <main className="min-h-screen p-4 pb-24 md:p-10 md:pb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-border bg-surface px-2 md:hidden">
        {mobileNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center transition-all duration-300",
                isActive ? "text-accent" : "text-secondary"
              )}
            >
              <item.icon className="h-5 w-5 stroke-[1.5px]" />
              <AnimatePresence>
                {isActive && (
                  <motion.span 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-1 text-[10px] font-semibold tracking-wider uppercase"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
        
        {/* More Menu or Sign Out for Mobile */}
        <button
          onClick={() => signOut()}
          className="flex flex-col items-center justify-center text-secondary"
        >
          <LogOut className="h-5 w-5 stroke-[1.5px]" />
        </button>
      </nav>
    </div>
  );
}
