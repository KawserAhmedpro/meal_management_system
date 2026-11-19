import React from 'react';
import { StatCard } from '../../components/ui/StatCard';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { MonthFinancialOverview } from '../../types';
import {
  Users,
  UtensilsCrossed,
  ShoppingCart,
  TrendingUp,
  Receipt,
  Scale,
  BadgePercent,
  AlertTriangle,
} from 'lucide-react';

interface StatCardsProps {
  overview: MonthFinancialOverview;
  currencySymbol?: string;
}

export const StatCards: React.FC<StatCardsProps> = ({
  overview,
  currencySymbol = '৳',
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Members */}
      <StatCard
        title="Total Members"
        value={overview.totalMembers}
        subtitle={`${overview.activeMembers} Active Members`}
        icon={<Users className="w-5 h-5 text-indigo-600" />}
        iconBgColor="bg-indigo-50"
      />

      {/* 2. Total Meals */}
      <StatCard
        title="Total Meals"
        value={formatNumber(overview.totalMeals, 0)}
        subtitle="Consumed this month"
        icon={<UtensilsCrossed className="w-5 h-5 text-emerald-600" />}
        iconBgColor="bg-emerald-50"
      />

      {/* 3. Total Market Expenses */}
      <StatCard
        title="Total Market Expenses"
        value={formatCurrency(overview.totalExpenses, currencySymbol)}
        subtitle="Raw grocery & market costs"
        icon={<ShoppingCart className="w-5 h-5 text-amber-600" />}
        iconBgColor="bg-amber-50"
      />

      {/* 4. Meal Rate */}
      <StatCard
        title="Meal Rate"
        value={formatCurrency(overview.mealRate, currencySymbol)}
        subtitle="Cost per single meal"
        icon={<TrendingUp className="w-5 h-5 text-teal-600" />}
        iconBgColor="bg-teal-50"
      />

      {/* 5. Total Deposits */}
      <StatCard
        title="Total Deposits"
        value={formatCurrency(overview.totalDeposits, currencySymbol)}
        subtitle="Collected from members"
        icon={<Receipt className="w-5 h-5 text-blue-600" />}
        iconBgColor="bg-blue-50"
      />

      {/* 6. Total Meal Expenses */}
      <StatCard
        title="Total Meal Expenses"
        value={formatCurrency(overview.totalMealExpenses, currencySymbol)}
        subtitle="Without manager fee"
        icon={<Scale className="w-5 h-5 text-cyan-600" />}
        iconBgColor="bg-cyan-50"
      />

      {/* 7. Total Manager Fees */}
      <StatCard
        title="Total Manager Fees"
        value={formatCurrency(overview.totalManagerFees, currencySymbol)}
        subtitle="Fee collected per meal"
        icon={<BadgePercent className="w-5 h-5 text-purple-600" />}
        iconBgColor="bg-purple-50"
      />

      {/* 8. Total Outstanding Due */}
      <StatCard
        title="Total Outstanding Due"
        value={formatCurrency(overview.totalDue, currencySymbol)}
        subtitle={
          overview.totalAdvance > 0
            ? `Advance / Credit: ${formatCurrency(overview.totalAdvance, currencySymbol)}`
            : 'Uncollected balance'
        }
        icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
        iconBgColor="bg-rose-50"
      />
    </div>
  );
};
