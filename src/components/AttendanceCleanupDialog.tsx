import { useState, useEffect } from 'react';
import { Download, Trash2, X, AlertTriangle, Loader2, Camera } from 'lucide-react';
import { getExpiredAttendanceRecords, deleteExpiredAttendanceRecords, type AttendanceRecord } from '@/lib/attendance';

export default function AttendanceCleanupDialog() {
  const [expiredRecords, setExpiredRecords] = useState<AttendanceRecord[]>([]);
  const [show, setShow] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Check for expired records on mount
    const checkExpired = async () => {
      try {
        const records = await getExpiredAttendanceRecords(30);
        if (records.length > 0) {
          setExpiredRecords(records);
          setShow(true);
        }
      } catch (e) {
        console.warn('Failed to check expired attendance:', e);
      } finally {
        setChecked(true);
      }
    };
    checkExpired();
  }, []);

  const handleDownloadBackup = async () => {
    setDownloading(true);
    try {
      // Create a text manifest with photo URLs for backup
      const manifest = expiredRecords.map(r => 
        `${r.timestamp} | ${r.userName} | ${r.store} | ${r.photoUrl}`
      ).join('\n');
      
      const blob = new Blob([
        `BACKUP FOTO ABSENSI DALWA.CO\n`,
        `Tanggal Export: ${new Date().toLocaleString('id-ID')}\n`,
        `Total: ${expiredRecords.length} foto\n`,
        `${'='.repeat(60)}\n\n`,
        manifest,
        `\n\n${'='.repeat(60)}\n`,
        `Buka URL di atas untuk mengunduh masing-masing foto.\n`,
      ], { type: 'text/plain' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-absensi-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);

      // Also download each photo
      for (const record of expiredRecords) {
        try {
          const response = await fetch(record.photoUrl);
          const photoBlob = await response.blob();
          const photoUrl = URL.createObjectURL(photoBlob);
          const link = document.createElement('a');
          link.href = photoUrl;
          link.download = `absensi_${record.userName}_${record.timestamp.slice(0, 10)}.jpg`;
          link.click();
          URL.revokeObjectURL(photoUrl);
          // Small delay between downloads
          await new Promise(r => setTimeout(r, 300));
        } catch {
          console.warn(`Failed to download photo for ${record.userName}`);
        }
      }
    } catch (e) {
      console.error('Backup download failed:', e);
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      await deleteExpiredAttendanceRecords(expiredRecords);
      setExpiredRecords([]);
      setShow(false);
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setDeleting(false);
    }
  };

  if (!show || expiredRecords.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-warning" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Pembersihan Foto Absensi</h3>
                <p className="text-xs text-muted-foreground">Otomatis setiap 30 hari</p>
              </div>
            </div>
            <button onClick={() => setShow(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
              <X size={16} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="p-4 rounded-xl bg-warning/5 border border-warning/20">
            <p className="text-sm text-foreground">
              Ditemukan <strong className="text-warning">{expiredRecords.length} foto absensi</strong> yang sudah lebih dari 30 hari.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Foto-foto ini akan dihapus untuk menghemat penyimpanan. Silakan unduh backup terlebih dahulu.
            </p>
          </div>

          {/* Preview list */}
          <div className="max-h-40 overflow-y-auto space-y-2">
            {expiredRecords.slice(0, 5).map((r, i) => (
              <div key={r.id || i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Camera size={14} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{r.userName} — {r.store}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(r.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
            {expiredRecords.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">...dan {expiredRecords.length - 5} foto lainnya</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 pt-0 space-y-2">
          <button
            onClick={handleDownloadBackup}
            disabled={downloading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {downloading ? (
              <><Loader2 size={16} className="animate-spin" /> Mengunduh Backup...</>
            ) : (
              <><Download size={16} /> Unduh Backup Semua Foto</>
            )}
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={deleting}
            className="w-full py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {deleting ? (
              <><Loader2 size={16} className="animate-spin" /> Menghapus...</>
            ) : (
              <><Trash2 size={16} /> Hapus {expiredRecords.length} Foto Lama</>
            )}
          </button>
          <button
            onClick={() => setShow(false)}
            className="w-full py-2.5 rounded-xl bg-muted text-muted-foreground font-semibold text-xs hover:bg-muted/80 transition-colors"
          >
            Ingatkan Nanti
          </button>
        </div>
      </div>
    </div>
  );
}
