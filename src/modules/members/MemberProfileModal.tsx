import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Member, MealEntry, Deposit } from '../../types';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { formatCurrency, formatDate, formatMonthName } from '../../utils/formatters';
import { Badge } from '../../components/ui/Badge';
import {
  User,
  Phone,
  DoorClosed,
  Layers,
  Calendar,
  UtensilsCrossed,
  Receipt,
  FileText,
} from 'lucide-react';

interface MemberProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
}

export const MemberProfileModal: React.FC<MemberProfileModalProps> = ({
  isOpen,
  onClose,
  member,
}) => {
  const { selectedMonth, settings } = useApp();
  const [activeTab, setActiveTab] = useState<'statement' | 'meals' | 'deposits'>('statement');

  // Query member meals and deposits for current month
  const meals =
    useLiveQuery(
      () =>
        member
          ? db.mealEntries
              .where('memberId')
              .equals(member.id)
              .filter((m) => !m._isDeleted && m.month === selectedMonth)
              .toArray()
          : Promise.resolve([]),
      [member, selectedMonth]
    ) || [];

  const deposits =
    useLiveQuery(
      () =>
        member
          ? db.deposits
              .where('memberId')
              .equals(member.id)
              .filter((d) => !d._isDeleted && d.month === selectedMonth)
              .toArray()
          : Promise.resolve([]),
      [member, selectedMonth]
    ) || [];

  // All expenses for meal rate
  const allExpenses =
    useLiveQuery(
      () => db.expenses.where('month').equals(selectedMonth).filter((e) => !e._isDeleted).toArray(),
      [selectedMonth]
    ) || [];
  const allMeals =
    useLiveQuery(
      () => db.mealEntries.where('month').equals(selectedMonth).filter((m) => !m._isDeleted).toArray(),
      [selectedMonth]
    ) || [];

  if (!member) return null;

  // Monthly Calculations
  const totalMealsCount = meals.reduce((sum, m) => sum + (m.count || 0), 0);
  const totalMessMeals = allMeals.reduce((sum, m) => sum + (m.count || 0), 0);
  const totalMessExpenses = allExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const mealRate = totalMessMeals > 0 ? totalMessExpenses / totalMessMeals : 0;

  const mealExpenseWithoutFee = Math.round(totalMealsCount * mealRate * 100) / 100;
  const managerFee = totalMealsCount * (settings.managerFeePerMeal || 5);
  const totalPayable = mealExpenseWithoutFee + managerFee;
  const totalDeposits = deposits.reduce((sum, d) => sum + (d.amount || 0), 0);
  const due = Math.round((totalPayable - totalDeposits) * 100) / 100;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${member.name} (${member.room})`}
      subtitle={`Member Statement & History for ${formatMonthName(selectedMonth)}`}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Profile Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{member.name}</h3>
                <Badge variant={member.status === 'Active' ? 'success' : 'neutral'} size="sm">
                  {member.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  <DoorClosed className="w-3.5 h-3.5" />
                  {member.room}
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  {member.floor}
                </span>
                <span className="text-slate-400">ID: {member.id}</span>
              </div>
            </div>
          </div>

          {member.phone && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>{member.phone}</span>
            </div>
          )}
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-200 gap-4">
          <button
            onClick={() => setActiveTab('statement')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'statement'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Financial Statement
          </button>
          <button
            onClick={() => setActiveTab('meals')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'meals'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            Meal History ({meals.length})
          </button>
          <button
            onClick={() => setActiveTab('deposits')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'deposits'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Deposits ({deposits.length})
          </button>
        </div>

        {/* Tab 1: Financial Statement */}
        {activeTab === 'statement' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Meals</span>
                <span className="text-lg font-bold text-slate-800">{totalMealsCount}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Meal Rate</span>
                <span className="text-lg font-bold text-slate-800">{formatCurrency(mealRate)}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Deposits</span>
                <span className="text-lg font-bold text-emerald-600">{formatCurrency(totalDeposits)}</span>
              </div>
              <div
                className={`p-3 rounded-xl border ${
                  due > 0
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <span className="text-[10px] uppercase font-bold block opacity-75">
                  {due > 0 ? 'Total Due' : 'Advance Balance'}
                </span>
                <span className="text-lg font-bold">
                  {due > 0 ? formatCurrency(due) : formatCurrency(Math.abs(due))}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                Calculation Breakdown ({formatMonthName(selectedMonth)})
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-3 text-slate-600">Meal Expense Without Fee ({totalMealsCount} meals × {formatCurrency(mealRate)})</td>
                    <td className="p-3 font-semibold text-right text-slate-800">{formatCurrency(mealExpenseWithoutFee)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-600">Manager Fee ({totalMealsCount} meals × ৳{settings.managerFeePerMeal || 5})</td>
                    <td className="p-3 font-semibold text-right text-slate-800">{formatCurrency(managerFee)}</td>
                  </tr>
                  <tr className="bg-slate-50/70 font-bold">
                    <td className="p-3 text-slate-800">Total Payable Amount</td>
                    <td className="p-3 text-right text-slate-900">{formatCurrency(totalPayable)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-600">Total Deposits Paid</td>
                    <td className="p-3 font-semibold text-right text-emerald-600">-{formatCurrency(totalDeposits)}</td>
                  </tr>
                  <tr className={`font-bold ${due > 0 ? 'bg-rose-50/70 text-rose-700' : 'bg-emerald-50/70 text-emerald-700'}`}>
                    <td className="p-3">{due > 0 ? 'Net Outstanding Due' : 'Refundable / Advance Credit'}</td>
                    <td className="p-3 text-right text-sm">
                      {due > 0 ? formatCurrency(due) : `+${formatCurrency(Math.abs(due))}`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {due < 0 && (
              <p className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                ℹ️ <strong>DUE NEGATIVE থাকলে টাকা ফেরত পাবেন:</strong> This member has paid more than their meal consumption.
                Advance balance carries forward or is eligible for cash refund.
              </p>
            )}
          </div>
        )}

        {/* Tab 2: Meal History */}
        {activeTab === 'meals' && (
          <div className="space-y-3">
            {meals.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No meal records found for this month.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0">
                    <tr>
                      <th className="p-2.5 text-left">Date</th>
                      <th className="p-2.5 text-center">Status</th>
                      <th className="p-2.5 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {meals
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-700">{formatDate(m.date)}</td>
                          <td className="p-2.5 text-center">
                            <Badge
                              variant={
                                m.type === 'ON'
                                  ? 'success'
                                  : m.type === 'Double'
                                  ? 'info'
                                  : m.type === 'OFF'
                                  ? 'danger'
                                  : 'neutral'
                              }
                              size="sm"
                            >
                              {m.type}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-800">{m.count}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Deposit History */}
        {activeTab === 'deposits' && (
          <div className="space-y-3">
            {deposits.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No deposits made by this member this month.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0">
                    <tr>
                      <th className="p-2.5 text-left">Date</th>
                      <th className="p-2.5 text-left">Method</th>
                      <th className="p-2.5 text-left">Note</th>
                      <th className="p-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deposits
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-700">{formatDate(d.date)}</td>
                          <td className="p-2.5 text-slate-600">{d.paymentMethod || 'Cash'}</td>
                          <td className="p-2.5 text-slate-500 truncate max-w-[120px]">{d.note || '-'}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-600">
                            +{formatCurrency(d.amount)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
