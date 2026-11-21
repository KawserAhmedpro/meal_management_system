console.log('====================================================');
console.log('STARTING FIRESTORE EMULATOR SECURITY RULES TEST SUITE');
console.log('====================================================\n');

const PROJECT_ID = 'dainingmanagementsystem';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE_URL = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const ADMIN_UID = 'iSOfrQnFU2gxQekEFUOjSOSeEi82';
const ATTACKER_UID = 'attacker-user-999';

// Helper to construct auth headers
function getHeaders(uid) {
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
      auth_time: Math.floor(Date.now() / 1000)
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
async function getDoc(path, uid = null) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: 'GET',
    headers: getHeaders(uid)
  });
  return { status: res.status, data: await res.json() };
}

async function patchDoc(path, fields, uid = null) {
  // convert simple fields to Firestore REST format
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
    headers: getHeaders(uid),
    body: JSON.stringify({ fields: restFields })
  });
  return { status: res.status, data: await res.json() };
}

async function deleteDoc(path, uid = null) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: 'DELETE',
    headers: getHeaders(uid)
  });
  return { status: res.status, data: await res.json() };
}

async function runAll() {
  console.log(`Connected to Firestore Emulator at ${BASE_URL}\n`);

  // -------------------------------------------------------------------------
  // 1. PUBLIC UNRESTRICTED READ ON APPROVED PUBLIC_PORTAL DOCUMENTS
  // -------------------------------------------------------------------------
  console.log('Group 1: Public Read Access (Unauthenticated)');

  await runTestCase('Public unauthenticated user CAN READ /public_portal/meta', async () => {
    const res = await getDoc('public_portal/meta', null);
    // 200 (found) or 404 (not found) means read permission was granted (not 403 Forbidden)
    if (res.status === 403) throw new Error(`Expected access granted, got 403: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Public unauthenticated user CAN READ valid month /public_portal/2026-03', async () => {
    const res = await getDoc('public_portal/2026-03', null);
    if (res.status === 403) throw new Error(`Expected access granted, got 403: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Public unauthenticated user CAN READ valid month /public_portal/2026-12 (month 12)', async () => {
    const res = await getDoc('public_portal/2026-12', null);
    if (res.status === 403) throw new Error(`Expected access granted, got 403: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Public unauthenticated user CAN READ valid month /public_portal/2026-01 (month 01)', async () => {
    const res = await getDoc('public_portal/2026-01', null);
    if (res.status === 403) throw new Error(`Expected access granted, got 403: ${JSON.stringify(res.data)}`);
  });

  // -------------------------------------------------------------------------
  // 2. PUBLIC RESTRICTIONS ON INVALID MONTHS & ARBITRARY PATHS
  // -------------------------------------------------------------------------
  console.log('\nGroup 2: Public Denial on Invalid Month Format & Non-Whitelisted Documents');

  await runTestCase('Public user CANNOT READ invalid month /public_portal/2026-00 (month 00)', async () => {
    const res = await getDoc('public_portal/2026-00', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await runTestCase('Public user CANNOT READ invalid month /public_portal/2026-13 (month 13)', async () => {
    const res = await getDoc('public_portal/2026-13', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await runTestCase('Public user CANNOT READ invalid month format /public_portal/2026-3 (single digit month)', async () => {
    const res = await getDoc('public_portal/2026-3', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await runTestCase('Public user CANNOT READ arbitrary path /public_portal/secret_notes', async () => {
    const res = await getDoc('public_portal/secret_notes', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await runTestCase('Public user CANNOT READ subcollection /public_portal/2026-03/nested/doc1', async () => {
    const res = await getDoc('public_portal/2026-03/nested/doc1', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 3. PUBLIC USERS CANNOT WRITE, UPDATE, OR DELETE ANYWHERE
  // -------------------------------------------------------------------------
  console.log('\nGroup 3: Public Write Denial (Zero Public Writes)');

  await runTestCase('Public user CANNOT WRITE to /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', { title: 'Hacked' }, null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await runTestCase('Public user CANNOT WRITE to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', { month: '2026-03' }, null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await runTestCase('Public user CANNOT DELETE /public_portal/2026-03', async () => {
    const res = await deleteDoc('public_portal/2026-03', null);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 4. PRIVATE COLLECTIONS STRICTLY DENIED TO UNAUTHENTICATED USERS & ATTACKERS
  // -------------------------------------------------------------------------
  console.log('\nGroup 4: Private Collections Denial (Members, Deposits, Expenses, Settings)');

  const privateCols = [
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

  for (const path of privateCols) {
    await runTestCase(`Public unauthenticated CANNOT READ /${path}`, async () => {
      const res = await getDoc(path, null);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await runTestCase(`Attacker user CANNOT READ /${path}`, async () => {
      const res = await getDoc(path, ATTACKER_UID);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });
  }

  // -------------------------------------------------------------------------
  // 5. ADMIN WRITE PERMISSIONS & PRIVATE-FIELD REJECTION
  // -------------------------------------------------------------------------
  console.log('\nGroup 5: Admin Writes & Private-Field Enforcement');

  await runTestCase('Admin CAN WRITE clean data to /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', {
      messName: 'Test Mess',
      updatedAt: '2026-03-01'
    }, ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Admin CANNOT WRITE private field "deposits" to /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', {
      messName: 'Test Mess',
      deposits: 5000
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden when private field 'deposits' is present, got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE private field "due" to /public_portal/meta', async () => {
    const res = await patchDoc('public_portal/meta', {
      messName: 'Test Mess',
      due: 1200
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden when private field 'due' is present, got ${res.status}`);
  });

  await runTestCase('Admin CAN WRITE sanitized data to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', {
      month: '2026-03',
      totalMeals: 450,
      mealRate: 62.5
    }, ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Admin CANNOT WRITE private field "phone" to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', {
      month: '2026-03',
      phone: '01700000000'
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden when private field 'phone' is present, got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE private field "advance" to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', {
      month: '2026-03',
      advance: 500
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden when private field 'advance' is present, got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE private field "paymentHistory" to /public_portal/2026-03', async () => {
    const res = await patchDoc('public_portal/2026-03', {
      month: '2026-03',
      paymentHistory: []
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden when private field 'paymentHistory' is present, got ${res.status}`);
  });

  await runTestCase('Admin CANNOT WRITE to invalid month /public_portal/2026-15 (month 15)', async () => {
    const res = await patchDoc('public_portal/2026-15', {
      month: '2026-15',
      totalMeals: 100
    }, ADMIN_UID);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden on invalid month format, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 6. ADMIN HAS FULL ACCESS TO PRIVATE COLLECTIONS
  // -------------------------------------------------------------------------
  console.log('\nGroup 6: Admin Private Collection Read/Write');

  await runTestCase('Admin CAN WRITE to private collection /members/MEM-001', async () => {
    const res = await patchDoc('members/MEM-001', {
      name: 'Ashik',
      room: '101'
    }, ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Admin CAN READ from private collection /members/MEM-001', async () => {
    const res = await getDoc('members/MEM-001', ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Admin CAN WRITE to private collection /deposits/DEP-001', async () => {
    const res = await patchDoc('deposits/DEP-001', {
      memberId: 'MEM-001',
      amount: 2000
    }, ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await runTestCase('Admin CAN READ from private collection /deposits/DEP-001', async () => {
    const res = await getDoc('deposits/DEP-001', ADMIN_UID);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  });

  console.log('\n====================================================');
  console.log(`EMULATOR TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
