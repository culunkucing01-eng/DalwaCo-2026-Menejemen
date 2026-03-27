import { useState, useMemo } from 'react';
import { useAppState, formatNumber, type Product } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { atomicAddStock, atomicDeductStock, addDocument, type SalesTransaction } from '@/lib/firestore';
import {
  Search, RotateCcw, ArrowLeftRight, Package, X, Loader2, CheckCircle2, AlertTriangle, FileText
} from 'lucide-react';

interface ReturItem {
  index: number;
  name: string;
  variant_name?: string | null;
  sku: string;
  qty: number;
  price: number;
  hpp: number;
  product_id?: string;
  maxQty: number;
}

export default function ReturView({ onBack }: { onBack: () => void }) {
  const { salesTransactions, products, setProducts, kasirStore, addAuditLog, showMessage } = useAppState();
  const { profile } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<SalesTransaction | null>(null);
  const [returItems, setReturItems] = useState<Map<number, { action: 'refund' | 'exchange'; exchangeProductId?: string; exchangeVariant?: string; reason: string }>>(new Map());
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Exchange product search
  const [exchangeSearchIdx, setExchangeSearchIdx] = useState<number | null>(null);
  const [exchangeSearch, setExchangeSearch] = useState('');

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return salesTransactions
      .filter(tx => tx.transaction_id.toLowerCase().includes(q) || tx.member_name?.toLowerCase().includes(q))
      .slice(0, 10);
  }, [searchQuery, salesTransactions]);

  const storeProducts = useMemo(() => {
    if (!exchangeSearch.trim()) return [];
    const q = exchangeSearch.toLowerCase();
    return products.filter(p =>
      (p.stock_map?.[kasirStore] || 0) > 0 &&
      (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [exchangeSearch, products, kasirStore]);

  const toggleReturItem = (idx: number, action: 'refund' | 'exchange') => {
    const newMap = new Map(returItems);
    if (newMap.has(idx) && newMap.get(idx)!.action === action) {
      newMap.delete(idx);
    } else {
      newMap.set(idx, { action, reason: newMap.get(idx)?.reason || '' });
    }
    setReturItems(newMap);
  };

  const setExchangeProduct = (idx: number, product: Product, variantName?: string) => {
    const newMap = new Map(returItems);
    const existing = newMap.get(idx) || { action: 'exchange' as const, reason: '' };
    newMap.set(idx, { ...existing, action: 'exchange', exchangeProductId: product.id, exchangeVariant: variantName || product.name });
    setReturItems(newMap);
    setExchangeSearchIdx(null);
    setExchangeSearch('');
  };

  const setReason = (idx: number, reason: string) => {
    const newMap = new Map(returItems);
    const existing = newMap.get(idx);
    if (existing) {
      newMap.set(idx, { ...existing, reason });
      setReturItems(newMap);
    }
  };

  const processRetur = async () => {
    if (!selectedTx || returItems.size === 0) return;
    setProcessing(true);
    try {
      const now = new Date();
      const cashierName = profile?.displayName || 'Kasir';
      const returId = `RTR-${Date.now().toString(36).toUpperCase()}`;

      for (const [idx, config] of returItems.entries()) {
        const item = selectedTx.items[idx];
        if (!item || !item.product_id) continue;

        if (!config.reason.trim()) {
          showMessage(`Peringatan: Alasan retur untuk "${item.name}" wajib diisi!`);
          setProcessing(false);
          return;
        }

        if (config.action === 'refund') {
          // Return stock back to store
          await atomicAddStock(item.product_id, kasirStore, item.qty);
          setProducts(prev => prev.map(p => p.id === item.product_id
            ? { ...p, stock_map: { ...p.stock_map, [kasirStore]: (p.stock_map[kasirStore] || 0) + item.qty } }
            : p
          ));
        } else if (config.action === 'exchange' && config.exchangeProductId) {
          // Atomic: +1 retur item, -1 exchange item
          await atomicAddStock(item.product_id, kasirStore, item.qty);
          await atomicDeductStock([{ productId: config.exchangeProductId, qty: item.qty, store: kasirStore }]);
          setProducts(prev => prev.map(p => {
            if (p.id === item.product_id) return { ...p, stock_map: { ...p.stock_map, [kasirStore]: (p.stock_map[kasirStore] || 0) + item.qty } };
            if (p.id === config.exchangeProductId) return { ...p, stock_map: { ...p.stock_map, [kasirStore]: (p.stock_map[kasirStore] || 0) - item.qty } };
            return p;
          }));
        }

        // Log to return_logs collection
        await addDocument('return_logs', {
          return_id: returId,
          original_transaction_id: selectedTx.transaction_id,
          store: kasirStore,
          cashier_name: cashierName,
          action: config.action,
          returned_item: item.name,
          returned_variant: item.variant_name || null,
          returned_product_id: item.product_id,
          returned_qty: item.qty,
          returned_price: item.price,
          returned_hpp: item.hpp || 0,
          exchange_product_id: config.exchangeProductId || null,
          exchange_variant: config.exchangeVariant || null,
          reason: config.reason,
          timestamp: now.toISOString(),
        });

        addAuditLog(
          config.action === 'refund' ? 'Retur Barang' : 'Tukar Barang',
          `${returId} | ${item.name} x${item.qty} | ${config.reason}${config.action === 'exchange' ? ` → ${config.exchangeVariant}` : ''}`
        );
      }

      showMessage(`Berhasil: Retur ${returId} telah diproses!`);
      setCompleted(true);
    } catch (err: any) {
      showMessage(`Gagal: ${err.message || 'Error memproses retur'}`);
    } finally {
      setProcessing(false);
    }
  };

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-success" />
        </div>
        <h3 className="font-bold text-foreground text-lg mb-1">Retur Berhasil Diproses</h3>
        <p className="text-sm text-muted-foreground mb-6">Stok telah diperbarui dan log tercatat.</p>
        <div className="flex gap-3">
          <button onClick={() => { setCompleted(false); setSelectedTx(null); setReturItems(new Map()); setSearchQuery(''); }}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90">Retur Lagi</button>
          <button onClick={onBack} className="px-5 py-2.5 rounded-xl bg-muted text-muted-foreground font-semibold text-sm hover:bg-muted/80">Kembali ke POS</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={onBack} className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
        ← Kembali ke POS
      </button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
          <RotateCcw size={20} className="text-warning" />
        </div>
        <div>
          <h2 className="font-bold text-foreground text-lg">Retur & Tukar Barang</h2>
          <p className="text-xs text-muted-foreground">Cari transaksi berdasarkan No. Nota untuk memproses retur atau penukaran.</p>
        </div>
      </div>

      {/* Search Transaction */}
      {!selectedTx && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
            <input
              className="w-full h-12 pl-10 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60"
              placeholder="Cari No. Nota / ID Transaksi / Nama Pelanggan..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          {searchResults.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-lg divide-y divide-border/50 max-h-96 overflow-y-auto">
              {searchResults.map(tx => (
                <button key={tx.id} onClick={() => setSelectedTx(tx)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">{tx.transaction_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.timestamp).toLocaleDateString('id-ID')} • {tx.store} • {tx.cashier_name}
                        {tx.member_name && ` • ${tx.member_name}`}
                      </p>
                    </div>
                    <span className="font-bold text-sm text-foreground">Rp {formatNumber(tx.grand_total)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {tx.items.map(i => `${i.name} x${i.qty}`).join(', ')}
                  </p>
                </button>
              ))}
            </div>
          )}

          {searchQuery.trim() && searchResults.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Transaksi tidak ditemukan.</p>
            </div>
          )}
        </div>
      )}

      {/* Selected Transaction Detail */}
      {selectedTx && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-bold text-foreground">{selectedTx.transaction_id}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(selectedTx.timestamp).toLocaleString('id-ID')} • {selectedTx.store}
                  {selectedTx.member_name && ` • ${selectedTx.member_name}`}
                </p>
              </div>
              <button onClick={() => { setSelectedTx(null); setReturItems(new Map()); }} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {selectedTx.items.map((item, idx) => {
                const config = returItems.get(idx);
                return (
                  <div key={idx} className={`p-3 rounded-xl border transition-all ${config ? 'border-warning/50 bg-warning/5' : 'border-border bg-muted/10'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground">{item.name}</p>
                        {item.variant_name && <p className="text-[10px] text-primary">{item.variant_name}</p>}
                        <p className="text-xs text-muted-foreground">Qty: {item.qty} × Rp {formatNumber(item.price)} = Rp {formatNumber(item.subtotal)}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => toggleReturItem(idx, 'refund')}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${config?.action === 'refund' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}`}
                        >
                          <RotateCcw size={11} className="inline mr-1" />Refund
                        </button>
                        <button
                          onClick={() => toggleReturItem(idx, 'exchange')}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${config?.action === 'exchange' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'}`}
                        >
                          <ArrowLeftRight size={11} className="inline mr-1" />Tukar
                        </button>
                      </div>
                    </div>

                    {config && (
                      <div className="mt-2 space-y-2 pl-2 border-l-2 border-warning/30">
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground">Alasan *</label>
                          <input className="input-field text-xs mt-0.5" placeholder="Contoh: Ukuran tidak sesuai..."
                            value={config.reason} onChange={e => setReason(idx, e.target.value)} />
                        </div>

                        {config.action === 'exchange' && (
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground">Barang Pengganti *</label>
                            {config.exchangeProductId ? (
                              <div className="flex items-center gap-2 mt-1 p-2 rounded-lg bg-primary/5 border border-primary/20">
                                <Package size={14} className="text-primary" />
                                <span className="text-xs font-semibold text-foreground flex-1">{config.exchangeVariant}</span>
                                <button onClick={() => { const m = new Map(returItems); m.set(idx, { ...config, exchangeProductId: undefined, exchangeVariant: undefined }); setReturItems(m); }}
                                  className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                              </div>
                            ) : (
                              <div className="mt-1">
                                <input className="input-field text-xs" placeholder="Cari produk pengganti..."
                                  value={exchangeSearchIdx === idx ? exchangeSearch : ''}
                                  onFocus={() => setExchangeSearchIdx(idx)}
                                  onChange={e => { setExchangeSearchIdx(idx); setExchangeSearch(e.target.value); }} />
                                {exchangeSearchIdx === idx && storeProducts.length > 0 && (
                                  <div className="border border-border rounded-lg bg-card shadow-lg mt-1 max-h-32 overflow-y-auto divide-y divide-border/50">
                                    {storeProducts.map(p => (
                                      <div key={p.id}>
                                        {p.variants && p.variants.length > 0 ? (
                                          p.variants.map((v, vi) => (
                                            <button key={vi} onClick={() => setExchangeProduct(idx, p, `${p.name} - ${v.name}`)}
                                              className="w-full text-left px-3 py-1.5 hover:bg-muted/30 text-xs">
                                              <span className="font-semibold">{p.name}</span> - {v.name}
                                              <span className="text-muted-foreground ml-2">Stok: {p.stock_map[kasirStore] || 0}</span>
                                            </button>
                                          ))
                                        ) : (
                                          <button onClick={() => setExchangeProduct(idx, p)}
                                            className="w-full text-left px-3 py-1.5 hover:bg-muted/30 text-xs">
                                            <span className="font-semibold">{p.name}</span>
                                            <span className="text-muted-foreground ml-2">Stok: {p.stock_map[kasirStore] || 0}</span>
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Process Button */}
          {returItems.size > 0 && (
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-bold text-foreground mb-0.5">Konfirmasi Retur</p>
                  <p>{returItems.size} item akan diproses. Stok akan diperbarui secara atomik.</p>
                </div>
              </div>
              <button
                onClick={processRetur}
                disabled={processing}
                className="w-full py-3 rounded-xl bg-warning text-warning-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {processing ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                {processing ? 'Memproses...' : `Proses Retur (${returItems.size} item)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
