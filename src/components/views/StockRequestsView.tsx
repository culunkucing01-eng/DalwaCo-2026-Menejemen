import { useState, useEffect } from 'react';
import { useAppState, STORES } from '@/lib/store';
import {
  subscribeStockRequests,
  firestoreUpdateStockRequest,
  firestoreAddShippingLog,
  atomicDeductGudangStock,
  type StockRequest,
} from '@/lib/firestore';
import { printShippingInvoice } from '@/lib/invoice-generator';
import {
  Inbox, CheckCircle2, XCircle, Clock, Truck, MessageSquare, Filter, Package, MessageCircle, FileText,
} from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-warning/10 text-warning',
  Diproses: 'bg-primary/10 text-primary',
  Ditolak: 'bg-destructive/10 text-destructive',
  Selesai: 'bg-success/10 text-success',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Pending: <Clock size={12} />,
  Diproses: <Truck size={12} />,
  Ditolak: <XCircle size={12} />,
  Selesai: <CheckCircle2 size={12} />,
};

export default function StockRequestsView() {
  const { products, addAuditLog, showMessage } = useAppState();
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [filterStore, setFilterStore] = useState('Semua');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const [responseNote, setResponseNote] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);

  // Approve flow state: when set, shows inline shipping form
  const [approveTarget, setApproveTarget] = useState<StockRequest | null>(null);
  const [approveQty, setApproveQty] = useState('');

  useEffect(() => {
    const unsub = subscribeStockRequests(setRequests, (err) => {
      console.error('Stock requests error:', err);
    });
    return unsub;
  }, []);

  const filtered = requests.filter(r => {
    if (filterStore !== 'Semua' && r.store !== filterStore) return false;
    if (filterStatus !== 'Semua' && r.status !== filterStatus) return false;
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'Pending').length;

  const openApproveForm = (req: StockRequest) => {
    setApproveTarget(req);
    setApproveQty(String(req.qty));
  };

  const handleApproveAndShip = async () => {
    if (!approveTarget) return;
    const req = approveTarget;
    const qty = parseInt(approveQty);
    if (!qty || qty <= 0) { showMessage('Peringatan: Jumlah kirim harus lebih dari 0!'); return; }

    setProcessing(req.id);
    try {
      const product = products.find(p => p.id === req.product_id);
      if (!product) { showMessage('Produk tidak ditemukan!'); return; }
      const gudangStock = product.stock_map?.['Gudang Utama'] || 0;
      if (gudangStock < qty) { showMessage(`Stok gudang tidak cukup! Tersedia: ${gudangStock} pcs`); return; }

      // 1. Reduce gudang stock atomically
      await atomicDeductGudangStock(product.id, qty);

      // 2. Create shipping log
      const newLog = {
        product_id: product.id, product_name: product.name, product_sku: product.sku,
        qty, destination: req.store, status: 'In Transit', timestamp: new Date().toISOString(),
      };
      const shippingId = await firestoreAddShippingLog(newLog);

      // 3. Update request status
      await firestoreUpdateStockRequest(req.id, {
        status: 'Diproses',
        response_note: responseNote[req.id] || `Disetujui & dikirim ${qty} pcs`,
        responded_at: new Date().toISOString(),
      });

      addAuditLog('Approve & Kirim', `Approve ${qty}pcs ${req.product_name} ke ${req.store} (SJ dibuat otomatis)`);
      showMessage(`Request disetujui! Surat Jalan ${qty}pcs ${req.product_name} → ${req.store} berhasil dibuat.`);

      // Print invoice
      printShippingInvoice({ ...newLog, id: shippingId }, product);

      setApproveTarget(null);
      setApproveQty('');
    } catch (e) { showMessage('Gagal memproses request.'); }
    finally { setProcessing(null); }
  };

  const handleReject = async (req: StockRequest) => {
    setProcessing(req.id);
    try {
      await firestoreUpdateStockRequest(req.id, {
        status: 'Ditolak', response_note: responseNote[req.id] || 'Ditolak oleh Admin Gudang',
        responded_at: new Date().toISOString(),
      });
      addAuditLog('Tolak Request Stok', `Tolak request ${req.qty}pcs ${req.product_name} dari ${req.store}`);
      showMessage(`Request dari ${req.store} ditolak.`);
    } catch (e) { showMessage('Gagal menolak request.'); }
    finally { setProcessing(null); }
  };

  const handleComplete = async (req: StockRequest) => {
    setProcessing(req.id);
    try {
      await firestoreUpdateStockRequest(req.id, { status: 'Selesai', responded_at: new Date().toISOString() });
      showMessage('Request ditandai selesai.');
    } finally { setProcessing(null); }
  };

  const openChatReq = requests.find(r => r.id === openChatId);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Inbox size={20} /></div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Total Request</p>
          <p className="text-xl font-extrabold text-foreground">{requests.length}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center"><Clock size={20} /></div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Menunggu</p>
          <p className="text-xl font-extrabold text-warning">{pendingCount}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center"><CheckCircle2 size={20} /></div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Diproses</p>
          <p className="text-xl font-extrabold text-success">{requests.filter(r => r.status === 'Diproses' || r.status === 'Selesai').length}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center"><XCircle size={20} /></div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Ditolak</p>
          <p className="text-xl font-extrabold text-destructive">{requests.filter(r => r.status === 'Ditolak').length}</p>
        </div>
      </div>

      {/* Approve & Ship Inline Form */}
      {approveTarget && (
        <div className="rounded-2xl border-2 border-success/30 bg-success/5 p-5 space-y-4 animate-fade-in">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Truck size={18} className="text-success" /> Buat Surat Jalan — Approve Request
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Produk</label>
              <p className="input-field mt-1 bg-muted/50 cursor-not-allowed text-foreground">[{approveTarget.product_sku}] {approveTarget.product_name}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Toko Tujuan</label>
              <p className="input-field mt-1 bg-muted/50 cursor-not-allowed text-foreground">{approveTarget.store}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Qty Diminta</label>
              <p className="input-field mt-1 bg-muted/50 cursor-not-allowed text-foreground">{approveTarget.qty} pcs</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Jumlah Kirim Aktual</label>
              <input
                className="input-field mt-1"
                type="number"
                value={approveQty}
                onChange={e => setApproveQty(e.target.value)}
                min={1}
                max={products.find(p => p.id === approveTarget.product_id)?.stock_map?.['Gudang Utama'] || 0}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Stok Gudang: {products.find(p => p.id === approveTarget.product_id)?.stock_map?.['Gudang Utama'] || 0} pcs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              className="input-field text-xs flex-1"
              placeholder="Catatan balasan (opsional)"
              value={responseNote[approveTarget.id] || ''}
              onChange={e => setResponseNote(prev => ({ ...prev, [approveTarget.id]: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApproveAndShip}
              disabled={processing === approveTarget.id}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-success text-success-foreground text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <CheckCircle2 size={14} /> Setujui & Buat Surat Jalan
            </button>
            <button
              onClick={() => { setApproveTarget(null); setApproveQty(''); }}
              className="px-5 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-bold hover:bg-muted/80"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`grid gap-6 ${openChatId ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>
        <div className={`rounded-2xl border border-border bg-card ${openChatId ? 'lg:col-span-3' : ''}`}>
          <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <MessageSquare size={18} className="text-primary" /> Pesan Request Stok dari Store
            </h3>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-muted-foreground" />
              <select className="input-field text-xs py-2" value={filterStore} onChange={e => setFilterStore(e.target.value)}>
                <option value="Semua">Semua Store</option>
                {STORES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="input-field text-xs py-2" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="Semua">Semua Status</option>
                <option value="Pending">Pending</option>
                <option value="Diproses">Diproses</option>
                <option value="Ditolak">Ditolak</option>
                <option value="Selesai">Selesai</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-border">
            {filtered.length === 0 && (
              <div className="text-center py-12">
                <Inbox size={40} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Belum ada request stok.</p>
              </div>
            )}
            {filtered.map(req => (
              <div key={req.id} className={`p-5 hover:bg-muted/30 transition-colors ${openChatId === req.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''} ${approveTarget?.id === req.id ? 'bg-success/5 border-l-2 border-l-success' : ''}`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLES[req.status]}`}>
                        {STATUS_ICONS[req.status]} {req.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">{req.store}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(req.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package size={14} className="text-primary" />
                      <span className="text-sm font-bold text-foreground">[{req.product_sku}] {req.product_name}</span>
                      <span className="text-sm font-extrabold text-primary">{req.qty} pcs</span>
                    </div>
                    {req.note && (
                      <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-xl">💬 {req.note}</p>
                    )}
                    <div className="flex items-center gap-3">
                      <p className="text-[11px] text-muted-foreground">
                        Dari: <strong>{req.requester_name}</strong> ({req.requester_role})
                      </p>
                      <button
                        onClick={() => setOpenChatId(openChatId === req.id ? null : req.id)}
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${
                          openChatId === req.id ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20'
                        }`}
                      >
                        <MessageCircle size={11} /> Chat
                      </button>
                    </div>
                    {req.response_note && (
                      <p className="text-xs text-primary bg-primary/5 px-3 py-2 rounded-xl">📋 Balasan: {req.response_note}</p>
                    )}
                  </div>

                  {/* Actions */}
                  {req.status === 'Pending' && (
                    <div className="flex gap-2 min-w-[200px]">
                      <button onClick={() => openApproveForm(req)} disabled={processing === req.id || approveTarget?.id === req.id}
                        className="flex-1 py-2 rounded-xl bg-success/20 text-success text-xs font-bold hover:bg-success/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                        <Truck size={12} /> Approve & Kirim
                      </button>
                      <button onClick={() => handleReject(req)} disabled={processing === req.id}
                        className="flex-1 py-2 rounded-xl bg-destructive/20 text-destructive text-xs font-bold hover:bg-destructive/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                        <XCircle size={12} /> Tolak
                      </button>
                    </div>
                  )}
                  {req.status === 'Diproses' && (
                    <button onClick={() => handleComplete(req)} disabled={processing === req.id}
                      className="py-2 px-4 rounded-xl bg-success/20 text-success text-xs font-bold hover:bg-success/30 transition-colors disabled:opacity-50 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Tandai Selesai
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Panel */}
        {openChatId && openChatReq && (
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden sticky top-24 self-start">
            <ChatPanel
              requestId={openChatId}
              onClose={() => setOpenChatId(null)}
              title={`Chat — ${openChatReq.product_name} (${openChatReq.store})`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
