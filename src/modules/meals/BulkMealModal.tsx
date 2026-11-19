import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Member, MealStatus } from '../../types';
import { db } from '../../db';

interface BulkMealModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  members: Member[];
  onSuccess?: () => void;
}

export const BulkMealModal: React.FC<BulkMealModalProps> = ({
  isOpen,
  onClose,
  date,
  members,
  onSuccess,
}) => {
  const [selectedFloor, setSelectedFloor] = useState('ALL');
  const [targetStatus, setTargetStatus] = useState<MealStatus>('ON');
  const [isApplying, setIsApplying] = useState(false);

  const floors = ['ALL', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor'];

  const handleApply = async () => {
    setIsApplying(true);
    const targetMembers = members.filter(
      (m) => m.status === 'Active' && (selectedFloor === 'ALL' || m.floor === selectedFloor)
    );

    const month = date.substring(0, 7);
    const count = targetStatus === 'ON' ? 1 : targetStatus === 'Double' ? 2 : 0;

    const entriesToPut = targetMembers.map((m) => ({
      id: `${m.id}_${date}`,
      memberId: m.id,
      date,
      month,
      type: targetStatus,
      count,
      updatedAt: Date.now(),
    }));

    await db.mealEntries.bulkPut(entriesToPut);
    setIsApplying(false);
    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Meal Status Entry"
      subtitle={`Apply meal status in bulk for date: ${date}`}
      maxWidth="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
            Target Floor
          </label>
          <select
            value={selectedFloor}
            onChange={(e) => setSelectedFloor(e.target.value)}
            className="w-full text-sm p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
          >
            {floors.map((f) => (
              <option key={f} value={f}>
                {f === 'ALL' ? 'All Floors (All Active Members)' : f}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wider">
            Meal Status To Apply
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setTargetStatus('ON')}
              className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                targetStatus === 'ON'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              ON (1)
            </button>
            <button
              type="button"
              onClick={() => setTargetStatus('Double')}
              className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                targetStatus === 'Double'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              Double (2)
            </button>
            <button
              type="button"
              onClick={() => setTargetStatus('OFF')}
              className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                targetStatus === 'OFF'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              OFF (0)
            </button>
            <button
              type="button"
              onClick={() => setTargetStatus('Blank')}
              className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                targetStatus === 'Blank'
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              Blank (-)
            </button>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
          This will set <strong>{targetStatus}</strong> for all active borders in{' '}
          <strong>{selectedFloor === 'ALL' ? 'entire mess' : selectedFloor}</strong> on{' '}
          <strong>{date}</strong>. Existing entries for this date will be updated.
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleApply} isLoading={isApplying}>
            Apply Bulk Update
          </Button>
        </div>
      </div>
    </Modal>
  );
};
