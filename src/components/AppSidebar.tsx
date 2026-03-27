import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppState, ROLES, type ViewType } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { subscribeStockRequests, type StockRequest, subscribeShippingLogs, subscribeReceivables } from '@/lib/firestore';
import type { ShippingLog, Receivable } from '@/lib/store';
import {
  LayoutDashboard, Package, Warehouse, Scissors, Truck,
  ShoppingCart, FileText, Scale, Receipt,
  LogOut, TrendingUp, Wallet, Users, MessageSquare, Menu, Store, Edit3, Download, Shield, Moon, Sun, Shirt, BookOpen, Volume2, VolumeX, Tags
} from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import {
  playStockRequestSound,
  playShipmentSound,
  playPiutangAlertSound,
  playRequestResponseSound,
  isSoundEnabled,
  setSoundEnabled,
} from '@/lib/notification-sounds';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  viewKey: ViewType;
  onNavigate?: () => void;
  badge?: number;
}

function NavItem({ icon, label, viewKey, onNavigate, badge }: NavItemProps) {
  const { view, setView } = useAppState();
  const active = view === viewKey;

  return (
    <button
      onClick={() => { setView(viewKey); onNavigate?.(); }}
      className={`sidebar-item w-full ${active ? 'sidebar-item-active' : 'sidebar-item-inactive'} relative`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge && badge > 0 ? (
        <span className="ml-auto w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shrink-0 animate-pulse">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { currentRole, setCurrentRole, setView, setIsAbsenDone } = useAppState();
  const { logout, profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [stockRequests, setStockRequests] = useState<StockRequest[]>([]);
  const [shippingLogs, setShippingLogs] = useState<ShippingLog[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);

  useEffect(() => {
    const unsubs = [
      subscribeStockRequests(setStockRequests),
      subscribeShippingLogs(setShippingLogs),
      subscribeReceivables(setReceivables),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // Count pending requests for Admin/Gudang
  const pendingRequestCount = (currentRole === ROLES.ADMIN || currentRole === ROLES.GUDANG)
    ? stockRequests.filter(r => r.status === 'Pending').length
    : 0;

  // Count requests with responses for Kasir
  const myActiveRequests = currentRole === ROLES.KASIR
    ? stockRequests.filter(r =>
        r.requester_name === profile?.displayName &&
        (r.status === 'Diproses' || r.response_note)
      ).length
    : 0;

  // Count shipments that arrived (In Transit) for Kasir's receiving
  const inTransitCount = useMemo(() => {
    if (currentRole !== ROLES.KASIR) return 0;
    const store = profile?.store;
    return shippingLogs.filter(s => s.status === 'In Transit' && (!store || s.destination === store)).length;
  }, [shippingLogs, currentRole, profile?.store]);

  // Count overdue or near-due receivables
  const piutangAlertCount = useMemo(() => {
    if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.KASIR) return 0;
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    return receivables.filter(r => {
      if (r.status === 'Lunas') return false;
      const due = new Date(r.due_date);
      return due <= threeDaysLater; // overdue or due within 3 days
    }).length;
  }, [receivables, currentRole]);

  // --- Audio notifications when badge counts increase ---
  const prevCounts = useRef({ pending: 0, myActive: 0, inTransit: 0, piutang: 0 });
  const initialLoad = useRef(true);

  useEffect(() => {
    // Skip first render (initial data load)
    if (initialLoad.current) {
      initialLoad.current = false;
      prevCounts.current = {
        pending: pendingRequestCount,
        myActive: myActiveRequests,
        inTransit: inTransitCount,
        piutang: piutangAlertCount,
      };
      return;
    }

    const prev = prevCounts.current;

    if (pendingRequestCount > prev.pending) {
      playStockRequestSound();
    }
    if (myActiveRequests > prev.myActive) {
      playRequestResponseSound();
    }
    if (inTransitCount > prev.inTransit) {
      playShipmentSound();
    }
    if (piutangAlertCount > prev.piutang) {
      playPiutangAlertSound();
    }

    prevCounts.current = {
      pending: pendingRequestCount,
      myActive: myActiveRequests,
      inTransit: inTransitCount,
      piutang: piutangAlertCount,
    };
  }, [pendingRequestCount, myActiveRequests, inTransitCount, piutangAlertCount]);

  const handleLogout = async () => {
    setCurrentRole(null);
    setIsAbsenDone(false);
    setView('dashboard');
    await logout();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="p-6 pb-4">
        <h1 className="text-xl font-extrabold text-sidebar-primary tracking-tight">DALWA.CO</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-[11px] text-sidebar-foreground/50">System v2.5</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        <NavItem icon={<LayoutDashboard size={18} />} label="Beranda" viewKey="dashboard" onNavigate={onNavigate} />

        {(currentRole === ROLES.ADMIN || currentRole === ROLES.GUDANG) && (
          <>
            <p className="section-label text-sidebar-foreground/30 mt-5">Gudang</p>
            <NavItem icon={<Package size={18} />} label="Master Produk" viewKey="master-products" onNavigate={onNavigate} />
            <NavItem icon={<Tags size={18} />} label="Kategori & Varian" viewKey="category-variant-management" onNavigate={onNavigate} />
            <NavItem icon={<MessageSquare size={18} />} label="Request Stok" viewKey="stock-requests" onNavigate={onNavigate} badge={pendingRequestCount} />
            <NavItem icon={<Warehouse size={18} />} label="Penerimaan Kain" viewKey="warehouse" onNavigate={onNavigate} />
            <NavItem icon={<Scissors size={18} />} label="Konveksi & Produksi" viewKey="convection" onNavigate={onNavigate} />
            <NavItem icon={<Truck size={18} />} label="Kirim Surat Jalan" viewKey="shipping" onNavigate={onNavigate} />
          </>
        )}

        {currentRole === ROLES.ADMIN && (
          <>
            <p className="section-label text-sidebar-foreground/30 mt-5">Management</p>
            <NavItem icon={<Users size={18} />} label="Manajemen User" viewKey="user-management" onNavigate={onNavigate} />
            <NavItem icon={<Users size={18} />} label="Manajemen Pelanggan" viewKey="member-management" onNavigate={onNavigate} />
            <NavItem icon={<Wallet size={18} />} label="Piutang" viewKey="piutang" onNavigate={onNavigate} badge={piutangAlertCount} />
            <NavItem icon={<Receipt size={18} />} label="Promo & Diskon" viewKey="promos" onNavigate={onNavigate} />
            <NavItem icon={<Shirt size={18} />} label="Custom Baju" viewKey="custom-orders" onNavigate={onNavigate} />
            <NavItem icon={<TrendingUp size={18} />} label="Laporan Keuangan" viewKey="finance" onNavigate={onNavigate} />
            <NavItem icon={<Wallet size={18} />} label="Manajemen Keuangan" viewKey="financial-management" onNavigate={onNavigate} />
            <NavItem icon={<Download size={18} />} label="Backup & Reset" viewKey="backup-reset" onNavigate={onNavigate} />
            <NavItem icon={<Store size={18} />} label="Manajemen Toko" viewKey="store-management" onNavigate={onNavigate} />
          </>
        )}

        {currentRole === ROLES.KASIR && (
          <>
            <p className="section-label text-sidebar-foreground/30 mt-5">Toko & Transaksi</p>
            <NavItem icon={<Store size={18} />} label="Profil Toko" viewKey="store-profile" onNavigate={onNavigate} />
            <NavItem icon={<ShoppingCart size={18} />} label="Kasir POS" viewKey="pos" onNavigate={onNavigate} />
            <NavItem icon={<Package size={18} />} label="Penerimaan Barang" viewKey="store-stock-update" onNavigate={onNavigate} badge={inTransitCount} />
            <NavItem icon={<MessageSquare size={18} />} label="Request Stok" viewKey="my-stock-requests" onNavigate={onNavigate} badge={myActiveRequests} />
            <NavItem icon={<Wallet size={18} />} label="Piutang" viewKey="piutang" onNavigate={onNavigate} badge={piutangAlertCount} />
            <NavItem icon={<Receipt size={18} />} label="Tutup Shift" viewKey="financial-management" onNavigate={onNavigate} />
            <NavItem icon={<Scale size={18} />} label="Penyesuaian Stok" viewKey="opname" onNavigate={onNavigate} />
            <NavItem icon={<Tags size={18} />} label="Kategori & Varian" viewKey="category-variant-management" onNavigate={onNavigate} />
            <NavItem icon={<BookOpen size={18} />} label="Panduan SOP" viewKey="sop-guide" onNavigate={onNavigate} />
          </>
        )}

        {(currentRole === ROLES.ADMIN || currentRole === ROLES.GUDANG) && (
          <div className="mt-5">
            <NavItem icon={<BookOpen size={18} />} label="Panduan SOP" viewKey="sop-guide" onNavigate={onNavigate} />
          </div>
        )}
      </nav>

      {/* User & Logout */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-sidebar-accent flex items-center justify-center text-sidebar-primary font-bold text-sm">
            {profile?.displayName?.[0] || currentRole?.[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">{profile?.displayName || currentRole}</p>
            <p className="text-[11px] text-sidebar-foreground/40">{currentRole}</p>
          </div>
        </div>
        <div className="flex gap-2 mb-2">
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sidebar-accent/50 text-sidebar-foreground rounded-xl transition-all text-xs font-bold hover:bg-sidebar-accent"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            onClick={() => setSoundEnabled(!isSoundEnabled())}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-sidebar-accent/50 text-sidebar-foreground rounded-xl transition-all text-xs font-bold hover:bg-sidebar-accent"
            title={isSoundEnabled() ? 'Matikan Notifikasi Suara' : 'Nyalakan Notifikasi Suara'}
          >
            {isSoundEnabled() ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-destructive/20 text-destructive rounded-xl transition-all text-xs font-bold hover:bg-destructive/30"
        >
          <LogOut size={14} /> Logout Sistem
        </button>
      </div>
    </div>
  );
}

export function MobileMenuButton({ onClick, badge }: { onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors relative"
      aria-label="Menu"
    >
      <Menu size={20} className="text-foreground" />
      {badge && badge > 0 ? (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </button>
  );
}

export default function AppSidebar({ mobileOpen, setMobileOpen }: { mobileOpen?: boolean; setMobileOpen?: (v: boolean) => void }) {
  const isMobile = useIsMobile();

  if (isMobile && setMobileOpen) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
          <SheetTitle className="sr-only">Menu Navigasi</SheetTitle>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="hidden md:flex w-64 min-h-screen bg-sidebar flex-col shrink-0">
      <SidebarContent />
    </aside>
  );
}
