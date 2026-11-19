import React from 'react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';

interface RecentExpensesProps {
  expenses: Expense[];
  currencySymbol?: string;
}

export const RecentExpenses: React.FC<RecentExpensesProps> = ({
  expenses,
  currencySymbol = '৳',
}) => {
  const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader
        title="Recent Market Expenses"
        subtitle="Latest raw food & utility expenditures"
        action={
          <Link
            to="/expenses"
            className="text-xs text-emerald-600 font-semibold hover:underline"
          >
            View All
          </Link>
        }
      />
      <CardContent className="p-0 flex-1">
        {recent.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No expenses recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((exp) => (
              <div key={exp.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 line-clamp-1">{exp.title}</h4>
                    <span className="text-[11px] text-slate-400">
                      {formatDate(exp.date)} • {exp.category}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-slate-800">
                    {formatCurrency(exp.amount, currencySymbol)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
