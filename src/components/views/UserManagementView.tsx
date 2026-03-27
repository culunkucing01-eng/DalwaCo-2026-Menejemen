import { useState, useEffect } from 'react';
import { useAppState, ROLES, STORES } from '@/lib/store';
import {
  subscribeWhitelist,
  subscribeLoginLogs,
  firestoreAddWhitelist,
  firestoreDeleteWhitelist,
} from '@/lib/firestore';
import { UserPlus, Trash2, Shield, Warehouse, ShoppingCart, Clock, X, Store, Users } from 'lucide-react';

export interface WhitelistEntry {
  id: string;
  email: string;
  role: string;
  displayName: string;
  store?: string;
  wa?: string;
  customer_type?: string;
  member_id?: string;
  addedBy: string;
  timestamp: string;
}

export interface LoginLog {
  id: string;
  email: string;
  displayName: string;
  role: string;
  loginAt: string;
  date: string; // YYYY-MM-DD for filtering
}

const roleIcons: Record<string, React.ReactNode> = {
  'Admin Utama': <Shield size={14} />,
  'Admin Gudang': <Warehouse size={14} />,
  'Kasir Toko': <ShoppingCart size={14} />,
  'Pelanggan': <Users size={14} />,
};

const roleColors: Record<string, string> = {
  'Admin Utama': 'bg-primary/10 text-primary',
  'Admin Gudang': 'bg-accent/50 text-accent-foreground',
  'Kasir Toko': 'bg-success/10 text-success',
  'Pelanggan': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export default function UserManagementView() {
  const { showMessage, currentRole } = useAppState();
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'Admin Gudang', displayName: '', store: STORES[0], wa: '', customer_type: 'Regular', member_id: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const unsubs = [
      subscribeWhitelist(setWhitelist),
      subscribeLoginLogs(setLoginLogs),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const isAdmin = currentRole === ROLES.ADMIN;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) {
      showMessage('Peringatan: Email wajib diisi!');
      return;
    }
    if (whitelist.some(w => w.email.toLowerCase() === form.email.toLowerCase())) {
      showMessage('Peringatan: Email sudah ada di whitelist!');
      return;
    }
    try {
      const entry: Record<string, string> = {
        email: form.email.toLowerCase().trim(),
        role: form.role,
        displayName: form.displayName.trim(),
        store: form.role === 'Kasir Toko' ? form.store : '',
        addedBy: 'Admin Utama',
        timestamp: new Date().toISOString(),
      };
      if (form.role === 'Pelanggan') {
        entry.wa = form.wa.trim();
        entry.customer_type = form.customer_type;
        entry.member_id = form.member_id.trim();
      }
      await firestoreAddWhitelist(entry as any);
      showMessage(`Berhasil: ${form.email} ditambahkan ke whitelist!`);
      setForm({ email: '', role: 'Admin Gudang', displayName: '', store: STORES[0], wa: '', customer_type: 'Regular', member_id: '' });
      setShowAdd(false);
    } catch {
      showMessage('Gagal menambahkan ke whitelist.');
    }
  };

  const handleDelete = async (entry: WhitelistEntry) => {
    try {
      await firestoreDeleteWhitelist(entry.id);
      showMessage(`Berhasil: ${entry.email} dihapus dari whitelist.`);
      setDeleteConfirm(null);
    } catch {
      showMessage('Gagal menghapus dari whitelist.');
    }
  };

  const filteredLogs = loginLogs.filter(l => l.date === filterDate);

  if (!isAdmin) return null;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Manajemen User & Whitelist</h2>
          <p className="text-xs text-muted-foreground">Kelola akses login dan pantau aktivitas harian</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
        >
          {showAdd ? <X size={16} /> : <UserPlus size={16} />}
          {showAdd ? 'Batal' : 'Tambah Whitelist'}
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-5 rounded-2xl border border-border bg-card">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Nama Lengkap</label>
            <input
              className="input-field mt-1"
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
              placeholder="Ahmad Fauzi"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Email</label>
            <input
              className="input-field mt-1"
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="user@dalwaco.com"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Role</label>
            <select
              data-testid="select-role"
              className="input-field mt-1"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option>Admin Gudang</option>
              <option>Kasir Toko</option>
              <option>Admin Utama</option>
              <option>Pelanggan</option>
            </select>
          </div>
          {form.role === 'Kasir Toko' && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Penempatan Store</label>
              <select
                className="input-field mt-1"
                value={form.store}
                onChange={e => setForm({ ...form, store: e.target.value })}
              >
                {STORES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {form.role === 'Pelanggan' && (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">No. WA (untuk piutang)</label>
                <input
                  data-testid="input-wa-pelanggan"
                  className="input-field mt-1"
                  value={form.wa}
                  onChange={e => setForm({ ...form, wa: e.target.value })}
                  placeholder="6281234567890"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Tipe Customer</label>
                <select
                  data-testid="select-customer-type"
                  className="input-field mt-1"
                  value={form.customer_type}
                  onChange={e => setForm({ ...form, customer_type: e.target.value })}
                >
                  <option>Regular</option>
                  <option>Reseller</option>
                  <option>VVIP 1</option>
                  <option>VVIP 2</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">ID Member (opsional)</label>
                <input
                  data-testid="input-member-id"
                  className="input-field mt-1"
                  value={form.member_id}
                  onChange={e => setForm({ ...form, member_id: e.target.value })}
                  placeholder="ID dari tabel Member"
                />
              </div>
            </>
          )}
          <div className="flex items-end">
            <button
              type="submit"
              data-testid="button-submit-whitelist"
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity"
            >
              Simpan
            </button>
          </div>
        </form>
      )}

      {/* Whitelist Table */}
      <div>
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Shield size={16} /> Daftar Whitelist ({whitelist.length} user)
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nama / Email</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Store</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Ditambahkan</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {whitelist.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Belum ada user di whitelist. Tambahkan user agar bisa login.
                </td></tr>
              )}
              {whitelist.map(w => (
                <tr key={w.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-bold text-foreground">{w.displayName || '-'}</p>
                    <p className="text-xs text-muted-foreground">{w.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${roleColors[w.role] || 'bg-muted text-muted-foreground'}`}>
                      {roleIcons[w.role]} {w.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-medium">
                    {w.store ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                        <Store size={10} /> {w.store}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(w.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    {deleteConfirm === w.id ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleDelete(w)} className="px-2 py-1 rounded-lg bg-destructive text-destructive-foreground text-[10px] font-bold hover:opacity-90">
                          Hapus
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-bold hover:bg-muted/80">
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(w.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Login Logs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Clock size={16} /> Log Login Harian
          </h3>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="input-field text-xs w-auto"
          />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Waktu Login</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Tidak ada login pada tanggal ini.
                </td></tr>
              )}
              {filteredLogs.map(l => (
                <tr key={l.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-bold text-foreground">{l.displayName}</p>
                    <p className="text-xs text-muted-foreground">{l.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${roleColors[l.role] || 'bg-muted text-muted-foreground'}`}>
                      {roleIcons[l.role]} {l.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(l.loginAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
