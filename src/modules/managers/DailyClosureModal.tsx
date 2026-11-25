import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { DailyMealClosure } from '../../types';
import { useApp } from '../../context/AppContext';
import { Calendar, ShieldAlert, Sparkles, CheckCircle } from 'lucide-react';

interface DailyClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate?: string;
  existingClosure?: DailyMealClosure | null;
  onSuccess?: () => void;
}

export const DailyClosureModal: React.FC<DailyClosureModalProps> = ({
  isOpen,
  onClose,
  targetDate,
  existingClosure,
  onSuccess,
}) => {
  const { selectedMonth, saveDailyClosure, deleteDailyClosure } = useApp();
  const [date, setDate] = useState(targetDate || `${selectedMonth}-01`);
  const [status, setStatus] = useState<'FULL_OFF' | 'FULL_ON'>('FULL_OFF');
  const [reason, setReason] = useState('College Holiday');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const presets = [
    'College Holiday',
    'Semester Break',
    'Ramadan Vacation',
    'Special Holiday',
    'Unexpected Mess Closure',
    'Kitchen Maintenance',
    'Hartal / Strike',
  ];

  useEffect(() => {
    if (existingClosure) {
      setDate(existingClosure.date);
      setStatus(existingClosure.status);
      setReason(existingClosure.reason || 'College Holiday');
    } else if (targetDate) {
      setDate(targetDate);
      setStatus('FULL_OFF');
      setReason('College Holiday');
    } else {
      setDate(`${selectedMonth}-01`);
      setStatus('FULL_OFF');
      setReason('College Holiday');
    }
  }, [existingClosure, targetDate, isOpen, selectedMonth]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const month = date.substring(0, 7);

    try {
      if (status === 'FULL_ON') {
        // If user marks FULL_ON, remove from closures table (or set status FULL_ON)
        await deleteDailyClosure(date);
      } else {
        await saveDailyClosure({
          date,
          month,
          status: 'FULL_OFF',
          reason,
          updatedAt: Date.now(),
        });
      }
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('[DailyClosureModal] Save error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveClosure = async () => {
    setIsSubmitting(true);
    try {
      await deleteDailyClosure(date);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('[DailyClosureModal] Remove error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Daily Meal ON / OFF (Holiday Closure)"
      subtitle="Configure mess dining status for holidays and special closures"
      maxWidth="md"
    >
      <form onSubmit={handleSave} className="space-y-4 text-xs">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
            Target Date *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-mono font-bold focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wider">
            Dining Status on this Date *
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setStatus('FULL_OFF')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                status === 'FULL_OFF'
                  ? 'border-rose-500 bg-rose-50/70 text-rose-900 font-bold shadow-xs'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="font-extrabold text-rose-700 flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                FULL MEAL OFF (0 Meals)
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                College holiday or closure. All borders receive 0 meals. Manager fee is excluded.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setStatus('FULL_ON')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                status === 'FULL_ON'
                  ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-bold shadow-xs'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="font-extrabold text-emerald-700 flex items-center gap-1.5 text-xs">
                <CheckCircle className="w-3.5 h-3.5" />
                REGULAR MEAL (ON)
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Regular dining day. Member daily entries apply normally.
              </p>
            </button>
          </div>
        </div>

        {status === 'FULL_OFF' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
              Holiday / Closure Reason *
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. College Holiday, Ramadan, Semester Break"
              required
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 mb-2 focus:outline-none focus:border-rose-500"
            />

            <div className="flex flex-wrap gap-1.5 pt-1">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setReason(p)}
                  className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
                    reason === p
                      ? 'bg-rose-100 border-rose-300 text-rose-800'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Data Safety Notice */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <strong>Data Preservation:</strong> Existing individual member entries for this date remain safely stored in the database.
            Marking a day FULL MEAL OFF sets calculation to 0 without deleting user records.
          </span>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          {existingClosure ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemoveClosure}
              disabled={isSubmitting}
            >
              Clear Override
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              Apply Dining Status
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
