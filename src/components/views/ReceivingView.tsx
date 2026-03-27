import { useAppState } from '@/lib/store';
import { firestoreUpdateShippingLog, atomicAddStock } from '@/lib/firestore';
import { CheckCircle2, Package } from 'lucide-react';

export default function ReceivingView() {
  const { shippingLogs, setShippingLogs, products, setProducts, kasirStore, addAuditLog, showMessage } = useAppState();
  const myShipments = shippingLogs.filter(log => log.destination === kasirStore && log.status === 'In Transit');

  const handleTerima = async (logId: string) => {
    const log = shippingLogs.find(l => l.id === logId);
    if (!log) return;
    const product = products.find(p => p.id === log.product_id);
    try {
      await firestoreUpdateShippingLog(logId, { status: 'Received' });
      setShippingLogs(prev => prev.map(l => l.id === logId ? { ...l, status: 'Received' } : l));
      if (product) {
        await atomicAddStock(product.id, kasirStore, log.qty);
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock_map: { ...p.stock_map, [kasirStore]: (p.stock_map?.[kasirStore] || 0) + log.qty } } : p));
      }
      addAuditLog('Terima Barang', `Kasir menerima ${log.qty}pcs ${log.product_name}`);
      showMessage('Berhasil: Barang diterima! Stok Toko ditambahkan.');
    } catch {
      showMessage('Gagal menerima barang.');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-foreground">Konfirmasi Terima Barang</h2>
        <p className="text-xs text-muted-foreground">Cek fisik barang sebelum klik "Terima".</p>
      </div>
      <div className="space-y-3">
        {myShipments.map(log => (
          <div key={log.id} className="flex items-center justify-between p-5 rounded-2xl border border-border bg-card">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Surat Jalan: #{log.id.slice(-6).toUpperCase()}</p>
              <p className="font-bold text-foreground mt-1">{log.product_name}</p>
              <p className="text-sm text-muted-foreground">Dikirim: {log.qty} Pcs</p>
            </div>
            <button onClick={() => handleTerima(log.id)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
              <CheckCircle2 size={16} /> Konfirmasi & Terima
            </button>
          </div>
        ))}
        {myShipments.length === 0 && (
          <div className="text-center py-12">
            <Package size={40} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Tidak ada barang "In Transit" untuk {kasirStore}.</p>
          </div>
        )}
      </div>
    </div>
  );
}
