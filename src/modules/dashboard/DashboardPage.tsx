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
import { Calendar, Building, MapPin, Globe, Share2, ExternalLink } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { selectedMonth, settings, publicPortalUrl } = useApp();

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
  const closures =
    useLiveQuery(
      () => db.dailyClosures.where('month').equals(selectedMonth).toArray(),
      [selectedMonth]
    ) || [];
  const managers =
    useLiveQuery(() => db.managers.orderBy('startDate').toArray(), []) || [];

  // Calculate actual statistics from IndexedDB records
  const { overview, memberSummaries } = calculateMonthSummary(
    selectedMonth,
    members,
    mealEntries,
    expenses,
    deposits,
    settings.managerFeePerMeal || 5,
    closures,
    managers
  );

  const activeManagers = managers.filter((m) => m.status === 'Active');
  const activeManagerDisplay = activeManagers.map((m) => m.name).join(', ') || settings.managerName || 'Manager';

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
              {settings.hallName || 'Omar Ekushe Hall'} — Manager: {activeManagerDisplay}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Financial & meal management overview for{' '}
                <strong className="text-emerald-300 font-semibold">{formatMonthName(selectedMonth)}</strong>.
              </p>
              {overview.fullOffDatesCount > 0 && (
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {overview.fullOffDatesCount} Full Meal OFF {overview.fullOffDatesCount === 1 ? 'Day' : 'Days'}
                </span>
              )}
            </div>
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

      {/* Public Portal Quick Banner */}
      <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-sm">Public Member Portal is Live</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">READ-ONLY</span>
            </div>
            <p className="text-xs text-slate-500">
              Members can view daily meals, market expenses, and meal rates without login. Personal deposits and dues are strictly protected.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              if (publicPortalUrl) {
                navigator.clipboard.writeText(publicPortalUrl);
                alert('Public Portal link copied to clipboard!\n' + publicPortalUrl);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition shadow-xs"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Copy Link</span>
          </button>
          <a
            href={`${import.meta.env.BASE_URL}public`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs"
          >
            <span>Open Portal</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
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
