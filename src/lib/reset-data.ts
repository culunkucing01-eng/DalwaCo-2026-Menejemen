import { collection, getDocs, writeBatch, doc, query } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Delete all documents in a Firestore collection using writeBatch (max 500 per batch).
 * Throws on error so caller can display the real message.
 */
const deleteCollectionBatch = async (name: string): Promise<number> => {
  const snap = await getDocs(query(collection(db, name)));
  if (snap.empty) return 0;

  let deleted = 0;
  const docs = snap.docs;

  // Firestore batch limit = 500
  for (let i = 0; i < docs.length; i += 500) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + 500);
    for (const d of chunk) {
      batch.delete(doc(db, name, d.id));
    }
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
};

// Collections to wipe for a clean slate launch
const CLEAN_SLATE_COLLECTIONS = [
  'products',          // master_products / produk
  'materials',         // material_inputs / kain
  'convectionLogs',    // production_logs / konveksi
  'salesTransactions', // riwayat kasir/struk
  'stockRequests',     // permintaan barang
  'shippingLogs',      // pengiriman
  'stockChats',        // chat request
  'attendanceLogs',    // absen kasir
  'receivables',       // piutang
  'auditLogs',         // audit trail
  'promos',            // promo
  'members',           // member
  'rewards',           // reward
  'categories',        // kategori
  'memberSettings',    // setting member
  'loginLogs',         // login logs
];

// NEVER delete these
const PROTECTED_COLLECTIONS = ['users', 'whitelist', 'storeProfiles'];

export interface ResetResult {
  success: boolean;
  deletedCounts: Record<string, number>;
  totalDeleted: number;
  error?: string;
}

/**
 * Full clean slate reset — deletes ALL data except users, whitelist, storeProfiles.
 * Throws error with real message on failure.
 */
export const resetCleanSlate = async (): Promise<ResetResult> => {
  const deletedCounts: Record<string, number> = {};
  let totalDeleted = 0;

  for (const colName of CLEAN_SLATE_COLLECTIONS) {
    // Safety check
    if (PROTECTED_COLLECTIONS.includes(colName)) continue;

    const count = await deleteCollectionBatch(colName);
    deletedCounts[colName] = count;
    totalDeleted += count;
  }

  return { success: true, deletedCounts, totalDeleted };
};

// Legacy group-based reset (kept for backward compat)
const GROUP_COLLECTIONS: Record<string, string[]> = {
  transactions: ['salesTransactions'],
  production: ['convectionLogs', 'materials'],
  shipping: ['stockRequests', 'shippingLogs', 'stockChats'],
  stock: [], // handled separately
};

export const resetSelectedGroups = async (groups: string[]): Promise<void> => {
  for (const group of groups) {
    if (group === 'stock') {
      // Zero all stock maps
      const { getDocs: gd, query: q, collection: c, updateDoc: ud, doc: d } = await import('firebase/firestore');
      const snap = await gd(q(c(db, 'products')));
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (data.stock_map && typeof data.stock_map === 'object') {
          const zeroed: Record<string, number> = {};
          for (const key of Object.keys(data.stock_map)) {
            zeroed[key] = 0;
          }
          await ud(d(db, 'products', docSnap.id), { stock_map: zeroed });
        }
      }
      continue;
    }
    const cols = GROUP_COLLECTIONS[group] || [];
    for (const col of cols) {
      await deleteCollectionBatch(col);
    }
  }
};
