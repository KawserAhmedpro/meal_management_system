import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { MealGrid } from './MealGrid';
import { DailyRollCall } from './DailyRollCall';
import { BulkMealModal } from './BulkMealModal';
import { DailyClosureModal } from '../managers/DailyClosureModal';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  UtensilsCrossed,
  Table,
  CalendarDays,
  Zap,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarOff,
} from 'lucide-react';
import { formatMonthName } from '../../utils/formatters';

export const MealManagementPage: React.FC = () => {
  const { selectedMonth, setSelectedMonth } = useApp();
  const [activeView, setActiveView] = useState<'grid' | 'rollcall'>('grid');
  const [searchFilter, setSearchFilter] = useState('');
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isClosureOpen, setIsClosureOpen] = useState(false);
  const [selectedDailyDate, setSelectedDailyDate] = useState(`${selectedMonth}-01`);

  // Query members and month meals (exclude soft-deleted tombstones)
  const members = useLiveQuery(() => db.members.where('status').equals('Active').filter((m) => !m._isDeleted).toArray(), []) || [];
  const mealEntries =
    useLiveQuery(
      () => db.mealEntries.where('month').equals(selectedMonth).filter((m) => !m._isDeleted).toArray(),
      [selectedMonth]
    ) || [];

  const handleMonthChange = (delta: number) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    const nextY = date.getFullYear();
    const nextM = String(date.getMonth() + 1).padStart(2, '0');
    const newMonth = `${nextY}-${nextM}`;
    setSelectedMonth(newMonth);
    setSelectedDailyDate(`${newMonth}-01`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <UtensilsCrossed className="w-6 h-6 text-emerald-600" />
            Meal Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Track daily lunch & dinner, update borders in spreadsheet grid or roll call mode.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle */}
          <div className="bg-slate-200/80 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
            <button
              onClick={() => setActiveView('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'grid'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              Spreadsheet Grid
            </button>
            <button
              onClick={() => setActiveView('rollcall')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'rollcall'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Daily Roll Call
            </button>
          </div>

          {/* Manage Closures & Holidays */}
          <Button
            variant="outline"
            size="sm"
            icon={<CalendarOff className="w-3.5 h-3.5 text-rose-600" />}
            onClick={() => setIsClosureOpen(true)}
            title="Mark a date as FULL MEAL OFF or ON"
          >
            Holidays / Closures
          </Button>

          {/* Bulk Update Trigger */}
          <Button
            variant="primary"
            size="sm"
            icon={<Zap className="w-3.5 h-3.5" />}
            onClick={() => setIsBulkOpen(true)}
          >
            Bulk Update
          </Button>
        </div>
      </div>

      {/* Toolbar: Search and Month Navigation */}
      <Card className="p-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by room or member name..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          {/* Month Navigator */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
              <button
                onClick={() => handleMonthChange(-1)}
                className="p-1 rounded-lg hover:bg-white text-slate-600 shadow-xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-xs font-bold text-slate-800">
                {formatMonthName(selectedMonth)}
              </span>
              <button
                onClick={() => handleMonthChange(1)}
                className="p-1 rounded-lg hover:bg-white text-slate-600 shadow-xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Views */}
      {activeView === 'grid' ? (
        <MealGrid
          members={members}
          mealEntries={mealEntries}
          selectedMonth={selectedMonth}
          searchFilter={searchFilter}
        />
      ) : (
        <DailyRollCall
          members={members}
          mealEntries={mealEntries}
          selectedDate={selectedDailyDate}
          onDateChange={setSelectedDailyDate}
          searchFilter={searchFilter}
        />
      )}

      {/* Bulk Entry Modal */}
      <BulkMealModal
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        date={selectedDailyDate}
        members={members}
      />

      {/* Daily Closure / Holiday Modal */}
      <DailyClosureModal
        isOpen={isClosureOpen}
        onClose={() => setIsClosureOpen(false)}
        targetDate={selectedDailyDate}
      />
    </div>
  );
};
