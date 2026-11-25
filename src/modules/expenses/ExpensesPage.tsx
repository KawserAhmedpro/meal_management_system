import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Expense } from '../../types';
import { useApp } from '../../context/AppContext';
import { ExpenseModal } from './ExpenseModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { formatCurrency, formatDate, formatMonthName } from '../../utils/formatters';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Calendar,
  Layers,
  TrendingUp,
} from 'lucide-react';

export const ExpensesPage: React.FC = () => {
  const { selectedMonth, settings, deleteExpense } = useApp();

  const expenses =
    useLiveQuery(
      () => db.expenses.where('month').equals(selectedMonth).filter((e) => !e._isDeleted).toArray(),
      [selectedMonth]
    ) || [];

  const categories = useLiveQuery(() => db.categories.filter((c) => !c._isDeleted).toArray(), []) || [];

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals state
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        const matchesSearch =
          e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (e.notes && e.notes.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesCat = selectedCategory === 'ALL' || e.category === selectedCategory;

        const matchesDateRange =
          (!startDate || e.date >= startDate) && (!endDate || e.date <= endDate);

        return matchesSearch && matchesCat && matchesDateRange;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, searchQuery, selectedCategory, startDate, endDate]);

  // Calculations
  const totalCost = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [filteredExpenses]);

  // Category summary
  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const cat = e.category || 'Other';
      map.set(cat, (map.get(cat) || 0) + (e.amount || 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const handleDeleteConfirm = async () => {
    if (!expenseToDelete) return;
    await deleteExpense(expenseToDelete.id);
    setExpenseToDelete(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ShoppingCart className="w-6 h-6 text-amber-600" />
            Market & Expense Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Rebuild of Costs sheet: track daily food items, vegetables, meat, spices, gas, and utilities for{' '}
            <strong>{formatMonthName(selectedMonth)}</strong>.
          </p>
        </div>

        <Button
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setExpenseToEdit(null);
            setIsAddEditOpen(true);
          }}
        >
          Add New Expense
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-tr from-amber-500 to-amber-600 text-white shadow-md">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-100">
            Total Monthly Cost
          </span>
          <div className="mt-1 text-2xl font-black font-mono">
            {formatCurrency(totalCost, settings.currencySymbol)}
          </div>
          <p className="text-[11px] text-amber-100/90 mt-1">
            {filteredExpenses.length} expense items recorded
          </p>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Top Category
            </span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900 truncate">
            {categoryTotals[0] ? categoryTotals[0][0] : 'None'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {categoryTotals[0]
              ? formatCurrency(categoryTotals[0][1], settings.currencySymbol)
              : '0.00'}
          </p>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Daily Average
            </span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {formatCurrency(totalCost / 30, settings.currencySymbol)}
          </div>
          <p className="text-xs text-slate-500 mt-1">Estimated daily burn rate</p>
        </Card>
      </div>

      {/* Category Pills */}
      {categoryTotals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Categories ({expenses.length})
          </button>
          {categoryTotals.map(([cat, amt]) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedCategory === cat
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-amber-50'
              }`}
            >
              <span>{cat}</span>
              <span className="text-[10px] opacity-75 font-mono">
                {formatCurrency(amt, settings.currencySymbol)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by item description or note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 shrink-0">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 shrink-0">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          {(startDate || endDate || selectedCategory !== 'ALL' || searchQuery) && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                  setStartDate('');
                  setEndDate('');
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Expenses Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Items / Description</th>
                <th className="py-3 px-4">Notes / Voucher</th>
                <th className="py-3 px-4 text-right">Cost (BDT ৳)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No expense entries found for this period. Click &quot;Add New Expense&quot; above.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                      {formatDate(exp.date)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {exp.title}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                      {exp.notes || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black font-mono text-slate-900">
                      {formatCurrency(exp.amount, settings.currencySymbol)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setExpenseToEdit(exp);
                            setIsAddEditOpen(true);
                          }}
                          title="Edit Expense"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setExpenseToDelete(exp)}
                          title="Delete Expense"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredExpenses.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                <tr>
                  <td colSpan={4} className="py-3 px-4 uppercase text-slate-700">
                    Total Month Cost:
                  </td>
                  <td className="py-3 px-4 text-right font-black font-mono text-base text-amber-700">
                    {formatCurrency(totalCost, settings.currencySymbol)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Add / Edit Expense Modal */}
      <ExpenseModal
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        expenseToEdit={expenseToEdit}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!expenseToDelete}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Expense Entry?"
        message={`Are you sure you want to delete "${expenseToDelete?.title}" for ${expenseToDelete?.amount} ৳? This will reduce the total mess cost and recalculate the meal rate automatically.`}
        confirmText="Delete Expense"
        variant="danger"
      />
    </div>
  );
};
