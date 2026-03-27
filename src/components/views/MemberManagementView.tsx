import { useState, useEffect } from 'react';
import { useAppState, formatNumber, type Member, type MemberSettings, type Reward, type CustomerType, ROLES } from '@/lib/store';
import { firestoreAddMember, firestoreUpdateMember, firestoreDeleteMember, firestoreSetMemberSettings, firestoreAddReward, firestoreUpdateReward, firestoreDeleteReward } from '@/lib/firestore';
import { Users, Search, Settings, Crown, Star, Award, User, Plus, Trash2, Edit2, Save, X, Gift, Tag } from 'lucide-react';

const TIER_CONFIG = {
  Warga: { icon: User, color: 'text-muted-foreground', bg: 'bg-muted/30' },
  Santri: { icon: Star, color: 'text-primary', bg: 'bg-primary/10' },
  Juragan: { icon: Award, color: 'text-warning', bg: 'bg-warning/10' },
  Sultan: { icon: Crown, color: 'text-success', bg: 'bg-success/10' },
};

function getTierFromSpending(spending: number, settings: MemberSettings | null): Member['tier'] {
  if (!settings) return 'Warga';
  if (spending >= settings.tier_sultan) return 'Sultan';
  if (spending >= settings.tier_juragan) return 'Juragan';
  if (spending >= settings.tier_santri) return 'Santri';
  return 'Warga';
}

function generateMemberId(): string {
  return `DLW-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export default function MemberManagementView() {
  const { members, setMembers, memberSettings, rewards, setRewards, addAuditLog, showMessage, currentRole } = useAppState();
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New member form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newStoreName, setNewStoreName] = useState('');
  const [newWa, setNewWa] = useState('');
  const [newCustomerType, setNewCustomerType] = useState<CustomerType>('Regular');

  // Settings form
  const [sMinSpending, setSMinSpending] = useState('100000');
  const [sPointsPer, setSPointsPer] = useState('1');
  const [sTierSantri, setSTierSantri] = useState('500000');
  const [sTierJuragan, setSTierJuragan] = useState('2000000');
  const [sTierSultan, setSTierSultan] = useState('10000000');

  // Reward form
  const [showAddReward, setShowAddReward] = useState(false);
  const [rwName, setRwName] = useState('');
  const [rwType, setRwType] = useState<'discount' | 'gift'>('discount');
  const [rwPointsCost, setRwPointsCost] = useState('');
  const [rwDiscountValue, setRwDiscountValue] = useState('');
  const [rwGiftDesc, setRwGiftDesc] = useState('');

  useEffect(() => {
    if (memberSettings) {
      setSMinSpending(memberSettings.min_spending_for_points.toString());
      setSPointsPer(memberSettings.points_per_transaction.toString());
      setSTierSantri(memberSettings.tier_santri.toString());
      setSTierJuragan(memberSettings.tier_juragan.toString());
      setSTierSultan(memberSettings.tier_sultan.toString());
    }
  }, [memberSettings]);

  const isAdmin = currentRole === ROLES.ADMIN;

  const filtered = members
    .filter(m => filterTier === 'all' || m.tier === filterTier)
    .filter(m =>
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.member_id?.toLowerCase().includes(search.toLowerCase()) ||
      m.phone?.toLowerCase().includes(search.toLowerCase())
    );

  const tierCounts = {
    Warga: members.filter(m => m.tier === 'Warga').length,
    Santri: members.filter(m => m.tier === 'Santri').length,
    Juragan: members.filter(m => m.tier === 'Juragan').length,
    Sultan: members.filter(m => m.tier === 'Sultan').length,
  };

  const handleAddMember = async () => {
    if (!newName.trim()) { showMessage('Peringatan: Nama wajib diisi!'); return; }
    const memberId = generateMemberId();
    const newMember: Omit<Member, 'id'> = {
      member_id: memberId, name: newName.trim(), phone: newPhone.trim(),
      address: newAddress.trim(), store_name: newStoreName.trim(),
      tier: 'Warga', customer_type: newCustomerType, points: 0, total_spending: 0,
      wa: newWa.trim() || newPhone.trim(), timestamp: new Date().toISOString(),
    };
    const id = await firestoreAddMember(newMember);
    setMembers(prev => [...prev, { ...newMember, id }]);
    addAuditLog('Tambah Member', `${newName} (${memberId})`);
    showMessage(`Berhasil: Member ${newName} terdaftar dengan ID ${memberId}`);
    setNewName(''); setNewPhone(''); setNewAddress(''); setNewStoreName(''); setNewWa(''); setNewCustomerType('Regular');
    setShowAdd(false);
  };

  const handleDeleteMember = async (m: Member) => {
    await firestoreDeleteMember(m.id);
    setMembers(prev => prev.filter(x => x.id !== m.id));
    addAuditLog('Hapus Member', `${m.name} (${m.member_id})`);
    showMessage(`Member ${m.name} dihapus.`);
  };

  const handleSaveSettings = async () => {
    const data = {
      min_spending_for_points: parseInt(sMinSpending) || 100000,
      points_per_transaction: parseInt(sPointsPer) || 1,
      tier_santri: parseInt(sTierSantri) || 500000,
      tier_juragan: parseInt(sTierJuragan) || 2000000,
      tier_sultan: parseInt(sTierSultan) || 10000000,
    };
    await firestoreSetMemberSettings(data);
    addAuditLog('Update Setting Member', `Min belanja: Rp ${formatNumber(data.min_spending_for_points)}, Poin/Tx: ${data.points_per_transaction}`);
    showMessage('Berhasil: Setting member disimpan!');
    setShowSettings(false);
  };

  const handleAddReward = async () => {
    if (!rwName.trim() || !rwPointsCost) { showMessage('Peringatan: Nama dan poin wajib diisi!'); return; }
    const reward: Omit<Reward, 'id'> = {
      name: rwName.trim(),
      type: rwType,
      points_cost: parseInt(rwPointsCost) || 0,
      discount_value: rwType === 'discount' ? parseInt(rwDiscountValue) || 0 : undefined,
      gift_description: rwType === 'gift' ? rwGiftDesc.trim() : undefined,
      is_active: true,
      timestamp: new Date().toISOString(),
    };
    const id = await firestoreAddReward(reward);
    setRewards(prev => [...prev, { ...reward, id }]);
    addAuditLog('Tambah Reward', `${rwName} (${rwPointsCost} poin)`);
    showMessage(`Berhasil: Reward "${rwName}" ditambahkan!`);
    setRwName(''); setRwPointsCost(''); setRwDiscountValue(''); setRwGiftDesc('');
    setShowAddReward(false);
  };

  const handleToggleReward = async (r: Reward) => {
    await firestoreUpdateReward(r.id, { is_active: !r.is_active });
    setRewards(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !x.is_active } : x));
  };

  const handleDeleteReward = async (r: Reward) => {
    await firestoreDeleteReward(r.id);
    setRewards(prev => prev.filter(x => x.id !== r.id));
    addAuditLog('Hapus Reward', r.name);
    showMessage(`Reward "${r.name}" dihapus.`);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(TIER_CONFIG) as [Member['tier'], typeof TIER_CONFIG['Warga']][]).map(([tier, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={tier} onClick={() => setFilterTier(filterTier === tier ? 'all' : tier)}
              className={`rounded-2xl border p-3 md:p-4 text-left transition-all ${filterTier === tier ? 'border-primary shadow-md' : 'border-border'} bg-card`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                  <Icon size={16} className={cfg.color} />
                </div>
                <span className="text-xs font-bold text-muted-foreground">{tier}</span>
              </div>
              <p className="text-xl md:text-2xl font-extrabold text-foreground">{tierCounts[tier]}</p>
            </button>
          );
        })}
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input-field pl-9" placeholder="Cari nama, ID member, atau no. telp..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowRewards(true)} className="px-3 py-2.5 rounded-xl bg-warning/10 text-warning text-xs font-bold flex items-center gap-1.5 hover:bg-warning/20 transition-colors">
              <Gift size={14} /> Kelola Reward
            </button>
            <button onClick={() => setShowSettings(true)} className="px-3 py-2.5 rounded-xl bg-muted text-foreground text-xs font-bold flex items-center gap-1.5 hover:bg-muted/80 transition-colors">
              <Settings size={14} /> Setting
            </button>
            <button onClick={() => setShowAdd(true)} className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-opacity">
              <Plus size={14} /> Tambah
            </button>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">Tambah Member Baru</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="text-[11px] font-semibold text-muted-foreground">Nama Lengkap *</label>
                <input className="input-field mt-1 text-xs" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nama member" /></div>
              <div><label className="text-[11px] font-semibold text-muted-foreground">No. Telepon</label>
                <input className="input-field mt-1 text-xs" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="08xxxxxxxxxx" /></div>
              <div><label className="text-[11px] font-semibold text-muted-foreground">No. WhatsApp</label>
                <input className="input-field mt-1 text-xs" value={newWa} onChange={e => setNewWa(e.target.value)} placeholder="08xxxxxxxxxx (kosongkan jika sama)" /></div>
              <div><label className="text-[11px] font-semibold text-muted-foreground">Alamat</label>
                <input className="input-field mt-1 text-xs" value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="Alamat lengkap" /></div>
              <div><label className="text-[11px] font-semibold text-muted-foreground">Nama Toko</label>
                <input className="input-field mt-1 text-xs" value={newStoreName} onChange={e => setNewStoreName(e.target.value)} placeholder="Nama toko (opsional)" /></div>
              <div><label className="text-[11px] font-semibold text-muted-foreground">Tipe Pelanggan</label>
                <select className="input-field mt-1 text-xs" value={newCustomerType} onChange={e => setNewCustomerType(e.target.value as CustomerType)}>
                  <option value="Regular">Regular (Poin Loyalty)</option>
                  <option value="Reseller">Reseller</option>
                  <option value="VVIP 1">VVIP 1</option>
                  <option value="VVIP 2">VVIP 2</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">{newCustomerType === 'Regular' ? 'Menggunakan sistem poin & loyalty' : 'Mendapat harga khusus tanpa poin'}</p>
              </div>
            </div>
            <div className="p-5 pt-0">
              <button onClick={handleAddMember} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
                Daftarkan Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">Setting Poin & Tier Member</h3>
              <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                <p className="text-xs font-bold text-primary mb-2">Pengaturan Poin</p>
                <div className="space-y-3">
                  <div><label className="text-[11px] font-semibold text-muted-foreground">Minimal Belanja untuk Dapat Poin (Rp)</label>
                    <input className="input-field mt-1 text-xs" value={formatNumber(sMinSpending)} onChange={e => setSMinSpending(e.target.value.replace(/\./g, ''))} /></div>
                  <div><label className="text-[11px] font-semibold text-muted-foreground">Poin per Transaksi</label>
                    <input className="input-field mt-1 text-xs" type="number" value={sPointsPer} onChange={e => setSPointsPer(e.target.value)} /></div>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-warning/5 border border-warning/20">
                <p className="text-xs font-bold text-warning mb-2">Threshold Tier (Total Belanja Kumulatif)</p>
                <div className="space-y-3">
                  <div><label className="text-[11px] font-semibold text-muted-foreground">Naik ke Santri (Rp)</label>
                    <input className="input-field mt-1 text-xs" value={formatNumber(sTierSantri)} onChange={e => setSTierSantri(e.target.value.replace(/\./g, ''))} /></div>
                  <div><label className="text-[11px] font-semibold text-muted-foreground">Naik ke Juragan (Rp)</label>
                    <input className="input-field mt-1 text-xs" value={formatNumber(sTierJuragan)} onChange={e => setSTierJuragan(e.target.value.replace(/\./g, ''))} /></div>
                  <div><label className="text-[11px] font-semibold text-muted-foreground">Naik ke Sultan (Rp)</label>
                    <input className="input-field mt-1 text-xs" value={formatNumber(sTierSultan)} onChange={e => setSTierSultan(e.target.value.replace(/\./g, ''))} /></div>
                </div>
              </div>
            </div>
            <div className="p-5 pt-0">
              <button onClick={handleSaveSettings} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                <Save size={16} /> Simpan Setting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rewards Management Modal */}
      {showRewards && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2"><Gift size={18} className="text-warning" /> Kelola Reward Redeem Poin</h3>
              <button onClick={() => setShowRewards(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Add Reward Form */}
              {showAddReward ? (
                <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                  <p className="text-xs font-bold text-foreground">Tambah Reward Baru</p>
                  <div><label className="text-[11px] font-semibold text-muted-foreground">Nama Reward *</label>
                    <input className="input-field mt-1 text-xs" value={rwName} onChange={e => setRwName(e.target.value)} placeholder="Contoh: Diskon 10rb" /></div>
                  <div><label className="text-[11px] font-semibold text-muted-foreground">Tipe</label>
                    <select className="input-field mt-1 text-xs" value={rwType} onChange={e => setRwType(e.target.value as 'discount' | 'gift')}>
                      <option value="discount">Diskon (potongan harga)</option>
                      <option value="gift">Hadiah (barang/voucher)</option>
                    </select>
                  </div>
                  <div><label className="text-[11px] font-semibold text-muted-foreground">Poin yang Dibutuhkan *</label>
                    <input className="input-field mt-1 text-xs" type="number" value={rwPointsCost} onChange={e => setRwPointsCost(e.target.value)} placeholder="Contoh: 5" /></div>
                  {rwType === 'discount' && (
                    <div><label className="text-[11px] font-semibold text-muted-foreground">Nilai Diskon (Rp)</label>
                      <input className="input-field mt-1 text-xs" value={rwDiscountValue ? formatNumber(rwDiscountValue) : ''} onChange={e => setRwDiscountValue(e.target.value.replace(/\./g, ''))} placeholder="Contoh: 10.000" /></div>
                  )}
                  {rwType === 'gift' && (
                    <div><label className="text-[11px] font-semibold text-muted-foreground">Deskripsi Hadiah</label>
                      <input className="input-field mt-1 text-xs" value={rwGiftDesc} onChange={e => setRwGiftDesc(e.target.value)} placeholder="Contoh: Gratis Hijab Voal" /></div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleAddReward} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">Simpan</button>
                    <button onClick={() => setShowAddReward(false)} className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/80">Batal</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddReward(true)} className="w-full py-2.5 rounded-xl border-2 border-dashed border-border text-muted-foreground text-xs font-bold flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors">
                  <Plus size={14} /> Tambah Reward Baru
                </button>
              )}

              {/* Reward List */}
              {rewards.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">Belum ada reward. Tambahkan reward agar member bisa menukarkan poin.</p>
              ) : (
                <div className="space-y-2">
                  {rewards.map(r => (
                    <div key={r.id} className={`p-4 rounded-xl border transition-all ${r.is_active ? 'border-border bg-card' : 'border-border/50 bg-muted/20 opacity-60'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm text-foreground">{r.name}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.type === 'discount' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                              {r.type === 'discount' ? <><Tag size={8} className="inline mr-0.5" />Diskon</> : <><Gift size={8} className="inline mr-0.5" />Hadiah</>}
                            </span>
                            {!r.is_active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Nonaktif</span>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {r.type === 'discount' ? `Potongan Rp ${formatNumber(r.discount_value || 0)}` : r.gift_description || '-'}
                          </p>
                          <p className="text-xs font-bold text-primary mt-1">🏆 {r.points_cost} Poin</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => handleToggleReward(r)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${r.is_active ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                            {r.is_active ? 'Aktif' : 'Off'}
                          </button>
                          <button onClick={() => handleDeleteReward(r)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Member Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {members.length === 0 ? 'Belum ada member terdaftar.' : 'Tidak ada data yang cocok.'}
        </div>
      ) : (
        <>
          {/* Mobile Card Layout */}
          <div className="md:hidden space-y-3">
            {filtered.map(m => {
              const tierCfg = TIER_CONFIG[m.tier] || TIER_CONFIG.Warga;
              const Icon = tierCfg.icon;
              return (
                <div key={m.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-foreground text-sm">{m.name}</p>
                      <p className="font-mono text-[10px] text-primary">{m.member_id || '-'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${tierCfg.bg} ${tierCfg.color}`}>
                        <Icon size={10} /> {m.tier}
                      </span>
                      {isAdmin && (
                        <button onClick={() => handleDeleteMember(m)} className="p-1 rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div><span className="text-muted-foreground">Telp:</span> <span className="text-foreground">{m.phone || m.wa || '-'}</span></div>
                    <div><span className="text-muted-foreground">Tipe:</span> <span className="font-bold text-foreground">{m.customer_type || 'Regular'}</span></div>
                    <div><span className="text-muted-foreground">Poin:</span> <span className="font-bold text-primary">{m.points || 0}</span></div>
                    <div><span className="text-muted-foreground">Total Belanja:</span> <span className="font-bold text-foreground">Rp {formatNumber(m.total_spending || 0)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground">ID Member</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground">Nama</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground">No. Telp</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground">Alamat</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground">Toko</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground">Tipe</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground">Tier</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground">Total Belanja</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground">Poin</th>
                    {isAdmin && <th className="text-center px-4 py-3 text-xs font-bold text-muted-foreground">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map(m => {
                    const tierCfg = TIER_CONFIG[m.tier] || TIER_CONFIG.Warga;
                    const Icon = tierCfg.icon;
                    return (
                      <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{m.member_id || '-'}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{m.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.phone || m.wa || '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{m.address || '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{m.store_name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            (m.customer_type || 'Regular') === 'Regular' ? 'bg-muted text-muted-foreground' :
                            (m.customer_type === 'Reseller') ? 'bg-primary/10 text-primary' :
                            'bg-warning/10 text-warning'
                          }`}>
                            {m.customer_type || 'Regular'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${tierCfg.bg} ${tierCfg.color}`}>
                            <Icon size={10} /> {m.tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">Rp {formatNumber(m.total_spending || 0)}</td>
                        <td className="px-4 py-3 text-right font-bold text-primary">{m.points || 0}</td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => handleDeleteMember(m)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export { getTierFromSpending, generateMemberId };
