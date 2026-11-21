import React, { useState } from 'react';
import { ManagerAssignmentPeriodSummary } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatNumber, formatCurrency, formatDate } from '../../utils/formatters';
import {
  UserCheck,
  Calendar,
  Utensils,
  ShoppingCart,
  TrendingUp,
  Award,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';

interface ManagerAssignmentSummaryCardProps {
  summaries: ManagerAssignmentPeriodSummary[];
  currencySymbol?: string;
  title?: string;
  subtitle?: string;
}

export const ManagerAssignmentSummaryCard: React.FC<ManagerAssignmentSummaryCardProps> = ({
  summaries,
  currencySymbol = '৳',
  title = 'Manager Assignment Period Accounting',
  subtitle = 'Actual assignment-period financial calculations (independent of calendar months)',
}) => {
  const [selectedManagerId, setSelectedManagerId] = useState<string>(
    () => summaries.find((s) => s.isCurrentlyActive)?.managerId || summaries[0]?.managerId || ''
  );

  if (summaries.length === 0) {
    return (
      <Card className="p-6 bg-white border border-slate-200/80 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3 text-slate-500">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          <p className="text-sm font-medium">No manager assignments configured yet.</p>
        </div>
      </Card>
    );
  }

  const currentSummary =
    summaries.find((s) => s.managerId === selectedManagerId) || summaries[0];

  return (
    <Card className="overflow-hidden border border-slate-200/90 rounded-3xl shadow-sm bg-white">
      {/* Header */}
      <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-800 text-white relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-400 tracking-wider uppercase">
                Assignment-Period Accounting Layer
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <UserCheck className="w-6 h-6 text-emerald-400" />
              <span>{title}</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">{subtitle}</p>
          </div>

          {/* Manager Selector Pill / Dropdown if multiple managers */}
          {summaries.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 rounded-2xl p-1.5 self-start sm:self-auto">
              <span className="text-xs font-semibold text-slate-400 px-2">Manager:</span>
              <select
                value={selectedManagerId}
                onChange={(e) => setSelectedManagerId(e.target.value)}
                className="bg-slate-900 text-white text-xs font-bold rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                {summaries.map((s) => (
                  <option key={s.managerId} value={s.managerId}>
                    {s.managerName} ({s.status} — {s.startDate})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Manager Details Banner */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-base font-extrabold text-white flex items-center gap-2">
              <span>{currentSummary.managerName}</span>
              {currentSummary.isCurrentlyActive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Active Manager
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300 border border-slate-600">
                  Resigned / Completed Period
                </span>
              )}
            </span>

            <span className="text-slate-400">•</span>

            <span className="text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {currentSummary.startDate} →{' '}
                {currentSummary.isCurrentlyActive
                  ? `${currentSummary.effectiveEndDate} (Live through today)`
                  : currentSummary.endDate || currentSummary.effectiveEndDate}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="bg-slate-800 px-2.5 py-1 rounded-xl text-slate-300 font-semibold border border-slate-700/80">
              {currentSummary.totalDaysAssigned} Calendar Days
            </span>
            {currentSummary.fullOffDaysCount > 0 && (
              <span className="bg-rose-950/60 text-rose-300 border border-rose-800/50 px-2 py-1 rounded-xl font-semibold">
                {currentSummary.fullOffDaysCount} Full OFF {currentSummary.fullOffDaysCount === 1 ? 'Day' : 'Days'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4 Core Financial Stat Metrics */}
      <div className="p-6 bg-slate-50/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Meals */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs hover:border-slate-300 transition">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <Utensils className="w-4 h-4 text-emerald-600" />
                <span>Total Meals</span>
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">
                ON=1, Double=2
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {formatNumber(currentSummary.totalMeals)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Effective meals served in assignment period
            </p>
          </div>

          {/* Card 2: Market Expenses */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs hover:border-slate-300 transition">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                <span>Market Expenses</span>
              </span>
              <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded border border-blue-200">
                Bazaar Only
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {currencySymbol}{formatNumber(currentSummary.totalMarketExpenses)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Procurement expenses within period
            </p>
          </div>

          {/* Card 3: Meal Rate (Market Only - Excludes Manager Fee) */}
          <div className="bg-emerald-50/40 rounded-2xl p-4 border border-emerald-200/80 shadow-2xs hover:border-emerald-300 transition">
            <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span className="font-bold">Meal Rate</span>
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-300">
                Market ÷ Meals
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight">
              {currencySymbol}{currentSummary.mealRate.toFixed(2)}
              <span className="text-xs font-semibold text-emerald-600 ml-1">/ meal</span>
            </div>
            <p className="text-[11px] text-emerald-800 font-medium mt-1">
              Manager Fee is strictly NOT added
            </p>
          </div>

          {/* Card 4: Manager Fee (Separated) */}
          <div className="bg-amber-50/40 rounded-2xl p-4 border border-amber-200/80 shadow-2xs hover:border-amber-300 transition">
            <div className="flex items-center justify-between text-amber-800 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-600" />
                <span className="font-bold">Manager Fee</span>
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-300">
                @{currencySymbol}{currentSummary.feeRatePerMeal}/meal
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-800 tracking-tight">
              {currencySymbol}{formatNumber(currentSummary.totalManagerFee)}
            </div>
            <p className="text-[11px] text-amber-800 font-medium mt-1">
              Accounted separately from meal rate
            </p>
          </div>
        </div>

        {/* Calculation Policy & Formula Explanation Note */}
        <div className="mt-4 p-3.5 bg-white border border-slate-200/80 rounded-2xl flex items-start gap-2.5 text-xs text-slate-600">
          <HelpCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              Assignment Period Accounting Rule (Option A):
            </p>
            <p className="text-slate-600 leading-relaxed">
              • <strong>Meal Rate ({currencySymbol}{currentSummary.mealRate.toFixed(2)})</strong> = Total Market Expenses ({currencySymbol}{formatNumber(currentSummary.totalMarketExpenses)}) ÷ Total Meals ({formatNumber(currentSummary.totalMeals)}).
              <br />
              • <strong>Manager Fee ({currencySymbol}{formatNumber(currentSummary.totalManagerFee)})</strong> = {formatNumber(currentSummary.totalMeals)} effective meals × {currencySymbol}{currentSummary.feeRatePerMeal}/meal.
              <br />
              • FULL_OFF closure dates are excluded from meal totals. Calculation covers all dates within the manager's tenure ({currentSummary.startDate} to {currentSummary.effectiveEndDate}).
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};
