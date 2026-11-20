import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { PinModal } from './PinModal';
import { useApp } from '../../context/AppContext';
import { MemberModal } from '../../modules/members/MemberModal';
import { ExpenseModal } from '../../modules/expenses/ExpenseModal';
import { DepositModal } from '../../modules/transactions/DepositModal';
import { DailyMealQuickModal } from '../../modules/meals/DailyMealQuickModal';
import { PWAUpdateNotification } from '../common/PWAUpdateNotification';
import { AlertCircle, ShieldAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showBackupAlert, setShowBackupAlert] = useState(true);
  const { activeQuickModal, setActiveQuickModal, settings } = useApp();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Optional PIN Lock */}
      <PinModal />

      {/* Sidebar for Desktop & Mobile drawer */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col flex-1 min-w-0">
        {/* Top Navigation */}
        <TopNav onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        {/* Local Storage / Backup Warning Banner */}
        {showBackupAlert && !settings.lastBackupDate && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-800 flex items-center justify-between no-print">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Local Storage Notice:</strong> All data is stored in your local browser IndexedDB.
                To prevent data loss, please export regular JSON backups in{' '}
                <Link to="/backup" className="font-bold underline text-amber-900 hover:text-black">
                  Backup & Restore
                </Link>
                .
              </span>
            </div>
            <button
              onClick={() => setShowBackupAlert(false)}
              className="text-amber-600 hover:text-amber-900 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Quick Action Modals */}
      {activeQuickModal === 'meal' && (
        <DailyMealQuickModal
          isOpen={true}
          onClose={() => setActiveQuickModal(null)}
        />
      )}

      {activeQuickModal === 'expense' && (
        <ExpenseModal
          isOpen={true}
          onClose={() => setActiveQuickModal(null)}
        />
      )}

      {activeQuickModal === 'deposit' && (
        <DepositModal
          isOpen={true}
          onClose={() => setActiveQuickModal(null)}
        />
      )}

      {activeQuickModal === 'member' && (
        <MemberModal
          isOpen={true}
          onClose={() => setActiveQuickModal(null)}
        />
      )}

      {/* PWA New Version Available Update Prompt */}
      <PWAUpdateNotification />
    </div>
  );
};
