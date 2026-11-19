import { Category, SystemSettings } from '../types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Market', isDefault: true },
  { id: 'cat-2', name: 'Vegetables', isDefault: true },
  { id: 'cat-3', name: 'Rice', isDefault: true },
  { id: 'cat-4', name: 'Fish', isDefault: true },
  { id: 'cat-5', name: 'Meat', isDefault: true },
  { id: 'cat-6', name: 'Grocery', isDefault: true },
  { id: 'cat-7', name: 'Gas', isDefault: true },
  { id: 'cat-8', name: 'Other', isDefault: true },
];

export const DEFAULT_SETTINGS: SystemSettings = {
  id: 'app_settings',
  messName: 'Omar Ekushe Hall Mess',
  institutionName: 'Mymensingh Engineering College',
  hallName: 'Omar Ekushe Hall',
  currency: 'BDT',
  currencySymbol: '৳',
  managerFeePerMeal: 5,
  theme: 'light',
  dateFormat: 'yyyy-MM-dd',
  pinLockEnabled: false,
  pinCode: '',
  selectedMonth: '2026-03',
  lastBackupDate: null,
  reminderDays: 7,
};
