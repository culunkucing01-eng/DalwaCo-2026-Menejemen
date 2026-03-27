import { useState, useRef } from 'react';
import { backupAllData } from '@/lib/firestore';
import { resetCleanSlate, resetSelectedGroups } from '@/lib/reset-data';
import { restoreFromBackup } from '@/lib/restore-data';
import { useAppState } from '@/lib/store';
import { Download, Trash2, Loader2, AlertTriangle, CheckCircle2, Shield, ShieldAlert, Upload, FileJson, Info, Zap } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

const PROTECTED = ['users', 'whitelist', 'storeProfiles'];

const RESTORABLE_COLLECTIONS = [
  'products', 'materials', 'convectionLogs', 'shippingLogs', 'promos',
  'members', 'receivables', 'auditLogs', 'categories', 'rewards',
  'storeProfiles', 'memberSettings', 'stockRequests', 'salesTransactions',
];

export default function BackupResetView() {
  const { addAuditLog, showMessage } = useAppState();
  const [backingUp, setBackingUp] = useState(false);
  const [backupDone, setBackupDone] = useState(false);

  // Clean slate reset
  const [showCleanSlateModal, setShowCleanSlateModal] = useState(false);
  const [cleanSlateConfirm, setCleanSlateConfirm] = useState('');
  const [cleanSlateResetting, setCleanSlateResetting] = useState(false);
  const [cleanSlateError, setCleanSlateError] = useState('');

  // Restore state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreData, setRestoreData] = useState<Record<string, any[]> | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreCollections, setRestoreCollections] = useState<string[]>([]);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const data = await backupAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dalwaco-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addAuditLog('Backup Data', 'Backup seluruh data berhasil diunduh');
      showMessage('Berhasil: Backup data telah diunduh!');
      setBackupDone(true);
    } catch (err: any) {
      showMessage(`Gagal membuat backup: ${err?.message || 'Unknown error'}`);
    } finally {
      setBackingUp(false);
    }
  };

  // --- Clean Slate Reset ---
  const handleCleanSlateReset = async () => {
    if (cleanSlateConfirm !== 'RESET DALWA') return;
    setCleanSlateResetting(true);
    setCleanSlateError('');
    try {
      const result = await resetCleanSlate();
      addAuditLog('Clean Slate Reset', `Database di-reset total: ${result.totalDeleted} dokumen dihapus dari ${Object.keys(result.deletedCounts).filter(k => result.deletedCounts[k] > 0).join(', ')}`);
      showMessage(`Berhasil: Sistem berhasil di-reset menjadi kosongan! (${result.totalDeleted} dokumen dihapus)`);
      setShowCleanSlateModal(false);
      setCleanSlateConfirm('');
      // Auto reload after 1.5s
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      const errorMsg = err?.message || err?.code || 'Unknown error';
      setCleanSlateError(`Gagal: ${errorMsg}`);
      showMessage(`Gagal reset: ${errorMsg}`);
      console.error('Clean slate reset error:', err);
    } finally {
      setCleanSlateResetting(false);
    }
  };

  // --- Restore handlers ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      showMessage('Peringatan: File harus berformat JSON!');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          showMessage('Peringatan: Format file backup tidak valid!');
          return;
        }
        const validCollections = Object.keys(parsed).filter(
          k => RESTORABLE_COLLECTIONS.includes(k) && Array.isArray(parsed[k]) && parsed[k].length > 0
        );
        if (validCollections.length === 0) {
          showMessage('Peringatan: Tidak ada data yang bisa di-restore dari file ini!');
          return;
        }
        setRestoreData(parsed);
        setRestoreFileName(file.name);
        setRestoreCollections(validCollections);
      } catch {
        showMessage('Peringatan: File JSON tidak valid atau rusak!');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleRestoreCollection = (name: string) => {
    setRestoreCollections(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const handleStartRestore = () => {
    if (restoreCollections.length === 0) {
      showMessage('Peringatan: Pilih minimal satu koleksi untuk di-restore!');
      return;
    }
    setShowRestoreModal(true);
    setRestoreConfirmText('');
  };

  const handleConfirmRestore = async () => {
    if (restoreConfirmText !== 'RESTORE DALWA' || !restoreData) return;
    setRestoring(true);
    try {
      const dataToRestore: Record<string, any[]> = {};
      for (const col of restoreCollections) {
        if (restoreData[col]) dataToRestore[col] = restoreData[col];
      }
      const result = await restoreFromBackup(dataToRestore);
      addAuditLog('Restore Data', `Restore dari ${restoreFileName}: ${restoreCollections.join(', ')} (${result.totalDocs} dokumen)`);
      showMessage(`Berhasil: ${result.totalDocs} dokumen telah di-restore!`);
      setShowRestoreModal(false);
      setRestoreConfirmText('');
      setRestoreData(null);
      setRestoreFileName('');
      setRestoreCollections([]);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      showMessage(`Gagal restore: ${err?.message || 'Unknown error'}`);
    } finally {
      setRestoring(false);
    }
  };

  const cancelRestore = () => {
    setRestoreData(null);
    setRestoreFileName('');
    setRestoreCollections([]);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-foreground">Backup & Reset Data</h2>
        <p className="text-xs text-muted-foreground">Kelola data sistem secara menyeluruh.</p>
      </div>

      {/* Backup Section */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Download size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">Backup Seluruh Data</h3>
            <p className="text-xs text-muted-foreground">Unduh semua data dalam format JSON.</p>
          </div>
        </div>
        <button onClick={handleBackup} disabled={backingUp}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
          {backingUp ? <><Loader2 size={16} className="animate-spin" /> Membuat Backup...</> :
           backupDone ? <><CheckCircle2 size={16} /> Unduh Backup Lagi</> :
           <><Download size={16} /> Unduh Backup Sekarang</>}
        </button>
      </div>

      {/* Restore Section */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Upload size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">Restore Data dari Backup</h3>
            <p className="text-xs text-muted-foreground">Import data dari file backup JSON yang sudah diunduh.</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-accent/50 border border-accent text-xs text-muted-foreground">
          <Info size={14} className="text-primary shrink-0 mt-0.5" />
          <span>Restore akan <strong>menambahkan</strong> data dari backup ke database. Data yang sudah ada <strong>tidak akan terhapus</strong> (merge). Jika ingin replace, lakukan Reset terlebih dahulu.</span>
        </div>

        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />

        {!restoreData ? (
          <button onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground font-bold text-sm flex items-center justify-center gap-2 hover:bg-muted/50 transition-colors">
            <FileJson size={16} /> Pilih File Backup (.json)
          </button>
        ) : (
          <div className="space-y-4 p-4 rounded-xl border border-border bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileJson size={16} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">{restoreFileName}</span>
              </div>
              <button onClick={cancelRestore} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Ganti file
              </button>
            </div>
            <p className="text-xs font-bold text-foreground">Pilih koleksi yang akan di-restore:</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(restoreData).filter(k => RESTORABLE_COLLECTIONS.includes(k) && Array.isArray(restoreData[k]) && restoreData[k].length > 0).map(col => (
                <label key={col}
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${
                    restoreCollections.includes(col)
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-card hover:bg-muted/50'
                  }`}>
                  <Checkbox checked={restoreCollections.includes(col)} onCheckedChange={() => toggleRestoreCollection(col)} />
                  <span className="text-foreground font-medium">{col}</span>
                  <span className="text-muted-foreground ml-auto">({restoreData[col].length})</span>
                </label>
              ))}
            </div>
            <button onClick={handleStartRestore}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
              <Upload size={16} /> Restore {restoreCollections.length} Koleksi
            </button>
          </div>
        )}
      </div>

      {/* Clean Slate Reset Section */}
      <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Zap size={20} className="text-destructive" />
          </div>
          <div>
            <h3 className="font-bold text-destructive text-base">🔥 Clean Slate — Reset Total Database</h3>
            <p className="text-xs text-muted-foreground">Hapus SELURUH data untuk persiapan launching. Tidak bisa dikembalikan!</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-accent/50 border border-accent text-xs text-muted-foreground">
          <Shield size={14} className="text-primary shrink-0 mt-0.5" />
          <div>
            <strong className="text-primary">Data yang DILINDUNGI (tidak akan terhapus):</strong>
            <p className="mt-1">{PROTECTED.join(' • ')}</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-foreground space-y-1">
          <p className="font-bold text-destructive">Yang akan DIHAPUS:</p>
          <p>• Semua Produk (products) & Kategori</p>
          <p>• Semua Transaksi POS & Piutang</p>
          <p>• Semua Data Produksi, Material, Konveksi</p>
          <p>• Semua Stok Request & Pengiriman</p>
          <p>• Semua Absensi, Promo, Member, Reward</p>
          <p>• Semua Audit Log & Login Log</p>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 text-xs text-muted-foreground">
          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
          <span><strong>PENTING:</strong> Pastikan Anda sudah membuat <strong>BACKUP</strong> sebelum melakukan reset!</span>
        </div>

        <button onClick={() => { setShowCleanSlateModal(true); setCleanSlateConfirm(''); setCleanSlateError(''); }}
          className="w-full py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
          <ShieldAlert size={16} /> Reset Total Database (Clean Slate)
        </button>
      </div>

      {/* Clean Slate Confirmation Modal */}
      {showCleanSlateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-destructive/30 p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <ShieldAlert size={20} className="text-destructive" />
              </div>
              <h3 className="font-bold text-destructive text-lg">⚠️ Konfirmasi Clean Slate</h3>
            </div>
            <div className="text-xs text-muted-foreground space-y-2">
              <p>Anda akan menghapus <strong>SELURUH</strong> data database secara <strong>permanen</strong>.</p>
              <p>Yang <strong>aman</strong>: users, whitelist, storeProfiles</p>
              <p className="text-destructive font-bold">Aksi ini TIDAK BISA dikembalikan tanpa backup!</p>
            </div>

            {cleanSlateError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive font-mono">
                {cleanSlateError}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-destructive block mb-1.5">
                Ketik <span className="font-mono bg-destructive/10 px-1.5 py-0.5 rounded">RESET DALWA</span> untuk konfirmasi:
              </label>
              <input
                className="w-full px-3 py-2.5 rounded-xl border border-destructive/30 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-destructive/50"
                value={cleanSlateConfirm}
                onChange={e => setCleanSlateConfirm(e.target.value)}
                placeholder="RESET DALWA"
                autoFocus
                disabled={cleanSlateResetting}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowCleanSlateModal(false); setCleanSlateConfirm(''); setCleanSlateError(''); }}
                disabled={cleanSlateResetting}
                className="flex-1 py-2.5 rounded-xl bg-muted text-muted-foreground font-bold text-sm hover:bg-muted/80 transition-colors disabled:opacity-50">
                Batal
              </button>
              <button onClick={handleCleanSlateReset}
                disabled={cleanSlateConfirm !== 'RESET DALWA' || cleanSlateResetting}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity">
                {cleanSlateResetting 
                  ? <><Loader2 size={14} className="animate-spin" /> Mereset Database... Mohon Tunggu</>
                  : <><Trash2 size={14} /> Konfirmasi Hapus Total</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-primary/30 p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Upload size={20} className="text-primary" />
              </div>
              <h3 className="font-bold text-primary text-lg">Konfirmasi Restore Data</h3>
            </div>
            <div className="text-xs text-muted-foreground space-y-2">
              <p>Data berikut akan di-import dari <strong>{restoreFileName}</strong>:</p>
              <ul className="list-disc pl-5 space-y-1">
                {restoreCollections.map(col => (
                  <li key={col} className="text-foreground font-medium">{col} ({restoreData?.[col]?.length || 0} dokumen)</li>
                ))}
              </ul>
            </div>
            <div>
              <label className="text-xs font-semibold text-primary block mb-1.5">
                Ketik <span className="font-mono bg-primary/10 px-1.5 py-0.5 rounded">RESTORE DALWA</span> untuk konfirmasi:
              </label>
              <input
                className="w-full px-3 py-2.5 rounded-xl border border-primary/30 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={restoreConfirmText}
                onChange={e => setRestoreConfirmText(e.target.value)}
                placeholder="RESTORE DALWA"
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowRestoreModal(false); setRestoreConfirmText(''); }}
                className="flex-1 py-2.5 rounded-xl bg-muted text-muted-foreground font-bold text-sm hover:bg-muted/80 transition-colors">
                Batal
              </button>
              <button onClick={handleConfirmRestore}
                disabled={restoreConfirmText !== 'RESTORE DALWA' || restoring}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity">
                {restoring ? <><Loader2 size={14} className="animate-spin" /> Restoring...</> : <><Upload size={14} /> Konfirmasi Restore</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
