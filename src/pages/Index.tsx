import { AppProvider, useAppState, ROLES } from '@/lib/store';
import { AuthProvider, useAuth } from '@/lib/auth';
import LoginPage from '@/components/LoginPage';
import PelangganPortal from '@/components/views/PelangganPortal';
import AppSidebar, { MobileMenuButton } from '@/components/AppSidebar';
import MessageBox from '@/components/MessageBox';
import AttendanceCleanupDialog from '@/components/AttendanceCleanupDialog';
import DashboardView from '@/components/views/DashboardView';
import MasterProductsView from '@/components/views/MasterProductsView';
import WarehouseView from '@/components/views/WarehouseView';
import ConvectionView from '@/components/views/ConvectionView';
import ShippingView from '@/components/views/ShippingView';
import SOPGuideView from '@/components/views/SOPGuideView';
import POSView from '@/components/views/POSView';
import OpnameView from '@/components/views/OpnameView';
import PromosView from '@/components/views/PromosView';
import FinanceView from '@/components/views/FinanceView';
import PiutangView from '@/components/views/PiutangView';
import UserManagementView from '@/components/views/UserManagementView';
import StockRequestsView from '@/components/views/StockRequestsView';
import MyStockRequestsView from '@/components/views/MyStockRequestsView';
import MemberManagementView from '@/components/views/MemberManagementView';
import StoreProfileView from '@/components/views/StoreProfileView';
import StoreStockUpdateView from '@/components/views/StoreStockUpdateView';
import BackupResetView from '@/components/views/BackupResetView';
import CustomOrderView from '@/components/views/CustomOrderView';
import FinancialManagementView from '@/components/views/FinancialManagementView';
import StoreManagementView from '@/components/views/StoreManagementView';
import CategoryVariantManagementView from '@/components/views/CategoryVariantManagementView';
import { useEffect, useState, useMemo } from 'react';
import { Loader2, Bell } from 'lucide-react';

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Beranda',
  'master-products': 'Master Produk',
  warehouse: 'Penerimaan Kain',
  convection: 'Konveksi & Produksi',
  shipping: 'Kirim Surat Jalan',
  pos: 'Kasir POS',
  piutang: 'Pelunasan Piutang',
  opname: 'Penyesuaian Stok Toko',
  promos: 'Promo & Diskon',
  finance: 'Laporan Keuangan',
  'user-management': 'Manajemen User',
  'stock-requests': 'Request Stok Store',
  'my-stock-requests': 'Request Stok Saya',
  'member-management': 'Manajemen Member',
  'store-profile': 'Profil Toko',
  'store-stock-update': 'Penerimaan Barang',
  'backup-reset': 'Backup & Reset Data',
  'custom-orders': 'Custom Baju / Jahit',
  'sop-guide': 'Panduan SOP',
  'financial-management': 'Manajemen Keuangan',
  'store-management': 'Manajemen Toko',
  'category-variant-management': 'Manajemen Kategori & Varian',
};

function AuthGate() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) return <LoginPage />;

  // Pelanggan gets their own portal — separate from admin/staff app
  if (profile.role === 'Pelanggan') {
    return <PelangganPortal />;
  }

  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

function AppContent() {
  const { currentRole, setCurrentRole, setKasirStore, view, isAbsenDone, setIsAbsenDone, kasirStore, addAuditLog, receivables, setView } = useAppState();
  const { profile } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Overdue receivables count for notification bell
  const overdueCount = useMemo(() => {
    if (currentRole !== ROLES.ADMIN) return 0;
    return receivables.filter(r => r.status !== 'Lunas' && new Date(r.due_date) <= new Date()).length;
  }, [receivables, currentRole]);

  // Auto-set role and store from profile
  useEffect(() => {
    if (profile?.role && !currentRole) {
      setCurrentRole(profile.role);
    }
    if (profile?.store) {
      setKasirStore(profile.store);
    }
  }, [profile, currentRole, setCurrentRole, setKasirStore]);

  if (!currentRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main className="flex-1 overflow-auto min-w-0">
        <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border px-4 md:px-8 py-3 md:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MobileMenuButton onClick={() => setMobileOpen(true)} />
              <div className="min-w-0">
                <h2 className="text-lg md:text-xl font-extrabold text-foreground truncate">{VIEW_TITLES[view] || view}</h2>
                <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Sistem Manajemen Terpadu Dalwa.co</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {overdueCount > 0 && (
                <button
                  onClick={() => setView('financial-management')}
                  className="relative p-2 rounded-xl hover:bg-destructive/10 transition-colors group"
                  title={`${overdueCount} piutang jatuh tempo`}
                >
                  <Bell size={18} className="text-destructive group-hover:animate-bounce" />
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {overdueCount}
                  </span>
                </button>
              )}
              <p className="text-xs text-muted-foreground font-medium hidden sm:block shrink-0">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>
        </header>
        <div className="p-4 md:p-8">
          {view === 'dashboard' && <DashboardView />}
          {view === 'master-products' && <MasterProductsView />}
          {view === 'warehouse' && <WarehouseView />}
          {view === 'convection' && <ConvectionView />}
          {view === 'shipping' && <ShippingView />}
          {view === 'pos' && <POSView />}
          {view === 'piutang' && <PiutangView />}
          {view === 'opname' && <OpnameView />}
          {view === 'promos' && <PromosView />}
          {view === 'finance' && <FinanceView />}
          {view === 'user-management' && <UserManagementView />}
          {view === 'stock-requests' && <StockRequestsView />}
          {view === 'my-stock-requests' && <MyStockRequestsView />}
          {view === 'member-management' && <MemberManagementView />}
          {view === 'store-profile' && <StoreProfileView />}
          {view === 'store-stock-update' && <StoreStockUpdateView />}
          {view === 'backup-reset' && <BackupResetView />}
          {view === 'custom-orders' && <CustomOrderView />}
          {view === 'sop-guide' && <SOPGuideView />}
          {view === 'financial-management' && <FinancialManagementView />}
          {view === 'store-management' && <StoreManagementView />}
          {view === 'category-variant-management' && <CategoryVariantManagementView />}
        </div>
      </main>
      <MessageBox />
      <AttendanceCleanupDialog />
    </div>
  );
}

const Index = () => (
  <AuthProvider>
    <AuthGate />
  </AuthProvider>
);

export default Index;
