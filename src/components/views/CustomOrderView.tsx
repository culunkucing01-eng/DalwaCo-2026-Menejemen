import { useState, useEffect } from 'react';
import { useAppState, formatNumber, unformatNumber } from '@/lib/store';
import { addDocument, subscribeToCollectionPublic, updateDocument } from '@/lib/firestore';
import { Plus, X, Eye, Edit3, Check } from 'lucide-react';

export interface CustomOrder {
  id: string;
  customer_name: string;
  customer_phone: string;
  payment_method: string;
  shipping_service: string;
  shipping_cost: string;
  fabric_detail: string;
  fabric_meters: string;
  size_detail: string;
  design_notes: string;
  price_fabric: string;
  price_tailoring: string;
  price_other: string;
  total_price: number;
  status: string;
  timestamp: string;
}

export default function CustomOrderView() {
  const { addAuditLog, showMessage } = useAppState();
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [viewOrder, setViewOrder] = useState<CustomOrder | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', payment_method: 'Transfer Bank', shipping_service: 'JNE',
    shipping_cost: '', fabric_detail: '', fabric_meters: '', size_detail: '', design_notes: '',
    price_fabric: '', price_tailoring: '', price_other: '', status: 'Baru',
  });

  useEffect(() => {
    const unsub = subscribeToCollectionPublic<CustomOrder>('customOrders', setOrders, undefined, 'timestamp');
    return () => unsub();
  }, []);

  const calcTotal = () => {
    return (parseInt(form.price_fabric || '0') + parseInt(form.price_tailoring || '0') + parseInt(form.price_other || '0') + parseInt(form.shipping_cost || '0'));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name || !form.price_tailoring) { showMessage('Peringatan: Nama pemesan dan biaya jahit wajib diisi!'); return; }
    const total = calcTotal();
    try {
      const data = { ...form, shipping_cost: form.shipping_cost || '0', price_fabric: form.price_fabric || '0', price_tailoring: form.price_tailoring || '0', price_other: form.price_other || '0', total_price: total, timestamp: new Date().toISOString() };
      const orderId = await addDocument('customOrders', data);
      
      // Auto-create production log for warehouse queue
      await addDocument('convectionLogs', {
        material_id: '',
        material_name: form.fabric_detail || 'Kain Custom',
        meters_sent: parseFloat(form.fabric_meters) || 0,
        destination: 'Custom Order',
        status: 'Di Jahit',
        timestamp: new Date().toISOString(),
        production_type: 'internal' as const,
        jenis_produksi: 'Custom Order',
        custom_order_id: orderId,
        custom_customer_name: form.customer_name,
        custom_size_detail: form.size_detail,
        custom_design_notes: form.design_notes,
      });
      
      addAuditLog('Custom Order', `Pesanan baju custom: ${form.customer_name} (otomatis masuk antrean produksi)`);
      showMessage('Berhasil: Pesanan custom ditambahkan & masuk antrean produksi.');
      setShowAdd(false);
      setForm({ customer_name: '', customer_phone: '', payment_method: 'Transfer Bank', shipping_service: 'JNE', shipping_cost: '', fabric_detail: '', fabric_meters: '', size_detail: '', design_notes: '', price_fabric: '', price_tailoring: '', price_other: '', status: 'Baru' });
    } catch { showMessage('Gagal menyimpan pesanan.'); }
  };

  const startEdit = (o: CustomOrder) => {
    setEditId(o.id);
    setForm({ customer_name: o.customer_name, customer_phone: o.customer_phone, payment_method: o.payment_method, shipping_service: o.shipping_service, shipping_cost: o.shipping_cost, fabric_detail: o.fabric_detail, fabric_meters: o.fabric_meters, size_detail: o.size_detail, design_notes: o.design_notes, price_fabric: o.price_fabric, price_tailoring: o.price_tailoring, price_other: o.price_other, status: o.status });
  };

  const handleEdit = async () => {
    if (!editId) return;
    const total = calcTotal();
    try {
      const { updateDocument } = await import('@/lib/firestore');
      await updateDocument('customOrders', editId, { ...form, total_price: total });
      addAuditLog('Edit Custom Order', `Pesanan diedit: ${form.customer_name}`);
      showMessage('Berhasil: Pesanan diperbarui.');
      setEditId(null);
      setForm({ customer_name: '', customer_phone: '', payment_method: 'Transfer Bank', shipping_service: 'JNE', shipping_cost: '', fabric_detail: '', fabric_meters: '', size_detail: '', design_notes: '', price_fabric: '', price_tailoring: '', price_other: '', status: 'Baru' });
    } catch { showMessage('Gagal memperbarui pesanan.'); }
  };

  const statusColors: Record<string, string> = {
    'Baru': 'bg-primary/10 text-primary',
    'Proses Jahit': 'bg-warning/10 text-warning',
    'Selesai': 'bg-success/10 text-success',
    'Dikirim': 'bg-secondary/30 text-secondary-foreground',
    'Dibatalkan': 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Custom Baju / Jahit</h2>
          <p className="text-xs text-muted-foreground">Kelola pesanan baju custom dari pelanggan.</p>
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setEditId(null); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
          {showAdd ? <X size={16} /> : <Plus size={16} />} {showAdd ? 'Batal' : 'Pesanan Baru'}
        </button>
      </div>

      {(showAdd || editId) && (
        <form onSubmit={editId ? (e) => { e.preventDefault(); handleEdit(); } : handleAdd} className="p-5 rounded-2xl border border-border bg-card space-y-4">
          <h3 className="font-bold text-foreground">{editId ? 'Edit Pesanan' : 'Detail Pesanan Baru'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-xs font-semibold text-muted-foreground">Nama Pemesan *</label><input className="input-field mt-1" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="Ahmad Fauzi" /></div>
            <div><label className="text-xs font-semibold text-muted-foreground">No. HP / WA</label><input className="input-field mt-1" value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} placeholder="08123456789" /></div>
            <div><label className="text-xs font-semibold text-muted-foreground">Metode Pembayaran</label>
              <select className="input-field mt-1" value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                <option>Transfer Bank</option><option>Cash</option><option>QRIS</option><option>COD</option><option>DP 50%</option>
              </select>
            </div>
            <div><label className="text-xs font-semibold text-muted-foreground">Jasa Pengiriman</label>
              <select className="input-field mt-1" value={form.shipping_service} onChange={e => setForm({ ...form, shipping_service: e.target.value })}>
                <option>JNE</option><option>J&T</option><option>SiCepat</option><option>Pos Indonesia</option><option>Grab/GoSend</option><option>Ambil Sendiri</option><option>Kurir Toko</option>
              </select>
            </div>
            <div><label className="text-xs font-semibold text-muted-foreground">Ongkir (Rp)</label><input className="input-field mt-1" value={formatNumber(form.shipping_cost)} onChange={e => setForm({ ...form, shipping_cost: unformatNumber(e.target.value) })} placeholder="15.000" /></div>
            <div><label className="text-xs font-semibold text-muted-foreground">Status</label>
              <select className="input-field mt-1" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option>Baru</option><option>Proses Jahit</option><option>Selesai</option><option>Dikirim</option><option>Dibatalkan</option>
              </select>
            </div>
          </div>

          <hr className="border-border" />
          <h4 className="font-semibold text-foreground text-sm">Detail Kain & Ukuran</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-xs font-semibold text-muted-foreground">Jenis/Detail Kain</label><input className="input-field mt-1" value={form.fabric_detail} onChange={e => setForm({ ...form, fabric_detail: e.target.value })} placeholder="Katun Toyobo Hitam" /></div>
            <div><label className="text-xs font-semibold text-muted-foreground">Potongan Kain (Meter)</label><input className="input-field mt-1" type="number" step="0.1" value={form.fabric_meters} onChange={e => setForm({ ...form, fabric_meters: e.target.value })} placeholder="2.5" /></div>
            <div><label className="text-xs font-semibold text-muted-foreground">Detail Ukuran</label><input className="input-field mt-1" value={form.size_detail} onChange={e => setForm({ ...form, size_detail: e.target.value })} placeholder="L / Lingkar dada 100cm" /></div>
          </div>
          <div><label className="text-xs font-semibold text-muted-foreground">Catatan Desain / Permintaan Khusus</label>
            <textarea className="input-field mt-1 min-h-[60px]" value={form.design_notes} onChange={e => setForm({ ...form, design_notes: e.target.value })} placeholder="Lengan panjang, kerah shanghai, bordir nama di dada kiri..." />
          </div>

          <hr className="border-border" />
          <h4 className="font-semibold text-foreground text-sm">Detail Harga</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-xs font-semibold text-muted-foreground">Harga Kain (Rp)</label><input className="input-field mt-1" value={formatNumber(form.price_fabric)} onChange={e => setForm({ ...form, price_fabric: unformatNumber(e.target.value) })} /></div>
            <div><label className="text-xs font-semibold text-muted-foreground">Biaya Jahit (Rp) *</label><input className="input-field mt-1" value={formatNumber(form.price_tailoring)} onChange={e => setForm({ ...form, price_tailoring: unformatNumber(e.target.value) })} /></div>
            <div><label className="text-xs font-semibold text-muted-foreground">Biaya Lainnya (Rp)</label><input className="input-field mt-1" value={formatNumber(form.price_other)} onChange={e => setForm({ ...form, price_other: unformatNumber(e.target.value) })} /></div>
          </div>
          <div className="p-3 rounded-xl bg-muted text-sm">
            <span className="text-muted-foreground">Total Harga: </span>
            <span className="font-bold text-foreground">Rp {formatNumber(calcTotal())}</span>
          </div>

          <button type="submit" className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
            {editId ? 'Simpan Perubahan' : 'Simpan Pesanan'}
          </button>
        </form>
      )}

      {/* Detail View Modal */}
      {viewOrder && (
        <div className="p-5 rounded-2xl border-2 border-primary/20 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">Detail Pesanan: {viewOrder.customer_name}</h3>
            <button onClick={() => setViewOrder(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div><span className="text-muted-foreground">No. HP:</span> <span className="font-semibold text-foreground">{viewOrder.customer_phone || '-'}</span></div>
            <div><span className="text-muted-foreground">Pembayaran:</span> <span className="font-semibold text-foreground">{viewOrder.payment_method}</span></div>
            <div><span className="text-muted-foreground">Pengiriman:</span> <span className="font-semibold text-foreground">{viewOrder.shipping_service}</span></div>
            <div><span className="text-muted-foreground">Ongkir:</span> <span className="font-semibold text-foreground">Rp {formatNumber(viewOrder.shipping_cost)}</span></div>
            <div><span className="text-muted-foreground">Kain:</span> <span className="font-semibold text-foreground">{viewOrder.fabric_detail || '-'}</span></div>
            <div><span className="text-muted-foreground">Meter:</span> <span className="font-semibold text-foreground">{viewOrder.fabric_meters || '-'} m</span></div>
            <div><span className="text-muted-foreground">Ukuran:</span> <span className="font-semibold text-foreground">{viewOrder.size_detail || '-'}</span></div>
            <div className="col-span-2"><span className="text-muted-foreground">Catatan:</span> <span className="font-semibold text-foreground">{viewOrder.design_notes || '-'}</span></div>
            <div><span className="text-muted-foreground">Harga Kain:</span> <span className="font-semibold text-foreground">Rp {formatNumber(viewOrder.price_fabric)}</span></div>
            <div><span className="text-muted-foreground">Biaya Jahit:</span> <span className="font-semibold text-foreground">Rp {formatNumber(viewOrder.price_tailoring)}</span></div>
            <div><span className="text-muted-foreground">Lainnya:</span> <span className="font-semibold text-foreground">Rp {formatNumber(viewOrder.price_other)}</span></div>
            <div className="col-span-2 md:col-span-3"><span className="text-muted-foreground">Total:</span> <span className="font-bold text-primary text-sm">Rp {formatNumber(viewOrder.total_price)}</span></div>
          </div>
        </div>
      )}

      {/* Orders List */}
      <div className="space-y-3">
        {orders.length === 0 && <p className="text-center py-10 text-sm text-muted-foreground">Belum ada pesanan custom.</p>}
        {orders.map(o => (
          <div key={o.id} className="p-4 rounded-2xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm text-foreground">{o.customer_name}</p>
              <p className="text-xs text-muted-foreground">{o.fabric_detail || 'Custom'} | {o.size_detail || '-'} | {o.payment_method}</p>
              <p className="text-xs font-semibold text-primary mt-1">Rp {formatNumber(o.total_price)}</p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button onClick={() => setViewOrder(o)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Lihat Detail"><Eye size={14} /></button>
              <button onClick={() => { startEdit(o); setShowAdd(false); }} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Edit"><Edit3 size={14} /></button>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColors[o.status] || 'bg-muted text-muted-foreground'}`}>
                {o.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
