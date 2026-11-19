import React, { useMemo } from 'react';
import { Member, MealEntry, MealStatus } from '../../types';
import { db } from '../../db';

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
  // Days in selected month (28, 29, 30, or 31)
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();

  const daysArray = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [daysInMonth]);

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

    await db.mealEntries.put({
      id: `${memberId}_${date}`,
      memberId,
      date,
      month: selectedMonth,
      type: nextType,
      count: nextCount,
      updatedAt: Date.now(),
    });
  };

  // Calculate daily totals for bottom row
  const dailyTotals = useMemo(() => {
    const totals: { [day: number]: number } = {};
    for (let d = 1; d <= daysInMonth; d++) {
      totals[d] = 0;
    }
    for (const entry of mealEntries) {
      if (entry.month === selectedMonth) {
        const day = parseInt(entry.date.split('-')[2]);
        if (day && totals[day] !== undefined) {
          totals[day] += entry.count || 0;
        }
      }
    }
    return totals;
  }, [mealEntries, selectedMonth, daysInMonth]);

  // Monthly Grand Total
  const grandTotalMeals = useMemo(() => {
    return Object.values(dailyTotals).reduce((a, b) => a + b, 0);
  }, [dailyTotals]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-subtle overflow-hidden">
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
              // Calculate member month total
              let memberTotal = 0;
              for (let d = 1; d <= daysInMonth; d++) {
                const entry = mealMap.get(`${member.id}_${d}`);
                memberTotal += entry?.count || 0;
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

                    let cellStyle =
                      'text-slate-300 hover:bg-slate-200/70 cursor-pointer font-mono';
                    let cellText = '-';

                    if (status === 'ON') {
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

                    return (
                      <td
                        key={day}
                        onClick={() => handleCellClick(member.id, day)}
                        className={`p-0 border-r border-slate-100 h-8 transition-colors ${cellStyle}`}
                        title={`${member.name} (Day ${day}): ${status}`}
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
