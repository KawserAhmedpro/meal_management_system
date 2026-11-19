import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ManagerModal } from './ManagerModal';
import { DailyClosureModal } from './DailyClosureModal';
import { ManagerPeriod, DailyMealClosure } from '../../types';
import { calculateMonthSummary, isDateFullOff, isManagerActiveOnDate } from '../../utils/calculations';
import { formatCurrency } from '../../utils/formatters';
import {
  Users,
  Calendar,
  CalendarDays,
  CalendarOff,
  UserCheck,
  UserX,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Info,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export const ManagersAndClosuresPage: React.FC = () => {
  const { selectedMonth, settings } = useApp();
  const [activeTab, setActiveTab] = useState<'managers' | 'closures'>('managers');

  // Modals state
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [managerToEdit, setManagerToEdit] = useState<ManagerPeriod | null>(null);

  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  const [closureTargetDate, setClosureTargetDate] = useState<string | undefined>();
  const [closureToEdit, setClosureToEdit] = useState<DailyMealClosure | null>(null);

  // Quick Resign Modal
  const [resignManager, setResignManager] = useState<ManagerPeriod | null>(null);
  const [resignationDate, setResignationDate] = useState<string>('');

  // Delete dialogs
  const [managerToDelete, setManagerToDelete] = useState<ManagerPeriod | null>(null);
  const [closureToDelete, setClosureToDelete] = useState<DailyMealClosure | null>(null);

  // IndexedDB live queries
  const managers = useLiveQuery(() => db.managers.orderBy('startDate').toArray(), []) || [];
  const closures = useLiveQuery(
    () => db.dailyClosures.where('month').equals(selectedMonth).toArray(),
    [selectedMonth]
  ) || [];

  const members = useLiveQuery(() => db.members.toArray()) || [];
  const meals = useLiveQuery(() => db.meals.where('month').equals(selectedMonth).toArray(), [selectedMonth]) || [];
  const expenses = useLiveQuery(() => db.expenses.where('month').equals(selectedMonth).toArray(), [selectedMonth]) || [];
  const deposits = useLiveQuery(() => db.deposits.where('month').equals(selectedMonth).toArray(), [selectedMonth]) || [];

  // Month calculation with Option A manager fees and daily closures
  const { overview } = calculateMonthSummary(
    selectedMonth,
    members,
    meals,
    expenses,
    deposits,
    settings.managerFeePerMeal,
    closures,
    managers
  );

  // Days in selected month
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const monthNum = parseInt(monthStr);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dayStr = String(d).padStart(2, '0');
    const dateStr = `${selectedMonth}-${dayStr}`;
    const dateObj = new Date(year, monthNum - 1, d);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const closure = closures.find((c) => c.date === dateStr);
    const isFullOff = closure?.status === 'FULL_OFF';

    // Find active manager on this day
    const activeMgr = managers.find((m) => isManagerActiveOnDate(m, dateStr));

    // Meals on this date
    const dateMeals = meals.filter((m) => m.date === dateStr);
    const rawMealsCount = dateMeals.reduce((sum, m) => sum + (m.count || 0), 0);
    const effectiveMealsCount = isFullOff ? 0 : rawMealsCount;

    return {
      day: d,
      date: dateStr,
      dayName,
      closure,
      isFullOff,
      activeMgr,
      rawMealsCount,
      effectiveMealsCount,
    };
  });

  const fullOffCount = monthDays.filter((d) => d.isFullOff).length;
  const regularDaysCount = daysInMonth - fullOffCount;

  // Active manager count
  const activeManagers = managers.filter((m) => m.status === 'Active');

  // Handle Quick Resignation
  const handleQuickResign = async () => {
    if (!resignManager || !resignationDate) return;
    try {
      await db.managers.update(resignManager.id, {
        endDate: resignationDate,
        status: 'Resigned',
        updatedAt: Date.now(),
      });
      setResignManager(null);
      setResignationDate('');
    } catch (err) {
      console.error('Failed to update resignation date', err);
    }
  };

  // Handle Quick Toggle Closure (ON <-> OFF)
  const handleToggleClosure = async (dayInfo: typeof monthDays[0]) => {
    try {
      if (dayInfo.isFullOff) {
        // Toggle to regular ON -> remove record from closures
        await db.dailyClosures.delete(dayInfo.date);
      } else {
        // Toggle to FULL OFF with default reason
        await db.dailyClosures.put({
          date: dayInfo.date,
          month: selectedMonth,
          status: 'FULL_OFF',
          reason: 'Mess Closed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } catch (err) {
      console.error('Failed to toggle closure', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Managers & Daily Closures
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage manager assignment history, resignations, and full mess closures for {selectedMonth}
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('managers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'managers'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Manager History ({managers.length})
          </button>
          <button
            onClick={() => setActiveTab('closures')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'closures'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarOff className="w-4 h-4" />
            Holidays & Closures ({fullOffCount})
          </button>
        </div>
      </div>

      {/* ======================= TAB 1: MANAGER HISTORY ======================= */}
      {activeTab === 'managers' && (
        <div className="space-y-6">
          {/* Top Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Active Manager(s)"
              value={activeManagers.map((m) => m.name).join(', ') || 'None'}
              subtitle={`${activeManagers.length} currently assigned`}
              icon={UserCheck}
              variant="default"
            />
            <StatCard
              title="Total Managers Logged"
              value={managers.length}
              subtitle="All historical periods"
              icon={Users}
              variant="default"
            />
            <StatCard
              title="Meals Served (This Month)"
              value={overview.totalMeals}
              subtitle="Across active manager dates"
              icon={Calendar}
              variant="default"
            />
            <StatCard
              title="Total Manager Fee"
              value={formatCurrency(overview.totalManagerFees)}
              subtitle={`Option A: Actual Meals × ৳${settings.managerFeePerMeal}`}
              icon={ShieldCheck}
              variant="warning"
            />
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Manager Assignment & Resignation History</h2>
              <p className="text-xs text-slate-500">
                Track exact tenure start dates, resignation dates (inclusive), and Option A earned fees
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                setManagerToEdit(null);
                setIsManagerModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Assign New Manager
            </Button>
          </div>

          {/* Manager History Cards & Table */}
          {managers.length === 0 ? (
            <Card className="text-center py-12">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800">No Managers Added Yet</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                Assign your first manager to track dynamic meal counts and fee calculations.
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  setManagerToEdit(null);
                  setIsManagerModalOpen(true);
                }}
              >
                Assign Manager
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Detailed Manager Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {managers.map((mgr) => {
                  const calc = overview.managerCalculations.find((c) => c.manager.id === mgr.id);
                  const mealsCount = calc ? calc.mealsServed : 0;
                  const feeAmt = calc ? calc.feeAmount : 0;
                  const rate = mgr.feeRateOverride !== undefined ? mgr.feeRateOverride : settings.managerFeePerMeal;

                  return (
                    <Card
                      key={mgr.id}
                      className={`relative border-2 transition-all ${
                        mgr.status === 'Active'
                          ? 'border-emerald-200 bg-emerald-50/20 shadow-sm'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-base">{mgr.name}</h3>
                            <Badge variant={mgr.status === 'Active' ? 'success' : 'neutral'}>
                              {mgr.status}
                            </Badge>
                          </div>
                          {mgr.phone && <p className="text-xs text-slate-500 mt-0.5">{mgr.phone}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setManagerToEdit(mgr);
                              setIsManagerModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Edit Manager"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setManagerToDelete(mgr)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Assignment Dates */}
                      <div className="bg-white p-3 rounded-xl border border-slate-100 text-xs space-y-1.5 mb-3">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Assignment Date:</span>
                          <span className="font-semibold text-slate-800">{mgr.startDate}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Resignation Date:</span>
                          <span className="font-semibold text-slate-800">
                            {mgr.endDate ? mgr.endDate : <span className="text-emerald-600">Currently Active</span>}
                          </span>
                        </div>
                        {mgr.notes && (
                          <div className="pt-1 border-t border-slate-100 text-slate-600 italic">
                            "{mgr.notes}"
                          </div>
                        )}
                      </div>

                      {/* Fee & Meal Calculation Summary (Option A) */}
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs space-y-1 mb-4">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Rate per Meal:</span>
                          <span className="font-bold text-slate-700">৳{rate}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Meals in {selectedMonth}:</span>
                          <span className="font-bold text-slate-900">{mealsCount} meals</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-200">
                          <span className="font-semibold text-slate-800">Manager Fee Earned:</span>
                          <span className="font-black text-emerald-700 text-sm">
                            {formatCurrency(feeAmt)}
                          </span>
                        </div>
                      </div>

                      {/* Quick Resign Button if active */}
                      {mgr.status === 'Active' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setResignManager(mgr);
                            setResignationDate(`${selectedMonth}-${String(new Date().getDate()).padStart(2, '0')}`);
                          }}
                          className="w-full text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200"
                        >
                          <UserX className="w-3.5 h-3.5 mr-1.5" />
                          Set Resignation Date
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* Complete Manager History Table */}
              <Card padding="none" className="overflow-hidden mt-6">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-bold text-sm text-slate-800">Manager Assignment Records (Chronological)</h3>
                  <span className="text-xs text-slate-500">{managers.length} records</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Manager Name</th>
                        <th className="py-3 px-4">Phone</th>
                        <th className="py-3 px-4">Start Date</th>
                        <th className="py-3 px-4">End Date (Resignation)</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-center">Meals ({selectedMonth})</th>
                        <th className="py-3 px-4 text-center">Fee Rate</th>
                        <th className="py-3 px-4 text-right">Fee Earned</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {managers.map((mgr) => {
                        const calc = overview.managerCalculations.find((c) => c.manager.id === mgr.id);
                        const mealsCount = calc ? calc.mealsServed : 0;
                        const feeAmt = calc ? calc.feeAmount : 0;
                        const rate = mgr.feeRateOverride !== undefined ? mgr.feeRateOverride : settings.managerFeePerMeal;

                        return (
                          <tr key={mgr.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900">{mgr.name}</td>
                            <td className="py-3 px-4 text-slate-500">{mgr.phone || '—'}</td>
                            <td className="py-3 px-4 text-slate-700">{mgr.startDate}</td>
                            <td className="py-3 px-4 text-slate-700 font-medium">
                              {mgr.endDate ? (
                                mgr.endDate
                              ) : (
                                <span className="text-emerald-600 font-bold">Present (Active)</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant={mgr.status === 'Active' ? 'success' : 'neutral'}>
                                {mgr.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-slate-900">{mealsCount}</td>
                            <td className="py-3 px-4 text-center text-slate-600">৳{rate}</td>
                            <td className="py-3 px-4 text-right font-black text-emerald-700">
                              {formatCurrency(feeAmt)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setManagerToEdit(mgr);
                                    setIsManagerModalOpen(true);
                                  }}
                                  className="text-slate-400 hover:text-slate-700 p-1"
                                  title="Edit"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setManagerToDelete(mgr)}
                                  className="text-slate-400 hover:text-rose-600 p-1"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: DAILY MEAL CLOSURES & HOLIDAYS ======================= */}
      {activeTab === 'closures' && (
        <div className="space-y-6">
          {/* Closures Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Month Days"
              value={`${daysInMonth} Days`}
              subtitle={`Total days in ${selectedMonth}`}
              icon={Calendar}
              variant="default"
            />
            <StatCard
              title="Full Meal OFF / Closures"
              value={`${fullOffCount} Days`}
              subtitle="All meals set to 0"
              icon={CalendarOff}
              variant="danger"
            />
            <StatCard
              title="Regular Dining Days"
              value={`${regularDaysCount} Days`}
              subtitle="Normal dining active"
              icon={CheckCircle}
              variant="success"
            />
            <StatCard
              title="Monthly Actual Meals"
              value={overview.totalMeals}
              subtitle="Excluding all FULL OFF days"
              icon={ShieldCheck}
              variant="default"
            />
          </div>

          {/* Action Row & Info Box */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Daily Meal ON/OFF Calendar ({selectedMonth})
              </h2>
              <p className="text-xs text-slate-500">
                Mark holidays, vacations, or emergency closures. When FULL OFF, all meal counts are calculated as 0 while individual records remain safely preserved in DB.
              </p>
            </div>
            <Button
              variant="danger"
              onClick={() => {
                setClosureToEdit(null);
                setClosureTargetDate(`${selectedMonth}-01`);
                setIsClosureModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <CalendarOff className="w-4 h-4" />
              Mark Holiday / Closure
            </Button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-800">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Option A Rule & Data Protection: </span>
              Marking a day as <span className="font-bold text-rose-700">FULL MEAL OFF</span> automatically sets all member meals for that date to 0 and excludes that date from manager fees. If you turn it back ON, previous member entries are instantly restored without any loss.
            </div>
          </div>

          {/* Interactive Date-by-Date Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {monthDays.map((dayInfo) => {
              const isOff = dayInfo.isFullOff;

              return (
                <div
                  key={dayInfo.date}
                  className={`rounded-xl border p-3 flex flex-col justify-between transition-all ${
                    isOff
                      ? 'border-rose-300 bg-rose-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  {/* Date and weekday */}
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {String(dayInfo.day).padStart(2, '0')}
                      </div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">
                        {dayInfo.dayName}
                      </div>
                    </div>
                    {isOff ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-rose-600 text-white tracking-wider">
                        OFF
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                        ON
                      </span>
                    )}
                  </div>

                  {/* Closure reason or Active Manager */}
                  <div className="text-xs mb-3 space-y-1">
                    {isOff ? (
                      <div className="text-rose-700 font-semibold line-clamp-1 text-[11px]" title={dayInfo.closure?.reason}>
                        🛑 {dayInfo.closure?.reason || 'Closed'}
                      </div>
                    ) : (
                      <div className="text-slate-500 text-[11px] truncate">
                        👤 {dayInfo.activeMgr ? dayInfo.activeMgr.name : 'Manager'}
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400">
                      {isOff ? (
                        <span>Meals: <strong className="text-rose-600">0</strong> (Raw: {dayInfo.rawMealsCount})</span>
                      ) : (
                        <span>Meals: <strong className="text-slate-700">{dayInfo.effectiveMealsCount}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleToggleClosure(dayInfo)}
                      className={`flex-1 py-1 px-1.5 rounded text-[10px] font-bold transition-colors ${
                        isOff
                          ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                          : 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                      }`}
                      title={isOff ? 'Turn regular ON' : 'Turn full OFF'}
                    >
                      {isOff ? 'Set ON' : 'Set OFF'}
                    </button>
                    {isOff && (
                      <button
                        onClick={() => {
                          setClosureToEdit(dayInfo.closure || null);
                          setClosureTargetDate(dayInfo.date);
                          setIsClosureModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                        title="Edit Reason"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* List of Closures in Selected Month */}
          <Card padding="none" className="overflow-hidden mt-6">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-slate-800">
                  Full Meal OFF Days in {selectedMonth}
                </h3>
                <p className="text-xs text-slate-500">Official mess closure schedule</p>
              </div>
              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                {fullOffCount} Days Closed
              </span>
            </div>

            {closures.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No closures or holidays logged for this month. All days are regular dining days.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Reason / Holiday Name</th>
                      <th className="py-3 px-4 text-center">Raw Meals Excluded</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {closures.map((c) => {
                      const dayMeals = meals.filter((m) => m.date === c.date);
                      const rawMeals = dayMeals.reduce((sum, m) => sum + (m.count || 0), 0);

                      return (
                        <tr key={c.date} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">{c.date}</td>
                          <td className="py-3 px-4">
                            <Badge variant={c.status === 'FULL_OFF' ? 'danger' : 'success'}>
                              {c.status === 'FULL_OFF' ? 'FULL MEAL OFF' : 'FULL MEAL ON'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-semibold">
                            {c.reason || 'General Mess Closure'}
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-rose-600">
                            {rawMeals} meals (set to 0)
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setClosureToEdit(c);
                                  setClosureTargetDate(c.date);
                                  setIsClosureModalOpen(true);
                                }}
                                className="text-slate-400 hover:text-slate-700 p-1"
                                title="Edit Reason"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setClosureToDelete(c)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="Delete Closure (Restore Regular Meals)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ======================= MODALS ======================= */}
      {/* Manager Add/Edit Modal */}
      <ManagerModal
        isOpen={isManagerModalOpen}
        onClose={() => {
          setIsManagerModalOpen(false);
          setManagerToEdit(null);
        }}
        managerToEdit={managerToEdit}
        existingManagers={managers}
      />

      {/* Daily Closure Modal */}
      <DailyClosureModal
        isOpen={isClosureModalOpen}
        onClose={() => {
          setIsClosureModalOpen(false);
          setClosureToEdit(null);
          setClosureTargetDate(undefined);
        }}
        targetDate={closureTargetDate}
        existingClosure={closureToEdit}
      />

      {/* Quick Resignation Modal */}
      {resignManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Set Manager Resignation Date
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Recording resignation for <span className="font-semibold text-slate-800">{resignManager.name}</span>. The manager fee will be calculated through this date (inclusive).
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Last Working Date (Resignation Date)
                </label>
                <input
                  type="date"
                  value={resignationDate}
                  min={resignManager.startDate}
                  onChange={(e) => setResignationDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setResignManager(null);
                    setResignationDate('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleQuickResign}
                  disabled={!resignationDate}
                >
                  Save Resignation
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Manager Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(managerToDelete)}
        title="Delete Manager Record?"
        message={`Are you sure you want to delete ${managerToDelete?.name}? This record will be permanently removed.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={async () => {
          if (managerToDelete) {
            await db.managers.delete(managerToDelete.id);
            setManagerToDelete(null);
          }
        }}
        onClose={() => setManagerToDelete(null)}
      />

      {/* Delete Closure Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(closureToDelete)}
        title="Restore Regular Meals on this Date?"
        message={`Removing closure on ${closureToDelete?.date} will immediately restore all members' regular meal counts and include this date in manager fee calculations.`}
        confirmText="Restore Regular Meals"
        variant="warning"
        onConfirm={async () => {
          if (closureToDelete) {
            await db.dailyClosures.delete(closureToDelete.date);
            setClosureToDelete(null);
          }
        }}
        onClose={() => setClosureToDelete(null)}
      />
    </div>
  );
};
