import { useAppState, ROLES } from '@/lib/store';
import { Shield, Warehouse, ShoppingCart } from 'lucide-react';

const roles = [
  { role: ROLES.ADMIN, icon: Shield, desc: 'Akses penuh ke seluruh sistem' },
  { role: ROLES.GUDANG, icon: Warehouse, desc: 'Kelola stok, kain & produksi' },
  { role: ROLES.KASIR, icon: ShoppingCart, desc: 'Transaksi POS & terima barang' },
] as const;

export default function RoleSelection() {
  const { setCurrentRole } = useAppState();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">DALWA.CO</h1>
          <p className="text-muted-foreground text-sm mt-2">Sistem Manajemen Terpadu</p>
        </div>

        <div className="space-y-3">
          {roles.map(({ role, icon: Icon, desc }) => (
            <button
              key={role}
              onClick={() => setCurrentRole(role)}
              className="w-full flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:border-secondary hover:shadow-md transition-all duration-200 group text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shrink-0 group-hover:bg-secondary transition-colors">
                <Icon size={22} className="text-primary-foreground group-hover:text-secondary-foreground transition-colors" />
              </div>
              <div>
                <p className="font-bold text-foreground">{role}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60 mt-8">
          Dalwa Collection Management System v2.5
        </p>
      </div>
    </div>
  );
}
