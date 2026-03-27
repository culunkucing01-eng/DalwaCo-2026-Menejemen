import { useState, useEffect } from 'react';
import { useAppState, STORES } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import {
  subscribeStockRequests,
  firestoreAddStockRequest,
  type StockRequest,
} from '@/lib/firestore';
import {
  Inbox, CheckCircle2, XCircle, Clock, Truck, Package,
  MessageCircle, Plus, Send,
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

export default function MyStockRequestsView() {
  const { products, showMessage, addAuditLog, currentRole, kasirStore } = useAppState();
  const { profile } = useAuth();
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [reqProduct, setReqProduct] = useState('');
  const [reqQty, setReqQty] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = subscribeStockRequests(setRequests);
    return unsub;
  }, []);

  // Filter to only show this store's requests
  const myRequests = requests.filter(r => r.store === kasirStore);
  const openChatReq = requests.find(r => r.id === openChatId);

  const handleSubmit = async () => {
    if (!reqProduct || !reqQty) { showMessage('Pilih produk dan jumlah!'); return; }
    const product = products.find(p => p.id === reqProduct);
    if (!product) return;
    setSending(true);
    try {
      await firestoreAddStockRequest({
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        qty: parseInt(reqQty),
        store: kasirStore,
        requester_name: profile?.displayName || currentRole || 'Unknown',
        requester_role: currentRole || 'Unknown',
        note: reqNote,
        status: 'Pending',
        timestamp: new Date().toISOString(),
      });
      addAuditLog('Kirim Request Stok', `Request ${reqQty}pcs ${product.name} dari ${kasirStore}`);
      showMessage('Request stok terkirim ke Admin Gudang!');
      setReqProduct(''); setReqQty(''); setReqNote(''); setShowForm(false);
    } catch { showMessage('Gagal mengirim request.'); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <Inbox size={20} className="text-primary" /> Request Stok Saya
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Store: <strong>{kasirStore}</strong></p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Plus size={14} /> Request Baru
        </button>
      </div>

      {/* New Request Form */}
      {showForm && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
            <Send size={14} className="text-primary" /> Kirim Request Stok ke Gudang
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select className="input-field text-xs" value={reqProduct} onChange={e => setReqProduct(e.target.value)}>
              <option value="">-- Pilih Produk --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>[{p.sku}] {p.name} (Gudang: {p.stock_map?.['Gudang Utama'] || 0})</option>
              ))}
            </select>
            <input className="input-field text-xs" type="number" placeholder="Jumlah (pcs)" value={reqQty} onChange={e => setReqQty(e.target.value)} />
            <input className="input-field text-xs" placeholder="Catatan (opsional)" value={reqNote} onChange={e => setReqNote(e.target.value)} />
            <button onClick={handleSubmit} disabled={sending}
              className="py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
              <Send size={14} /> {sending ? 'Mengirim...' : 'Kirim Request'}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={`grid gap-6 ${openChatId ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>
        <div className={`rounded-2xl border border-border bg-card ${openChatId ? 'lg:col-span-3' : ''}`}>
          <div className="p-5 border-b border-border">
            <p className="text-xs font-bold text-muted-foreground">
              {myRequests.length} request dari {kasirStore}
            </p>
          </div>
          <div className="divide-y divide-border">
            {myRequests.length === 0 && (
              <div className="text-center py-12">
                <Inbox size={40} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Belum ada request. Klik "Request Baru" untuk memulai.</p>
              </div>
            )}
            {myRequests.map(req => (
              <div key={req.id} className={`p-5 hover:bg-muted/30 transition-colors ${openChatId === req.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLES[req.status]}`}>
                      {STATUS_ICONS[req.status]} {req.status}
                    </span>
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
                  {req.response_note && (
                    <p className="text-xs text-primary bg-primary/5 px-3 py-2 rounded-xl">📋 Balasan Gudang: {req.response_note}</p>
                  )}
                  <button
                    onClick={() => setOpenChatId(openChatId === req.id ? null : req.id)}
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                      openChatId === req.id ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}
                  >
                    <MessageCircle size={11} /> {openChatId === req.id ? 'Tutup Chat' : 'Buka Chat'}
                  </button>
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
              title={`Chat — ${openChatReq.product_name}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
