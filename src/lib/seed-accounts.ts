import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { firestoreAddWhitelist, checkWhitelist } from './firestore';

interface SeedAccount {
  email: string;
  password: string;
  displayName: string;
  role: string;
}

const SEED_ACCOUNTS: SeedAccount[] = [
  { email: 'admin@dalwaco.com', password: 'admin123', displayName: 'Admin Utama', role: 'Admin Utama' },
  { email: 'gudang@dalwaco.com', password: 'gudang123', displayName: 'Admin Gudang', role: 'Admin Gudang' },
  { email: 'kasir@dalwaco.com', password: 'kasir123', displayName: 'Kasir Toko', role: 'Kasir Toko' },
];

/**
 * Seed default accounts. Signs out after each creation to avoid auto-login issues.
 */
export async function seedDefaultAccounts(): Promise<number> {
  let created = 0;

  // Also seed whitelist entries for test accounts
  for (const account of SEED_ACCOUNTS) {
    try {
      const isWhitelisted = await checkWhitelist(account.email);
      if (!isWhitelisted) {
        await firestoreAddWhitelist({
          email: account.email.toLowerCase(),
          role: account.role,
          displayName: account.displayName,
          addedBy: 'System',
          timestamp: new Date().toISOString(),
        });
        console.log(`📋 Whitelisted: ${account.email}`);
      }
    } catch (e) {
      console.error(`Failed to whitelist ${account.email}:`, e);
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, account.email, account.password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: account.email,
        displayName: account.displayName,
        role: account.role,
      });
      await signOut(auth);
      console.log(`✅ Created: ${account.email} (${account.role})`);
      created++;
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        console.log(`⏭️ Already exists: ${account.email}`);
        // Pastikan profil Firestore ada meski akun sudah ada
        try {
          const { signInWithEmailAndPassword } = await import('firebase/auth');
          const cred2 = await signInWithEmailAndPassword(auth, account.email, account.password);
          const profileRef = doc(db, 'users', cred2.user.uid);
          const snap = await getDoc(profileRef);
          if (!snap.exists()) {
            await setDoc(profileRef, {
              email: account.email,
              displayName: account.displayName,
              role: account.role,
            });
            console.log(`📝 Profile synced: ${account.email}`);
          }
          await signOut(auth);
        } catch (syncErr: any) {
          console.error(`⚠️ Could not sync profile for ${account.email}:`, syncErr.message);
        }
      } else {
        console.error(`❌ Failed to create ${account.email}:`, e.message);
      }
    }
  }

  console.log(`Seeding complete. Created ${created} accounts.`);
  return created;
}

/**
 * Get the list of default test accounts for display
 */
export function getTestAccounts() {
  return SEED_ACCOUNTS.map(({ email, password, role }) => ({ email, password, role }));
}
