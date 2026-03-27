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
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

const col = (name: string) => collection(db, name);

// --- Operational Expenses ---
export interface OperationalExpense {
  id: string;
  date: string;
  category: 'Gaji' | 'Listrik/Air' | 'Iklan/Marketing' | 'Perlengkapan Toko' | 'Lain-lain';
  location: string;
  amount: number;
  description: string;
  timestamp: string;
  created_by: string;
}

export const subscribeOperationalExpenses = (
  cb: (data: OperationalExpense[]) => void,
  onError?: (e: Error) => void
): Unsubscribe => {
  try {
    const q = query(col('operationalExpenses'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as OperationalExpense)));
    }, (error) => {
      console.error('Firestore listener error [operationalExpenses]:', error);
      onError?.(error as Error);
    });
  } catch (error) {
    console.error('Firestore subscribe error [operationalExpenses]:', error);
    return () => {};
  }
};

export const firestoreAddOperationalExpense = async (data: Omit<OperationalExpense, 'id'>) => {
  const docRef = await addDoc(col('operationalExpenses'), data);
  return docRef.id;
};

export const firestoreDeleteOperationalExpense = async (id: string) => {
  await deleteDoc(doc(db, 'operationalExpenses', id));
};

// --- Vendor Payables ---
export interface VendorPayable {
  id: string;
  vendor_name: string;
  type: 'Bahan Kain' | 'Makloon';
  reference_id?: string;
  description: string;
  total_amount: number;
  paid_amount: number;
  status: 'Belum Lunas' | 'Lunas';
  due_date?: string;
  timestamp: string;
  created_by: string;
  paid_at?: string;
}

export const subscribeVendorPayables = (
  cb: (data: VendorPayable[]) => void,
  onError?: (e: Error) => void
): Unsubscribe => {
  try {
    const q = query(col('vendorPayables'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as VendorPayable)));
    }, (error) => {
      console.error('Firestore listener error [vendorPayables]:', error);
      onError?.(error as Error);
    });
  } catch (error) {
    console.error('Firestore subscribe error [vendorPayables]:', error);
    return () => {};
  }
};

export const firestoreAddVendorPayable = async (data: Omit<VendorPayable, 'id'>) => {
  const docRef = await addDoc(col('vendorPayables'), data);
  return docRef.id;
};

export const firestoreUpdateVendorPayable = async (id: string, data: Partial<VendorPayable>) => {
  await updateDoc(doc(db, 'vendorPayables', id), data as Record<string, unknown>);
};

// --- Cash Settlements ---
export interface CashSettlement {
  id: string;
  store: string;
  cashier_name: string;
  date: string;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  status: 'Sesuai' | 'Kurang (Minus)' | 'Lebih (Surplus)';
  note?: string;
  timestamp: string;
}

export const subscribeCashSettlements = (
  cb: (data: CashSettlement[]) => void,
  onError?: (e: Error) => void
): Unsubscribe => {
  try {
    const q = query(col('cashSettlements'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as CashSettlement)));
    }, (error) => {
      console.error('Firestore listener error [cashSettlements]:', error);
      onError?.(error as Error);
    });
  } catch (error) {
    console.error('Firestore subscribe error [cashSettlements]:', error);
    return () => {};
  }
};

export const firestoreAddCashSettlement = async (data: Omit<CashSettlement, 'id'>) => {
  const docRef = await addDoc(col('cashSettlements'), data);
  return docRef.id;
};

export const EXPENSE_CATEGORIES = ['Gaji', 'Listrik/Air', 'Iklan/Marketing', 'Perlengkapan Toko', 'Lain-lain'] as const;

export const BANK_LIST = [
  { name: 'BCA', rekening: '1234567890', atas_nama: 'PT DALWA CO' },
  { name: 'Mandiri', rekening: '0987654321', atas_nama: 'PT DALWA CO' },
  { name: 'BRI', rekening: '1122334455', atas_nama: 'PT DALWA CO' },
];
