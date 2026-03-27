import { useState, useRef, useCallback } from 'react';
import { useAppState, formatNumber, unformatNumber, type Product, type ProductVariant } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { atomicDeductStock, firestoreAddSalesTransaction, firestoreAddReceivable } from '@/lib/firestore';
import { firestoreAddOperationalExpense } from '@/lib/firestore-finance';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import {
  Search, X, Plus, Minus, Trash2, Download, Save, Phone, User, Truck,
  CreditCard, ScanBarcode, Package, ImageOff, Loader2, CheckCircle2
} from 'lucide-react';

interface WACartItem {
  id: string;
  productId: string;
  name: string;
  variantName?: string;
  sku: string;
  category: string;
  hpp: number;
  price: number;
  qty: number;
  maxQty: number;
}

const BANK_OPTIONS = ['BCA', 'Mandiri', 'BRI', 'BSI', 'BNI', 'CIMB', 'Permata', 'Lainnya'];

export default function WhatsAppOrderView({ onBack }: { onBack: () => void }) {
  const { products, setProducts, kasirStore, addAuditLog, showMessage, storeProfiles, setReceivables } = useAppState();
  const { profile } = useAuth();
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Customer
  const [customerName, setCustomerName] = useState('');
  const [customerWA, setCustomerWA] = useState('');

  // Cart
  const [cart, setCart] = useState<WACartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);

  // Costs
  const [expedisi, setExpedisi] = useState('');
  const [ongkir, setOngkir] = useState('');
  const [biayaTambahan, setBiayaTambahan] = useState('');
  const [diskon, setDiskon] = useState('');
  const [dp, setDp] = useState('');

  // Bank - load last used from localStorage
  const [selectedBankName, setSelectedBankName] = useState(() => {
    try { return localStorage.getItem('wa_last_bank') || BANK_OPTIONS[0]; } catch { return BANK_OPTIONS[0]; }
  });
  const [bankRekening, setBankRekening] = useState(() => {
    try { return localStorage.getItem('wa_last_rekening') || ''; } catch { return ''; }
  });
  const [bankAtasNama, setBankAtasNama] = useState(() => {
    try { return localStorage.getItem('wa_last_atas_nama') || ''; } catch { return ''; }
  });

  // Persist bank info to localStorage on change
  const updateBankName = (name: string) => { setSelectedBankName(name); try { localStorage.setItem('wa_last_bank', name); } catch {} };
  const updateRekening = (val: string) => { setBankRekening(val); try { localStorage.setItem('wa_last_rekening', val); } catch {} };
  const updateAtasNama = (val: string) => { setBankAtasNama(val); try { localStorage.setItem('wa_last_atas_nama', val); } catch {} };

  // State
  const [processing, setProcessing] = useState(false);
  const [saved, setSaved] = useState(false);

  // Invoice ID
  const [invoiceId] = useState(() => `INV-${Date.now().toString(36).toUpperCase()}`);

  const storeProducts = products.filter(p => (p.stock_map?.[kasirStore] || 0) > 0);
  const filteredProducts = searchQuery.trim()
    ? storeProducts.filter(p =>
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.variants || []).some(v =>
          v.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : [];

  const addToCart = (product: Product, variant?: ProductVariant) => {
    const cartId = variant ? `${product.id}__${variant.name}` : product.id;
    const maxQty = product.stock_map[kasirStore] || 0;
    const inCart = cart.find(item => item.id === cartId)?.qty || 0;
    if (inCart >= maxQty) { showMessage('Stok tidak mencukupi!'); return; }

    const existing = cart.find(item => item.id === cartId);
    if (existing) {
      setCart(cart.map(item => item.id === cartId ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, {
        id: cartId, productId: product.id, name: product.name,
        variantName: variant?.name, sku: variant?.sku || product.sku,
        category: product.category, hpp: product.hpp, price: product.price,
        qty: 1, maxQty,
      }]);
    }
    setSearchQuery('');
  };

  const handleProductClick = (product: Product) => {
    if (product.variants && product.variants.length > 0) {
      setVariantProduct(product);
    } else {
      addToCart(product);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id !== id) return item;
      const newQty = Math.max(0, item.qty + delta);
      if (newQty > item.maxQty) { showMessage('Stok tidak mencukupi!'); return item; }
      return { ...item, qty: newQty };
    }).filter(item => item.qty > 0));
  };

  // Calculations
  const subtotalProduk = cart.reduce((a, c) => a + c.price * c.qty, 0);
  const ongkirNum = parseInt(unformatNumber(ongkir)) || 0;
  const biayaNum = parseInt(unformatNumber(biayaTambahan)) || 0;
  const diskonNum = parseInt(unformatNumber(diskon)) || 0;
  const dpNum = parseInt(unformatNumber(dp)) || 0;
  const grandTotalBeforeDp = Math.max(0, subtotalProduk + ongkirNum + biayaNum - diskonNum);
  const totalTagihan = Math.max(0, grandTotalBeforeDp - dpNum);

  const today = new Date();
  const dateStr = today.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  // Download PNG
  const downloadInvoice = useCallback(async () => {
    if (!invoiceRef.current) return;
    try {
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2, backgroundColor: null, useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `${invoiceId}-${customerName || 'customer'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showMessage('Berhasil: Invoice berhasil diunduh!');
    } catch {
      showMessage('Gagal mengunduh invoice!');
    }
  }, [invoiceId, customerName, showMessage]);

  // Save Transaction
  const saveTransaction = async () => {
    if (cart.length === 0) { showMessage('Keranjang kosong!'); return; }
    if (!customerName.trim()) { showMessage('Nama pelanggan wajib diisi!'); return; }
    setProcessing(true);
    try {
      // Atomic stock deduction
      await atomicDeductStock(cart.map(c => ({ productId: c.productId, qty: c.qty, store: kasirStore })));
      for (const c of cart) {
        setProducts(prev => prev.map(p => p.id === c.productId
          ? { ...p, stock_map: { ...p.stock_map, [kasirStore]: (p.stock_map[kasirStore] || 0) - c.qty } }
          : p
        ));
      }

      const now = new Date();
      const cashierName = profile?.displayName || 'Kasir';
      const txId = `WA-${Date.now().toString(36).toUpperCase()}`;
      const totalHpp = cart.reduce((a, c) => a + c.hpp * c.qty, 0);
      const sisaTagihan = totalTagihan; // grandTotalBeforeDp - dpNum

      // Save sales transaction with DENORMALIZED data (same schema as POS)
      await firestoreAddSalesTransaction({
        transaction_id: txId,
        store: kasirStore,
        cashier_name: cashierName,
        items: cart.map(c => ({
          product_id: c.productId, sku: c.sku,
          name: c.name + (c.variantName ? ` - ${c.variantName}` : ''),
          variant_name: c.variantName || null,
          qty: c.qty, price: c.price, hpp: c.hpp,
          subtotal: c.price * c.qty, category: c.category,
        })),
        subtotal: subtotalProduk,
        discount: diskonNum,
        grand_total: grandTotalBeforeDp,
        payment_method: dpNum > 0 && sisaTagihan > 0 ? 'Transfer Bank (DP)' : 'Transfer Bank',
        member_name: customerName,
        customer_type: 'Regular',
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        total_hpp: totalHpp,
        tipe_penjualan: 'WhatsApp',
        status_pembayaran: sisaTagihan > 0 ? 'Menunggu Transfer' : 'Lunas',
        dp_dibayar: dpNum,
        customer_wa: customerWA,
        ekspedisi: expedisi,
        ongkir: ongkirNum,
        biaya_tambahan: biayaNum,
        invoice_id: invoiceId,
      } as any);

      // If there's a remaining balance (DP < total), create a receivable (piutang)
      if (sisaTagihan > 0) {
        const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // default 7 days
        const recData = {
          customer_name: customerName,
          customer_wa: customerWA,
          total: grandTotalBeforeDp,
          paid: dpNum,
          due_date: format(dueDate, 'yyyy-MM-dd'),
          items: cart.map(c => `${c.name}${c.variantName ? ` (${c.variantName})` : ''} x${c.qty}`).join(', '),
          status: dpNum >= grandTotalBeforeDp ? 'Lunas' : 'Belum Lunas',
          timestamp: now.toISOString(),
        };
        const recId = await firestoreAddReceivable(recData);
        setReceivables(prev => [...prev, { ...recData, id: recId }]);
        addAuditLog('Piutang WhatsApp', `${txId} | ${customerName} | Sisa Rp ${formatNumber(sisaTagihan)}`);
      }

      // If DP was paid, record as cash inflow for the day
      if (dpNum > 0) {
        await firestoreAddOperationalExpense({
          date: format(now, 'yyyy-MM-dd'),
          category: 'Lainnya',
          location: kasirStore,
          amount: -dpNum, // negative = kas masuk
          description: `DP Pesanan WA: ${customerName} (${txId})`,
          timestamp: now.toISOString(),
          created_by: cashierName,
        });
      }

      addAuditLog('Pesanan WhatsApp', `${txId} | ${customerName} | Rp ${formatNumber(grandTotalBeforeDp)}${dpNum > 0 ? ` (DP: Rp ${formatNumber(dpNum)})` : ''}`);
      showMessage('Berhasil: Transaksi WhatsApp tersimpan & stok terpotong!');
      setSaved(true);
    } catch (err: any) {
      showMessage(`Gagal: ${err.message || 'Error menyimpan transaksi'}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)] animate-fade-in">
      {/* LEFT: Form Input */}
      <div className="w-[45%] flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
        {/* Back Button */}
        <button onClick={onBack} className="self-start text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          ← Kembali ke POS
        </button>

        {/* Customer Info */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><User size={13} /> Data Pelanggan</h3>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Nama Pelanggan *</label>
            <input className="input-field mt-1 text-xs" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nama lengkap pelanggan" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">No. WhatsApp</label>
            <input className="input-field mt-1 text-xs" value={customerWA} onChange={e => setCustomerWA(e.target.value)} placeholder="08xxxxxxxxxx" />
          </div>
        </div>

        {/* Product Search & Cart */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Package size={13} /> Keranjang Belanja</h3>
          <div className="relative">
            <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
            <input
              className="w-full h-10 pl-9 pr-8 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60"
              placeholder="Cari produk / scan barcode..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && filteredProducts.length === 1) {
                  handleProductClick(filteredProducts[0]);
                }
              }}
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={14} /></button>}
          </div>

          {/* Search Results */}
          {searchQuery && filteredProducts.length > 0 && (
            <div className="border border-border rounded-xl bg-card shadow-lg max-h-40 overflow-y-auto divide-y divide-border/50">
              {filteredProducts.slice(0, 8).map(p => (
                <button key={p.id} onClick={() => handleProductClick(p)} className="w-full text-left px-3 py-2 hover:bg-muted/30 transition-colors flex items-center gap-2">
                  {p.image_url ? <img src={p.image_url} className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-muted/30 flex items-center justify-center"><ImageOff size={12} className="text-muted-foreground/30" /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-foreground truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.sku} • Rp {formatNumber(p.price)} • Stok: {p.stock_map[kasirStore] || 0}</p>
                  </div>
                  {p.variants && p.variants.length > 0 && <span className="text-[9px] text-primary font-semibold">{p.variants.length} varian</span>}
                </button>
              ))}
            </div>
          )}

          {/* Cart Items */}
          {cart.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-xs opacity-50">Belum ada produk dipilih</div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-2 p-2 rounded-xl bg-muted/20 border border-border/50">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[11px] text-foreground truncate">{item.name}</p>
                    {item.variantName && <p className="text-[10px] text-primary">{item.variantName}</p>}
                    <p className="text-[10px] text-muted-foreground">Rp {formatNumber(item.price)} × {item.qty}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateQty(item.id, -1)} className="w-5 h-5 rounded bg-card border border-border flex items-center justify-center hover:bg-muted"><Minus size={10} /></button>
                    <span className="text-[11px] font-bold w-4 text-center">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="w-5 h-5 rounded bg-card border border-border flex items-center justify-center hover:bg-muted"><Plus size={10} /></button>
                    <button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="w-5 h-5 rounded flex items-center justify-center text-destructive/60 hover:text-destructive ml-0.5"><Trash2 size={10} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rincian Biaya */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Truck size={13} /> Rincian Biaya</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Ekspedisi</label>
              <input className="input-field mt-1 text-xs" value={expedisi} onChange={e => setExpedisi(e.target.value)} placeholder="JNT, J&T, SiCepat..." />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Ongkir (Rp)</label>
              <input className="input-field mt-1 text-xs" value={ongkir ? formatNumber(ongkir) : ''} onChange={e => setOngkir(unformatNumber(e.target.value))} placeholder="0" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Biaya Tambahan (Rp)</label>
              <input className="input-field mt-1 text-xs" value={biayaTambahan ? formatNumber(biayaTambahan) : ''} onChange={e => setBiayaTambahan(unformatNumber(e.target.value))} placeholder="0" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Diskon (Rp)</label>
              <input className="input-field mt-1 text-xs" value={diskon ? formatNumber(diskon) : ''} onChange={e => setDiskon(unformatNumber(e.target.value))} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">DP / Uang Muka (Rp)</label>
            <input className="input-field mt-1 text-xs" value={dp ? formatNumber(dp) : ''} onChange={e => setDp(unformatNumber(e.target.value))} placeholder="0" />
          </div>
        </div>

        {/* Bank Selection */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><CreditCard size={13} /> Pembayaran Bank</h3>
          <div className="flex flex-wrap gap-1.5">
            {BANK_OPTIONS.map(bank => (
              <button
                key={bank}
                onClick={() => updateBankName(bank)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  selectedBankName === bank
                    ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'border-border bg-card text-foreground hover:border-primary/40'
                }`}
              >
                {bank}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">No. Rekening *</label>
              <input className="input-field mt-1 text-xs" value={bankRekening} onChange={e => updateRekening(e.target.value)} placeholder="Masukkan no. rekening" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Atas Nama *</label>
              <input className="input-field mt-1 text-xs" value={bankAtasNama} onChange={e => updateAtasNama(e.target.value)} placeholder="Nama pemilik rekening" />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pb-4">
          <button
            onClick={downloadInvoice}
            disabled={cart.length === 0 || !customerName.trim()}
            className="py-3 rounded-xl bg-success text-success-foreground font-bold text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Download size={14} /> Download Invoice (PNG)
          </button>
          <button
            onClick={saveTransaction}
            disabled={processing || cart.length === 0 || !customerName.trim() || saved}
            className="py-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saved ? 'Tersimpan ✓' : 'Simpan Transaksi'}
          </button>
        </div>
      </div>

      {/* RIGHT: Live Invoice Preview */}
      <div className="w-[55%] flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Live Preview Invoice</h3>
        <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-muted/20 p-4 flex justify-center">
          <div
            ref={invoiceRef}
            style={{
              width: '480px',
              minHeight: '600px',
              backgroundColor: '#F5F0E8',
              fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
              padding: '32px',
              borderRadius: '4px',
              color: '#1a1a1a',
              fontSize: '13px',
              lineHeight: '1.5',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Kepada</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#2D4A3E' }}>{customerName || 'Nama Pelanggan'}</div>
                {customerWA && <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>WA: {customerWA}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Invoice</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#2D4A3E' }}>{invoiceId}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{dateStr}</div>
              </div>
            </div>

            {/* Branding */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '3px', color: '#2D4A3E' }}>DALWA.CO</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                {storeProfiles.find(s => s.store_name === kasirStore)?.address || 'Fashion Muslim Premium'}
              </div>
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <thead>
                <tr style={{ backgroundColor: '#2D4A3E' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#fff', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Item</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontSize: '11px', fontWeight: 600 }}>Harga</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#fff', fontSize: '11px', fontWeight: 600 }}>Qty</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontSize: '11px', fontWeight: 600 }}>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '12px' }}>Belum ada item</td></tr>
                ) : (
                  cart.map((item, i) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #E0D8CC' }}>
                      <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        {item.variantName && <div style={{ fontSize: '11px', color: '#888' }}>{item.variantName}</div>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px' }}>Rp {formatNumber(item.price)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 600 }}>{item.qty}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 600 }}>Rp {formatNumber(item.price * item.qty)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Summary + Bank */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
              {/* Summary Left */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                  <span style={{ color: '#666' }}>Sub Total Produk</span>
                  <span style={{ fontWeight: 600 }}>Rp {formatNumber(subtotalProduk)}</span>
                </div>
                {ongkirNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                    <span style={{ color: '#666' }}>Ongkir ({expedisi || 'Ekspedisi'})</span>
                    <span style={{ fontWeight: 600 }}>Rp {formatNumber(ongkirNum)}</span>
                  </div>
                )}
                {biayaNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                    <span style={{ color: '#666' }}>Biaya Tambahan</span>
                    <span style={{ fontWeight: 600 }}>Rp {formatNumber(biayaNum)}</span>
                  </div>
                )}
                {diskonNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', color: '#c0392b' }}>
                    <span>Diskon</span>
                    <span style={{ fontWeight: 600 }}>-Rp {formatNumber(diskonNum)}</span>
                  </div>
                )}
                {dpNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', color: '#2980b9' }}>
                    <span>DP / Uang Muka</span>
                    <span style={{ fontWeight: 600 }}>-Rp {formatNumber(dpNum)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', fontSize: '16px', fontWeight: 700, borderTop: '2px solid #2D4A3E', marginTop: '8px', color: '#2D4A3E' }}>
                  <span>Total Tagihan</span>
                  <span>Rp {formatNumber(totalTagihan)}</span>
                </div>
              </div>

              {/* Bank Info Right */}
              <div style={{ width: '180px', padding: '12px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #E0D8CC' }}>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Transfer ke</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#2D4A3E', marginBottom: '4px' }}>{selectedBankName}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '0.5px', marginBottom: '4px' }}>{bankRekening || '-'}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>a/n {bankAtasNama || '-'}</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              backgroundColor: '#2D4A3E',
              color: '#fff',
              textAlign: 'center',
              padding: '14px 16px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 500,
              letterSpacing: '0.3px',
            }}>
              Kirimkan Bukti Pembayaran anda, agar pesanan anda bisa segera diproses!
            </div>
          </div>
        </div>
      </div>

      {/* Variant Modal */}
      {variantProduct && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setVariantProduct(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-bold text-foreground text-sm">Pilih Varian</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{variantProduct.name}</p>
              </div>
              <button onClick={() => setVariantProduct(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-2.5 max-h-80 overflow-y-auto">
              {(variantProduct.variants || []).map((v, i) => {
                // Use store stock from stock_map, not warehouse variant stock
                const storeStockTotal = variantProduct.stock_map?.[kasirStore] || 0;
                const inCartForProduct = cart.filter(c => c.productId === variantProduct.id).reduce((sum, c) => sum + c.qty, 0);
                const availableStock = storeStockTotal - inCartForProduct;
                const varStock = availableStock > 0 ? availableStock : 0;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (varStock <= 0) { showMessage('Stok produk ini di toko habis!'); return; }
                      addToCart(variantProduct, v);
                      showMessage(`✓ ${variantProduct.name} - ${v.name} ditambahkan`);
                      setVariantProduct(null);
                    }}
                    disabled={varStock <= 0}
                    className={`p-3.5 rounded-xl border text-left transition-all ${varStock <= 0 ? 'opacity-40 cursor-not-allowed border-border bg-muted/20' : 'border-border bg-card hover:border-primary hover:shadow-md'}`}
                  >
                    <p className="font-bold text-sm text-foreground">{v.name}</p>
                    {v.sku && <p className="text-[10px] text-muted-foreground">{v.sku}</p>}
                    <p className={`text-xs mt-1.5 font-semibold ${varStock <= 0 ? 'text-destructive' : 'text-success'}`}>
                      Sisa: {varStock} pcs
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
