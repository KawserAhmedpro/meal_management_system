import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ManagerPeriod } from '../../types';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { AlertTriangle, UserCheck } from 'lucide-react';

interface ManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  managerToEdit?: ManagerPeriod | null;
  existingManagers: ManagerPeriod[];
  onSuccess?: () => void;
}

interface FormValues {
  name: string;
  phone: string;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Resigned';
  feeRateOverride: string;
  notes: string;
}

export const ManagerModal: React.FC<ManagerModalProps> = ({
  isOpen,
  onClose,
  managerToEdit,
  existingManagers,
  onSuccess,
}) => {
  const { selectedMonth, settings, updateSettings } = useApp();
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  const defaultStart = `${selectedMonth}-01`;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: '',
      phone: '',
      startDate: defaultStart,
      endDate: '',
      status: 'Active',
      feeRateOverride: '',
      notes: '',
    },
  });

  const watchStartDate = watch('startDate');
  const watchEndDate = watch('endDate');
  const watchStatus = watch('status');

  useEffect(() => {
    if (managerToEdit) {
      reset({
        name: managerToEdit.name,
        phone: managerToEdit.phone || '',
        startDate: managerToEdit.startDate,
        endDate: managerToEdit.endDate || '',
        status: managerToEdit.status,
        feeRateOverride:
          managerToEdit.feeRateOverride !== undefined
            ? String(managerToEdit.feeRateOverride)
            : '',
        notes: managerToEdit.notes || '',
      });
    } else {
      reset({
        name: '',
        phone: '',
        startDate: `${selectedMonth}-${String(new Date().getDate()).padStart(2, '0')}`,
        endDate: '',
        status: 'Active',
        feeRateOverride: '',
        notes: '',
      });
    }
  }, [managerToEdit, reset, isOpen, selectedMonth]);

  // Check for overlapping periods with other active managers
  useEffect(() => {
    if (!watchStartDate) {
      setOverlapWarning(null);
      return;
    }

    const start = watchStartDate;
    const end = watchEndDate || '9999-12-31';

    const conflicts = existingManagers.filter((m) => {
      if (managerToEdit && m.id === managerToEdit.id) return false;
      const mStart = m.startDate;
      const mEnd = m.endDate || '9999-12-31';

      // Check overlap: start <= mEnd and end >= mStart
      return start <= mEnd && end >= mStart;
    });

    if (conflicts.length > 0) {
      setOverlapWarning(
        `Note: This period overlaps with ${conflicts
          .map((c) => `${c.name} (${c.startDate} to ${c.endDate || 'ongoing'})`)
          .join(', ')}. If this manager is replacing the previous manager, set the previous manager's resignation date.`
      );
    } else {
      setOverlapWarning(null);
    }
  }, [watchStartDate, watchEndDate, existingManagers, managerToEdit]);

  const onSubmit = async (data: FormValues) => {
    const cleanEndDate = data.endDate.trim() ? data.endDate.trim() : null;
    const start = data.startDate;
    const end = cleanEndDate || '9999-12-31';

    // Prevent overlapping manager assignments (Requirement 6)
    const conflicts = existingManagers.filter((m) => {
      if (managerToEdit && m.id === managerToEdit.id) return false;
      const mStart = m.startDate;
      const mEnd = m.endDate || '9999-12-31';
      return start <= mEnd && end >= mStart;
    });

    if (conflicts.length > 0) {
      alert(
        `Cannot save manager assignment: Overlapping tenure detected with ${conflicts
          .map((c) => `${c.name} (${c.startDate} to ${c.endDate || 'Present'})`)
          .join(', ')}. Please adjust dates or set a resignation date for the existing manager so assignment periods do not overlap.`
      );
      return;
    }

    const now = Date.now();
    const rateOverride =
      data.feeRateOverride.trim() !== '' ? Number(data.feeRateOverride) : undefined;

    if (managerToEdit) {
      await db.managers.update(managerToEdit.id, {
        name: data.name,
        phone: data.phone || undefined,
        startDate: data.startDate,
        endDate: cleanEndDate,
        status: cleanEndDate ? 'Resigned' : data.status,
        feeRateOverride: rateOverride,
        notes: data.notes || undefined,
        updatedAt: now,
      });

      // If this manager is currently active, update settings.managerName
      if (!cleanEndDate) {
        await updateSettings({ managerName: data.name });
      }
    } else {
      const newId = `MGR-${Date.now()}`;
      await db.managers.add({
        id: newId,
        name: data.name,
        phone: data.phone || undefined,
        startDate: data.startDate,
        endDate: cleanEndDate,
        status: cleanEndDate ? 'Resigned' : data.status,
        feeRateOverride: rateOverride,
        notes: data.notes || undefined,
        createdAt: now,
        updatedAt: now,
      });

      // If active, update settings
      if (!cleanEndDate) {
        await updateSettings({ managerName: data.name });
      }
    }

    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={managerToEdit ? 'Edit Manager Assignment' : 'Assign New Dining Manager'}
      subtitle="Track appointment date, resignation date, and fee period"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Manager Name *"
          placeholder="e.g. Ratul, Sultan, Robiul"
          {...register('name', { required: 'Manager name is required' })}
          error={errors.name?.message}
        />

        <Input
          label="Contact Phone Number (Optional)"
          placeholder="017xxxxxxxx"
          {...register('phone')}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Assignment Date (Start) *"
            type="date"
            {...register('startDate', { required: 'Start date is required' })}
            error={errors.startDate?.message}
            helperText="Inclusive start of fee calculation"
          />

          <Input
            label="Last Working Date (Resignation)"
            type="date"
            {...register('endDate')}
            helperText="Leave blank if currently active"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Status"
            options={[
              { value: 'Active', label: 'Active (Current Manager)' },
              { value: 'Resigned', label: 'Resigned / Completed Term' },
            ]}
            {...register('status')}
          />

          <Input
            label="Fee Rate Override (৳/meal)"
            type="number"
            step="0.5"
            placeholder={`Default: ${settings.managerFeePerMeal || 5}৳`}
            {...register('feeRateOverride')}
            helperText="Optional custom rate"
          />
        </div>

        <Input
          label="Notes / Terms (Optional)"
          placeholder="e.g. Handover from previous committee"
          {...register('notes')}
        />

        {overlapWarning && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{overlapWarning}</span>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {managerToEdit ? 'Update Manager' : 'Save Manager Assignment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
