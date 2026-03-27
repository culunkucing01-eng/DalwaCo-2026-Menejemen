# DALWA.CO - Sistem Manajemen Terpadu (Kalkus)

## Gambaran Umum
Aplikasi ERP mini & POS untuk bisnis ritel fashion. Mengelola operasional dari hulu ke hilir: pembelian kain, produksi konveksi, inventaris multi-cabang, kasir, hingga laporan keuangan real-time.

**Stack Teknis:**
- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Database: Firebase Firestore (real-time, offline-capable)
- Auth: Firebase Authentication (Email/Password + Google)
- Image Storage: ImgBB API (unlimited free hosting)
- Routing: React Router v6
- State: React Context + TanStack Query

## Arsitektur Hak Akses
- **Admin Utama** — Super Admin: harga jual, laporan keuangan, approve opname
- **Admin Gudang** — Logistik: master produk, HPP, konveksi, surat jalan. Dilarang lihat harga jual
- **Kasir Toko** — POS, pesanan WA, stok toko sendiri. Tidak bisa edit manual stok
- **Pelanggan** — Portal terpisah: katalog produk (harga sesuai tier), riwayat transaksi, download invoice, notifikasi real-time pembayaran, banner jatuh tempo

## Modul Utama
- Master Produk & Varian (barcode auto-generate, cetak hangtag thermal 33x15mm)
- Produksi & Konveksi (kain meter → baju jadi pcs, distribusi varian)
- Surat Jalan Digital (atomic stock deduction)
- POS Kasir (tiered pricing, split payment, struk thermal 58mm)
- WhatsApp Order Invoice (export ke PNG untuk WA)
- Retur & Tukar Barang
- Manajemen Keuangan (laba/rugi, piutang, vendor payables, operational expenses)
- Dashboard Analitik (fast-moving, dead stock, kategori performa)
- Manajemen Member & Reward
- Absensi Kasir (selfie via ImgBB)
- Opname Stock (sistem approval — stok tidak berubah sampai Admin setujui)
- Backup & Reset Data (writeBatch Firestore)

## Infrastruktur Teknis Penting

### Firebase Setup
- Project ID: `dalwaco2-c3cfb`
- Auth Domain: `dalwaco2-c3cfb.firebaseapp.com`
- Offline persistence: `persistentLocalCache` + `persistentMultipleTabManager` (multi-tab support)
- File: `src/lib/firebase.ts`

### Firestore Rules
- File rules ada di `firestore.rules` — **harus di-deploy manual ke Firebase Console**
- Whitelist & storeLocations: boleh dibaca tanpa auth (untuk pre-login check)
- Users: boleh tulis oleh owner sendiri (untuk sync profil saat seeding)
- Semua operasi stok menggunakan `runTransaction` (atomic, anti race condition)

### ImgBB Integration
- API Key hardcoded di `src/lib/image-upload.ts` (key: `9fe1da829c9b66b024435b37f98499f2`)
- Kompresi otomatis ke max 500KB sebelum upload
- Digunakan untuk: foto produk + selfie absensi kasir

### Production Server
- File: `dist/index.cjs` — Express server minimal yang serve static files dari `dist/`
- Build: `npm run build` (Vite, `emptyOutDir: false` agar server file tidak terhapus)
- Run: `node ./dist/index.cjs` (port dari env `PORT`, default 3000)

## Deployment
- Platform: Replit Autoscale
- URL: `https://dalwa-collection-menejemen-2026.replit.app`
- Domain custom: `zafstudio.online` (DNS dikonfigurasi di Hostinger)
- Build command: `npm run build`
- Run command: `node ./dist/index.cjs`

## GitHub Repository
- URL: `https://github.com/culunkucing01-eng/Dalwa-Collection-Menejemen-2026`
- Branch utama: `main`
- Push: Gunakan Replit Git panel (sidebar kiri → ikon git) atau `git push origin main` dengan PAT

## Koleksi Firestore
`users`, `whitelist`, `products`, `materials`, `convectionLogs`, `shippingLogs`, `salesTransactions`, `receivables`, `promos`, `members`, `memberSettings`, `rewards`, `categories`, `storeProfiles`, `auditLogs`, `loginLogs`, `attendanceLogs`, `stockRequests`, `stockChats`, `customOrders`, `storeLocations`, `operationalExpenses`, `vendorPayables`, `cashSettlements`, `materialEditLogs`, `materialDeleteLogs`

## Akun Test
- Admin Utama: `admin@dalwaco.com` / `admin123`
- Admin Gudang: `gudang@dalwaco.com` / `gudang123`
- Kasir Toko: `kasir@dalwaco.com` / `kasir123`

## Firebase Console — Setup yang Diperlukan
1. **Firestore Rules**: Copy-paste isi `firestore.rules` → Firebase Console → Firestore → Rules → Publish
2. **Authentication**: Enable Email/Password dan Google sign-in
3. **Authorized Domains**: Tambahkan domain Replit dev dan domain custom (`zafstudio.online`)
4. **Composite Indexes** (jika query gagal): lihat komentar di bawah `firestore.rules`
