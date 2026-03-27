import { useState } from 'react';
import { useAppState, formatNumber, unformatNumber } from '@/lib/store';
import { firestoreAddPromo, firestoreUpdatePromo } from '@/lib/firestore';
import { Plus, X, Edit3, Check } from 'lucide-react';

export default function PromosView() {
  const { promos, products, addAuditLog, showMessage, categories } = useAppState();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ promo_name: '', type: 'Persentase', value: '', target: 'Semua Kategori', end_date: '', target_sku: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ promo_name: '', type: '', value: '', target: '', end_date: '', target_sku: '', is_active: true });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.promo_name || !form.value || !form.end_date) { showMessage('Peringatan: Data belum lengkap!'); return; }
    await firestoreAddPromo({
      promo_name: form.promo_name, type: form.type,
      value: parseInt(form.value), target: form.target, end_date: form.end_date, is_active: true,
      target_sku: form.target_sku || '',
    } as any);
    addAuditLog('Tambah Promo', `Membuat promo ${form.promo_name}`);
    showMessage(`Berhasil: Promo ${form.promo_name} diterbitkan.`);
    setShowAdd(false);
    setForm({ promo_name: '', type: 'Persentase', value: '', target: 'Semua Kategori', end_date: '', target_sku: '' });
  };

  const startEdit = (p: any) => {
    setEditId(p.id);
    setEditForm({ promo_name: p.promo_name, type: p.type, value: String(p.value), target: p.target, end_date: p.end_date, target_sku: p.target_sku || '', is_active: p.is_active });
  };

  const handleEdit = async (p: any) => {
    if (!editForm.promo_name || !editForm.value) { showMessage('Peringatan: Data belum lengkap!'); return; }
    try {
      const updates = { promo_name: editForm.promo_name, type: editForm.type, value: parseInt(editForm.value), target: editForm.target, end_date: editForm.end_date, target_sku: editForm.target_sku, is_active: editForm.is_active };
      await firestoreUpdatePromo(p.id, updates);
      addAuditLog('Edit Promo', `Promo diedit: ${editForm.promo_name}`);
      showMessage('Berhasil: Promo diperbarui.');
      setEditId(null);
    } catch { showMessage('Gagal memperbarui promo.'); }
  };

  // Get product for SKU display
  const getProductBySku = (sku: string) => products.find(p => p.sku === sku);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Manajemen Promo Terpusat</h2>
          <p className="text-xs text-muted-foreground">Promo aktif otomatis di seluruh layar Kasir POS.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
          {showAdd ? <X size={16} /> : <Plus size={16} />} {showAdd ? 'Batal' : 'Buat Promo'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl border border-border bg-card">
          <div><label className="text-xs font-semibold text-muted-foreground">Nama Promo</label><input className="input-field mt-1" value={form.promo_name} onChange={e => setForm({ ...form, promo_name: e.target.value })} placeholder="Payday Sale" /></div>
          <div><label className="text-xs font-semibold text-muted-foreground">Target Kategori</label>
            <select className="input-field mt-1" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>
              {['Semua Kategori', ...categories].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-semibold text-muted-foreground">Target Produk (SKU/Barcode)</label>
            <select className="input-field mt-1" value={form.target_sku} onChange={e => setForm({ ...form, target_sku: e.target.value })}>
              <option value="">-- Semua Produk --</option>
              {products.map(p => <option key={p.id} value={p.sku}>[{p.sku}] {p.name}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-semibold text-muted-foreground">Jenis Potongan</label>
            <select className="input-field mt-1" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="Persentase">Diskon Persen (%)</option>
              <option value="Nominal">Potongan Harga (Rp)</option>
              <option value="Buy1Get1">Buy 1 Get 1</option>
            </select>
          </div>
          <div><label className="text-xs font-semibold text-muted-foreground">Nilai Diskon</label>
            <input className="input-field mt-1" value={form.type === 'Persentase' ? form.value : formatNumber(form.value)} onChange={e => setForm({ ...form, value: form.type === 'Persentase' ? e.target.value.replace(/\D/g, '') : unformatNumber(e.target.value) })} disabled={form.type === 'Buy1Get1'} />
          </div>
          <div><label className="text-xs font-semibold text-muted-foreground">Batas Akhir</label><input className="input-field mt-1" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
          <div className="md:col-span-3"><button type="submit" className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">Publish Promo</button></div>
        </form>
      )}

      {/* Edit Form */}
      {editId && (() => {
        const p = promos.find(pr => pr.id === editId);
        if (!p) return null;
        return (
          <div className="p-5 rounded-2xl border-2 border-primary/30 bg-card space-y-4">
            <h3 className="font-bold text-foreground flex items-center gap-2"><Edit3 size={16} className="text-primary" /> Edit Promo: {p.promo_name}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="text-xs font-semibold text-muted-foreground">Nama Promo</label><input className="input-field mt-1" value={editForm.promo_name} onChange={e => setEditForm({ ...editForm, promo_name: e.target.value })} /></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Target Kategori</label>
                <select className="input-field mt-1" value={editForm.target} onChange={e => setEditForm({ ...editForm, target: e.target.value })}>
                  {['Semua Kategori', ...categories].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="text-xs font-semibold text-muted-foreground">Target SKU</label>
                <select className="input-field mt-1" value={editForm.target_sku} onChange={e => setEditForm({ ...editForm, target_sku: e.target.value })}>
                  <option value="">-- Semua Produk --</option>
                  {products.map(pr => <option key={pr.id} value={pr.sku}>[{pr.sku}] {pr.name}</option>)}
                </select>
              </div>
              <div><label className="text-xs font-semibold text-muted-foreground">Jenis Potongan</label>
                <select className="input-field mt-1" value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })}>
                  <option value="Persentase">Diskon Persen (%)</option>
                  <option value="Nominal">Potongan Harga (Rp)</option>
                  <option value="Buy1Get1">Buy 1 Get 1</option>
                </select>
              </div>
              <div><label className="text-xs font-semibold text-muted-foreground">Nilai</label>
                <input className="input-field mt-1" value={editForm.type === 'Persentase' ? editForm.value : formatNumber(editForm.value)} onChange={e => setEditForm({ ...editForm, value: editForm.type === 'Persentase' ? e.target.value.replace(/\D/g, '') : unformatNumber(e.target.value) })} />
              </div>
              <div><label className="text-xs font-semibold text-muted-foreground">Batas Akhir</label><input className="input-field mt-1" type="date" value={editForm.end_date} onChange={e => setEditForm({ ...editForm, end_date: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(p)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90"><Check size={14} /> Simpan</button>
              <button onClick={() => setEditId(null)} className="px-5 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-bold hover:bg-muted/80">Batal</button>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {promos.map(p => {
          const isActive = new Date(p.end_date) >= new Date() && p.is_active;
          const targetProduct = (p as any).target_sku ? getProductBySku((p as any).target_sku) : null;
          return (
            <div key={p.id} className="p-5 rounded-2xl border border-border bg-card">
              <div className="flex items-start justify-between">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                  {isActive ? 'Aktif' : 'Expired'}
                </span>
                <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"><Edit3 size={14} /></button>
              </div>
              <p className="font-bold text-foreground mt-2">{p.promo_name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Target: {p.target} | Diskon: {p.type === 'Persentase' ? `${p.value}%` : p.type === 'Nominal' ? `Rp ${formatNumber(p.value)}` : 'B1G1'}
              </p>
              {targetProduct && (
                <p className="text-xs text-primary mt-1 font-semibold">
                  SKU: [{targetProduct.sku}] {targetProduct.name}
                </p>
              )}
              {(p as any).target_sku && !targetProduct && (
                <p className="text-xs text-muted-foreground mt-1">SKU: {(p as any).target_sku}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
