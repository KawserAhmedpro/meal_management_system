import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { MembersPage } from './modules/members/MembersPage';
import { MealManagementPage } from './modules/meals/MealManagementPage';
import { ManagersAndClosuresPage } from './modules/managers/ManagersAndClosuresPage';
import { ExpensesPage } from './modules/expenses/ExpensesPage';
import { TransactionsPage } from './modules/transactions/TransactionsPage';
import { ReportsPage } from './modules/reports/ReportsPage';
import { PrintCenterPage } from './modules/print/PrintCenterPage';
import { BackupRestorePage } from './modules/backup/BackupRestorePage';
import { SettingsPage } from './modules/settings/SettingsPage';

export function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="meals" element={<MealManagementPage />} />
              <Route path="managers" element={<ManagersAndClosuresPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="print" element={<PrintCenterPage />} />
              <Route path="backup" element={<BackupRestorePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
