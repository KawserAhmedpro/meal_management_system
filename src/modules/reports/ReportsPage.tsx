import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { calculateMonthSummary } from '../../utils/calculations';
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
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { selectedMonth, settings } = useApp();
  const [selectedReport, setSelectedReport] = useState<
    | 'monthly-meal'
    | 'daily-meal'
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

  // Monthly Calculations
  const { overview, memberSummaries } = useMemo(() => {
    return calculateMonthSummary(
      selectedMonth,
      members,
      mealEntries,
      expenses,
      deposits,
      settings.managerFeePerMeal || 5
    );
  }, [selectedMonth, members, mealEntries, expenses, deposits, settings.managerFeePerMeal]);

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
    { id: 'monthly-meal', name: 'Monthly Meal Report', icon: UtensilsCrossed },
    { id: 'daily-meal', name: 'Daily Meal Report', icon: Calendar },
    { id: 'expenses', name: 'Market Expense Report', icon: ShoppingCart },
    { id: 'deposits', name: 'Member Deposit Report', icon: Receipt },
    { id: 'dues', name: 'Member Due & Advance Report', icon: AlertTriangle },
    { id: 'financial', name: 'Full Financial Statement', icon: FileText },
    { id: 'room-meal', name: 'Room-wise Meal Report', icon: DoorClosed },
  ];

  // Excel Export Handler
  const handleExcelExport = () => {
    exportMonthToExcel(selectedMonth, members, mealEntries, expenses, deposits, settings);
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

        {/* Report 5, 6, 7, 8: Full Statements / Lists */}
        {(selectedReport === 'monthly-meal' ||
          selectedReport === 'financial' ||
          selectedReport === 'expenses' ||
          selectedReport === 'deposits') && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="py-3 px-4">Room No</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-3 text-center">Meals</th>
                  <th className="py-3 px-3 text-right">Meal Cost</th>
                  <th className="py-3 px-3 text-right">Mgr Fee</th>
                  <th className="py-3 px-3 text-right">Total Payable</th>
                  <th className="py-3 px-3 text-right">Total Deposits</th>
                  <th className="py-3 px-4 text-right">Due / Advance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberSummaries.map((s) => (
                  <tr key={s.member.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold">{s.member.room}</td>
                    <td className="py-3 px-4 font-semibold">{s.member.name}</td>
                    <td className="py-3 px-3 text-center font-mono">{s.totalMeals}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatCurrency(s.mealExpenseWithoutFee)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatCurrency(s.managerFee)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold">{formatCurrency(s.totalPayable)}</td>
                    <td className="py-3 px-3 text-right font-mono text-blue-600">{formatCurrency(s.totalDeposits)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {s.due > 0 ? (
                        <span className="text-rose-600">{formatCurrency(s.due)} Due</span>
                      ) : s.due < 0 ? (
                        <span className="text-emerald-600">
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
        )}
      </Card>
    </div>
  );
};
