console.log('========================================================================');
console.log('FIRESTORE EMULATOR SECURITY RULES TEST SUITE (STRICT ALLOWLIST EDITION)');
console.log('========================================================================\n');

const PROJECT_ID = 'dainingmanagementsystem';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE_URL = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const ADMIN_UID = 'iSOfrQnFU2gxQekEFUOjSOSeEi82';
const ATTACKER_UID = 'attacker-user-999';

// Helper to construct auth headers with valid mock JWT
function getHeaders(uid, extraClaims = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (uid) {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      user_id: uid,
      sub: uid,
      aud: PROJECT_ID,
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      auth_time: Math.floor(Date.now() / 1000),
      ...extraClaims
    })).toString('base64url');
    headers['Authorization'] = `Bearer ${header}.${payload}.`;
  }
  return headers;
}

let passed = 0;
let failed = 0;

async function runTestCase(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

// REST Helpers
async function getDoc(path, uid = null, extraClaims = {}) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: 'GET',
    headers: getHeaders(uid, extraClaims)
  });
  return { status: res.status, data: await res.json() };
}

async function patchDoc(path, fields, uid = null, extraClaims = {}) {
  const restFields = {};
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === 'string') restFields[key] = { stringValue: val };
    else if (typeof val === 'number') restFields[key] = { doubleValue: val };
    else if (typeof val === 'boolean') restFields[key] = { booleanValue: val };
    else if (Array.isArray(val)) restFields[key] = { arrayValue: { values: [] } };
    else if (typeof val === 'object' && val !== null) restFields[key] = { mapValue: { fields: {} } };
  }

  const res = await fetch(`${BASE_URL}/${path}`, {
    method: 'PATCH',
    headers: getHeaders(uid, extraClaims),
    body: JSON.stringify({ fields: restFields })
  });
  return { status: res.status, data: await res.json() };
}

async function deleteDoc(path, uid = null, extraClaims = {}) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: 'DELETE',
    headers: getHeaders(uid, extraClaims)
  });
  return { status: res.status, data: await res.json() };
}

async function runAll() {
  console.log(`Target: Firestore Emulator at ${BASE_URL}\n`);

  // -------------------------------------------------------------------------
  // 1. PUBLIC UNRESTRICTED READ ON APPROVED PORTAL DOCUMENTS
  // -------------------------------------------------------------------------
  console.log('Group 1: Unauthenticated Public Reads of Approved Portal Documents');

  await runTestCase('Public unauthenticated CAN READ /public_portal/meta', async () => {
    const res = await getDoc('public_portal/meta', null);
    if (res.status === 403) throw new Error(`Expected access granted, got 403: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Public unauthenticated CAN READ valid month /public_portal/2026-03', async () => {
    const res = await getDoc('public_portal/2026-03', null);
    if (res.status === 403) throw new Error(`Expected access granted, got 403: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Public unauthenticated CAN READ boundary month /public_portal/2026-01 (Jan)', async () => {
    const res = await getDoc('public_portal/2026-01', null);
    if (res.status === 403) throw new Error(`Expected access granted, got 403: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Public unauthenticated CAN READ boundary month /public_portal/2026-12 (Dec)', async () => {
    const res = await getDoc('public_portal/2026-12', null);
    if (res.status === 403) throw new Error(`Expected access granted, got 403: ${JSON.stringify(res.data)}`);
  });

  // -------------------------------------------------------------------------
  // 2. INVALID MONTH IDS REJECTED (FORMAT & RANGE 01-12)
  // -------------------------------------------------------------------------
  console.log('\nGroup 2: Invalid Month IDs Strictly Rejected');

  await runTestCase('Public CANNOT READ month 00 (/public_portal/2026-00)', async () => {
    const res = await getDoc('public_portal/2026-00', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await runTestCase('Public CANNOT READ month 13 (/public_portal/2026-13)', async () => {
    const res = await getDoc('public_portal/2026-13', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await runTestCase('Public CANNOT READ single digit month (/public_portal/2026-3)', async () => {
    const res = await getDoc('public_portal/2026-3', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await runTestCase('Public CANNOT READ non-month path (/public_portal/secret_notes)', async () => {
    const res = await getDoc('public_portal/secret_notes', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 3. UNAUTHENTICATED USERS CANNOT CREATE, UPDATE, OR DELETE ANY DOCUMENT
  // -------------------------------------------------------------------------
  console.log('\nGroup 3: Unauthenticated Writes, Updates & Deletes Denied (Zero Public Writes)');

  await runTestCase('Public CANNOT WRITE /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', { messName: 'Hacked' }, null);
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  await runTestCase('Public CANNOT WRITE /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', { month: '2026-03' }, null);
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  await runTestCase('Public CANNOT DELETE /public_portal/meta', async () => {
    const res = await deleteDoc('public_portal/meta', null);
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  await runTestCase('Public CANNOT DELETE /public_portal/2026-03', async () => {
    const res = await deleteDoc('public_portal/2026-03', null);
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 4. ALL PRIVATE COLLECTIONS DENIED TO UNAUTHENTICATED & NON-ADMIN USERS
  // -------------------------------------------------------------------------
  console.log('\nGroup 4: All Private Collections Strictly Denied to Unauthenticated & Non-Admin');

  const privateDocs = [
    'members/MEM-001',
    'mealEntries/MEAL-001',
    'expenses/EXP-001',
    'deposits/DEP-001',
    'categories/CAT-001',
    'managers/MGR-001',
    'dailyClosures/2026-03-01',
    'settings/config',
    'appMetadata/meta'
  ];

  for (const docPath of privateDocs) {
    await runTestCase(`Unauthenticated CANNOT READ /${docPath}`, async () => {
      const res = await getDoc(docPath, null);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await runTestCase(`Unauthenticated CANNOT WRITE /${docPath}`, async () => {
      const res = await patchDoc(docPath, { test: 123 }, null);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await runTestCase(`Non-admin attacker CANNOT READ /${docPath}`, async () => {
      const res = await getDoc(docPath, ATTACKER_UID);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await runTestCase(`Non-admin attacker CANNOT WRITE /${docPath}`, async () => {
      const res = await patchDoc(docPath, { test: 123 }, ATTACKER_UID);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });
  }

  // -------------------------------------------------------------------------
  // 5. CUSTOM CLAIMS BYPASS PREVENTION (Requirement 8)
  // -------------------------------------------------------------------------
  console.log('\nGroup 5: Custom Claims Disabled (Strict Admin UID Enforcement)');

  await runTestCase('Attacker with { admin: true } claim CANNOT access private collections without authorized UID', async () => {
    const res = await getDoc('deposits/DEP-001', ATTACKER_UID, { admin: true });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden even with admin: true claim, got ${res.status}`);
  });

  await runTestCase('Attacker with { admin: true } claim CANNOT write to /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', { messName: 'Attacker Mess' }, ATTACKER_UID, { admin: true });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 6. STRICT PUBLIC FIELD ALLOWLIST ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log('\nGroup 6: Strict Public Field Allowlist Enforcement');

  // A. /public_portal/meta allowlist
  await runTestCase('Admin CAN WRITE valid allowlist fields to /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', {
      messName: 'Omar Ekushe Hall Mess',
      institutionName: 'University',
      hallName: 'Hall A',
      currencySymbol: '৳',
      activeMonth: '2026-03',
      availableMonths: ['2026-03'],
      lastPublishedAt: 1795200000000,
      currentManager: {
        managerName: 'Ratul',
        startDate: '2026-11-21',
        endDate: null,
        status: 'Active',
        totalDays: 35,
        totalMeals: 500,
        marketExpenses: 10000,
        mealRate: 20,
        feeRatePerMeal: 5,
        managerFee: 2500,
        isCurrentlyActive: true
      }
    }, ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Admin CANNOT WRITE unexpected field "deposits" to /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', {
      messName: 'Mess',
      deposits: 10000
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden on unallowed field 'deposits', got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE unexpected field "due" to /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', {
      messName: 'Mess',
      due: 2500
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden on unallowed field 'due', got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE unexpected arbitrary field "randomKey" to /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', {
      messName: 'Mess',
      randomKey: 'unexpected'
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden on unallowed field 'randomKey', got ${res.status}`);
  });

  // B. /public_portal/{monthId} allowlist
  await runTestCase('Admin CAN WRITE valid allowlist fields to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', {
      month: '2026-03',
      summary: {},
      dailyMealSummaries: [],
      expenses: [],
      members: [],
      memberDailyMeals: {},
      publishedAt: 1795200000000,
      managerAssignment: {
        managerName: 'Ratul',
        startDate: '2026-11-21',
        endDate: null,
        status: 'Active',
        totalDays: 35,
        totalMeals: 500,
        marketExpenses: 10000,
        mealRate: 20,
        feeRatePerMeal: 5,
        managerFee: 2500,
        isCurrentlyActive: true
      }
    }, ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Admin CANNOT WRITE unexpected field "phone" to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', {
      month: '2026-03',
      phone: '01712345678'
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden on unallowed field 'phone', got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE unexpected field "advance" to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', {
      month: '2026-03',
      advance: 1500
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden on unallowed field 'advance', got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE unexpected field "personalNotes" to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', {
      month: '2026-03',
      personalNotes: 'private note'
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden on unallowed field 'personalNotes', got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE arbitrary unexpected field "attackerField" to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', {
      month: '2026-03',
      attackerField: 'leak'
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden on unallowed field 'attackerField', got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE to invalid month format /public_portal/2026-15', async () => {
    const res = await patchDoc('public_portal/2026-15', {
      month: '2026-15'
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden on invalid month 2026-15, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 7. SEPARATION OF CREATE/UPDATE FROM DELETE (Requirement 5 & 10)
  // -------------------------------------------------------------------------
  console.log('\nGroup 7: Safe Delete Operations (No request.resource Null Reference Error)');

  await runTestCase('Admin CAN DELETE /public_portal/2026-03 safely without null request.resource errors', async () => {
    const res = await deleteDoc('public_portal/2026-03', ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200 OK on admin delete, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Admin CAN DELETE /public_portal/meta safely', async () => {
    const res = await deleteDoc('public_portal/meta', ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200 OK on admin delete, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  // -------------------------------------------------------------------------
  // 8. ADMIN READ & WRITE TO PRIVATE COLLECTIONS
  // -------------------------------------------------------------------------
  console.log('\nGroup 8: Authorized Admin Full Private Collection Access');

  await runTestCase('Admin CAN WRITE to private collection /members/MEM-001', async () => {
    const res = await patchDoc('members/MEM-001', { name: 'Member 1', room: '101' }, ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  await runTestCase('Admin CAN READ from private collection /members/MEM-001', async () => {
    const res = await getDoc('members/MEM-001', ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  await runTestCase('Admin CAN WRITE to private collection /deposits/DEP-001', async () => {
    const res = await patchDoc('deposits/DEP-001', { memberId: 'MEM-001', amount: 3000 }, ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  await runTestCase('Admin CAN READ from private collection /deposits/DEP-001', async () => {
    const res = await getDoc('deposits/DEP-001', ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  console.log('\n========================================================================');
  console.log(`EMULATOR TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
