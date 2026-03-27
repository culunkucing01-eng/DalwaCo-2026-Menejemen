import { useState, useEffect } from 'react';
import { useAppState, formatNumber, unformatNumber } from '@/lib/store';
import { firestoreAddMaterial, firestoreUpdateMaterial, addDocument, subscribeToCollectionPublic } from '@/lib/firestore';
import { Plus, X, Edit3, Check, History, ChevronDown, ChevronUp, Trash2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface MaterialEditLog {
  id: string;
  material_id: string;
  material_name: string;
  edited_by: string;
  timestamp: string;
  changes: string;
  before: Record<string, any>;
  after: Record<string, any>;
}

export default function WarehouseView() {
  const { materials, setMaterials, addAuditLog, showMessage, currentRole } = useAppState();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: '', factory: '', meters: '', width: '', price_per_meter: '', status: 'Lunas', due_date: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ type: '', factory: '', meters: '', width: '', price_per_meter: '', status: '', due_date: '' });
  const [editLogs, setEditLogs] = useState<MaterialEditLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyMaterialId, setHistoryMaterialId] = useState<string | null>(null);

  // Soft delete state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Subscribe to edit logs
  useEffect(() => {
    const unsub = subscribeToCollectionPublic<MaterialEditLog>(
      'materialEditLogs',
      (data) => setEditLogs(data),
      undefined,
      'timestamp'
    );
    return unsub;
  }, []);

  // Filter out soft-deleted materials for non-admin views
  const visibleMaterials = materials.filter(m => (m as any).status !== 'deleted');

  const startEdit = (m: any) => {
    setEditId(m.id);
    setEditForm({ type: m.type, factory: m.factory, meters: String(m.meters_total), width: String(m.width || ''), price_per_meter: String(m.price_per_meter), status: m.status, due_date: m.due_date || '' });
  };

  const buildChangeSummary = (before: Record<string, any>, after: Record<string, any>): string => {
    const labels: Record<string, string> = { type: 'Jenis Kain', factory: 'Pabrik', meters_total: 'Meter', width: 'Lebar', price_per_meter: 'Harga/m', status: 'Status', due_date: 'Jatuh Tempo' };
    const changes: string[] = [];
    for (const key of Object.keys(after)) {
      if (String(before[key] ?? '') !== String(after[key] ?? '')) {
        changes.push(`${labels[key] || key}: "${before[key] ?? '-'}" → "${after[key] ?? '-'}"`);
      }
    }
    return changes.length > 0 ? changes.join(', ') : 'Tidak ada perubahan';
  };

  const handleEdit = async (m: any) => {
    if (!editForm.type || !editForm.meters || !editForm.price_per_meter) { showMessage('Peringatan: Data belum lengkap!'); return; }
    const totalCost = parseFloat(editForm.meters) * parseInt(editForm.price_per_meter);
    const before = { type: m.type, factory: m.factory, meters_total: m.meters_total, width: m.width || null, price_per_meter: m.price_per_meter, status: m.status, due_date: m.due_date || '' };
    const after = { type: editForm.type, factory: editForm.factory, meters_total: parseFloat(editForm.meters), width: editForm.width ? parseFloat(editForm.width) : null, price_per_meter: parseInt(editForm.price_per_meter), status: editForm.status, due_date: editForm.due_date };
    try {
      const updates: any = { ...after, total_cost: totalCost };
      await firestoreUpdateMaterial(m.id, updates);
      setMaterials(prev => prev.map(mat => mat.id === m.id ? { ...mat, ...updates } : mat));
      const changeSummary = buildChangeSummary(before, after);
      await addDocument('materialEditLogs', {
        material_id: m.id, material_name: editForm.type, edited_by: currentRole || 'Unknown',
        timestamp: new Date().toISOString(), changes: changeSummary, before, after,
      });
      addAuditLog('Edit Kain', `Kain diedit: ${editForm.type} — ${changeSummary}`);
      showMessage('Berhasil: Data kain diperbarui.');
      setEditId(null);
    } catch { showMessage('Gagal memperbarui data kain.'); }
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget || !deleteReason.trim()) { showMessage('Peringatan: Alasan penghapusan wajib diisi!'); return; }
    try {
      await firestoreUpdateMaterial(deleteTarget.id, {
        status: 'deleted',
        deleted_by: currentRole || 'Unknown',
        deleted_at: new Date().toISOString(),
        delete_reason: deleteReason.trim(),
      } as any);
      setMaterials(prev => prev.map(m => m.id === deleteTarget.id ? { ...m, status: 'deleted' } as any : m));
      addAuditLog('Hapus Kain (Soft Delete)', `Kain "${deleteTarget.type}" dihapus oleh ${currentRole}. Alasan: ${deleteReason.trim()}`);
      await addDocument('materialDeleteLogs', {
        material_id: deleteTarget.id,
        material_name: deleteTarget.type,
        deleted_by: currentRole || 'Unknown',
        timestamp: new Date().toISOString(),
        reason: deleteReason.trim(),
        original_data: { type: deleteTarget.type, factory: deleteTarget.factory, meters_total: deleteTarget.meters_total, total_cost: deleteTarget.total_cost },
      });
      showMessage('Berhasil: Data kain telah dihapus (soft delete).');
      setDeleteTarget(null); setDeleteReason('');
    } catch { showMessage('Gagal menghapus data kain.'); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.type || !form.meters || !form.price_per_meter) { showMessage('Peringatan: Data belum lengkap!'); return; }
    const totalCost = parseFloat(form.meters) * parseInt(form.price_per_meter);
    const newMat: any = { type: form.type, factory: form.factory, meters_total: parseFloat(form.meters), width: form.width ? parseFloat(form.width) : null, price_per_meter: parseInt(form.price_per_meter), total_cost: totalCost, status: form.status, due_date: form.due_date, timestamp: new Date().toISOString() };
    try {
      const id = await firestoreAddMaterial(newMat);
      setMaterials(prev => [...prev, { ...newMat, id }]);
      addAuditLog('Input Kain', `Penerimaan ${form.meters}m kain ${form.type}${form.width ? ` (lebar ${form.width}cm)` : ''}`);
      showMessage('Berhasil: Data kain masuk ditambahkan.');
      setShowAdd(false);
      setForm({ type: '', factory: '', meters: '', width: '', price_per_meter: '', status: 'Lunas', due_date: '' });
    } catch { showMessage('Gagal menyimpan data kain.'); }
  };

  const toggleHistory = (materialId?: string) => {
    if (materialId) {
      setHistoryMaterialId(materialId);
      setShowHistory(true);
    } else {
      setShowHistory(!showHistory);
      setHistoryMaterialId(null);
    }
  };

  const filteredLogs = historyMaterialId
    ? editLogs.filter(l => l.material_id === historyMaterialId)
    : editLogs;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Penerimaan Kain (Bahan Baku)</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => toggleHistory()} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-opacity ${showHistory && !historyMaterialId ? 'bg-accent text-accent-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
            <History size={16} /> Riwayat Edit
            {editLogs.length > 0 && <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{editLogs.length}</span>}
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
            {showAdd ? <X size={16} /> : <Plus size={16} />} {showAdd ? 'Batal' : 'Input Kain Masuk'}
          </button>
        </div>
      </div>

      {/* Edit History Panel */}
      {(showHistory || historyMaterialId) && (
        <div className="p-5 rounded-2xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <History size={16} className="text-primary" />
              {historyMaterialId ? `Riwayat Edit: ${filteredLogs[0]?.material_name || 'Kain'}` : 'Semua Riwayat Edit Kain'}
            </h3>
            {historyMaterialId && (
              <button onClick={() => { setHistoryMaterialId(null); setShowHistory(false); }} className="text-xs text-muted-foreground hover:text-foreground">✕ Tutup</button>
            )}
          </div>
          {filteredLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada riwayat perubahan.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredLogs.map(log => {
                const date = new Date(log.timestamp);
                return (
                  <div key={log.id} className="p-3 rounded-xl border border-border/50 bg-muted/30 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{log.edited_by}</span>
                        <span className="font-semibold text-sm text-foreground">{log.material_name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} {date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{log.changes}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl border border-border bg-card">
          <div><label className="text-xs font-semibold text-muted-foreground">Jenis Kain</label><input className="input-field mt-1" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder="Katun Toyobo" /></div>
          <div><label className="text-xs font-semibold text-muted-foreground">Pabrik / Supplier</label><input className="input-field mt-1" value={form.factory} onChange={e => setForm({ ...form, factory: e.target.value })} placeholder="Pabrik Tex Indo" /></div>
          <div><label className="text-xs font-semibold text-muted-foreground">Jumlah (Meter)</label><input className="input-field mt-1" type="number" step="0.1" value={form.meters} onChange={e => setForm({ ...form, meters: e.target.value })} /></div>
          <div><label className="text-xs font-semibold text-muted-foreground">Lebar Kain (cm)</label><input className="input-field mt-1" type="number" step="0.1" value={form.width} onChange={e => setForm({ ...form, width: e.target.value })} placeholder="Contoh: 150" /></div>
          <div><label className="text-xs font-semibold text-muted-foreground">Harga Per Meter (Rp)</label><input className="input-field mt-1" value={formatNumber(form.price_per_meter)} onChange={e => setForm({ ...form, price_per_meter: unformatNumber(e.target.value) })} /></div>
          <div><label className="text-xs font-semibold text-muted-foreground">Status Pembayaran</label>
            <select className="input-field mt-1" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option>Lunas</option><option value="Hutang">Hutang (Kredit)</option>
            </select>
          </div>
          {form.status === 'Hutang' && (
            <div><label className="text-xs font-semibold text-muted-foreground">Jatuh Tempo</label><input className="input-field mt-1" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
          )}
          <div className="md:col-span-3"><button type="submit" className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">Catat & Terima Kain</button></div>
        </form>
      )}

      {/* Edit Form */}
      {editId && (() => {
        const m = materials.find(mat => mat.id === editId);
        if (!m) return null;
        return (
          <div className="p-5 rounded-2xl border-2 border-primary/30 bg-card space-y-4">
            <h3 className="font-bold text-foreground flex items-center gap-2"><Edit3 size={16} className="text-primary" /> Edit Kain: {m.type}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="text-xs font-semibold text-muted-foreground">Jenis Kain</label><input className="input-field mt-1" value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })} /></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Pabrik / Supplier</label><input className="input-field mt-1" value={editForm.factory} onChange={e => setEditForm({ ...editForm, factory: e.target.value })} /></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Jumlah (Meter)</label><input className="input-field mt-1" type="number" step="0.1" value={editForm.meters} onChange={e => setEditForm({ ...editForm, meters: e.target.value })} /></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Lebar Kain (cm)</label><input className="input-field mt-1" type="number" step="0.1" value={editForm.width} onChange={e => setEditForm({ ...editForm, width: e.target.value })} placeholder="Contoh: 150" /></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Harga/Meter (Rp)</label><input className="input-field mt-1" value={formatNumber(editForm.price_per_meter)} onChange={e => setEditForm({ ...editForm, price_per_meter: unformatNumber(e.target.value) })} /></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Status</label>
                <select className="input-field mt-1" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                  <option>Lunas</option><option value="Hutang">Hutang (Kredit)</option>
                </select>
              </div>
              {editForm.status === 'Hutang' && (
                <div><label className="text-xs font-semibold text-muted-foreground">Jatuh Tempo</label><input className="input-field mt-1" type="date" value={editForm.due_date} onChange={e => setEditForm({ ...editForm, due_date: e.target.value })} /></div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(m)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90"><Check size={14} /> Simpan</button>
              <button onClick={() => setEditId(null)} className="px-5 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-bold hover:bg-muted/80">Batal</button>
            </div>
          </div>
        );
      })()}

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {visibleMaterials.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Belum ada data kain masuk.</p>}
        {visibleMaterials.map(m => {
          const logCount = editLogs.filter(l => l.material_id === m.id).length;
          return (
            <div key={m.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between">
                <p className="font-bold text-foreground text-sm">{m.type}</p>
                <div className="flex items-center gap-2">
                  {logCount > 0 && (
                    <button onClick={() => toggleHistory(m.id)} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-accent-foreground transition-colors" title="Riwayat Edit">
                      <History size={14} />
                    </button>
                  )}
                  <button onClick={() => startEdit(m)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"><Edit3 size={14} /></button>
                  <button onClick={() => setDeleteTarget(m)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Hapus"><Trash2 size={14} /></button>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${m.status === 'Hutang' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                    {m.status === 'Hutang' ? 'HUTANG' : 'LUNAS'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div><span className="text-muted-foreground">Pabrik:</span> <span className="font-semibold text-foreground">{m.factory}</span></div>
                <div><span className="text-muted-foreground">Stok:</span> <span className="font-semibold text-foreground">{m.meters_total} m</span></div>
                {m.width && <div><span className="text-muted-foreground">Lebar:</span> <span className="font-semibold text-foreground">{m.width} cm</span></div>}
                <div className="col-span-2"><span className="text-muted-foreground">Nilai:</span> <span className="font-semibold text-foreground">Rp {formatNumber(m.total_cost)}</span></div>
                {m.status === 'Hutang' && m.due_date && <div className="col-span-2"><span className="text-muted-foreground">Jatuh Tempo:</span> <span className="font-semibold text-warning">{m.due_date}</span></div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Jenis Kain</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Pabrik</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Stok (Meter)</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Lebar (cm)</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Total Nilai</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {visibleMaterials.map(m => {
              const logCount = editLogs.filter(l => l.material_id === m.id).length;
              return (
                <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">{m.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.factory}</td>
                  <td className="px-4 py-3 text-foreground">{m.meters_total} m</td>
                  <td className="px-4 py-3 text-foreground">{m.width ? `${m.width} cm` : '-'}</td>
                  <td className="px-4 py-3 text-foreground">Rp {formatNumber(m.total_cost)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${m.status === 'Hutang' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                      {m.status === 'Hutang' ? `HUTANG (${m.due_date || '-'})` : 'LUNAS'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(m)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Edit"><Edit3 size={14} /></button>
                      <button onClick={() => setDeleteTarget(m)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Hapus">
                        <Trash2 size={14} />
                      </button>
                      {logCount > 0 && (
                        <button onClick={() => toggleHistory(m.id)} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-accent-foreground transition-colors relative" title="Riwayat Edit">
                          <History size={14} />
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">{logCount}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleMaterials.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Belum ada data kain masuk.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Soft Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} /> Hapus Data Kain
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Anda akan menghapus data kain <strong className="text-foreground">{deleteTarget?.type}</strong> ({deleteTarget?.meters_total}m).
              Data tidak dihapus permanen dan akan tercatat di Audit Log Admin Pusat.
            </p>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Alasan Penghapusan <span className="text-destructive">*</span></label>
              <textarea
                className="input-field mt-1 min-h-[80px]"
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="Contoh: Salah ketik meteran, duplikasi data, dsb."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteReason(''); }}>Batal</Button>
            <Button variant="destructive" onClick={handleSoftDelete} disabled={!deleteReason.trim()}>
              <Trash2 size={14} className="mr-1" /> Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
