import { useState, useEffect, useMemo } from 'react';
import { useAppState, formatNumber, unformatNumber, ROLES } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import {
  subscribeOperationalExpenses,
  firestoreAddOperationalExpense,
  firestoreDeleteOperationalExpense,
  EXPENSE_CATEGORIES,
  type OperationalExpense,
} from '@/lib/firestore-finance';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  TrendingUp, TrendingDown, Wallet, BarChart3, Plus, Trash2,
  Calendar, ChevronDown, ArrowUpRight, ArrowDownRight, Package,
  CreditCard, AlertTriangle, Loader2, FileText,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type TabType = 'opex' | 'profit-loss' | 'cash-flow';
type PeriodType = 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtRp = (n: number) => `Rp ${formatNumber(Math.abs(Math.round(n)))}`;

function DateRangeFilter({
  period, setPeriod,
  customFrom, setCustomFrom,
  customTo, setCustomTo,
}: {
  period: PeriodType; setPeriod: (p: PeriodType) => void;
  customFrom: string; setCustomFrom: (d: string) => void;
  customTo: string; setCustomTo: (d: string) => void;
}) {
  const options: { value: PeriodType; label: string }[] = [
    { value: 'thisMonth', label: 'Bulan Ini' },
    { value: 'lastMonth', label: 'Bulan Lalu' },
    { value: 'thisYear', label: 'Tahun Ini' },
    { value: 'custom', label: 'Kustom' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map(o => (
        <button
          key={o.value}
          data-testid={`filter-period-${o.value}`}
          onClick={() => setPeriod(o.value)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            period === o.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-muted-foreground border-border hover:border-primary/50'
          }`}
        >
          {o.label}
        </button>
      ))}
      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            data-testid="input-date-from"
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="input-field text-xs py-1.5"
          />
          <span className="text-muted-foreground text-xs">s/d</span>
          <input
            data-testid="input-date-to"
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="input-field text-xs py-1.5"
          />
        </div>
      )}
    </div>
  );
}

// ─── P&L Row Component ────────────────────────────────────────────────────────
function PLRow({ label, value, indent = false, bold = false, highlight, borderTop = false }: {
  label: string; value: number; indent?: boolean; bold?: boolean;
  highlight?: 'green' | 'red' | 'yellow'; borderTop?: boolean;
}) {
  const isNeg = value < 0;
  const textColor = highlight === 'green'
    ? 'text-green-600 dark:text-green-400'
    : highlight === 'red'
    ? 'text-destructive'
    : highlight === 'yellow'
    ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-foreground';

  return (
    <div className={`flex items-center justify-between py-2 px-4 ${indent ? 'pl-8' : ''} ${borderTop ? 'border-t-2 border-border' : ''}`}>
      <span className={`text-sm ${bold ? 'font-bold' : 'text-muted-foreground'} ${textColor}`}>{label}</span>
      <span className={`text-sm font-semibold ${textColor} ${isNeg && !highlight ? 'text-destructive' : ''}`}>
        {isNeg && highlight ? '(' + fmtRp(value) + ')' : fmtRp(value)}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FinancialManagementView() {
  const { salesTransactions, receivables, products, addAuditLog, showMessage, currentRole } = useAppState();
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('profit-loss');
  const [period, setPeriod] = useState<PeriodType>('thisMonth');
  const [customFrom, setCustomFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  // OPEX data
  const [expenses, setExpenses] = useState<OperationalExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);

  // OPEX form
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expForm, setExpForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    category: EXPENSE_CATEGORIES[0] as typeof EXPENSE_CATEGORIES[number],
    amount: '',
    description: '',
  });

  // OPEX filter
  const [filterCategory, setFilterCategory] = useState('Semua');

  useEffect(() => {
    setLoadingExpenses(true);
    const unsub = subscribeOperationalExpenses((data) => {
      setExpenses(data);
      setLoadingExpenses(false);
    });
    return unsub;
  }, []);

  // ─── Date range logic ───────────────────────────────────────────────────────
  const dateRange = useMemo((): { start: string; end: string } => {
    const now = new Date();
    if (period === 'thisMonth') {
      return {
        start: format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'),
        end: format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd'),
      };
    }
    if (period === 'lastMonth') {
      return {
        start: format(new Date(now.getFullYear(), now.getMonth() - 1, 1), 'yyyy-MM-dd'),
        end: format(new Date(now.getFullYear(), now.getMonth(), 0), 'yyyy-MM-dd'),
      };
    }
    if (period === 'thisYear') {
      return {
        start: `${now.getFullYear()}-01-01`,
        end: `${now.getFullYear()}-12-31`,
      };
    }
    return { start: customFrom, end: customTo };
  }, [period, customFrom, customTo]);

  // ─── Filtered data within range ─────────────────────────────────────────────
  const rangedSales = useMemo(() =>
    salesTransactions.filter(tx => {
      if (tx.transaction_type === 'Gift_Owner') return false;
      const d = tx.date || tx.timestamp.split('T')[0];
      return d >= dateRange.start && d <= dateRange.end;
    })
  , [salesTransactions, dateRange]);

  const rangedExpenses = useMemo(() =>
    expenses.filter(e => e.amount > 0 && e.date >= dateRange.start && e.date <= dateRange.end)
  , [expenses, dateRange]);

  // ─── P&L Calculations ───────────────────────────────────────────────────────
  const pendapatan = rangedSales.reduce((acc, tx) => acc + tx.grand_total, 0);
  const hpp = rangedSales.reduce((acc, tx) =>
    acc + (tx.total_hpp ?? tx.items.reduce((a, i) => a + (i.hpp || 0) * i.qty, 0))
  , 0);
  const labaKotor = pendapatan - hpp;

  // OPEX breakdown by category
  const opexByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    rangedExpenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return map;
  }, [rangedExpenses]);
  const totalOpex = Object.values(opexByCategory).reduce((a, b) => a + b, 0);
  const labaBersih = labaKotor - totalOpex;

  // ─── Cash Flow Calculations ─────────────────────────────────────────────────
  // Kas Masuk 1: transaksi tunai (bukan hutang tempo)
  const kasMasukPenjualan = rangedSales
    .filter(tx => tx.payment_method !== 'Hutang Tempo')
    .reduce((acc, tx) => acc + tx.grand_total, 0);

  // Kas Masuk 2: pelunasan piutang (dari receivables yang dalam range)
  const kasMasukPiutang = receivables
    .filter(r => {
      const d = r.timestamp?.split('T')[0] || '';
      return r.paid > 0 && r.status === 'Lunas';
    })
    .reduce((acc, r) => acc + r.paid, 0);

  const totalKasMasuk = kasMasukPenjualan;
  const totalKasKeluar = rangedExpenses.reduce((acc, e) => acc + e.amount, 0);
  const netCashFlow = totalKasMasuk - totalKasKeluar;

  // ─── Asset Summary ──────────────────────────────────────────────────────────
  const totalPiutangBerjalan = receivables
    .filter(r => r.status !== 'Lunas')
    .reduce((acc, r) => acc + (r.total - r.paid), 0);

  const valuasiInventaris = useMemo(() =>
    products.reduce((acc, p) => {
      const totalStock = Object.values(p.stock_map || {}).reduce((s, v) => s + (v || 0), 0);
      return acc + totalStock * (p.hpp || 0);
    }, 0)
  , [products]);

  // ─── OPEX Table Filter ──────────────────────────────────────────────────────
  const displayedExpenses = useMemo(() =>
    expenses.filter(e =>
      filterCategory === 'Semua' || e.category === filterCategory
    )
  , [expenses, filterCategory]);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleAddExpense = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = parseInt(unformatNumber(expForm.amount));
    if (!expForm.description.trim()) { showMessage('Peringatan: Keterangan wajib diisi!'); return; }
    if (!amount || amount <= 0) { showMessage('Peringatan: Nominal harus lebih dari 0!'); return; }
    setSaving(true);
    try {
      await firestoreAddOperationalExpense({
        date: expForm.date,
        category: expForm.category,
        location: 'Pusat',
        amount,
        description: expForm.description.trim(),
        timestamp: new Date().toISOString(),
        created_by: profile?.displayName || 'Admin',
      });
      addAuditLog('Catat OPEX', `${expForm.category}: Rp ${formatNumber(amount)} - ${expForm.description}`);
      showMessage('Berhasil: Pengeluaran dicatat!');
      setExpForm({ date: format(new Date(), 'yyyy-MM-dd'), category: EXPENSE_CATEGORIES[0], amount: '', description: '' });
      setShowForm(false);
    } catch (err: any) {
      showMessage(`Gagal: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Hapus catatan pengeluaran ini?')) return;
    try {
      await firestoreDeleteOperationalExpense(id);
      showMessage('Berhasil: Pengeluaran dihapus.');
    } catch (err: any) {
      showMessage(`Gagal: ${err.message}`);
    }
  };

  const isAdmin = currentRole === ROLES.ADMIN;

  // ─── Render ─────────────────────────────────────────────────────────────────
  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'profit-loss', label: 'Laba Rugi', icon: <BarChart3 size={15} /> },
    { key: 'cash-flow', label: 'Arus Kas', icon: <Wallet size={15} /> },
    { key: 'opex', label: 'Pencatatan OPEX', icon: <FileText size={15} /> },
  ];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ─── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-2xl border border-border w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            data-testid={`tab-${t.key}`}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === t.key
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: LABA RUGI                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'profit-loss' && (
        <div className="space-y-4">
          {/* Period filter */}
          <div className="flex flex-wrap items-center gap-3">
            <DateRangeFilter
              period={period} setPeriod={setPeriod}
              customFrom={customFrom} setCustomFrom={setCustomFrom}
              customTo={customTo} setCustomTo={setCustomTo}
            />
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Pendapatan', value: pendapatan, icon: <TrendingUp size={16} />, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'HPP', value: hpp, icon: <ArrowDownRight size={16} />, color: 'text-orange-500' },
              { label: 'Laba Kotor', value: labaKotor, icon: <BarChart3 size={16} />, color: labaKotor >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive' },
              { label: 'Laba Bersih', value: labaBersih, icon: labaBersih >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />, color: labaBersih >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive' },
            ].map((card) => (
              <div
                key={card.label}
                data-testid={`card-pl-${card.label.toLowerCase().replace(/\s/g, '-')}`}
                className="rounded-2xl bg-card border border-border p-4 shadow-sm"
              >
                <div className={`flex items-center gap-1.5 mb-1 ${card.color}`}>
                  {card.icon}
                  <span className="text-xs font-semibold">{card.label}</span>
                </div>
                <p className={`text-lg font-extrabold ${card.color}`}>{fmtRp(card.value)}</p>
              </div>
            ))}
          </div>

          {/* P&L Statement */}
          <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              <BarChart3 size={16} className="text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">Laporan Laba Rugi</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {dateRange.start} s/d {dateRange.end} · {rangedSales.length} transaksi
              </span>
            </div>

            {/* Revenue */}
            <div className="py-2 px-4 bg-blue-50/50 dark:bg-blue-900/10">
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Pendapatan</p>
            </div>
            <PLRow label="Penjualan Produk" value={pendapatan} indent />
            <div className="border-t border-dashed border-border">
              <PLRow label="TOTAL PENDAPATAN" value={pendapatan} bold />
            </div>

            {/* HPP */}
            <div className="py-2 px-4 bg-orange-50/50 dark:bg-orange-900/10 border-t border-border mt-1">
              <p className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-1">(-) Harga Pokok Penjualan (HPP)</p>
            </div>
            <PLRow label="HPP Barang Terjual" value={hpp} indent />
            <div className="border-t border-dashed border-border">
              <PLRow label="TOTAL HPP" value={hpp} bold />
            </div>

            {/* Gross Profit */}
            <div className="border-t-2 border-border mt-1 bg-muted/20">
              <div className="flex items-center justify-between py-3 px-4">
                <span className="text-sm font-extrabold text-foreground">= LABA KOTOR</span>
                <span className={`text-base font-extrabold ${labaKotor >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  {fmtRp(labaKotor)}
                </span>
              </div>
            </div>

            {/* OPEX */}
            <div className="py-2 px-4 bg-red-50/50 dark:bg-red-900/10 border-t border-border">
              <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-1">(-) Beban Operasional (OPEX)</p>
            </div>
            {EXPENSE_CATEGORIES.map(cat => {
              const val = opexByCategory[cat] || 0;
              if (val === 0) return null;
              return <PLRow key={cat} label={cat} value={val} indent />;
            })}
            {Object.keys(opexByCategory).filter(k => !EXPENSE_CATEGORIES.includes(k as any)).map(cat => {
              const val = opexByCategory[cat] || 0;
              return <PLRow key={cat} label={cat} value={val} indent />;
            })}
            {totalOpex === 0 && (
              <p className="text-xs text-muted-foreground px-8 py-2 italic">Belum ada catatan pengeluaran di periode ini</p>
            )}
            <div className="border-t border-dashed border-border">
              <PLRow label="TOTAL BEBAN OPEX" value={totalOpex} bold />
            </div>

            {/* Net Profit */}
            <div className={`border-t-4 ${labaBersih >= 0 ? 'border-green-500' : 'border-destructive'} mt-1 rounded-b-2xl`}>
              <div className={`flex items-center justify-between py-4 px-4 ${labaBersih >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                <div>
                  <p className="text-base font-extrabold text-foreground">= LABA BERSIH</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {labaBersih >= 0
                      ? `Margin: ${pendapatan > 0 ? ((labaBersih / pendapatan) * 100).toFixed(1) : 0}%`
                      : 'Rugi pada periode ini'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-extrabold ${labaBersih >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                    {labaBersih < 0 ? '-' : ''}{fmtRp(labaBersih)}
                  </p>
                  {labaBersih >= 0
                    ? <TrendingUp size={18} className="ml-auto text-green-500" />
                    : <TrendingDown size={18} className="ml-auto text-destructive" />
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: ARUS KAS                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'cash-flow' && (
        <div className="space-y-4">
          {/* Period filter */}
          <DateRangeFilter
            period={period} setPeriod={setPeriod}
            customFrom={customFrom} setCustomFrom={setCustomFrom}
            customTo={customTo} setCustomTo={setCustomTo}
          />

          {/* Cash flow summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              data-testid="card-kas-masuk"
              className="rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-4 shadow-sm"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpRight size={16} className="text-green-600 dark:text-green-400" />
                <p className="text-xs font-semibold text-green-600 dark:text-green-400">Total Kas Masuk</p>
              </div>
              <p className="text-xl font-extrabold text-green-700 dark:text-green-300">{fmtRp(totalKasMasuk)}</p>
            </div>
            <div
              data-testid="card-kas-keluar"
              className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-4 shadow-sm"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDownRight size={16} className="text-destructive" />
                <p className="text-xs font-semibold text-destructive">Total Kas Keluar</p>
              </div>
              <p className="text-xl font-extrabold text-destructive">{fmtRp(totalKasKeluar)}</p>
            </div>
            <div
              data-testid="card-net-cashflow"
              className={`rounded-2xl border p-4 shadow-sm ${netCashFlow >= 0
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
                : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet size={16} className={netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-500'} />
                <p className={`text-xs font-semibold ${netCashFlow >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-500'}`}>Posisi Kas Bersih</p>
              </div>
              <p className={`text-xl font-extrabold ${netCashFlow >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-orange-600'}`}>
                {netCashFlow < 0 ? '-' : ''}{fmtRp(netCashFlow)}
              </p>
            </div>
          </div>

          {/* Cash flow detail */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Kas Masuk Detail */}
            <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-green-50/50 dark:bg-green-900/10 flex items-center gap-2">
                <ArrowUpRight size={15} className="text-green-600" />
                <span className="text-sm font-bold text-foreground">Kas Masuk</span>
              </div>
              <div className="divide-y divide-border">
                <div className="flex justify-between items-center px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Penjualan Tunai/Transfer</p>
                    <p className="text-xs text-muted-foreground">Transaksi non-Hutang Tempo · {rangedSales.filter(tx => tx.payment_method !== 'Hutang Tempo').length} struk</p>
                  </div>
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">{fmtRp(kasMasukPenjualan)}</p>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Penjualan Piutang</p>
                    <p className="text-xs text-muted-foreground">Transaksi Hutang Tempo · {rangedSales.filter(tx => tx.payment_method === 'Hutang Tempo').length} struk</p>
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">{fmtRp(rangedSales.filter(tx => tx.payment_method === 'Hutang Tempo').reduce((a, tx) => a + tx.grand_total, 0))}</p>
                </div>
                <div className="flex justify-between items-center px-4 py-3 bg-green-50/30 dark:bg-green-900/10">
                  <p className="text-sm font-bold text-foreground">TOTAL KAS MASUK</p>
                  <p className="text-sm font-extrabold text-green-600 dark:text-green-400">{fmtRp(totalKasMasuk)}</p>
                </div>
              </div>
            </div>

            {/* Kas Keluar Detail */}
            <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-red-50/50 dark:bg-red-900/10 flex items-center gap-2">
                <ArrowDownRight size={15} className="text-destructive" />
                <span className="text-sm font-bold text-foreground">Kas Keluar</span>
              </div>
              <div className="divide-y divide-border">
                {EXPENSE_CATEGORIES.map(cat => {
                  const val = rangedExpenses.filter(e => e.category === cat).reduce((a, e) => a + e.amount, 0);
                  if (val === 0) return null;
                  return (
                    <div key={cat} className="flex justify-between items-center px-4 py-2.5">
                      <p className="text-sm text-muted-foreground">{cat}</p>
                      <p className="text-sm font-semibold text-foreground">{fmtRp(val)}</p>
                    </div>
                  );
                })}
                {totalKasKeluar === 0 && (
                  <p className="text-xs text-muted-foreground px-4 py-4 text-center italic">Belum ada pengeluaran di periode ini</p>
                )}
                <div className="flex justify-between items-center px-4 py-3 bg-red-50/30 dark:bg-red-900/10">
                  <p className="text-sm font-bold text-foreground">TOTAL KAS KELUAR</p>
                  <p className="text-sm font-extrabold text-destructive">{fmtRp(totalKasKeluar)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Asset Summary ────────────────────────────────────────────────── */}
          <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Package size={16} className="text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">Ringkasan Aset Perusahaan</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {/* Total Piutang */}
              <div
                data-testid="widget-total-piutang"
                className="p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard size={16} className={totalPiutangBerjalan > 0 ? 'text-warning' : 'text-muted-foreground'} />
                  <p className="text-xs font-semibold text-muted-foreground">Total Piutang Berjalan</p>
                </div>
                <p className={`text-xl font-extrabold ${totalPiutangBerjalan > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground'}`}>
                  {fmtRp(totalPiutangBerjalan)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {receivables.filter(r => r.status !== 'Lunas').length} tagihan belum lunas
                </p>
                {receivables.filter(r => r.status !== 'Lunas' && new Date(r.due_date) <= new Date()).length > 0 && (
                  <p className="text-[11px] text-destructive mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {receivables.filter(r => r.status !== 'Lunas' && new Date(r.due_date) <= new Date()).length} jatuh tempo
                  </p>
                )}
              </div>

              {/* Valuasi Inventaris */}
              <div
                data-testid="widget-valuasi-inventaris"
                className="p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Package size={16} className="text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground">Nilai Aset Barang (HPP)</p>
                </div>
                <p className="text-xl font-extrabold text-primary">{fmtRp(valuasiInventaris)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {products.length} SKU produk aktif
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {products.reduce((acc, p) => acc + Object.values(p.stock_map || {}).reduce((s, v) => s + (v || 0), 0), 0).toLocaleString('id-ID')} pcs total stok
                </p>
              </div>

              {/* Total Aset */}
              <div
                data-testid="widget-total-aset"
                className="p-5 bg-primary/5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground">Estimasi Total Aset</p>
                </div>
                <p className="text-xl font-extrabold text-foreground">{fmtRp(valuasiInventaris + totalPiutangBerjalan)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Inventaris + Piutang</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: OPEX                                                              */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'opex' && (
        <div className="space-y-4">
          {/* Header actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                data-testid="filter-opex-category"
                className="input-field text-sm py-2"
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
              >
                <option value="Semua">Semua Kategori</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {isAdmin && (
              <button
                data-testid="button-tambah-opex"
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <Plus size={16} />
                Catat Pengeluaran
              </button>
            )}
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {EXPENSE_CATEGORIES.map(cat => {
              const total = expenses.filter(e => e.category === cat && e.amount > 0).reduce((a, e) => a + e.amount, 0);
              return (
                <div key={cat} className="rounded-2xl bg-card border border-border p-3 shadow-sm">
                  <p className="text-[10px] text-muted-foreground font-medium truncate mb-0.5">{cat}</p>
                  <p className="text-sm font-extrabold text-foreground">{fmtRp(total)}</p>
                </div>
              );
            })}
          </div>

          {/* Add form */}
          {showForm && (
            <form
              onSubmit={handleAddExpense}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <h3 className="text-sm font-bold text-foreground mb-4">Catat Pengeluaran Baru</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Tanggal</label>
                  <input
                    data-testid="input-opex-date"
                    type="date"
                    className="input-field mt-1"
                    value={expForm.date}
                    onChange={e => setExpForm({ ...expForm, date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
                  <select
                    data-testid="input-opex-category"
                    className="input-field mt-1"
                    value={expForm.category}
                    onChange={e => setExpForm({ ...expForm, category: e.target.value as any })}
                  >
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Nominal (Rp)</label>
                  <input
                    data-testid="input-opex-amount"
                    className="input-field mt-1"
                    placeholder="500.000"
                    value={expForm.amount ? formatNumber(expForm.amount) : ''}
                    onChange={e => setExpForm({ ...expForm, amount: unformatNumber(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Keterangan</label>
                  <input
                    data-testid="input-opex-description"
                    className="input-field mt-1"
                    placeholder="Gaji Kasir Bulan Ini"
                    value={expForm.description}
                    onChange={e => setExpForm({ ...expForm, description: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  type="submit"
                  data-testid="button-simpan-opex"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Simpan
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-bold hover:bg-muted/80"
                >
                  Batal
                </button>
              </div>
            </form>
          )}

          {/* Expenses table */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              <FileText size={15} className="text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">Riwayat Pengeluaran</span>
              <span className="ml-auto text-xs text-muted-foreground">{displayedExpenses.length} entri</span>
            </div>
            {loadingExpenses ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : displayedExpenses.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <FileText size={36} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Belum ada catatan pengeluaran</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Tanggal</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Kategori</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Keterangan</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Nominal</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Dicatat Oleh</th>
                      {isAdmin && <th className="px-4 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayedExpenses.map(exp => (
                      <tr
                        key={exp.id}
                        data-testid={`row-opex-${exp.id}`}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(exp.date + 'T00:00:00'), 'dd MMM yyyy', { locale: idLocale })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-muted rounded-lg text-xs font-medium text-foreground">
                            {exp.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">{exp.description}</td>
                        <td className="px-4 py-3 text-sm font-bold text-foreground text-right whitespace-nowrap">
                          {exp.amount < 0
                            ? <span className="text-green-600">+{fmtRp(exp.amount)}</span>
                            : fmtRp(exp.amount)
                          }
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{exp.created_by}</td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <button
                              data-testid={`button-delete-opex-${exp.id}`}
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20">
                      <td colSpan={3} className="px-4 py-3 text-sm font-bold text-foreground">TOTAL</td>
                      <td className="px-4 py-3 text-sm font-extrabold text-foreground text-right">
                        {fmtRp(displayedExpenses.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0))}
                      </td>
                      <td colSpan={isAdmin ? 2 : 1} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
