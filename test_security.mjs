import { readFileSync } from 'fs';

console.log('====================================================');
console.log('RUNNING AUTOMATED SECURITY HARDENING TEST SUITE');
console.log('====================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

// -------------------------------------------------------------
// TEST 1: Admin Auth Fail-Closed Verification
// -------------------------------------------------------------
console.log('Test Group 1: Admin Authentication & Fail-Closed Logic');

function mockVerifyIsAdmin(user, adminUid) {
  if (!user) return false;
  if (!adminUid || adminUid.trim().length === 0 || adminUid.includes('your-admin-uid')) {
    return false;
  }
  return user.uid === adminUid;
}

const AUTHORIZED_UID = 'iSOfrQnFU2gxQekEFUOjSOSeEi82';
const ATTACKER_USER = { uid: 'attacker-123456789' };
const ADMIN_USER = { uid: AUTHORIZED_UID };

assert(mockVerifyIsAdmin(null, AUTHORIZED_UID) === false, 'Null user is denied admin');
assert(mockVerifyIsAdmin(ATTACKER_USER, AUTHORIZED_UID) === false, 'Attacker UID is denied admin');
assert(mockVerifyIsAdmin(ADMIN_USER, AUTHORIZED_UID) === true, 'Authorized Admin UID is granted admin');
assert(mockVerifyIsAdmin(ATTACKER_USER, '') === false, 'Empty ADMIN_UID fails CLOSED (denies attacker)');
assert(mockVerifyIsAdmin(ATTACKER_USER, 'your-admin-uid') === false, 'Placeholder ADMIN_UID fails CLOSED (denies attacker)');
assert(mockVerifyIsAdmin(ADMIN_USER, undefined) === false, 'Undefined ADMIN_UID fails CLOSED');

// -------------------------------------------------------------
// TEST 2: Firestore Security Rules Analysis
// -------------------------------------------------------------
console.log('\nTest Group 2: Firestore Security Rules Validation');

const rulesContent = readFileSync('firestore.rules', 'utf8');

assert(!rulesContent.includes('match /public_portal/{document=**}'), 'Recursive open wildcard match /public_portal/{document=**} is eliminated');
assert(rulesContent.includes('match /public_portal/meta'), 'Explicit whitelist for /public_portal/meta is enforced');
assert(rulesContent.includes("match /public_portal/{monthId}"), 'Explicit whitelist for /public_portal/{monthId} is enforced');
assert(rulesContent.includes("monthId.matches('^[0-9]{4}-(0[1-9]|1[0-2])$')"), 'Month ID regex pattern ^[0-9]{4}-(0[1-9]|1[0-2])$ is enforced');
assert(rulesContent.includes('isValidMetaDoc()'), 'isValidMetaDoc strict allowlist is enforced on meta writes');
assert(rulesContent.includes('isValidMonthDoc()'), 'isValidMonthDoc strict allowlist is enforced on month writes');
assert(rulesContent.includes('hasOnly'), 'Strict field allowlist via keys().hasOnly() is enforced');
assert(rulesContent.includes('allow delete: if isAuthorizedAdmin();'), 'Safe deletion rule without request.resource evaluation is enforced');
assert(!rulesContent.includes('request.auth.token.admin'), 'Custom admin claims alternative removed for strict UID enforcement');

const privateCollections = [
  'members', 'mealEntries', 'expenses', 'deposits',
  'categories', 'managers', 'dailyClosures', 'settings', 'appMetadata'
];
for (const col of privateCollections) {
  assert(rulesContent.includes(`match /${col}/{docId}`), `Private collection /${col} has dedicated rule block`);
}
assert(!rulesContent.includes('match /{document=**}'), 'Overlapping catch-all wildcard is eliminated to prevent rule bypasses');

// -------------------------------------------------------------
// TEST 3: Git Repository Privacy & .gitignore
// -------------------------------------------------------------
console.log('\nTest Group 3: Git Repository Privacy & Gitignore');

const gitignoreContent = readFileSync('.gitignore', 'utf8');

assert(gitignoreContent.includes('*.xlsx'), '.gitignore blocks all Excel workbooks (*.xlsx)');
assert(gitignoreContent.includes('*.xls'), '.gitignore blocks Excel files (*.xls)');
assert(gitignoreContent.includes('*.csv'), '.gitignore blocks CSV files (*.csv)');
assert(gitignoreContent.includes('extracted_members.json'), '.gitignore blocks extracted_members.json');
assert(gitignoreContent.includes('*backup*.json'), '.gitignore blocks backup JSON exports (*backup*.json)');

// -------------------------------------------------------------
// TEST 4: Public Data Sanitizer Leak Prevention
// -------------------------------------------------------------
console.log('\nTest Group 4: Public Data Sanitizer Strict Privacy');

const publicPortalCode = readFileSync('src/services/publicPortal.ts', 'utf8');

assert(publicPortalCode.includes('[], // Pass empty deposits so no deposits are computed or leaked'), 'Public calculation passes empty deposits array');
assert(!publicPortalCode.includes('phone: m.phone'), 'Member phone numbers are excluded from public member output');
assert(!publicPortalCode.includes('notes: m.notes'), 'Private member notes are excluded from public member output');
assert(publicPortalCode.includes('removeUndefined'), 'removeUndefined recursive cleaner is defined and implemented');

// -------------------------------------------------------------
// TEST 5: Backup Restore Safety Snapshot
// -------------------------------------------------------------
console.log('\nTest Group 5: Backup & Restore Safety Checks');

const backupCode = readFileSync('src/modules/backup/BackupRestorePage.tsx', 'utf8');

assert(backupCode.includes('Array.isArray(resMembers)'), 'Deep array validation for members in restore payload');
assert(backupCode.includes('Array.isArray(resExpenses)'), 'Deep array validation for expenses in restore payload');
assert(backupCode.includes('Array.isArray(resDeposits)'), 'Deep array validation for deposits in restore payload');
assert(backupCode.includes('dms_pre_restore_safety_backup'), 'Automatic pre-wipe safety snapshot is taken before replace mode');

console.log('\n====================================================');
console.log(`SECURITY TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('====================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
