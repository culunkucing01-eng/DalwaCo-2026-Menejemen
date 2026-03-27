import { useState, useMemo } from 'react';
import { useAppState, formatNumber, unformatNumber, type ConvectionLog, type VariantAllocation, type ProductVariant } from '@/lib/store';
import { firestoreUpdateMaterial, firestoreAddConvectionLog, firestoreUpdateConvectionLog, atomicAddStock } from '@/lib/firestore';
import { AlertTriangle, CheckCircle2, Package, Scissors, Calculator, Printer, FileText, Truck, Trash2, Plus } from 'lucide-react';
import { printProductionReport, printSingleProductionReport, printProductionReceipt } from '@/lib/production-report';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function ConvectionView() {
  const { materials, setMaterials, products, setProducts, convectionLogs, setConvectionLogs, addAuditLog, showMessage } = useAppState();
  const [tab, setTab] = useState<'kirim' | 'hasil' | 'selesai'>('kirim');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [form, setForm] = useState({ meters: '', destination: '', fabricPerPiece: '', cost: '', productionType: 'internal' as 'internal' | 'makloon', vendorName: '' });

  // --- Tab 2: per-log form state keyed by log id ---
  const [logForms, setLogForms] = useState<Record<string, { productId: string; fabricPerPiece: string; costPerPcs: string; defectMeters: string }>>({});
  // Variant distribution per log
  const [logVariants, setLogVariants] = useState<Record<string, VariantAllocation[]>>({});

  const getLogForm = (logId: string) => logForms[logId] || { productId: '', fabricPerPiece: '', costPerPcs: '', defectMeters: '' };
  const setLogForm = (logId: string, updates: Partial<{ productId: string; fabricPerPiece: string; costPerPcs: string; defectMeters: string }>) => {
    setLogForms(prev => ({ ...prev, [logId]: { ...getLogForm(logId), ...updates } }));
  };

  const getLogVariantList = (logId: string): VariantAllocation[] => logVariants[logId] || [];
  const setLogVariantList = (logId: string, list: VariantAllocation[]) => {
    setLogVariants(prev => ({ ...prev, [logId]: list }));
  };

  // --- Tab 3: actual qty overrides per log ---
  const [receiveActuals, setReceiveActuals] = useState<Record<string, Record<string, number>>>({});

  const handleKirim = async () => {
    const mat = materials.find(m => m.id === selectedMaterialId);
    if (!mat || !form.meters || !form.destination) { showMessage('Peringatan: Pilih kain, jumlah meter, dan tujuan!'); return; }
    if (form.productionType === 'makloon' && !form.vendorName.trim()) { showMessage('Peringatan: Nama Konveksi / Vendor wajib diisi untuk Makloon!'); return; }
    const meters = parseFloat(form.meters);
    if (meters > mat.meters_total) { showMessage('Peringatan: Meter melebihi stok kain!'); return; }
    try {
      await firestoreUpdateMaterial(mat.id, { meters_total: mat.meters_total - meters });
      setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, meters_total: m.meters_total - meters } : m));
      const destination = form.productionType === 'makloon' ? form.vendorName.trim() : form.destination;
      const newLog: Omit<ConvectionLog, 'id'> = {
        material_id: mat.id, material_name: mat.type, meters_sent: meters, destination,
        status: 'Di Jahit', timestamp: new Date().toISOString(),
        production_type: form.productionType,
        vendor_name: form.productionType === 'makloon' ? form.vendorName.trim() : undefined,
      };
      const id = await firestoreAddConvectionLog(newLog);
      setConvectionLogs(prev => [{ ...newLog, id }, ...prev]);
      addAuditLog('Kirim Konveksi', `Kirim ${form.meters}m kain ${mat.type} ke ${destination} (${form.productionType === 'makloon' ? 'Makloon' : 'Internal'})`);
      showMessage('Berhasil: Kain telah dikirim ke Rumah Konveksi.');
      setForm({ meters: '', destination: '', fabricPerPiece: '', cost: '', productionType: 'internal', vendorName: '' }); setSelectedMaterialId('');
    } catch { showMessage('Gagal mencatat pengiriman.'); }
  };

  const calcResult = (totalMeters: number, fabricPerPiece: string, costPerPcs: string, defectMeters: string) => {
    const fab = parseFloat(fabricPerPiece);
    const perPcsCost = parseInt(costPerPcs) || 0;
    const defect = parseFloat(defectMeters) || 0;
    const effectiveMeters = Math.max(0, totalMeters - defect);
    if (!fab || fab <= 0) return { pcs: 0, sisaKain: 0, totalCost: 0, effectiveMeters };
    const pcs = Math.floor(effectiveMeters / fab);
    const sisaKain = parseFloat((effectiveMeters - (pcs * fab)).toFixed(2));
    const totalCost = pcs * perPcsCost;
    return { pcs, sisaKain, totalCost, effectiveMeters };
  };

  const handleTerima = async (log: ConvectionLog) => {
    const lf = getLogForm(log.id);
    const product = products.find(p => p.id === lf.productId);
    if (!product || !lf.fabricPerPiece || !lf.costPerPcs) { showMessage('Peringatan: Lengkapi Produk, Kebutuhan Kain & Ongkos Jahit/Pcs!'); return; }
    const { pcs, sisaKain, totalCost } = calcResult(log.meters_sent, lf.fabricPerPiece, lf.costPerPcs, lf.defectMeters);
    if (pcs <= 0) { showMessage('Peringatan: Kebutuhan kain per baju terlalu besar, tidak ada hasil produksi!'); return; }

    // Validate variant distribution
    const variants = getLogVariantList(log.id);
    const totalAllocated = variants.reduce((s, v) => s + v.qty, 0);
    if (variants.length === 0 || totalAllocated !== pcs) {
      showMessage(`Peringatan: Total distribusi varian (${totalAllocated}) harus sama dengan jumlah baju (${pcs})!`);
      return;
    }

    const costPerPcs = parseInt(lf.costPerPcs) || 0;
    try {
      await firestoreUpdateConvectionLog(log.id, {
        status: 'Menunggu Diterima',
        target_product_id: product.id,
        target_product_name: product.name,
        fabric_per_piece: parseFloat(lf.fabricPerPiece),
        pcs_result: pcs,
        cutting_loss_waste: sisaKain,
        convection_cost: totalCost,
        cost_per_piece: costPerPcs,
        defect_meters: parseFloat(lf.defectMeters) || 0,
        variant_distribution: variants,
      });
      setConvectionLogs(prev => prev.map(l => l.id === log.id ? {
        ...l, status: 'Menunggu Diterima',
        target_product_id: product.id,
        target_product_name: product.name,
        fabric_per_piece: parseFloat(lf.fabricPerPiece),
        pcs_result: pcs,
        cutting_loss_waste: sisaKain,
        convection_cost: totalCost,
        cost_per_piece: costPerPcs,
        defect_meters: parseFloat(lf.defectMeters) || 0,
        variant_distribution: variants,
      } : l));
      addAuditLog('Kalkulasi Produksi', `Kalkulasi ${pcs}pcs ${product.name} (${variants.length} varian) dari ${log.meters_sent}m ${log.material_name}. Ongkos/pcs: Rp ${formatNumber(costPerPcs)}, Total: Rp ${formatNumber(totalCost)}`);
      showMessage(`Berhasil: Kalkulasi selesai (${pcs} Pcs, ${variants.length} varian). Menunggu konfirmasi penerimaan.`);
      setLogForms(prev => { const copy = { ...prev }; delete copy[log.id]; return copy; });
      setLogVariants(prev => { const copy = { ...prev }; delete copy[log.id]; return copy; });
    } catch { showMessage('Gagal mencatat hasil produksi.'); }
  };

  const handleConfirmReceive = async (log: ConvectionLog) => {
    const productId = log.target_product_id || selectedProductId;
    const product = products.find(p => p.id === productId);
    if (!product) { showMessage('Peringatan: Pilih produk tujuan stok!'); return; }

    const variantDist = log.variant_distribution || [];
    const actuals = receiveActuals[log.id] || {};

    // Build final allocations with actual qty
    const finalAllocations: VariantAllocation[] = variantDist.map(v => ({
      ...v,
      actual_qty: actuals[v.barcode] !== undefined ? actuals[v.barcode] : v.qty,
    }));
    const totalActual = finalAllocations.reduce((s, v) => s + (v.actual_qty ?? v.qty), 0);

    try {
      // Update convection log
      await firestoreUpdateConvectionLog(log.id, {
        status: 'Selesai',
        variant_distribution: finalAllocations,
        pcs_result: totalActual,
      });
      setConvectionLogs(prev => prev.map(l => l.id === log.id ? { ...l, status: 'Selesai', variant_distribution: finalAllocations, pcs_result: totalActual } : l));

      // Add stock per variant by barcode
      const updatedVariants = (product.variants || []).map(v => {
        const match = finalAllocations.find(a => a.barcode === (v.barcode || v.sku));
        if (match) {
          return { ...v, stock: (v.stock || 0) + (match.actual_qty ?? match.qty) };
        }
        return v;
      });
      const totalGudang = updatedVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
      await atomicAddStock(product.id, 'Gudang Utama', totalActual, { variants: updatedVariants });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, variants: updatedVariants, stock_map: { ...p.stock_map, 'Gudang Utama': totalGudang } } : p));

      const details = finalAllocations.map(a => `${a.warna} ${a.size} (${a.actual_qty ?? a.qty})`).join(', ');
      addAuditLog('Terima Produksi', `Terima ${totalActual}pcs ${product.name} ke Gudang Utama. Rincian: ${details}`);
      showMessage(`Berhasil: ${totalActual} Pcs ${product.name} masuk ke stok Gudang Utama (per varian).`);
      setSelectedProductId('');
      setReceiveActuals(prev => { const copy = { ...prev }; delete copy[log.id]; return copy; });
    } catch { showMessage('Gagal menerima hasil produksi.'); }
  };

  // Print receipt modal state
  const [printModal, setPrintModal] = useState(false);
  const [printLogId, setPrintLogId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState('');

  const openPrintReceipt = (logId: string) => {
    setPrintLogId(logId);
    setDriverName('');
    setPrintModal(true);
  };

  const handlePrintReceipt = () => {
    const log = convectionLogs.find(l => l.id === printLogId);
    if (!log) return;
    const product = products.find(p => p.id === (log.target_product_id || ''));
    printProductionReceipt(log, product, driverName.trim() || undefined);
    setPrintModal(false);
    setDriverName('');
  };

  const activeLogs = convectionLogs.filter(l => l.status === 'Di Jahit');
  const pendingReceive = convectionLogs.filter(l => l.status === 'Menunggu Diterima');
  const completedLogs = convectionLogs.filter(l => l.status === 'Selesai');

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab('kirim')} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${tab === 'kirim' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'}`}>
          1. Pengiriman Kain
        </button>
        <button onClick={() => setTab('hasil')} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all relative ${tab === 'hasil' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'}`}>
          2. Laporan Produksi
          {activeLogs.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">{activeLogs.length}</span>}
        </button>
        <button onClick={() => setTab('selesai')} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all relative ${tab === 'selesai' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'}`}>
          3. Terima Hasil
          {pendingReceive.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-warning text-warning-foreground text-[8px] font-bold flex items-center justify-center animate-pulse">{pendingReceive.length}</span>}
        </button>
      </div>

      {tab === 'kirim' ? (
        <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
          <h3 className="font-bold text-foreground">Kirim Kain ke Rumah Konveksi</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-xs font-semibold text-muted-foreground">Pilih Kain</label>
              <select className="input-field mt-1" value={selectedMaterialId} onChange={e => setSelectedMaterialId(e.target.value)}>
                <option value="">-- Pilih Kain --</option>
                {materials.filter(m => m.meters_total > 0 && m.status !== 'deleted').map(m => <option key={m.id} value={m.id}>{m.type} (Sisa {m.meters_total}m{m.width ? `, lebar ${m.width}cm` : ''})</option>)}
              </select>
            </div>
            <div><label className="text-xs font-semibold text-muted-foreground">Jumlah Meter</label><input className="input-field mt-1" type="number" step="0.1" value={form.meters} onChange={e => setForm({ ...form, meters: e.target.value })} /></div>
            <div><label className="text-xs font-semibold text-muted-foreground">Jenis Produksi</label>
              <select className="input-field mt-1" value={form.productionType} onChange={e => setForm({ ...form, productionType: e.target.value as 'internal' | 'makloon' })}>
                <option value="internal">Produksi Internal</option>
                <option value="makloon">Makloon / Vendor Luar</option>
              </select>
            </div>
            {form.productionType === 'makloon' ? (
              <div><label className="text-xs font-semibold text-muted-foreground">Nama Konveksi / Vendor <span className="text-destructive">*</span></label>
                <input className="input-field mt-1" value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} placeholder="CV. Konveksi Makmur..." />
              </div>
            ) : (
              <div><label className="text-xs font-semibold text-muted-foreground">Rumah Konveksi</label><input className="input-field mt-1" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} placeholder="Konveksi Bapak Haji..." /></div>
            )}
          </div>
          {form.productionType === 'makloon' && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/10 text-xs text-primary">
              <Package size={14} className="shrink-0 mt-0.5" />
              <span>Mode <strong>Makloon</strong>: Kain akan dikirim ke vendor eksternal. Nama vendor akan tercatat di log produksi.</span>
            </div>
          )}
          <button onClick={handleKirim} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">Catat Pengiriman Kain</button>
          <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 text-xs text-muted-foreground">
            <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
            <span>Pengiriman kain akan langsung memotong stok di Gudang Bahan Baku.</span>
          </div>
        </div>
      ) : tab === 'hasil' ? (
        <div className="space-y-4">
          {activeLogs.map(log => {
            const lf = getLogForm(log.id);
            const { pcs, sisaKain, totalCost, effectiveMeters } = calcResult(log.meters_sent, lf.fabricPerPiece, lf.costPerPcs, lf.defectMeters);
            const selectedProduct = products.find(p => p.id === lf.productId);
            const productVariants: ProductVariant[] = selectedProduct?.variants || [];
            const variantList = getLogVariantList(log.id);
            const totalAllocated = variantList.reduce((s, v) => s + v.qty, 0);
            const isAllocationValid = pcs > 0 && totalAllocated === pcs;

            const addVariantRow = (variant: ProductVariant) => {
              const barcode = variant.barcode || variant.sku || '';
              // Don't add duplicate
              if (variantList.some(v => v.barcode === barcode)) {
                showMessage('Varian ini sudah ada di daftar!');
                return;
              }
              setLogVariantList(log.id, [...variantList, {
                variant_name: `${selectedProduct?.name || ''} - ${variant.warna || ''} ${variant.size || ''} ${variant.style || ''}`.trim(),
                barcode,
                warna: variant.warna || '',
                size: variant.size || '',
                style: variant.style || '',
                qty: 0,
              }]);
            };

            const updateVariantQty = (idx: number, qty: number) => {
              const updated = [...variantList];
              updated[idx] = { ...updated[idx], qty: Math.max(0, qty) };
              setLogVariantList(log.id, updated);
            };

            const removeVariantRow = (idx: number) => {
              setLogVariantList(log.id, variantList.filter((_, i) => i !== idx));
            };

            return (
              <div key={log.id} className="p-5 rounded-2xl border border-border bg-card space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-foreground">{log.material_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Konveksi: {log.destination}
                      {(log as any).production_type === 'makloon' && <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">MAKLOON</span>}
                      {(log as any).jenis_produksi === 'Custom Order' && <span className="ml-2 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-bold">CUSTOM ORDER</span>}
                    </p>
                    {(log as any).jenis_produksi === 'Custom Order' && (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {(log as any).custom_customer_name && <span>Pemesan: <strong className="text-foreground">{(log as any).custom_customer_name}</strong> • </span>}
                        {(log as any).custom_size_detail && <span>Ukuran: {(log as any).custom_size_detail}</span>}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 rounded-full bg-secondary/30 text-xs font-bold text-secondary-foreground">Tahap Jahit</span>
                    <p className="text-sm font-bold text-primary mt-1">Total Kain: {log.meters_sent} Meter</p>
                  </div>
                </div>

                {/* Input Section */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Kolom Isian</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">Pilih Produk Jadi</label>
                      <select className="input-field mt-1" value={lf.productId} onChange={e => { setLogForm(log.id, { productId: e.target.value }); setLogVariantList(log.id, []); }}>
                        <option value="">-- Pilih Produk --</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">Kebutuhan Kain 1 Baju (Meter)</label>
                      <input className="input-field mt-1" type="number" step="0.1" value={lf.fabricPerPiece} onChange={e => setLogForm(log.id, { fabricPerPiece: e.target.value })} placeholder="Contoh: 1.7" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">Ongkos Jahit per Pcs (Rp)</label>
                      <input className="input-field mt-1" value={formatNumber(lf.costPerPcs)} onChange={e => setLogForm(log.id, { costPerPcs: unformatNumber(e.target.value) })} placeholder="Contoh: 35.000" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">Kain Cacat / Reject (Meter)</label>
                      <input className="input-field mt-1" type="number" step="0.1" value={lf.defectMeters} onChange={e => setLogForm(log.id, { defectMeters: e.target.value })} placeholder="Opsional" />
                    </div>
                  </div>
                  {parseFloat(lf.defectMeters) > 0 && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-xs text-destructive">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>Kain efektif: {effectiveMeters} meter (dikurangi {lf.defectMeters}m kain cacat)</span>
                    </div>
                  )}
                </div>

                {/* Auto-Calc Cards */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Hasil Kalkulasi Otomatis</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-1">
                      <Package size={20} className="mx-auto text-primary" />
                      <p className="text-xs text-muted-foreground">Baju yang Dihasilkan</p>
                      <p className="text-2xl font-bold text-primary">{pcs} <span className="text-sm">Pcs</span></p>
                      {lf.fabricPerPiece && <p className="text-[10px] text-muted-foreground">= Math.floor({effectiveMeters} ÷ {lf.fabricPerPiece || '?'})</p>}
                    </div>
                    <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 text-center space-y-1">
                      <Scissors size={20} className="mx-auto text-warning" />
                      <p className="text-xs text-muted-foreground">Sisa Kain Potongan</p>
                      <p className="text-2xl font-bold text-warning">{sisaKain} <span className="text-sm">Meter</span></p>
                      {pcs > 0 && <p className="text-[10px] text-muted-foreground">= {effectiveMeters} - ({pcs} × {lf.fabricPerPiece})</p>}
                    </div>
                    <div className="p-4 rounded-xl bg-success/10 border border-success/20 text-center space-y-1">
                      <Calculator size={20} className="mx-auto text-success" />
                      <p className="text-xs text-muted-foreground">Total Biaya Jahit</p>
                      <p className="text-2xl font-bold text-success">Rp {formatNumber(totalCost)}</p>
                      {pcs > 0 && lf.costPerPcs && <p className="text-[10px] text-muted-foreground">= {pcs} Pcs × Rp {formatNumber(lf.costPerPcs)}</p>}
                    </div>
                  </div>
                </div>

                {/* === NEW: Variant Distribution Section === */}
                {lf.productId && pcs > 0 && (
                  <div className="space-y-3 p-4 rounded-xl border border-border bg-muted/30">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Distribusi Ukuran & Varian (Target Produksi)</p>

                    {productVariants.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Produk ini belum memiliki varian. Tambahkan varian di Master Produk terlebih dahulu.</p>
                    ) : (
                      <>
                        {/* Add variant dropdown */}
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <label className="text-xs font-semibold text-muted-foreground">Pilih Varian</label>
                            <select id={`add-variant-${log.id}`} className="input-field mt-1">
                              <option value="">-- Pilih Varian --</option>
                              {productVariants
                                .filter(v => !variantList.some(vl => vl.barcode === (v.barcode || v.sku)))
                                .map((v, i) => (
                                  <option key={i} value={i}>
                                    [{v.barcode || v.sku || '-'}] {v.warna || '-'}, {v.size || '-'}, {v.style || '-'} (Stok: {v.stock || 0})
                                  </option>
                                ))}
                            </select>
                          </div>
                          <button
                            onClick={() => {
                              const sel = document.getElementById(`add-variant-${log.id}`) as HTMLSelectElement;
                              const availableVariants = productVariants.filter(v => !variantList.some(vl => vl.barcode === (v.barcode || v.sku)));
                              const idx = parseInt(sel?.value);
                              if (isNaN(idx) || !availableVariants[idx]) { showMessage('Pilih varian terlebih dahulu!'); return; }
                              addVariantRow(availableVariants[idx]);
                              sel.value = '';
                            }}
                            className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1"
                          >
                            <Plus size={14} /> Tambah
                          </button>
                        </div>

                        {/* Variant table */}
                        {variantList.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border text-left text-muted-foreground">
                                  <th className="py-2 px-2">No</th>
                                  <th className="py-2 px-2">Barcode</th>
                                  <th className="py-2 px-2">Warna</th>
                                  <th className="py-2 px-2">Size</th>
                                  <th className="py-2 px-2">Style</th>
                                  <th className="py-2 px-2 w-24">Qty (Pcs)</th>
                                  <th className="py-2 px-2 w-12"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {variantList.map((v, idx) => (
                                  <tr key={idx} className="border-b border-border/50">
                                    <td className="py-2 px-2 text-muted-foreground">{idx + 1}</td>
                                    <td className="py-2 px-2 font-mono text-foreground">{v.barcode || '-'}</td>
                                    <td className="py-2 px-2 text-foreground">{v.warna || '-'}</td>
                                    <td className="py-2 px-2 text-foreground">{v.size || '-'}</td>
                                    <td className="py-2 px-2 text-foreground">{v.style || '-'}</td>
                                    <td className="py-2 px-2">
                                      <input
                                        type="number" min="0"
                                        className="input-field w-20 text-center"
                                        value={v.qty || ''}
                                        onChange={e => updateVariantQty(idx, parseInt(e.target.value) || 0)}
                                      />
                                    </td>
                                    <td className="py-2 px-2">
                                      <button onClick={() => removeVariantRow(idx)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Allocation validation text */}
                        <div className={`text-xs font-bold px-3 py-2 rounded-lg ${isAllocationValid ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                          Total Dialokasikan: {totalAllocated} / {pcs} Pcs
                          {isAllocationValid ? ' ✓ Sesuai' : ' — Belum sesuai, pastikan total sama dengan jumlah baju'}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <button
                  onClick={() => handleTerima(log)}
                  disabled={!isAllocationValid || pcs <= 0}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition-opacity flex items-center justify-center gap-2 ${isAllocationValid && pcs > 0 ? 'bg-warning text-warning-foreground hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'}`}
                >
                  Kalkulasi & Kirim ke Penerimaan
                </button>
              </div>
            );
          })}
          {activeLogs.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">Tidak ada pekerjaan jahit yang aktif.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="font-bold text-foreground">Konfirmasi Penerimaan Hasil Produksi</h3>
          <p className="text-xs text-muted-foreground">Setelah dikonfirmasi, stok otomatis masuk ke Master Produk (Gudang Utama) berdasarkan varian.</p>

          {pendingReceive.map(log => {
            const variantDist = log.variant_distribution || [];
            const actuals = receiveActuals[log.id] || {};
            const totalTarget = variantDist.reduce((s, v) => s + v.qty, 0);
            const totalActual = variantDist.reduce((s, v) => s + (actuals[v.barcode] !== undefined ? actuals[v.barcode] : v.qty), 0);

            return (
              <div key={log.id} className="p-5 rounded-2xl border-2 border-warning/30 bg-card space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-foreground">{log.material_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Konveksi: {log.destination} | {log.meters_sent} Meter
                      {(log as any).production_type === 'makloon' && <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">MAKLOON</span>}
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-warning/10 text-xs font-bold text-warning animate-pulse">Menunggu Diterima</span>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-muted-foreground">Kebutuhan/Baju:</span> <span className="font-bold text-foreground">{log.fabric_per_piece || '-'} m</span></div>
                  <div><span className="text-muted-foreground">Sisa Potongan:</span> <span className="font-bold text-foreground">{log.cutting_loss_waste} Meter</span></div>
                  <div><span className="text-muted-foreground">Hasil Target:</span> <span className="font-bold text-primary text-sm">{totalTarget} Pcs</span></div>
                  <div><span className="text-muted-foreground">Ongkos/Pcs:</span> <span className="font-bold text-foreground">Rp {formatNumber(log.cost_per_piece || 0)}</span></div>
                </div>

                {/* Product info */}
                {log.target_product_name && (
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-sm">
                    <span className="text-muted-foreground">Produk:</span> <span className="font-bold text-foreground">{log.target_product_name}</span>
                    <span className="text-muted-foreground ml-3">Total Ongkos:</span> <span className="font-bold text-success ml-1">Rp {formatNumber(log.convection_cost || 0)}</span>
                  </div>
                )}

                {/* Variant detail with actual input */}
                {variantDist.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rincian Varian & Hasil Aktual</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="py-2 px-2">Barcode</th>
                            <th className="py-2 px-2">Warna</th>
                            <th className="py-2 px-2">Size</th>
                            <th className="py-2 px-2">Style</th>
                            <th className="py-2 px-2 text-center">Target</th>
                            <th className="py-2 px-2 text-center w-24">Hasil Aktual</th>
                            <th className="py-2 px-2 text-center">Selisih</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variantDist.map((v, idx) => {
                            const actualVal = actuals[v.barcode] !== undefined ? actuals[v.barcode] : v.qty;
                            const diff = actualVal - v.qty;
                            return (
                              <tr key={idx} className="border-b border-border/50">
                                <td className="py-2 px-2 font-mono text-foreground">{v.barcode || '-'}</td>
                                <td className="py-2 px-2 text-foreground">{v.warna || '-'}</td>
                                <td className="py-2 px-2 text-foreground">{v.size || '-'}</td>
                                <td className="py-2 px-2 text-foreground">{v.style || '-'}</td>
                                <td className="py-2 px-2 text-center font-bold text-foreground">{v.qty}</td>
                                <td className="py-2 px-2 text-center">
                                  <input
                                    type="number" min="0"
                                    className="input-field w-20 text-center"
                                    value={actualVal}
                                    onChange={e => {
                                      const val = parseInt(e.target.value) || 0;
                                      setReceiveActuals(prev => ({
                                        ...prev,
                                        [log.id]: { ...(prev[log.id] || {}), [v.barcode]: val }
                                      }));
                                    }}
                                  />
                                </td>
                                <td className={`py-2 px-2 text-center font-bold ${diff < 0 ? 'text-destructive' : diff > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                                  {diff > 0 ? `+${diff}` : diff}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between text-xs px-2">
                      <span className="text-muted-foreground">Total Aktual: <span className="font-bold text-foreground">{totalActual} Pcs</span> (Target: {totalTarget})</span>
                      {totalActual !== totalTarget && (
                        <span className="text-destructive font-bold">Selisih: {totalActual - totalTarget} Pcs</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-muted/30 text-xs text-muted-foreground italic">
                    Data varian tidak tersedia (data lama). Stok akan ditambahkan secara total.
                  </div>
                )}

                {!log.target_product_name && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Produk Tujuan Stok</label>
                    <select className="input-field mt-1" value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
                      <option value="">-- Pilih Produk --</option>
                      {products.map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.name} (Stok: {p.stock_map?.['Gudang Utama'] || 0})</option>)}
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => openPrintReceipt(log.id)} className="flex-1 py-3 rounded-xl bg-primary/10 text-primary font-bold text-sm hover:bg-primary/20 transition-colors flex items-center justify-center gap-2 border border-primary/20">
                    <FileText size={16} /> Cetak Surat Penerimaan
                  </button>
                  <button onClick={() => handleConfirmReceive(log)} className="flex-1 py-3 rounded-xl bg-success text-success-foreground font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} /> Terima & Masukkan ke Stok
                  </button>
                </div>
              </div>
            );
          })}
          {pendingReceive.length === 0 && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">Tidak ada produksi yang menunggu diterima.</p>
            </div>
          )}

          {/* Completed logs */}
          {completedLogs.length > 0 && (
            <>
              <div className="flex items-center justify-between mt-6">
                <h4 className="font-bold text-foreground">Riwayat Produksi Selesai</h4>
                <button onClick={() => printProductionReport(completedLogs)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
                  <Printer size={14} /> Cetak Semua Laporan (PDF)
                </button>
              </div>
              <div className="space-y-2">
                {completedLogs.slice(0, 10).map(log => {
                  const varDist = log.variant_distribution || [];
                  return (
                    <div key={log.id} className="p-3 rounded-xl border border-border bg-card">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{log.material_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {log.destination} | {log.pcs_result} Pcs | Rp {formatNumber(log.convection_cost || 0)}
                            {(log as any).production_type === 'makloon' && <span className="ml-1 text-primary font-bold">(Makloon)</span>}
                          </p>
                          {varDist.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Varian: {varDist.map(v => `${v.warna} ${v.size} (${v.actual_qty ?? v.qty})`).join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openPrintReceipt(log.id)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Cetak Surat Penerimaan">
                            <Printer size={14} />
                          </button>
                          <button onClick={() => printSingleProductionReport(log)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Cetak Laporan Produksi">
                            <FileText size={14} />
                          </button>
                          <span className="px-3 py-1 rounded-full bg-success/10 text-xs font-bold text-success">Selesai</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Print Receipt Dialog */}
      <Dialog open={printModal} onOpenChange={setPrintModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck size={18} className="text-primary" /> Cetak Surat Penerimaan Produksi
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Nama Sopir / Kurir</label>
              <input className="input-field mt-1" value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Masukkan nama sopir..." />
            </div>
            <p className="text-xs text-muted-foreground">Opsional. Nama sopir akan tercantum di header surat penerimaan.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintModal(false)}>Batal</Button>
            <Button onClick={handlePrintReceipt}>
              <FileText size={14} className="mr-1" /> Cetak PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
