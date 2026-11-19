import * as XLSX from 'xlsx';
import { Member, MealEntry, Expense, Deposit, MealStatus } from '../types';

export interface ExcelImportPreview {
  members: Member[];
  mealEntries: MealEntry[];
  expenses: Expense[];
  deposits: Deposit[];
  existingDuplicates: number;
  sheetNames: string[];
}

export async function parseExcelWorkbook(
  file: File,
  existingMemberIds: Set<string>,
  selectedMonth: string
): Promise<ExcelImportPreview> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const sheetNames = workbook.SheetNames;
  const members: Member[] = [];
  const mealEntries: MealEntry[] = [];
  const expenses: Expense[] = [];
  const deposits: Deposit[] = [];
  let existingDuplicates = 0;

  // Map of member by Name to ID
  const memberNameToId = new Map<string, string>();

  // 1. Check for "Transactions" sheet (from SULTAN MEAL.xlsx)
  const transSheet = workbook.Sheets['Transactions'] || workbook.Sheets['Member Financials'];
  if (transSheet) {
    const rows: any[][] = XLSX.utils.sheet_to_json(transSheet, { header: 1, defval: '' });

    let currentFloor = '1st Floor';
    let currentRoom = '';

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const colA = String(row[0] || '').trim();
      const colB = String(row[1] || '').trim();

      const upperA = colA.toUpperCase();
      const upperB = colB.toUpperCase();

      if (upperA.includes('2ND FLOOR') || upperB.includes('2ND FLOOR') || upperA.includes('FLOOR-2')) {
        currentFloor = '2nd Floor';
        continue;
      } else if (upperA.includes('3RD FLOOR') || upperB.includes('3RD FLOOR')) {
        currentFloor = '3rd Floor';
        continue;
      } else if (upperA.includes('4TH FLOOR') || upperB.includes('4TH FLOOR')) {
        currentFloor = '4th Floor';
        continue;
      } else if (upperA.includes('5TH FLOOR') || upperB.includes('5TH FLOOR')) {
        currentFloor = '5th Floor';
        continue;
      } else if (upperA.includes('1ST FLOOR') || upperB.includes('1ST FLOOR')) {
        currentFloor = '1st Floor';
        continue;
      }

      if (upperA.startsWith('ROOM')) {
        currentRoom = colA.trim();
      }

      if (colB && !['NAME', 'TOTAL', 'ROOM NO', 'TOTAL DEPOSITS'].includes(upperB)) {
        let floor = currentFloor;
        const roomUpper = currentRoom.toUpperCase();
        if (roomUpper.includes('ROOM-1') || roomUpper.includes('ROOM-0')) floor = '1st Floor';
        else if (roomUpper.includes('ROOM-2')) floor = '2nd Floor';
        else if (roomUpper.includes('ROOM-3')) floor = '3rd Floor';
        else if (roomUpper.includes('ROOM-4')) floor = '4th Floor';
        else if (roomUpper.includes('ROOM-5')) floor = '5th Floor';

        const memberId = `MEM-${String(members.length + 1).padStart(3, '0')}`;
        if (existingMemberIds.has(memberId)) {
          existingDuplicates++;
        }

        const newMem: Member = {
          id: memberId,
          name: colB,
          room: currentRoom || 'ROOM-101',
          floor,
          joiningDate: '2026-01-01',
          status: 'Active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        members.push(newMem);
        memberNameToId.set(colB.toLowerCase(), memberId);

        // Deposits from Deposit-1..Deposit-5 (columns C through G)
        for (let depCol = 2; depCol <= 6; depCol++) {
          const depVal = parseFloat(row[depCol]);
          if (!isNaN(depVal) && depVal > 0) {
            deposits.push({
              id: `DEP-${Date.now()}-${deposits.length + 1}`,
              memberId,
              memberName: colB,
              room: currentRoom,
              date: `${selectedMonth}-01`,
              month: selectedMonth,
              amount: depVal,
              paymentMethod: 'Cash',
              note: `Deposit-${depCol - 1} from Excel`,
              createdAt: Date.now(),
            });
          }
        }
      }
    }
  }

  // 2. Check for "Meals" sheet (from SULTAN MEAL.xlsx)
  const mealsSheet = workbook.Sheets['Meals'];
  if (mealsSheet) {
    const mealRows: any[][] = XLSX.utils.sheet_to_json(mealsSheet, { header: 1, defval: '' });

    for (let r = 0; r < mealRows.length; r++) {
      const row = mealRows[r];
      const memberName = String(row[1] || '').trim();
      if (!memberName || ['NAME', 'TOTAL'].includes(memberName.toUpperCase())) continue;

      const memberId = memberNameToId.get(memberName.toLowerCase());
      if (memberId) {
        // Columns C through AG are day 1 through 31
        for (let d = 1; d <= 31; d++) {
          const colIdx = d + 1; // Col C is index 2, day 1
          if (colIdx < row.length) {
            const rawVal = String(row[colIdx] || '').trim();
            if (rawVal) {
              const dayStr = String(d).padStart(2, '0');
              const date = `${selectedMonth}-${dayStr}`;

              let type: MealStatus = 'Blank';
              let count = 0;

              if (rawVal === '1' || rawVal.toUpperCase() === 'ON') {
                type = 'ON';
                count = 1;
              } else if (rawVal === '2' || rawVal.toUpperCase() === 'DOUBLE') {
                type = 'Double';
                count = 2;
              } else if (rawVal === '0' || rawVal.toUpperCase() === 'OFF') {
                type = 'OFF';
                count = 0;
              }

              if (type !== 'Blank') {
                mealEntries.push({
                  id: `${memberId}_${date}`,
                  memberId,
                  date,
                  month: selectedMonth,
                  type,
                  count,
                  updatedAt: Date.now(),
                });
              }
            }
          }
        }
      }
    }
  }

  // 3. Check for "Costs" sheet (from SULTAN MEAL.xlsx)
  const costsSheet = workbook.Sheets['Costs'];
  if (costsSheet) {
    const costRows: any[][] = XLSX.utils.sheet_to_json(costsSheet, { header: 1, defval: '' });

    for (let r = 0; r < costRows.length; r++) {
      const row = costRows[r];
      const rawDate = row[1];
      const item = String(row[2] || '').trim();
      const rawCost = row[3];

      const cost = parseFloat(rawCost);
      if (item && !isNaN(cost) && cost > 0 && !['ITEMS', 'TOTAL COST'].includes(item.toUpperCase())) {
        let dateStr = `${selectedMonth}-01`;
        if (typeof rawDate === 'number') {
          // Excel serial date conversion
          const jsDate = new Date((rawDate - (25567 + 2)) * 86400 * 1000);
          dateStr = jsDate.toISOString().split('T')[0];
        } else if (typeof rawDate === 'string' && rawDate.includes('-')) {
          dateStr = rawDate.trim();
        }

        expenses.push({
          id: `EXP-${Date.now()}-${expenses.length + 1}`,
          date: dateStr,
          month: dateStr.substring(0, 7),
          title: item,
          amount: cost,
          category: 'Market',
          notes: 'Imported from SULTAN MEAL Costs sheet',
          createdAt: Date.now(),
        });
      }
    }
  }

  return {
    members,
    mealEntries,
    expenses,
    deposits,
    existingDuplicates,
    sheetNames,
  };
}
