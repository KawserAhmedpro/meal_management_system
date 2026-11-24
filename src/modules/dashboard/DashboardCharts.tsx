import React from 'react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { Expense, MealEntry, MemberFinancialSummary } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface DashboardChartsProps {
  expenses: Expense[];
  mealEntries: MealEntry[];
  memberSummaries: MemberFinancialSummary[];
  currencySymbol?: string;
  selectedMonth: string;
  periodLabel?: string;
  dateRange?: { startDate: string; endDate: string };
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

export const DashboardCharts: React.FC<DashboardChartsProps> = ({
  expenses,
  mealEntries,
  memberSummaries,
  currencySymbol = '৳',
  selectedMonth,
  periodLabel,
  dateRange,
}) => {
  // 1. Daily Meal Consumption Data
  let dailyMealChartData: { day: string; meals: number }[] = [];

  if (dateRange && dateRange.startDate && dateRange.endDate) {
    const dailyMealMap: { [dateStr: string]: number } = {};
    const curr = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);

    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;
      dailyMealMap[dateKey] = 0;
      curr.setDate(curr.getDate() + 1);
    }

    for (const entry of mealEntries) {
      if (dailyMealMap[entry.date] !== undefined) {
        dailyMealMap[entry.date] += entry.count || 0;
      }
    }

    dailyMealChartData = Object.keys(dailyMealMap).map((dateKey) => {
      const parts = dateKey.split('-');
      return {
        day: `${parts[1]}/${parts[2]}`,
        meals: dailyMealMap[dateKey],
      };
    });
  } else {
    const daysInMonth = new Date(
      parseInt(selectedMonth.split('-')[0]),
      parseInt(selectedMonth.split('-')[1]),
      0
    ).getDate();

    const dailyMealMap: { [key: number]: number } = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dailyMealMap[d] = 0;
    }

    for (const entry of mealEntries) {
      if (entry.month === selectedMonth) {
        const dayNum = parseInt(entry.date.split('-')[2]);
        if (dayNum) {
          dailyMealMap[dayNum] = (dailyMealMap[dayNum] || 0) + (entry.count || 0);
        }
      }
    }

    dailyMealChartData = Object.keys(dailyMealMap).map((dayStr) => ({
      day: `D${dayStr}`,
      meals: dailyMealMap[parseInt(dayStr)],
    }));
  }

  // 2. Category-wise Expenses Data
  const categoryMap: { [key: string]: number } = {};
  for (const exp of expenses) {
    const inScope = dateRange ? true : exp.month === selectedMonth;
    if (inScope) {
      const cat = exp.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + (exp.amount || 0);
    }
  }

  const categoryChartData = Object.keys(categoryMap).map((cat) => ({
    name: cat,
    value: categoryMap[cat],
  }));

  // 3. Top Outstanding Due Members
  const topDueMembers = [...memberSummaries]
    .filter((m) => m.due > 0)
    .sort((a, b) => b.due - a.due)
    .slice(0, 7)
    .map((m) => ({
      name: `${m.member.room} ${m.member.name.split(' ')[0]}`,
      due: m.due,
      deposits: m.totalDeposits,
      payable: m.totalPayable,
    }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* Chart 1: Daily Meal Consumption */}
      <Card>
        <CardHeader
          title="Daily Meal Consumption"
          subtitle={periodLabel ? `Daily meals served during ${periodLabel}` : `Total meals served per day for ${selectedMonth}`}
        />
        <CardContent>
          <div className="h-64 w-full">
            {mealEntries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No meal records entered yet for this month.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyMealChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(value: any) => [`${value} meals`, 'Meals Consumed']}
                    labelFormatter={(label) => `Day: ${label}`}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', border: 'none' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="meals"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ fill: '#10b981', r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chart 2: Category Breakdown */}
      <Card>
        <CardHeader
          title="Market Expense Breakdown"
          subtitle={periodLabel ? `Expense distribution for ${periodLabel}` : "Expense distribution by category"}
        />
        <CardContent>
          <div className="h-64 w-full flex items-center justify-center">
            {categoryChartData.length === 0 ? (
              <div className="text-xs text-slate-400">
                {periodLabel ? `No expenses recorded for ${periodLabel}.` : "No expenses recorded for this month."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(Number(value), currencySymbol), 'Amount']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', border: 'none' }}
                  />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chart 3: Top Due Members */}
      <Card className="lg:col-span-2">
        <CardHeader
          title="Top Member Outstanding Dues"
          subtitle="Members with highest pending payable balance"
        />
        <CardContent>
          <div className="h-64 w-full">
            {topDueMembers.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                All members are settled or have advance balances. No outstanding dues!
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDueMembers} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(Number(value), currencySymbol), 'Amount']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', border: 'none' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="due" name="Due Amount" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="deposits" name="Deposited" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="payable" name="Total Payable" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
