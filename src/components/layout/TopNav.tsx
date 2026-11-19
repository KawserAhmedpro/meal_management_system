import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Menu,
  ChevronLeft,
  ChevronRight,
  Plus,
  Lock,
  Calendar,
  AlertCircle,
  UtensilsCrossed,
  ShoppingCart,
  Receipt,
  UserPlus,
} from 'lucide-react';
import { formatMonthName } from '../../utils/formatters';
import { Button } from '../ui/Button';

interface TopNavProps {
  onToggleSidebar: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ onToggleSidebar }) => {
  const {
    selectedMonth,
    setSelectedMonth,
    settings,
    lockApp,
    setActiveQuickModal,
  } = useApp();

  // Change month by delta (-1 or +1)
  const handleMonthChange = (delta: number) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    const nextY = date.getFullYear();
    const nextM = String(date.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${nextY}-${nextM}`);
  };

  const currentDateFormatted = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left side: Hamburger (mobile) & Month selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          aria-label="Toggle Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Month Selector Card */}
        <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200/60 shadow-inner">
          <button
            onClick={() => handleMonthChange(-1)}
            title="Previous Month"
            className="p-1 rounded-lg hover:bg-white hover:text-slate-900 text-slate-500 transition-colors shadow-xs"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-3 py-0.5 text-xs font-bold text-slate-800 flex items-center gap-1.5 min-w-[125px] justify-center">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            <span>{formatMonthName(selectedMonth)}</span>
          </div>
          <button
            onClick={() => handleMonthChange(1)}
            title="Next Month"
            className="p-1 rounded-lg hover:bg-white hover:text-slate-900 text-slate-500 transition-colors shadow-xs"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Today's date pill */}
        <div className="hidden md:flex items-center text-xs text-slate-500 font-medium pl-2 border-l border-slate-200">
          <span>{currentDateFormatted}</span>
        </div>
      </div>

      {/* Right side: Quick Action Buttons & Admin Controls */}
      <div className="flex items-center gap-2">
        {/* Quick Actions Dropdown / Group */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="text-xs bg-emerald-50/50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            icon={<UtensilsCrossed className="w-3.5 h-3.5 text-emerald-600" />}
            onClick={() => setActiveQuickModal('meal')}
          >
            Add Meal
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="text-xs bg-amber-50/50 border-amber-200 text-amber-700 hover:bg-amber-100"
            icon={<ShoppingCart className="w-3.5 h-3.5 text-amber-600" />}
            onClick={() => setActiveQuickModal('expense')}
          >
            Add Cost
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="text-xs bg-blue-50/50 border-blue-200 text-blue-700 hover:bg-blue-100"
            icon={<Receipt className="w-3.5 h-3.5 text-blue-600" />}
            onClick={() => setActiveQuickModal('deposit')}
          >
            Deposit
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            icon={<UserPlus className="w-3.5 h-3.5 text-slate-600" />}
            onClick={() => setActiveQuickModal('member')}
          >
            Member
          </Button>
        </div>

        {/* Mobile Quick Action button */}
        <div className="sm:hidden">
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setActiveQuickModal('meal')}
          >
            Action
          </Button>
        </div>

        {/* Backup Reminder Warning icon if no backup made */}
        {!settings.lastBackupDate && (
          <div
            title="Warning: No database backup created yet! Go to Backup & Restore to download a copy."
            className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center animate-pulse"
          >
            <AlertCircle className="w-4 h-4" />
          </div>
        )}

        {/* PIN Lock button if enabled */}
        {settings.pinLockEnabled && (
          <button
            onClick={lockApp}
            title="Lock Session"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors border border-slate-200"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}

        {/* Admin profile pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">
            {(settings.managerName || 'Manager').substring(0, 2).toUpperCase()}
          </div>
          <div className="hidden lg:block text-left text-xs leading-tight">
            <span className="font-bold text-slate-800 block truncate max-w-[120px]">
              {settings.managerName || 'Manager'}
            </span>
            <span className="text-[10px] text-slate-500">Mess Manager</span>
          </div>
        </div>
      </div>
    </header>
  );
};
