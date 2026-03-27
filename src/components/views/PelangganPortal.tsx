import { useState, useEffect, useRef, useCallback } from 'react';
import { onSnapshot, query, collection, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  subscribeReceivablesByWa,
  subscribeSalesTransactionsByMember,
  type SalesTransaction,
} from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import type { Product, Receivable } from '@/lib/store';
import { formatNumber } from '@/lib/store';
import html2canvas from 'html2canvas';
import {
  ShoppingBag,
  Receipt,
  Home,
  LogOut,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  X,
  ChevronRight,
  Download,
  Package,
  Star,
  User,
  CreditCard,
  MessageCircle,
} from 'lucide-react';

// ─── Pricing helper ──────────────────────────────────────────────────────────
function getPrice(product: Product, customerType?: string): number {
  switch (customerType) {
    case 'Reseller': return product.price_reseller ?? product.price;
    case 'VVIP 1': return product.price_vvip1 ?? product.price;
    case 'VVIP 2': return product.price_vvip2 ?? product.price;
    default: return product.price;
  }
}

function getTierLabel(customerType?: string): string {
  switch (customerType) {
    case 'Reseller': return 'Harga Reseller';
    case 'VVIP 1': return 'Harga VVIP 1';
    case 'VVIP 2': return 'Harga VVIP 2';
    default: return 'Harga Normal';
  }
}

function getTotalStock(product: Product): number {
  if (!product.stock_map) return 0;
  return Object.values(product.stock_map).reduce((acc, v) => acc + (v || 0), 0);
}

// ─── Payment status badge ─────────────────────────────────────────────────────
function PaymentBadge({ status, isOverdue }: { status: string; isOverdue: boolean }) {
  if (status === 'Lunas') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle2 size={11} /> Lunas
      </span>
    );
  }
  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse">
        <XCircle size={11} /> Jatuh Tempo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
      <Clock size={11} /> Belum Lunas
    </span>
  );
}

// ─── Invoice component (hidden, for html2canvas) ──────────────────────────────
const InvoicePrint = ({ tx, storeName }: { tx: SalesTransaction; storeName: string }) => (
  <div style={{ width: 380, padding: 24, background: '#fff', color: '#111', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
    <div style={{ textAlign: 'center', marginBottom: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{storeName}</div>
      <div style={{ fontSize: 11, color: '#666' }}>Invoice Belanja</div>
      <div style={{ borderTop: '2px dashed #ddd', margin: '8px 0' }} />
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: '#666' }}>No. Transaksi</span>
      <span style={{ fontWeight: 600 }}>{tx.transaction_id}</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: '#666' }}>Kasir</span>
      <span>{tx.cashier_name}</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: '#666' }}>Tanggal</span>
      <span>{new Date(tx.timestamp).toLocaleString('id-ID')}</span>
    </div>
    {tx.member_name && (
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#666' }}>Member</span>
        <span>{tx.member_name}</span>
      </div>
    )}
    <div style={{ borderTop: '2px dashed #ddd', margin: '10px 0' }} />
    {tx.items.map((item, i) => (
      <div key={i} style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 600 }}>{item.name}</div>
        {item.variant_name && <div style={{ color: '#666', fontSize: 11 }}>{item.variant_name}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#666' }}>{item.qty} x Rp {formatNumber(item.price)}</span>
          <span>Rp {formatNumber(item.subtotal)}</span>
        </div>
      </div>
    ))}
    <div style={{ borderTop: '2px dashed #ddd', margin: '10px 0' }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span>Subtotal</span>
      <span>Rp {formatNumber(tx.subtotal)}</span>
    </div>
    {tx.discount > 0 && (
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#e53e3e' }}>
        <span>Diskon</span>
        <span>- Rp {formatNumber(tx.discount)}</span>
      </div>
    )}
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 4, borderTop: '2px solid #111', paddingTop: 8 }}>
      <span>TOTAL</span>
      <span>Rp {formatNumber(tx.grand_total)}</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: '#666' }}>
      <span>Metode Bayar</span>
      <span>{tx.payment_method}</span>
    </div>
    <div style={{ borderTop: '2px dashed #ddd', margin: '12px 0' }} />
    <div style={{ textAlign: 'center', fontSize: 11, color: '#888' }}>
      Terima kasih sudah berbelanja di {storeName}!<br />
      Simpan struk ini sebagai bukti pembayaran.
    </div>
  </div>
);

// ─── Main Portal ──────────────────────────────────────────────────────────────
export default function PelangganPortal() {
  const { user, profile, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'beranda' | 'katalog' | 'transaksi'>('beranda');

  // Data states
  const [products, setProducts] = useState<Product[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [transactions, setTransactions] = useState<SalesTransaction[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);

  // Catalog states
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Notification states
  const [notifications, setNotifications] = useState<{ id: string; message: string }[]>([]);
  const prevReceivablesRef = useRef<Receivable[]>([]);

  // Invoice print states
  const [invoiceTx, setInvoiceTx] = useState<SalesTransaction | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  const wa = profile?.wa || '';
  const memberId = profile?.member_id || '';
  const customerType = profile?.customer_type;

  // ─── Subscribe products (public read) ──────────────────────────────────────
  useEffect(() => {
    setLoadingProducts(true);
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setLoadingProducts(false);
    }, (err) => {
      console.error('products snapshot error:', err);
      setLoadingProducts(false);
    });
    return unsub;
  }, []);

  // ─── Subscribe receivables by WA ───────────────────────────────────────────
  useEffect(() => {
    if (!wa) return;
    const unsub = subscribeReceivablesByWa(wa, (items) => {
      // Detect status changes → "Lunas" = trigger notification
      const prev = prevReceivablesRef.current;
      items.forEach(item => {
        const old = prev.find(p => p.id === item.id);
        if (old && old.status !== 'Lunas' && item.status === 'Lunas') {
          const notifId = `notif-${item.id}-${Date.now()}`;
          setNotifications(n => [...n, {
            id: notifId,
            message: `Pembayaran senilai Rp ${formatNumber(item.total)} telah dikonfirmasi. Terima kasih! ✓`,
          }]);
          // Auto-remove after 8 seconds
          setTimeout(() => {
            setNotifications(n => n.filter(x => x.id !== notifId));
          }, 8000);
        }
      });
      prevReceivablesRef.current = items;
      setReceivables(items);
    });
    return unsub;
  }, [wa]);

  // ─── Subscribe transactions by member_id ───────────────────────────────────
  useEffect(() => {
    if (!memberId) { setLoadingTx(false); return; }
    setLoadingTx(true);
    const unsub = subscribeSalesTransactionsByMember(memberId, (items) => {
      setTransactions(items);
      setLoadingTx(false);
    });
    return unsub;
  }, [memberId]);

  // ─── Download invoice as PNG ───────────────────────────────────────────────
  const handleDownloadInvoice = useCallback(async (tx: SalesTransaction) => {
    setInvoiceTx(tx);
    // Wait for render
    await new Promise(r => setTimeout(r, 200));
    if (!invoiceRef.current) return;
    try {
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `invoice-${tx.transaction_id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Invoice export error:', e);
    } finally {
      setInvoiceTx(null);
    }
  }, []);

  // ─── Overdue receivables ────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueReceivables = receivables.filter(r =>
    r.status !== 'Lunas' && new Date(r.due_date) <= today
  );
  const pendingReceivables = receivables.filter(r => r.status !== 'Lunas');

  // ─── Filtered products ─────────────────────────────────────────────────────
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchProduct.toLowerCase())
  );

  // ─── Confirm payment (open WA) ─────────────────────────────────────────────
  const handleKonfirmasiPembayaran = (r: Receivable) => {
    const sisaHutang = r.total - r.paid;
    const pesan = encodeURIComponent(
      `Halo Admin Dalwa.co,\n\nSaya ingin mengkonfirmasi pembayaran piutang:\n` +
      `• Atas nama: ${r.customer_name}\n` +
      `• Nominal: Rp ${formatNumber(sisaHutang)}\n` +
      `• Jatuh tempo: ${r.due_date}\n\n` +
      `[Sertakan foto bukti transfer di sini]\n\nTerima kasih.`
    );
    window.open(`https://wa.me/622251104621?text=${pesan}`, '_blank');
  };

  const STORE_NAME = 'Dalwa.co';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">

      {/* ─── Notification Toasts ────────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (
          <div
            key={n.id}
            data-testid="notification-toast"
            className="pointer-events-auto flex items-start gap-3 bg-green-600 text-white rounded-2xl px-4 py-3 shadow-2xl max-w-sm animate-in slide-in-from-right-5 fade-in"
          >
            <Bell size={18} className="mt-0.5 shrink-0 animate-bounce" />
            <p className="text-sm font-medium leading-snug">{n.message}</p>
            <button
              onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}
              className="ml-auto shrink-0 hover:opacity-75"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* ─── Hidden invoice for html2canvas ─────────────────────────────────── */}
      <div style={{ position: 'fixed', left: -9999, top: 0, zIndex: -1 }}>
        <div ref={invoiceRef}>
          {invoiceTx && <InvoicePrint tx={invoiceTx} storeName={STORE_NAME} />}
        </div>
      </div>

      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <ShoppingBag size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-foreground leading-none">Dalwa.co</h1>
              <p className="text-[10px] text-muted-foreground">Portal Pelanggan</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingReceivables.length > 0 && (
              <button
                data-testid="button-bell-notification"
                onClick={() => setActiveTab('transaksi')}
                className="relative p-2 rounded-xl hover:bg-muted transition-colors"
                title="Ada tagihan belum lunas"
              >
                <Bell size={18} className="text-warning" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                  {pendingReceivables.length}
                </span>
              </button>
            )}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-muted rounded-xl">
              <User size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{profile?.displayName}</span>
              {customerType && (
                <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-md">{customerType}</span>
              )}
            </div>
            <button
              data-testid="button-logout"
              onClick={logout}
              className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Keluar"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="max-w-4xl mx-auto px-4 pb-0 flex gap-1">
          {[
            { key: 'beranda', label: 'Beranda', icon: Home },
            { key: 'katalog', label: 'Katalog', icon: Package },
            { key: 'transaksi', label: 'Transaksi', icon: Receipt },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              data-testid={`tab-${key}`}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">

        {/* ─── OVERDUE BANNER ──────────────────────────────────────────────── */}
        {overdueReceivables.length > 0 && (
          <div
            data-testid="banner-overdue"
            className="mb-6 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 text-white p-4 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle size={24} className="shrink-0 mt-0.5 animate-bounce" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm mb-1">
                  ⚠ Peringatan: {overdueReceivables.length} Invoice Jatuh Tempo
                </p>
                {overdueReceivables.map(r => (
                  <p key={r.id} className="text-xs opacity-90 mb-1">
                    Nominal: <strong>Rp {formatNumber(r.total - r.paid)}</strong> — Jatuh tempo: {r.due_date}
                  </p>
                ))}
                <p className="text-xs opacity-80 mt-1.5">
                  Harap segera lakukan pelunasan ke rekening BCA <strong>2251104621</strong> untuk menghindari kendala pesanan berikutnya.
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              {overdueReceivables.map(r => (
                <button
                  key={r.id}
                  data-testid={`button-konfirmasi-pembayaran-${r.id}`}
                  onClick={() => handleKonfirmasiPembayaran(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-semibold transition-colors backdrop-blur-sm border border-white/30"
                >
                  <MessageCircle size={13} />
                  Konfirmasi Pembayaran via WA
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BERANDA TAB                                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'beranda' && (
          <div className="space-y-5">
            {/* Welcome card */}
            <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-5 shadow-lg">
              <p className="text-sm opacity-80 mb-0.5">Selamat datang,</p>
              <h2 className="text-xl font-extrabold mb-1">{profile?.displayName} 👋</h2>
              <div className="flex items-center gap-2 mt-2">
                <Star size={13} className="opacity-80" />
                <span className="text-xs opacity-90 font-medium">{getTierLabel(customerType)}</span>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3">
              <div
                data-testid="card-total-transaksi"
                className="rounded-2xl bg-card border border-border p-4 shadow-sm"
              >
                <p className="text-xs text-muted-foreground mb-1">Total Transaksi</p>
                <p className="text-2xl font-extrabold text-foreground">{transactions.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Riwayat pembelian</p>
              </div>
              <div
                data-testid="card-total-belanja"
                className="rounded-2xl bg-card border border-border p-4 shadow-sm"
              >
                <p className="text-xs text-muted-foreground mb-1">Total Belanja</p>
                <p className="text-xl font-extrabold text-foreground">
                  Rp {formatNumber(transactions.reduce((acc, t) => acc + (t.grand_total || 0), 0))}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Kumulatif</p>
              </div>
              <div
                data-testid="card-tagihan-pending"
                className={`rounded-2xl border p-4 shadow-sm ${
                  pendingReceivables.length > 0
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                    : 'bg-card border-border'
                }`}
              >
                <p className="text-xs text-muted-foreground mb-1">Tagihan Belum Lunas</p>
                <p className={`text-2xl font-extrabold ${pendingReceivables.length > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground'}`}>
                  {pendingReceivables.length}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Invoice</p>
              </div>
              <div
                data-testid="card-tagihan-jatuh-tempo"
                className={`rounded-2xl border p-4 shadow-sm ${
                  overdueReceivables.length > 0
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                    : 'bg-card border-border'
                }`}
              >
                <p className="text-xs text-muted-foreground mb-1">Jatuh Tempo</p>
                <p className={`text-2xl font-extrabold ${overdueReceivables.length > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {overdueReceivables.length}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Tagihan</p>
              </div>
            </div>

            {/* Pending receivables summary */}
            {pendingReceivables.length > 0 && (
              <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard size={15} className="text-warning" />
                    <span className="text-sm font-semibold text-foreground">Tagihan Aktif</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('transaksi')}
                    className="text-xs text-primary hover:underline flex items-center gap-0.5"
                  >
                    Lihat semua <ChevronRight size={12} />
                  </button>
                </div>
                <div className="divide-y divide-border">
                  {pendingReceivables.slice(0, 3).map(r => {
                    const isOverdue = new Date(r.due_date) <= today;
                    const sisa = r.total - r.paid;
                    return (
                      <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">Rp {formatNumber(sisa)}</p>
                          <p className="text-xs text-muted-foreground">Tempo: {r.due_date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <PaymentBadge status={r.status} isOverdue={isOverdue} />
                          {isOverdue && (
                            <button
                              onClick={() => handleKonfirmasiPembayaran(r)}
                              className="p-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                              title="Konfirmasi pembayaran via WA"
                            >
                              <MessageCircle size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick access */}
            <div className="grid grid-cols-2 gap-3">
              <button
                data-testid="button-ke-katalog"
                onClick={() => setActiveTab('katalog')}
                className="rounded-2xl bg-primary/10 hover:bg-primary/15 border border-primary/20 p-4 text-left transition-all group"
              >
                <Package size={20} className="text-primary mb-2" />
                <p className="text-sm font-semibold text-foreground">Lihat Katalog</p>
                <p className="text-xs text-muted-foreground">{products.length} produk tersedia</p>
              </button>
              <button
                data-testid="button-ke-transaksi"
                onClick={() => setActiveTab('transaksi')}
                className="rounded-2xl bg-muted hover:bg-muted/80 border border-border p-4 text-left transition-all group"
              >
                <Receipt size={20} className="text-muted-foreground mb-2" />
                <p className="text-sm font-semibold text-foreground">Riwayat Transaksi</p>
                <p className="text-xs text-muted-foreground">{transactions.length} transaksi</p>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* KATALOG TAB                                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'katalog' && (
          <div className="space-y-4">
            {/* Tier price badge */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                <Star size={12} />
                {getTierLabel(customerType)}
              </span>
              <span className="text-xs text-muted-foreground">Harga ditampilkan sesuai tier Anda</span>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                data-testid="input-search-product"
                type="text"
                placeholder="Cari produk..."
                value={searchProduct}
                onChange={e => setSearchProduct(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {searchProduct && (
                <button
                  onClick={() => setSearchProduct('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {loadingProducts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="rounded-2xl bg-muted animate-pulse aspect-[3/4]" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Package size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Produk tidak ditemukan</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredProducts.map(product => {
                  const displayPrice = getPrice(product, customerType);
                  const totalStock = getTotalStock(product);
                  return (
                    <button
                      key={product.id}
                      data-testid={`card-product-${product.id}`}
                      onClick={() => setSelectedProduct(product)}
                      className="rounded-2xl bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all text-left overflow-hidden group"
                    >
                      {/* Product image */}
                      <div className="aspect-square bg-muted relative overflow-hidden">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package size={32} className="text-muted-foreground/30" />
                          </div>
                        )}
                        {totalStock === 0 && (
                          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                            <span className="text-xs font-bold text-muted-foreground">Stok Habis</span>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs text-muted-foreground mb-0.5 truncate">{product.category}</p>
                        <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{product.name}</p>
                        <p className="text-sm font-extrabold text-primary mt-1">Rp {formatNumber(displayPrice)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {totalStock > 0 ? `Stok: ${totalStock} pcs` : 'Stok habis'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TRANSAKSI TAB                                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'transaksi' && (
          <div className="space-y-4">
            {/* Receivables section */}
            {receivables.length > 0 && (
              <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <CreditCard size={15} className="text-warning" />
                  <span className="text-sm font-semibold text-foreground">Piutang & Tagihan</span>
                </div>
                <div className="divide-y divide-border">
                  {receivables.map(r => {
                    const isOverdue = r.status !== 'Lunas' && new Date(r.due_date) <= today;
                    const sisa = r.total - r.paid;
                    return (
                      <div
                        key={r.id}
                        data-testid={`row-receivable-${r.id}`}
                        className={`px-4 py-3 ${isOverdue ? 'bg-red-50 dark:bg-red-900/10' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">Rp {formatNumber(r.total)}</p>
                            {r.paid > 0 && (
                              <p className="text-xs text-muted-foreground">Terbayar: Rp {formatNumber(r.paid)} · Sisa: Rp {formatNumber(sisa)}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {r.items} · Tempo: {r.due_date}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <PaymentBadge status={r.status} isOverdue={isOverdue} />
                            {r.status !== 'Lunas' && (
                              <button
                                data-testid={`button-konfirmasi-wa-${r.id}`}
                                onClick={() => handleKonfirmasiPembayaran(r)}
                                className="text-[11px] text-primary hover:underline flex items-center gap-1"
                              >
                                <MessageCircle size={11} /> Konfirmasi via WA
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Transactions history */}
            <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Receipt size={15} className="text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Riwayat Pembelian</span>
                {!memberId && (
                  <span className="ml-auto text-[11px] text-muted-foreground italic">Member ID belum terhubung</span>
                )}
              </div>

              {loadingTx ? (
                <div className="p-8 text-center text-muted-foreground">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm">Memuat transaksi...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Receipt size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Belum ada riwayat transaksi</p>
                  {!memberId && (
                    <p className="text-xs mt-1 opacity-70">Hubungi Admin untuk menghubungkan akun ke data member</p>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {transactions.map(tx => (
                    <div
                      key={tx.id}
                      data-testid={`row-transaction-${tx.id}`}
                      className="px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-xs font-mono text-primary font-bold">{tx.transaction_id}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' · '}{tx.store}{' · '}{tx.cashier_name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tx.items.length} item · {tx.payment_method}
                          </p>
                          <p className="text-sm font-bold text-foreground mt-1">Rp {formatNumber(tx.grand_total)}</p>
                        </div>
                        <button
                          data-testid={`button-download-invoice-${tx.id}`}
                          onClick={() => handleDownloadInvoice(tx)}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors border border-border"
                        >
                          <Download size={12} />
                          Invoice
                        </button>
                      </div>
                      {/* Items preview */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tx.items.slice(0, 3).map((item, i) => (
                          <span key={i} className="px-2 py-0.5 bg-muted rounded-lg text-[11px] text-muted-foreground">
                            {item.name} ×{item.qty}
                          </span>
                        ))}
                        {tx.items.length > 3 && (
                          <span className="px-2 py-0.5 bg-muted rounded-lg text-[11px] text-muted-foreground">
                            +{tx.items.length - 3} lainnya
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── Product detail modal ─────────────────────────────────────────────── */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setSelectedProduct(null); }}
        >
          <div
            data-testid="modal-product-detail"
            className="bg-card rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
          >
            {/* Product header */}
            <div className="relative">
              {selectedProduct.image_url ? (
                <img
                  src={selectedProduct.image_url}
                  alt={selectedProduct.name}
                  className="w-full aspect-video object-cover rounded-t-3xl"
                />
              ) : (
                <div className="w-full aspect-video bg-muted rounded-t-3xl flex items-center justify-center">
                  <Package size={48} className="text-muted-foreground/30" />
                </div>
              )}
              <button
                data-testid="button-close-product-modal"
                onClick={() => setSelectedProduct(null)}
                className="absolute top-3 right-3 w-8 h-8 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              <span className="text-xs text-muted-foreground">{selectedProduct.category}</span>
              <h3 className="text-lg font-extrabold text-foreground mt-0.5">{selectedProduct.name}</h3>
              <p className="text-xs text-muted-foreground font-mono mb-3">SKU: {selectedProduct.sku}</p>

              {/* Price display */}
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-2xl font-extrabold text-primary">
                  Rp {formatNumber(getPrice(selectedProduct, customerType))}
                </span>
                <span className="text-xs text-muted-foreground px-2 py-0.5 bg-primary/10 rounded-lg">{getTierLabel(customerType)}</span>
              </div>

              {/* Variants with stock */}
              {selectedProduct.variants && selectedProduct.variants.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Varian Tersedia</p>
                  <div className="space-y-1.5">
                    {selectedProduct.variants
                      .filter(v => (v.stock || 0) > 0)
                      .map((variant, i) => (
                        <div
                          key={i}
                          data-testid={`variant-stock-${selectedProduct.id}-${i}`}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/50 border border-border"
                        >
                          <div className="flex items-center gap-2">
                            {variant.warna && (
                              <div
                                className="w-4 h-4 rounded-full border border-border shadow-sm"
                                style={{ background: variant.warna.toLowerCase() }}
                              />
                            )}
                            <span className="text-sm text-foreground font-medium">
                              {variant.warna || variant.name}
                              {variant.size ? ` / ${variant.size}` : ''}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                            Stok: {variant.stock} pcs
                          </span>
                        </div>
                      ))
                    }
                    {selectedProduct.variants.every(v => (v.stock || 0) === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">Semua varian habis</p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Stok per Toko</p>
                  <div className="space-y-1.5">
                    {Object.entries(selectedProduct.stock_map || {})
                      .filter(([, qty]) => qty > 0)
                      .map(([store, qty]) => (
                        <div
                          key={store}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/50 border border-border"
                        >
                          <span className="text-sm text-foreground">{store}</span>
                          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                            Stok: {qty} pcs
                          </span>
                        </div>
                      ))
                    }
                    {Object.values(selectedProduct.stock_map || {}).every(q => q === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">Stok habis di semua toko</p>
                    )}
                  </div>
                </div>
              )}

              {selectedProduct.notes && (
                <p className="mt-4 text-xs text-muted-foreground bg-muted/50 rounded-xl p-3">{selectedProduct.notes}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
