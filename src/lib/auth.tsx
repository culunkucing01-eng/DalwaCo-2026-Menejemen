import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { checkWhitelist, getWhitelistEntry, firestoreAddLoginLog, firestoreAddAttendanceLog } from './firestore';
import type { RoleType } from './store';

interface UserProfile {
  uid: string;
  email: string;
  role: RoleType;
  displayName: string;
  store?: string;
  // Pelanggan-specific fields
  wa?: string;
  customer_type?: string;
  member_id?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string, role: RoleType, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // During HMR, context may temporarily be unavailable
    return { user: null, profile: null, loading: true, login: async () => {}, loginWithGoogle: async () => {}, register: async () => {}, logout: async () => {}, authError: null, clearError: () => {} } as AuthContextType;
  }
  return ctx;
};

async function fetchProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) return { uid, ...snap.data() } as UserProfile;
    return null;
  } catch (e) {
    console.error('Failed to fetch profile:', e);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        const p = await fetchProfile(fbUser.uid);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    setAuthError(null);
    try {
      // Check whitelist before attempting login
      const isWhitelisted = await checkWhitelist(email);
      if (!isWhitelisted) {
        const msg = 'Akses ditolak: Akun Anda tidak terdaftar di whitelist. Hubungi Admin Utama.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const p = await fetchProfile(cred.user.uid);
      
      // Sync store/pelanggan fields from whitelist to profile if not set
      const wEntry = await getWhitelistEntry(email);
      if (p && wEntry) {
        const updates: Record<string, string> = {};
        if (!p.store && wEntry.store) { p.store = wEntry.store; updates.store = wEntry.store; }
        if (!p.wa && wEntry.wa) { p.wa = wEntry.wa; updates.wa = wEntry.wa; }
        if (!p.customer_type && wEntry.customer_type) { p.customer_type = wEntry.customer_type; updates.customer_type = wEntry.customer_type; }
        if (!p.member_id && wEntry.member_id) { p.member_id = wEntry.member_id; updates.member_id = wEntry.member_id; }
        if (Object.keys(updates).length > 0) {
          await setDoc(doc(db, 'users', cred.user.uid), updates, { merge: true });
        }
      }
      
      setProfile(p);

      // Log successful login
      const now = new Date();
      firestoreAddLoginLog({
        email: email.toLowerCase(),
        displayName: p?.displayName || email,
        role: p?.role || 'Unknown',
        loginAt: now.toISOString(),
        date: now.toISOString().split('T')[0],
      }).catch(() => {});

      // Log attendance for Kasir
      if (p?.role === 'Kasir Toko') {
        firestoreAddAttendanceLog({
          uid_kasir: cred.user.uid,
          nama_kasir: p.displayName || email,
          lokasi_toko: p.store || '',
          waktu_login: now.toISOString(),
          tipe: 'Masuk Shift',
        }).catch(() => {});
      }
    } catch (e: any) {
      if (e.message?.includes('whitelist')) throw e;
      const msg = e.code === 'auth/operation-not-allowed'
        ? 'SETUP REQUIRED: Email/Password belum di-enable. Buka Firebase Console → Authentication → Sign-in method → Email/Password → Enable → Save'
        : e.code === 'auth/invalid-credential'
        ? 'Email atau password salah'
        : e.code === 'auth/too-many-requests'
        ? 'Terlalu banyak percobaan. Coba lagi nanti.'
        : e.code === 'auth/user-not-found'
        ? 'Akun tidak ditemukan'
        : `Login gagal: ${e.message}`;
      setAuthError(msg);
      throw e;
    }
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const email = cred.user.email || '';

      // Check whitelist
      const isWhitelisted = await checkWhitelist(email);
      if (!isWhitelisted) {
        await signOut(auth);
        const msg = 'Akses ditolak: Akun Google Anda tidak terdaftar di whitelist. Hubungi Admin Utama.';
        setAuthError(msg);
        throw new Error(msg);
      }

      // Check if profile exists, otherwise create from whitelist
      let p = await fetchProfile(cred.user.uid);
      const wEntry = await getWhitelistEntry(email);
      if (!p) {
        const profileData: Omit<UserProfile, 'uid'> = {
          email,
          role: (wEntry?.role as RoleType) || 'Kasir Toko',
          displayName: cred.user.displayName || email.split('@')[0],
          store: wEntry?.store || '',
          wa: wEntry?.wa || '',
          customer_type: wEntry?.customer_type || '',
          member_id: wEntry?.member_id || '',
        };
        await setDoc(doc(db, 'users', cred.user.uid), profileData);
        p = { uid: cred.user.uid, ...profileData };
      } else if (wEntry) {
        // Sync any missing fields from whitelist
        const updates: Record<string, string> = {};
        if (!p.wa && wEntry.wa) { p.wa = wEntry.wa; updates.wa = wEntry.wa; }
        if (!p.customer_type && wEntry.customer_type) { p.customer_type = wEntry.customer_type; updates.customer_type = wEntry.customer_type; }
        if (!p.member_id && wEntry.member_id) { p.member_id = wEntry.member_id; updates.member_id = wEntry.member_id; }
        if (Object.keys(updates).length > 0) {
          await setDoc(doc(db, 'users', cred.user.uid), updates, { merge: true });
        }
      }
      setProfile(p);

      // Log login
      const now = new Date();
      firestoreAddLoginLog({
        email,
        displayName: p.displayName || email,
        role: p.role || 'Unknown',
        loginAt: now.toISOString(),
        date: now.toISOString().split('T')[0],
      }).catch(() => {});
    } catch (e: any) {
      if (e.message?.includes('whitelist') || e.message?.includes('Akses ditolak')) throw e;
      const msg = e.code === 'auth/popup-closed-by-user'
        ? 'Login dibatalkan.'
        : `Login Google gagal: ${e.message}`;
      setAuthError(msg);
      throw e;
    }
  };

  const register = async (email: string, password: string, role: RoleType, displayName: string) => {
    setAuthError(null);
    try {
      // Check whitelist before allowing registration
      const isWhitelisted = await checkWhitelist(email);
      if (!isWhitelisted) {
        const msg = 'Akses ditolak: Email Anda tidak terdaftar di whitelist. Hubungi Admin Utama untuk mendaftarkan akun.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const wEntry = await getWhitelistEntry(email);
      const profileData: Omit<UserProfile, 'uid'> = { email, role, displayName, store: wEntry?.store || '' };
      await setDoc(doc(db, 'users', cred.user.uid), profileData);
      setProfile({ uid: cred.user.uid, ...profileData });
    } catch (e: any) {
      if (e.message?.includes('whitelist')) throw e;
      const msg = e.code === 'auth/email-already-in-use'
        ? 'Email sudah terdaftar'
        : e.code === 'auth/weak-password'
        ? 'Password minimal 6 karakter'
        : `Registrasi gagal: ${e.message}`;
      setAuthError(msg);
      throw e;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  const clearError = () => setAuthError(null);

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, loginWithGoogle, register, logout, authError, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}
