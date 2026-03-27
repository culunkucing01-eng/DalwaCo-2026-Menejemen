import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  subscribeProducts,
  subscribeMaterials,
  subscribeConvectionLogs,
  subscribeShippingLogs,
  subscribePromos,
  subscribeMembers,
  subscribeReceivables,
  subscribeAuditLogs,
  subscribeCategories,
  subscribeMemberSettings,
  subscribeRewards,
  subscribeStoreProfiles,
  subscribeSalesTransactions,
  firestoreAddAuditLog,
  isFirestoreAvailable,
  type SalesTransaction,
  subscribeToCollectionPublic,
} from './firestore';

// --- Types ---
export interface ProductVariant {
  name: string;
  sku?: string;
  stock: number;
  warna?: string;
  size?: string;
  style?: string;
  barcode?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  hpp: number;
  price: number;
  price_reseller?: number;
  price_vvip1?: number;
  price_vvip2?: number;
  min_stock: number;
  stock_map: Record<string, number>;
  image_url?: string;
  variants?: ProductVariant[];
  notes?: string;
}

export interface Material {
  id: string;
  type: string;
  factory: string;
  meters_total: number;
  width?: number;
  price_per_meter: number;
  total_cost: number;
  status: string;
  due_date?: string;
  timestamp: string;
}

export interface VariantAllocation {
  variant_name: string;
  barcode: string;
  warna: string;
  size: string;
  style: string;
  qty: number;
  actual_qty?: number;
}

export interface ConvectionLog {
  id: string;
  material_id: string;
  material_name: string;
  meters_sent: number;
  destination: string;
  status: string;
  target_product_id?: string;
  target_product_name?: string;
  fabric_per_piece?: number;
  yield_rate?: number;
  cutting_loss_waste?: number;
  pcs_result?: number;
  convection_cost?: number;
  cost_per_piece?: number;
  defect_meters?: number;
  production_type?: 'internal' | 'makloon';
  vendor_name?: string;
  variant_distribution?: VariantAllocation[];
  timestamp: string;
}

export interface ShippingItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  barcode: string;
  warna: string;
  size: string;
  style: string;
  qty: number;
}

export interface ShippingLog {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  qty: number;
  destination: string;
  status: string;
  timestamp: string;
  items?: ShippingItem[];
}

export interface Promo {
  id: string;
  promo_name: string;
  type: string;
  value: number;
  target: string;
  end_date: string;
  is_active: boolean;
}

export type CustomerType = 'Regular' | 'Reseller' | 'VVIP 1' | 'VVIP 2';

export interface Member {
  id: string;
  member_id: string;
  name: string;
  phone: string;
  address: string;
  store_name: string;
  tier: 'Warga' | 'Santri' | 'Juragan' | 'Sultan';
  customer_type: CustomerType;
  points: number;
  total_spending: number;
  wa: string;
  timestamp: string;
}

export interface MemberSettings {
  id: string;
  min_spending_for_points: number;
  points_per_transaction: number;
  tier_santri: number;
  tier_juragan: number;
  tier_sultan: number;
}

export interface Reward {
  id: string;
  name: string;
  type: 'discount' | 'gift';
  points_cost: number;
  discount_value?: number;
  gift_description?: string;
  is_active: boolean;
  timestamp: string;
}

export interface StoreProfile {
  id: string;
  store_name: string;
  address: string;
  npwp: string;
  thank_you_message: string;
  feedback_contact: string;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  userName: string;
  timestamp: string;
}

export interface Receivable {
  id: string;
  customer_name: string;
  customer_wa: string;
  total: number;
  paid: number;
  due_date: string;
  items: string;
  status: string;
  timestamp: string;
}

export type RoleType = 'Admin Utama' | 'Admin Gudang' | 'Kasir Toko' | 'Pelanggan' | null;
export type ViewType = 'dashboard' | 'master-products' | 'warehouse' | 'convection' | 'shipping' | 'pos' | 'opname' | 'promos' | 'finance' | 'piutang' | 'user-management' | 'stock-requests' | 'my-stock-requests' | 'member-management' | 'store-profile' | 'store-stock-update' | 'backup-reset' | 'custom-orders' | 'absensi' | 'sop-guide' | 'financial-management' | 'store-management' | 'category-variant-management';

export const ROLES = {
  ADMIN: 'Admin Utama' as const,
  GUDANG: 'Admin Gudang' as const,
  KASIR: 'Kasir Toko' as const,
  PELANGGAN: 'Pelanggan' as const,
};

export const DEFAULT_STORES = ['Store Dalwa Mall', 'Store Dalwa Mart', 'Store Dalwa 3'];
export let STORES = [...DEFAULT_STORES];
export const DEFAULT_CATEGORIES: string[] = [];

// --- Utilities ---
export const formatNumber = (val: number | string): string => {
  if (!val && val !== 0) return '';
  return val.toString().replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const unformatNumber = (val: string): string => {
  return val.replace(/\./g, '');
};

// --- Sample/Fallback Data ---
const sampleProducts: Product[] = [
  { id: 'sample-1', name: 'Gamis Linen Premium', sku: 'DLW-GMS-01', category: 'Gamis', hpp: 120000, price: 285000, min_stock: 10, stock_map: { 'Gudang Utama': 45, 'Store Dalwa Mall': 12, 'Store Dalwa 2 Ba\'alawi': 8, 'Store Dalwa 3 Ba\'alawi': 5 } },
  { id: 'sample-2', name: 'Kemeja Katun Toyobo', sku: 'DLW-KMJ-01', category: 'Kemeja', hpp: 85000, price: 195000, min_stock: 15, stock_map: { 'Gudang Utama': 30, 'Store Dalwa Mall': 10, 'Store Dalwa 2 Ba\'alawi': 3, 'Store Dalwa 3 Ba\'alawi': 7 } },
  { id: 'sample-3', name: 'Hijab Voal Premium', sku: 'DLW-HJB-01', category: 'Hijab', hpp: 35000, price: 89000, min_stock: 20, stock_map: { 'Gudang Utama': 60, 'Store Dalwa Mall': 25, 'Store Dalwa 2 Ba\'alawi': 15, 'Store Dalwa 3 Ba\'alawi': 18 } },
  { id: 'sample-4', name: 'Gamis Crinkle Airflow', sku: 'DLW-GMS-02', category: 'Gamis', hpp: 95000, price: 245000, min_stock: 8, stock_map: { 'Gudang Utama': 3, 'Store Dalwa Mall': 6, 'Store Dalwa 2 Ba\'alawi': 2, 'Store Dalwa 3 Ba\'alawi': 1 } },
];

const sampleMaterials: Material[] = [
  { id: 'sample-m1', type: 'Katun Toyobo', factory: 'Pabrik Tex Indo', meters_total: 250, price_per_meter: 25000, total_cost: 6250000, status: 'Lunas', timestamp: new Date().toISOString() },
  { id: 'sample-m2', type: 'Linen Import', factory: 'CV Kain Makmur', meters_total: 180, price_per_meter: 45000, total_cost: 8100000, status: 'Hutang', due_date: '2026-03-15', timestamp: new Date().toISOString() },
];

const sampleShipping: ShippingLog[] = [
  { id: 'sample-s1', product_id: 'sample-1', product_name: 'Gamis Linen Premium', product_sku: 'DLW-GMS-01', qty: 10, destination: 'Store Dalwa Mall', status: 'In Transit', timestamp: new Date().toISOString() },
];

const samplePromos: Promo[] = [
  { id: 'sample-p1', promo_name: 'Payday Sale', type: 'Persentase', value: 15, target: 'Semua Kategori', end_date: '2026-03-31', is_active: true },
];

// --- Context ---
interface AppState {
  currentRole: RoleType;
  setCurrentRole: (role: RoleType) => void;
  view: ViewType;
  setView: (view: ViewType) => void;
  isAbsenDone: boolean;
  setIsAbsenDone: (done: boolean) => void;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  materials: Material[];
  setMaterials: React.Dispatch<React.SetStateAction<Material[]>>;
  convectionLogs: ConvectionLog[];
  setConvectionLogs: React.Dispatch<React.SetStateAction<ConvectionLog[]>>;
  shippingLogs: ShippingLog[];
  setShippingLogs: React.Dispatch<React.SetStateAction<ShippingLog[]>>;
  promos: Promo[];
  setPromos: React.Dispatch<React.SetStateAction<Promo[]>>;
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  receivables: Receivable[];
  setReceivables: React.Dispatch<React.SetStateAction<Receivable[]>>;
  auditLogs: AuditLog[];
  addAuditLog: (action: string, details: string) => void;
  showMessage: (msg: string) => void;
  systemMessage: string | null;
  setSystemMessage: (msg: string | null) => void;
  kasirStore: string;
  setKasirStore: (store: string) => void;
  firestoreReady: boolean;
  firestoreError: boolean;
  categories: string[];
  memberSettings: MemberSettings | null;
  rewards: Reward[];
  setRewards: React.Dispatch<React.SetStateAction<Reward[]>>;
  storeProfiles: StoreProfile[];
  setStoreProfiles: React.Dispatch<React.SetStateAction<StoreProfile[]>>;
  salesTransactions: SalesTransaction[];
  dynamicStores: string[];
  setDynamicStores: React.Dispatch<React.SetStateAction<string[]>>;
}

const AppContext = createContext<AppState | null>(null);

export const useAppState = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentRole, setCurrentRole] = useState<RoleType>(null);
  const [view, setView] = useState<ViewType>('dashboard');
  const [isAbsenDone, setIsAbsenDone] = useState(false);
  const [products, setProducts] = useState<Product[]>(sampleProducts);
  const [materials, setMaterials] = useState<Material[]>(sampleMaterials);
  const [convectionLogs, setConvectionLogs] = useState<ConvectionLog[]>([]);
  const [shippingLogs, setShippingLogs] = useState<ShippingLog[]>(sampleShipping);
  const [promos, setPromos] = useState<Promo[]>(samplePromos);
  const [members, setMembers] = useState<Member[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [firestoreReady, setFirestoreReady] = useState(false);
  const [firestoreError, setFirestoreError] = useState(false);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [kasirStore, setKasirStore] = useState(STORES[0]);
  const [memberSettings, setMemberSettings] = useState<MemberSettings | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [storeProfiles, setStoreProfiles] = useState<StoreProfile[]>([]);
  const [salesTransactions, setSalesTransactions] = useState<SalesTransaction[]>([]);
  const [dynamicStores, setDynamicStores] = useState<string[]>(DEFAULT_STORES);

  // Subscribe to Firestore - with fallback to sample data on error
  useEffect(() => {
    const onError = () => {
      setFirestoreError(true);
    };

    const unsubs = [
      subscribeProducts((data) => {
        if (data.length > 0) { setProducts(data); setFirestoreReady(true); setFirestoreError(false); }
      }, onError),
      subscribeMaterials((data) => { if (data.length > 0 || firestoreReady) setMaterials(data); }, onError),
      subscribeConvectionLogs(setConvectionLogs, onError),
      subscribeShippingLogs((data) => { if (data.length > 0 || firestoreReady) setShippingLogs(data); }, onError),
      subscribePromos((data) => { if (data.length > 0 || firestoreReady) setPromos(data); }, onError),
      subscribeMembers(setMembers, onError),
      subscribeReceivables(setReceivables, onError),
      subscribeAuditLogs(setAuditLogs, onError),
      subscribeCategories((cats) => {
        setCategories(cats);
      }, onError),
      subscribeMemberSettings((data: any) => { if (data) setMemberSettings(data); }, onError),
      subscribeRewards(setRewards, onError),
      subscribeStoreProfiles(setStoreProfiles, onError),
      subscribeSalesTransactions(setSalesTransactions, onError),
      subscribeToCollectionPublic<{ id: string; name: string }>('storeLocations', (data) => {
        if (data.length > 0) {
          const names = data.map(d => d.name).filter(Boolean);
          const merged = [...new Set([...DEFAULT_STORES, ...names])];
          setDynamicStores(merged);
          STORES = merged;
        }
      }, onError),
    ];
    return () => unsubs.forEach(u => u());
  }, [firestoreReady]);

  const addAuditLog = useCallback((action: string, details: string) => {
    const log = {
      action,
      details,
      userName: currentRole || 'Sistem',
      timestamp: new Date().toISOString(),
    };
    // Try Firestore, but also add locally as fallback
    firestoreAddAuditLog(log).catch(() => {
      setAuditLogs(prev => [...prev, { ...log, id: Date.now().toString() }]);
    });
  }, [currentRole]);

  const showMessage = useCallback((msg: string) => {
    setSystemMessage(msg);
    setTimeout(() => setSystemMessage(null), 4000);
  }, []);

  return (
    <AppContext.Provider value={{
      currentRole, setCurrentRole,
      view, setView,
      isAbsenDone, setIsAbsenDone,
      products, setProducts,
      materials, setMaterials,
      convectionLogs, setConvectionLogs,
      shippingLogs, setShippingLogs,
      promos, setPromos,
      members, setMembers,
      receivables, setReceivables,
      auditLogs, addAuditLog,
      showMessage, systemMessage, setSystemMessage,
      kasirStore, setKasirStore,
      firestoreReady,
      firestoreError,
      categories,
      memberSettings,
      rewards, setRewards,
      storeProfiles, setStoreProfiles,
      salesTransactions,
      dynamicStores, setDynamicStores,
    }}>
      {children}
    </AppContext.Provider>
  );
}
