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
import { DeveloperTools } from './pages/DeveloperTools';
import { UserManager } from './pages/UserManager';
import { AccountantDashboard } from './pages/AccountantDashboard';
import { Cashbook } from './pages/Cashbook';
import { StudentDatabase } from './pages/StudentDatabase';
import { FeeCollectionPage } from './pages/FeeCollection';
import { InvoiceReceipt } from './pages/InvoiceReceipt';
import { AccountantReports } from './pages/AccountantReports';
import { DriverPerformance } from './pages/DriverPerformance';
import { Settings } from './pages/Settings';
import { ComingSoon } from './pages/ComingSoon';
import { ErrorBoundary } from './components/ErrorBoundary';
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
    <ErrorBoundary>
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
              <Route path="dev-tools" element={
                <ProtectedRoute allowedRoles={['admin', 'developer']}>
                  <DeveloperTools />
                </ProtectedRoute>
              } />
              <Route path="users" element={
                <ProtectedRoute allowedRoles={['admin', 'developer']}>
                  <UserManager />
                </ProtectedRoute>
              } />
              <Route path="entry" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <DailyEntry />
                </ProtectedRoute>
              } />
              <Route path="expenses" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <ExpenseEntry />
                </ProtectedRoute>
              } />
              <Route path="accountant" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <AccountantDashboard />
                </ProtectedRoute>
              } />
              <Route path="cashbook" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <Cashbook />
                </ProtectedRoute>
              } />
              <Route path="fees" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <Navigate to="/fees/collection" replace />
                </ProtectedRoute>
              } />
              <Route path="fees/collection" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <FeeCollectionPage />
                </ProtectedRoute>
              } />
              <Route path="fees/students" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <StudentDatabase />
                </ProtectedRoute>
              } />
              <Route path="fees/invoices" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <InvoiceReceipt />
                </ProtectedRoute>
              } />
              <Route path="fees/analysis" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <ComingSoon title="Tracking & Analysis" />
                </ProtectedRoute>
              } />
              <Route path="monthly" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <MonthlyView />
                </ProtectedRoute>
              } />
              <Route path="reports" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <AccountantReports />
                </ProtectedRoute>
              } />
              <Route path="staff" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <StaffManager />
                </ProtectedRoute>
              } />
              <Route path="admin/drivers/:id" element={
                <ProtectedRoute allowedRoles={['admin', 'developer']}>
                  <DriverPerformance />
                </ProtectedRoute>
              } />
              <Route path="salaries" element={
                <ProtectedRoute allowedRoles={['admin', 'accountant', 'developer']}>
                  <SalaryManager />
                </ProtectedRoute>
              } />
              <Route path="buses" element={
                <ProtectedRoute allowedRoles={['admin', 'developer']}>
                  <BusManager />
                </ProtectedRoute>
              } />
              <Route path="settings" element={
                <ProtectedRoute allowedRoles={['admin', 'developer']}>
                  <Settings />
                </ProtectedRoute>
              } />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
