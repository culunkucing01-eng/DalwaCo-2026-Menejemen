import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  runTransaction,
  increment,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  Product,
  Material,
  ConvectionLog,
  ShippingLog,
  Promo,
  Member,
  Receivable,
  AuditLog,
  Reward,
  StoreProfile,
} from './store';

// Collection references
const col = (name: string) => collection(db, name);

// Track Firestore availability
let firestoreAvailable = true;

export const isFirestoreAvailable = () => firestoreAvailable;

// --- Generic helpers with error handling ---
export const addDocument = async <T extends Record<string, unknown>>(
  collectionName: string,
  data: T
): Promise<string> => {
  try {
    const docRef = await addDoc(col(collectionName), data);
    return docRef.id;
  } catch (error) {
    console.error(`Firestore addDocument [${collectionName}] error:`, error);
    firestoreAvailable = false;
    return Date.now().toString();
  }
};

export const updateDocument = async (
  collectionName: string,
  id: string,
  data: Record<string, unknown>
) => {
  try {
    await updateDoc(doc(db, collectionName, id), data);
  } catch (error) {
    console.error(`Firestore updateDocument [${collectionName}/${id}] error:`, error);
    firestoreAvailable = false;
  }
};

export const deleteDocument = async (collectionName: string, id: string) => {
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    console.error(`Firestore deleteDocument [${collectionName}/${id}] error:`, error);
    firestoreAvailable = false;
  }
};

// --- Real-time listeners with error callback ---
type Listener<T> = (data: T[]) => void;
type ErrorCallback = (error: Error) => void;

function subscribeToCollection<T>(
  collectionName: string,
  callback: Listener<T>,
  onError?: ErrorCallback,
  orderField?: string
): Unsubscribe {
  try {
    const q = orderField
      ? query(col(collectionName), orderBy(orderField, 'desc'))
      : query(col(collectionName));

    return onSnapshot(q, (snapshot) => {
      firestoreAvailable = true;
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as T[];
      callback(items);
    }, (error) => {
      console.error(`Firestore listener error [${collectionName}]:`, error);
      firestoreAvailable = false;
      onError?.(error as Error);
    });
  } catch (error) {
    console.error(`Firestore subscribe error [${collectionName}]:`, error);
    firestoreAvailable = false;
    return () => {}; // noop unsubscribe
  }
}

export const subscribeProducts = (cb: Listener<Product>, onError?: ErrorCallback) =>
  subscribeToCollection<Product>('products', cb, onError);

export const subscribeMaterials = (cb: Listener<Material>, onError?: ErrorCallback) =>
  subscribeToCollection<Material>('materials', cb, onError, 'timestamp');

export const subscribeConvectionLogs = (cb: Listener<ConvectionLog>, onError?: ErrorCallback) =>
  subscribeToCollection<ConvectionLog>('convectionLogs', cb, onError, 'timestamp');

export const subscribeShippingLogs = (cb: Listener<ShippingLog>, onError?: ErrorCallback) =>
  subscribeToCollection<ShippingLog>('shippingLogs', cb, onError, 'timestamp');

export const subscribePromos = (cb: Listener<Promo>, onError?: ErrorCallback) =>
  subscribeToCollection<Promo>('promos', cb, onError);

export const subscribeMembers = (cb: Listener<Member>, onError?: ErrorCallback) =>
  subscribeToCollection<Member>('members', cb, onError);

// --- Member Settings ---
export const subscribeMemberSettings = (cb: (data: any) => void, onError?: ErrorCallback): Unsubscribe => {
  try {
    const q = query(col('memberSettings'));
    return onSnapshot(q, (snapshot) => {
      firestoreAvailable = true;
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        cb({ id: doc.id, ...doc.data() });
      }
    }, (error) => {
      console.error('Firestore listener error [memberSettings]:', error);
      onError?.(error as Error);
    });
  } catch (error) {
    console.error('Firestore subscribe error [memberSettings]:', error);
    return () => {};
  }
};

export const firestoreSetMemberSettings = async (data: Record<string, unknown>) => {
  try {
    const snap = await getDocs(query(col('memberSettings')));
    if (snap.empty) {
      await addDoc(col('memberSettings'), data);
    } else {
      await updateDoc(doc(db, 'memberSettings', snap.docs[0].id), data);
    }
  } catch (error) {
    console.error('Firestore memberSettings error:', error);
  }
};

export const subscribeReceivables = (cb: Listener<Receivable>, onError?: ErrorCallback) =>
  subscribeToCollection<Receivable>('receivables', cb, onError, 'timestamp');

// --- Pelanggan (Customer Portal) Query Functions ---
export const subscribeReceivablesByWa = (wa: string, cb: (items: Receivable[]) => void, onError?: ErrorCallback): Unsubscribe => {
  if (!wa) { cb([]); return () => {}; }
  try {
    const q = query(col('receivables'), where('customer_wa', '==', wa), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Receivable)));
    }, (err) => {
      console.error('subscribeReceivablesByWa error:', err);
      onError?.(err);
      cb([]);
    });
  } catch (e) {
    console.error('subscribeReceivablesByWa setup error:', e);
    cb([]);
    return () => {};
  }
};

export const subscribeSalesTransactionsByMember = (memberId: string, cb: (items: SalesTransaction[]) => void, onError?: ErrorCallback): Unsubscribe => {
  if (!memberId) { cb([]); return () => {}; }
  try {
    const q = query(col('salesTransactions'), where('member_id', '==', memberId), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as SalesTransaction)));
    }, (err) => {
      console.error('subscribeSalesTransactionsByMember error:', err);
      onError?.(err);
      cb([]);
    });
  } catch (e) {
    console.error('subscribeSalesTransactionsByMember setup error:', e);
    cb([]);
    return () => {};
  }
};

export const subscribeAuditLogs = (cb: Listener<AuditLog>, onError?: ErrorCallback) =>
  subscribeToCollection<AuditLog>('auditLogs', cb, onError, 'timestamp');

// Public version of subscribeToCollection for external use
export const subscribeToCollectionPublic = subscribeToCollection;

// --- Typed mutation helpers ---
export const firestoreAddProduct = (p: Omit<Product, 'id'>) =>
  addDocument('products', p as Record<string, unknown>);

export const firestoreUpdateProduct = (id: string, data: Partial<Product>) =>
  updateDocument('products', id, data as Record<string, unknown>);

export const firestoreDeleteProduct = (id: string) =>
  deleteDocument('products', id);

export const firestoreAddMaterial = (m: Omit<Material, 'id'>) =>
  addDocument('materials', m as Record<string, unknown>);

export const firestoreUpdateMaterial = (id: string, data: Partial<Material>) =>
  updateDocument('materials', id, data as Record<string, unknown>);

export const firestoreAddConvectionLog = (c: Omit<ConvectionLog, 'id'>) =>
  addDocument('convectionLogs', c as Record<string, unknown>);

export const firestoreUpdateConvectionLog = (id: string, data: Partial<ConvectionLog>) =>
  updateDocument('convectionLogs', id, data as Record<string, unknown>);

export const firestoreAddShippingLog = (s: Omit<ShippingLog, 'id'>) =>
  addDocument('shippingLogs', s as Record<string, unknown>);

export const firestoreUpdateShippingLog = (id: string, data: Partial<ShippingLog>) =>
  updateDocument('shippingLogs', id, data as Record<string, unknown>);

export const firestoreAddPromo = (p: Omit<Promo, 'id'>) =>
  addDocument('promos', p as Record<string, unknown>);

export const firestoreUpdatePromo = (id: string, data: Partial<Promo>) =>
  updateDocument('promos', id, data as Record<string, unknown>);

export const firestoreAddMember = (m: Omit<Member, 'id'>) =>
  addDocument('members', m as Record<string, unknown>);

export const firestoreUpdateMember = (id: string, data: Partial<Member>) =>
  updateDocument('members', id, data as Record<string, unknown>);

export const firestoreDeleteMember = (id: string) =>
  deleteDocument('members', id);

export const firestoreAddReceivable = (r: Omit<Receivable, 'id'>) =>
  addDocument('receivables', r as Record<string, unknown>);

export const firestoreUpdateReceivable = (id: string, data: Partial<Receivable>) =>
  updateDocument('receivables', id, data as Record<string, unknown>);

export const firestoreAddAuditLog = (a: Omit<AuditLog, 'id'>) =>
  addDocument('auditLogs', a as Record<string, unknown>);

// --- Categories ---
export interface CategoryDoc {
  id: string;
  name: string;
  prefix?: string;
}

export const subscribeCategories = (cb: (cats: string[]) => void, onError?: ErrorCallback): Unsubscribe => {
  try {
    const q = query(col('categories'));
    return onSnapshot(q, (snapshot) => {
      firestoreAvailable = true;
      const cats = snapshot.docs.map(d => d.data().name as string).filter(Boolean);
      cb(cats);
    }, (error) => {
      console.error('Firestore listener error [categories]:', error);
      onError?.(error as Error);
    });
  } catch (error) {
    console.error('Firestore subscribe error [categories]:', error);
    return () => {};
  }
};

export const subscribeCategoriesWithIds = (cb: (cats: CategoryDoc[]) => void, onError?: ErrorCallback): Unsubscribe => {
  try {
    const q = query(col('categories'));
    return onSnapshot(q, (snapshot) => {
      firestoreAvailable = true;
      const cats = snapshot.docs.map(d => ({ id: d.id, name: d.data().name as string, prefix: (d.data().prefix as string) || '' })).filter(c => Boolean(c.name));
      cb(cats);
    }, (error) => {
      console.error('Firestore listener error [categories]:', error);
      onError?.(error as Error);
    });
  } catch (error) {
    console.error('Firestore subscribe error [categories]:', error);
    return () => {};
  }
};

export const firestoreAddCategory = (name: string, prefix?: string) =>
  addDocument('categories', { name, ...(prefix ? { prefix } : {}) });

export const firestoreUpdateCategory = (id: string, name: string) =>
  updateDocument('categories', id, { name });

export const firestoreDeleteCategory = (id: string) =>
  deleteDocument('categories', id);

/**
 * Rename category on all products that use the old name.
 */
export const firestoreRenameCategoryOnProducts = async (oldName: string, newName: string): Promise<number> => {
  try {
    const q = query(col('products'), where('category', '==', oldName));
    const snap = await getDocs(q);
    let count = 0;
    for (const d of snap.docs) {
      await updateDoc(doc(db, 'products', d.id), { category: newName });
      count++;
    }
    return count;
  } catch (error) {
    console.error('Firestore renameCategoryOnProducts error:', error);
    return 0;
  }
};

// --- Whitelist ---
export const subscribeWhitelist = (cb: (data: any[]) => void, onError?: (e: Error) => void): Unsubscribe => {
  return subscribeToCollection('whitelist', cb, onError);
};

export const firestoreAddWhitelist = (data: Record<string, unknown>) =>
  addDocument('whitelist', data);

export const firestoreDeleteWhitelist = (id: string) =>
  deleteDocument('whitelist', id);

export const checkWhitelist = async (email: string): Promise<boolean> => {
  try {
    const q = query(col('whitelist'), where('email', '==', email.toLowerCase()));
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (e) {
    console.error('Whitelist check error:', e);
    return true; // Allow login on error to prevent lockout
  }
};

export const getWhitelistEntry = async (email: string): Promise<Record<string, any> | null> => {
  try {
    const q = query(col('whitelist'), where('email', '==', email.toLowerCase()));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) {
    console.error('Whitelist fetch error:', e);
    return null;
  }
};

// --- Login Logs ---
export const subscribeLoginLogs = (cb: (data: any[]) => void, onError?: (e: Error) => void): Unsubscribe => {
  return subscribeToCollection('loginLogs', cb, onError, 'loginAt');
};

export const firestoreAddLoginLog = (data: Record<string, unknown>) =>
  addDocument('loginLogs', data);

// --- Attendance Logs ---
export const firestoreAddAttendanceLog = (data: Record<string, unknown>) =>
  addDocument('attendanceLogs', data);

// --- Stock Requests ---
export interface StockRequest {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  qty: number;
  store: string;
  requester_name: string;
  requester_role: string;
  note: string;
  status: 'Pending' | 'Diproses' | 'Ditolak' | 'Selesai';
  response_note?: string;
  timestamp: string;
  responded_at?: string;
}

export const subscribeStockRequests = (cb: (data: StockRequest[]) => void, onError?: (e: Error) => void): Unsubscribe => {
  return subscribeToCollection<StockRequest>('stockRequests', cb, onError, 'timestamp');
};

export const firestoreAddStockRequest = (data: Omit<StockRequest, 'id'>) =>
  addDocument('stockRequests', data as Record<string, unknown>);

export const firestoreUpdateStockRequest = (id: string, data: Partial<StockRequest>) =>
  updateDocument('stockRequests', id, data as Record<string, unknown>);

// --- Stock Request Chat ---
export interface StockChat {
  id: string;
  request_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  timestamp: string;
}

export const subscribeStockChats = (requestId: string, cb: (data: StockChat[]) => void, onError?: ErrorCallback): Unsubscribe => {
  try {
    // Use only where() without orderBy() to avoid needing a composite index.
    // Sort client-side instead — chat messages are small per request.
    const q = query(
      col('stockChats'),
      where('request_id', '==', requestId)
    );
    return onSnapshot(q, (snapshot) => {
      firestoreAvailable = true;
      const items = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() })) as StockChat[];
      items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      cb(items);
    }, (error) => {
      console.error('Firestore listener error [stockChats]:', error);
      onError?.(error as Error);
    });
  } catch (error) {
    console.error('Firestore subscribe error [stockChats]:', error);
    return () => {};
  }
};

export const firestoreAddStockChat = (data: Omit<StockChat, 'id'>) =>
  addDocument('stockChats', data as Record<string, unknown>);

// --- Rewards ---
export const subscribeRewards = (cb: Listener<Reward>, onError?: ErrorCallback) =>
  subscribeToCollection<Reward>('rewards', cb, onError);

export const firestoreAddReward = (r: Omit<Reward, 'id'>) =>
  addDocument('rewards', r as Record<string, unknown>);

export const firestoreUpdateReward = (id: string, data: Partial<Reward>) =>
  updateDocument('rewards', id, data as Record<string, unknown>);

export const firestoreDeleteReward = (id: string) =>
  deleteDocument('rewards', id);

// --- Store Profiles ---
export const subscribeStoreProfiles = (cb: Listener<StoreProfile>, onError?: ErrorCallback) =>
  subscribeToCollection<StoreProfile>('storeProfiles', cb, onError);

export const firestoreAddStoreProfile = (p: Omit<StoreProfile, 'id'>) =>
  addDocument('storeProfiles', p as Record<string, unknown>);

export const firestoreUpdateStoreProfile = (id: string, data: Partial<StoreProfile>) =>
  updateDocument('storeProfiles', id, data as Record<string, unknown>);

// --- Sales Transactions ---
export interface SalesTransaction {
  id: string;
  transaction_id: string;
  store: string;
  cashier_name: string;
  items: Array<{ sku: string; name: string; qty: number; price: number; subtotal: number; hpp?: number; category?: string; variant_name?: string | null; product_id?: string }>;
  subtotal: number;
  discount: number;
  grand_total: number;
  payment_method: string;
  member_name?: string;
  member_id?: string;
  customer_type?: string;
  timestamp: string;
  date: string; // YYYY-MM-DD for easy filtering
  transaction_type?: 'Sale' | 'Gift_Owner';
  gift_note?: string;
  total_hpp?: number;
}

export const subscribeSalesTransactions = (cb: Listener<SalesTransaction>, onError?: ErrorCallback) =>
  subscribeToCollection<SalesTransaction>('salesTransactions', cb, onError, 'timestamp');

export const firestoreAddSalesTransaction = (data: Omit<SalesTransaction, 'id'>) =>
  addDocument('salesTransactions', data as Record<string, unknown>);

// --- Atomic POS Checkout (Transaction + Stock Deduction) ---
export interface AtomicCheckoutItem {
  productId: string;
  qty: number;
  store: string;
}

/**
 * Atomically deducts stock for multiple products using Firestore Transaction.
 * If any product has insufficient stock, the entire transaction is rolled back.
 * Returns true if successful, throws error with details if stock insufficient.
 */
export const atomicDeductStock = async (items: AtomicCheckoutItem[]): Promise<boolean> => {
  try {
    await runTransaction(db, async (transaction) => {
      // Phase 1: Read all product documents
      const productRefs = items.map(item => doc(db, 'products', item.productId));
      const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

      // Phase 2: Validate all stock levels
      for (let i = 0; i < items.length; i++) {
        const snap = productSnaps[i];
        const item = items[i];
        if (!snap.exists()) {
          throw new Error(`Produk tidak ditemukan: ${item.productId}`);
        }
        const data = snap.data();
        const currentStock = data.stock_map?.[item.store] || 0;
        if (currentStock < item.qty) {
          const productName = data.name || item.productId;
          throw new Error(`Stok tidak mencukupi: ${productName} (tersedia: ${currentStock}, dibutuhkan: ${item.qty})`);
        }
      }

      // Phase 3: All validated — deduct stock atomically
      for (let i = 0; i < items.length; i++) {
        const snap = productSnaps[i];
        const item = items[i];
        const data = snap.data()!;
        const newStockMap = { ...data.stock_map, [item.store]: (data.stock_map?.[item.store] || 0) - item.qty };
        transaction.update(productRefs[i], { stock_map: newStockMap });
      }
    });
    return true;
  } catch (error: any) {
    console.error('Atomic checkout failed:', error);
    throw error;
  }
};

/**
 * Atomically add stock to a specific store location using Firestore Transaction.
 * Used for Receiving, StoreStockUpdate, and Convection result intake.
 */
export const atomicAddStock = async (
  productId: string,
  store: string,
  qty: number,
  variantUpdates?: { variants: any[] }
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const productRef = doc(db, 'products', productId);
    const snap = await transaction.get(productRef);
    if (!snap.exists()) {
      throw new Error(`Produk tidak ditemukan: ${productId}`);
    }
    const data = snap.data();
    const newStockMap = { ...data.stock_map, [store]: (data.stock_map?.[store] || 0) + qty };
    const updateData: Record<string, any> = { stock_map: newStockMap };
    if (variantUpdates) {
      updateData.variants = variantUpdates.variants;
    }
    transaction.update(productRef, updateData);
  });
};

/**
 * Atomically deduct stock from Gudang Utama (for Shipping/Surat Jalan).
 * Validates stock before deducting. Optionally updates variant-level stock.
 */
export const atomicDeductGudangStock = async (
  productId: string,
  qty: number,
  variantUpdates?: { variants: any[] }
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const productRef = doc(db, 'products', productId);
    const snap = await transaction.get(productRef);
    if (!snap.exists()) {
      throw new Error(`Produk tidak ditemukan: ${productId}`);
    }
    const data = snap.data();
    const currentStock = data.stock_map?.['Gudang Utama'] || 0;
    if (currentStock < qty) {
      throw new Error(`Stok Gudang tidak cukup: ${data.name} (tersedia: ${currentStock}, dibutuhkan: ${qty})`);
    }
    const updateData: Record<string, any> = {};
    if (variantUpdates) {
      updateData.variants = variantUpdates.variants;
      const totalGudang = variantUpdates.variants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
      updateData.stock_map = { ...data.stock_map, 'Gudang Utama': totalGudang };
    } else {
      updateData.stock_map = { ...data.stock_map, 'Gudang Utama': currentStock - qty };
    }
    transaction.update(productRef, updateData);
  });
};

/**
 * Atomically set stock to a specific value (for Opname corrections).
 */
export const atomicSetStock = async (
  productId: string,
  store: string,
  newStockValue: number
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const productRef = doc(db, 'products', productId);
    const snap = await transaction.get(productRef);
    if (!snap.exists()) {
      throw new Error(`Produk tidak ditemukan: ${productId}`);
    }
    const data = snap.data();
    const newStockMap = { ...data.stock_map, [store]: newStockValue };
    transaction.update(productRef, { stock_map: newStockMap });
  });
};

// --- Backup & Reset ---
export const backupAllData = async (): Promise<Record<string, any[]>> => {
  const collections = ['products', 'materials', 'convectionLogs', 'shippingLogs', 'promos', 'members', 'receivables', 'auditLogs', 'categories', 'rewards', 'storeProfiles', 'memberSettings', 'stockRequests', 'whitelist', 'salesTransactions'];
  const backup: Record<string, any[]> = {};
  for (const name of collections) {
    try {
      const snap = await getDocs(query(col(name)));
      backup[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error(`Backup error [${name}]:`, e);
      backup[name] = [];
    }
  }
  return backup;
};

export const resetAllData = async (collections: string[]): Promise<void> => {
  for (const name of collections) {
    try {
      const snap = await getDocs(query(col(name)));
      for (const d of snap.docs) {
        await deleteDoc(doc(db, name, d.id));
      }
    } catch (e) {
      console.error(`Reset error [${name}]:`, e);
    }
  }
};
