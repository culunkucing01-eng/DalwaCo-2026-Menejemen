import { useState } from 'react';
import { useAppState, ROLES } from '@/lib/store';
import { BookOpen, ChevronDown, ChevronRight, CheckCircle2, ShoppingCart, Package, Truck, Warehouse, Scissors, Scale, Users, TrendingUp, Receipt, Wallet, Store, MessageSquare, Shirt, Download, Shield, Wifi, WifiOff, Database, Lock } from 'lucide-react';

interface SOPStep {
  title: string;
  description: string;
}

interface SOPItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary: string;
  steps: SOPStep[];
}

const SOP_KASIR: SOPItem[] = [
  {
    id: 'pos',
    icon: <ShoppingCart size={18} />,
    title: 'Transaksi POS (Penjualan)',
    summary: 'Proses penjualan harian di toko.',
    steps: [
      { title: 'Buka halaman Kasir POS', description: 'Pilih menu "Kasir POS" di sidebar.' },
      { title: 'Cari & tambah produk', description: 'Ketik nama/SKU di kolom pencarian atau scan barcode. Jika barcode cocok, produk langsung masuk keranjang.' },
      { title: 'Pilih varian (jika ada)', description: 'Untuk produk bervarian (warna/ukuran), pilih spesifik varian dari pop-up modal.' },
      { title: 'Atur jumlah', description: 'Sesuaikan qty di keranjang. Sistem akan menolak jika stok tidak mencukupi (proteksi atomic).' },
      { title: 'Pilih metode pembayaran', description: 'Tunai/QRIS, Piutang (Hutang Tempo), atau Gift/Owner. Masing-masing memiliki alur berbeda.' },
      { title: 'Proses & cetak struk', description: 'Klik "Proses Pembayaran". Stok dipotong secara atomic (aman dari bentrok kasir lain). Struk otomatis dicetak.' },
    ],
  },
  {
    id: 'offline-mode',
    icon: <WifiOff size={18} />,
    title: 'Mode Offline (Wi-Fi Putus)',
    summary: 'Kasir tetap bisa bertransaksi saat internet mati.',
    steps: [
      { title: 'Sistem otomatis bekerja offline', description: 'Jika Wi-Fi toko putus, aplikasi tetap bisa digunakan karena data di-cache secara lokal (IndexedDB).' },
      { title: 'Transaksi akan mengantri', description: 'Semua transaksi yang dibuat saat offline akan disimpan di perangkat lokal.' },
      { title: 'Sinkronisasi otomatis', description: 'Segera setelah internet menyala kembali, semua data otomatis terkirim ke server pusat. Tidak perlu aksi manual.' },
      { title: 'Catatan penting', description: 'Hindari membuka aplikasi di tab browser kedua saat mode offline. Hanya 1 tab yang didukung untuk offline persistence.' },
    ],
  },
  {
    id: 'receiving',
    icon: <Package size={18} />,
    title: 'Penerimaan Barang dari Gudang',
    summary: 'Validasi barang masuk agar stok toko bertambah.',
    steps: [
      { title: 'Buka Penerimaan Barang', description: 'Lihat daftar barang yang statusnya "In Transit" dari gudang.' },
      { title: 'Cek fisik barang', description: 'Pastikan jumlah & kondisi barang sesuai Surat Jalan.' },
      { title: 'Konfirmasi terima', description: 'Klik "Konfirmasi Terima Barang". Stok toko otomatis bertambah.' },
      { title: 'Jika ada selisih', description: 'Laporkan ke Admin Gudang. Koreksi stok dilakukan via Penyesuaian Stok.' },
    ],
  },
  {
    id: 'stock-request',
    icon: <MessageSquare size={18} />,
    title: 'Request Stok ke Gudang',
    summary: 'Minta pengiriman stok tambahan.',
    steps: [
      { title: 'Buka Request Stok', description: 'Pilih menu "Request Stok" di sidebar.' },
      { title: 'Buat request baru', description: 'Pilih produk, masukkan jumlah yang dibutuhkan, dan kirim request.' },
      { title: 'Pantau status', description: 'Lihat apakah request sudah disetujui, ditolak, atau sedang diproses.' },
      { title: 'Terima barang', description: 'Setelah disetujui & dikirim, konfirmasi di halaman Penerimaan Barang.' },
    ],
  },
  {
    id: 'opname',
    icon: <Scale size={18} />,
    title: 'Penyesuaian Stok Toko',
    summary: 'Koreksi selisih stok fisik vs sistem dengan alasan jelas.',
    steps: [
      { title: 'Buka Penyesuaian Stok', description: 'Menu hanya menampilkan stok toko Anda.' },
      { title: 'Pilih produk & lihat varian', description: 'Setelah memilih produk, detail varian (Warna, Size, Style, Stok) akan ditampilkan untuk membantu identifikasi.' },
      { title: 'Input stok aktual', description: 'Masukkan stok fisik dan WAJIB isi alasan selisih (rusak, hilang, dll).' },
      { title: 'Simpan', description: 'Perubahan tercatat di audit log. Kasir hanya bisa mengajukan — approval dari Admin.' },
    ],
  },
  {
    id: 'piutang',
    icon: <Wallet size={18} />,
    title: 'Pelunasan Piutang',
    summary: 'Kelola hutang tempo pelanggan.',
    steps: [
      { title: 'Buka menu Piutang', description: 'Lihat daftar piutang toko Anda yang masih aktif.' },
      { title: 'Terima pembayaran', description: 'Saat pelanggan membayar, klik "Lunasi" pada piutang terkait.' },
      { title: 'Pantau jatuh tempo', description: 'Badge merah muncul jika ada piutang mendekati/melewati jatuh tempo.' },
    ],
  },
  {
    id: 'store-profile',
    icon: <Store size={18} />,
    title: 'Profil Toko',
    summary: 'Kelola informasi toko untuk struk POS.',
    steps: [
      { title: 'Buka Profil Toko', description: 'Edit nama toko, alamat, NPWP, dan pesan struk.' },
      { title: 'Simpan perubahan', description: 'Info ini akan muncul di header & footer struk POS secara dinamis.' },
    ],
  },
  {
    id: 'keamanan-kasir',
    icon: <Lock size={18} />,
    title: 'Keamanan & Batasan Akses',
    summary: 'Apa yang boleh dan tidak boleh dilakukan Kasir.',
    steps: [
      { title: 'Hanya BISA membuat transaksi baru', description: 'Kasir tidak bisa mengedit atau menghapus struk/transaksi yang sudah terjadi. Ini mencegah manipulasi data keuangan.' },
      { title: 'Stok toko sendiri saja', description: 'Kasir hanya melihat dan mengelola stok di toko tempat login. Stok toko lain tidak terlihat.' },
      { title: 'Tidak bisa ubah data produk', description: 'Master Produk (harga, nama, SKU) hanya bisa diubah oleh Admin/Gudang. Kasir read-only.' },
      { title: 'Proteksi bentrok stok', description: 'Jika 2 kasir checkout barang yang sama di detik yang sama, transaksi ke-2 otomatis ditolak jika stok habis (Firestore Transaction).' },
    ],
  },
];

const SOP_GUDANG: SOPItem[] = [
  {
    id: 'master-produk',
    icon: <Package size={18} />,
    title: 'Master Produk',
    summary: 'Kelola katalog produk (SKU, varian, HPP, stok).',
    steps: [
      { title: 'Buka Master Produk', description: 'Lihat dan kelola seluruh produk.' },
      { title: 'Tambah produk baru', description: 'Isi nama, SKU, kategori, HPP. Harga jual hanya bisa diisi Admin Pusat.' },
      { title: 'Kelola varian', description: 'Setiap varian memiliki: Warna, Size, Style, Barcode/SKU Varian, dan Stok. Barcode unik digunakan untuk scanner kasir.' },
      { title: 'Upload gambar', description: 'Gambar otomatis dikompresi ke WebP <500KB sebelum upload.' },
    ],
  },
  {
    id: 'stock-requests-gudang',
    icon: <MessageSquare size={18} />,
    title: 'Proses Request Stok',
    summary: 'Approve atau tolak permintaan stok dari Kasir.',
    steps: [
      { title: 'Buka Request Stok', description: 'Lihat daftar request masuk (badge merah = pending).' },
      { title: 'Review request', description: 'Cek ketersediaan stok gudang.' },
      { title: 'Setujui atau tolak', description: 'Tambahkan catatan jika perlu. Kasir akan melihat status terbaru.' },
      { title: 'Kirim via Surat Jalan', description: 'Setelah disetujui, buat pengiriman di menu Kirim Surat Jalan.' },
    ],
  },
  {
    id: 'penerimaan-kain',
    icon: <Warehouse size={18} />,
    title: 'Penerimaan Kain (Bahan Baku)',
    summary: 'Catat bahan baku masuk dari pabrik.',
    steps: [
      { title: 'Buka Penerimaan Kain', description: 'Input data kain masuk.' },
      { title: 'Isi detail', description: 'Jenis kain, pabrik, jumlah meter, lebar, harga/meter, status bayar.' },
      { title: 'Hapus kain (soft delete)', description: 'Jika salah input, gunakan tombol hapus. Sistem minta alasan dan data pindah ke Audit Log (tidak hilang permanen).' },
    ],
  },
  {
    id: 'konveksi',
    icon: <Scissors size={18} />,
    title: 'Konveksi & Produksi',
    summary: 'Kirim kain ke konveksi (internal/makloon), terima hasil produksi.',
    steps: [
      { title: 'Kirim ke konveksi', description: 'Pilih kain, tentukan jumlah meter. Pilih "Internal" atau "Makloon" (vendor luar — wajib isi nama vendor).' },
      { title: 'Laporan produksi', description: 'Input ongkos jahit per pcs. Sistem kalkulasi otomatis: Total Biaya = Pcs Hasil × Ongkos/Pcs.' },
      { title: 'Custom Order otomatis masuk', description: 'Pesanan Custom Baju dari Admin Pusat otomatis muncul di antrean produksi dengan label "CUSTOM ORDER".' },
      { title: 'Terima hasil & cetak surat', description: 'Konfirmasi penerimaan → stok Gudang Utama bertambah. Cetak Surat Penerimaan dengan detail varian & tanda tangan.' },
    ],
  },
  {
    id: 'surat-jalan',
    icon: <Truck size={18} />,
    title: 'Kirim Surat Jalan',
    summary: 'Kirim barang dari gudang ke toko.',
    steps: [
      { title: 'Buka Kirim Surat Jalan', description: 'Pilih produk, tujuan toko, dan jumlah kirim.' },
      { title: 'Buat pengiriman', description: 'Status otomatis "In Transit". Stok gudang berkurang.' },
      { title: 'Cetak PDF Surat Jalan', description: 'Input nama sopir, generate nomor SJ-DLW-YYMMDD-XXXX. Tabel merinci varian (Warna, Ukuran, Qty). 3 kolom tanda tangan.' },
      { title: 'Tunggu konfirmasi', description: 'Kasir di toko tujuan akan konfirmasi penerimaan.' },
    ],
  },
];

const SOP_ADMIN: SOPItem[] = [
  ...SOP_GUDANG,
  {
    id: 'user-mgmt',
    icon: <Users size={18} />,
    title: 'Manajemen User',
    summary: 'Kelola whitelist email dan pantau login.',
    steps: [
      { title: 'Buka Manajemen User', description: 'Lihat daftar user terdaftar dan log login harian.' },
      { title: 'Tambah whitelist', description: 'Tambahkan email baru beserta role dan assignment toko.' },
      { title: 'Pantau aktivitas', description: 'Cek siapa yang sudah login hari ini. Lihat log absensi kasir.' },
    ],
  },
  {
    id: 'member-mgmt',
    icon: <Users size={18} />,
    title: 'Manajemen Member',
    summary: 'Kelola data member, tier, poin, dan reward.',
    steps: [
      { title: 'Buka Manajemen Member', description: 'Lihat daftar member dan tier mereka.' },
      { title: 'Atur tier & poin', description: 'Set threshold tier dan aturan perolehan poin.' },
      { title: 'Kelola reward', description: 'Buat reward yang bisa ditukar dengan poin member.' },
    ],
  },
  {
    id: 'promo',
    icon: <Receipt size={18} />,
    title: 'Promo & Diskon',
    summary: 'Buat dan kelola promo untuk seluruh toko.',
    steps: [
      { title: 'Buka Promo & Diskon', description: 'Lihat promo aktif dan buat promo baru.' },
      { title: 'Pilih tipe promo', description: 'Persentase, nominal tetap, atau Buy 1 Get 1.' },
      { title: 'Set periode & produk', description: 'Tentukan tanggal berlaku dan produk yang termasuk.' },
    ],
  },
  {
    id: 'custom-baju',
    icon: <Shirt size={18} />,
    title: 'Custom Baju / Jahit',
    summary: 'Pesanan custom otomatis masuk antrean produksi.',
    steps: [
      { title: 'Buka Custom Baju', description: 'Lihat dan kelola pesanan custom.' },
      { title: 'Input pesanan baru', description: 'Catat detail ukuran, bahan, dan desain. Otomatis membuat antrean di Laporan Produksi Gudang.' },
      { title: 'Update status', description: 'Tandai progres: Baru → Proses Jahit → Selesai → Dikirim.' },
    ],
  },
  {
    id: 'laporan',
    icon: <TrendingUp size={18} />,
    title: 'Laporan Keuangan',
    summary: 'Dashboard laporan penjualan dengan filter tanggal dan export PDF.',
    steps: [
      { title: 'Buka Laporan Keuangan', description: 'Pilih tab: Penjualan, Request Stok, atau Keuangan.' },
      { title: 'Filter berdasarkan tanggal', description: 'Gunakan Date Range Picker: Hari Ini, 30 Hari, Bulan Lalu, atau Custom Date.' },
      { title: 'Export PDF', description: 'Klik tombol "Export Laporan ke PDF" untuk generate laporan lengkap dengan kop surat.' },
      { title: 'Performa Produk', description: 'Tab khusus menampilkan produk terlaris (Fast Moving) dan produk belum terjual >30 hari (Dead Stock).' },
    ],
  },
  {
    id: 'keamanan-admin',
    icon: <Shield size={18} />,
    title: 'Arsitektur Keamanan Sistem',
    summary: 'Proteksi data, transaksi atomic, dan audit trail.',
    steps: [
      { title: 'Transaksi Atomic (Race Condition Prevention)', description: 'Stok dipotong menggunakan Firestore Transaction (runTransaction). Jika 2 kasir checkout barang yang sama bersamaan, transaksi ke-2 otomatis ditolak saat stok habis. Stok tidak pernah bisa minus.' },
      { title: 'Data Denormalization (Pembekuan Transaksi)', description: 'Setiap transaksi menyimpan HARDCOPY nama produk, varian, HPP, dan harga jual saat transaksi terjadi. Jika Admin mengubah harga di kemudian hari, laporan & struk masa lalu tetap akurat.' },
      { title: 'Firestore Security Rules', description: 'Rules ketat diterapkan di level database: Kasir hanya bisa CREATE transaksi (tidak bisa edit/hapus), Master Produk read-only bagi Kasir, Audit Log immutable (tidak bisa dihapus siapapun).' },
      { title: 'Offline Persistence', description: 'IndexedDB Persistence aktif — kasir bisa tetap bertransaksi saat Wi-Fi putus. Data otomatis sync saat internet kembali.' },
      { title: 'Soft Delete & Audit Trail', description: 'Penghapusan data menggunakan Soft Delete (status: deleted) dengan alasan wajib. Riwayat lengkap tercatat di Audit Log yang tidak bisa dihapus.' },
    ],
  },
  {
    id: 'backup',
    icon: <Download size={18} />,
    title: 'Backup & Reset Data',
    summary: 'Backup seluruh data atau reset koleksi tertentu.',
    steps: [
      { title: 'Buka Backup & Reset', description: 'Pilih data yang ingin di-backup atau reset.' },
      { title: 'Backup', description: 'Download snapshot data dari Firestore.' },
      { title: 'Reset (hati-hati!)', description: 'Hapus data koleksi tertentu. Aksi ini TIDAK bisa dibatalkan.' },
    ],
  },
];

function SOPCard({ item }: { item: SOPItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {item.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground truncate">{item.summary}</p>
        </div>
        {open ? <ChevronDown size={16} className="text-muted-foreground shrink-0" /> : <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-border/50">
          <ol className="space-y-3 mt-3">
            {item.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function SOPGuideView() {
  const { currentRole } = useAppState();

  let sopItems: SOPItem[] = [];
  let roleLabel = '';

  if (currentRole === ROLES.KASIR) {
    sopItems = SOP_KASIR;
    roleLabel = 'Kasir Toko';
  } else if (currentRole === ROLES.GUDANG) {
    sopItems = SOP_GUDANG;
    roleLabel = 'Admin Gudang';
  } else if (currentRole === ROLES.ADMIN) {
    sopItems = SOP_ADMIN;
    roleLabel = 'Admin Pusat';
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <BookOpen size={20} className="text-primary" /> Panduan SOP — {roleLabel}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Klik setiap item untuk melihat langkah-langkah detail. Panduan disesuaikan dengan role Anda.
        </p>
      </div>

      <div className="space-y-3">
        {sopItems.map(item => (
          <SOPCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
