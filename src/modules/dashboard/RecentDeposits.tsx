import React from 'react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Deposit } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';

interface RecentDepositsProps {
  deposits: Deposit[];
  currencySymbol?: string;
}

export const RecentDeposits: React.FC<RecentDepositsProps> = ({
  deposits,
  currencySymbol = '৳',
}) => {
  const recent = [...deposits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader
        title="Recent Member Deposits"
        subtitle="Latest advance payments recorded"
        action={
          <Link
            to="/transactions"
            className="text-xs text-emerald-600 font-semibold hover:underline"
          >
            View All
          </Link>
        }
      />
      <CardContent className="p-0 flex-1">
        {recent.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No deposits recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((dep) => (
              <div key={dep.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 line-clamp-1">
                      {dep.memberName} ({dep.room})
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      {formatDate(dep.date)} • {dep.paymentMethod || 'Cash'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-600">
                    +{formatCurrency(dep.amount, currencySymbol)}
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
