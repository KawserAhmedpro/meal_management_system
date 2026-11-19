import Dexie, { Table } from 'dexie';
import {
  Member,
  MealEntry,
  Expense,
  Deposit,
  Category,
  SystemSettings,
  ManagerPeriod,
  DailyMealClosure,
} from '../types';
import { SEED_MEMBERS } from './seedMembers';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './seedData';

export class MealDatabase extends Dexie {
  members!: Table<Member, string>;
  mealEntries!: Table<MealEntry, string>;
  expenses!: Table<Expense, string>;
  deposits!: Table<Deposit, string>;
  categories!: Table<Category, string>;
  settings!: Table<SystemSettings, string>;
  managers!: Table<ManagerPeriod, string>;
  dailyClosures!: Table<DailyMealClosure, string>;

  constructor() {
    super('MealManagementDB');

    // Schema version 1
    this.version(1).stores({
      members: 'id, name, room, floor, status, joiningDate',
      mealEntries: 'id, memberId, date, month, type, [memberId+month]',
      expenses: 'id, date, month, category, amount',
      deposits: 'id, memberId, date, month, amount, room',
      categories: 'id, name',
      settings: 'id',
    });

    // Schema version 2: Dynamic Manager History & Daily Meal Closures
    this.version(2).stores({
      members: 'id, name, room, floor, status, joiningDate',
      mealEntries: 'id, memberId, date, month, type, [memberId+month]',
      expenses: 'id, date, month, category, amount',
      deposits: 'id, memberId, date, month, amount, room',
      categories: 'id, name',
      settings: 'id',
      managers: 'id, name, startDate, endDate, status',
      dailyClosures: 'date, month, status',
    });
  }
}

export const db = new MealDatabase();

// Initialize database with default seed data if empty
export async function initializeDatabase(): Promise<void> {
  try {
    const memberCount = await db.members.count();
    if (memberCount === 0) {
      console.log('Seeding initial members from SULTAN MEAL...');
      const now = Date.now();
      const membersToInsert: Member[] = SEED_MEMBERS.map((m) => ({
        ...m,
        createdAt: now,
        updatedAt: now,
      }));

      await db.transaction(
        'rw',
        [db.members, db.categories, db.settings, db.managers],
        async () => {
          await db.members.bulkPut(membersToInsert);
          await db.categories.bulkPut(DEFAULT_CATEGORIES);
          await db.settings.put(DEFAULT_SETTINGS);
          // Initial manager
          await db.managers.put({
            id: 'MGR-001',
            name: DEFAULT_SETTINGS.managerName || 'Ratul',
            startDate: '2026-01-01',
            endDate: null,
            status: 'Active',
            notes: 'Initial mess manager',
            createdAt: now,
            updatedAt: now,
          });
        }
      );
      console.log(`Seeded ${membersToInsert.length} members successfully.`);
    } else {
      // Ensure settings and categories exist
      const settings = await db.settings.get('app_settings');
      if (!settings) {
        await db.settings.put(DEFAULT_SETTINGS);
      }
      const catCount = await db.categories.count();
      if (catCount === 0) {
        await db.categories.bulkPut(DEFAULT_CATEGORIES);
      }
      // Ensure at least one manager exists
      const mgrCount = await db.managers.count();
      if (mgrCount === 0) {
        const now = Date.now();
        const currentSettings = (await db.settings.get('app_settings')) || DEFAULT_SETTINGS;
        await db.managers.put({
          id: 'MGR-001',
          name: currentSettings.managerName || 'Ratul',
          startDate: '2026-01-01',
          endDate: null,
          status: 'Active',
          notes: 'Mess manager',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
}

// Helper to request persistent storage
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return true;
    } catch (e) {
      console.warn('Persistent storage request failed:', e);
      return false;
    }
  }
  return false;
}
