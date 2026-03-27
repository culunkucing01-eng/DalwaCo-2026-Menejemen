import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { ROLES, type RoleType } from '@/lib/store';
import { seedDefaultAccounts, getTestAccounts } from '@/lib/seed-accounts';
import { LogIn, UserPlus, Shield, Warehouse, ShoppingCart, Eye, EyeOff, Loader2, Users, ScanLine, Mail } from 'lucide-react';

const roleOptions = [
  { role: ROLES.ADMIN, icon: Shield, label: 'Admin Utama' },
  { role: ROLES.GUDANG, icon: Warehouse, label: 'Admin Gudang' },
  { role: ROLES.KASIR, icon: ShoppingCart, label: 'Kasir Toko' },
] as const;

export default function LoginPage() {
  const { login, loginWithGoogle, register, authError, clearError } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleType>(ROLES.KASIR);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showTestAccounts, setShowTestAccounts] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Scanner/PIN mode
  const [loginMode, setLoginMode] = useState<'scanner' | 'email'>('scanner');
  const [scanInput, setScanInput] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const testAccounts = getTestAccounts();

  // Auto-focus scanner input
  useEffect(() => {
    if (loginMode === 'scanner') {
      scanRef.current?.focus();
    }
  }, [loginMode]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDefaultAccounts();
    } catch (e) {
      console.error('Seed error:', e);
    }
    setSeeding(false);
    setShowTestAccounts(true);
  };

  const handleQuickLogin = (acct: { email: string; password: string }) => {
    setEmail(acct.email);
    setPassword(acct.password);
    setIsRegister(false);
    setLoginMode('email');
  };

  const handleScanLogin = async () => {
    if (!scanInput.trim()) return;
    clearError();
    setLoading(true);
    try {
      // Treat input as PIN/ID - try as email or formatted email
      const input = scanInput.trim();
      // If it looks like an email, use it directly; otherwise try as PIN@dalwa.co
      const loginEmail = input.includes('@') ? input : `${input}@dalwa.co`;
      // Use a standard PIN-based password or the input itself
      await login(loginEmail, input);
    } catch {
      // error handled by context
    } finally {
      setLoading(false);
      setScanInput('');
      scanRef.current?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, selectedRole, displayName);
      } else {
        await login(email, password);
      }
    } catch {
      // error handled by context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">DALWA.CO</h1>
          <p className="text-muted-foreground text-sm mt-1">Sistem Manajemen Terpadu</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setLoginMode('scanner'); clearError(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${loginMode === 'scanner' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:border-primary/30'}`}
          >
            <ScanLine size={14} /> Scan ID / PIN
          </button>
          <button
            onClick={() => { setLoginMode('email'); clearError(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${loginMode === 'email' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:border-primary/30'}`}
          >
            <Mail size={14} /> Email & Password
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {authError && (
            <div className="bg-destructive/10 text-destructive text-sm rounded-xl px-4 py-3 mb-4 font-medium">
              {authError}
            </div>
          )}

          {loginMode === 'scanner' ? (
            /* ===== SCANNER / PIN MODE ===== */
            <div className="space-y-4">
              <div className="text-center mb-2">
                <ScanLine size={32} className="mx-auto text-primary mb-2" />
                <h2 className="text-lg font-bold text-foreground">Scan ID Card / PIN</h2>
                <p className="text-xs text-muted-foreground mt-1">Tempelkan kartu atau ketik PIN kasir lalu tekan Enter</p>
              </div>

              <input
                ref={scanRef}
                type="text"
                autoFocus
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScanLogin(); }}
                placeholder="Scan atau ketik PIN..."
                className="w-full h-14 px-4 rounded-xl border-2 border-primary/30 bg-background text-foreground text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all placeholder:text-muted-foreground/40"
              />

              <button
                onClick={handleScanLogin}
                disabled={loading || !scanInput.trim()}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Masuk
              </button>

              <p className="text-[10px] text-muted-foreground/60 text-center">
                Kursor otomatis aktif — langsung scan tanpa klik
              </p>
            </div>
          ) : (
            /* ===== EMAIL MODE ===== */
            <>
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                {isRegister ? <UserPlus size={20} /> : <LogIn size={20} />}
                {isRegister ? 'Daftar Akun Baru' : 'Login'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-3">
                {isRegister && (
                  <input
                    type="text"
                    placeholder="Nama Lengkap"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                )}

                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {isRegister && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Pilih Role:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {roleOptions.map(({ role, icon: Icon, label }) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setSelectedRole(role)}
                          className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all ${
                            selectedRole === role
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:border-primary/30'
                          }`}
                        >
                          <Icon size={18} />
                          <span className="text-[10px] leading-tight text-center">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {isRegister ? 'Daftar' : 'Masuk'}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground font-medium">ATAU</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Google Login */}
              <button
                onClick={async () => {
                  setGoogleLoading(true);
                  clearError();
                  try { await loginWithGoogle(); } catch {} finally { setGoogleLoading(false); }
                }}
                disabled={googleLoading}
                className="w-full py-3 rounded-xl border border-border bg-background text-foreground font-semibold text-sm hover:bg-muted transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {googleLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                    <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                  </svg>
                )}
                Masuk dengan Google
              </button>

              <div className="mt-4 text-center">
                <button
                  onClick={() => { setIsRegister(!isRegister); clearError(); }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  {isRegister ? 'Sudah punya akun? Login' : 'Belum punya akun? Daftar'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Test Accounts Section */}
        <div className="mt-4 bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Users size={14} /> Akun Test
            </span>
            {!showTestAccounts && (
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                {seeding && <Loader2 size={12} className="animate-spin" />}
                {seeding ? 'Membuat...' : 'Buat Akun Test'}
              </button>
            )}
          </div>

          {showTestAccounts && (
            <div className="space-y-1.5">
              {testAccounts.map((acct) => (
                <button
                  key={acct.email}
                  onClick={() => handleQuickLogin(acct)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
                >
                  <div>
                    <p className="text-xs font-semibold text-foreground">{acct.role}</p>
                    <p className="text-[10px] text-muted-foreground">{acct.email}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">{acct.password}</span>
                </button>
              ))}
              <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
                Klik akun untuk auto-fill, lalu tekan Masuk
              </p>
            </div>
          )}

          {!showTestAccounts && !seeding && (
            <p className="text-[10px] text-muted-foreground/60">
              Klik "Buat Akun Test" untuk membuat 3 akun dengan role berbeda
            </p>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60 mt-6">
          Dalwa Collection Management System v2.5
        </p>
      </div>
    </div>
  );
}
