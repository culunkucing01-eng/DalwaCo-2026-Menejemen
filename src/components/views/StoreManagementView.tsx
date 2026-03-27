import { useState } from 'react';
import { useAppState, ROLES, DEFAULT_STORES } from '@/lib/store';
import { addDocument, deleteDocument } from '@/lib/firestore';
import { Store, Plus, Trash2, AlertTriangle, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function StoreManagementView() {
  const { currentRole, dynamicStores, addAuditLog } = useAppState();
  const [newStore, setNewStore] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (currentRole !== ROLES.ADMIN) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="mx-auto text-destructive mb-3" size={32} />
        <p className="text-sm text-muted-foreground">Hanya Admin Utama yang bisa mengakses halaman ini.</p>
      </div>
    );
  }

  const handleAdd = async () => {
    const name = newStore.trim();
    if (!name) return;
    if (dynamicStores.includes(name)) {
      toast.error('Nama toko sudah ada!');
      return;
    }
    setAdding(true);
    try {
      await addDocument('storeLocations', { name, createdAt: new Date().toISOString() });
      addAuditLog('Tambah Toko', `Toko baru ditambahkan: ${name}`);
      toast.success(`Toko "${name}" berhasil ditambahkan`);
      setNewStore('');
    } catch (e) {
      toast.error('Gagal menambahkan toko');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (storeName: string) => {
    if (DEFAULT_STORES.includes(storeName)) {
      toast.error('Toko default tidak bisa dihapus!');
      return;
    }
    if (!confirm(`Yakin ingin menghapus "${storeName}"? Pastikan tidak ada stok atau transaksi aktif di toko ini.`)) return;
    
    setDeleting(storeName);
    try {
      // Find the document by name and delete
      const { getDocs, query, where, collection } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const q = query(collection(db, 'storeLocations'), where('name', '==', storeName));
      const snap = await getDocs(q);
      for (const doc of snap.docs) {
        await deleteDocument('storeLocations', doc.id);
      }
      addAuditLog('Hapus Toko', `Toko dihapus: ${storeName}`);
      toast.success(`Toko "${storeName}" berhasil dihapus`);
    } catch (e) {
      toast.error('Gagal menghapus toko');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Store size={20} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Manajemen Toko</h2>
          <p className="text-xs text-muted-foreground">Tambah atau hapus lokasi toko/cabang</p>
        </div>
      </div>

      {/* Add new store */}
      <div className="p-5 rounded-2xl bg-card border border-border">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Plus size={14} className="text-primary" />
          Tambah Toko Baru
        </h3>
        <div className="flex gap-3">
          <input
            className="input-field text-sm flex-1"
            placeholder="Contoh: Store Dalwa 4"
            value={newStore}
            onChange={e => setNewStore(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newStore.trim()}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {adding ? '...' : <><Plus size={14} /> Tambah</>}
          </button>
        </div>
      </div>

      {/* Store list */}
      <div className="p-5 rounded-2xl bg-card border border-border">
        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <MapPin size={14} className="text-primary" />
          Daftar Toko Aktif ({dynamicStores.length})
        </h3>
        <div className="space-y-2">
          {dynamicStores.map((store, i) => {
            const isDefault = DEFAULT_STORES.includes(store);
            return (
              <div
                key={store}
                className="flex items-center justify-between p-3.5 rounded-xl bg-muted/50 border border-border/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{store}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {isDefault ? 'Toko Default' : 'Toko Tambahan'}
                    </p>
                  </div>
                </div>
                {!isDefault && (
                  <button
                    onClick={() => handleDelete(store)}
                    disabled={deleting === store}
                    className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                    title="Hapus toko"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {isDefault && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-md">Default</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 text-xs text-warning-foreground">
        <p className="font-bold mb-1 flex items-center gap-1.5">
          <AlertTriangle size={12} /> Catatan Penting
        </p>
        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
          <li>Toko default (Dalwa Mall, Dalwa Mart, Dalwa 3) tidak bisa dihapus</li>
          <li>Toko baru akan otomatis muncul di semua dropdown (POS, Surat Jalan, Penerimaan, dll)</li>
          <li>Pastikan tidak ada stok/transaksi aktif sebelum menghapus toko</li>
        </ul>
      </div>
    </div>
  );
}
