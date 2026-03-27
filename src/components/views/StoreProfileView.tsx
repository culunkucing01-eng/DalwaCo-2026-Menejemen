import { useState } from 'react';
import { useAppState, STORES, ROLES, type StoreProfile } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { firestoreAddStoreProfile, firestoreUpdateStoreProfile } from '@/lib/firestore';
import { Store, Save, Edit2 } from 'lucide-react';

export default function StoreProfileView() {
  const { storeProfiles, setStoreProfiles, addAuditLog, showMessage, currentRole, kasirStore } = useAppState();
  const { profile } = useAuth();
  const [editingStore, setEditingStore] = useState<string | null>(null);
  const [form, setForm] = useState({ address: '', npwp: '', thank_you_message: '', feedback_contact: '' });

  // Kasir only sees their own store, Admin sees all
  const visibleStores = currentRole === ROLES.KASIR ? [kasirStore] : STORES;

  const startEdit = (storeName: string) => {
    const existing = storeProfiles.find(p => p.store_name === storeName);
    setForm({
      address: existing?.address || '',
      npwp: existing?.npwp || '',
      thank_you_message: existing?.thank_you_message || 'Terima kasih atas kunjungan Anda!',
      feedback_contact: existing?.feedback_contact || '',
    });
    setEditingStore(storeName);
  };

  const handleSave = async () => {
    if (!editingStore) return;
    const existing = storeProfiles.find(p => p.store_name === editingStore);
    try {
      if (existing) {
        await firestoreUpdateStoreProfile(existing.id, form);
        setStoreProfiles(prev => prev.map(p => p.id === existing.id ? { ...p, ...form } : p));
      } else {
        const data = { store_name: editingStore, ...form, timestamp: new Date().toISOString() };
        const id = await firestoreAddStoreProfile(data);
        setStoreProfiles(prev => [...prev, { ...data, id }]);
      }
      addAuditLog('Profil Toko', `Update profil ${editingStore}`);
      showMessage('Berhasil: Profil toko disimpan!');
      setEditingStore(null);
    } catch {
      showMessage('Gagal menyimpan profil toko.');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-foreground">Profil Toko</h2>
        <p className="text-xs text-muted-foreground">
          {currentRole === ROLES.KASIR
            ? `Kelola profil ${kasirStore} — alamat, NPWP, dan ucapan yang tampil di struk belanja.`
            : 'Kelola alamat, NPWP, dan ucapan yang tampil di struk belanja setiap toko.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleStores.map(storeName => {
          const storeProfile = storeProfiles.find(p => p.store_name === storeName);
          return (
            <div key={storeName} className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Store size={18} className="text-primary" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">{storeName}</h3>
                </div>
                <button onClick={() => startEdit(storeName)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <Edit2 size={14} className="text-muted-foreground" />
                </button>
              </div>
              {storeProfile ? (
                <div className="space-y-2 text-xs">
                  <div><span className="text-muted-foreground">Alamat:</span> <span className="text-foreground font-medium">{storeProfile.address || '-'}</span></div>
                  <div><span className="text-muted-foreground">NPWP:</span> <span className="text-foreground font-medium">{storeProfile.npwp || '-'}</span></div>
                  <div><span className="text-muted-foreground">Ucapan:</span> <span className="text-foreground font-medium">{storeProfile.thank_you_message || '-'}</span></div>
                  <div><span className="text-muted-foreground">Kritik & Saran:</span> <span className="text-foreground font-medium">{storeProfile.feedback_contact || '-'}</span></div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Belum diatur. Klik ikon edit untuk mengisi.</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingStore && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl animate-fade-in">
            <div className="p-5 border-b border-border">
              <h3 className="font-bold text-foreground">Edit Profil: {editingStore}</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Alamat Toko</label>
                <textarea className="input-field mt-1 text-xs" rows={2} value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Jl. Contoh No. 123, Kota..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">NPWP</label>
                <input className="input-field mt-1 text-xs" value={form.npwp}
                  onChange={e => setForm({ ...form, npwp: e.target.value })} placeholder="XX.XXX.XXX.X-XXX.XXX" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Ucapan Terima Kasih (tampil di struk)</label>
                <textarea className="input-field mt-1 text-xs" rows={2} value={form.thank_you_message}
                  onChange={e => setForm({ ...form, thank_you_message: e.target.value })} placeholder="Terima kasih atas kunjungan Anda!" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Kritik & Saran (kontak/WA)</label>
                <input className="input-field mt-1 text-xs" value={form.feedback_contact}
                  onChange={e => setForm({ ...form, feedback_contact: e.target.value })} placeholder="WA: 08xxxxxxxxxx" />
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => setEditingStore(null)} className="flex-1 py-2.5 rounded-xl bg-muted text-muted-foreground font-bold text-xs">Batal</button>
              <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-2">
                <Save size={14} /> Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
