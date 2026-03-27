import { useState } from 'react';
import { useAppState, formatNumber, ROLES } from '@/lib/store';
import { atomicSetStock } from '@/lib/firestore';
import { Scale, CheckCircle2, Clock, Scissors, Save, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OpnameEntry {
  id: string;
  product_name: string;
  sku: string;
  system_stock: number;
  actual_stock: number;
  diff: number;
  loss_rp: number;
  reason: string;
  status: string;
  variants_info?: string;
}

export default function OpnameView() {
  const { products, kasirStore, convectionLogs, addAuditLog, showMessage, currentRole } = useAppState();
  const [entries, setEntries] = useState<OpnameEntry[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [form, setForm] = useState({ actual: '', reason: '' });

  // Completed convection items (visible to all roles)
  const completedConvection = convectionLogs.filter(l => l.status === 'Selesai' && l.pcs_result && l.pcs_result > 0);

  const storeLocation = currentRole === ROLES.KASIR ? kasirStore : (currentRole === ROLES.GUDANG ? 'Gudang Utama' : kasirStore);

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const handleSubmit = async () => {
    const product = products.find(p => p.id === selectedProductId);
    if (!product || !form.actual || !form.reason) {
      showMessage('Peringatan: Lengkapi semua data dan alasan selisih!');
      return;
    }
    const systemStock = product.stock_map[storeLocation] || 0;
    const actualStock = parseInt(form.actual);
    const diff = actualStock - systemStock;
    const lossRp = diff < 0 ? Math.abs(diff) * product.hpp : 0;

    const variantsInfo = product.variants && product.variants.length > 0
      ? product.variants.map(v => `${v.warna || '-'}/${v.size || '-'}`).join(', ')
      : '';

    const entry: OpnameEntry = {
      id: Date.now().toString(), product_name: product.name, sku: product.sku,
      system_stock: systemStock, actual_stock: actualStock, diff, loss_rp: lossRp,
      reason: form.reason, status: currentRole === ROLES.KASIR ? 'Menunggu Approval' : 'Dikoreksi',
      variants_info: variantsInfo,
    };
    setEntries(prev => [...prev, entry]);

    // If Admin/Gudang, directly correct stock
    if (currentRole === ROLES.ADMIN || currentRole === ROLES.GUDANG) {
      try {
        await atomicSetStock(product.id, storeLocation, actualStock);
        entry.status = 'Dikoreksi';
        showMessage(`Berhasil: Stok ${product.name} dikoreksi (${diff > 0 ? '+' : ''}${diff})`);
      } catch {
        showMessage('Gagal mengupdate stok.');
      }
    } else {
      showMessage('Berhasil: Data penyesuaian tercatat. Menunggu approval Admin.');
    }

    addAuditLog('Penyesuaian Stok', `Penyesuaian ${product.sku} di ${storeLocation}: Sistem=${systemStock}, Fisik=${actualStock}, Selisih=${diff}. Alasan: ${form.reason}`);
    setForm({ actual: '', reason: '' });
    setSelectedProductId('');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-foreground">Penyesuaian Stok Toko</h2>
        <p className="text-xs text-muted-foreground">Wajib input alasan selisih. Status: Menunggu Approval Admin.</p>
      </div>

      {/* Completed Convection - Stock from production */}
      {completedConvection.length > 0 && (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-4 space-y-3">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Scissors size={16} className="text-success" /> Produk Selesai dari Konveksi (Masuk Gudang Utama)
          </h3>
          {/* Mobile Cards */}
          <div className="md:hidden space-y-2">
            {completedConvection.slice(0, 20).map(c => (
              <div key={c.id} className="p-3 rounded-xl border border-success/20 bg-card space-y-1 text-xs">
                <div className="flex items-start justify-between">
                  <p className="font-bold text-foreground">{c.material_name}</p>
                  <span className="px-2 py-0.5 rounded-full bg-success/10 text-success font-bold">{c.pcs_result} Pcs</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                  <span>Konveksi: {c.destination}</span>
                  <span>Meter: {c.meters_sent}m</span>
                  <span>Waste: {c.cutting_loss_waste || 0}</span>
                  <span>{new Date(c.timestamp).toLocaleDateString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-success/20">
                  <th className="text-left px-3 py-2 text-muted-foreground font-semibold">Bahan</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-semibold">Konveksi</th>
                  <th className="text-center px-3 py-2 text-muted-foreground font-semibold">Meter</th>
                  <th className="text-center px-3 py-2 text-muted-foreground font-semibold">Hasil (Pcs)</th>
                  <th className="text-center px-3 py-2 text-muted-foreground font-semibold">Waste</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-semibold">Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {completedConvection.slice(0, 20).map(c => (
                  <tr key={c.id} className="border-b border-success/10">
                    <td className="px-3 py-2 font-semibold text-foreground">{c.material_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.destination}</td>
                    <td className="px-3 py-2 text-center text-foreground">{c.meters_sent}m</td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-success/10 text-success font-bold">{c.pcs_result}</span>
                    </td>
                    <td className="px-3 py-2 text-center text-warning font-medium">{c.cutting_loss_waste || 0}</td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(c.timestamp).toLocaleDateString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Pilih Produk</label>
            <select className="input-field mt-1" value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
              <option value="">-- Pilih --</option>
              {products
                .filter(p => currentRole === ROLES.ADMIN || (p.stock_map[kasirStore] || 0) > 0 || currentRole === ROLES.GUDANG)
                .map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.name} (Sistem: {p.stock_map[currentRole === ROLES.KASIR ? kasirStore : 'Gudang Utama'] || 0})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Stok Fisik Aktual</label>
            <input className="input-field mt-1" type="number" value={form.actual} onChange={e => setForm({ ...form, actual: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Alasan Selisih</label>
            <input className="input-field mt-1" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Barang rusak / hilang..." />
          </div>
          <div className="flex items-end">
            <button onClick={handleSubmit} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
              Catat Penyesuaian
            </button>
          </div>
        </div>

        {/* Show selected product variant details */}
        {selectedProduct && selectedProduct.variants && selectedProduct.variants.length > 0 && (
          <div className="p-3 rounded-xl bg-muted/50 border border-border space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Detail Varian: {selectedProduct.name}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {selectedProduct.variants.map((v, i) => (
                <div key={i} className="p-2 rounded-lg bg-card border border-border text-xs text-center space-y-0.5">
                  <p className="font-bold text-foreground">{v.warna || '-'}</p>
                  <p className="text-muted-foreground">{v.size || '-'}{v.style ? ` • ${v.style}` : ''}</p>
                  <p className="text-primary font-semibold">Stok: {v.stock || 0}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <>
          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {entries.map(e => (
              <div key={e.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-foreground text-sm">{e.sku}</p>
                    {e.variants_info && <p className="text-[10px] text-muted-foreground">Varian: {e.variants_info}</p>}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-warning font-bold">
                    <Clock size={12} /> Menunggu
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Sistem:</span> <span className="font-semibold text-foreground">{e.system_stock}</span></div>
                  <div><span className="text-muted-foreground">Fisik:</span> <span className="font-semibold text-foreground">{e.actual_stock}</span></div>
                  <div><span className="text-muted-foreground">Selisih:</span> <span className={`font-bold ${e.diff < 0 ? 'text-destructive' : 'text-success'}`}>{e.diff}</span></div>
                </div>
                {e.loss_rp > 0 && <p className="text-xs text-destructive font-semibold">Kerugian: Rp {formatNumber(e.loss_rp)}</p>}
              </div>
            ))}
          </div>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Produk</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Varian</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Sistem</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fisik</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Selisih</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Kerugian</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-border/50">
                    <td className="px-4 py-3 font-semibold text-foreground">{e.sku}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.variants_info || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.system_stock}</td>
                    <td className="px-4 py-3 text-foreground">{e.actual_stock}</td>
                    <td className="px-4 py-3">
                      <span className={e.diff < 0 ? 'text-destructive font-bold' : 'text-success font-bold'}>{e.diff}</span>
                    </td>
                    <td className="px-4 py-3 text-destructive font-semibold">Rp {formatNumber(e.loss_rp)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-warning font-bold">
                        <Clock size={12} /> Menunggu Approval
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
