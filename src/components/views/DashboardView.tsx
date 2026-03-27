import { useState, useMemo, useEffect } from 'react';
import { useAppState, formatNumber, STORES, ROLES } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { subscribeToCollectionPublic } from '@/lib/firestore';
import { TrendingUp, Package, AlertTriangle, Store, Truck, CheckCircle2, User, Mail, MapPin, ArrowRight, MessageSquare, BarChart3, ShieldAlert, Trash2, Flame, PackageX } from 'lucide-react';

function StatCard({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${danger ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
          {icon}
        </div>
      </div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-xl font-extrabold mt-1 ${danger ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

interface MaterialDeleteLog {
  id: string;
  material_id: string;
  material_name: string;
  deleted_by: string;
  timestamp: string;
  reason: string;
  original_data: Record<string, any>;
}

type AnalyticsPeriod = '7d' | '30d' | 'month' | 'year';
type DashboardTab = 'overview' | 'performa' | 'audit-hapus';

export default function DashboardView() {
  const { products, shippingLogs, storeProfiles, currentRole, kasirStore, salesTransactions, setView } = useAppState();
  const { profile } = useAuth();
  const [selectedStore, setSelectedStore] = useState(currentRole === ROLES.KASIR ? kasirStore : STORES[0]);
  const [dashTab, setDashTab] = useState<DashboardTab>('overview');
  const [deleteLogs, setDeleteLogs] = useState<MaterialDeleteLog[]>([]);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('30d');

  // Subscribe to material delete logs for admin
  useEffect(() => {
    if (currentRole === ROLES.ADMIN) {
      const unsub = subscribeToCollectionPublic<MaterialDeleteLog>('materialDeleteLogs', setDeleteLogs, undefined, 'timestamp');
      return unsub;
    }
  }, [currentRole]);

  // Calculate today's revenue from salesTransactions
  const todayRevenue = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const storeTx = salesTransactions.filter(tx => {
      if (tx.date !== today) return false;
      if (currentRole === ROLES.KASIR) return tx.store === kasirStore;
      if (selectedStore !== STORES[0]) return tx.store === selectedStore;
      return true;
    });
    return storeTx.reduce((sum, tx) => sum + tx.grand_total, 0);
  }, [salesTransactions, currentRole, kasirStore, selectedStore]);

  const totalBaju = products.reduce((acc, p) => acc + Object.values(p.stock_map || {}).reduce((a, b) => a + b, 0), 0);

  // Store stock data
  const storeStock = products.map(p => ({
    ...p,
    storeQty: p.stock_map?.[selectedStore] || 0,
    gudangQty: p.stock_map?.['Gudang Utama'] || 0,
    totalAllStore: Object.values(p.stock_map || {}).reduce((a, b) => a + b, 0),
    isLow: (p.stock_map?.[selectedStore] || 0) <= p.min_stock,
  })).sort((a, b) => a.storeQty - b.storeQty);

  const storeLowCount = storeStock.filter(s => s.isLow && s.storeQty > 0).length;
  const storeEmptyCount = storeStock.filter(s => s.storeQty === 0).length;
  const storeTotal = storeStock.reduce((a, s) => a + s.storeQty, 0);

  const pendingShipments = shippingLogs.filter(l => l.destination === selectedStore && l.status === 'In Transit');

  const lowStockItems = useMemo(() => storeStock.filter(p => p.isLow && p.storeQty > 0), [storeStock]);
  const emptyStockItems = useMemo(() => storeStock.filter(p => p.storeQty === 0), [storeStock]);

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const recentShipments = shippingLogs.filter(l => l.destination === selectedStore && new Date(l.timestamp) >= oneWeekAgo);
  const lastUpdate = recentShipments.length > 0
    ? new Date(recentShipments[0].timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    : 'Belum ada';

  const myStoreProfile = currentRole === ROLES.KASIR ? storeProfiles.find(p => p.store_name === kasirStore) : null;

  // --- Analytics date range ---
  const analyticsDateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    if (analyticsPeriod === '7d') {
      start = new Date(now); start.setDate(now.getDate() - 7);
    } else if (analyticsPeriod === '30d') {
      start = new Date(now); start.setDate(now.getDate() - 30);
    } else if (analyticsPeriod === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
    }
    return { start, end: now };
  }, [analyticsPeriod]);

  const filteredTransactions = useMemo(() => {
    return salesTransactions.filter(tx => {
      const d = new Date(tx.date);
      return d >= analyticsDateRange.start && d <= analyticsDateRange.end;
    });
  }, [salesTransactions, analyticsDateRange]);

  // --- Fast Moving (Top 10) ---
  const fastMoving = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; variant: string; qty: number; revenue: number }>();
    filteredTransactions.forEach(tx => {
      tx.items.forEach(item => {
        const key = item.sku;
        const existing = map.get(key) || { name: item.name, sku: item.sku, variant: item.variant_name || '-', qty: 0, revenue: 0 };
        existing.qty += item.qty;
        existing.revenue += item.subtotal;
        map.set(key, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [filteredTransactions]);

  // --- Dead Stock / Slow Moving ---
  const deadStock = useMemo(() => {
    // Build sales qty map by barcode/sku for the period
    const salesMap = new Map<string, number>();
    filteredTransactions.forEach(tx => {
      tx.items.forEach(item => {
        const key = item.sku;
        salesMap.set(key, (salesMap.get(key) || 0) + item.qty);
      });
    });

    const items: { name: string; sku: string; variant: string; stock: number; qtySold: number; hppValue: number }[] = [];
    products.forEach(p => {
      const totalStock = Object.values(p.stock_map || {}).reduce((a, b) => a + b, 0);
      if (totalStock <= 0) return;

      if (p.variants && p.variants.length > 0) {
        p.variants.forEach(v => {
          if ((v.stock || 0) <= 0) return;
          const key = v.barcode || v.sku || p.sku;
          const qtySold = salesMap.get(key) || 0;
          if (qtySold < 3) {
            const variantLabel = [v.warna, v.size, v.style].filter(Boolean).join(' / ') || '-';
            items.push({ name: p.name, sku: p.sku, variant: variantLabel, stock: v.stock || 0, qtySold, hppValue: (v.stock || 0) * p.hpp });
          }
        });
      } else {
        const qtySold = salesMap.get(p.sku) || 0;
        if (qtySold < 3) {
          items.push({ name: p.name, sku: p.sku, variant: '-', stock: totalStock, qtySold, hppValue: totalStock * p.hpp });
        }
      }
    });
    return items.sort((a, b) => b.stock - a.stock);
  }, [products, filteredTransactions]);

  const showAdminTabs = currentRole === ROLES.ADMIN;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Kasir Profile Card */}
      {currentRole === ROLES.KASIR && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <User size={28} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-foreground text-lg">{profile?.displayName || 'Kasir'}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Mail size={12} /> {profile?.email}</span>
                <span className="flex items-center gap-1"><Store size={12} /> {kasirStore}</span>
                {myStoreProfile?.address && <span className="flex items-center gap-1"><MapPin size={12} /> {myStoreProfile.address}</span>}
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
              {currentRole}
            </span>
          </div>
        </div>
      )}

      {/* Admin Dashboard Tabs */}
      {showAdminTabs && (
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
          <button onClick={() => setDashTab('overview')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashTab === 'overview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <Store size={14} /> Overview
          </button>
          <button onClick={() => setDashTab('performa')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${dashTab === 'performa' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <BarChart3 size={14} /> Analisis Perputaran Stok
          </button>
          <button onClick={() => setDashTab('audit-hapus')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all relative ${dashTab === 'audit-hapus' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <ShieldAlert size={14} /> Audit Log / Riwayat Hapus
            {deleteLogs.length > 0 && <span className="w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">{deleteLogs.length}</span>}
          </button>
        </div>
      )}

      {/* TAB: Overview (default) */}
      {(dashTab === 'overview' || !showAdminTabs) && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<TrendingUp size={20} />} label="Pendapatan Hari Ini" value={`Rp ${formatNumber(todayRevenue)}`} />
            <StatCard icon={<Package size={20} />} label="Total Produk" value={`${totalBaju} Pcs`} />
            <StatCard icon={<Store size={20} />} label="Stok Toko Aktif" value={`${storeTotal} Pcs`} />
            <StatCard icon={<AlertTriangle size={20} />} label="Stok Rendah" value={`${storeLowCount + storeEmptyCount}`} danger={storeLowCount + storeEmptyCount > 0} />
          </div>

          {/* Low Stock Alert */}
          {(lowStockItems.length > 0 || emptyStockItems.length > 0) && (
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-sm text-foreground">⚠️ Peringatan Stok Menipis!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lowStockItems.length > 0 && <><strong>{lowStockItems.length}</strong> produk stok rendah: {lowStockItems.slice(0, 3).map(p => p.name).join(', ')}{lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} lainnya` : ''}. </>}
                    {emptyStockItems.length > 0 && <><strong>{emptyStockItems.length}</strong> produk stok kosong.</>}
                  </p>
                </div>
              </div>
              <button onClick={() => setView(currentRole === ROLES.KASIR ? 'my-stock-requests' : 'stock-requests')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-warning/20 text-warning text-xs font-bold hover:bg-warning/30 transition-colors">
                <MessageSquare size={14} />
                {currentRole === ROLES.KASIR ? 'Buka Request Stok →' : 'Lihat Request Stok →'}
              </button>
            </div>
          )}

          {/* Stok Toko Section */}
          <div className="rounded-2xl border border-border bg-card">
            <div className="p-5 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-foreground flex items-center gap-2"><Store size={18} className="text-primary" /> Stok Toko</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Update mingguan — Terakhir: <strong>{lastUpdate}</strong></p>
                </div>
                <div className="flex items-center gap-2">
                  {currentRole === ROLES.KASIR ? (
                    <span className="text-xs font-bold text-primary px-3 py-2">{kasirStore}</span>
                  ) : (
                    <select className="input-field text-xs py-2" value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
                      {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Stok</p>
                <p className="text-lg font-extrabold text-foreground">{storeTotal}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Stok Rendah</p>
                <p className="text-lg font-extrabold text-warning">{storeLowCount}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">In Transit</p>
                <p className="text-lg font-extrabold text-primary">{pendingShipments.length}</p>
              </div>
            </div>

            {pendingShipments.length > 0 && (
              <div className="p-4 border-b border-border bg-primary/5">
                <p className="text-xs font-bold text-primary flex items-center gap-1.5 mb-2"><Truck size={14} /> Barang Sedang Dikirim</p>
                <div className="space-y-1.5">
                  {pendingShipments.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-foreground font-medium">[{s.product_sku}] {s.product_name}</span>
                      <span className="text-primary font-bold">{s.qty} pcs</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-border/50">
              {storeStock.map(p => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-xs truncate">{p.sku}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.storeQty === 0 ? 'bg-destructive/10 text-destructive' : p.isLow ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>{p.storeQty}</span>
                    {currentRole !== ROLES.KASIR && <span className="text-[10px] text-muted-foreground">G:{p.gudangQty}</span>}
                  </div>
                </div>
              ))}
              {storeStock.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Belum ada produk.</p>}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Produk</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Stok Toko</th>
                    {currentRole !== ROLES.KASIR && <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Stok Gudang</th>}
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Min</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {storeStock.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3"><p className="font-semibold text-foreground text-xs">{p.sku}</p><p className="text-[11px] text-muted-foreground">{p.name}</p></td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${p.storeQty === 0 ? 'bg-destructive/10 text-destructive' : p.isLow ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>{p.storeQty}</span>
                      </td>
                      {currentRole !== ROLES.KASIR && <td className="px-4 py-3 text-center text-xs text-muted-foreground font-medium">{p.gudangQty}</td>}
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">{p.min_stock}</td>
                      <td className="px-4 py-3 text-center">
                        {p.storeQty === 0 ? <span className="text-[10px] font-bold text-destructive">KOSONG</span>
                          : p.isLow ? <span className="text-[10px] font-bold text-warning">RENDAH</span>
                          : <span className="text-[10px] font-bold text-success flex items-center justify-center gap-1"><CheckCircle2 size={10} /> AMAN</span>}
                      </td>
                    </tr>
                  ))}
                  {storeStock.length === 0 && <tr><td colSpan={currentRole !== ROLES.KASIR ? 5 : 4} className="text-center py-8 text-sm text-muted-foreground">Belum ada produk.</td></tr>}
                </tbody>
              </table>
            </div>

            {(currentRole === ROLES.ADMIN || currentRole === ROLES.GUDANG) && (
              <div className="p-5 border-t border-border">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><ArrowRight size={14} className="text-primary" /> Perlu kirim stok?</p>
                  <button onClick={() => setView('shipping')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors">
                    <Truck size={14} /> Buka Surat Jalan →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SOP */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-bold text-foreground mb-4">SOP Utama Sistem Integrasi</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>✅ <strong>Master Data:</strong> SKU Unik, Kategori, HPP, Harga Jual, Stok Minimal wajib diisi.</p>
              <p>🔗 <strong>Sinkronisasi:</strong> Stok Toko bertambah HANYA jika Kasir klik "Konfirmasi Terima".</p>
              <p>📋 <strong>Opname:</strong> Wajib input "Alasan Selisih". Status menjadi "Menunggu Approval Admin".</p>
              <p>✂️ <strong>Konveksi:</strong> Terapkan tracking Yield & Waste Kain Perca.</p>
              <p>🏪 <strong>Stok Toko:</strong> Update mingguan otomatis dari Gudang melalui Surat Jalan Digital.</p>
            </div>
          </div>
        </>
      )}

      {/* TAB: Analisis Perputaran Stok */}
      {dashTab === 'performa' && showAdminTabs && (
        <div className="space-y-5">
          {/* Period Filter */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-extrabold text-foreground text-base flex items-center gap-2">
              <BarChart3 size={18} className="text-primary" /> Inventory Turnover Analysis
            </h3>
            <select
              className="input-field text-xs py-2 w-auto min-w-[160px]"
              value={analyticsPeriod}
              onChange={e => setAnalyticsPeriod(e.target.value as AnalyticsPeriod)}
            >
              <option value="7d">7 Hari Terakhir</option>
              <option value="30d">30 Hari Terakhir</option>
              <option value="month">Bulan Ini</option>
              <option value="year">Tahun Ini</option>
            </select>
          </div>

          {/* Fast Moving Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
                <Flame size={16} className="text-warning" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-sm">🔥 Top 10 Produk Terlaris (Fast-Moving)</h3>
                <p className="text-[10px] text-muted-foreground">Diurutkan berdasarkan volume penjualan tertinggi</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground w-10">No</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nama Produk + Varian</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Qty Terjual</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total Omzet</th>
                  </tr>
                </thead>
                <tbody>
                  {fastMoving.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">Belum ada data penjualan pada periode ini.</td></tr>
                  )}
                  {fastMoving.map((p, i) => (
                    <tr key={`${p.sku}-${p.variant}-${i}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-[10px] font-extrabold ${i < 3 ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'}`}>
                          {i < 3 ? <Flame size={12} /> : i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground text-xs">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.variant !== '-' ? p.variant : p.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-extrabold">{p.qty}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground text-xs">Rp {formatNumber(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dead Stock / Slow Moving Table */}
          <div className="rounded-2xl border border-destructive/20 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <PackageX size={16} className="text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-sm">⚠️ Produk Kurang Laku / Dead Stock</h3>
                <p className="text-[10px] text-muted-foreground">Varian terjual &lt; 3 pcs pada periode ini, diurutkan berdasarkan sisa stok terbanyak</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground w-10">No</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nama Produk + Varian</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Sisa Stok</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Qty Terjual</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Nilai HPP Tertahan</th>
                  </tr>
                </thead>
                <tbody>
                  {deadStock.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">🎉 Tidak ada dead stock pada periode ini!</td></tr>
                  )}
                  {deadStock.map((d, i) => (
                    <tr key={`${d.sku}-${d.variant}-${i}`} className={`border-b border-border/50 transition-colors ${d.qtySold === 0 ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted/30'}`}>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground font-medium">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground text-xs">{d.name}</p>
                        <p className="text-[10px] text-muted-foreground">{d.variant !== '-' ? d.variant : d.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-extrabold">{d.stock}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold ${d.qtySold === 0 ? 'text-destructive' : 'text-warning'}`}>
                          {d.qtySold === 0 ? '0 ❌' : d.qtySold}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-extrabold text-destructive">Rp {formatNumber(d.hppValue)}</span>
                      </td>
                    </tr>
                  ))}
                  {deadStock.length > 0 && (
                    <tr className="bg-destructive/5 border-t-2 border-destructive/20">
                      <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold text-destructive">Total Modal Tertahan:</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-extrabold text-destructive">Rp {formatNumber(deadStock.reduce((sum, d) => sum + d.hppValue, 0))}</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Audit Log / Riwayat Hapus */}
      {dashTab === 'audit-hapus' && showAdminTabs && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Trash2 size={16} className="text-destructive" /> Riwayat Penghapusan Data (Soft Delete)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Semua data yang dihapus oleh Admin Gudang tercatat di sini untuk transparansi.</p>
            </div>
            <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
              {deleteLogs.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Belum ada data yang dihapus.</p>}
              {deleteLogs.map(log => {
                const date = new Date(log.timestamp);
                return (
                  <div key={log.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-sm text-foreground">{log.material_name}</p>
                        <p className="text-xs text-muted-foreground">Dihapus oleh: <span className="text-primary font-semibold">{log.deleted_by}</span></p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} {date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/10">
                      <p className="text-xs text-destructive font-medium">Alasan: {log.reason}</p>
                    </div>
                    {log.original_data && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Jenis:</span> <span className="font-semibold text-foreground">{log.original_data.type}</span></div>
                        <div><span className="text-muted-foreground">Pabrik:</span> <span className="font-semibold text-foreground">{log.original_data.factory}</span></div>
                        <div><span className="text-muted-foreground">Meter:</span> <span className="font-semibold text-foreground">{log.original_data.meters_total}m</span></div>
                        <div><span className="text-muted-foreground">Nilai:</span> <span className="font-semibold text-foreground">Rp {formatNumber(log.original_data.total_cost || 0)}</span></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
