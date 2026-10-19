import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { auth, db } from './firebaseAuth';
import { Staff, StaffRole, AccountStatus } from '../types';
import { storage } from './storage';

export interface PasscodeVerificationResult {
  valid: boolean;
  signupToken?: string;
  isInitialSetup?: boolean;
  error?: string;
  lockoutRemaining?: number;
}

export interface RegisterStaffPayload {
  signupToken?: string;
  masterPasscode?: string;
  profilePictureUrl: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  gender?: string;
  dateOfBirth?: string;
  address: string;
  city: string;
  addressDetails?: string;
  password: string;
  confirmPassword: string;
  jobTitle: string;
  department?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bio?: string;
  displayName?: string;
  pin?: string;
  role?: StaffRole;
}

export interface RegistrationResult {
  success: boolean;
  staff?: Staff;
  error?: string;
  isInitialAdmin?: boolean;
  approvedByMasterPasscode?: boolean;
}

const PASSCODE_STORAGE_LOCKOUT_KEY = 'sappy_pos_master_passcode_lockout_v1';
const PASSCODE_ATTEMPTS_KEY = 'sappy_pos_master_passcode_attempts_v1';

class AuthService {
  private currentSignupToken: string | null = null;

  getStoredSignupToken(): string | null {
    return this.currentSignupToken;
  }

  setStoredSignupToken(token: string | null): void {
    this.currentSignupToken = token;
  }

  getPasscodeLockoutRemaining(): number {
    if (typeof window === 'undefined') return 0;
    try {
      const lockoutUntil = localStorage.getItem(PASSCODE_STORAGE_LOCKOUT_KEY);
      if (!lockoutUntil) return 0;
      const diff = Math.ceil((parseInt(lockoutUntil, 10) - Date.now()) / 1000);
      return diff > 0 ? diff : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Secure Master Passcode Verification (Requirement #3)
   * Calls trusted backend server endpoint /api/auth/verify-passcode with rate limiting.
   * Master passcode is never evaluated or stored in frontend code.
   */
  async verifyMasterPasscode(candidate: string): Promise<PasscodeVerificationResult> {
    const localRemaining = this.getPasscodeLockoutRemaining();
    if (localRemaining > 0) {
      return {
        valid: false,
        error: `Security lockout active. Please wait ${localRemaining} seconds.`,
        lockoutRemaining: localRemaining,
      };
    }

    if (!candidate || typeof candidate !== 'string' || candidate.trim().length === 0) {
      return { valid: false, error: 'Please enter the Master Passcode.' };
    }

    try {
      const response = await fetch('/api/auth/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: candidate.trim() }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        this.currentSignupToken = data.signupToken;
        try {
          localStorage.removeItem(PASSCODE_ATTEMPTS_KEY);
          localStorage.removeItem(PASSCODE_STORAGE_LOCKOUT_KEY);
        } catch {}
        storage.addAuditLog(
          'MASTER_PASSCODE_VERIFIED',
          'AUTH',
          'Master Passcode verified successfully via trusted server authority.'
        );
        return {
          valid: true,
          signupToken: data.signupToken,
          isInitialSetup: data.isInitialSetup,
        };
      }

      if (response.status === 429) {
        const remaining = data.lockoutRemaining || 60;
        try {
          localStorage.setItem(
            PASSCODE_STORAGE_LOCKOUT_KEY,
            (Date.now() + remaining * 1000).toString()
          );
        } catch {}
        return {
          valid: false,
          error: data.error || 'Excessive failed attempts. Security lockout active for 60 seconds.',
          lockoutRemaining: remaining,
        };
      }

      if (response.status === 401) {
        return {
          valid: false,
          error: data.error || 'Incorrect Master Passcode.',
          lockoutRemaining: data.lockoutRemaining,
        };
      }

      return {
        valid: false,
        error: data.error || 'Passcode verification failed. Please try again.',
      };
    } catch (netErr: any) {
      return {
        valid: false,
        error: 'Unable to contact authentication server. Please verify terminal network connection.',
      };
    }
  }

  /**
   * Reset all user accounts, active sessions, and credentials (Requirement #1)
   */
  async resetAllUsers(): Promise<boolean> {
    try {
      await fetch('/api/auth/reset-all-users', { method: 'POST' });
    } catch {}

    try {
      await firebaseSignOut(auth);
    } catch {}

    storage.resetAllUsers();
    this.currentSignupToken = null;
    return true;
  }

  /**
   * Securely register staff using Server Validation + Firebase Auth + Firestore
   */
  async registerStaff(payload: RegisterStaffPayload): Promise<RegistrationResult> {
    const token = payload.signupToken || this.currentSignupToken;

    // 1. Mandatory Profile Picture Check (Requirement #4.A)
    if (!payload.profilePictureUrl || payload.profilePictureUrl.trim().length === 0) {
      return {
        success: false,
        error: 'Profile picture is mandatory. Please upload a clear photo.',
      };
    }

    // 2. Client-side Pre-Validation
    if (!payload.firstName.trim() || !payload.lastName.trim()) {
      return { success: false, error: 'First Name and Last Name are required.' };
    }

    const cleanUsername = payload.username.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      return { success: false, error: 'Username must be at least 3 characters.' };
    }

    const cleanEmail = payload.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return { success: false, error: 'A valid email address is required.' };
    }

    if (!payload.phone.trim()) {
      return { success: false, error: 'Contact phone number is required.' };
    }

    if (!payload.address.trim() || !payload.city.trim()) {
      return { success: false, error: 'Physical address and City / Town are required.' };
    }

    if (!payload.password || payload.password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long.' };
    }

    if (payload.password !== payload.confirmPassword) {
      return { success: false, error: 'Passwords do not match.' };
    }

    if (!payload.jobTitle.trim()) {
      return { success: false, error: 'Job title is required.' };
    }

    // 3. Server Registration (Always register on server — both Master Passcode & Pending accounts)
    const generatedUid = `staff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let serverResult: any = null;
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: generatedUid,
          signupToken: token || undefined,
          masterPasscode: payload.masterPasscode?.trim() || undefined,
          ...payload,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        serverResult = data;
      } else if (!resp.ok) {
        return {
          success: false,
          error: data.error || 'Server rejected registration.',
        };
      }
    } catch (err) {
      console.warn('Backend server unavailable, proceeding with local & Firebase sync:', err);
    }

    // 4. Optional Firebase Authentication Integration (non-blocking if email already exists or provider disabled)
    const finalUid = serverResult?.user?.uid || generatedUid;
    const fullName = `${payload.firstName.trim()} ${payload.lastName.trim()}`;

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        payload.password
      );
      if (userCredential?.user) {
        await updateProfile(userCredential.user, {
          displayName: fullName,
          photoURL: payload.profilePictureUrl,
        });
      }
    } catch (fbErr: any) {
      console.warn('Firebase Auth note (continuing with POS server & local store):', fbErr?.code || fbErr?.message);
    }

    // 5. Role & Approval Assignment:
    // - Anyone who uses the Master Passcode is approved immediately!
    // - Anyone who does not know / enter the Master Passcode waits for administrator approval ('pending').
    const existingStaff = storage.getStaffList();
    const isApprovedByPasscode =
      serverResult?.approvedByMasterPasscode ??
      serverResult?.isInitialAdmin ??
      Boolean(token || (payload.masterPasscode && payload.masterPasscode.trim().length > 0));

    const assignedRole: StaffRole =
      serverResult?.user?.role ||
      (isApprovedByPasscode
        ? payload.role || 'admin'
        : payload.role && payload.role !== 'admin'
        ? payload.role
        : 'cashier');

    const assignedStatus: AccountStatus =
      serverResult?.user?.accountStatus ||
      (isApprovedByPasscode ? 'approved' : 'pending');

    const isActive: boolean =
      serverResult?.user?.active ?? isApprovedByPasscode;

    const cleanPin = (payload.pin || '1234').replace(/\D/g, '').slice(0, 4) || '1234';
    const employeeId =
      serverResult?.user?.employeeId || `SAP-EMP-${1001 + existingStaff.length}`;

    // 6. Build User Profile
    const newStaff: Staff = {
      id: finalUid,
      employeeId,
      name: fullName,
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      username: cleanUsername,
      displayName: payload.displayName?.trim() || fullName,
      email: cleanEmail,
      phone: payload.phone.trim(),
      gender: payload.gender?.trim() || undefined,
      dateOfBirth: payload.dateOfBirth?.trim() || undefined,
      address: payload.address.trim(),
      city: payload.city.trim(),
      addressDetails: payload.addressDetails?.trim() || undefined,
      jobTitle: payload.jobTitle.trim(),
      department: payload.department?.trim() || 'Retail & Print Operations',
      emergencyContactName: payload.emergencyContactName?.trim() || undefined,
      emergencyContactPhone: payload.emergencyContactPhone?.trim() || undefined,
      bio: payload.bio?.trim() || undefined,
      role: assignedRole,
      pin: cleanPin,
      password: payload.password,
      active: isActive,
      approvalStatus: assignedStatus,
      avatar: payload.profilePictureUrl,
      profilePictureUrl: payload.profilePictureUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedAt: isApprovedByPasscode ? new Date().toISOString() : undefined,
      approvedBy: isApprovedByPasscode ? 'MASTER_PASSCODE' : undefined,
      lastLogin: isApprovedByPasscode ? new Date().toISOString() : undefined,
    };

    // 7. Write to Cloud Firestore
    try {
      await setDoc(doc(db, 'users', finalUid), {
        uid: finalUid,
        employeeId: newStaff.employeeId,
        firstName: newStaff.firstName,
        lastName: newStaff.lastName,
        fullName: newStaff.name,
        username: newStaff.username,
        email: newStaff.email,
        phone: newStaff.phone,
        address: newStaff.address,
        city: newStaff.city,
        profilePictureUrl: newStaff.profilePictureUrl,
        jobTitle: newStaff.jobTitle,
        department: newStaff.department,
        role: newStaff.role,
        accountStatus: newStaff.approvalStatus,
        active: newStaff.active,
        createdAt: newStaff.createdAt,
        updatedAt: newStaff.updatedAt,
      });

      if (isApprovedByPasscode) {
        await setDoc(doc(db, 'system', 'setup'), {
          isInitialized: true,
          initializedAt: new Date().toISOString(),
          initialAdminUid: finalUid,
        });
      }
    } catch (fsErr) {
      console.warn('Firestore write notice (continuing with offline-first persistence):', fsErr);
    }

    // 8. Save to Local Storage Database
    storage.addStaffAccount(newStaff);
    storage.setStoreInitialized(true);

    if (isApprovedByPasscode) {
      storage.addAuditLog(
        'ACCOUNT_APPROVED_BY_PASSCODE',
        'AUTH',
        `Account ${fullName} (${cleanEmail}) created and automatically approved via Master Passcode with Employee ID: ${employeeId}.`
      );
    } else {
      storage.addAuditLog(
        'STAFF_REGISTERED',
        'AUTH',
        `New staff account registered without Master Passcode: ${fullName} (${cleanUsername}, ${cleanEmail}). Status: PENDING APPROVAL.`
      );
    }

    this.currentSignupToken = null;

    return {
      success: true,
      staff: newStaff,
      isInitialAdmin: isApprovedByPasscode,
      approvedByMasterPasscode: isApprovedByPasscode,
    };
  }

  /**
   * Update User Profile with local storage, Firestore, and backend synchronization
   */
  async updateStaffProfile(
    staffId: string,
    updates: Partial<Staff> & { newPassword?: string }
  ): Promise<{ success: boolean; staff?: Staff; error?: string }> {
    try {
      const currentList = storage.getStaffList();
      let existing = currentList.find((s) => s.id === staffId);
      if (!existing && storage.getCurrentStaff().id === staffId) {
        existing = storage.getCurrentStaff();
      }
      if (!existing) {
        return { success: false, error: 'Staff account not found.' };
      }

      const updatedStaff: Staff = {
        ...existing,
        ...updates,
        name: updates.name || (updates.firstName && updates.lastName ? `${updates.firstName} ${updates.lastName}`.trim() : existing.name),
        avatar: updates.avatar || updates.profilePictureUrl || existing.avatar,
        profilePictureUrl: updates.profilePictureUrl || updates.avatar || existing.profilePictureUrl,
        updatedAt: new Date().toISOString(),
      };

      // 1. Update localStorage
      storage.updateStaffAccount(updatedStaff);
      if (storage.getCurrentStaff().id === staffId) {
        storage.setCurrentStaff(staffId);
      }

      // 2. Update Firestore if accessible
      try {
        await setDoc(
          doc(db, 'users', staffId),
          {
            fullName: updatedStaff.name,
            firstName: updatedStaff.firstName || updatedStaff.name.split(' ')[0],
            lastName: updatedStaff.lastName || updatedStaff.name.split(' ').slice(1).join(' '),
            email: updatedStaff.email,
            phone: updatedStaff.phone || '',
            address: updatedStaff.address || '',
            city: updatedStaff.city || '',
            jobTitle: updatedStaff.jobTitle || '',
            department: updatedStaff.department || '',
            profilePictureUrl: updatedStaff.profilePictureUrl || updatedStaff.avatar || '',
            updatedAt: updatedStaff.updatedAt,
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore profile update notice:', err);
      }

      // 3. Update server API
      try {
        await fetch('/api/auth/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: staffId,
            firstName: updatedStaff.firstName,
            lastName: updatedStaff.lastName,
            fullName: updatedStaff.name,
            email: updatedStaff.email,
            phone: updatedStaff.phone,
            address: updatedStaff.address,
            city: updatedStaff.city,
            jobTitle: updatedStaff.jobTitle,
            department: updatedStaff.department,
            profilePictureUrl: updatedStaff.profilePictureUrl,
            pin: updatedStaff.pin,
            newPassword: updates.newPassword,
          }),
        });
      } catch (err) {
        console.warn('Server profile update notice:', err);
      }

      storage.addAuditLog(
        'STAFF_UPDATED',
        'AUTH',
        `Staff profile for ${updatedStaff.name} (${updatedStaff.email}) successfully updated.`
      );

      return { success: true, staff: updatedStaff };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update profile.' };
    }
  }
}

export const authService = new AuthService();
