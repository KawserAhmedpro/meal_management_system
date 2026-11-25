import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Deposit, Member } from '../../types';
import { useApp } from '../../context/AppContext';
import { calculateMonthSummary } from '../../utils/calculations';
import { formatCurrency, formatDate, formatMonthName } from '../../utils/formatters';
import { DepositModal } from './DepositModal';
import { MemberProfileModal } from '../members/MemberProfileModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Eye,
  FileSpreadsheet,
  ListOrdered,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

export const TransactionsPage: React.FC = () => {
  const { selectedMonth, settings, deleteDeposit } = useApp();
  const [activeTab, setActiveTab] = useState<'sheet' | 'ledger'>('sheet');

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

  // Full financial calculation
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

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DUE' | 'ADVANCE' | 'SETTLED'>('ALL');

  // Modals state
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositToEdit, setDepositToEdit] = useState<Deposit | null>(null);
  const [depositToDelete, setDepositToDelete] = useState<Deposit | null>(null);
  const [defaultDepositMemberId, setDefaultDepositMemberId] = useState<string | undefined>();
  const [statementMember, setStatementMember] = useState<Member | null>(null);

  // Filter member summaries
  const filteredSummaries = useMemo(() => {
    return memberSummaries.filter((s) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        s.member.name.toLowerCase().includes(q) ||
        s.member.room.toLowerCase().includes(q) ||
        s.member.floor.toLowerCase().includes(q);

      let matchesStatus = true;
      if (statusFilter === 'DUE') matchesStatus = s.due > 0;
      else if (statusFilter === 'ADVANCE') matchesStatus = s.due < 0;
      else if (statusFilter === 'SETTLED') matchesStatus = s.due === 0;

      return matchesSearch && matchesStatus;
    });
  }, [memberSummaries, searchQuery, statusFilter]);

  // Filter individual deposits
  const filteredDeposits = useMemo(() => {
    return deposits
      .filter((d) => {
        const q = searchQuery.toLowerCase();
        return (
          d.memberName.toLowerCase().includes(q) ||
          d.room.toLowerCase().includes(q) ||
          (d.note && d.note.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [deposits, searchQuery]);

  const handleDeleteDepositConfirm = async () => {
    if (!depositToDelete) return;
    await deleteDeposit(depositToDelete.id);
    setDepositToDelete(null);
  };

  const handleRecordDepositForMember = (memberId: string) => {
    setDefaultDepositMemberId(memberId);
    setDepositToEdit(null);
    setIsDepositModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-blue-600" />
            Transactions & Financial Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Rebuild of Transactions sheet: individual deposits, meal expenses, manager fees, and due/advance balances for{' '}
            <strong>{formatMonthName(selectedMonth)}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setDefaultDepositMemberId(undefined);
              setDepositToEdit(null);
              setIsDepositModalOpen(true);
            }}
          >
            Record Deposit
          </Button>
        </div>
      </div>

      {/* Financial Health Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-tr from-blue-600 to-indigo-700 text-white shadow-md">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-100">
            Total Deposits Collected
          </span>
          <div className="mt-1 text-2xl font-black font-mono">
            {formatCurrency(overview.totalDeposits, settings.currencySymbol)}
          </div>
          <p className="text-[11px] text-blue-100/90 mt-1">
            {deposits.length} deposit transactions recorded
          </p>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Payable
            </span>
            <TrendingDown className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-xl font-black text-slate-900 font-mono">
            {formatCurrency(overview.totalPayable, settings.currencySymbol)}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Meal Expense ({formatCurrency(overview.totalMealExpenses)}) + Mgr Fee ({formatCurrency(overview.totalManagerFees)})
          </p>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Unpaid Dues
            </span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-xl font-black text-rose-600 font-mono">
            {formatCurrency(overview.totalDue, settings.currencySymbol)}
          </div>
          <p className="text-xs text-rose-600/90 mt-1 font-semibold">
            Owed by borders with negative balance
          </p>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Advance Credit / Refundable
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-black text-emerald-600 font-mono">
            {formatCurrency(overview.totalAdvance, settings.currencySymbol)}
          </div>
          <p className="text-xs text-emerald-700/90 mt-1 font-medium">
            DUE NEGATIVE থাকলে টাকা ফেরত পাবেন
          </p>
        </Card>
      </div>

      {/* Tabs Switcher & Filter Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('sheet')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'sheet'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Member Financial Sheet ({memberSummaries.length})
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'ledger'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              Deposit Transactions Ledger ({deposits.length})
            </button>
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search member, room, note..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-[200px]"
              />
            </div>

            {activeTab === 'sheet' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Balance Statuses</option>
                <option value="DUE">Has Due (&gt; 0)</option>
                <option value="ADVANCE">Has Advance / Credit (&lt; 0)</option>
                <option value="SETTLED">Settled (= 0)</option>
              </select>
            )}
          </div>
        </div>
      </Card>

      {/* TAB 1: Member Financial Sheet */}
      {activeTab === 'sheet' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-white font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Room No</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-3 text-center">Meals</th>
                  <th className="py-3 px-3 text-right">Meal Exp. (No Fee)</th>
                  <th className="py-3 px-3 text-right">Manager Fee (5৳)</th>
                  <th className="py-3 px-3 text-right">Total Payable</th>
                  <th className="py-3 px-3 text-right">Total Deposits</th>
                  <th className="py-3 px-4 text-right">Due / Advance</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      No members matching the criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSummaries.map((s) => {
                    const isDue = s.due > 0;
                    const isAdvance = s.due < 0;

                    return (
                      <tr key={s.member.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {s.member.room}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {s.member.name}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                          {s.totalMeals}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {formatCurrency(s.mealExpenseWithoutFee, settings.currencySymbol)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {formatCurrency(s.managerFee, settings.currencySymbol)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(s.totalPayable, settings.currencySymbol)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-blue-600">
                          {formatCurrency(s.totalDeposits, settings.currencySymbol)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isDue && (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black font-mono bg-rose-50 text-rose-700 border border-rose-200">
                              {formatCurrency(s.due, settings.currencySymbol)} Due
                            </span>
                          )}
                          {isAdvance && (
                            <span
                              className="inline-block px-2.5 py-1 rounded-full text-xs font-black font-mono bg-emerald-50 text-emerald-700 border border-emerald-200"
                              title="DUE NEGATIVE থাকলে টাকা ফেরত পাবেন"
                            >
                              -{formatCurrency(Math.abs(s.due), settings.currencySymbol)} Adv.
                            </span>
                          )}
                          {!isDue && !isAdvance && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                              Settled
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleRecordDepositForMember(s.member.id)}
                              title="Add Deposit for Member"
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setStatementMember(s.member)}
                              title="View Member Statement"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredSummaries.length > 0 && (
                <tfoot className="bg-slate-900 text-white font-bold text-xs sticky bottom-0">
                  <tr>
                    <td colSpan={2} className="py-3.5 px-4 uppercase tracking-wider">
                      Mess Monthly Totals:
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono text-emerald-400">
                      {overview.totalMeals}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono">
                      {formatCurrency(overview.totalMealExpenses, settings.currencySymbol)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono">
                      {formatCurrency(overview.totalManagerFees, settings.currencySymbol)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono">
                      {formatCurrency(overview.totalPayable, settings.currencySymbol)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-blue-400">
                      {formatCurrency(overview.totalDeposits, settings.currencySymbol)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-rose-400">
                      {formatCurrency(overview.totalDue, settings.currencySymbol)} Due
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: Deposit Transactions Ledger */}
      {activeTab === 'ledger' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Room No</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Notes / Trx ID</th>
                  <th className="py-3 px-4 text-right">Amount (BDT ৳)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDeposits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No deposit records found. Click &quot;Record Deposit&quot; above to add payments.
                    </td>
                  </tr>
                ) : (
                  filteredDeposits.map((dep) => (
                    <tr key={dep.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                        {formatDate(dep.date)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                        {dep.room}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {dep.memberName}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                          {dep.paymentMethod || 'Cash'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                        {dep.note || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black font-mono text-emerald-600 text-sm">
                        +{formatCurrency(dep.amount, settings.currencySymbol)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setDepositToEdit(dep);
                              setIsDepositModalOpen(true);
                            }}
                            title="Edit Deposit"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDepositToDelete(dep)}
                            title="Delete Deposit"
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
              {filteredDeposits.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                  <tr>
                    <td colSpan={5} className="py-3 px-4 uppercase text-slate-700">
                      Total Monthly Deposits:
                    </td>
                    <td className="py-3 px-4 text-right font-black font-mono text-base text-emerald-600">
                      +{formatCurrency(overview.totalDeposits, settings.currencySymbol)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* Record / Edit Deposit Modal */}
      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        depositToEdit={depositToEdit}
        defaultMemberId={defaultDepositMemberId}
      />

      {/* Member Statement Modal */}
      <MemberProfileModal
        isOpen={!!statementMember}
        onClose={() => setStatementMember(null)}
        member={statementMember}
      />

      {/* Confirm Delete Deposit Dialog */}
      <ConfirmDialog
        isOpen={!!depositToDelete}
        onClose={() => setDepositToDelete(null)}
        onConfirm={handleDeleteDepositConfirm}
        title="Delete Deposit Record?"
        message={`Are you sure you want to delete deposit of ${depositToDelete?.amount} ৳ from ${depositToDelete?.memberName}? This will update their due balance automatically.`}
        confirmText="Delete Deposit"
        variant="danger"
      />
    </div>
  );
};
