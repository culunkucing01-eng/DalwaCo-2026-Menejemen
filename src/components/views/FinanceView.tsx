import { useState, useMemo, useRef } from 'react';
import { useAppState, formatNumber, STORES } from '@/lib/store';
import { subscribeStockRequests, type StockRequest } from '@/lib/firestore';
import { useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Package, Receipt, Wallet,
  ArrowUpRight, ArrowDownRight, Calendar, Store, Truck,
  CheckCircle2, Clock, XCircle, BarChart3, Gift, FileDown
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

type PeriodType = 'today' | 'last30' | 'lastMonth' | 'custom';
type TabType = 'penjualan' | 'request-stok' | 'keuangan' | 'gift-owner';

export default function FinanceView() {
  const { products, materials, auditLogs, receivables, convectionLogs, salesTransactions } = useAppState();
  const [selectedStore, setSelectedStore] = useState('Semua');
  const [activeTab, setActiveTab] = useState<TabType>('penjualan');
  const [stockRequests, setStockRequests] = useState<StockRequest[]>([]);
  const [period, setPeriod] = useState<PeriodType>('today');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  useEffect(() => {
    const unsub = subscribeStockRequests(setStockRequests);
    return unsub;
  }, []);

  const periodLabels: Record<PeriodType, string> = {
    today: 'Hari Ini',
    last30: '30 Hari Terakhir',
    lastMonth: 'Bulan Lalu',
    custom: customFrom && customTo ? `${format(customFrom, 'dd MMM', { locale: idLocale })} - ${format(customTo, 'dd MMM yyyy', { locale: idLocale })}` : 'Pilih Tanggal',
  };

  const getDateRange = (): { start: Date; end: Date } => {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    if (period === 'today') {
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: endOfDay };
    }
    if (period === 'last30') {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return { start: d, end: endOfDay };
    }
    if (period === 'lastMonth') {
      const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLast = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start: firstOfLast, end: lastOfLast };
    }
    // custom
    return {
      start: customFrom || new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      end: customTo ? new Date(customTo.getFullYear(), customTo.getMonth(), customTo.getDate(), 23, 59, 59) : endOfDay,
    };
  };

  // --- Sales Data from salesTransactions ---
  const filteredSales = useMemo(() => {
    const { start, end } = getDateRange();
    return salesTransactions.filter(tx => {
      if (tx.transaction_type === 'Gift_Owner') return false;
      const txDate = new Date(tx.timestamp);
      if (txDate < start || txDate > end) return false;
      if (selectedStore !== 'Semua' && tx.store !== selectedStore) return false;
      return true;
    });
  }, [salesTransactions, period, selectedStore, customFrom, customTo]);

  const filteredGifts = useMemo(() => {
    const { start, end } = getDateRange();
    return salesTransactions.filter(tx => {
      if (tx.transaction_type !== 'Gift_Owner') return false;
      const txDate = new Date(tx.timestamp);
      if (txDate < start || txDate > end) return false;
      if (selectedStore !== 'Semua' && tx.store !== selectedStore) return false;
      return true;
    });
  }, [salesTransactions, period, selectedStore, customFrom, customTo]);

  const totalGiftHpp = filteredGifts.reduce((acc, tx) => acc + (tx.total_hpp || 0), 0);
  const totalIncome = filteredSales.reduce((acc, tx) => acc + tx.grand_total, 0);
  const totalTxCount = filteredSales.length;

  const storeBreakdown = useMemo(() => {
    return STORES.map(store => {
      const storeTx = filteredSales.filter(tx => tx.store === store);
      return {
        store,
        income: storeTx.reduce((acc, tx) => acc + tx.grand_total, 0),
        txCount: storeTx.length,
        avgTicket: storeTx.length > 0 ? Math.round(storeTx.reduce((acc, tx) => acc + tx.grand_total, 0) / storeTx.length) : 0,
      };
    });
  }, [filteredSales]);

  const totalExpenses = useMemo(() => {
    const { start, end } = getDateRange();
    const materialCosts = materials.filter(m => { const d = new Date(m.timestamp); return d >= start && d <= end; })
      .reduce((acc, m) => acc + m.total_cost, 0);
    const convCosts = convectionLogs.filter(c => { const d = new Date(c.timestamp); return d >= start && d <= end && c.status === 'Selesai'; })
      .reduce((acc, c) => acc + (c.convection_cost || 0), 0);
    return materialCosts + convCosts;
  }, [materials, convectionLogs, period, customFrom, customTo]);

  const netCashFlow = totalIncome - totalExpenses;
  const totalPiutang = receivables.filter(r => r.status !== 'Lunas').reduce((acc, r) => acc + (r.total - r.paid), 0);
  const totalHPP = products.reduce((acc, p) => acc + p.hpp * Object.values(p.stock_map).reduce((a, b) => a + b, 0), 0);
  const totalKainValue = materials.reduce((acc, m) => acc + m.total_cost, 0);
  const hutangItems = materials.filter(m => m.status === 'Hutang');
  const totalHutang = hutangItems.reduce((acc, m) => acc + m.total_cost, 0);
  const totalConvectionCost = convectionLogs.filter(c => c.status === 'Selesai').reduce((acc, c) => acc + (c.convection_cost || 0), 0);

  const filteredRequests = useMemo(() => {
    const { start, end } = getDateRange();
    return stockRequests.filter(r => {
      const rDate = new Date(r.timestamp);
      if (rDate < start || rDate > end) return false;
      if (selectedStore !== 'Semua' && r.store !== selectedStore) return false;
      return true;
    });
  }, [stockRequests, period, selectedStore, customFrom, customTo]);

  const requestStats = useMemo(() => ({
    total: filteredRequests.length,
    pending: filteredRequests.filter(r => r.status === 'Pending').length,
    diproses: filteredRequests.filter(r => r.status === 'Diproses').length,
    selesai: filteredRequests.filter(r => r.status === 'Selesai').length,
    ditolak: filteredRequests.filter(r => r.status === 'Ditolak').length,
  }), [filteredRequests]);

  const topProducts = useMemo(() => {
    const productMap = new Map<string, { name: string; sku: string; qty: number; revenue: number }>();
    filteredSales.forEach(tx => {
      tx.items.forEach(item => {
        const existing = productMap.get(item.sku) || { name: item.name, sku: item.sku, qty: 0, revenue: 0 };
        existing.qty += item.qty;
        existing.revenue += item.subtotal;
        productMap.set(item.sku, existing);
      });
    });
    return Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [filteredSales]);

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'penjualan', label: 'Laporan Penjualan', icon: <BarChart3 size={14} /> },
    { key: 'gift-owner', label: 'Gift / Owner', icon: <Gift size={14} /> },
    { key: 'request-stok', label: 'Request Stok', icon: <Truck size={14} /> },
    { key: 'keuangan', label: 'Arus Keuangan', icon: <Wallet size={14} /> },
  ];

  // --- Export PDF ---
  const handleExportPDF = () => {
    const { start, end } = getDateRange();
    const periodStr = periodLabels[period];
    const storeStr = selectedStore === 'Semua' ? 'Semua Toko' : selectedStore;

    let tableContent = '';
    if (activeTab === 'penjualan') {
      const rows = filteredSales.slice(0, 200).map((tx, i) => `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${tx.transaction_id}</td>
          <td>${tx.store}</td>
          <td>${tx.items.map(it => `${it.name} x${it.qty}`).join(', ')}</td>
          <td>${tx.payment_method}</td>
          <td style="text-align:right;">Rp ${formatNumber(tx.grand_total)}</td>
          <td>${new Date(tx.timestamp).toLocaleDateString('id-ID')}</td>
        </tr>`).join('');
      tableContent = `
        <h3>Laporan Penjualan</h3>
        <div class="summary-grid">
          <div class="summary-card"><div class="label">Total Penjualan</div><div class="value">Rp ${formatNumber(totalIncome)}</div></div>
          <div class="summary-card"><div class="label">Jumlah Transaksi</div><div class="value">${totalTxCount}</div></div>
          <div class="summary-card"><div class="label">Rata-rata</div><div class="value">Rp ${formatNumber(totalTxCount > 0 ? Math.round(totalIncome / totalTxCount) : 0)}</div></div>
          <div class="summary-card"><div class="label">Piutang</div><div class="value">Rp ${formatNumber(totalPiutang)}</div></div>
        </div>
        <table><thead><tr><th>#</th><th>ID Transaksi</th><th>Toko</th><th>Item</th><th>Metode</th><th style="text-align:right;">Total</th><th>Tanggal</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="5" style="text-align:right;font-weight:700;">TOTAL</td><td style="text-align:right;font-weight:700;">Rp ${formatNumber(totalIncome)}</td><td></td></tr></tfoot></table>`;
    } else if (activeTab === 'keuangan') {
      tableContent = `
        <h3>Arus Keuangan</h3>
        <div class="summary-grid">
          <div class="summary-card"><div class="label">Pemasukan</div><div class="value" style="color:#16a34a;">Rp ${formatNumber(totalIncome)}</div></div>
          <div class="summary-card"><div class="label">Pengeluaran</div><div class="value" style="color:#dc2626;">Rp ${formatNumber(totalExpenses)}</div></div>
          <div class="summary-card"><div class="label">Arus Kas Bersih</div><div class="value">${netCashFlow >= 0 ? '+' : '-'}Rp ${formatNumber(Math.abs(netCashFlow))}</div></div>
          <div class="summary-card"><div class="label">Piutang</div><div class="value">Rp ${formatNumber(totalPiutang)}</div></div>
        </div>
        <table><thead><tr><th>Kategori</th><th style="text-align:right;">Nilai</th></tr></thead><tbody>
          <tr><td>Nilai Inventori (HPP)</td><td style="text-align:right;">Rp ${formatNumber(totalHPP)}</td></tr>
          <tr><td>Nilai Bahan Baku</td><td style="text-align:right;">Rp ${formatNumber(totalKainValue)}</td></tr>
          <tr><td>Biaya Konveksi</td><td style="text-align:right;">Rp ${formatNumber(totalConvectionCost)}</td></tr>
          <tr><td>Hutang Supplier</td><td style="text-align:right;">Rp ${formatNumber(totalHutang)}</td></tr>
        </tbody></table>`;
    } else {
      tableContent = `<p>Export PDF hanya tersedia untuk tab Laporan Penjualan dan Arus Keuangan.</p>`;
    }

    const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Laporan Keuangan DALWA.CO</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a1a; background: #fff; padding: 24px; }
      .report { max-width: 900px; margin: 0 auto; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a3a; padding-bottom: 16px; margin-bottom: 20px; }
      .brand h1 { font-size: 28px; font-weight: 800; color: #1a3a3a; }
      .brand p { font-size: 11px; color: #666; margin-top: 2px; }
      .report-info { text-align: right; }
      .report-info h2 { font-size: 14px; color: #1a3a3a; text-transform: uppercase; letter-spacing: 1px; }
      .report-info .date { font-size: 12px; color: #555; margin-top: 4px; }
      h3 { font-size: 16px; color: #1a3a3a; margin-bottom: 12px; }
      .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
      .summary-card { background: #f7f9f9; border: 1px solid #e2e8e8; border-radius: 8px; padding: 14px; text-align: center; }
      .summary-card .label { font-size: 10px; text-transform: uppercase; color: #888; margin-bottom: 4px; }
      .summary-card .value { font-size: 18px; font-weight: 800; color: #1a3a3a; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
      thead th { background: #1a3a3a; color: #fff; padding: 8px 6px; font-size: 10px; text-transform: uppercase; text-align: left; }
      tbody td { padding: 7px 6px; border-bottom: 1px solid #eee; }
      tfoot td { padding: 8px 6px; border-top: 2px solid #1a3a3a; }
      .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8e8; text-align: center; font-size: 10px; color: #999; }
      @media print { body { padding: 10px; } .no-print { display: none !important; } }
    </style></head><body>
    <div class="report">
      <div class="header">
        <div class="brand"><h1>DALWA.CO</h1><p>Laporan Keuangan Terpadu</p></div>
        <div class="report-info">
          <h2>📊 Laporan Keuangan</h2>
          <div class="date">Periode: ${periodStr}</div>
          <div class="date">Toko: ${storeStr}</div>
          <div class="date">Dicetak: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}</div>
        </div>
      </div>
      ${tableContent}
      <div class="footer"><p>Dokumen ini dicetak secara otomatis oleh Sistem DALWA.CO</p></div>
    </div>
    <div class="no-print" style="text-align:center;margin-top:24px;">
      <button onclick="window.print()" style="padding:12px 36px;background:#1a3a3a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">🖨️ Cetak / Simpan PDF</button>
    </div></body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Dashboard Laporan</h2>
        <div className="flex flex-wrap gap-2 items-center">
          {(activeTab === 'penjualan' || activeTab === 'keuangan') && (
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5">
              <FileDown size={14} /> Export PDF
            </Button>
          )}
          <select className="input-field text-xs py-1.5 w-auto" value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
            <option value="Semua">Semua Toko</option>
            {STORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="flex flex-wrap gap-2 items-center">
        {(['today', 'last30', 'lastMonth'] as PeriodType[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${period === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {periodLabels[p]}
          </button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={period === 'custom' ? 'default' : 'outline'} size="sm" className="gap-1.5 text-xs" onClick={() => setPeriod('custom')}>
              <Calendar size={14} />
              {period === 'custom' && customFrom && customTo
                ? `${format(customFrom, 'dd/MM')} - ${format(customTo, 'dd/MM/yy')}`
                : 'Pilih Tanggal'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Dari Tanggal</p>
                <CalendarComponent mode="single" selected={customFrom} onSelect={(d) => { setCustomFrom(d); setPeriod('custom'); }} className={cn("p-3 pointer-events-auto")} />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Sampai Tanggal</p>
                <CalendarComponent mode="single" selected={customTo} onSelect={(d) => { setCustomTo(d); setPeriod('custom'); }} className={cn("p-3 pointer-events-auto")} />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Laporan Penjualan */}
      {activeTab === 'penjualan' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center"><ArrowUpRight size={20} className="text-success" /></div></div>
              <p className="text-xs text-muted-foreground">Total Penjualan</p>
              <p className="text-xl font-extrabold text-success mt-1">Rp {formatNumber(totalIncome)}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Receipt size={20} className="text-primary" /></div></div>
              <p className="text-xs text-muted-foreground">Jumlah Transaksi</p>
              <p className="text-xl font-extrabold text-foreground mt-1">{totalTxCount}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-secondary/30 flex items-center justify-center"><BarChart3 size={20} className="text-foreground" /></div></div>
              <p className="text-xs text-muted-foreground">Rata-rata Transaksi</p>
              <p className="text-xl font-extrabold text-foreground mt-1">Rp {formatNumber(totalTxCount > 0 ? Math.round(totalIncome / totalTxCount) : 0)}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center"><Wallet size={20} className="text-warning" /></div></div>
              <p className="text-xs text-muted-foreground">Piutang Belum Lunas</p>
              <p className="text-xl font-extrabold text-warning mt-1">Rp {formatNumber(totalPiutang)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2"><Store size={16} className="text-primary" /> Pendapatan Per Toko ({periodLabels[period]})</h3>
            </div>
            <div className="divide-y divide-border/50">
              {storeBreakdown.map(s => (
                <div key={s.store} className="px-5 py-3 flex items-center justify-between">
                  <div><p className="font-semibold text-sm text-foreground">{s.store}</p><p className="text-[10px] text-muted-foreground">{s.txCount} transaksi • Avg: Rp {formatNumber(s.avgTicket)}</p></div>
                  <p className="font-bold text-sm text-foreground">Rp {formatNumber(s.income)}</p>
                </div>
              ))}
            </div>
          </div>

          {topProducts.length > 0 && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="px-5 py-4 border-b border-border"><h3 className="font-bold text-foreground flex items-center gap-2"><Package size={16} className="text-primary" /> Produk Terlaris</h3></div>
              <div className="divide-y divide-border/50">
                {topProducts.map((p, i) => (
                  <div key={p.sku} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      <div><p className="font-semibold text-xs text-foreground">{p.name}</p><p className="text-[10px] text-muted-foreground">{p.sku} • {p.qty} terjual</p></div>
                    </div>
                    <p className="font-bold text-xs text-foreground">Rp {formatNumber(p.revenue)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-bold text-foreground">Riwayat Transaksi Terbaru</h3></div>
            <div className="divide-y divide-border/50 max-h-96 overflow-y-auto">
              {filteredSales.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Belum ada transaksi pada periode ini.</p>}
              {filteredSales.slice(0, 50).map(tx => (
                <div key={tx.id} className="px-5 py-3 flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${tx.payment_method === 'Hutang Tempo' ? 'bg-warning' : 'bg-success'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{tx.transaction_id}</p>
                    <p className="text-xs text-muted-foreground truncate">{tx.store} • {tx.items.map(i => `${i.name} x${i.qty}`).join(', ')}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{tx.cashier_name} • {new Date(tx.timestamp).toLocaleString('id-ID')}</p>
                  </div>
                  <span className={`font-bold text-sm shrink-0 ${tx.payment_method === 'Hutang Tempo' ? 'text-warning' : 'text-success'}`}>
                    Rp {formatNumber(tx.grand_total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Request Stok */}
      {activeTab === 'request-stok' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="stat-card"><p className="text-xs text-muted-foreground">Total Request</p><p className="text-xl font-extrabold text-foreground mt-1">{requestStats.total}</p></div>
            <div className="stat-card"><p className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={12} className="text-warning" /> Pending</p><p className="text-xl font-extrabold text-warning mt-1">{requestStats.pending}</p></div>
            <div className="stat-card"><p className="text-xs text-muted-foreground flex items-center gap-1"><Truck size={12} className="text-primary" /> Diproses</p><p className="text-xl font-extrabold text-primary mt-1">{requestStats.diproses}</p></div>
            <div className="stat-card"><p className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 size={12} className="text-success" /> Selesai</p><p className="text-xl font-extrabold text-success mt-1">{requestStats.selesai}</p></div>
            <div className="stat-card"><p className="text-xs text-muted-foreground flex items-center gap-1"><XCircle size={12} className="text-destructive" /> Ditolak</p><p className="text-xl font-extrabold text-destructive mt-1">{requestStats.ditolak}</p></div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-bold text-foreground">Daftar Request Stok ({periodLabels[period]})</h3></div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Produk</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Toko</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Peminta</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Jumlah</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Tidak ada request pada periode ini.</td></tr>}
                  {filteredRequests.map(r => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3"><p className="font-semibold text-foreground text-xs">{r.product_sku}</p><p className="text-[11px] text-muted-foreground">{r.product_name}</p></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.store}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.requester_name}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-foreground">{r.qty}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'Pending' ? 'bg-warning/10 text-warning' : r.status === 'Diproses' ? 'bg-primary/10 text-primary' : r.status === 'Selesai' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.timestamp).toLocaleDateString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Gift / Owner */}
      {activeTab === 'gift-owner' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><Gift size={20} className="text-destructive" /></div></div>
              <p className="text-xs text-muted-foreground">Total Pengeluaran Gift</p>
              <p className="text-xl font-extrabold text-destructive mt-1">{filteredGifts.length} transaksi</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center"><Package size={20} className="text-warning" /></div></div>
              <p className="text-xs text-muted-foreground">Total Modal (HPP) Terpakai</p>
              <p className="text-xl font-extrabold text-warning mt-1">Rp {formatNumber(totalGiftHpp)}</p>
            </div>
            <div className="stat-card col-span-2 lg:col-span-1">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"><Receipt size={20} className="text-muted-foreground" /></div></div>
              <p className="text-xs text-muted-foreground">Total Item Keluar</p>
              <p className="text-xl font-extrabold text-foreground mt-1">{filteredGifts.reduce((acc, tx) => acc + tx.items.reduce((a, i) => a + i.qty, 0), 0)} pcs</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-bold text-foreground flex items-center gap-2"><Gift size={16} className="text-destructive" /> Riwayat Barang Keluar Gift / Owner ({periodLabels[period]})</h3></div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tanggal</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Lokasi Toko</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nama Barang</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Keterangan Penerima</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total HPP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGifts.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Belum ada pengeluaran gift pada periode ini.</td></tr>}
                  {filteredGifts.map(tx => (
                    <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(tx.timestamp).toLocaleDateString('id-ID')}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{tx.store}</td>
                      <td className="px-4 py-3 text-xs text-foreground">{tx.items.map(i => `${i.name} x${i.qty}`).join(', ')}</td>
                      <td className="px-4 py-3 text-xs text-primary font-medium">{tx.gift_note || '-'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-warning text-right">Rp {formatNumber(tx.total_hpp || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20 text-xs text-destructive font-medium">
            ⚠️ Data Gift/Owner <strong>tidak dihitung</strong> sebagai pemasukan/omzet di Laporan Penjualan maupun Arus Keuangan.
          </div>
        </div>
      )}

      {/* TAB: Arus Keuangan */}
      {activeTab === 'keuangan' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center"><ArrowUpRight size={20} className="text-success" /></div></div>
              <p className="text-xs text-muted-foreground">Pemasukan ({periodLabels[period]})</p>
              <p className="text-xl font-extrabold text-success mt-1">Rp {formatNumber(totalIncome)}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><ArrowDownRight size={20} className="text-destructive" /></div></div>
              <p className="text-xs text-muted-foreground">Pengeluaran ({periodLabels[period]})</p>
              <p className="text-xl font-extrabold text-destructive mt-1">Rp {formatNumber(totalExpenses)}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${netCashFlow >= 0 ? 'bg-success/10' : 'bg-destructive/10'}`}>{netCashFlow >= 0 ? <TrendingUp size={20} className="text-success" /> : <TrendingDown size={20} className="text-destructive" />}</div></div>
              <p className="text-xs text-muted-foreground">Arus Kas Bersih</p>
              <p className={`text-xl font-extrabold mt-1 ${netCashFlow >= 0 ? 'text-success' : 'text-destructive'}`}>{netCashFlow >= 0 ? '+' : '-'}Rp {formatNumber(Math.abs(netCashFlow))}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center"><Wallet size={20} className="text-warning" /></div></div>
              <p className="text-xs text-muted-foreground">Piutang Belum Lunas</p>
              <p className="text-xl font-extrabold text-warning mt-1">Rp {formatNumber(totalPiutang)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Package size={20} className="text-primary" /></div></div>
              <p className="text-xs text-muted-foreground">Nilai Inventori (HPP)</p>
              <p className="text-xl font-extrabold text-foreground mt-1">Rp {formatNumber(totalHPP)}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-secondary/30 flex items-center justify-center"><Receipt size={20} className="text-foreground" /></div></div>
              <p className="text-xs text-muted-foreground">Nilai Bahan Baku</p>
              <p className="text-xl font-extrabold text-foreground mt-1">Rp {formatNumber(totalKainValue)}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center"><Receipt size={20} className="text-warning" /></div></div>
              <p className="text-xs text-muted-foreground">Hutang Supplier + Konveksi</p>
              <p className="text-xl font-extrabold text-foreground mt-1">Rp {formatNumber(totalHutang + totalConvectionCost)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-bold text-foreground">Rincian Pengeluaran</h3></div>
            <div className="divide-y divide-border/50">
              <div className="px-5 py-3 flex items-center justify-between"><span className="text-sm text-muted-foreground">Pembelian Bahan Baku (Kain)</span><span className="font-bold text-sm text-foreground">Rp {formatNumber(totalKainValue)}</span></div>
              <div className="px-5 py-3 flex items-center justify-between"><span className="text-sm text-muted-foreground">Biaya Konveksi</span><span className="font-bold text-sm text-foreground">Rp {formatNumber(totalConvectionCost)}</span></div>
              <div className="px-5 py-3 flex items-center justify-between"><span className="text-sm text-muted-foreground">Hutang Supplier (Belum Lunas)</span><span className="font-bold text-sm text-warning">Rp {formatNumber(totalHutang)}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-bold text-foreground">Semua Aktivitas Sistem</h3></div>
            <div className="divide-y divide-border/50 max-h-96 overflow-y-auto">
              {auditLogs.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Belum ada aktivitas.</p>}
              {[...auditLogs].reverse().slice(0, 100).map(log => (
                <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{log.action}</p>
                    <p className="text-xs text-muted-foreground">{log.details}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{log.userName} · {new Date(log.timestamp).toLocaleString('id-ID')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
