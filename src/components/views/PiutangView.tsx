import { useState } from 'react';
import { useAppState, formatNumber, unformatNumber, ROLES, type Receivable } from '@/lib/store';
import { firestoreUpdateReceivable } from '@/lib/firestore';
import { Clock, CheckCircle, Wallet, Search, AlertTriangle } from 'lucide-react';

export default function PiutangView() {
  const { receivables, addAuditLog, showMessage, currentRole } = useAppState();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const filtered = receivables
    .filter(r => filterStatus === 'all' || r.status === filterStatus)
    .filter(r => r.customer_name.toLowerCase().includes(search.toLowerCase()) || r.items.toLowerCase().includes(search.toLowerCase()));

  const totalPiutang = receivables.reduce((acc, r) => acc + (r.total - r.paid), 0);
  const countBelumLunas = receivables.filter(r => r.status !== 'Lunas').length;
  const countJatuhTempo = receivables.filter(r => r.status !== 'Lunas' && new Date(r.due_date) <= new Date()).length;
  const isAdmin = currentRole === ROLES.ADMIN;

  const handlePayment = async (receivable: Receivable) => {
    const amount = parseInt(unformatNumber(payAmount));
    if (!amount || amount <= 0) {
      showMessage('Peringatan: Masukkan jumlah pembayaran yang valid!');
      return;
    }
    const remaining = receivable.total - receivable.paid;
    if (amount > remaining) {
      showMessage('Peringatan: Jumlah pembayaran melebihi sisa hutang!');
      return;
    }
    const newPaid = receivable.paid + amount;
    const isLunas = newPaid >= receivable.total;

    await firestoreUpdateReceivable(receivable.id, {
      paid: newPaid,
      status: isLunas ? 'Lunas' : 'Belum Lunas',
    });

    addAuditLog(
      isLunas ? 'Pelunasan Piutang' : 'Cicilan Piutang',
      `${receivable.customer_name} bayar Rp ${formatNumber(amount)}. ${isLunas ? 'LUNAS' : `Sisa: Rp ${formatNumber(receivable.total - newPaid)}`}`
    );
    showMessage(`Berhasil: Pembayaran Rp ${formatNumber(amount)} dari ${receivable.customer_name} ${isLunas ? '— LUNAS!' : 'tercatat.'}`);
    setPayingId(null);
    setPayAmount('');
  };

  const handleLunaskan = async (receivable: Receivable) => {
    const remaining = receivable.total - receivable.paid;
    await firestoreUpdateReceivable(receivable.id, { paid: receivable.total, status: 'Lunas' });
    addAuditLog('Pelunasan Piutang', `${receivable.customer_name} lunas Rp ${formatNumber(remaining)}`);
    showMessage(`Berhasil: Piutang ${receivable.customer_name} telah LUNAS!`);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                <Wallet size={20} className="text-warning" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground">Total Piutang</p>
            </div>
            <p className="text-2xl font-extrabold text-foreground">Rp {formatNumber(totalPiutang)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Clock size={20} className="text-primary" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground">Belum Lunas</p>
            </div>
            <p className="text-2xl font-extrabold text-foreground">{countBelumLunas}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground">Jatuh Tempo</p>
            </div>
            <p className="text-2xl font-extrabold text-foreground">{countJatuhTempo}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input-field pl-9" placeholder="Cari nama pelanggan atau item..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="Belum Lunas">Belum Lunas</option>
          <option value="Lunas">Lunas</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {receivables.length === 0 ? 'Belum ada data piutang. Transaksi Hutang Tempo akan muncul di sini.' : 'Tidak ada data yang cocok dengan filter.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const remaining = r.total - r.paid;
            const progress = r.total > 0 ? (r.paid / r.total) * 100 : 0;
            const isOverdue = r.status !== 'Lunas' && new Date(r.due_date) <= new Date();
            const isPaying = payingId === r.id;

            return (
              <div key={r.id} className={`rounded-2xl border bg-card p-5 transition-all ${isOverdue ? 'border-destructive/40' : 'border-border'}`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-foreground">{r.customer_name}</p>
                      {r.customer_wa && <span className="text-xs text-muted-foreground">({r.customer_wa})</span>}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        r.status === 'Lunas' ? 'bg-success/10 text-success' : isOverdue ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
                      }`}>
                        {r.status === 'Lunas' ? '✓ Lunas' : isOverdue ? '⚠ Jatuh Tempo' : 'Belum Lunas'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{r.items}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Total: <strong className="text-foreground">Rp {formatNumber(r.total)}</strong></span>
                      <span>Dibayar: <strong className="text-success">Rp {formatNumber(r.paid)}</strong></span>
                      <span>Sisa: <strong className={remaining > 0 ? 'text-warning' : 'text-success'}>Rp {formatNumber(remaining)}</strong></span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Clock size={12} />
                      <span>Tempo: {r.due_date}</span>
                    </div>
                    <div className="mt-3 w-full h-2 rounded-full bg-muted/50 overflow-hidden">
                      <div className="h-full rounded-full bg-success transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{progress.toFixed(0)}% terbayar</p>
                  </div>

                  {isAdmin && r.status !== 'Lunas' && (
                    <div className="flex flex-col gap-2 sm:min-w-[160px]">
                      {isPaying ? (
                        <div className="space-y-2 p-3 rounded-xl bg-muted/30 border border-border">
                          <label className="text-[11px] font-semibold text-muted-foreground">Jumlah Bayar (Rp)</label>
                          <input
                            className="input-field text-xs"
                            value={payAmount ? formatNumber(payAmount) : ''}
                            onChange={e => setPayAmount(unformatNumber(e.target.value))}
                            placeholder="Masukkan nominal"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handlePayment(r)} className="flex-1 py-2 rounded-lg bg-success text-success-foreground text-xs font-bold hover:opacity-90 transition-opacity">
                              Bayar
                            </button>
                            <button onClick={() => { setPayingId(null); setPayAmount(''); }} className="px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/80 transition-colors">
                              Batal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => setPayingId(r.id)} className="py-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
                            <Wallet size={14} /> Cicil / Bayar
                          </button>
                          <button onClick={() => handleLunaskan(r)} className="py-2 px-4 rounded-xl bg-success text-success-foreground text-xs font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
                            <CheckCircle size={14} /> Lunaskan Semua
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
