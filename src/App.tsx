import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { DailyEntry } from './pages/DailyEntry';
import { MonthlyView } from './pages/MonthlyView';
import { Dashboard } from './pages/Dashboard';
import { StaffManager } from './pages/StaffManager';
import { BusManager } from './pages/BusManager';
import { DriverPortal } from './pages/DriverPortal';
import { ExpenseEntry } from './pages/ExpenseEntry';
import { SalaryManager } from './pages/SalaryManager';
import { Cleanup } from './pages/Cleanup';
import { UserManager } from './pages/UserManager';
import { AccountantDashboard } from './pages/AccountantDashboard';
import { Cashbook } from './pages/Cashbook';
import { FeeCollectionPage } from './pages/FeeCollection';
import { AccountantReports } from './pages/AccountantReports';
import { DriverPerformance } from './pages/DriverPerformance';
import { CashManager } from './pages/CashManager';
import { useAuth } from './contexts/AuthContext';

const Home = () => {
  const { profile } = useAuth();
  if (profile?.role === 'driver' || profile?.role === 'helper') {
    return <DriverPortal />;
  }
  if (profile?.role === 'accountant') {
    return <AccountantDashboard />;
  }
  return <Dashboard />;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Home />} />
            <Route path="cleanup" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Cleanup />
              </ProtectedRoute>
            } />
            <Route path="users" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <UserManager />
              </ProtectedRoute>
            } />
            <Route path="entry" element={
              <ProtectedRoute allowedRoles={['admin', 'accountant']}>
                <DailyEntry />
              </ProtectedRoute>
            } />
            <Route path="expenses" element={
              <ProtectedRoute allowedRoles={['admin', 'accountant']}>
                <ExpenseEntry />
              </ProtectedRoute>
            } />
            <Route path="accountant" element={
              <ProtectedRoute allowedRoles={['admin', 'accountant']}>
                <AccountantDashboard />
              </ProtectedRoute>
            } />
            <Route path="cashbook" element={
              <ProtectedRoute allowedRoles={['admin', 'accountant']}>
                <Cashbook />
              </ProtectedRoute>
            } />
            <Route path="cash" element={
              <ProtectedRoute allowedRoles={['admin', 'accountant']}>
                <CashManager />
              </ProtectedRoute>
            } />
            <Route path="fees" element={
              <ProtectedRoute allowedRoles={['admin', 'accountant']}>
                <FeeCollectionPage />
              </ProtectedRoute>
            } />
            <Route path="monthly" element={
              <ProtectedRoute allowedRoles={['admin', 'accountant']}>
                <MonthlyView />
              </ProtectedRoute>
            } />
            <Route path="reports" element={
              <ProtectedRoute allowedRoles={['admin', 'accountant']}>
                <AccountantReports />
              </ProtectedRoute>
            } />
            <Route path="staff" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <StaffManager />
              </ProtectedRoute>
            } />
            <Route path="admin/drivers/:id" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <DriverPerformance />
              </ProtectedRoute>
            } />
            <Route path="salaries" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SalaryManager />
              </ProtectedRoute>
            } />
            <Route path="buses" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <BusManager />
              </ProtectedRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
