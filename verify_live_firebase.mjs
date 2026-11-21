import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA9JX2F-bsOtx7CyQ2mVqLuRvz4ZV09buI",
  authDomain: "dainingmanagementsystem.firebaseapp.com",
  projectId: "dainingmanagementsystem",
  storageBucket: "dainingmanagementsystem.firebasestorage.app",
  messagingSenderId: "684588432592",
  appId: "1:684588432592:web:5e05bec103fe398ede32d5"
};

console.log('========================================================');
console.log('TESTING LIVE PRODUCTION FIRESTORE RULES: dainingmanagementsystem');
console.log('========================================================\n');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

async function run() {
  // Test 1: Public read on public_portal/meta
  await test('Public unauthenticated CAN read /public_portal/meta', async () => {
    const snap = await getDoc(doc(db, 'public_portal', 'meta'));
    console.log(`    -> Document exists: ${snap.exists()}`);
  });

  // Test 2: Public read on valid month public_portal/2026-03
  await test('Public unauthenticated CAN read valid month /public_portal/2026-03', async () => {
    const snap = await getDoc(doc(db, 'public_portal', '2026-03'));
    console.log(`    -> Document exists: ${snap.exists()}`);
  });

  // Test 3: Public read on invalid month public_portal/2026-13 (MUST be denied)
  await test('Public unauthenticated CANNOT read invalid month /public_portal/2026-13', async () => {
    try {
      await getDoc(doc(db, 'public_portal', '2026-13'));
      throw new Error('Expected permission-denied, but read succeeded');
    } catch (err) {
      if (err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions')) {
        // Expected!
        return;
      }
      throw err;
    }
  });

  // Test 4: Public read on private collection /members/MEM-001 (MUST be denied)
  await test('Public unauthenticated CANNOT read private collection /members', async () => {
    try {
      await getDoc(doc(db, 'members', 'MEM-001'));
      throw new Error('Expected permission-denied, but read succeeded');
    } catch (err) {
      if (err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions')) {
        return;
      }
      throw err;
    }
  });

  // Test 5: Public read on private collection /deposits/DEP-001 (MUST be denied)
  await test('Public unauthenticated CANNOT read private collection /deposits', async () => {
    try {
      await getDoc(doc(db, 'deposits', 'DEP-001'));
      throw new Error('Expected permission-denied, but read succeeded');
    } catch (err) {
      if (err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions')) {
        return;
      }
      throw err;
    }
  });

  // Test 6: Public read on private collection /expenses/EXP-001 (MUST be denied)
  await test('Public unauthenticated CANNOT read private collection /expenses', async () => {
    try {
      await getDoc(doc(db, 'expenses', 'EXP-001'));
      throw new Error('Expected permission-denied, but read succeeded');
    } catch (err) {
      if (err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions')) {
        return;
      }
      throw err;
    }
  });

  // Test 7: Public write on public_portal/meta (MUST be denied)
  await test('Public unauthenticated CANNOT write to /public_portal/meta', async () => {
    try {
      await setDoc(doc(db, 'public_portal', 'meta'), { test: true }, { merge: true });
      throw new Error('Expected permission-denied, but write succeeded');
    } catch (err) {
      if (err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions')) {
        return;
      }
      throw err;
    }
  });

  console.log('\n========================================================');
  console.log(`LIVE FIRESTORE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run();
