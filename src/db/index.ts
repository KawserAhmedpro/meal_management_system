import Dexie, { Table } from 'dexie';
import { Member, MealEntry, Expense, Deposit, Category, SystemSettings } from '../types';
import { SEED_MEMBERS } from './seedMembers';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './seedData';

export class MealDatabase extends Dexie {
  members!: Table<Member, string>;
  mealEntries!: Table<MealEntry, string>;
  expenses!: Table<Expense, string>;
  deposits!: Table<Deposit, string>;
  categories!: Table<Category, string>;
  settings!: Table<SystemSettings, string>;

  constructor() {
    super('MealManagementDB');
    
    // Schema version 1
    this.version(1).stores({
      members: 'id, name, room, floor, status, joiningDate',
      mealEntries: 'id, memberId, date, month, type, [memberId+month]',
      expenses: 'id, date, month, category, amount',
      deposits: 'id, memberId, date, month, amount, room',
      categories: 'id, name',
      settings: 'id'
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

      await db.transaction('rw', [db.members, db.categories, db.settings], async () => {
        await db.members.bulkAdd(membersToInsert);
        await db.categories.bulkAdd(DEFAULT_CATEGORIES);
        await db.settings.put(DEFAULT_SETTINGS);
      });
      console.log(`Seeded ${membersToInsert.length} members successfully.`);
    } else {
      // Ensure settings and categories exist
      const settings = await db.settings.get('app_settings');
      if (!settings) {
        await db.settings.put(DEFAULT_SETTINGS);
      }
      const catCount = await db.categories.count();
      if (catCount === 0) {
        await db.categories.bulkAdd(DEFAULT_CATEGORIES);
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
