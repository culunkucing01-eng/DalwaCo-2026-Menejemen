import { useState, useEffect, useMemo } from 'react';
import { useAppState, ROLES, type Product } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import {
  subscribeCategoriesWithIds,
  firestoreAddCategory,
  firestoreUpdateCategory,
  firestoreDeleteCategory,
  firestoreRenameCategoryOnProducts,
  updateDocument,
  type CategoryDoc,
  type SalesTransaction,
} from '@/lib/firestore';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, AlertTriangle, ArrowRightLeft, BarChart3, Tags, Layers,
  Lock, Search, Package, TrendingUp, AlertCircle, ChevronRight,
} from 'lucide-react';

export default function CategoryVariantManagementView() {
  const { currentRole, products, salesTransactions, addAuditLog } = useAppState();
  const { profile } = useAuth();
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const isReadOnly = currentRole === ROLES.KASIR;

  useEffect(() => {
    const unsub = subscribeCategoriesWithIds(setCategories);
    return () => unsub();
  }, []);

  return (
    <Tabs defaultValue="analytics" className="space-y-4">
      <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
        <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 size={14} /> Analitik Kategori</TabsTrigger>
        <TabsTrigger value="management" className="gap-1.5"><Tags size={14} /> Manajemen Kategori</TabsTrigger>
        <TabsTrigger value="sku-builder" className="gap-1.5"><Layers size={14} /> SKU & Variant Builder</TabsTrigger>
      </TabsList>

      <TabsContent value="analytics">
        <AnalyticsTab categories={categories} products={products} salesTransactions={salesTransactions} />
      </TabsContent>
      <TabsContent value="management">
        <ManagementTab categories={categories} products={products} isReadOnly={isReadOnly} addAuditLog={addAuditLog} userName={profile?.displayName || currentRole || ''} />
      </TabsContent>
      <TabsContent value="sku-builder">
        <SkuBuilderTab categories={categories} products={products} />
      </TabsContent>
    </Tabs>
  );
}

/* ===================== TAB 1: ANALYTICS ===================== */
function AnalyticsTab({ categories, products, salesTransactions }: { categories: CategoryDoc[]; products: Product[]; salesTransactions: SalesTransaction[] }) {
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);

  const analytics = useMemo(() => {
    return categories.map(cat => {
      const catProducts = products.filter(p => p.category === cat.name);
      const totalSKU = catProducts.length;

      // Sales in last 30 days
      const recentSales = salesTransactions.filter(t => t.timestamp >= thirtyDaysAgo);
      let qtySold = 0;
      const productSalesMap: Record<string, number> = {};

      recentSales.forEach(t => {
        t.items.forEach(item => {
          const matchedProduct = catProducts.find(p => p.id === item.product_id || p.sku === item.sku);
          if (matchedProduct) {
            qtySold += item.qty;
            productSalesMap[matchedProduct.name] = (productSalesMap[matchedProduct.name] || 0) + item.qty;
          }
        });
      });

      const topProduct = Object.entries(productSalesMap).sort((a, b) => b[1] - a[1])[0];

      // Dead stock: products with stock > 0 but 0 sales this month
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      const thisMonthStr = thisMonth.toISOString();
      const thisMonthSales = salesTransactions.filter(t => t.timestamp >= thisMonthStr);

      const soldProductIds = new Set<string>();
      thisMonthSales.forEach(t => {
        t.items.forEach(item => {
          const mp = catProducts.find(p => p.id === item.product_id || p.sku === item.sku);
          if (mp) soldProductIds.add(mp.id);
        });
      });

      const deadStock = catProducts.filter(p => {
        const totalStock = Object.values(p.stock_map || {}).reduce((a, b) => a + b, 0);
        return totalStock > 0 && !soldProductIds.has(p.id);
      }).length;

      return { cat, totalSKU, qtySold, topProduct, deadStock };
    });
  }, [categories, products, salesTransactions, thirtyDaysAgo]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <h3 className="font-bold text-foreground flex items-center gap-2"><BarChart3 size={16} className="text-primary" /> Category Intelligence — 30 Hari Terakhir</h3>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Kategori</TableHead>
              <TableHead className="text-center">Total Produk</TableHead>
              <TableHead className="text-center">Qty Terjual</TableHead>
              <TableHead>Top Product</TableHead>
              <TableHead className="text-center">Dead Stock Alert</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analytics.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Belum ada kategori</TableCell></TableRow>
            )}
            {analytics.map(row => (
              <TableRow key={row.cat.id}>
                <TableCell className="font-semibold">
                  <div className="flex items-center gap-2">
                    {row.cat.name}
                    {row.cat.prefix && <Badge variant="outline" className="text-[10px]">{row.cat.prefix}</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-center"><Badge variant="secondary">{row.totalSKU}</Badge></TableCell>
                <TableCell className="text-center font-medium">{row.qtySold.toLocaleString('id-ID')}</TableCell>
                <TableCell>
                  {row.topProduct ? (
                    <div className="flex items-center gap-1.5">
                      <TrendingUp size={13} className="text-primary shrink-0" />
                      <span className="text-sm truncate max-w-[180px]">{row.topProduct[0]}</span>
                      <span className="text-xs text-muted-foreground">({row.topProduct[1]} pcs)</span>
                    </div>
                  ) : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  {row.deadStock > 0 ? (
                    <Badge variant="destructive" className="gap-1"><AlertCircle size={11} /> {row.deadStock} produk</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Aman</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ===================== TAB 2: MANAGEMENT ===================== */
function ManagementTab({ categories, products, isReadOnly, addAuditLog, userName }: {
  categories: CategoryDoc[]; products: Product[]; isReadOnly: boolean; addAuditLog: (a: string, d: string) => void; userName: string;
}) {
  const [newName, setNewName] = useState('');
  const [newPrefix, setNewPrefix] = useState('');
  const [editCat, setEditCat] = useState<CategoryDoc | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrefix, setEditPrefix] = useState('');
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkSourceCat, setBulkSourceCat] = useState('');
  const [bulkTargetCat, setBulkTargetCat] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [searchBulk, setSearchBulk] = useState('');

  const productCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach(p => { map[p.category] = (map[p.category] || 0) + 1; });
    return map;
  }, [products]);

  const handleAdd = async () => {
    const name = newName.trim();
    const prefix = newPrefix.trim().toUpperCase();
    if (!name) return toast.error('Nama kategori wajib diisi');
    if (prefix && (prefix.length < 2 || prefix.length > 4 || !/^[A-Z]+$/.test(prefix))) return toast.error('Prefix harus 2-4 huruf kapital');
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast.error('Kategori sudah ada');
    await firestoreAddCategory(name, prefix || undefined);
    addAuditLog('Tambah Kategori', `${userName} menambahkan kategori "${name}" (prefix: ${prefix || '-'})`);
    toast.success(`Kategori "${name}" ditambahkan`);
    setNewName('');
    setNewPrefix('');
  };

  const handleDelete = async (cat: CategoryDoc) => {
    const count = productCountMap[cat.name] || 0;
    if (count > 0) {
      toast.error(`Kategori tidak bisa dihapus. Pindahkan ${count} produk ke kategori lain terlebih dahulu.`, { duration: 5000 });
      return;
    }
    await firestoreDeleteCategory(cat.id);
    addAuditLog('Hapus Kategori', `${userName} menghapus kategori "${cat.name}"`);
    toast.success(`Kategori "${cat.name}" dihapus`);
  };

  const handleEditSave = async () => {
    if (!editCat) return;
    const name = editName.trim();
    const prefix = editPrefix.trim().toUpperCase();
    if (!name) return toast.error('Nama kategori wajib diisi');
    if (prefix && (prefix.length < 2 || prefix.length > 4 || !/^[A-Z]+$/.test(prefix))) return toast.error('Prefix harus 2-4 huruf kapital');
    if (name !== editCat.name && categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast.error('Kategori sudah ada');

    await firestoreUpdateCategory(editCat.id, name);
    // Also update prefix
    await updateDocument('categories', editCat.id, { prefix: prefix || '' });

    if (name !== editCat.name) {
      const count = await firestoreRenameCategoryOnProducts(editCat.name, name);
      addAuditLog('Edit Kategori', `${userName} mengubah kategori "${editCat.name}" → "${name}" (prefix: ${prefix || '-'}). ${count} produk diperbarui.`);
    } else {
      addAuditLog('Edit Kategori', `${userName} memperbarui prefix kategori "${name}" → "${prefix || '-'}"`);
    }
    toast.success('Kategori diperbarui');
    setEditCat(null);
  };

  // Bulk move
  const bulkSourceProducts = useMemo(() => {
    if (!bulkSourceCat) return [];
    return products.filter(p => p.category === bulkSourceCat && (searchBulk === '' || p.name.toLowerCase().includes(searchBulk.toLowerCase()) || p.sku.toLowerCase().includes(searchBulk.toLowerCase())));
  }, [products, bulkSourceCat, searchBulk]);

  const handleBulkMove = async () => {
    if (!bulkTargetCat || selectedProductIds.size === 0) return toast.error('Pilih produk dan kategori tujuan');
    if (bulkTargetCat === bulkSourceCat) return toast.error('Kategori tujuan harus berbeda');

    for (const pid of selectedProductIds) {
      await updateDocument('products', pid, { category: bulkTargetCat });
    }
    addAuditLog('Pindah Kategori Massal', `${userName} memindahkan ${selectedProductIds.size} produk dari "${bulkSourceCat}" ke "${bulkTargetCat}"`);
    toast.success(`${selectedProductIds.size} produk dipindahkan ke "${bulkTargetCat}"`);
    setSelectedProductIds(new Set());
    setBulkMoveOpen(false);
    setBulkSourceCat('');
    setBulkTargetCat('');
  };

  return (
    <div className="space-y-6">
      {/* Add Category */}
      {!isReadOnly && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2"><Plus size={16} className="text-primary" /> Tambah Kategori Baru</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground mb-1 block">Nama Kategori</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Contoh: Kemeja" />
            </div>
            <div className="w-28">
              <label className="text-xs text-muted-foreground mb-1 block">Prefix (Kode)</label>
              <Input value={newPrefix} onChange={e => setNewPrefix(e.target.value.toUpperCase().slice(0, 4))} placeholder="KMJ" maxLength={4} className="uppercase tracking-wider font-mono" />
            </div>
            <Button onClick={handleAdd}><Plus size={14} /> Tambah</Button>
          </div>
        </div>
      )}

      {/* Category Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-foreground flex items-center gap-2"><Tags size={16} className="text-primary" /> Daftar Kategori</h3>
          {!isReadOnly && (
            <Button variant="outline" size="sm" onClick={() => setBulkMoveOpen(true)} className="gap-1.5">
              <ArrowRightLeft size={14} /> Pindahkan Kategori (Bulk)
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Kategori</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead className="text-center">Jumlah Produk</TableHead>
              {!isReadOnly && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 && (
              <TableRow><TableCell colSpan={isReadOnly ? 3 : 4} className="text-center py-8 text-muted-foreground">Belum ada kategori</TableCell></TableRow>
            )}
            {categories.map(cat => {
              const count = productCountMap[cat.name] || 0;
              return (
                <TableRow key={cat.id}>
                  <TableCell className="font-semibold">{cat.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-xs">{cat.prefix || '—'}</Badge></TableCell>
                  <TableCell className="text-center"><Badge variant="secondary">{count}</Badge></TableCell>
                  {!isReadOnly && (
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditCat(cat); setEditName(cat.name); setEditPrefix(cat.prefix || ''); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(cat)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editCat} onOpenChange={open => { if (!open) setEditCat(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Kategori</DialogTitle>
            <DialogDescription>Perubahan nama akan memperbarui seluruh produk terkait.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nama Kategori</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prefix (Kode)</label>
              <Input value={editPrefix} onChange={e => setEditPrefix(e.target.value.toUpperCase().slice(0, 4))} maxLength={4} className="uppercase tracking-wider font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCat(null)}>Batal</Button>
            <Button onClick={handleEditSave}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Dialog */}
      <Dialog open={bulkMoveOpen} onOpenChange={setBulkMoveOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRightLeft size={16} /> Pindahkan Produk Antar Kategori</DialogTitle>
            <DialogDescription>Pilih produk dari kategori sumber lalu pindahkan ke kategori tujuan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Kategori Sumber</label>
                <select value={bulkSourceCat} onChange={e => { setBulkSourceCat(e.target.value); setSelectedProductIds(new Set()); }} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Pilih kategori...</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name} ({productCountMap[c.name] || 0})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Kategori Tujuan</label>
                <select value={bulkTargetCat} onChange={e => setBulkTargetCat(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Pilih tujuan...</option>
                  {categories.filter(c => c.name !== bulkSourceCat).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {bulkSourceCat && (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={searchBulk} onChange={e => setSearchBulk(e.target.value)} placeholder="Cari produk..." className="pl-8" />
                </div>
                <div className="border border-border rounded-lg max-h-60 overflow-y-auto">
                  {bulkSourceProducts.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">Tidak ada produk di kategori ini</div>
                  ) : (
                    <div className="divide-y divide-border">
                      <label className="flex items-center gap-3 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50">
                        <Checkbox
                          checked={selectedProductIds.size === bulkSourceProducts.length && bulkSourceProducts.length > 0}
                          onCheckedChange={checked => {
                            if (checked) setSelectedProductIds(new Set(bulkSourceProducts.map(p => p.id)));
                            else setSelectedProductIds(new Set());
                          }}
                        />
                        <span className="text-xs font-bold text-muted-foreground">Pilih Semua ({bulkSourceProducts.length})</span>
                      </label>
                      {bulkSourceProducts.map(p => (
                        <label key={p.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30">
                          <Checkbox
                            checked={selectedProductIds.has(p.id)}
                            onCheckedChange={checked => {
                              const next = new Set(selectedProductIds);
                              if (checked) next.add(p.id); else next.delete(p.id);
                              setSelectedProductIds(next);
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.sku}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkMoveOpen(false)}>Batal</Button>
            <Button onClick={handleBulkMove} disabled={selectedProductIds.size === 0 || !bulkTargetCat}>
              <ArrowRightLeft size={14} /> Pindahkan {selectedProductIds.size} Produk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ===================== TAB 3: SKU BUILDER ===================== */
function SkuBuilderTab({ categories, products }: { categories: CategoryDoc[]; products: Product[] }) {
  const prefixMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { if (c.prefix) map[c.name] = c.prefix; });
    return map;
  }, [categories]);

  // For each category, compute next auto-increment
  const nextIdMap = useMemo(() => {
    const map: Record<string, number> = {};
    categories.forEach(cat => {
      const catProducts = products.filter(p => p.category === cat.name);
      // Find highest existing increment from barcode pattern
      let maxId = 0;
      catProducts.forEach(p => {
        (p.variants || []).forEach(v => {
          if (v.barcode && cat.prefix) {
            const match = v.barcode.match(new RegExp(`^${cat.prefix}-(\\d+)-`));
            if (match) maxId = Math.max(maxId, parseInt(match[1], 10));
          }
        });
      });
      map[cat.name] = maxId + 1;
    });
    return map;
  }, [categories, products]);

  // Demo preview state
  const [demoCat, setDemoCat] = useState('');
  const [demoColor, setDemoColor] = useState('');
  const [demoSize, setDemoSize] = useState('');

  const demoBarcode = useMemo(() => {
    const prefix = demoCat ? prefixMap[demoCat] : '';
    if (!prefix) return '—';
    const id = String(nextIdMap[demoCat] || 1).padStart(3, '0');
    const colorCode = demoColor.trim().toUpperCase().slice(0, 3) || 'XXX';
    const size = demoSize.trim().toUpperCase() || 'XX';
    return `${prefix}-${id}-${colorCode}-${size}`;
  }, [demoCat, demoColor, demoSize, prefixMap, nextIdMap]);

  return (
    <div className="space-y-6">
      {/* Formula Explanation */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-bold text-foreground mb-2 flex items-center gap-2"><Layers size={16} className="text-primary" /> Standarisasi Barcode Varian</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Setiap varian produk otomatis mendapat barcode dengan format:
        </p>
        <div className="bg-muted/50 rounded-lg p-3 font-mono text-sm flex items-center gap-1 flex-wrap">
          <Badge className="bg-primary/20 text-primary border-primary/30">[Prefix Kategori]</Badge>
          <span className="text-muted-foreground">-</span>
          <Badge className="bg-primary/20 text-primary border-primary/30">[Auto ID]</Badge>
          <span className="text-muted-foreground">-</span>
          <Badge className="bg-primary/20 text-primary border-primary/30">[3 Huruf Warna]</Badge>
          <span className="text-muted-foreground">-</span>
          <Badge className="bg-primary/20 text-primary border-primary/30">[Size]</Badge>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Lock size={12} /> Field Barcode Varian bersifat <strong className="text-foreground">Read-Only</strong> di antarmuka pengguna
        </div>
      </div>

      {/* Live Preview */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-bold text-foreground mb-3 flex items-center gap-2"><Package size={16} className="text-primary" /> Preview Generator Barcode</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Kategori</label>
            <select value={demoCat} onChange={e => setDemoCat(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Pilih...</option>
              {categories.filter(c => c.prefix).map(c => <option key={c.id} value={c.name}>{c.name} ({c.prefix})</option>)}
            </select>
            {categories.filter(c => !c.prefix).length > 0 && (
              <p className="text-[10px] text-destructive mt-1 flex items-center gap-1"><AlertTriangle size={10} /> Beberapa kategori belum memiliki prefix</p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Warna</label>
            <Input value={demoColor} onChange={e => setDemoColor(e.target.value)} placeholder="Navy" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Size</label>
            <Input value={demoSize} onChange={e => setDemoSize(e.target.value)} placeholder="XL" />
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
          <span className="text-xs text-muted-foreground">Hasil Barcode:</span>
          <ChevronRight size={14} className="text-muted-foreground" />
          <span className="font-mono font-bold text-lg text-primary tracking-wider">{demoBarcode}</span>
        </div>
      </div>

      {/* Prefix Coverage Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h3 className="font-bold text-foreground flex items-center gap-2"><Tags size={16} className="text-primary" /> Cakupan Prefix Kategori</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kategori</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead className="text-center">Produk</TableHead>
              <TableHead className="text-center">Next ID</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(cat => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.name}</TableCell>
                <TableCell><span className="font-mono font-bold">{cat.prefix || '—'}</span></TableCell>
                <TableCell className="text-center">{products.filter(p => p.category === cat.name).length}</TableCell>
                <TableCell className="text-center font-mono">{cat.prefix ? String(nextIdMap[cat.name] || 1).padStart(3, '0') : '—'}</TableCell>
                <TableCell>
                  {cat.prefix ? (
                    <Badge variant="outline" className="text-xs text-primary border-primary/30">Siap</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle size={10} /> Belum ada prefix</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
