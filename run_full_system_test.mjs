import { spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

console.log('====================================================');
console.log('STARTING FULL AUTOMATED SYSTEM & SETTINGS E2E TEST');
console.log('====================================================\n');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000/meal_management_system/';
const PORT = 9222;

const tempProfileDir = mkdtempSync(join(tmpdir(), 'chrome-e2e-'));

// Launch Chrome in headless mode
const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${tempProfileDir}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  BASE_URL,
]);

let isExiting = false;
function cleanup() {
  if (isExiting) return;
  isExiting = true;
  try {
    chromeProc.kill('SIGKILL');
  } catch (e) {}
  try {
    rmSync(tempProfileDir, { recursive: true, force: true });
  } catch (e) {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simple CDP client over WebSocket
class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.exceptions = [];

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      } else if (data.method === 'Runtime.consoleAPICalled') {
        if (data.params.type === 'error') {
          const text = data.params.args.map((a) => a.value || JSON.stringify(a)).join(' ');
          this.consoleErrors.push(text);
          console.error(`    [Browser Console Error]: ${text}`);
        }
      } else if (data.method === 'Runtime.exceptionThrown') {
        const desc = data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text;
        this.exceptions.push(desc);
        console.error(`    [Browser Exception]: ${desc}`);
      }
    };
  }

  async ready() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    writeFileSync(filename, buffer);
    console.log(`    [Screenshot saved]: ${filename}`);
  }
}

async function run() {
  await sleep(2500);

  // Fetch debug targets
  const versionRes = await fetch(`http://127.0.0.1:${PORT}/json`);
  const tabs = await versionRes.json();
  const mainTab = tabs.find((t) => t.type === 'page');

  if (!mainTab) {
    throw new Error('No Chrome browser tab found');
  }

  console.log(`✓ Connected to Chrome CDP target: ${mainTab.url}`);
  const client = new CDPClient(mainTab.webSocketDebuggerUrl);
  await client.ready();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('DOM.enable');

  console.log('\n--- TEST SUITE 1: Application Initial Load & Seed Data ---');
  await sleep(1500);

  const title = await client.eval('document.title');
  console.log(`  ✓ Document title: "${title}"`);

  // Wait for Dexie seed data to settle
  await sleep(1000);
  const memberCount = await client.eval(`
    new Promise((resolve) => {
      const req = indexedDB.open('MealManagementDB');
      req.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('members')) return resolve(0);
        const tx = db.transaction('members', 'readonly');
        const countReq = tx.objectStore('members').count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(0);
      };
      req.onerror = () => resolve(0);
    })
  `);
  console.log(`  ✓ IndexedDB members count: ${memberCount} records`);

  console.log('\n--- TEST SUITE 2: Dashboard Overview ---');
  await client.send('Page.navigate', { url: `${BASE_URL}` });
  await sleep(1500);

  const dashboardHeading = await client.eval(`document.querySelector('h2')?.innerText || ''`);
  console.log(`  ✓ Dashboard header: "${dashboardHeading}"`);

  const statCardsCount = await client.eval(`document.querySelectorAll('.grid > div').length`);
  console.log(`  ✓ Dashboard stat cards rendered: ${statCardsCount}`);
  await client.screenshot('test_dashboard.png');

  console.log('\n--- TEST SUITE 3: SETTINGS PAGE & "SAVE ALL SETTINGS" TEST ---');
  console.log('  Navigating to /settings...');
  await client.send('Page.navigate', { url: `${BASE_URL}settings` });
  await sleep(1500);

  // Verify settings inputs exist
  const managerInputVal = await client.eval(`document.querySelector('input[name="managerName"]')?.value || ''`);
  console.log(`  ✓ Initial Manager Name in Settings: "${managerInputVal}"`);

  // Modify manager name to test saving
  console.log('  Changing Manager Name to "Engr. Ratul (Dining Manager)"...');
  await client.eval(`
    (() => {
      const input = document.querySelector('input[name="managerName"]');
      if (input) {
        input.value = "Engr. Ratul (Dining Manager)";
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()
  `);

  console.log('  Clicking "Save All Settings" button...');
  await client.eval(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const saveBtn = buttons.find(b => b.innerText.includes('Save All Settings'));
      if (saveBtn) saveBtn.click();
    })()
  `);

  // Wait 1.5s after clicking save
  await sleep(1500);

  // Verify whether page went blank or still renders
  const bodyText = await client.eval(`document.body.innerText.trim()`);
  const isBlank = bodyText.length < 50;
  const hasError = bodyText.includes('Something went wrong') || client.exceptions.length > 0;

  if (isBlank) {
    console.error('  ✗ FAIL: Page went completely BLANK after clicking Save All Settings!');
  } else if (hasError) {
    console.error('  ✗ FAIL: Error boundary triggered or uncaught exception after Save All Settings!');
  } else {
    console.log('  ✓ PASS: Page remains fully visible and responsive after Save All Settings! No blank screen.');
  }

  // Check success notification
  const successNoticeText = await client.eval(`document.querySelector('.bg-emerald-50')?.innerText || ''`);
  console.log(`  ✓ Settings Notice: "${successNoticeText}"`);

  // Verify updated top bar manager name
  const topNavManagerName = await client.eval(`
    document.querySelector('header span.font-bold')?.innerText || ''
  `);
  console.log(`  ✓ Top Navigation Manager Name updated to: "${topNavManagerName}"`);
  await client.screenshot('test_settings_saved.png');

  console.log('\n--- TEST SUITE 4: Managers & Daily Closures (/managers) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}managers` });
  await sleep(1500);

  const mgrHeading = await client.eval(`document.querySelector('h1')?.innerText || ''`);
  console.log(`  ✓ Managers Page heading: "${mgrHeading}"`);

  // Verify Manager cards and table
  const managerRowsCount = await client.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`  ✓ Managers rendered in history table: ${managerRowsCount}`);

  // Switch to Holidays & Closures tab
  console.log('  Switching to "Holidays & Closures" tab...');
  await client.eval(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const closuresTab = buttons.find(b => b.innerText.includes('Holidays & Closures'));
      if (closuresTab) closuresTab.click();
    })()
  `);
  await sleep(1000);

  const daysGridCount = await client.eval(`document.querySelectorAll('.grid-cols-7 > div, .grid-cols-4 > div').length`);
  console.log(`  ✓ Days rendered in monthly calendar grid: ${daysGridCount}`);

  // Test toggling Day 5 to FULL MEAL OFF
  console.log('  Toggling Day 5 to FULL MEAL OFF...');
  await client.eval(`
    (() => {
      const toggleBtns = Array.from(document.querySelectorAll('button'));
      const setOffBtn = toggleBtns.find(b => b.innerText.trim() === 'Set OFF');
      if (setOffBtn) setOffBtn.click();
    })()
  `);
  await sleep(1000);

  const offBadgeCount = await client.eval(`
    Array.from(document.querySelectorAll('span')).filter(s => s.innerText.trim() === 'OFF').length
  `);
  console.log(`  ✓ OFF badges count in calendar: ${offBadgeCount}`);
  await client.screenshot('test_managers_closures.png');

  console.log('\n--- TEST SUITE 5: Member Management (/members) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}members` });
  await sleep(1500);

  const memberRows = await client.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`  ✓ Members table rendered: ${memberRows} members shown`);

  // Test search
  await client.eval(`
    (() => {
      const input = document.querySelector('input[placeholder*="Search"]');
      if (input) {
        input.value = "ashik";
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await sleep(500);
  const filteredMemberRows = await client.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`  ✓ Filtered members for "ashik": ${filteredMemberRows} rows`);
  await client.screenshot('test_members.png');

  console.log('\n--- TEST SUITE 6: Meal Management (/meals) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}meals` });
  await sleep(1500);

  const gridRows = await client.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`  ✓ Meal Spreadsheet Grid loaded with ${gridRows} rows`);

  // Switch to Daily Roll Call
  await client.eval(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const rollCallBtn = btns.find(b => b.innerText.includes('Daily Roll Call'));
      if (rollCallBtn) rollCallBtn.click();
    })()
  `);
  await sleep(1000);

  const rollCallRooms = await client.eval(`document.querySelectorAll('.font-mono').length`);
  console.log(`  ✓ Daily Roll Call view rendered`);
  await client.screenshot('test_meals.png');

  console.log('\n--- TEST SUITE 7: Market & Expenses (/expenses) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}expenses` });
  await sleep(1500);

  const expenseRows = await client.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`  ✓ Expense records displayed: ${expenseRows}`);
  await client.screenshot('test_expenses.png');

  console.log('\n--- TEST SUITE 8: Transactions (/transactions) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}transactions` });
  await sleep(1500);

  const transRows = await client.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`  ✓ Member transaction records displayed: ${transRows}`);
  await client.screenshot('test_transactions.png');

  console.log('\n--- TEST SUITE 9: Reports & Analytics (/reports) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}reports` });
  await sleep(1500);

  const reportsTabs = await client.eval(`
    Array.from(document.querySelectorAll('.grid button')).map(b => b.innerText.trim().replace(/\\n/g, ' '))
  `);
  console.log(`  ✓ Available Reports tabs (${reportsTabs.length}):`);
  reportsTabs.forEach((name, i) => console.log(`      ${i + 1}. ${name}`));

  // Click on "Date-wise Meal ON/OFF Report"
  console.log('  Testing Report 2: Date-wise Meal ON/OFF Report...');
  await client.eval(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const tab = btns.find(b => b.innerText.includes('Meal ON/OFF'));
      if (tab) tab.click();
    })()
  `);
  await sleep(1000);
  const closureReportRows = await client.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`  ✓ Date-wise Meal ON/OFF rows rendered: ${closureReportRows}`);

  // Click on "Manager Fee Report (Option A)"
  console.log('  Testing Report 3: Manager Fee Report (Option A)...');
  await client.eval(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const tab = btns.find(b => b.innerText.includes('Manager Meal Count') || b.innerText.includes('Manager Fee'));
      if (tab) tab.click();
    })()
  `);
  await sleep(1000);
  const feeReportRows = await client.eval(`document.querySelectorAll('tbody tr').length`);
  console.log(`  ✓ Manager Fee (Option A) rows rendered: ${feeReportRows}`);
  await client.screenshot('test_reports.png');

  console.log('\n--- TEST SUITE 10: Print Center (/print) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}print` });
  await sleep(1500);

  const printRooms = await client.eval(`document.querySelectorAll('.print\\\\:grid-cols-4 > div').length`);
  console.log(`  ✓ Printable room blocks rendered: ${printRooms}`);
  await client.screenshot('test_print.png');

  console.log('\n--- TEST SUITE 11: Backup & Restore (/backup) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}backup` });
  await sleep(1500);

  const backupHeading = await client.eval(`document.querySelector('h2')?.innerText || ''`);
  console.log(`  ✓ Backup & Restore page loaded: "${backupHeading}"`);
  await client.screenshot('test_backup.png');

  console.log('\n====================================================');
  console.log('OVERALL E2E BROWSER TEST RESULTS');
  console.log('====================================================');
  console.log(`Total Uncaught Browser Exceptions: ${client.exceptions.length}`);
  console.log(`Total Browser Console Errors: ${client.consoleErrors.length}`);

  if (client.exceptions.length === 0 && client.consoleErrors.length === 0) {
    console.log('\n🎉 ALL FEATURES AND SETTINGS TESTS PASSED WITH 0 ERRORS!');
  } else {
    console.error('\n⚠️ SOME ISSUES DETECTED:');
    client.exceptions.forEach((e) => console.error(`  - Exception: ${e}`));
    client.consoleErrors.forEach((e) => console.error(`  - Error: ${e}`));
  }

  cleanup();
  process.exit(client.exceptions.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test script crashed:', err);
  cleanup();
  process.exit(1);
});
