import { useState } from 'react';
import { useAppState, formatNumber, type Product } from '@/lib/store';
import { firestoreUpdateShippingLog, atomicAddStock } from '@/lib/firestore';
import { Package, CheckCircle2, Search, AlertTriangle, Truck, Clock } from 'lucide-react';

export default function StoreStockUpdateView() {
  const { products, setProducts, shippingLogs, setShippingLogs, kasirStore, addAuditLog, showMessage } = useAppState();

  // Show incoming shipments that are "In Transit" for this store
  const incomingShipments = shippingLogs.filter(
    log => log.destination === kasirStore && log.status === 'In Transit'
  );

  // Show recently received shipments
  const recentReceived = shippingLogs.filter(
    log => log.destination === kasirStore && log.status === 'Received'
  ).slice(0, 10);

  const handleConfirmReceive = async (logId: string) => {
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

      addAuditLog('Penerimaan Barang', `Kasir validasi terima ${log.qty}pcs ${log.product_name} di ${kasirStore}`);
      showMessage(`Berhasil: ${log.qty}pcs ${log.product_name} diterima! Stok toko bertambah.`);
    } catch {
      showMessage('Gagal memvalidasi penerimaan barang.');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-foreground">Penerimaan Barang</h2>
        <p className="text-xs text-muted-foreground">Validasi barang masuk dari Gudang ke {kasirStore}. Stok bertambah setelah konfirmasi.</p>
      </div>

      {/* Incoming Shipments */}
      {incomingShipments.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Truck size={16} className="text-primary" /> Barang Sedang Dikirim ({incomingShipments.length})
          </h3>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {incomingShipments.map(log => (
              <div key={log.id} className="rounded-2xl border border-primary/20 bg-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">SJ #{log.id.slice(-6).toUpperCase()}</p>
                    <p className="font-bold text-foreground text-sm mt-0.5">{log.product_name}</p>
                    <p className="text-xs text-muted-foreground">{log.product_sku}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">{log.qty} Pcs</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Dikirim: {new Date(log.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <button
                  onClick={() => handleConfirmReceive(log.id)}
                  className="w-full py-2.5 rounded-xl bg-success text-success-foreground text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <CheckCircle2 size={14} /> Konfirmasi Terima Barang
                </button>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">No. Surat Jalan</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Produk</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Jumlah</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tanggal Kirim</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {incomingShipments.map(log => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs font-medium text-muted-foreground">SJ #{log.id.slice(-6).toUpperCase()}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground text-xs">{log.product_sku}</p>
                      <p className="text-[11px] text-muted-foreground">{log.product_name}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">{log.qty} Pcs</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleConfirmReceive(log.id)}
                        className="px-4 py-2 rounded-xl bg-success text-success-foreground text-[10px] font-bold flex items-center gap-1.5 mx-auto hover:opacity-90 transition-opacity"
                      >
                        <CheckCircle2 size={12} /> Terima
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 rounded-2xl border border-border bg-card">
          <Package size={40} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">Tidak ada barang in-transit untuk {kasirStore}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Barang yang dikirim dari gudang akan muncul di sini</p>
        </div>
      )}

      {/* Recently Received */}
      {recentReceived.length > 0 && (
        <div className="rounded-2xl border border-border bg-card">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <CheckCircle2 size={16} className="text-success" /> Riwayat Penerimaan Terakhir
            </h3>
          </div>
          <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
            {recentReceived.map(log => (
              <div key={log.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-xs text-foreground">{log.product_name}</p>
                  <p className="text-[10px] text-muted-foreground">{log.product_sku} • {new Date(log.timestamp).toLocaleDateString('id-ID')}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-success/10 text-success text-xs font-bold">+{log.qty} Pcs</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 text-xs text-muted-foreground">
        <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
        <span>Untuk koreksi stok (barang rusak/hilang), gunakan halaman <strong>Audit Opname</strong>. Halaman ini hanya untuk validasi barang masuk dari gudang.</span>
      </div>
    </div>
  );
}
