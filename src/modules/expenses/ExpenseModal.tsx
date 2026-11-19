import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Expense, Category } from '../../types';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenseToEdit?: Expense | null;
  onSuccess?: () => void;
}

interface FormValues {
  date: string;
  title: string;
  amount: number;
  category: string;
  notes: string;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  expenseToEdit,
  onSuccess,
}) => {
  const { selectedMonth } = useApp();
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const [customCategory, setCustomCategory] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  // Default date in selectedMonth
  const defaultDate = `${selectedMonth}-01`;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      date: defaultDate,
      title: '',
      amount: 0,
      category: 'Market',
      notes: '',
    },
  });

  const selectedCategoryVal = watch('category');

  useEffect(() => {
    if (!isOpen) return;
    if (expenseToEdit) {
      reset({
        date: expenseToEdit.date,
        title: expenseToEdit.title,
        amount: expenseToEdit.amount,
        category: expenseToEdit.category,
        notes: expenseToEdit.notes || '',
      });
    } else {
      reset({
        date: `${selectedMonth}-${String(new Date().getDate()).padStart(2, '0')}`,
        title: '',
        amount: 0,
        category: 'Market',
        notes: '',
      });
    }
  }, [isOpen, expenseToEdit, selectedMonth]);

  const handleAddCustomCategory = async () => {
    if (!customCategory.trim()) return;
    const catName = customCategory.trim();
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: catName,
      isDefault: false,
    };
    await db.categories.add(newCat);
    setValue('category', catName);
    setCustomCategory('');
    setIsAddingCategory(false);
  };

  const onSubmit = async (data: FormValues) => {
    const month = data.date.substring(0, 7);
    const amount = Number(data.amount);

    if (expenseToEdit) {
      await db.expenses.update(expenseToEdit.id, {
        date: data.date,
        month,
        title: data.title,
        amount,
        category: data.category,
        notes: data.notes,
      });
    } else {
      const newId = `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await db.expenses.add({
        id: newId,
        date: data.date,
        month,
        title: data.title,
        amount,
        category: data.category,
        notes: data.notes,
        createdAt: Date.now(),
      });
    }

    onClose();
    if (onSuccess) onSuccess();
  };

  const categoryOptions = categories.map((c) => ({
    value: c.name,
    label: c.name,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={expenseToEdit ? 'Edit Market Expense' : 'Add Market Expense'}
      subtitle="Record cost for meal bazaar or mess operation"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date *"
            type="date"
            {...register('date', { required: 'Date is required' })}
            error={errors.date?.message}
          />

          <div className="flex flex-col justify-end">
            <Select
              label="Category *"
              options={categoryOptions}
              {...register('category')}
            />
          </div>
        </div>

        {/* Option to create custom category */}
        {isAddingCategory ? (
          <div className="flex gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <input
              type="text"
              placeholder="New category name"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              className="text-xs p-1.5 rounded-lg border border-slate-200 flex-1"
            />
            <Button size="sm" type="button" onClick={handleAddCustomCategory}>
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setIsAddingCategory(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsAddingCategory(true)}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
            >
              + Create New Category
            </button>
          </div>
        )}

        <Input
          label="Item Description *"
          placeholder="e.g. Vegetables, Rice, Chicken, Spices, Gas cylinder"
          {...register('title', { required: 'Item description is required' })}
          error={errors.title?.message}
        />

        <Input
          label="Amount (BDT ৳) *"
          type="number"
          step="0.01"
          placeholder="0.00"
          {...register('amount', {
            required: 'Amount is required',
            min: { value: 0.01, message: 'Amount must be greater than 0' },
          })}
          error={errors.amount?.message}
        />

        <Input
          label="Notes / Shopper / Voucher (Optional)"
          placeholder="e.g. Bought by Robiul from Mechua Bazar"
          {...register('notes')}
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {expenseToEdit ? 'Update Expense' : 'Save Expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
