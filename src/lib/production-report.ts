import type { ConvectionLog } from './store';
import { formatNumber } from './store';

export function printProductionReport(logs: ConvectionLog[]) {
  const now = new Date();
  const formattedDate = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formattedTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const totalPcs = logs.reduce((sum, l) => sum + (l.pcs_result || 0), 0);
  const totalCost = logs.reduce((sum, l) => sum + (l.convection_cost || 0), 0);
  const totalMeters = logs.reduce((sum, l) => sum + l.meters_sent, 0);

  const tableRows = logs.map((log, i) => {
    const date = new Date(log.timestamp);
    const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    return `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${dateStr}</td>
        <td><strong>${log.material_name}</strong></td>
        <td>${log.destination}</td>
        <td style="text-align:center;">${log.meters_sent} m</td>
        <td>${log.target_product_name || '-'}</td>
        <td style="text-align:center;">${log.fabric_per_piece || '-'} m</td>
        <td style="text-align:center;font-weight:700;color:#1a3a3a;">${log.pcs_result || 0} Pcs</td>
        <td style="text-align:center;">${log.cutting_loss_waste || 0} m</td>
        <td style="text-align:right;">Rp ${formatNumber(log.convection_cost || 0)}</td>
        <td style="text-align:right;">Rp ${formatNumber(log.cost_per_piece || 0)}</td>
        <td style="text-align:center;"><span class="status status-${log.status === 'Selesai' ? 'done' : log.status === 'Menunggu Diterima' ? 'pending' : 'active'}">${log.status}</span></td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Laporan Produksi Konveksi - DALWA.CO</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a1a; background: #fff; padding: 20px; }
  .report { max-width: 1100px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a3a; padding-bottom: 16px; margin-bottom: 20px; }
  .brand h1 { font-size: 28px; font-weight: 800; color: #1a3a3a; }
  .brand p { font-size: 11px; color: #666; margin-top: 2px; }
  .report-info { text-align: right; }
  .report-info h2 { font-size: 16px; color: #1a3a3a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .report-info .date { font-size: 12px; color: #555; }

  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .summary-card { background: #f7f9f9; border: 1px solid #e2e8e8; border-radius: 10px; padding: 16px; text-align: center; }
  .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
  .summary-card .value { font-size: 24px; font-weight: 800; color: #1a3a3a; }
  .summary-card .value.primary { color: #16a34a; }
  .summary-card .value.warn { color: #d97706; }
  .summary-card .unit { font-size: 11px; color: #666; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
  thead th { background: #1a3a3a; color: #fff; padding: 8px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; text-align: left; white-space: nowrap; }
  thead th:first-child { border-radius: 8px 0 0 0; }
  thead th:last-child { border-radius: 0 8px 0 0; }
  tbody td { padding: 8px 6px; border-bottom: 1px solid #eee; vertical-align: middle; }
  tbody tr:hover { background: #f9fafb; }
  tfoot td { padding: 10px 6px; font-weight: 700; border-top: 2px solid #1a3a3a; font-size: 12px; }

  .status { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 9px; font-weight: 700; white-space: nowrap; }
  .status-done { background: #dcfce7; color: #166534; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-active { background: #dbeafe; color: #1e40af; }

  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8e8; text-align: center; font-size: 10px; color: #999; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 40px; }
  .sig-box { text-align: center; }
  .sig-box .title { font-size: 11px; color: #888; margin-bottom: 60px; }
  .sig-box .line { border-top: 1px solid #333; padding-top: 6px; font-size: 12px; font-weight: 600; }

  @media print {
    body { padding: 10px; }
    .no-print { display: none !important; }
    .summary-grid { break-inside: avoid; }
    table { font-size: 9px; }
    thead th { font-size: 8px; padding: 6px 4px; }
    tbody td { padding: 5px 4px; }
  }
</style>
</head>
<body>
<div class="report">
  <div class="header">
    <div class="brand">
      <h1>DALWA.CO</h1>
      <p>Sistem Manajemen Retail Terpadu</p>
    </div>
    <div class="report-info">
      <h2>📋 Laporan Produksi Konveksi</h2>
      <div class="date">${formattedDate} • ${formattedTime}</div>
      <div class="date">Total Data: ${logs.length} Transaksi</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Total Kain Dikirim</div>
      <div class="value">${totalMeters}</div>
      <div class="unit">Meter</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Hasil Produksi</div>
      <div class="value primary">${totalPcs}</div>
      <div class="unit">Pcs</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Ongkos Jahit</div>
      <div class="value warn">Rp ${formatNumber(totalCost)}</div>
      <div class="unit">Rupiah</div>
    </div>
    <div class="summary-card">
      <div class="label">Rata-rata Ongkos/Baju</div>
      <div class="value">${totalPcs > 0 ? 'Rp ' + formatNumber(Math.round(totalCost / totalPcs)) : '-'}</div>
      <div class="unit">Per Pcs</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:center;">No</th>
        <th>Tanggal</th>
        <th>Jenis Kain</th>
        <th>Konveksi</th>
        <th style="text-align:center;">Kain</th>
        <th>Produk Jadi</th>
        <th style="text-align:center;">Kain/Baju</th>
        <th style="text-align:center;">Hasil</th>
        <th style="text-align:center;">Sisa</th>
        <th style="text-align:right;">Ongkos</th>
        <th style="text-align:right;">Per Baju</th>
        <th style="text-align:center;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="text-align:right;">TOTAL</td>
        <td style="text-align:center;">${totalMeters} m</td>
        <td></td>
        <td></td>
        <td style="text-align:center;color:#16a34a;">${totalPcs} Pcs</td>
        <td></td>
        <td style="text-align:right;">Rp ${formatNumber(totalCost)}</td>
        <td style="text-align:right;">${totalPcs > 0 ? 'Rp ' + formatNumber(Math.round(totalCost / totalPcs)) : '-'}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="signatures">
    <div class="sig-box">
      <div class="title">Dibuat oleh<br>(Admin Gudang)</div>
      <div class="line">___________________</div>
    </div>
    <div class="sig-box">
      <div class="title">Diketahui oleh<br>(Kepala Produksi)</div>
      <div class="line">___________________</div>
    </div>
    <div class="sig-box">
      <div class="title">Disetujui oleh<br>(Admin Pusat)</div>
      <div class="line">___________________</div>
    </div>
  </div>

  <div class="footer">
    <p>Dokumen ini dicetak secara otomatis oleh Sistem DALWA.CO</p>
    <p>Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}</p>
  </div>
</div>

<div class="no-print" style="text-align:center;margin-top:24px;">
  <button onclick="window.print()" style="padding:12px 36px;background:#1a3a3a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
    🖨️ Cetak / Simpan PDF
  </button>
</div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

export function printSingleProductionReport(log: ConvectionLog) {
  printProductionReport([log]);
}

export function printProductionReceipt(log: ConvectionLog, product: { name: string; variants?: { warna?: string; size?: string; stock?: number }[] } | undefined, driverName?: string) {
  const date = new Date(log.timestamp);
  const formattedDate = date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formattedTime = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const seq = log.id.slice(-4).toUpperCase();
  const receiptNumber = `SP-DLW-${y}${m}${d}-${seq}`;

  const productName = log.target_product_name || product?.name || '-';
  const totalPcs = log.pcs_result || 0;

  // Build variant rows
  const variantRows = product?.variants && product.variants.length > 0
    ? product.variants.map((v, i) => `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${productName}</td>
          <td>${v.warna || '-'}</td>
          <td style="text-align:center;">${v.size || '-'}</td>
          <td style="text-align:center;">${i === 0 ? totalPcs : '-'}</td>
        </tr>`).join('')
    : `<tr>
        <td style="text-align:center;">1</td>
        <td>${productName}</td>
        <td>-</td>
        <td style="text-align:center;">-</td>
        <td style="text-align:center;">${totalPcs}</td>
      </tr>`;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Surat Penerimaan - ${receiptNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a1a; background: #fff; padding: 24px; }
  .invoice { max-width: 700px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a3a; padding-bottom: 16px; margin-bottom: 20px; }
  .brand h1 { font-size: 28px; font-weight: 800; color: #1a3a3a; letter-spacing: -0.5px; }
  .brand p { font-size: 11px; color: #666; margin-top: 2px; }
  .inv-info { text-align: right; }
  .inv-info h2 { font-size: 14px; color: #1a3a3a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .inv-info .inv-num { font-size: 18px; font-weight: 700; color: #1a3a3a; }
  .inv-info .inv-date { font-size: 12px; color: #555; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: ${driverName ? '1fr 1fr 1fr' : '1fr 1fr'}; gap: 16px; margin-bottom: 24px; }
  .meta-box { background: #f7f9f9; border: 1px solid #e2e8e8; border-radius: 8px; padding: 14px; }
  .meta-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 6px; }
  .meta-box p { font-size: 13px; font-weight: 600; color: #1a3a3a; }
  .meta-box .sub { font-size: 11px; color: #666; font-weight: 400; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: #1a3a3a; color: #fff; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
  thead th:first-child { border-radius: 8px 0 0 0; }
  thead th:last-child { border-radius: 0 8px 0 0; text-align: center; }
  tbody td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid #eee; }
  tbody td:last-child { text-align: center; font-weight: 700; }
  .production-info { background: #f7f9f9; border: 1px solid #e2e8e8; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .production-info h3 { font-size: 12px; font-weight: 700; color: #1a3a3a; margin-bottom: 10px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .info-item { text-align: center; }
  .info-item .label { font-size: 10px; color: #888; text-transform: uppercase; }
  .info-item .value { font-size: 18px; font-weight: 700; color: #1a3a3a; }
  .info-item .value.green { color: #16a34a; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 32px; }
  .sig-box { text-align: center; }
  .sig-box .title { font-size: 11px; color: #888; margin-bottom: 60px; }
  .sig-box .line { border-top: 1px solid #333; padding-top: 6px; font-size: 12px; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8e8; text-align: center; font-size: 10px; color: #999; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <div class="brand">
      <h1>DALWA.CO</h1>
      <p>Sistem Manajemen Terpadu</p>
    </div>
    <div class="inv-info">
      <h2>📦 Surat Penerimaan Hasil Produksi</h2>
      <div class="inv-num">${receiptNumber}</div>
      <div class="inv-date">${formattedDate}</div>
      <div class="inv-date">${formattedTime}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <h3>Pengirim (Konveksi)</h3>
      <p>${log.destination}</p>
      <p class="sub">${(log as any).production_type === 'makloon' ? 'Vendor Makloon' : 'Produksi Internal'}</p>
    </div>
    <div class="meta-box">
      <h3>Penerima</h3>
      <p>Gudang Utama</p>
      <p class="sub">DALWA.CO Warehouse</p>
    </div>
    ${driverName ? `
    <div class="meta-box">
      <h3>Sopir / Kurir</h3>
      <p>${driverName}</p>
      <p class="sub">Penanggung Jawab Pengiriman</p>
    </div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:center;">No</th>
        <th>Nama Produk</th>
        <th>Warna</th>
        <th style="text-align:center;">Ukuran</th>
        <th style="text-align:center;">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${variantRows}
    </tbody>
  </table>

  <div class="production-info">
    <h3>📋 Informasi Produksi</h3>
    <div class="info-grid">
      <div class="info-item">
        <div class="label">Bahan Kain</div>
        <div class="value">${log.material_name}</div>
      </div>
      <div class="info-item">
        <div class="label">Kain Dikirim</div>
        <div class="value">${log.meters_sent} m</div>
      </div>
      <div class="info-item">
        <div class="label">Total Hasil</div>
        <div class="value green">${totalPcs} Pcs</div>
      </div>
    </div>
  </div>

  <div class="signatures">
    <div class="sig-box">
      <div class="title">Pengirim<br>(Konveksi / Vendor)</div>
      <div class="line">___________________</div>
    </div>
    <div class="sig-box">
      <div class="title">Sopir / Kurir<br>${driverName ? `(${driverName})` : '(________________)'}</div>
      <div class="line">___________________</div>
    </div>
    <div class="sig-box">
      <div class="title">Penerima<br>(Admin Gudang)</div>
      <div class="line">___________________</div>
    </div>
  </div>

  <div class="footer">
    <p>Dokumen ini dicetak secara otomatis oleh Sistem DALWA.CO</p>
    <p>No. Surat: ${receiptNumber} | Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</p>
  </div>
</div>

<div class="no-print" style="text-align:center;margin-top:24px;">
  <button onclick="window.print()" style="padding:10px 32px;background:#1a3a3a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
    🖨️ Cetak / Simpan PDF
  </button>
</div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}
