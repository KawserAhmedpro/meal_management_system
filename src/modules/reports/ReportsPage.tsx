import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { calculateMonthSummary, isManagerActiveOnDate } from '../../utils/calculations';
import { formatCurrency, formatDate, formatMonthName } from '../../utils/formatters';
import { exportMonthToExcel } from '../../utils/excelExporter';
import { exportTableToPdf } from '../../utils/pdfExporter';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import {
  FileBarChart2,
  Download,
  Printer,
  Search,
  Calendar,
  Layers,
  UtensilsCrossed,
  ShoppingCart,
  Receipt,
  AlertTriangle,
  DoorClosed,
  FileText,
  CalendarOff,
  UserCheck,
  History,
  ShieldCheck,
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { selectedMonth, settings } = useApp();
  const [selectedReport, setSelectedReport] = useState<
    | 'monthly-meal'
    | 'daily-meal'
    | 'meal-closures'
    | 'manager-history'
    | 'manager-fees'
    | 'expenses'
    | 'deposits'
    | 'dues'
    | 'financial'
    | 'summary'
    | 'room-meal'
  >('summary');

  const [searchQuery, setSearchQuery] = useState('');

  // Queries
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

  // Monthly Calculations with closures & Option A manager fees
  const { overview, memberSummaries } = useMemo(() => {
    return calculateMonthSummary(
      selectedMonth,
      members,
      mealEntries,
      expenses,
      deposits,
      settings.managerFeePerMeal || 5,
      closures,
      managers
    );
  }, [selectedMonth, members, mealEntries, expenses, deposits, settings.managerFeePerMeal, closures, managers]);

  // Days in month
  const [y, m] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  // Daily Meal Report calculation
  const dailyMealStats = useMemo(() => {
    const list = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${selectedMonth}-${dayStr}`;
      const dayMeals = mealEntries.filter((me) => me.date === dateStr);
      const totalCount = dayMeals.reduce((sum, me) => sum + (me.count || 0), 0);
      const onCount = dayMeals.filter((me) => me.type === 'ON').length;
      const doubleCount = dayMeals.filter((me) => me.type === 'Double').length;
      const offCount = dayMeals.filter((me) => me.type === 'OFF').length;
      list.push({
        day: d,
        date: dateStr,
        totalCount,
        onCount,
        doubleCount,
        offCount,
      });
    }
    return list;
  }, [selectedMonth, daysInMonth, mealEntries]);

  // Date-wise Meal ON/OFF Closure calculation
  const closureStats = useMemo(() => {
    const list = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${selectedMonth}-${dayStr}`;
      const dateObj = new Date(y, m - 1, d);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const closure = closures.find((c) => c.date === dateStr);
      const isFullOff = closure?.status === 'FULL_OFF';
      const dayMeals = mealEntries.filter((me) => me.date === dateStr);
      const rawCount = dayMeals.reduce((sum, me) => sum + (me.count || 0), 0);
      const effectiveCount = isFullOff ? 0 : rawCount;
      const activeMgr = managers.find((mgr) => isManagerActiveOnDate(mgr, dateStr));

      list.push({
        day: d,
        date: dateStr,
        dayName,
        status: isFullOff ? ('FULL_OFF' as const) : ('FULL_ON' as const),
        reason: isFullOff ? closure?.reason || 'Mess Closed' : 'Regular Dining',
        rawCount,
        effectiveCount,
        managerName: activeMgr?.name || settings.managerName || 'Manager',
      });
    }
    return list;
  }, [selectedMonth, daysInMonth, closures, mealEntries, managers, y, m, settings.managerName]);

  // Room-wise Meal Report calculation
  const roomMealStats = useMemo(() => {
    const roomMap = new Map<string, { room: string; floor: string; membersCount: number; totalMeals: number }>();
    for (const mem of members) {
      if (!roomMap.has(mem.room)) {
        roomMap.set(mem.room, {
          room: mem.room,
          floor: mem.floor,
          membersCount: 0,
          totalMeals: 0,
        });
      }
      const r = roomMap.get(mem.room)!;
      r.membersCount += 1;
    }

    for (const me of mealEntries) {
      const mem = members.find((m) => m.id === me.memberId);
      if (mem && roomMap.has(mem.room)) {
        roomMap.get(mem.room)!.totalMeals += me.count || 0;
      }
    }

    return Array.from(roomMap.values()).sort((a, b) =>
      a.room.localeCompare(b.room, undefined, { numeric: true })
    );
  }, [members, mealEntries]);

  // Report items list
  const reportsList = [
    { id: 'summary', name: 'Monthly Summary Report', icon: FileBarChart2 },
    { id: 'monthly-meal', name: 'Monthly Meal Summary', icon: UtensilsCrossed },
    { id: 'meal-closures', name: 'Date-wise Meal ON/OFF Report', icon: CalendarOff },
    { id: 'manager-history', name: 'Manager Assignment History', icon: History },
    { id: 'manager-fees', name: 'Manager Meal Count & Fee (Option A)', icon: UserCheck },
    { id: 'financial', name: 'Monthly Financial Statement', icon: FileText },
    { id: 'dues', name: 'Member Due & Advance Report', icon: AlertTriangle },
    { id: 'expenses', name: 'Market Expense Report', icon: ShoppingCart },
    { id: 'deposits', name: 'Member Deposit Report', icon: Receipt },
    { id: 'daily-meal', name: 'Daily Meal Roll Call Report', icon: Calendar },
    { id: 'room-meal', name: 'Room-wise Meal Report', icon: DoorClosed },
  ];

  // Excel Export Handler
  const handleExcelExport = () => {
    exportMonthToExcel(selectedMonth, members, mealEntries, expenses, deposits, settings, closures, managers);
  };

  // PDF Export Handler based on active report
  const handlePdfExport = () => {
    const sMonth = formatMonthName(selectedMonth);

    if (selectedReport === 'summary') {
      const headers = ['Metric', 'Value'];
      const rows = [
        ['Total Border Members', String(overview.totalMembers)],
        ['Active Mess Members', String(overview.activeMembers)],
        ['Total Meals Consumed', String(overview.totalMeals)],
        ['Total Market Expenses', formatCurrency(overview.totalExpenses, settings.currencySymbol)],
        ['Meal Rate (Cost per meal)', formatCurrency(overview.mealRate, settings.currencySymbol)],
        ['Manager Fee Per Meal', `৳ ${settings.managerFeePerMeal || 5}`],
        ['Total Meal Expenses (Without fee)', formatCurrency(overview.totalMealExpenses, settings.currencySymbol)],
        ['Total Manager Fees', formatCurrency(overview.totalManagerFees, settings.currencySymbol)],
        ['Total Payable Amount', formatCurrency(overview.totalPayable, settings.currencySymbol)],
        ['Total Deposits Collected', formatCurrency(overview.totalDeposits, settings.currencySymbol)],
        ['Total Outstanding Dues', formatCurrency(overview.totalDue, settings.currencySymbol)],
        ['Total Advance / Credit Balance', formatCurrency(overview.totalAdvance, settings.currencySymbol)],
      ];
      exportTableToPdf(
        `Monthly Summary Report - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth
      );
    } else if (selectedReport === 'dues') {
      const headers = ['Room No', 'Member Name', 'Total Meals', 'Total Payable', 'Total Deposits', 'Due / Advance', 'Status'];
      const rows = memberSummaries
        .filter((s) => s.due !== 0)
        .map((s) => [
          s.member.room,
          s.member.name,
          s.totalMeals,
          formatCurrency(s.totalPayable),
          formatCurrency(s.totalDeposits),
          s.due > 0 ? formatCurrency(s.due) : `-${formatCurrency(Math.abs(s.due))}`,
          s.due > 0 ? 'DUE' : 'ADVANCE',
        ]);
      exportTableToPdf(
        `Member Due & Advance Report - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth,
        [
          { label: 'Total Due', value: formatCurrency(overview.totalDue) },
          { label: 'Total Advance', value: formatCurrency(overview.totalAdvance) },
        ]
      );
    } else if (selectedReport === 'expenses') {
      const headers = ['Date', 'Category', 'Item Description', 'Cost (৳)'];
      const rows = expenses
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => [formatDate(e.date), e.category, e.title, formatCurrency(e.amount)]);
      exportTableToPdf(
        `Monthly Market Expense Report - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth,
        [{ label: 'Total Month Expense', value: formatCurrency(overview.totalExpenses) }]
      );
    } else if (selectedReport === 'deposits') {
      const headers = ['Date', 'Room No', 'Member Name', 'Method', 'Amount (৳)'];
      const rows = deposits
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => [formatDate(d.date), d.room, d.memberName, d.paymentMethod || 'Cash', formatCurrency(d.amount)]);
      exportTableToPdf(
        `Member Deposit Report - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth,
        [{ label: 'Total Deposits', value: formatCurrency(overview.totalDeposits) }]
      );
    } else if (selectedReport === 'daily-meal') {
      const headers = ['Date', 'Total Meals', 'ON (1)', 'Double (2)', 'OFF (0)'];
      const rows = dailyMealStats.map((d) => [
        formatDate(d.date),
        d.totalCount,
        d.onCount,
        d.doubleCount,
        d.offCount,
      ]);
      exportTableToPdf(
        `Daily Meal Consumption Report - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth,
        [{ label: 'Total Month Meals', value: String(overview.totalMeals) }]
      );
    } else if (selectedReport === 'room-meal') {
      const headers = ['Room No', 'Floor', 'Borders Count', 'Total Meals Consumed'];
      const rows = roomMealStats.map((r) => [
        r.room,
        r.floor,
        r.membersCount,
        r.totalMeals,
      ]);
      exportTableToPdf(
        `Room-wise Meal Report - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth,
        [{ label: 'Total Meals', value: String(overview.totalMeals) }]
      );
    } else if (selectedReport === 'meal-closures') {
      const headers = ['Date', 'Day', 'Status', 'Reason / Holiday', 'Raw Meals', 'Effective Meals', 'Manager'];
      const rows = closureStats.map((c) => [
        c.date,
        c.dayName,
        c.status === 'FULL_OFF' ? 'FULL MEAL OFF' : 'REGULAR ON',
        c.reason,
        c.rawCount,
        c.effectiveCount,
        c.managerName,
      ]);
      exportTableToPdf(
        `Date-wise Meal ON-OFF Report - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth,
        [
          { label: 'Full OFF Days', value: String(overview.fullOffDatesCount) },
          { label: 'Total Actual Meals', value: String(overview.totalMeals) },
        ]
      );
    } else if (selectedReport === 'manager-history') {
      const headers = ['Manager Name', 'Phone', 'Start Date', 'Resignation Date', 'Status', 'Notes'];
      const rows = managers.map((m) => [
        m.name,
        m.phone || '—',
        m.startDate,
        m.endDate || 'Active (Present)',
        m.status,
        m.notes || '—',
      ]);
      exportTableToPdf(
        `Manager Assignment & Resignation History - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth,
        [{ label: 'Total Managers Logged', value: String(managers.length) }]
      );
    } else if (selectedReport === 'manager-fees') {
      const headers = ['Manager Name', 'Active Period', 'Days Active', 'Meals Served', 'Rate (৳)', 'Earned Fee (৳)'];
      const rows = overview.managerCalculations.map((c) => [
        c.manager.name,
        `${c.activeStartDate} to ${c.activeEndDate}`,
        c.activeDaysCount,
        c.mealsServed,
        `৳${c.ratePerMeal}`,
        formatCurrency(c.feeAmount),
      ]);
      exportTableToPdf(
        `Manager-wise Actual Meal Count & Fee (Option A) - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth,
        [{ label: 'Total Manager Fees', value: formatCurrency(overview.totalManagerFees) }]
      );
    } else {
      // Default / Financial statement
      const headers = ['Room No', 'Member Name', 'Meals', 'Meal Cost', 'Mgr Fee', 'Payable', 'Deposits', 'Due/Adv'];
      const rows = memberSummaries.map((s) => [
        s.member.room,
        s.member.name,
        s.totalMeals,
        formatCurrency(s.mealExpenseWithoutFee),
        formatCurrency(s.managerFee),
        formatCurrency(s.totalPayable),
        formatCurrency(s.totalDeposits),
        s.due > 0 ? formatCurrency(s.due) : `-${formatCurrency(Math.abs(s.due))}`,
      ]);
      exportTableToPdf(
        `Full Financial Statement - ${sMonth}`,
        headers,
        rows,
        settings,
        selectedMonth
      );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileBarChart2 className="w-6 h-6 text-purple-600" />
            Reports & Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real database analytics, printable audit sheets, and exports for{' '}
            <strong>{formatMonthName(selectedMonth)}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-4 h-4 text-emerald-600" />}
            onClick={handleExcelExport}
          >
            Export All to Excel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Printer className="w-4 h-4" />}
            onClick={handlePdfExport}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {/* Reports Selector Tabs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {reportsList.map((r) => {
          const Icon = r.icon;
          const isActive = selectedReport === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedReport(r.id as any)}
              className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md font-bold'
                  : 'bg-white text-slate-700 border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  isActive ? 'bg-slate-800 text-emerald-400' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-xs tracking-tight leading-tight line-clamp-2">{r.name}</span>
            </button>
          );
        })}
      </div>

      {/* Report Content Container */}
      <Card className="overflow-hidden">
        {/* Report 1: Monthly Summary Report */}
        {selectedReport === 'summary' && (
          <div>
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Monthly Mess Summary ({formatMonthName(selectedMonth)})
              </h3>
              <Badge variant="purple">Official Financial Audit</Badge>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Mess & Border Metrics
                  </h4>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Registered Members:</span>
                      <strong className="text-slate-900">{overview.totalMembers}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Active Borders in Mess:</span>
                      <strong className="text-emerald-600">{overview.activeMembers}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Meals Consumed:</span>
                      <strong className="text-slate-900">{overview.totalMeals} meals</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Manager Fee Per Meal:</span>
                      <strong className="text-slate-900">৳ {settings.managerFeePerMeal || 5}</strong>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Financial Performance
                  </h4>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Market Expenses:</span>
                      <strong className="text-amber-700 font-mono">
                        {formatCurrency(overview.totalExpenses, settings.currencySymbol)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Calculated Meal Rate:</span>
                      <strong className="text-teal-700 font-mono">
                        {formatCurrency(overview.mealRate, settings.currencySymbol)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Deposits Collected:</span>
                      <strong className="text-blue-600 font-mono">
                        {formatCurrency(overview.totalDeposits, settings.currencySymbol)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Payable Amount:</span>
                      <strong className="text-slate-900 font-mono">
                        {formatCurrency(overview.totalPayable, settings.currencySymbol)}
                      </strong>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200">
                      <span className="text-rose-700 font-bold">Uncollected Dues:</span>
                      <strong className="text-rose-700 font-mono">
                        {formatCurrency(overview.totalDue, settings.currencySymbol)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-700 font-bold">Advance Credit / Refundable:</span>
                      <strong className="text-emerald-700 font-mono">
                        {formatCurrency(overview.totalAdvance, settings.currencySymbol)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Report 2: Due & Advance Report */}
        {selectedReport === 'dues' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="py-3 px-4">Room No</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-3 text-center">Meals</th>
                  <th className="py-3 px-3 text-right">Total Payable</th>
                  <th className="py-3 px-3 text-right">Total Deposits</th>
                  <th className="py-3 px-4 text-right">Outstanding Due / Advance</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberSummaries
                  .filter((s) => s.due !== 0)
                  .sort((a, b) => b.due - a.due)
                  .map((s) => (
                    <tr key={s.member.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold">{s.member.room}</td>
                      <td className="py-3 px-4 font-semibold">{s.member.name}</td>
                      <td className="py-3 px-3 text-center font-mono">{s.totalMeals}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatCurrency(s.totalPayable)}</td>
                      <td className="py-3 px-3 text-right font-mono text-blue-600">
                        {formatCurrency(s.totalDeposits)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        {s.due > 0 ? (
                          <span className="text-rose-600">{formatCurrency(s.due)}</span>
                        ) : (
                          <span className="text-emerald-600">
                            -{formatCurrency(Math.abs(s.due))}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={s.due > 0 ? 'danger' : 'success'} size="sm">
                          {s.due > 0 ? 'DUE' : 'ADVANCE'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report 3: Daily Meal Report */}
        {selectedReport === 'daily-meal' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-center">Total Meals Consumed</th>
                  <th className="py-3 px-4 text-center">ON (1 meal)</th>
                  <th className="py-3 px-4 text-center">Double (2 meals)</th>
                  <th className="py-3 px-4 text-center">OFF (0 meals)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyMealStats.map((d) => (
                  <tr key={d.day} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">{formatDate(d.date)}</td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900 font-mono">
                      {d.totalCount}
                    </td>
                    <td className="py-3 px-4 text-center text-emerald-600 font-bold">{d.onCount}</td>
                    <td className="py-3 px-4 text-center text-blue-600 font-bold">{d.doubleCount}</td>
                    <td className="py-3 px-4 text-center text-rose-500 font-bold">{d.offCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report: Date-wise Meal ON/OFF Closures */}
        {selectedReport === 'meal-closures' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Date-wise Meal ON/OFF & Mess Closures ({formatMonthName(selectedMonth)})
                </h3>
                <p className="text-xs text-slate-500">
                  Full list of daily dining statuses. On FULL MEAL OFF days, meal counts are zeroed out while records remain safe.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  {overview.fullOffDatesCount} Full OFF Days
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {daysInMonth - overview.fullOffDatesCount} Regular Days
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Day</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Reason / Holiday</th>
                    <th className="py-3 px-4 text-center">Raw Meals Logged</th>
                    <th className="py-3 px-4 text-center">Effective Meals Count</th>
                    <th className="py-3 px-4">Active Manager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {closureStats.map((c) => (
                    <tr
                      key={c.date}
                      className={
                        c.status === 'FULL_OFF'
                          ? 'bg-rose-50/50 hover:bg-rose-50'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-3 px-4 font-bold font-mono text-slate-900">{c.date}</td>
                      <td className="py-3 px-4 text-slate-500 font-medium">{c.dayName}</td>
                      <td className="py-3 px-4">
                        <Badge variant={c.status === 'FULL_OFF' ? 'danger' : 'success'}>
                          {c.status === 'FULL_OFF' ? 'FULL MEAL OFF' : 'REGULAR ON'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-semibold">{c.reason}</td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">{c.rawCount}</td>
                      <td className="py-3 px-4 text-center font-mono font-black">
                        {c.status === 'FULL_OFF' ? (
                          <span className="text-rose-600">0 (Excluded)</span>
                        ) : (
                          <span className="text-emerald-700">{c.effectiveCount}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{c.managerName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Report: Manager Assignment & Resignation History */}
        {selectedReport === 'manager-history' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Manager Assignment & Resignation History
                </h3>
                <p className="text-xs text-slate-500">
                  Official appointment periods, inclusive resignation dates, and status log
                </p>
              </div>
              <Badge variant="default">{managers.length} Records</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Manager Name</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Assignment Start Date</th>
                    <th className="py-3 px-4">Resignation / Last Working Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Notes / Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {managers.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900 text-sm">{m.name}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono">{m.phone || '—'}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{m.startDate}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {m.endDate ? (
                          m.endDate
                        ) : (
                          <span className="text-emerald-600 font-bold">Present (Active)</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={m.status === 'Active' ? 'success' : 'neutral'}>
                          {m.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-500 italic">{m.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Report: Manager-wise Actual Meal Count & Fee (Option A) */}
        {selectedReport === 'manager-fees' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Manager-wise Actual Meal Count & Fee (Option A) — {formatMonthName(selectedMonth)}
                </h3>
                <p className="text-xs text-slate-500">
                  Formula: Manager Fee = Actual Meals Served During Active Tenure × Fee Rate
                </p>
              </div>
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-xl font-bold text-xs">
                Total Manager Fees: {formatCurrency(overview.totalManagerFees)}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Manager Name</th>
                    <th className="py-3 px-4">Active Dates in Month</th>
                    <th className="py-3 px-4 text-center">Days Active</th>
                    <th className="py-3 px-4 text-center">Actual Meals Served</th>
                    <th className="py-3 px-4 text-center">Fee Rate</th>
                    <th className="py-3 px-4 text-right">Earned Manager Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {overview.managerCalculations.map((c) => (
                    <tr key={c.manager.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                        {c.manager.name}
                        {c.manager.status === 'Active' && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {c.activeStartDate} to {c.activeEndDate}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">{c.activeDaysCount} days</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                        {c.mealsServed} meals
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600">
                        ৳{c.ratePerMeal} / meal
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-700 text-sm">
                        {formatCurrency(c.feeAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                  <tr>
                    <td colSpan={3} className="py-3 px-4 uppercase tracking-wider text-slate-600">
                      Grand Total Manager Fees:
                    </td>
                    <td className="py-3 px-4 text-center text-slate-900 font-mono">
                      {overview.totalMeals} meals
                    </td>
                    <td className="py-3 px-4"></td>
                    <td className="py-3 px-4 text-right text-emerald-700 text-sm font-black font-mono">
                      {formatCurrency(overview.totalManagerFees)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="p-4 bg-amber-50/70 border-t border-amber-200 text-xs text-amber-900 space-y-1">
              <span className="font-bold">Option A Rule Details:</span>
              <p>
                Each manager only earns fees for actual meals served during their active assignment period (between Start Date and Inclusive Resignation Date). Dates before appointment, dates after resignation, and all FULL MEAL OFF days are strictly excluded from calculations.
              </p>
            </div>
          </div>
        )}

        {/* Report 4: Room-wise Meal Report */}
        {selectedReport === 'room-meal' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="py-3 px-4">Room No</th>
                  <th className="py-3 px-4">Floor</th>
                  <th className="py-3 px-4 text-center">Borders Count</th>
                  <th className="py-3 px-4 text-right">Total Meals Consumed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roomMealStats.map((r) => (
                  <tr key={r.room} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{r.room}</td>
                    <td className="py-3 px-4 text-slate-600">{r.floor}</td>
                    <td className="py-3 px-4 text-center font-mono">{r.membersCount}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 text-sm">
                      {r.totalMeals}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report 5: Monthly Meal Summary */}
        {selectedReport === 'monthly-meal' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Monthly Member Meal Summary ({formatMonthName(selectedMonth)})
                </h3>
                <p className="text-xs text-slate-500">
                  Member-by-member breakdown of actual dining meals and accrued fees
                </p>
              </div>
              <div className="text-xs font-bold text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-xl">
                Grand Total Meals: <span className="text-emerald-700">{overview.totalMeals} meals</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Room No</th>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-3 text-center">Raw Meals</th>
                    <th className="py-3 px-3 text-center">Effective Meals</th>
                    <th className="py-3 px-3 text-right">Meal Cost (৳)</th>
                    <th className="py-3 px-3 text-right">Manager Fee (৳)</th>
                    <th className="py-3 px-4 text-right">Total Payable (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {memberSummaries.map((s) => (
                    <tr key={s.member.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.member.room}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{s.member.name}</td>
                      <td className="py-3 px-3 text-center font-mono text-slate-500">{s.rawMealsCount}</td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-emerald-700">
                        {s.totalMeals}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{formatCurrency(s.mealExpenseWithoutFee)}</td>
                      <td className="py-3 px-3 text-right font-mono text-amber-700 font-semibold">{formatCurrency(s.managerFee)}</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                        {formatCurrency(s.totalPayable)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Report 6: Full Financial Statement */}
        {selectedReport === 'financial' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Monthly Financial Statement ({formatMonthName(selectedMonth)})
                </h3>
                <p className="text-xs text-slate-500">
                  Consolidated accounting of deposits, market costs, manager remuneration, and member dues
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {overview.managerCalculations.map((c) => (
                  <span
                    key={c.manager.id}
                    className="text-[11px] font-bold bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700"
                  >
                    Fee ({c.manager.name}): <strong className="text-emerald-700">{formatCurrency(c.feeAmount)}</strong>
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Room No</th>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-3 text-center">Meals</th>
                    <th className="py-3 px-3 text-right">Meal Cost</th>
                    <th className="py-3 px-3 text-right">Mgr Fee</th>
                    <th className="py-3 px-3 text-right">Total Payable</th>
                    <th className="py-3 px-3 text-right">Deposits</th>
                    <th className="py-3 px-4 text-right">Due / Advance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {memberSummaries.map((s) => (
                    <tr key={s.member.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.member.room}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{s.member.name}</td>
                      <td className="py-3 px-3 text-center font-mono">{s.totalMeals}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatCurrency(s.mealExpenseWithoutFee)}</td>
                      <td className="py-3 px-3 text-right font-mono text-amber-700">{formatCurrency(s.managerFee)}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(s.totalPayable)}</td>
                      <td className="py-3 px-3 text-right font-mono text-blue-600 font-semibold">{formatCurrency(s.totalDeposits)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        {s.due > 0 ? (
                          <span className="text-rose-600 font-black">{formatCurrency(s.due)} Due</span>
                        ) : s.due < 0 ? (
                          <span className="text-emerald-600 font-black">
                            -{formatCurrency(Math.abs(s.due))} Adv.
                          </span>
                        ) : (
                          <span className="text-slate-400">0.00</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Report 7: Expenses */}
        {selectedReport === 'expenses' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Item Description</th>
                  <th className="py-3 px-4 text-right">Amount (৳)</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {expenses
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-800">{formatDate(e.date)}</td>
                      <td className="py-3 px-4">
                        <Badge variant="default">{e.category}</Badge>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{e.title}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(e.amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 italic">{e.notes || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report 8: Deposits */}
        {selectedReport === 'deposits' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Room No</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4 text-right">Deposit Amount (৳)</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {deposits
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-800">{formatDate(d.date)}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{d.room}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{d.memberName}</td>
                      <td className="py-3 px-4 text-slate-600">{d.paymentMethod || 'Cash'}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-600">
                        {formatCurrency(d.amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 italic">{d.note || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
