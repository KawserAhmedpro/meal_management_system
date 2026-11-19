import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Deposit, Member } from '../../types';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  depositToEdit?: Deposit | null;
  defaultMemberId?: string;
  onSuccess?: () => void;
}

interface FormValues {
  memberId: string;
  date: string;
  amount: number;
  paymentMethod: string;
  note: string;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  depositToEdit,
  defaultMemberId,
  onSuccess,
}) => {
  const { selectedMonth } = useApp();
  const members = useLiveQuery(() => db.members.orderBy('room').toArray(), []) || [];
  const [memberSearch, setMemberSearch] = useState('');

  const defaultDate = `${selectedMonth}-01`;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      memberId: defaultMemberId || '',
      date: defaultDate,
      amount: 0,
      paymentMethod: 'Cash',
      note: '',
    },
  });

  const selectedMemberId = watch('memberId');

  useEffect(() => {
    if (!isOpen) return;
    if (depositToEdit) {
      reset({
        memberId: depositToEdit.memberId,
        date: depositToEdit.date,
        amount: depositToEdit.amount,
        paymentMethod: depositToEdit.paymentMethod || 'Cash',
        note: depositToEdit.note || '',
      });
    } else {
      reset({
        memberId: defaultMemberId || (members[0]?.id ?? ''),
        date: `${selectedMonth}-${String(new Date().getDate()).padStart(2, '0')}`,
        amount: 0,
        paymentMethod: 'Cash',
        note: '',
      });
    }
  }, [isOpen, depositToEdit, defaultMemberId, selectedMonth]);

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.room.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const onSubmit = async (data: FormValues) => {
    const member = members.find((m) => m.id === data.memberId);
    if (!member) return;

    const month = data.date.substring(0, 7);
    const amount = Number(data.amount);

    if (depositToEdit) {
      await db.deposits.update(depositToEdit.id, {
        memberId: member.id,
        memberName: member.name,
        room: member.room,
        date: data.date,
        month,
        amount,
        paymentMethod: data.paymentMethod,
        note: data.note,
      });
    } else {
      const newId = `DEP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await db.deposits.add({
        id: newId,
        memberId: member.id,
        memberName: member.name,
        room: member.room,
        date: data.date,
        month,
        amount,
        paymentMethod: data.paymentMethod,
        note: data.note,
        createdAt: Date.now(),
      });
    }

    onClose();
    if (onSuccess) onSuccess();
  };

  const paymentOptions = [
    { value: 'Cash', label: 'Cash' },
    { value: 'bKash', label: 'bKash' },
    { value: 'Nagad', label: 'Nagad' },
    { value: 'Rocket', label: 'Rocket' },
    { value: 'Bank Transfer', label: 'Bank Transfer' },
    { value: 'Other', label: 'Other' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={depositToEdit ? 'Edit Deposit Record' : 'Record Member Deposit'}
      subtitle="Add payment towards monthly mess meal expense"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Member selector with search */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
            Select Member *
          </label>
          <input
            type="text"
            placeholder="Search member by name or room..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="w-full text-xs p-2 rounded-xl border border-slate-200 mb-2 focus:outline-none focus:border-emerald-500"
          />
          <select
            {...register('memberId', { required: 'Please select a member' })}
            className="block w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          >
            <option value="">-- Choose Member --</option>
            {filteredMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.room} - {m.name} ({m.floor})
              </option>
            ))}
          </select>
          {errors.memberId && (
            <p className="mt-1 text-xs text-rose-600 font-medium">
              {errors.memberId.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Deposit Date *"
            type="date"
            {...register('date', { required: 'Date is required' })}
            error={errors.date?.message}
          />

          <Select
            label="Payment Method"
            options={paymentOptions}
            {...register('paymentMethod')}
          />
        </div>

        <Input
          label="Deposit Amount (BDT ৳) *"
          type="number"
          step="0.01"
          placeholder="0.00"
          {...register('amount', {
            required: 'Amount is required',
            min: { value: 1, message: 'Amount must be at least 1 ৳' },
          })}
          error={errors.amount?.message}
        />

        <Input
          label="Notes / TrxID (Optional)"
          placeholder="e.g. TrxID 9KJD81HS or 1st installment"
          {...register('note')}
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {depositToEdit ? 'Update Deposit' : 'Save Deposit'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
