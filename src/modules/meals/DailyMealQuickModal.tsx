import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { MealStatus } from '../../types';

interface DailyMealQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DailyMealQuickModal: React.FC<DailyMealQuickModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { selectedMonth } = useApp();
  const members = useLiveQuery(() => db.members.where('status').equals('Active').toArray(), []) || [];
  
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [date, setDate] = useState(`${selectedMonth}-${String(new Date().getDate()).padStart(2, '0')}`);
  const [status, setStatus] = useState<MealStatus>('ON');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.room.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId) return;

    setIsSubmitting(true);
    const month = date.substring(0, 7);
    const entryId = `${selectedMemberId}_${date}`;
    const count = status === 'ON' ? 1 : status === 'Double' ? 2 : 0;

    await db.mealEntries.put({
      id: entryId,
      memberId: selectedMemberId,
      date,
      month,
      type: status,
      count,
      updatedAt: Date.now(),
    });

    setIsSubmitting(false);
    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick Meal Entry"
      subtitle="Record or change meal status for a member"
      maxWidth="md"
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
            Select Member *
          </label>
          <input
            type="text"
            placeholder="Search member by room or name..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="w-full text-xs p-2 rounded-xl border border-slate-200 mb-2 focus:outline-none focus:border-emerald-500"
          />
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            required
            className="block w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          >
            <option value="">-- Choose Member --</option>
            {filteredMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.room} - {m.name} ({m.floor})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
            Meal Date *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="block w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wider">
            Meal Type *
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setStatus('ON')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                status === 'ON'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              ON (1)
            </button>
            <button
              type="button"
              onClick={() => setStatus('Double')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                status === 'Double'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
              }`}
            >
              Double (2)
            </button>
            <button
              type="button"
              onClick={() => setStatus('OFF')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                status === 'OFF'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              }`}
            >
              OFF (0)
            </button>
            <button
              type="button"
              onClick={() => setStatus('Blank')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                status === 'Blank'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              Blank (-)
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={!selectedMemberId}>
            Save Meal Entry
          </Button>
        </div>
      </form>
    </Modal>
  );
};
