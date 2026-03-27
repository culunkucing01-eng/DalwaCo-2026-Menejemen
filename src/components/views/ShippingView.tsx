import { useState, useMemo } from 'react';
import { useAppState, STORES, type ShippingItem, type ProductVariant } from '@/lib/store';
import { firestoreAddShippingLog, firestoreUpdateShippingLog, atomicDeductGudangStock } from '@/lib/firestore';
import { printShippingInvoice } from '@/lib/invoice-generator';
import { Plus, X, Truck, FileText, Trash2, Search, Package, ShoppingCart } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface CartItem extends ShippingItem {
  gudangStock: number;
}

export default function ShippingView() {
  const { products, setProducts, shippingLogs, setShippingLogs, addAuditLog, showMessage } = useAppState();
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVariantKey, setSelectedVariantKey] = useState('');
  const [inputQty, setInputQty] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [destination, setDestination] = useState('');

  // Print modal state
  const [printModal, setPrintModal] = useState(false);
  const [printLogId, setPrintLogId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState('');

  // Build flat variant list from all products
  const variantOptions = useMemo(() => {
    const options: Array<{
      key: string;
      label: string;
      product_id: string;
      product_name: string;
      product_sku: string;
      barcode: string;
      warna: string;
      size: string;
      style: string;
      gudangStock: number;
      variant: ProductVariant;
    }> = [];

    products.forEach(p => {
      if (p.variants && p.variants.length > 0) {
        p.variants.forEach(v => {
          const barcode = v.barcode || v.sku || '';
          const gudangStock = v.stock || 0;
          const label = `[${barcode}] ${p.name} - ${v.warna || '-'}, ${v.size || '-'}, ${v.style || '-'} (Stok Gudang: ${gudangStock})`;
          options.push({
            key: `${p.id}__${barcode}`,
            label,
            product_id: p.id,
            product_name: p.name,
            product_sku: p.sku,
            barcode,
            warna: v.warna || '-',
            size: v.size || '-',
            style: v.style || '-',
            gudangStock,
            variant: v,
          });
        });
      } else {
        // Product without variants — use main product
        const gudangStock = p.stock_map?.['Gudang Utama'] || 0;
        const label = `[${p.sku}] ${p.name} - (Stok Gudang: ${gudangStock})`;
        options.push({
          key: `${p.id}__${p.sku}`,
          label,
          product_id: p.id,
          product_name: p.name,
          product_sku: p.sku,
          barcode: p.sku,
          warna: '-',
          size: '-',
          style: '-',
          gudangStock,
          variant: { name: p.name, stock: gudangStock, barcode: p.sku },
        });
      }
    });
    return options;
  }, [products]);

  // Filtered search results
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return variantOptions.filter(o => o.label.toLowerCase().includes(q)).slice(0, 15);
  }, [searchQuery, variantOptions]);

  const selectedOption = variantOptions.find(o => o.key === selectedVariantKey);

  const addToCart = () => {
    if (!selectedOption) { showMessage('Peringatan: Pilih varian terlebih dahulu!'); return; }
    const qty = parseInt(inputQty);
    if (!qty || qty <= 0) { showMessage('Peringatan: Masukkan jumlah yang valid!'); return; }
    if (qty > selectedOption.gudangStock) { showMessage('Peringatan: Stok Gudang tidak mencukupi!'); return; }

    // Check if already in cart
    const existing = cart.find(c => c.barcode === selectedOption.barcode);
    if (existing) {
      const totalQty = existing.qty + qty;
      if (totalQty > selectedOption.gudangStock) { showMessage('Peringatan: Total melebihi stok gudang!'); return; }
      setCart(prev => prev.map(c => c.barcode === selectedOption.barcode ? { ...c, qty: totalQty } : c));
    } else {
      setCart(prev => [...prev, {
        product_id: selectedOption.product_id,
        product_name: selectedOption.product_name,
        product_sku: selectedOption.product_sku,
        barcode: selectedOption.barcode,
        warna: selectedOption.warna,
        size: selectedOption.size,
        style: selectedOption.style,
        qty,
        gudangStock: selectedOption.gudangStock,
      }]);
    }
    setSelectedVariantKey('');
    setSearchQuery('');
    setInputQty('');
  };

  const removeFromCart = (barcode: string) => {
    setCart(prev => prev.filter(c => c.barcode !== barcode));
  };

  const handleShip = async () => {
    if (cart.length === 0) { showMessage('Peringatan: Daftar kirim masih kosong!'); return; }
    if (!destination) { showMessage('Peringatan: Pilih toko tujuan!'); return; }

    try {
      // Deduct stock per variant barcode
      for (const item of cart) {
        const product = products.find(p => p.id === item.product_id);
        if (!product) continue;

        if (product.variants && product.variants.length > 0) {
          const updatedVariants = product.variants.map(v => {
            if ((v.barcode || v.sku) === item.barcode) {
              return { ...v, stock: (v.stock || 0) - item.qty };
            }
            return v;
          });
          await atomicDeductGudangStock(product.id, item.qty, { variants: updatedVariants });
          const totalGudang = updatedVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
          setProducts(prev => prev.map(p => p.id === product.id ? { ...p, variants: updatedVariants, stock_map: { ...p.stock_map, 'Gudang Utama': totalGudang } } : p));
        } else {
          await atomicDeductGudangStock(product.id, item.qty);
          setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock_map: { ...p.stock_map, 'Gudang Utama': (p.stock_map?.['Gudang Utama'] || 0) - item.qty } } : p));
        }
      }

      const totalQty = cart.reduce((s, c) => s + c.qty, 0);
      const items: ShippingItem[] = cart.map(({ gudangStock, ...rest }) => rest);
      const firstItem = cart[0];

      const newLog = {
        product_id: firstItem.product_id,
        product_name: cart.length === 1 ? firstItem.product_name : `${firstItem.product_name} +${cart.length - 1} lainnya`,
        product_sku: firstItem.product_sku,
        qty: totalQty,
        destination,
        status: 'In Transit',
        timestamp: new Date().toISOString(),
        items,
      };

      const id = await firestoreAddShippingLog(newLog);
      setShippingLogs(prev => [{ ...newLog, id }, ...prev]);
      addAuditLog('Surat Jalan', `Kirim ${totalQty}pcs (${cart.length} varian) ke ${destination}`);
      showMessage('Berhasil: Surat Jalan Dibuat.');
      setShowAdd(false);
      setCart([]);
      setDestination('');
    } catch {
      showMessage('Gagal membuat surat jalan.');
    }
  };

  const openPrintDialog = (logId: string) => {
    setPrintLogId(logId);
    setDriverName('');
    setPrintModal(true);
  };

  const handlePrint = () => {
    const log = shippingLogs.find(l => l.id === printLogId);
    if (!log) return;
    const product = products.find(p => p.id === log.product_id);
    printShippingInvoice(log, product, driverName.trim() || undefined);
    setPrintModal(false);
    setDriverName('');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Surat Jalan Digital</h2>
          <p className="text-xs text-muted-foreground">Sistem keranjang — pilih varian berdasarkan Barcode.</p>
        </div>
        <button onClick={() => { setShowAdd(!showAdd); if (showAdd) { setCart([]); setDestination(''); } }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
          {showAdd ? <X size={16} /> : <Plus size={16} />} {showAdd ? 'Batal' : 'Buat Surat Jalan'}
        </button>
      </div>

      {showAdd && (
        <div className="space-y-4">
          {/* Search & Add Form */}
          <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
            <h3 className="font-bold text-foreground flex items-center gap-2 text-sm"><ShoppingCart size={16} className="text-primary" /> Tambah Barang ke Daftar Kirim</h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-7 relative">
                <label className="text-xs font-semibold text-muted-foreground">Cari Varian (Barcode / Nama)</label>
                <div className="relative mt-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={selectedOption ? selectedOption.label : searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSelectedVariantKey(''); }}
                    placeholder="Ketik barcode atau nama produk..."
                  />
                </div>
                {filteredOptions.length > 0 && !selectedVariantKey && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {filteredOptions.map(opt => (
                      <button
                        key={opt.key}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors border-b border-border last:border-0"
                        onClick={() => { setSelectedVariantKey(opt.key); setSearchQuery(''); }}
                      >
                        <span className="font-mono text-xs text-primary">[{opt.barcode}]</span>{' '}
                        <span className="font-semibold">{opt.product_name}</span>{' '}
                        <span className="text-muted-foreground">- {opt.warna}, {opt.size}, {opt.style}</span>
                        <span className="ml-2 text-xs text-muted-foreground">(Stok: {opt.gudangStock})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">Jumlah (Pcs)</label>
                <Input className="mt-1" type="number" min="1" value={inputQty} onChange={e => setInputQty(e.target.value)} placeholder="Qty" />
              </div>
              <div className="md:col-span-3">
                <Button onClick={addToCart} className="w-full" disabled={!selectedVariantKey || !inputQty}>
                  <Plus size={14} /> Tambah ke Daftar Kirim
                </Button>
              </div>
            </div>
          </div>

          {/* Cart Table */}
          {cart.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted/30">
                <h3 className="font-bold text-foreground flex items-center gap-2 text-sm">
                  <Package size={16} className="text-primary" /> Daftar Barang ({cart.length} item, {cart.reduce((s, c) => s + c.qty, 0)} pcs)
                </h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Nama Produk</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Warna</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.map((item, i) => (
                    <TableRow key={item.barcode}>
                      <TableCell className="font-medium">{i + 1}</TableCell>
                      <TableCell className="font-semibold">{item.product_name}</TableCell>
                      <TableCell><span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{item.barcode}</span></TableCell>
                      <TableCell>{item.warna}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>{item.style}</TableCell>
                      <TableCell className="text-center font-bold">{item.qty}</TableCell>
                      <TableCell>
                        <button onClick={() => removeFromCart(item.barcode)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Hapus">
                          <Trash2 size={14} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Destination & Submit */}
              <div className="p-5 border-t border-border space-y-3">
                <div className="max-w-sm">
                  <label className="text-xs font-semibold text-muted-foreground">Toko Tujuan</label>
                  <select className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm" value={destination} onChange={e => setDestination(e.target.value)}>
                    <option value="">-- Pilih Toko --</option>
                    {STORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <Button onClick={handleShip} size="lg" className="w-full font-bold">
                  <Truck size={16} /> Proses Pengiriman ({cart.reduce((s, c) => s + c.qty, 0)} Pcs)
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shipping Logs */}
      <div className="space-y-3">
        {shippingLogs.map(log => (
          <div key={log.id} className="flex flex-col gap-3 p-4 rounded-2xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Truck size={18} className="text-primary" /></div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{log.product_name}</p>
                  <p className="text-xs text-muted-foreground">Tujuan: {log.destination} | {log.qty} Pcs | {log.items?.length || 1} varian</p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button onClick={() => openPrintDialog(log.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all" title="Cetak Surat Jalan PDF">
                  <FileText size={14} /> Surat Jalan
                </button>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${log.status === 'Received' ? 'bg-green-500/10 text-green-600' : 'bg-secondary/30 text-secondary-foreground'}`}>
                  {log.status === 'Received' ? 'Diterima' : 'In Transit'}
                </span>
              </div>
            </div>
            {/* Show items detail if available */}
            {log.items && log.items.length > 0 && (
              <div className="ml-13 pl-3 border-l-2 border-border">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
                  {log.items.map((item, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      <span className="font-mono">{item.barcode}</span> — {item.warna}/{item.size} × <span className="font-semibold text-foreground">{item.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {shippingLogs.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">Belum ada surat jalan.</p>}
      </div>

      {/* Print Dialog */}
      <Dialog open={printModal} onOpenChange={setPrintModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck size={18} className="text-primary" /> Cetak Surat Jalan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Nama Sopir / Kurir</label>
              <Input className="mt-1" value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Masukkan nama sopir..." />
            </div>
            <p className="text-xs text-muted-foreground">Opsional. Nama sopir akan tercantum di header surat jalan.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintModal(false)}>Batal</Button>
            <Button onClick={handlePrint}>
              <FileText size={14} className="mr-1" /> Cetak PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
