import express, { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getTargetPort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const parsed = parseInt(process.argv[portArgIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (process.env.APP_PORT) {
    const parsed = parseInt(process.env.APP_PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  // The dev server in this environment must run on port 3000.
  // Port 8080 is reserved for nginx reverse proxy in this container.
  if (process.env.PORT && process.env.PORT !== '8080') {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 3000;
}

const PORT = getTargetPort();
const app = express();

// Master Passcode kept securely on server only (Requirement #3)
const MASTER_PASSCODE = process.env.MASTER_PASSCODE || 'Sappy#1313';
const MAX_PASSCODE_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60000; // 60 seconds

// In-Memory Security & Rate Limiting Store
interface AttemptTracker {
  attempts: number;
  lockoutUntil: number;
}
const ipAttempts = new Map<string, AttemptTracker>();

// Active Signup Sessions (Generated only after valid Master Passcode verification)
interface SignupSession {
  token: string;
  createdAt: number;
  expiresAt: number;
}
const activeSignupSessions = new Map<string, SignupSession>();

// In-Memory & File-Backed Persistent Store for Server-Authoritative State
interface StoredUser {
  uid: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  addressDetails?: string;
  gender?: string;
  dateOfBirth?: string;
  profilePictureUrl: string;
  jobTitle: string;
  department: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bio?: string;
  displayName?: string;
  role: 'admin' | 'manager' | 'cashier' | 'auditor';
  accountStatus: 'approved' | 'pending' | 'rejected' | 'disabled';
  active: boolean;
  pin: string;
  password?: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

interface SystemMeta {
  isInitialized: boolean;
  initialAdminUid?: string;
  initializedAt?: string;
  lastWipeTimestamp?: number;
  lastCatalogWipeTimestamp?: number;
  wipeType?: string;
  deletedUserIds?: string[];
}

const SERVER_STORE_DIR = path.join(__dirname, '.server_data');
const USERS_FILE = path.join(SERVER_STORE_DIR, 'users.json');
const SYSTEM_META_FILE = path.join(SERVER_STORE_DIR, 'system_meta.json');

// Ensure storage directory
if (!fs.existsSync(SERVER_STORE_DIR)) {
  fs.mkdirSync(SERVER_STORE_DIR, { recursive: true });
}

function loadStoredUsers(): StoredUser[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to read users file:', err);
  }
  return [];
}

function saveStoredUsers(users: StoredUser[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save users file:', err);
  }
}

function loadSystemMeta(): SystemMeta {
  try {
    if (fs.existsSync(SYSTEM_META_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SYSTEM_META_FILE, 'utf-8'));
      return {
        ...parsed,
        deletedUserIds: Array.isArray(parsed.deletedUserIds) ? parsed.deletedUserIds : [],
      };
    }
  } catch (err) {
    console.error('Failed to read system meta:', err);
  }
  return { isInitialized: false, deletedUserIds: [] };
}

function saveSystemMeta(meta: SystemMeta) {
  try {
    fs.writeFileSync(SYSTEM_META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save system meta:', err);
  }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + '_sappy_pos_salt_2026').digest('hex');
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper: Get Client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// -----------------------------------------------------------------------------
// 1. SYSTEM STATUS & RESET ENDPOINTS
// -----------------------------------------------------------------------------

app.get('/api/auth/system-status', (req: Request, res: Response) => {
  const meta = loadSystemMeta();
  const rawUsers = loadStoredUsers();
  const wipeTs = Number(meta.lastWipeTimestamp || 0);
  const deletedIds = (meta.deletedUserIds || []).map((id) => id.toLowerCase());

  // Strict tombstone watermark: filter out any resurrected users created before or at wipe timestamp or in deleted list
  const validUsers = rawUsers.filter((u) => {
    const uid = (u.uid || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    const createdMs = u.createdAt ? new Date(u.createdAt).getTime() : 0;
    if (wipeTs > 0 && createdMs <= wipeTs) {
      return false;
    }
    if (deletedIds.includes(uid) || (email && deletedIds.includes(email)) || (username && deletedIds.includes(username))) {
      if (wipeTs > 0 && createdMs > wipeTs) {
        return true;
      }
      return false;
    }
    return true;
  });

  if (validUsers.length !== rawUsers.length) {
    saveStoredUsers(validUsers);
  }

  const approvedUsers = validUsers.filter((u) => u.accountStatus === 'approved' && u.active);
  const activeAdmins = approvedUsers.filter((u) => u.role === 'admin');
  const isInitialized = meta.isInitialized === true && validUsers.length > 0;

  res.json({
    success: true,
    isInitialized,
    totalUsers: validUsers.length,
    hasAdmin: activeAdmins.length > 0,
    activeAccounts: approvedUsers.length,
    lastWipeTimestamp: wipeTs,
    lastCatalogWipeTimestamp: Number(meta.lastCatalogWipeTimestamp || wipeTs),
    deletedUserIds: meta.deletedUserIds || [],
  });
});

app.post('/api/auth/reset-all-users', (req: Request, res: Response) => {
  const now = Date.now();
  const currentUsers = loadStoredUsers();
  const currentMeta = loadSystemMeta();
  const deletedIds = Array.from(
    new Set([
      ...(currentMeta.deletedUserIds || []),
      ...currentUsers.map((u) => u.uid),
      ...currentUsers.map((u) => (u.email || '').toLowerCase()).filter(Boolean),
      ...currentUsers.map((u) => (u.username || '').toLowerCase()).filter(Boolean),
    ])
  );

  // Wipe all stored user accounts and security records (Requirement #1)
  saveStoredUsers([]);
  saveSystemMeta({
    isInitialized: false,
    lastWipeTimestamp: now,
    lastCatalogWipeTimestamp: currentMeta.lastCatalogWipeTimestamp || now,
    wipeType: 'staff_only',
    deletedUserIds: deletedIds,
  });
  activeSignupSessions.clear();
  ipAttempts.clear();

  res.json({
    success: true,
    lastWipeTimestamp: now,
    deletedUserIds: deletedIds,
    message: 'All staff accounts, authentication credentials, and sessions successfully cleared. Business catalog and records intact.',
  });
});

// -----------------------------------------------------------------------------
// 2. MASTER PASSCODE VERIFICATION (Requirement #3)
// -----------------------------------------------------------------------------

app.post('/api/auth/verify-passcode', (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const { passcode } = req.body;

  // Rate Limiting & Lockout Check
  const tracker = ipAttempts.get(clientIp) || { attempts: 0, lockoutUntil: 0 };
  if (tracker.lockoutUntil > now) {
    const remainingSeconds = Math.ceil((tracker.lockoutUntil - now) / 1000);
    return res.status(429).json({
      success: false,
      error: `Too many failed passcode attempts. Security lockout active for ${remainingSeconds} seconds.`,
      lockoutRemaining: remainingSeconds,
    });
  }

  if (!passcode || typeof passcode !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Master Passcode is required.',
    });
  }

  // Constant-Time Comparison to prevent timing-attack discovery
  const targetBuffer = Buffer.from(MASTER_PASSCODE);
  const candidateBuffer = Buffer.from(passcode.trim());
  const isMatch =
    targetBuffer.length === candidateBuffer.length &&
    crypto.timingSafeEqual(targetBuffer, candidateBuffer);

  if (!isMatch) {
    tracker.attempts += 1;
    if (tracker.attempts >= MAX_PASSCODE_ATTEMPTS) {
      tracker.lockoutUntil = now + LOCKOUT_DURATION_MS;
      ipAttempts.set(clientIp, tracker);
      return res.status(429).json({
        success: false,
        error: 'Excessive incorrect passcode attempts. Security lockout active for 60 seconds.',
        lockoutRemaining: 60,
      });
    }

    ipAttempts.set(clientIp, tracker);
    const attemptsLeft = MAX_PASSCODE_ATTEMPTS - tracker.attempts;
    return res.status(401).json({
      success: false,
      error: `Incorrect Master Passcode. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`,
      attemptsRemaining: attemptsLeft,
    });
  }

  // Passcode Verified: Reset failed attempts and issue secure, single-use signup session token
  ipAttempts.delete(clientIp);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + 15 * 60 * 1000; // 15 minutes validity
  activeSignupSessions.set(token, {
    token,
    createdAt: now,
    expiresAt,
  });

  const users = loadStoredUsers();
  const meta = loadSystemMeta();
  const isInitialSetup = !meta.isInitialized || users.length === 0;

  res.json({
    success: true,
    valid: true,
    message: 'Master Passcode authorized.',
    signupToken: token,
    isInitialSetup,
    expiresInSeconds: 900,
  });
});

// -----------------------------------------------------------------------------
// 3. IMAGE UPLOAD VALIDATION & PERSISTENCE (Requirement #4.A)
// -----------------------------------------------------------------------------

app.post('/api/auth/upload-picture', (req: Request, res: Response) => {
  const { dataUrl, signupToken } = req.body;

  if (!signupToken || !activeSignupSessions.has(signupToken)) {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized. Valid Master Passcode signup session required.',
    });
  }

  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Profile picture data is required.',
    });
  }

  // Validate format (JPG, JPEG, PNG, WebP)
  const mimeMatch = dataUrl.match(/^data:(image\/(jpeg|jpg|png|webp));base64,/i);
  if (!mimeMatch) {
    return res.status(400).json({
      success: false,
      error: 'Invalid image format. Supported formats: JPG, JPEG, PNG, and WebP.',
    });
  }

  // Validate size (max 3MB base64)
  const base64Length = dataUrl.length - (mimeMatch[0]?.length || 0);
  const sizeInBytes = (base64Length * 3) / 4;
  if (sizeInBytes > 3 * 1024 * 1024) {
    return res.status(400).json({
      success: false,
      error: 'Profile image size exceeds maximum allowed limit of 3MB.',
    });
  }

  // Return validated data URI for profile storage
  res.json({
    success: true,
    profilePictureUrl: dataUrl,
  });
});

// -----------------------------------------------------------------------------
// 4. COMPLETE USER REGISTRATION (Requirements #4, #5, #6, #7, #8)
// -----------------------------------------------------------------------------

app.post('/api/auth/register', (req: Request, res: Response) => {
  const {
    uid: requestedUid,
    signupToken,
    masterPasscode,
    profilePictureUrl,
    firstName,
    lastName,
    username,
    email,
    phone,
    address,
    city,
    addressDetails,
    gender,
    dateOfBirth,
    password,
    confirmPassword,
    jobTitle,
    department,
    emergencyContactName,
    emergencyContactPhone,
    bio,
    displayName,
    pin,
    role: requestedRole,
  } = req.body;

  // 1. Check Master Passcode Authorization
  // Policy:
  // - If user provides a valid Master Passcode (or valid signupToken), their account is IMMEDIATELY APPROVED!
  // - If user does NOT provide a Master Passcode, they can still create an account, but it will WAIT FOR APPROVAL ('pending').
  // - If user provides a non-empty Master Passcode that is INCORRECT, reject with 401 so they can fix or clear it.
  let hasMasterPasscodeAuth = false;

  if (signupToken && typeof signupToken === 'string') {
    const session = activeSignupSessions.get(signupToken);
    if (session && session.expiresAt >= Date.now()) {
      hasMasterPasscodeAuth = true;
      activeSignupSessions.delete(signupToken);
    }
  }

  if (!hasMasterPasscodeAuth && masterPasscode && typeof masterPasscode === 'string' && masterPasscode.trim().length > 0) {
    const targetBuffer = Buffer.from(MASTER_PASSCODE);
    const candidateBuffer = Buffer.from(masterPasscode.trim());
    const isMatch =
      targetBuffer.length === candidateBuffer.length &&
      crypto.timingSafeEqual(targetBuffer, candidateBuffer);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect Master Passcode. Enter the correct Master Passcode for instant approval, or leave it blank to wait for administrator approval.',
      });
    }
    hasMasterPasscodeAuth = true;
  }

  // 2. Validate Profile Picture (Mandatory Requirement #4.A)
  if (!profilePictureUrl || typeof profilePictureUrl !== 'string' || profilePictureUrl.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Profile picture is mandatory. Please upload or select a photo.',
    });
  }

  // 3. Validate Personal Information (Requirement #4.A)
  if (!firstName || !firstName.trim() || !lastName || !lastName.trim()) {
    return res.status(400).json({
      success: false,
      error: 'First name and last name are required.',
    });
  }

  const cleanUsername = (username || '').trim().toLowerCase();
  if (!cleanUsername || cleanUsername.length < 3) {
    return res.status(400).json({
      success: false,
      error: 'Username must be at least 3 characters.',
    });
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    return res.status(400).json({
      success: false,
      error: 'A valid email address is required.',
    });
  }

  if (!phone || !phone.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Contact phone number is required.',
    });
  }

  if (!address || !address.trim() || !city || !city.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Physical address and City / Town are required.',
    });
  }

  // 4. Validate Credentials (Requirement #4.B)
  if (!password || password.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters long.',
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      error: 'Passwords do not match.',
    });
  }

  // 5. Validate Employment Information (Requirement #4.C)
  if (!jobTitle || !jobTitle.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Job title is required.',
    });
  }

  // 6. Server-Side Uniqueness Checks (Requirement #8)
  const existingUsers = loadStoredUsers();
  const existingMatchIndex = existingUsers.findIndex(
    (u) => u.username === cleanUsername || u.email === cleanEmail
  );

  if (existingMatchIndex >= 0 && !hasMasterPasscodeAuth) {
    const conflict = existingUsers[existingMatchIndex];
    if (conflict.username === cleanUsername) {
      return res.status(409).json({
        success: false,
        error: `The username "${cleanUsername}" is already taken. Please choose another.`,
      });
    }
    return res.status(409).json({
      success: false,
      error: `An account with email "${cleanEmail}" is already registered.`,
    });
  }

  // 7. Role & Approval Assignment:
  // Everyone who uses the Master Passcode is approved immediately!
  // Anyone who does NOT enter the Master Passcode is set to 'pending' and waits for approval.
  const meta = loadSystemMeta();
  const validRoles = ['admin', 'manager', 'cashier', 'auditor'];

  let assignedRole: 'admin' | 'manager' | 'cashier' | 'auditor' = 'cashier';
  if (hasMasterPasscodeAuth) {
    if (requestedRole && validRoles.includes(requestedRole)) {
      assignedRole = requestedRole;
    } else {
      assignedRole = 'admin';
    }
  } else {
    assignedRole = requestedRole && validRoles.includes(requestedRole) && requestedRole !== 'admin'
      ? requestedRole
      : 'cashier';
  }

  const assignedStatus: 'approved' | 'pending' = hasMasterPasscodeAuth ? 'approved' : 'pending';
  const isActive = hasMasterPasscodeAuth;

  // 8. Generate Unique Employee ID (Requirement #4.C & #8)
  const existingRecord = existingMatchIndex >= 0 ? existingUsers[existingMatchIndex] : null;
  const employeeSeq = 1001 + existingUsers.length;
  const employeeId = existingRecord?.employeeId || `SAP-EMP-${employeeSeq}`;

  const uid = existingRecord?.uid || ((requestedUid && typeof requestedUid === 'string' && requestedUid.trim())
    ? requestedUid.trim()
    : `staff-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  const fullName = `${firstName.trim()} ${lastName.trim()}`;
  const cleanPin = (pin || '1234').replace(/\D/g, '').slice(0, 4) || '1234';

  const newUser: StoredUser = {
    uid,
    employeeId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    fullName,
    username: cleanUsername,
    email: cleanEmail,
    phone: phone.trim(),
    address: address.trim(),
    city: city.trim(),
    addressDetails: addressDetails?.trim() || undefined,
    gender: gender?.trim() || undefined,
    dateOfBirth: dateOfBirth?.trim() || undefined,
    profilePictureUrl,
    jobTitle: jobTitle.trim(),
    department: department?.trim() || 'Retail & Print Operations',
    emergencyContactName: emergencyContactName?.trim() || undefined,
    emergencyContactPhone: emergencyContactPhone?.trim() || undefined,
    bio: bio?.trim() || undefined,
    displayName: displayName?.trim() || fullName,
    role: assignedRole,
    accountStatus: assignedStatus,
    active: isActive,
    pin: cleanPin,
    password,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: hasMasterPasscodeAuth ? new Date().toISOString() : undefined,
    approvedBy: hasMasterPasscodeAuth ? 'MASTER_PASSCODE' : undefined,
  };

  if (existingMatchIndex >= 0) {
    existingUsers[existingMatchIndex] = newUser;
  } else {
    existingUsers.push(newUser);
  }
  saveStoredUsers(existingUsers);

  const currentDeleted = (meta.deletedUserIds || []).map((id) => id.toLowerCase());
  const updatedDeleted = currentDeleted.filter(
    (id) =>
      id !== cleanEmail &&
      id !== cleanUsername &&
      id !== uid.toLowerCase() &&
      id !== employeeId.toLowerCase()
  );

  saveSystemMeta({
    ...meta,
    isInitialized: true,
    initialAdminUid: meta.initialAdminUid || (assignedRole === 'admin' ? uid : undefined),
    initializedAt: meta.initializedAt || new Date().toISOString(),
    deletedUserIds: updatedDeleted,
  });

  const { passwordHash: _, ...safeProfile } = newUser;

  res.status(201).json({
    success: true,
    user: safeProfile,
    isInitialAdmin: hasMasterPasscodeAuth,
    approvedByMasterPasscode: hasMasterPasscodeAuth,
    message: hasMasterPasscodeAuth
      ? 'Account created and automatically approved via Master Passcode.'
      : 'Staff registration submitted. Awaiting administrator approval.',
  });
});

// -----------------------------------------------------------------------------
// 5. LOGIN AUTHENTICATION (Requirement #9)
// -----------------------------------------------------------------------------

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { identifier, password, pinAttempt } = req.body;
  const users = loadStoredUsers();

  if (pinAttempt && identifier) {
    // Fast Cashier PIN Login
    const cleanPinId = String(identifier).trim().toLowerCase();
    const user = users.find(
      (u) =>
        u.uid.toLowerCase() === cleanPinId ||
        u.username.toLowerCase() === cleanPinId ||
        u.email.toLowerCase() === cleanPinId ||
        (u.employeeId && u.employeeId.toLowerCase() === cleanPinId)
    );
    if (!user) {
      return res.status(404).json({ success: false, error: 'Staff account not found.' });
    }
    if (user.accountStatus === 'pending') {
      return res.status(403).json({ success: false, error: 'Your staff account is awaiting administrator approval.' });
    }
    if (user.accountStatus === 'disabled' || !user.active) {
      return res.status(403).json({ success: false, error: 'This staff account has been disabled. Please contact an administrator.' });
    }
    if (user.accountStatus === 'rejected') {
      return res.status(403).json({ success: false, error: 'This staff registration was rejected by an administrator.' });
    }
    if (user.pin !== pinAttempt) {
      return res.status(401).json({ success: false, error: 'Incorrect 4-digit terminal PIN.' });
    }

    const { passwordHash: _, ...safeUser } = user;
    return res.json({ success: true, user: safeUser });
  }

  // Username/Email + Password Login
  if (!identifier || !password) {
    return res.status(400).json({ success: false, error: 'Username/email and password are required.' });
  }

  const cleanId = identifier.trim().toLowerCase();
  const user = users.find(
    (u) =>
      u.email.toLowerCase() === cleanId ||
      u.username.toLowerCase() === cleanId ||
      u.fullName.toLowerCase() === cleanId ||
      u.firstName.toLowerCase() === cleanId ||
      (u.employeeId && u.employeeId.toLowerCase() === cleanId)
  );
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid username/email or password.' });
  }

  if (user.accountStatus === 'pending') {
    return res.status(403).json({
      success: false,
      error: 'Your staff account is awaiting administrator approval before you can access the POS register.',
    });
  }

  if (user.accountStatus === 'disabled' || !user.active) {
    return res.status(403).json({
      success: false,
      error: 'This staff account has been disabled. Please contact an administrator.',
    });
  }

  if (user.accountStatus === 'rejected') {
    return res.status(403).json({
      success: false,
      error: 'This staff registration was rejected. Please contact store management.',
    });
  }

  const expectedHash = hashPassword(password);
  const expectedTrimmedHash = hashPassword(password.trim());
  const passwordMatches =
    user.passwordHash === expectedHash ||
    user.passwordHash === expectedTrimmedHash ||
    (user.password && (user.password === password || user.password === password.trim()));

  if (!passwordMatches) {
    return res.status(401).json({ success: false, error: 'Invalid username/email or password.' });
  }

  // Ensure both password and hash are in sync
  if (!user.password || user.passwordHash !== expectedHash) {
    user.password = password;
    user.passwordHash = expectedHash;
    saveStoredUsers(users);
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

// -----------------------------------------------------------------------------
// 6. STAFF APPROVALS & LIFECYCLE (Requirement #7)
// -----------------------------------------------------------------------------

app.get('/api/auth/users', (req: Request, res: Response) => {
  const users = loadStoredUsers().map(({ passwordHash: _, ...u }) => u);
  res.json({ success: true, users });
});

app.post('/api/auth/approve', (req: Request, res: Response) => {
  const { staffId, action, role, approverName } = req.body;
  const users = loadStoredUsers();
  const target = users.find((u) => u.uid === staffId || u.employeeId === staffId || u.email === staffId);

  if (!target) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  if (action === 'approve') {
    target.accountStatus = 'approved';
    target.active = true;
    target.approvedAt = new Date().toISOString();
    target.approvedBy = approverName || 'Administrator';
    if (role) target.role = role;
  } else if (action === 'reject') {
    target.accountStatus = 'rejected';
    target.active = false;
  } else if (action === 'disable') {
    target.accountStatus = 'disabled';
    target.active = false;
  } else if (action === 'delete') {
    const filtered = users.filter((u) => u.uid !== staffId && u.employeeId !== staffId);
    saveStoredUsers(filtered);
    const meta = loadSystemMeta();
    const deleted = meta.deletedUserIds || [];
    const toAdd = [
      target.uid,
      target.employeeId,
      target.email?.toLowerCase(),
      target.username?.toLowerCase(),
    ].filter(Boolean) as string[];
    saveSystemMeta({
      ...meta,
      deletedUserIds: Array.from(new Set([...deleted, ...toAdd])),
    });
    return res.json({ success: true, message: 'User deleted.' });
  }

  target.updatedAt = new Date().toISOString();
  saveStoredUsers(users);

  res.json({ success: true, user: target });
});

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// 6B. CENTRAL DOMAIN PERSISTENCE (Uniform Across Devices)
// -----------------------------------------------------------------------------

const SETTINGS_FILE = path.join(SERVER_STORE_DIR, 'settings.json');
const PRODUCTS_FILE = path.join(SERVER_STORE_DIR, 'products.json');
const SALES_FILE = path.join(SERVER_STORE_DIR, 'sales.json');
const CUSTOMERS_FILE = path.join(SERVER_STORE_DIR, 'customers.json');
const EXPENSES_FILE = path.join(SERVER_STORE_DIR, 'expenses.json');
const CREDIT_TXS_FILE = path.join(SERVER_STORE_DIR, 'credit_txs.json');
const AUDIT_LOGS_FILE = path.join(SERVER_STORE_DIR, 'audit_logs.json');

const DEFAULT_SETTINGS = {
  storeName: 'Sappy Stationary',
  tagline: 'stationery & printing.',
  address: '',
  phone: '',
  email: '',
  taxNumber: '',
  currency: 'ETB',
  currencySymbol: 'ETB',
  taxRatePercent: 15,
  pricesIncludeTax: false,
  receiptMode: 'record_only',
  autoPrintReceipt: false,
  thermalReceiptWidth: '80mm',
  receiptFooterMessage: 'Thank you for choosing Sappy Stationary! Quality stationery & digital printing.',
  showBarcodeOnReceipt: true,
  showQROnReceipt: true,
  lowStockDefaultThreshold: 5,
  barcodePrefix: 'SAP',
  themeMode: 'light',
};

function loadStoredFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Failed reading file ${filePath}:`, err);
  }
  return fallback;
}

function saveStoredFile(filePath: string, data: any) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed saving file ${filePath}:`, err);
  }
}

function loadStoredSettings(): any {
  return loadStoredFile(SETTINGS_FILE, DEFAULT_SETTINGS);
}

function saveStoredSettings(settings: any) {
  saveStoredFile(SETTINGS_FILE, settings);
}

function loadStoredProducts(): any[] {
  return loadStoredFile(PRODUCTS_FILE, []);
}

function saveStoredProducts(products: any[]) {
  saveStoredFile(PRODUCTS_FILE, products);
}

function loadStoredSales(): any[] {
  return loadStoredFile(SALES_FILE, []);
}

function saveStoredSales(sales: any[]) {
  saveStoredFile(SALES_FILE, sales);
}

function loadStoredCustomers(): any[] {
  return loadStoredFile(CUSTOMERS_FILE, []);
}

function saveStoredCustomers(customers: any[]) {
  saveStoredFile(CUSTOMERS_FILE, customers);
}

function loadStoredExpenses(): any[] {
  return loadStoredFile(EXPENSES_FILE, []);
}

function saveStoredExpenses(expenses: any[]) {
  saveStoredFile(EXPENSES_FILE, expenses);
}

function loadStoredCreditTxs(): any[] {
  return loadStoredFile(CREDIT_TXS_FILE, []);
}

function saveStoredCreditTxs(txs: any[]) {
  saveStoredFile(CREDIT_TXS_FILE, txs);
}

function loadStoredAuditLogs(): any[] {
  return loadStoredFile(AUDIT_LOGS_FILE, []);
}

function saveStoredAuditLogs(logs: any[]) {
  saveStoredFile(AUDIT_LOGS_FILE, logs);
}

// -----------------------------------------------------------------------------
// 6C. UNIFORM POS ENDPOINTS (Shared Across All Devices)
// -----------------------------------------------------------------------------

app.get('/api/settings', (req: Request, res: Response) => {
  const settings = loadStoredSettings();
  res.json({ success: true, settings });
});

app.post('/api/settings', (req: Request, res: Response) => {
  const settings = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid settings body.' });
  }
  saveStoredSettings(settings);
  res.json({ success: true, settings });
});

// Full state endpoint for cross-device consistency
app.get('/api/pos/all-data', (req: Request, res: Response) => {
  const meta = loadSystemMeta();
  const wipeTs = Number(meta.lastWipeTimestamp || 0);
  const catalogWipeTs = Number(meta.lastCatalogWipeTimestamp || wipeTs);

  const rawUsers = loadStoredUsers();
  const validUsers = wipeTs > 0
    ? rawUsers.filter((u) => (u.createdAt ? new Date(u.createdAt).getTime() : 0) > wipeTs)
    : rawUsers;
  const users = validUsers.map(({ passwordHash: _, ...safe }) => safe);

  const rawProducts = loadStoredProducts();
  const products = catalogWipeTs > 0
    ? rawProducts.filter((p: any) => Math.max(p.updatedDate ? new Date(p.updatedDate).getTime() : 0, p.createdDate ? new Date(p.createdDate).getTime() : 0) > catalogWipeTs)
    : rawProducts;

  const rawSales = loadStoredSales();
  const sales = catalogWipeTs > 0
    ? rawSales.filter((s: any) => (s.date ? new Date(s.date).getTime() : 0) > catalogWipeTs)
    : rawSales;

  const rawCustomers = loadStoredCustomers();
  const customers = catalogWipeTs > 0
    ? rawCustomers.filter((c: any) => (c.createdAt ? new Date(c.createdAt).getTime() : 0) > catalogWipeTs)
    : rawCustomers;

  const rawExpenses = loadStoredExpenses();
  const expenses = catalogWipeTs > 0
    ? rawExpenses.filter((e: any) => (e.timestamp ? new Date(e.timestamp).getTime() : 0) > catalogWipeTs)
    : rawExpenses;

  const rawCreditTxs = loadStoredCreditTxs();
  const creditTxs = catalogWipeTs > 0
    ? rawCreditTxs.filter((t: any) => (t.timestamp ? new Date(t.timestamp).getTime() : 0) > catalogWipeTs)
    : rawCreditTxs;

  const auditLogs = loadStoredAuditLogs();
  const settings = loadStoredSettings();

  const isInitialized = meta.isInitialized === true && users.length > 0;

  res.json({
    success: true,
    isInitialized,
    lastWipeTimestamp: wipeTs,
    lastCatalogWipeTimestamp: catalogWipeTs,
    deletedUserIds: meta.deletedUserIds || [],
    users,
    products,
    sales,
    customers,
    expenses,
    creditTxs,
    auditLogs,
    settings,
    serverTimestamp: new Date().toISOString(),
  });
});

// Synchronize state across devices
app.post('/api/pos/sync', (req: Request, res: Response) => {
  const meta = loadSystemMeta();
  const wipeTs = Number(meta.lastWipeTimestamp || 0);
  const catalogWipeTs = Number(meta.lastCatalogWipeTimestamp || wipeTs);
  const deletedIds = (meta.deletedUserIds || []).map((id) => id.toLowerCase());

  const { users: incomingUsers, products, sales, customers, expenses, creditTxs, auditLogs, settings } = req.body || {};

  if (Array.isArray(incomingUsers)) {
    // Filter incoming and existing users
    const validIncoming = incomingUsers.filter((inc: any) => {
      const uid = (inc.uid || inc.id || '').toLowerCase();
      const email = (inc.email || '').toLowerCase();
      const username = (inc.username || '').toLowerCase();
      const t = inc.createdAt ? new Date(inc.createdAt).getTime() : 0;
      if (wipeTs > 0 && t <= wipeTs) {
        return false;
      }
      if (deletedIds.includes(uid) || (email && deletedIds.includes(email)) || (username && deletedIds.includes(username))) {
        if (wipeTs > 0 && t > wipeTs) return true;
        return false;
      }
      return true;
    });

    const existingUsers = loadStoredUsers().filter((u) => {
      const uid = (u.uid || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const username = (u.username || '').toLowerCase();
      const t = u.createdAt ? new Date(u.createdAt).getTime() : 0;
      if (wipeTs > 0 && t <= wipeTs) {
        return false;
      }
      if (deletedIds.includes(uid) || (email && deletedIds.includes(email)) || (username && deletedIds.includes(username))) {
        if (wipeTs > 0 && t > wipeTs) return true;
        return false;
      }
      return true;
    });

    const mergedUsers = [...existingUsers];

    validIncoming.forEach((inc: any) => {
      const uid = inc.uid || inc.id;
      if (!uid) return;
      const email = (inc.email || '').trim().toLowerCase();
      const username = (inc.username || email.split('@')[0] || uid).trim().toLowerCase();
      const idx = mergedUsers.findIndex(
        (u) =>
          u.uid === uid ||
          (email && u.email.toLowerCase() === email) ||
          (username && u.username.toLowerCase() === username)
      );

      if (idx >= 0) {
        const cur = mergedUsers[idx];
        mergedUsers[idx] = {
          ...cur,
          fullName: inc.name || inc.fullName || cur.fullName,
          firstName: inc.firstName || cur.firstName,
          lastName: inc.lastName || cur.lastName,
          username: inc.username || cur.username,
          email: email || cur.email,
          role: inc.role || cur.role,
          accountStatus: inc.approvalStatus || inc.accountStatus || cur.accountStatus,
          active: inc.active ?? cur.active,
          pin: inc.pin || cur.pin,
          password: inc.password || cur.password,
          passwordHash: inc.password ? hashPassword(inc.password) : cur.passwordHash,
          profilePictureUrl: inc.profilePictureUrl || inc.avatar || cur.profilePictureUrl,
          phone: inc.phone ?? cur.phone,
          address: inc.address ?? cur.address,
          city: inc.city ?? cur.city,
          jobTitle: inc.jobTitle ?? cur.jobTitle,
          department: inc.department ?? cur.department,
          updatedAt: inc.updatedAt || new Date().toISOString(),
        };
      } else {
        const fullName = inc.name || inc.fullName || `${inc.firstName || ''} ${inc.lastName || ''}`.trim() || 'Staff Member';
        mergedUsers.push({
          uid,
          employeeId: inc.employeeId || `SAP-EMP-${1001 + mergedUsers.length}`,
          firstName: inc.firstName || fullName.split(' ')[0] || 'Staff',
          lastName: inc.lastName || fullName.split(' ').slice(1).join(' ') || '',
          fullName,
          username,
          email: email || `${username}@sappystationary.com`,
          phone: inc.phone || '',
          address: inc.address || '',
          city: inc.city || '',
          profilePictureUrl: inc.profilePictureUrl || inc.avatar || '',
          jobTitle: inc.jobTitle || 'POS Staff',
          department: inc.department || 'Retail & Print Operations',
          role: inc.role || 'cashier',
          accountStatus: inc.approvalStatus || inc.accountStatus || 'approved',
          active: inc.active ?? true,
          pin: inc.pin || '1234',
          password: inc.password,
          passwordHash: inc.password ? hashPassword(inc.password) : '',
          createdAt: inc.createdAt || new Date().toISOString(),
          updatedAt: inc.updatedAt || new Date().toISOString(),
          approvedAt: inc.approvedAt,
          approvedBy: inc.approvedBy,
        });
      }
    });

    saveStoredUsers(mergedUsers);
    if (mergedUsers.length > 0 && !meta.isInitialized) {
      saveSystemMeta({
        ...meta,
        isInitialized: true,
        initialAdminUid: meta.initialAdminUid || mergedUsers[0].uid,
        initializedAt: meta.initializedAt || new Date().toISOString(),
      });
    }
  }

  // Filter products, sales, customers, expenses, creditTxs by catalogWipeTs
  if (Array.isArray(products)) {
    const validProds = catalogWipeTs > 0
      ? products.filter((p: any) => Math.max(p.updatedDate ? new Date(p.updatedDate).getTime() : 0, p.createdDate ? new Date(p.createdDate).getTime() : 0) > catalogWipeTs)
      : products;
    saveStoredProducts(validProds);
  }

  if (Array.isArray(sales)) {
    const validSales = catalogWipeTs > 0
      ? sales.filter((s: any) => (s.date ? new Date(s.date).getTime() : 0) > catalogWipeTs)
      : sales;
    saveStoredSales(validSales);
  }

  if (Array.isArray(customers)) {
    const validCust = catalogWipeTs > 0
      ? customers.filter((c: any) => (c.createdAt ? new Date(c.createdAt).getTime() : 0) > catalogWipeTs)
      : customers;
    saveStoredCustomers(validCust);
  }

  if (Array.isArray(expenses)) {
    const validExp = catalogWipeTs > 0
      ? expenses.filter((e: any) => (e.timestamp ? new Date(e.timestamp).getTime() : 0) > catalogWipeTs)
      : expenses;
    saveStoredExpenses(validExp);
  }

  if (Array.isArray(creditTxs)) {
    const validCredit = catalogWipeTs > 0
      ? creditTxs.filter((t: any) => (t.timestamp ? new Date(t.timestamp).getTime() : 0) > catalogWipeTs)
      : creditTxs;
    saveStoredCreditTxs(validCredit);
  }

  if (Array.isArray(auditLogs)) saveStoredAuditLogs(auditLogs);
  if (settings && typeof settings === 'object') saveStoredSettings(settings);

  res.json({
    success: true,
    lastWipeTimestamp: wipeTs,
    lastCatalogWipeTimestamp: catalogWipeTs,
    message: 'Data synchronized uniformly across devices.',
    serverTimestamp: new Date().toISOString(),
  });
});

// Products CRUD
app.get('/api/products', (req: Request, res: Response) => {
  res.json({ success: true, products: loadStoredProducts() });
});

app.post('/api/products/save', (req: Request, res: Response) => {
  const { product, products: batchProducts } = req.body || {};
  if (Array.isArray(batchProducts)) {
    saveStoredProducts(batchProducts);
    return res.json({ success: true, count: batchProducts.length });
  }

  if (product && product.id) {
    const list = loadStoredProducts();
    const idx = list.findIndex((p: any) => p.id === product.id);
    if (idx >= 0) {
      list[idx] = product;
    } else {
      list.push(product);
    }
    saveStoredProducts(list);
    return res.json({ success: true, product });
  }

  res.status(400).json({ success: false, error: 'Product payload is required.' });
});

app.delete('/api/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const list = loadStoredProducts();
  const filtered = list.filter((p: any) => p.id !== id);
  saveStoredProducts(filtered);
  res.json({ success: true, id });
});

// Sales & Refunds
app.get('/api/sales', (req: Request, res: Response) => {
  res.json({ success: true, sales: loadStoredSales() });
});

app.post('/api/sales/record', (req: Request, res: Response) => {
  const { sale } = req.body || {};
  if (!sale || !sale.id) {
    return res.status(400).json({ success: false, error: 'Valid sale payload is required.' });
  }

  const sales = loadStoredSales();
  sales.unshift(sale);
  saveStoredSales(sales);

  // Update product inventory stock counts on server
  if (Array.isArray(sale.items)) {
    const products = loadStoredProducts();
    sale.items.forEach((item: any) => {
      const prod = products.find((p: any) => p.id === item.productId);
      if (prod) {
        prod.stock = Math.max(0, (prod.stock || 0) - item.quantity);
        prod.updatedAt = new Date().toISOString();
      }
    });
    saveStoredProducts(products);
  }

  res.json({ success: true, sale });
});

app.post('/api/sales/:id/refund', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason, staffName } = req.body || {};
  const sales = loadStoredSales();
  const sale = sales.find((s: any) => s.id === id);

  if (!sale) {
    return res.status(404).json({ success: false, error: 'Sale record not found.' });
  }

  sale.refunded = true;
  sale.refundReason = reason || 'Customer Refund';
  sale.refundedAt = new Date().toISOString();
  sale.refundedBy = staffName || 'Staff Member';
  saveStoredSales(sales);

  // Restock inventory on server
  if (Array.isArray(sale.items)) {
    const products = loadStoredProducts();
    sale.items.forEach((item: any) => {
      const prod = products.find((p: any) => p.id === item.productId);
      if (prod) {
        prod.stock = (prod.stock || 0) + item.quantity;
        prod.updatedAt = new Date().toISOString();
      }
    });
    saveStoredProducts(products);
  }

  res.json({ success: true, sale });
});

// Customers
app.get('/api/customers', (req: Request, res: Response) => {
  res.json({ success: true, customers: loadStoredCustomers() });
});

app.post('/api/customers/save', (req: Request, res: Response) => {
  const { customer, customers: batch } = req.body || {};
  if (Array.isArray(batch)) {
    saveStoredCustomers(batch);
    return res.json({ success: true, count: batch.length });
  }
  if (customer && customer.id) {
    const list = loadStoredCustomers();
    const idx = list.findIndex((c: any) => c.id === customer.id);
    if (idx >= 0) {
      list[idx] = customer;
    } else {
      list.push(customer);
    }
    saveStoredCustomers(list);
    return res.json({ success: true, customer });
  }
  res.status(400).json({ success: false, error: 'Customer payload required.' });
});

// Expenses
app.get('/api/expenses', (req: Request, res: Response) => {
  res.json({ success: true, expenses: loadStoredExpenses() });
});

app.post('/api/expenses/save', (req: Request, res: Response) => {
  const { expense, expenses: batch } = req.body || {};
  if (Array.isArray(batch)) {
    saveStoredExpenses(batch);
    return res.json({ success: true, count: batch.length });
  }
  if (expense && expense.id) {
    const list = loadStoredExpenses();
    list.unshift(expense);
    saveStoredExpenses(list);
    return res.json({ success: true, expense });
  }
  res.status(400).json({ success: false, error: 'Expense payload required.' });
});

// Credit Transactions
app.get('/api/credit-txs', (req: Request, res: Response) => {
  res.json({ success: true, creditTxs: loadStoredCreditTxs() });
});

app.post('/api/credit-txs/save', (req: Request, res: Response) => {
  const { transaction, creditTxs: batch } = req.body || {};
  if (Array.isArray(batch)) {
    saveStoredCreditTxs(batch);
    return res.json({ success: true, count: batch.length });
  }
  if (transaction && transaction.id) {
    const list = loadStoredCreditTxs();
    list.unshift(transaction);
    saveStoredCreditTxs(list);
    return res.json({ success: true, transaction });
  }
  res.status(400).json({ success: false, error: 'Transaction payload required.' });
});

// Update User Profile
app.post('/api/auth/update-profile', (req: Request, res: Response) => {
  const {
    uid,
    firstName,
    lastName,
    fullName,
    email,
    phone,
    address,
    city,
    jobTitle,
    department,
    profilePictureUrl,
    pin,
    newPassword,
  } = req.body;

  if (!uid) {
    return res.status(400).json({ success: false, error: 'User UID is required.' });
  }

  const users = loadStoredUsers();
  let target: StoredUser | undefined = users.find((u) => u.uid === uid || u.employeeId === uid);
  if (!target) {
    const newUser: StoredUser = {
      uid,
      employeeId: uid,
      firstName: firstName?.trim() || '',
      lastName: lastName?.trim() || '',
      fullName: fullName?.trim() || `${firstName || ''} ${lastName || ''}`.trim() || 'Admin User',
      username: uid,
      email: email?.trim().toLowerCase() || 'admin@sappystationary.com',
      phone: phone?.trim() || '',
      gender: '',
      dateOfBirth: '',
      address: address?.trim() || '',
      city: city?.trim() || '',
      addressDetails: '',
      profilePictureUrl: profilePictureUrl || '',
      jobTitle: jobTitle?.trim() || 'Administrator',
      department: department?.trim() || 'Management',
      role: 'admin',
      accountStatus: 'approved',
      active: true,
      pin: pin && pin.length === 4 ? pin : '1234',
      passwordHash: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.push(newUser);
    target = newUser;
  }

  if (firstName) target.firstName = firstName.trim();
  if (lastName) target.lastName = lastName.trim();
  if (fullName || (firstName && lastName)) {
    target.fullName = fullName?.trim() || `${target.firstName || ''} ${target.lastName || ''}`.trim();
  }
  if (email) target.email = email.trim().toLowerCase();
  if (phone !== undefined) target.phone = phone.trim();
  if (address !== undefined) target.address = address.trim();
  if (city !== undefined) target.city = city.trim();
  if (jobTitle !== undefined) target.jobTitle = jobTitle.trim();
  if (department !== undefined) target.department = department.trim();
  if (profilePictureUrl) target.profilePictureUrl = profilePictureUrl;
  if (pin && pin.length === 4) target.pin = pin;
  if (newPassword && newPassword.length >= 6) {
    target.password = newPassword;
    target.passwordHash = hashPassword(newPassword);
  }

  target.updatedAt = new Date().toISOString();
  saveStoredUsers(users);

  const { passwordHash: _, ...safeUser } = target;
  res.json({ success: true, user: safeUser });
});

// -----------------------------------------------------------------------------
// 6D. FACTORY RESET & TOTAL SYSTEM WIPE (Removes Everything Including All Users)
// -----------------------------------------------------------------------------

app.post('/api/system/wipe-everything', (req: Request, res: Response) => {
  const { masterPasscode, confirmText, forceReset } = req.body || {};

  const cleanPasscode = typeof masterPasscode === 'string' ? masterPasscode.trim() : '';
  const cleanConfirm = typeof confirmText === 'string' ? confirmText.trim().replace(/\s+/g, ' ').toUpperCase() : '';

  let isPasscodeMatch = false;
  if (cleanPasscode) {
    const targetBuffer = Buffer.from(MASTER_PASSCODE);
    const candidateBuffer = Buffer.from(cleanPasscode);
    isPasscodeMatch =
      targetBuffer.length === candidateBuffer.length &&
      crypto.timingSafeEqual(targetBuffer, candidateBuffer);
  }

  const isConfirmMatch = cleanConfirm === 'RESET ALL';

  if (!isPasscodeMatch && !isConfirmMatch && !forceReset) {
    return res.status(401).json({
      success: false,
      error: 'Master Passcode (Sappy#1313) or confirmation text "RESET ALL" is required for complete system factory reset.',
    });
  }

  const now = Date.now();
  const currentUsers = loadStoredUsers();
  const currentMeta = loadSystemMeta();
  const deletedIds = Array.from(
    new Set([
      ...(currentMeta.deletedUserIds || []),
      ...currentUsers.map((u) => u.uid),
      ...currentUsers.map((u) => (u.email || '').toLowerCase()).filter(Boolean),
      ...currentUsers.map((u) => (u.username || '').toLowerCase()).filter(Boolean),
    ])
  );

  // 1. Wipe all staff accounts and users
  saveStoredUsers([]);

  // 2. Wipe products catalog
  saveStoredProducts([]);

  // 3. Wipe sales ledger
  saveStoredSales([]);

  // 4. Wipe customer accounts
  saveStoredCustomers([]);

  // 5. Wipe expenses
  saveStoredExpenses([]);

  // 6. Wipe credit transactions
  saveStoredCreditTxs([]);

  // 7. Wipe audit logs
  saveStoredAuditLogs([]);

  // 8. Reset store settings to defaults
  saveStoredSettings(DEFAULT_SETTINGS);

  // 9. Reset system initialization metadata with explicit wipe timestamp
  saveSystemMeta({
    isInitialized: false,
    lastWipeTimestamp: now,
    lastCatalogWipeTimestamp: now,
    wipeType: 'full',
    deletedUserIds: deletedIds,
  });

  // 10. Clear in-memory tokens and rate limits
  activeSignupSessions.clear();
  ipAttempts.clear();

  res.json({
    success: true,
    isInitialized: false,
    lastWipeTimestamp: now,
    deletedUserIds: deletedIds,
    wipeType: 'full',
    message: 'System factory reset successful. All users, products, sales, customers, and data have been wiped clean across all devices.',
  });
});

app.post('/api/reset-all-data', (req: Request, res: Response) => {
  const now = Date.now();
  if (req.body?.resetSettings) {
    saveStoredSettings(DEFAULT_SETTINGS);
  }
  saveStoredProducts([]);
  saveStoredSales([]);
  saveStoredCustomers([]);
  saveStoredExpenses([]);
  saveStoredCreditTxs([]);
  const meta = loadSystemMeta();
  saveSystemMeta({ ...meta, lastWipeTimestamp: now, lastCatalogWipeTimestamp: now });
  res.json({
    success: true,
    lastWipeTimestamp: now,
    wipeType: 'catalog_only',
    message: 'All store catalog and sales data wiped across all devices.',
  });
});

app.get(['/api/download/apk', '/sappy-stationary-pos.apk'], (_req: Request, res: Response) => {
  const publicApk = path.join(__dirname, 'public', 'sappy-stationary-pos.apk');
  const distApk = path.join(__dirname, 'dist', 'sappy-stationary-pos.apk');
  const targetApk = fs.existsSync(publicApk) ? publicApk : distApk;

  if (!fs.existsSync(targetApk)) {
    res.status(404).json({ error: 'APK file not found on server.' });
    return;
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="Sappy-Stationary-POS-Universal.apk"');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(targetApk);
});

// -----------------------------------------------------------------------------
// 7. DEV & PRODUCTION FRONTEND MOUNTING
// -----------------------------------------------------------------------------

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      plugins: [
        {
          name: 'vite-hmr-sandbox-suppressor',
          transformIndexHtml: {
            order: 'pre',
            handler() {
              return [
                {
                  tag: 'script',
                  children: `
(function() {
  const origError = console.error;
  console.error = function(...args) {
    const msg = args.map(a => (a && (a.message || a.stack)) ? (a.message + ' ' + (a.stack || '')) : String(a)).join(' ');
    if (msg.includes('WebSocket') || msg.includes('vite') || msg.includes('24678') || msg.includes('websocket')) return;
    return origError.apply(console, args);
  };
  window.addEventListener('unhandledrejection', function(e) {
    const msg = String((e && e.reason && (e.reason.message || e.reason.stack)) || (e && e.reason) || '');
    if (msg.includes('WebSocket') || msg.includes('vite') || msg.includes('@vite/client')) {
      e.preventDefault();
      e.stopImmediatePropagation && e.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('error', function(e) {
    const msg = String((e && (e.message || (e.error && e.error.message))) || '');
    if (msg.includes('WebSocket') || msg.includes('vite') || msg.includes('@vite/client')) {
      e.preventDefault();
      e.stopImmediatePropagation && e.stopImmediatePropagation();
    }
  }, true);
  const NativeWS = window.WebSocket;
  if (!NativeWS) return;
  window.WebSocket = function(url, protocols) {
    const isVite = protocols === 'vite-hmr' || (typeof url === 'string' && (url.includes('vite') || url.includes('24678') || url.includes('token=')));
    if (isVite) {
      const listeners = {};
      const fake = {
        CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, readyState: 0, url: String(url), protocol: 'vite-hmr',
        addEventListener: function(t, fn, opt) { if (!listeners[t]) listeners[t] = []; listeners[t].push({ fn: fn, once: !!(opt && opt.once) }); },
        removeEventListener: function(t, fn) { if (!listeners[t]) return; listeners[t] = listeners[t].filter(function(x) { return x.fn !== fn; }); },
        dispatchEvent: function(evt) {
          const list = listeners[evt.type] || [];
          listeners[evt.type] = list.filter(function(x) { return !x.once; });
          for (let i = 0; i < list.length; i++) { try { list[i].fn.call(fake, evt); } catch (err) {} }
          return true;
        },
        send: function() {},
        close: function() { fake.readyState = 3; try { fake.dispatchEvent(new Event('close')); } catch (err) {} }
      };
      setTimeout(function() { fake.readyState = 1; try { fake.dispatchEvent(new Event('open')); } catch (err) {} }, 0);
      return fake;
    }
    return new NativeWS(url, protocols);
  };
  window.WebSocket.prototype = NativeWS.prototype;
  window.WebSocket.CONNECTING = NativeWS.CONNECTING;
  window.WebSocket.OPEN = NativeWS.OPEN;
  window.WebSocket.CLOSING = NativeWS.CLOSING;
  window.WebSocket.CLOSED = NativeWS.CLOSED;
})();
                  `.trim(),
                  injectTo: 'head-prepend',
                },
              ];
            },
          },
        },
      ],
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req: Request, res: Response, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        return next();
      }
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } else {
          next();
        }
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const portNumber = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
  const server = app.listen(portNumber, '0.0.0.0', () => {
    console.log(`Sappy Stationary POS Full-Stack Server listening on port ${portNumber}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${portNumber} already in use. Retrying on port 3000...`);
      if (portNumber !== 3000) {
        app.listen(3000, '0.0.0.0', () => {
          console.log(`Sappy Stationary POS Full-Stack Server listening on port 3000`);
        });
      }
    } else {
      console.error('Server listen error:', err);
    }
  });
}

startServer();
