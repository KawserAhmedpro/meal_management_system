import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { calculateMonthSummary } from '../../utils/calculations';
import { formatMonthName } from '../../utils/formatters';
import { StatCards } from './StatCards';
import { QuickActions } from './QuickActions';
import { DashboardCharts } from './DashboardCharts';
import { RecentExpenses } from './RecentExpenses';
import { RecentDeposits } from './RecentDeposits';
import { Calendar, Building, MapPin } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { selectedMonth, settings } = useApp();

  // Reactive live queries from IndexedDB
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const mealEntries =
    useLiveQuery(
      () => db.mealEntries.where('month').equals(selectedMonth).toArray(),
      [selectedMonth]
    ) || [];
  const expenses =
    useLiveQuery(
      () => db.expenses.where('month').equals(selectedMonth).toArray(),
      [selectedMonth]
    ) || [];
  const deposits =
    useLiveQuery(
      () => db.deposits.where('month').equals(selectedMonth).toArray(),
      [selectedMonth]
    ) || [];

  // Calculate actual statistics from IndexedDB records
  const { overview, memberSummaries } = calculateMonthSummary(
    selectedMonth,
    members,
    mealEntries,
    expenses,
    deposits,
    settings.managerFeePerMeal || 5
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner / Welcome Info */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-40 top-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-1.5">
              <Building className="w-3.5 h-3.5" />
              <span>{settings.institutionName || 'Mymensingh Engineering College'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {settings.hallName || 'Omar Ekushe Hall'} — Manager: {settings.managerName || 'Manager'}
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-xl flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Financial & meal management overview for{' '}
              <strong className="text-emerald-300 font-semibold">{formatMonthName(selectedMonth)}</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-3.5 self-start md:self-auto shrink-0 shadow-inner">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Active Cycle
              </span>
              <span className="text-sm font-bold text-white block">
                {formatMonthName(selectedMonth)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 8 Core Financial & Mess Summary Cards */}
      <StatCards overview={overview} currencySymbol={settings.currencySymbol} />

      {/* Quick Action Center */}
      <QuickActions />

      {/* Charts Module */}
      <DashboardCharts
        expenses={expenses}
        mealEntries={mealEntries}
        memberSummaries={memberSummaries}
        currencySymbol={settings.currencySymbol}
        selectedMonth={selectedMonth}
      />

      {/* Recent Activities: Expenses & Deposits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentExpenses expenses={expenses} currencySymbol={settings.currencySymbol} />
        <RecentDeposits deposits={deposits} currencySymbol={settings.currencySymbol} />
      </div>
    </div>
  );
};
