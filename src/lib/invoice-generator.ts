import type { ShippingLog, Product } from './store';

function generateInvoiceNumber(log: ShippingLog): string {
  const date = new Date(log.timestamp);
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const seq = log.id.slice(-4).toUpperCase();
  return `SJ-DLW-${y}${m}${d}-${seq}`;
}

export function printShippingInvoice(log: ShippingLog, product?: Product, driverName?: string) {
  const invoiceNumber = generateInvoiceNumber(log);
  const date = new Date(log.timestamp);
  const formattedDate = date.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const statusLabel = log.status === 'Received' ? 'DITERIMA' : 'IN TRANSIT';
  const statusColor = log.status === 'Received' ? '#16a34a' : '#d97706';

  // Build variant detail rows from shipping items array (new format)
  let variantRows = '';
  if (log.items && log.items.length > 0) {
    variantRows = log.items.map((item, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${item.product_name}</td>
        <td><code>${item.barcode}</code></td>
        <td>${item.warna || '-'}</td>
        <td style="text-align:center;">${item.size || '-'}</td>
        <td style="text-align:center;">${item.style || '-'}</td>
        <td style="text-align:center;font-weight:700;">${item.qty}</td>
      </tr>`).join('');
  } else if (product?.variants && product.variants.length > 0) {
    // Legacy fallback: single product variants
    variantRows = product.variants.map((v, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${product.name}</td>
        <td><code>${v.barcode || v.sku || '-'}</code></td>
        <td>${v.warna || '-'}</td>
        <td style="text-align:center;">${v.size || '-'}</td>
        <td style="text-align:center;">${v.style || '-'}</td>
        <td style="text-align:center;">${i === 0 ? log.qty : '-'}</td>
      </tr>`).join('');
  } else {
    variantRows = `<tr>
      <td style="text-align:center;">1</td>
      <td>${log.product_name}</td>
      <td><code>${log.product_sku}</code></td>
      <td>-</td>
      <td style="text-align:center;">-</td>
      <td style="text-align:center;">-</td>
      <td style="text-align:center;font-weight:700;">${log.qty}</td>
    </tr>`;
  }

  const totalQty = log.items ? log.items.reduce((s, i) => s + i.qty, 0) : log.qty;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Surat Jalan - ${invoiceNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a1a; background: #fff; padding: 24px; }
  .invoice { max-width: 750px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a3a; padding-bottom: 16px; margin-bottom: 20px; }
  .brand h1 { font-size: 28px; font-weight: 800; color: #1a3a3a; letter-spacing: -0.5px; }
  .brand p { font-size: 11px; color: #666; margin-top: 2px; }
  .inv-info { text-align: right; }
  .inv-info h2 { font-size: 14px; color: #1a3a3a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .inv-info .inv-num { font-size: 18px; font-weight: 700; color: #1a3a3a; }
  .inv-info .inv-date { font-size: 12px; color: #555; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr ${driverName ? '1fr' : ''}; gap: 16px; margin-bottom: 24px; }
  .meta-box { background: #f7f9f9; border: 1px solid #e2e8e8; border-radius: 8px; padding: 14px; }
  .meta-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 6px; }
  .meta-box p { font-size: 13px; font-weight: 600; color: #1a3a3a; }
  .meta-box .sub { font-size: 11px; color: #666; font-weight: 400; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: #1a3a3a; color: #fff; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
  thead th:first-child { border-radius: 8px 0 0 0; }
  thead th:last-child { border-radius: 0 8px 0 0; text-align: center; }
  tbody td { padding: 10px 12px; font-size: 12px; border-bottom: 1px solid #eee; }
  tbody code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
  tfoot td { padding: 10px 12px; font-size: 13px; font-weight: 700; border-top: 2px solid #1a3a3a; }
  .status-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; color: #fff; background: ${statusColor}; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 32px; }
  .sig-box { text-align: center; }
  .sig-box .title { font-size: 11px; color: #888; margin-bottom: 60px; }
  .sig-box .line { border-top: 1px solid #333; padding-top: 6px; font-size: 12px; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8e8; text-align: center; font-size: 10px; color: #999; }
  .confirm-note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #92400e; }
  .confirm-note strong { color: #78350f; }
  @media print { body { padding: 0; } .no-print { display: none !important; } }
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
      <h2>📦 Surat Jalan</h2>
      <div class="inv-num">${invoiceNumber}</div>
      <div class="inv-date">${formattedDate}</div>
      <div class="inv-date">${formattedTime}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <h3>Pengirim</h3>
      <p>Gudang Utama</p>
      <p class="sub">DALWA.CO Warehouse</p>
    </div>
    <div class="meta-box">
      <h3>Tujuan</h3>
      <p>${log.destination}</p>
      <p class="sub">Penerima Toko</p>
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
        <th>Barcode</th>
        <th>Warna</th>
        <th style="text-align:center;">Size</th>
        <th style="text-align:center;">Style</th>
        <th style="text-align:center;">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${variantRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="text-align:right;">Total</td>
        <td style="text-align:center;">${totalQty} Pcs</td>
      </tr>
    </tfoot>
  </table>

  <div style="text-align:center;margin-bottom:20px;">
    <span class="status-badge">${statusLabel}</span>
  </div>

  <div class="confirm-note">
    <strong>⚠️ Catatan Penting:</strong> Dokumen ini harus ditandatangani oleh penerima di toko tujuan. 
    Setelah barang diterima secara fisik, penerima wajib mengkonfirmasi penerimaan melalui sistem 
    agar stok toko diperbarui dan status berubah menjadi "Diterima".
  </div>

  <div class="signatures">
    <div class="sig-box">
      <div class="title">Pengirim<br>(Admin Gudang)</div>
      <div class="line">___________________</div>
    </div>
    <div class="sig-box">
      <div class="title">Sopir / Kurir<br>${driverName ? `(${driverName})` : '(________________)'}</div>
      <div class="line">___________________</div>
    </div>
    <div class="sig-box">
      <div class="title">Penerima<br>(Toko ${log.destination})</div>
      <div class="line">___________________</div>
    </div>
  </div>

  <div class="footer">
    <p>Dokumen ini dicetak secara otomatis oleh Sistem DALWA.CO</p>
    <p>No. Surat Jalan: ${invoiceNumber} | Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</p>
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
