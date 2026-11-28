import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { Member, MealEntry } from '../../types';
import { formatMonthName, formatDate } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Printer, Calendar, Filter, Eye } from 'lucide-react';

export const PrintCenterPage: React.FC = () => {
  const { selectedMonth, settings } = useApp();
  const [selectedFloor, setSelectedFloor] = useState('ALL');
  const [printDate, setPrintDate] = useState(`${selectedMonth}-01`);

  // Queries (exclude soft-deleted tombstones)
  const members = useLiveQuery(() => db.members.where('status').equals('Active').filter((m) => !m._isDeleted).toArray(), []) || [];
  const mealEntries =
    useLiveQuery(
      () => db.mealEntries.where('month').equals(selectedMonth).filter((m) => !m._isDeleted).toArray(),
      [selectedMonth]
    ) || [];

  const closure = useLiveQuery(
    () => db.dailyClosures.get(printDate),
    [printDate]
  );
  const isFullOff = Boolean(closure && !closure._isDeleted && closure.status === 'FULL_OFF');

  // Distinct floors from active members
  const floors = useMemo(() => {
    const list = Array.from(new Set(members.map((m) => m.floor))).filter(Boolean);
    return ['ALL', ...list.sort()];
  }, [members]);

  // Group members by room
  const roomGroups = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const mem of members) {
      if (selectedFloor !== 'ALL' && mem.floor !== selectedFloor) continue;
      const list = map.get(mem.room) || [];
      list.push(mem);
      map.set(mem.room, list);
    }

    // Sort rooms naturally
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true })
    );
  }, [members, selectedFloor]);

  // Fast map: memberId -> { count, type } for the printDate
  const dateMealMap = useMemo(() => {
    const map = new Map<string, MealEntry>();
    for (const me of mealEntries) {
      if (me.date === printDate) {
        map.set(me.memberId, me);
      }
    }
    return map;
  }, [mealEntries, printDate]);

  // Fast map: memberId -> total meals for the month
  const monthMealTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const me of mealEntries) {
      map.set(me.memberId, (map.get(me.memberId) || 0) + (me.count || 0));
    }
    return map;
  }, [mealEntries]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Controls Header (Hidden during actual print) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Printer className="w-6 h-6 text-slate-700" />
            Print Center
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Rebuild of Print sheet: generate A4 room-wise meal attendance sheets with lunch/dinner tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            icon={<Printer className="w-4 h-4" />}
            onClick={handlePrint}
          >
            Print Sheet (A4)
          </Button>
        </div>
      </div>

      {/* Filter Toolbar (Hidden during print) */}
      <Card className="no-print p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Daily Date:</span>
              <input
                type="date"
                value={printDate}
                onChange={(e) => setPrintDate(e.target.value)}
                className="text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Filter Floor:</span>
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value)}
                className="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none"
              >
                {floors.map((fl) => (
                  <option key={fl} value={fl}>
                    {fl === 'ALL' ? `All Floors (${roomGroups.length} Rooms)` : fl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Previewing <strong>{roomGroups.length} rooms</strong> • Ready for standard A4 portrait/landscape
          </div>
        </div>
      </Card>

      {/* PRINTABLE A4 DOCUMENT */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm print:p-0 print:border-none print:shadow-none print:rounded-none">
        {/* Document Header */}
        <div className="text-center pb-5 mb-5 border-b-2 border-slate-900">
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-900">
            {settings.institutionName || 'Mymensingh Engineering College'}
          </h1>
          <h2 className="text-sm sm:text-base font-bold text-slate-700 mt-0.5">
            {settings.hallName || 'Omar Ekushe Hall'} (Mess Meal) — Manager: {settings.managerName || 'Manager'}
          </h2>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mt-2 px-2">
            <span>Month: <strong>{formatMonthName(selectedMonth)}</strong></span>
            <span>Date: <strong>{formatDate(printDate)}</strong></span>
            <span>Manager: <strong>{settings.managerName || 'Manager'}</strong></span>
          </div>
          {isFullOff && (
            <div className="bg-rose-100 border border-rose-300 text-rose-900 text-xs font-bold text-center py-1 px-3 rounded-lg mt-2.5">
              🛑 MESS CLOSED TODAY — FULL MEAL OFF ({closure?.reason || 'Holiday'}). All meal counts are 0.
            </div>
          )}
        </div>

        {/* Room Table Grid: 4-5 Rooms per row block, exactly as SULTAN MEAL Print sheet */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 print:grid-cols-4">
          {roomGroups.map(([roomNo, roomMembers]) => (
            <div
              key={roomNo}
              className="border border-slate-800 rounded-lg overflow-hidden flex flex-col bg-white text-xs"
            >
              {/* Room Bar */}
              <div className="bg-slate-900 text-white font-bold py-1 px-2.5 flex items-center justify-between text-[11px]">
                <span>{roomNo}</span>
                <span className="text-[10px] text-slate-300 font-normal">
                  {roomMembers[0]?.floor}
                </span>
              </div>

              {/* Members Table */}
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                    <th className="py-1 px-2">Name</th>
                    <th className="py-1 px-1 text-center w-10">Lunch</th>
                    <th className="py-1 px-1 text-center w-10">Dinner</th>
                    <th className="py-1 px-1.5 text-right w-11">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {roomMembers.map((m) => {
                    const entry = dateMealMap.get(m.id);
                    const status = entry?.type || 'Blank';
                    const monthTotal = monthMealTotals.get(m.id) || 0;

                    // Display symbol
                    let lunchDisplay = '-';
                    let dinnerDisplay = '-';

                    if (status === 'ON') {
                      lunchDisplay = '1';
                      dinnerDisplay = '1';
                    } else if (status === 'Double') {
                      lunchDisplay = '2';
                      dinnerDisplay = '2';
                    } else if (status === 'OFF') {
                      lunchDisplay = '✕';
                      dinnerDisplay = '✕';
                    }

                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-1 px-2 font-medium text-slate-900 truncate max-w-[90px]">
                          {m.name}
                        </td>
                        <td className="py-1 px-1 text-center font-bold text-slate-700">
                          {lunchDisplay}
                        </td>
                        <td className="py-1 px-1 text-center font-bold text-slate-700">
                          {dinnerDisplay}
                        </td>
                        <td className="py-1 px-1.5 text-right font-black font-mono text-slate-900">
                          {monthTotal}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Fill empty lines up to 4 if room has fewer borders for clean uniform height */}
                  {Array.from({ length: Math.max(0, 4 - roomMembers.length) }).map((_, i) => (
                    <tr key={`empty-${i}`} className="h-6">
                      <td className="py-1 px-2 text-slate-300 italic">-</td>
                      <td className="py-1 px-1 text-center text-slate-200">-</td>
                      <td className="py-1 px-1 text-center text-slate-200">-</td>
                      <td className="py-1 px-1.5 text-right text-slate-200">-</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Footer / Signatures on Print */}
        <div className="mt-12 pt-6 border-t border-slate-300 flex items-end justify-between text-xs text-slate-600">
          <div>
            <div className="w-44 border-b border-slate-700 mb-1" />
            <span>Manager: {settings.managerName || 'Manager'} (Signature)</span>
          </div>

          <div className="text-center font-bold text-slate-800">
            <span>DUE NEGATIVE থাকলে টাকা ফেরত পাবেন</span>
          </div>

          <div className="text-right">
            <div className="w-36 border-b border-slate-700 mb-1 ml-auto" />
            <span>Mess Committee Approval</span>
          </div>
        </div>
      </div>
    </div>
  );
};
