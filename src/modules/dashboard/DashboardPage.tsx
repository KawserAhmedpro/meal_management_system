import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import {
  calculateMonthSummary,
  calculateAllManagerAssignmentPeriods,
  calculateManagerAssignmentDashboardOverview,
} from '../../utils/calculations';
import { formatMonthName } from '../../utils/formatters';
import { StatCards } from './StatCards';
import { ManagerAssignmentSummaryCard } from '../../components/managers/ManagerAssignmentSummaryCard';
import { QuickActions } from './QuickActions';
import { DashboardCharts } from './DashboardCharts';
import { RecentExpenses } from './RecentExpenses';
import { RecentDeposits } from './RecentDeposits';
import { Calendar, Building, MapPin, Globe, Share2, ExternalLink } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { selectedMonth, settings, publicPortalUrl } = useApp();

  // Selected manager ID for controlling the entire dashboard
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');

  // Reactive live queries from IndexedDB (exclude soft-deleted tombstones)
  const members = useLiveQuery(() => db.members.filter((m) => !m._isDeleted).toArray(), []) || [];
  const managers =
    useLiveQuery(() => db.managers.orderBy('startDate').filter((m) => !m._isDeleted).toArray(), []) || [];

  // All entries across all dates for comprehensive Manager Assignment-Period Accounting
  const allMealEntries = useLiveQuery(() => db.mealEntries.filter((m) => !m._isDeleted).toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.filter((e) => !e._isDeleted).toArray(), []) || [];
  const allDeposits = useLiveQuery(() => db.deposits.filter((d) => !d._isDeleted).toArray(), []) || [];
  const allClosures = useLiveQuery(() => db.dailyClosures.filter((c) => !c._isDeleted).toArray(), []) || [];

  // 1. Compute assignment period summaries for all managers
  const managerAssignmentSummaries = useMemo(() => {
    return calculateAllManagerAssignmentPeriods(
      managers,
      allMealEntries,
      allExpenses,
      allClosures,
      settings.managerFeePerMeal || 5
    );
  }, [managers, allMealEntries, allExpenses, allClosures, settings.managerFeePerMeal]);

  // 2. Determine effective selected manager ID (default to active manager, or first manager)
  const effectiveSelectedManagerId = useMemo(() => {
    if (
      selectedManagerId &&
      managerAssignmentSummaries.some((s) => s.managerId === selectedManagerId)
    ) {
      return selectedManagerId;
    }
    const active = managerAssignmentSummaries.find((s) => s.isCurrentlyActive);
    if (active) return active.managerId;
    return managerAssignmentSummaries[0]?.managerId || '';
  }, [selectedManagerId, managerAssignmentSummaries]);

  // 3. Find selected manager object
  const selectedManager = useMemo(() => {
    return managers.find((m) => m.id === effectiveSelectedManagerId) || null;
  }, [managers, effectiveSelectedManagerId]);

  // 4. Calculate full Dashboard overview scoped to the selected manager's assignment period
  const managerPeriodData = useMemo(() => {
    if (!selectedManager) return null;
    return calculateManagerAssignmentDashboardOverview(
      selectedManager,
      members,
      allMealEntries,
      allExpenses,
      allDeposits,
      allClosures,
      settings.managerFeePerMeal || 5
    );
  }, [
    selectedManager,
    members,
    allMealEntries,
    allExpenses,
    allDeposits,
    allClosures,
    settings.managerFeePerMeal,
  ]);

  // 5. Fallback month data if no manager exists or is selected
  const monthData = useMemo(() => {
    const mMeals = allMealEntries.filter((m) => m.month === selectedMonth);
    const mExpenses = allExpenses.filter((e) => e.month === selectedMonth);
    const mDeposits = allDeposits.filter((d) => d.month === selectedMonth);
    const mClosures = allClosures.filter((c) => c.month === selectedMonth);
    return calculateMonthSummary(
      selectedMonth,
      members,
      mMeals,
      mExpenses,
      mDeposits,
      settings.managerFeePerMeal || 5,
      mClosures,
      managers
    );
  }, [
    selectedMonth,
    members,
    allMealEntries,
    allExpenses,
    allDeposits,
    allClosures,
    settings.managerFeePerMeal,
    managers,
  ]);

  // Effective Dashboard data sources based on manager selection
  const activeOverview = managerPeriodData ? managerPeriodData.overview : monthData.overview;
  const activeMemberSummaries = managerPeriodData
    ? managerPeriodData.memberSummaries
    : monthData.memberSummaries;
  const activeExpenses = managerPeriodData
    ? managerPeriodData.periodExpenses
    : allExpenses.filter((e) => e.month === selectedMonth);
  const activeMealEntries = managerPeriodData
    ? managerPeriodData.periodMealEntries
    : allMealEntries.filter((m) => m.month === selectedMonth);
  const activeDeposits = managerPeriodData
    ? managerPeriodData.periodDeposits
    : allDeposits.filter((d) => d.month === selectedMonth);

  const periodDateRange = managerPeriodData
    ? {
        startDate: managerPeriodData.managerSummary.startDate,
        endDate: managerPeriodData.managerSummary.effectiveEndDate,
      }
    : undefined;

  const periodLabel = managerPeriodData
    ? `${managerPeriodData.managerSummary.managerName} (${managerPeriodData.managerSummary.startDate} → ${managerPeriodData.managerSummary.effectiveEndDate})`
    : undefined;

  const activeManagers = managers.filter((m) => m.status === 'Active');
  const activeManagerDisplay =
    activeManagers.map((m) => m.name).join(', ') || settings.managerName || 'Manager';

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
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {settings.hallName || 'Omar Ekushe Hall'} — Manager:{' '}
                {selectedManager ? selectedManager.name : activeManagerDisplay}
              </h2>
              {selectedManager && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    selectedManager.status === 'Active'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-700/80 text-slate-300 border border-slate-600'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      selectedManager.status === 'Active'
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-slate-400'
                    }`}
                  />
                  {selectedManager.status === 'Active' ? 'Active Manager' : 'Resigned Manager'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {selectedManager && managerPeriodData ? (
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Assignment Period:{' '}
                  <strong className="text-emerald-300 font-semibold">
                    {managerPeriodData.managerSummary.startDate} →{' '}
                    {managerPeriodData.managerSummary.effectiveEndDate}
                  </strong>{' '}
                  ({managerPeriodData.managerSummary.totalDaysAssigned} calendar days
                  {selectedManager.status === 'Active' ? ' — live through today' : ''}).
                </p>
              ) : (
                <p className="text-slate-300 text-xs sm:text-sm flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Financial & meal management overview for{' '}
                  <strong className="text-emerald-300 font-semibold">
                    {formatMonthName(selectedMonth)}
                  </strong>
                  .
                </p>
              )}
              {activeOverview.fullOffDatesCount > 0 && (
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {activeOverview.fullOffDatesCount} Full Meal OFF{' '}
                  {activeOverview.fullOffDatesCount === 1 ? 'Day' : 'Days'}
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
                {selectedManager ? 'Assignment Tenure' : 'Active Cycle'}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white block">
                {selectedManager && managerPeriodData
                  ? `${managerPeriodData.managerSummary.startDate} → ${managerPeriodData.managerSummary.effectiveEndDate}`
                  : formatMonthName(selectedMonth)}
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

      {/* Manager Assignment Period Accounting Summary (Controls Entire Dashboard via Dropdown) */}
      {managerAssignmentSummaries.length > 0 && (
        <ManagerAssignmentSummaryCard
          summaries={managerAssignmentSummaries}
          currencySymbol={settings.currencySymbol}
          selectedManagerId={effectiveSelectedManagerId}
          onSelectManagerId={(id) => setSelectedManagerId(id)}
        />
      )}

      {/* 8 Core Financial & Mess Summary Cards (Recalculated for Selected Manager) */}
      <StatCards overview={activeOverview} currencySymbol={settings.currencySymbol} />

      {/* Quick Action Center */}
      <QuickActions />

      {/* Charts Module (Recalculated for Selected Manager) */}
      <DashboardCharts
        expenses={activeExpenses}
        mealEntries={activeMealEntries}
        memberSummaries={activeMemberSummaries}
        currencySymbol={settings.currencySymbol}
        selectedMonth={selectedMonth}
        periodLabel={periodLabel}
        dateRange={periodDateRange}
      />

      {/* Recent Activities: Expenses & Deposits (Scoped to Selected Manager's Period) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentExpenses expenses={activeExpenses} currencySymbol={settings.currencySymbol} />
        <RecentDeposits deposits={activeDeposits} currencySymbol={settings.currencySymbol} />
      </div>
    </div>
  );
};
