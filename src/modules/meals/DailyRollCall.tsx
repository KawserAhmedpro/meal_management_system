import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Member, MealEntry, MealStatus } from '../../types';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/ui/Button';
import { formatDate } from '../../utils/formatters';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  CheckCheck,
  XCircle,
  Building,
  CalendarOff,
} from 'lucide-react';

interface DailyRollCallProps {
  members: Member[];
  mealEntries: MealEntry[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  searchFilter: string;
}

export const DailyRollCall: React.FC<DailyRollCallProps> = ({
  members,
  mealEntries,
  selectedDate,
  onDateChange,
  searchFilter,
}) => {
  const { saveMealEntry, saveMealEntriesBulk, deleteDailyClosure } = useApp();
  const [selectedFloor, setSelectedFloor] = useState('ALL');

  // Query closure for the current selectedDate
  const closure = useLiveQuery(
    () => db.dailyClosures.get(selectedDate),
    [selectedDate]
  );
  const isFullOff = closure?.status === 'FULL_OFF';

  // Change date by delta (-1 or +1 day)
  const handleDateDelta = (delta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d + delta);
    const nextY = date.getFullYear();
    const nextM = String(date.getMonth() + 1).padStart(2, '0');
    const nextD = String(date.getDate()).padStart(2, '0');
    onDateChange(`${nextY}-${nextM}-${nextD}`);
  };

  // Map entries for selectedDate: memberId -> MealEntry
  const dayMealMap = useMemo(() => {
    const map = new Map<string, MealEntry>();
    for (const entry of mealEntries) {
      if (entry.date === selectedDate) {
        map.set(entry.memberId, entry);
      }
    }
    return map;
  }, [mealEntries, selectedDate]);

  // Set meal status for single member
  const setMemberStatus = async (memberId: string, status: MealStatus) => {
    const month = selectedDate.substring(0, 7);
    const count = status === 'ON' ? 1 : status === 'Double' ? 2 : 0;
    await saveMealEntry({
      id: `${memberId}_${selectedDate}`,
      memberId,
      date: selectedDate,
      month,
      type: status,
      count,
      updatedAt: Date.now(),
    });
  };

  // Copy previous day's entries
  const handleCopyPreviousDay = async () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const prevDateObj = new Date(y, m - 1, d - 1);
    const prevY = prevDateObj.getFullYear();
    const prevM = String(prevDateObj.getMonth() + 1).padStart(2, '0');
    const prevD = String(prevDateObj.getDate()).padStart(2, '0');
    const prevDateStr = `${prevY}-${prevM}-${prevD}`;

    const prevEntries = await db.mealEntries.where('date').equals(prevDateStr).toArray();
    if (prevEntries.length === 0) {
      alert(`No meal records found for previous day (${prevDateStr}) to copy from.`);
      return;
    }

    const month = selectedDate.substring(0, 7);
    const newEntries = prevEntries.map((e) => ({
      id: `${e.memberId}_${selectedDate}`,
      memberId: e.memberId,
      date: selectedDate,
      month,
      type: e.type,
      count: e.count,
      updatedAt: Date.now(),
    }));

    await saveMealEntriesBulk(newEntries);
  };

  // Filter members
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchesSearch =
        !searchFilter ||
        m.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        m.room.toLowerCase().includes(searchFilter.toLowerCase());
      const matchesFloor = selectedFloor === 'ALL' || m.floor === selectedFloor;
      return matchesSearch && matchesFloor;
    });
  }, [members, searchFilter, selectedFloor]);

  // Group members by room
  const roomGroups = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of filteredMembers) {
      const list = map.get(m.room) || [];
      list.push(m);
      map.set(m.room, list);
    }
    return Array.from(map.entries());
  }, [filteredMembers]);

  // Day's total meals
  const dayTotalMeals = useMemo(() => {
    let sum = 0;
    for (const entry of dayMealMap.values()) {
      sum += entry.count || 0;
    }
    return sum;
  }, [dayMealMap]);

  return (
    <div className="space-y-4">
      {/* Date Header & Action Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Date Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDateDelta(-1)}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700"
            title="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="text-sm font-bold text-slate-900 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => handleDateDelta(1)}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-500 font-semibold hidden sm:inline ml-1">
            {formatDate(selectedDate)}
          </span>
        </div>

        {/* Daily Stats & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`border px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
              isFullOff
                ? 'bg-rose-50 text-rose-800 border-rose-300'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
            }`}
          >
            <span>Total Today:</span>
            {isFullOff ? (
              <span className="text-sm text-rose-700 font-black font-mono">
                0 meals (Closed) <span className="text-[10px] text-rose-500 font-normal">Raw: {dayTotalMeals}</span>
              </span>
            ) : (
              <span className="text-sm text-emerald-700 font-black font-mono">
                {dayTotalMeals} meals
              </span>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            icon={<Copy className="w-3.5 h-3.5" />}
            onClick={handleCopyPreviousDay}
            disabled={isFullOff}
            title={isFullOff ? 'Disabled on Full Meal OFF days' : 'Copy all meal statuses from the previous day'}
          >
            Copy Previous Day
          </Button>
        </div>
      </div>

      {/* FULL MEAL OFF Alert Banner */}
      {isFullOff && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CalendarOff className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-rose-900">
                  FULL MEAL OFF — Mess Closed Today
                </h3>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-rose-200 text-rose-800">
                  {closure?.reason || 'Holiday'}
                </span>
              </div>
              <p className="text-xs text-rose-700 mt-0.5">
                All members' meals for this date count as <strong>0</strong> in financial statements and manager fees. Individual border statuses below are safely preserved in the database.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await deleteDailyClosure(selectedDate);
            }}
            className="border-rose-300 text-rose-800 hover:bg-rose-100 shrink-0"
          >
            Restore Regular Dining
          </Button>
        </div>
      )}

      {/* Room-wise Member Cards for quick touch selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roomGroups.map(([room, roomMembers]) => (
          <div
            key={room}
            className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-subtle space-y-3"
          >
            {/* Room Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-mono font-bold text-xs">
                  {room}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {roomMembers[0]?.floor}
                </span>
              </div>
              <span className="text-xs text-slate-400">
                {roomMembers.length} {roomMembers.length === 1 ? 'border' : 'borders'}
              </span>
            </div>

            {/* Members in Room */}
            <div className="space-y-2.5">
              {roomMembers.map((m) => {
                const entry = dayMealMap.get(m.id);
                const currentStatus: MealStatus = entry?.type || 'Blank';

                return (
                  <div
                    key={m.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-xl bg-slate-50/70 hover:bg-slate-100/60 transition-colors"
                  >
                    <div className="truncate">
                      <span className="text-xs font-bold text-slate-800 block truncate">
                        {m.name}
                      </span>
                    </div>

                    {/* Status Toggle Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setMemberStatus(m.id, 'ON')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                          currentStatus === 'ON'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50'
                        }`}
                      >
                        ON
                      </button>
                      <button
                        type="button"
                        onClick={() => setMemberStatus(m.id, 'Double')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                          currentStatus === 'Double'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-blue-50'
                        }`}
                      >
                        2
                      </button>
                      <button
                        type="button"
                        onClick={() => setMemberStatus(m.id, 'OFF')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                          currentStatus === 'OFF'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-rose-50'
                        }`}
                      >
                        OFF
                      </button>
                      <button
                        type="button"
                        onClick={() => setMemberStatus(m.id, 'Blank')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                          currentStatus === 'Blank'
                            ? 'bg-slate-700 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        -
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
