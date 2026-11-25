import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Member, MealEntry, MealStatus, DailyMealClosure } from '../../types';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { CalendarOff, AlertTriangle } from 'lucide-react';

interface MealGridProps {
  members: Member[];
  mealEntries: MealEntry[];
  selectedMonth: string;
  searchFilter: string;
}

export const MealGrid: React.FC<MealGridProps> = ({
  members,
  mealEntries,
  selectedMonth,
  searchFilter,
}) => {
  const { saveMealEntry } = useApp();
  // Days in selected month (28, 29, 30, or 31)
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();

  const daysArray = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [daysInMonth]);

  // Live query for daily closures in this month
  const closures =
    useLiveQuery(
      () => db.dailyClosures.where('month').equals(selectedMonth).filter((c) => !c._isDeleted).toArray(),
      [selectedMonth]
    ) || [];

  // Map of closures by day number
  const closureByDay = useMemo(() => {
    const map = new Map<number, DailyMealClosure>();
    for (const c of closures) {
      const day = parseInt(c.date.split('-')[2]);
      map.set(day, c);
    }
    return map;
  }, [closures]);

  const fullOffDaysCount = useMemo(() => {
    return closures.filter((c) => c.status === 'FULL_OFF').length;
  }, [closures]);

  // Fast lookup map: `${memberId}_${day}` -> MealEntry
  const mealMap = useMemo(() => {
    const map = new Map<string, MealEntry>();
    for (const entry of mealEntries) {
      if (entry.month === selectedMonth) {
        const day = parseInt(entry.date.split('-')[2]);
        map.set(`${entry.memberId}_${day}`, entry);
      }
    }
    return map;
  }, [mealEntries, selectedMonth]);

  // Filter members by search
  const filteredMembers = useMemo(() => {
    if (!searchFilter.trim()) return members;
    const q = searchFilter.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.room.toLowerCase().includes(q) ||
        m.floor.toLowerCase().includes(q)
    );
  }, [members, searchFilter]);

  // Toggle meal status on click: Blank -> ON -> Double -> OFF -> Blank
  const handleCellClick = async (memberId: string, day: number) => {
    const dayStr = String(day).padStart(2, '0');
    const date = `${selectedMonth}-${dayStr}`;
    const key = `${memberId}_${day}`;
    const currentEntry = mealMap.get(key);
    const currentType: MealStatus = currentEntry?.type || 'Blank';

    let nextType: MealStatus = 'ON';
    let nextCount = 1;

    if (currentType === 'Blank') {
      nextType = 'ON';
      nextCount = 1;
    } else if (currentType === 'ON') {
      nextType = 'Double';
      nextCount = 2;
    } else if (currentType === 'Double') {
      nextType = 'OFF';
      nextCount = 0;
    } else if (currentType === 'OFF') {
      nextType = 'Blank';
      nextCount = 0;
    }

    await saveMealEntry({
      id: `${memberId}_${date}`,
      memberId,
      date,
      month: selectedMonth,
      type: nextType,
      count: nextCount,
      updatedAt: Date.now(),
    });
  };

  // Calculate daily totals for bottom row (respecting FULL_OFF closures)
  const dailyTotals = useMemo(() => {
    const totals: { [day: number]: number } = {};
    for (let d = 1; d <= daysInMonth; d++) {
      totals[d] = 0;
    }
    for (const entry of mealEntries) {
      if (entry.month === selectedMonth) {
        const day = parseInt(entry.date.split('-')[2]);
        const closure = closureByDay.get(day);
        const isOff = closure?.status === 'FULL_OFF';
        if (day && totals[day] !== undefined && !isOff) {
          totals[day] += entry.count || 0;
        }
      }
    }
    return totals;
  }, [mealEntries, selectedMonth, daysInMonth, closureByDay]);

  // Monthly Grand Total
  const grandTotalMeals = useMemo(() => {
    return Object.values(dailyTotals).reduce((a, b) => a + b, 0);
  }, [dailyTotals]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-subtle overflow-hidden">
      {/* Holiday / Closure Alert Banner */}
      {fullOffDaysCount > 0 && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 flex items-center justify-between text-xs text-rose-800 font-medium">
          <div className="flex items-center gap-2">
            <CalendarOff className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>{fullOffDaysCount} Full Meal OFF days</strong> recorded in {selectedMonth}. Meals on closed dates automatically count as 0 in financial calculations.
            </span>
          </div>
          <span className="text-[11px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded">
            All Member Records Preserved
          </span>
        </div>
      )}

      {/* Legend & Hint */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-bold text-slate-700">Meal Legend:</span>
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-4 h-4 rounded bg-emerald-500 text-white font-bold flex items-center justify-center text-[10px]">
              1
            </span>
            ON (1)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-4 h-4 rounded bg-blue-600 text-white font-bold flex items-center justify-center text-[10px]">
              2
            </span>
            Double (2)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-4 h-4 rounded bg-rose-500 text-white font-bold flex items-center justify-center text-[10px]">
              ✕
            </span>
            OFF (0)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-500">
            <span className="w-4 h-4 rounded bg-slate-100 text-slate-400 font-bold flex items-center justify-center text-[10px] border border-slate-300">
              -
            </span>
            Blank (0)
          </span>
        </div>
        <div className="text-slate-400 italic">
          💡 Click any cell to cycle status: Blank → ON → Double → OFF
        </div>
      </div>

      {/* Spreadsheet Table with Sticky Room/Name & Total Columns */}
      <div className="overflow-x-auto max-h-[72vh] relative">
        <table className="w-full border-collapse text-center text-xs select-none">
          <thead className="bg-slate-900 text-white sticky top-0 z-20 shadow-sm font-semibold">
            <tr>
              <th className="py-2.5 px-3 text-left sticky left-0 z-30 bg-slate-900 min-w-[95px] border-r border-slate-700">
                Room
              </th>
              <th className="py-2.5 px-3 text-left sticky left-[95px] z-30 bg-slate-900 min-w-[130px] border-r border-slate-700 shadow-sm">
                Member Name
              </th>

              {/* Day Columns 1..daysInMonth */}
              {daysArray.map((day) => {
                const dayDate = new Date(year, month - 1, day);
                const isWeekend = dayDate.getDay() === 5; // Friday in BD
                const closure = closureByDay.get(day);
                const isOff = closure?.status === 'FULL_OFF';

                if (isOff) {
                  return (
                    <th
                      key={day}
                      className="py-1 px-0.5 min-w-[34px] max-w-[34px] border-r border-rose-800 bg-rose-700 text-white font-mono text-[10px]"
                      title={`Mess Closed: ${closure?.reason || 'Holiday'} (All meals = 0)`}
                    >
                      <div className="font-bold">{day}</div>
                      <div className="text-[8px] bg-rose-950/80 rounded px-0.5 text-rose-200 uppercase font-black tracking-tighter">
                        OFF
                      </div>
                    </th>
                  );
                }

                return (
                  <th
                    key={day}
                    className={`py-2 px-1 min-w-[34px] max-w-[34px] border-r border-slate-700/60 font-mono text-[11px] ${
                      isWeekend ? 'bg-slate-800 text-amber-300 font-bold' : ''
                    }`}
                  >
                    <div>{day}</div>
                  </th>
                );
              })}

              {/* Total Meal Column (Sticky Right) */}
              <th className="py-2.5 px-3 sticky right-0 z-30 bg-slate-950 text-emerald-400 font-bold min-w-[85px] border-l border-slate-700">
                Total Meal
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
            {filteredMembers.map((member, idx) => {
              // Calculate member month total (excluding FULL_OFF days)
              let memberTotal = 0;
              for (let d = 1; d <= daysInMonth; d++) {
                const closure = closureByDay.get(d);
                const isOff = closure?.status === 'FULL_OFF';
                if (!isOff) {
                  const entry = mealMap.get(`${member.id}_${d}`);
                  memberTotal += entry?.count || 0;
                }
              }

              const isEven = idx % 2 === 0;

              return (
                <tr
                  key={member.id}
                  className={`hover:bg-amber-50/50 transition-colors ${
                    isEven ? 'bg-white' : 'bg-slate-50/40'
                  }`}
                >
                  {/* Sticky Room Column */}
                  <td className="py-2 px-3 text-left font-bold font-mono text-slate-800 sticky left-0 z-10 bg-inherit border-r border-slate-200">
                    {member.room}
                  </td>

                  {/* Sticky Name Column */}
                  <td className="py-2 px-3 text-left font-medium text-slate-900 sticky left-[95px] z-10 bg-inherit border-r border-slate-200 shadow-sm truncate max-w-[130px]">
                    {member.name}
                  </td>

                  {/* Days 1 to 31 */}
                  {daysArray.map((day) => {
                    const entry = mealMap.get(`${member.id}_${day}`);
                    const status = entry?.type || 'Blank';
                    const closure = closureByDay.get(day);
                    const isOff = closure?.status === 'FULL_OFF';

                    let cellStyle =
                      'text-slate-300 hover:bg-slate-200/70 cursor-pointer font-mono';
                    let cellText = '-';

                    if (isOff) {
                      // Day is FULL MEAL OFF (Holiday/Closure)
                      // Raw entry is preserved in DB, but counts as 0
                      cellStyle =
                        status === 'ON' || status === 'Double'
                          ? 'bg-rose-100 text-rose-700 font-bold border-rose-200 cursor-pointer hover:bg-rose-200'
                          : 'bg-rose-50 text-rose-300 font-mono cursor-pointer hover:bg-rose-100';
                      cellText = '0';
                    } else if (status === 'ON') {
                      cellStyle =
                        'bg-emerald-500 text-white font-bold hover:bg-emerald-600 shadow-xs cursor-pointer';
                      cellText = '1';
                    } else if (status === 'Double') {
                      cellStyle =
                        'bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-xs cursor-pointer';
                      cellText = '2';
                    } else if (status === 'OFF') {
                      cellStyle =
                        'bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-xs cursor-pointer';
                      cellText = '✕';
                    }

                    const tooltipText = isOff
                      ? `${member.name} (Day ${day}): Full OFF (${closure?.reason || 'Holiday'}). Effective: 0 (Raw: ${status})`
                      : `${member.name} (Day ${day}): ${status}`;

                    return (
                      <td
                        key={day}
                        onClick={() => handleCellClick(member.id, day)}
                        className={`p-0 border-r border-slate-100 h-8 transition-colors ${cellStyle}`}
                        title={tooltipText}
                      >
                        <div className="w-full h-full flex items-center justify-center text-[11px]">
                          {cellText}
                        </div>
                      </td>
                    );
                  })}

                  {/* Sticky Member Total Column */}
                  <td className="py-2 px-3 sticky right-0 z-10 bg-slate-50 text-slate-900 font-extrabold font-mono text-xs border-l border-slate-200 text-right">
                    {memberTotal}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Sticky Footer: Daily Totals & Grand Total */}
          <tfoot className="bg-slate-900 text-white font-bold sticky bottom-0 z-20 shadow-lg">
            <tr>
              <td
                colSpan={2}
                className="py-3 px-4 text-left uppercase tracking-wider text-xs sticky left-0 z-30 bg-slate-900 border-r border-slate-700"
              >
                Daily Total Meals:
              </td>

              {daysArray.map((day) => (
                <td
                  key={day}
                  className="py-3 px-1 font-mono text-[11px] border-r border-slate-700/80 text-emerald-400 font-bold"
                >
                  {dailyTotals[day] || 0}
                </td>
              ))}

              <td className="py-3 px-3 text-right sticky right-0 z-30 bg-emerald-700 text-white font-black font-mono text-sm border-l border-slate-700">
                {grandTotalMeals}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
