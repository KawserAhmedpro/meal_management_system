import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Member } from '../../types';
import { db } from '../../db';

interface MemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberToEdit?: Member | null;
  onSuccess?: () => void;
}

interface FormValues {
  name: string;
  room: string;
  floor: string;
  joiningDate: string;
  status: 'Active' | 'Inactive';
  phone: string;
  notes: string;
}

export const MemberModal: React.FC<MemberModalProps> = ({
  isOpen,
  onClose,
  memberToEdit,
  onSuccess,
}) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: '',
      room: 'ROOM-101',
      floor: '1st Floor',
      joiningDate: new Date().toISOString().split('T')[0],
      status: 'Active',
      phone: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (memberToEdit) {
      reset({
        name: memberToEdit.name,
        room: memberToEdit.room,
        floor: memberToEdit.floor,
        joiningDate: memberToEdit.joiningDate,
        status: memberToEdit.status,
        phone: memberToEdit.phone || '',
        notes: memberToEdit.notes || '',
      });
    } else {
      reset({
        name: '',
        room: 'ROOM-101',
        floor: '1st Floor',
        joiningDate: new Date().toISOString().split('T')[0],
        status: 'Active',
        phone: '',
        notes: '',
      });
    }
  }, [memberToEdit, reset, isOpen]);

  const onSubmit = async (data: FormValues) => {
    const now = Date.now();
    if (memberToEdit) {
      await db.members.update(memberToEdit.id, {
        ...data,
        updatedAt: now,
      });
    } else {
      const count = await db.members.count();
      const newId = `MEM-${String(count + 1).padStart(3, '0')}`;
      await db.members.add({
        id: newId,
        ...data,
        createdAt: now,
        updatedAt: now,
      });
    }
    onClose();
    if (onSuccess) onSuccess();
  };

  const floorOptions = [
    { value: '1st Floor', label: '1st Floor' },
    { value: '2nd Floor', label: '2nd Floor' },
    { value: '3rd Floor', label: '3rd Floor' },
    { value: '4th Floor', label: '4th Floor' },
    { value: '5th Floor', label: '5th Floor' },
  ];

  const statusOptions = [
    { value: 'Active', label: 'Active' },
    { value: 'Inactive', label: 'Inactive' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={memberToEdit ? 'Edit Member Details' : 'Add New Member'}
      subtitle={memberToEdit ? `ID: ${memberToEdit.id}` : 'Create a new member entry in the mess'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Full Name *"
          placeholder="e.g. Ashik, Arnob, Robin"
          {...register('name', { required: 'Name is required' })}
          error={errors.name?.message}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Room Number *"
            placeholder="e.g. ROOM-101, ROOM-205"
            {...register('room', { required: 'Room is required' })}
            error={errors.room?.message}
          />

          <Select
            label="Floor"
            options={floorOptions}
            {...register('floor')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Joining Date"
            type="date"
            {...register('joiningDate')}
          />

          <Select
            label="Status"
            options={statusOptions}
            {...register('status')}
          />
        </div>

        <Input
          label="Phone Number (Optional)"
          placeholder="017xxxxxxxx"
          {...register('phone')}
        />

        <Input
          label="Notes / Designation (Optional)"
          placeholder="e.g. Room leader / Student"
          {...register('notes')}
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {memberToEdit ? 'Update Member' : 'Save Member'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
