import { useState, useMemo, useRef, useEffect } from 'react';
import { useAppState, STORES, ROLES, formatNumber, unformatNumber, type Product, type ProductVariant } from '@/lib/store';
import { firestoreAddProduct, firestoreDeleteProduct, firestoreUpdateProduct, firestoreAddCategory, firestoreUpdateCategory, firestoreDeleteCategory, firestoreRenameCategoryOnProducts, subscribeCategoriesWithIds, type CategoryDoc } from '@/lib/firestore';
import { uploadProductImage } from '@/lib/image-upload';
import { Plus, X, Trash2, Edit3, Check, Lock, Upload, ImageIcon, Package, Loader2, Printer, RefreshCw, Search, PackageSearch, Settings2 } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import JsBarcode from 'jsbarcode';

const SIZE_OPTIONS = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'All Size'];

interface VariantFormData {
  warna: string;
  size: string;
  style: string;
  barcode: string;
  stock: string;
}

const emptyVariant = (): VariantFormData => ({ warna: '', size: '', style: '', barcode: '', stock: '' });

const variantDisplayName = (v: VariantFormData | ProductVariant) => {
  const parts: string[] = [];
  if ('warna' in v && v.warna) parts.push(v.warna);
  if ('size' in v && v.size) parts.push(v.size);
  if ('style' in v && v.style) parts.push(v.style);
  if (parts.length === 0 && 'name' in v) return v.name;
  return parts.join(' - ') || 'Varian';
};

// --- Auto-generate SKU ---
function generateSKU(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `DLW-${code}`;
}

// --- Auto-generate Variant Barcode ---
function generateVariantBarcode(parentSku: string, warna: string, size: string): string {
  if (!parentSku) return '';
  const colorCode = warna ? warna.trim().toUpperCase().substring(0, 3) : '';
  const sizeCode = size ? size.toUpperCase().replace(/\s/g, '') : '';
  const parts = [parentSku];
  if (colorCode) parts.push(colorCode);
  if (sizeCode) parts.push(sizeCode);
  return parts.join('-');
}

// --- Variant Row Component ---
function VariantRow({ variant, index, parentSku, onChange, onRemove }: {
  variant: VariantFormData;
  index: number;
  parentSku: string;
  onChange: (i: number, field: keyof VariantFormData, val: string) => void;
  onRemove: (i: number) => void;
}) {
  // Auto-generate barcode when warna or size changes
  useEffect(() => {
    const newBarcode = generateVariantBarcode(parentSku, variant.warna, variant.size);
    if (newBarcode && newBarcode !== variant.barcode) {
      onChange(index, 'barcode', newBarcode);
    }
  }, [parentSku, variant.warna, variant.size]);

  return (
    <div className="grid grid-cols-[1fr_100px_1fr_1fr_90px_36px] gap-2 items-center">
      <input className="input-field text-xs" placeholder="Warna (cth: Navy)" value={variant.warna} onChange={e => onChange(index, 'warna', e.target.value)} />
      <select className="input-field text-xs" value={variant.size} onChange={e => onChange(index, 'size', e.target.value)}>
        <option value="">Size</option>
        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className="input-field text-xs" placeholder="Style (cth: Manset)" value={variant.style} onChange={e => onChange(index, 'style', e.target.value)} />
      <input className="input-field text-xs font-mono bg-muted/50 cursor-not-allowed" placeholder="Auto-generate" value={variant.barcode} readOnly title="Barcode otomatis dari SKU + Warna + Size" />
      <input className="input-field text-xs text-center" type="number" placeholder="Stok" value={variant.stock} onChange={e => onChange(index, 'stock', e.target.value)} />
      <button type="button" onClick={() => onRemove(index)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={14} /></button>
    </div>
  );
}

// --- Image Upload Area ---
function ImageUploadArea({ imagePreview, onFileSelect, uploading }: {
  imagePreview: string | null;
  onFileSelect: (file: File) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  };

  return (
    <div
      className="relative border-2 border-dashed border-border rounded-xl h-36 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors bg-muted/30"
      onClick={() => inputRef.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) onFileSelect(e.target.files[0]); }} />
      {uploading ? (
        <p className="text-xs text-muted-foreground animate-pulse">Mengompresi & mengupload...</p>
      ) : imagePreview ? (
        <img src={imagePreview} alt="Preview" className="h-full w-full object-contain rounded-xl p-1" />
      ) : (
        <>
          <Upload size={24} className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground text-center">Drag & Drop atau klik<br />Maks. 500KB · Auto .webp</p>
        </>
      )}
    </div>
  );
}

// --- Variant Detail Popover ---
function VariantDetailPopover({ variants }: { variants?: ProductVariant[] }) {
  if (!variants || variants.length === 0) return <span className="text-muted-foreground text-xs">-</span>;
  const total = variants.reduce((s, v) => s + (v.stock || 0), 0);
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button className="text-left">
          <span className="font-bold text-foreground">{total} Pcs</span>
          <span className="block text-[10px] text-primary underline underline-offset-2 cursor-pointer">Lihat Detail Varian</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3 space-y-1.5">
        <p className="text-xs font-bold text-foreground mb-2">Detail Varian ({variants.length})</p>
        {variants.map((v, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate mr-2">
              {variantDisplayName(v)}
              {v.barcode ? <span className="ml-1 font-mono text-[10px] text-primary/70">({v.barcode})</span> : ''}
            </span>
            <span className="font-semibold text-foreground whitespace-nowrap">{v.stock} Pcs</span>
          </div>
        ))}
        <div className="border-t border-border pt-1.5 mt-1.5 flex justify-between text-xs font-bold">
          <span className="text-muted-foreground">Total</span>
          <span className="text-foreground">{total} Pcs</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// --- Hangtag Print Component ---
function HangtagBarcodeCanvas({ barcode }: { barcode: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current && barcode) {
      try {
        JsBarcode(canvasRef.current, barcode, {
          format: 'CODE128',
          width: 1.2,
          height: 30,
          displayValue: true,
          fontSize: 8,
          margin: 2,
          textMargin: 1,
        });
      } catch { /* invalid barcode */ }
    }
  }, [barcode]);
  return <canvas ref={canvasRef} />;
}

function HangtagLabel({ product, variant }: { product: Product; variant: ProductVariant }) {
  const barcode = variant.barcode || variant.sku || '';
  const variantInfo = [variant.warna, variant.size].filter(Boolean).join(' - ');

  return (
    <div className="hangtag-label" style={{ width: '33mm', minHeight: '15mm', padding: '1.5mm', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif', textAlign: 'center', pageBreakAfter: 'always' }}>
      <p style={{ fontSize: '6pt', margin: '0 0 1px 0', fontWeight: 'normal', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</p>
      <p style={{ fontSize: '7pt', margin: '0 0 1px 0', fontWeight: 'bold', lineHeight: 1.2 }}>Rp {formatNumber(product.price)}</p>
      {variantInfo && <p style={{ fontSize: '5.5pt', margin: '0 0 1px 0', lineHeight: 1.2, textTransform: 'uppercase' }}>{variantInfo}</p>}
      {barcode && <HangtagBarcodeCanvas barcode={barcode} />}
    </div>
  );
}

function HangtagModal({ product, open, onClose }: { product: Product; open: boolean; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrintSingle = (variant: ProductVariant) => {
    const barcode = variant.barcode || variant.sku || '';
    const variantInfo = [variant.warna, variant.size].filter(Boolean).join(' - ');
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (!printWindow) return;

    // Create a canvas for barcode
    const canvas = document.createElement('canvas');
    if (barcode) {
      try {
        JsBarcode(canvas, barcode, { format: 'CODE128', width: 1.2, height: 30, displayValue: true, fontSize: 8, margin: 2, textMargin: 1 });
      } catch { /* skip */ }
    }
    const barcodeImg = canvas.toDataURL('image/png');

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Hangtag</title>
      <style>
        @page { size: 33mm 15mm; margin: 0; }
        body { margin: 0; padding: 0; }
        .label { width: 33mm; height: 15mm; padding: 1.5mm; box-sizing: border-box; font-family: Arial, sans-serif; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .name { font-size: 6pt; margin: 0 0 1px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 30mm; }
        .price { font-size: 7pt; font-weight: bold; margin: 0 0 1px; line-height: 1.2; }
        .variant { font-size: 5.5pt; margin: 0 0 1px; line-height: 1.2; text-transform: uppercase; }
        .barcode img { max-width: 28mm; height: auto; }
      </style></head><body>
      <div class="label">
        <p class="name">${product.name}</p>
        <p class="price">Rp ${formatNumber(product.price)}</p>
        ${variantInfo ? `<p class="variant">${variantInfo}</p>` : ''}
        ${barcode ? `<div class="barcode"><img src="${barcodeImg}" /></div>` : ''}
      </div>
      <script>window.onload=function(){window.print();window.close();}</script>
      </body></html>`);
    printWindow.document.close();
  };

  const variants = product.variants || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer size={16} className="text-primary" /> Cetak Hangtag — {product.name}
          </DialogTitle>
        </DialogHeader>
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Produk ini belum memiliki varian.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto] gap-2 text-[10px] font-semibold text-muted-foreground px-1 border-b border-border pb-1">
              <span>Varian</span>
              <span>Aksi</span>
            </div>
            {variants.map((v, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center py-1.5 border-b border-border/50">
                <div>
                  <p className="text-sm font-semibold text-foreground">{variantDisplayName(v)}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{v.barcode || v.sku || '-'}</p>
                </div>
                <button
                  onClick={() => handlePrintSingle(v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <Printer size={12} /> Print
                </button>
              </div>
            ))}
          </div>
        )}
        <div ref={printRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}

// Convert form variant to ProductVariant for DB
function formToProductVariant(v: VariantFormData): ProductVariant {
  const name = [v.warna, v.size, v.style].filter(Boolean).join(' - ') || 'Varian';
  return {
    name,
    warna: v.warna || undefined,
    size: v.size || undefined,
    style: v.style || undefined,
    barcode: v.barcode || undefined,
    sku: v.barcode || undefined,
    stock: parseInt(v.stock) || 0,
  };
}

// Convert ProductVariant from DB to form
function productVariantToForm(v: ProductVariant): VariantFormData {
  return {
    warna: v.warna || '',
    size: v.size || '',
    style: v.style || '',
    barcode: v.barcode || v.sku || '',
    stock: String(v.stock || 0),
  };
}

// --- Main Component ---
export default function MasterProductsView() {
  const { products, setProducts, currentRole, addAuditLog, showMessage, categories } = useAppState();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', category: 'Gamis', hpp: '', price: '', price_reseller: '', price_vvip1: '', price_vvip2: '', min_stock: '', notes: '' });
  const [variants, setVariants] = useState<VariantFormData[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', sku: '', category: '', hpp: '', price: '', price_reseller: '', price_vvip1: '', price_vvip2: '', min_stock: '', notes: '' });
  const [editVariants, setEditVariants] = useState<VariantFormData[]>([]);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editSaveProgress, setEditSaveProgress] = useState(0);
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [hangtagProduct, setHangtagProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categoryDocs, setCategoryDocs] = useState<CategoryDoc[]>([]);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [deleteCatConfirm, setDeleteCatConfirm] = useState<string | null>(null);

  // Subscribe to categories with IDs for management
  useEffect(() => {
    const unsub = subscribeCategoriesWithIds((cats) => setCategoryDocs(cats));
    return unsub;
  }, []);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.sku.toLowerCase().includes(q)) return true;
      if (p.variants?.some(v => v.barcode?.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [products, searchQuery]);

  const isAdmin = currentRole === ROLES.ADMIN;
  const isGudang = currentRole === ROLES.GUDANG;
  const canSeeHpp = isAdmin;
  const canEditPrice = isAdmin;

  // --- Variant helpers ---
  const addVariant = () => setVariants(v => [...v, emptyVariant()]);
  const removeVariant = (i: number) => setVariants(v => v.filter((_, idx) => idx !== i));
  const updateVariant = (i: number, field: keyof VariantFormData, val: string) => setVariants(v => v.map((vr, idx) => idx === i ? { ...vr, [field]: val } : vr));

  const addEditVariant = () => setEditVariants(v => [...v, emptyVariant()]);
  const removeEditVariant = (i: number) => setEditVariants(v => v.filter((_, idx) => idx !== i));
  const updateEditVariant = (i: number, field: keyof VariantFormData, val: string) => setEditVariants(v => v.map((vr, idx) => idx === i ? { ...vr, [field]: val } : vr));

  const totalVariantStock = useMemo(() => variants.reduce((s, v) => s + (parseInt(v.stock) || 0), 0), [variants]);
  const totalEditVariantStock = useMemo(() => editVariants.reduce((s, v) => s + (parseInt(v.stock) || 0), 0), [editVariants]);

  // --- Generate SKU ---
  const handleGenerateSKU = () => {
    let sku = generateSKU();
    // Ensure unique
    while (products.some(p => p.sku === sku)) sku = generateSKU();
    setForm({ ...form, sku });
  };

  const handleGenerateEditSKU = () => {
    let sku = generateSKU();
    while (products.some(p => p.sku === sku && p.id !== editId)) sku = generateSKU();
    setEditForm({ ...editForm, sku });
  };

  // --- Image helpers ---
  const handleImageSelect = (file: File) => {
    if (file.size > 2 * 1024 * 1024) { showMessage('Peringatan: File terlalu besar (maks 2MB)'); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };
  const handleEditImageSelect = (file: File) => {
    if (file.size > 2 * 1024 * 1024) { showMessage('Peringatan: File terlalu besar (maks 2MB)'); return; }
    setEditImageFile(file);
    setEditImagePreview(URL.createObjectURL(file));
  };

  const startEdit = (p: Product) => {
    setEditId(p.id);
    setEditForm({ name: p.name, sku: p.sku, category: p.category, hpp: String(p.hpp), price: String(p.price), price_reseller: String(p.price_reseller || ''), price_vvip1: String(p.price_vvip1 || ''), price_vvip2: String(p.price_vvip2 || ''), min_stock: String(p.min_stock), notes: p.notes || '' });
    setEditVariants((p.variants || []).map(productVariantToForm));
    setEditImagePreview(p.image_url || null);
    setEditImageFile(null);
  };

  const handleEdit = async (p: Product) => {
    if (!editForm.sku) { showMessage('Peringatan: SKU wajib diisi!'); return; }
    if (canEditPrice && !editForm.price) { showMessage('Peringatan: Harga Jual wajib diisi!'); return; }
    const barcodes = editVariants.filter(v => v.barcode).map(v => v.barcode);
    if (new Set(barcodes).size !== barcodes.length) { showMessage('Peringatan: Barcode varian harus unik!'); return; }

    try {
      setEditSaving(true);
      setEditSaveProgress(10);
      const imagePromise = editImageFile ? uploadProductImage(editImageFile, editForm.sku) : Promise.resolve(p.image_url);
      setEditSaveProgress(30);
      const image_url = await imagePromise;
      setEditSaveProgress(60);

      const parsedVariants: ProductVariant[] = editVariants.filter(v => v.warna || v.size || v.style || v.barcode).map(formToProductVariant);
      const variantTotalStock = parsedVariants.reduce((s, v) => s + v.stock, 0);

      const updates: Partial<Product> = {
        name: editForm.name, sku: editForm.sku, category: editForm.category,
        min_stock: parseInt(editForm.min_stock || '0'),
        image_url: image_url || '',
        variants: parsedVariants,
        notes: editForm.notes,
      };
      if (canSeeHpp) updates.hpp = parseInt(editForm.hpp || '0');
      if (canEditPrice) updates.price = parseInt(editForm.price);
      if (canEditPrice) updates.price_reseller = parseInt(editForm.price_reseller || '0') || 0;
      if (canEditPrice) updates.price_vvip1 = parseInt(editForm.price_vvip1 || '0') || 0;
      if (canEditPrice) updates.price_vvip2 = parseInt(editForm.price_vvip2 || '0') || 0;
      if (parsedVariants.length > 0) {
        updates.stock_map = { ...p.stock_map, 'Gudang Utama': variantTotalStock };
      }

      setEditSaveProgress(80);
      await firestoreUpdateProduct(p.id, updates);
      setEditSaveProgress(100);

      setProducts(prev => prev.map(pr => pr.id === p.id ? { ...pr, ...updates } : pr));
      addAuditLog('Edit Produk', `Produk diedit: ${editForm.sku} - ${editForm.name}`);
      showMessage('Berhasil: Produk diperbarui.');
      setEditId(null);
    } catch (err: any) {
      showMessage(err?.message || 'Gagal memperbarui produk.');
    } finally {
      setEditSaving(false);
      setEditSaveProgress(0);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku) { showMessage('Peringatan: SKU wajib diisi! Klik "Generate SKU" untuk membuat otomatis.'); return; }
    if (canEditPrice && !form.price) { showMessage('Peringatan: Harga Jual wajib diisi!'); return; }
    if (products.some(p => p.sku === form.sku)) { showMessage('Peringatan: SKU sudah digunakan!'); return; }
    const barcodes = variants.filter(v => v.barcode).map(v => v.barcode);
    if (new Set(barcodes).size !== barcodes.length) { showMessage('Peringatan: Barcode varian harus unik!'); return; }

    try {
      setSaving(true);
      setSaveProgress(10);
      const imagePromise = imageFile ? uploadProductImage(imageFile, form.sku) : Promise.resolve('');
      setSaveProgress(30);
      const image_url = await imagePromise;
      setSaveProgress(60);

      const parsedVariants: ProductVariant[] = variants.filter(v => v.warna || v.size || v.style || v.barcode).map(formToProductVariant);
      const variantTotalStock = parsedVariants.reduce((s, v) => s + v.stock, 0);

      const newProduct: Omit<Product, 'id'> = {
        name: form.name, sku: form.sku, category: form.category,
        hpp: parseInt(form.hpp || '0'),
        price: canEditPrice ? parseInt(form.price || '0') : 0,
        price_reseller: canEditPrice ? parseInt(form.price_reseller || '0') || 0 : 0,
        price_vvip1: canEditPrice ? parseInt(form.price_vvip1 || '0') || 0 : 0,
        price_vvip2: canEditPrice ? parseInt(form.price_vvip2 || '0') || 0 : 0,
        min_stock: parseInt(form.min_stock || '0'),
        stock_map: { 'Gudang Utama': variantTotalStock, ...STORES.reduce((a, s) => ({ ...a, [s]: 0 }), {}) },
        image_url,
        variants: parsedVariants,
        notes: form.notes,
      };

      setSaveProgress(80);
      const id = await firestoreAddProduct(newProduct);
      setSaveProgress(100);

      setProducts(prev => [...prev, { ...newProduct, id }]);
      addAuditLog('Master Data', `Produk baru: ${form.sku} - ${form.name}`);
      showMessage('Berhasil: Produk berhasil ditambahkan!');
      setShowAdd(false);
      setForm({ name: '', sku: '', category: 'Gamis', hpp: '', price: '', price_reseller: '', price_vvip1: '', price_vvip2: '', min_stock: '', notes: '' });
      setVariants([]);
      setImageFile(null);
      setImagePreview(null);
    } catch (err: any) {
      showMessage(err?.message || 'Gagal menyimpan produk.');
    } finally {
      setSaving(false);
      setSaveProgress(0);
    }
  };

  const handleDelete = async (product: Product) => {
    try {
      await firestoreDeleteProduct(product.id);
      setProducts(prev => prev.filter(p => p.id !== product.id));
      addAuditLog('Hapus Produk', `Produk dihapus: ${product.sku} - ${product.name}`);
      showMessage(`Berhasil: Produk ${product.sku} dihapus.`);
      setDeleteConfirm(null);
    } catch { showMessage('Gagal menghapus produk.'); }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Daftar Produk Master</h2>
          <p className="text-xs text-muted-foreground">Satu pintu utama data produk Dalwa Collection</p>
        </div>
        {(isAdmin || isGudang) && (
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
            {showAdd ? <X size={16} /> : <Plus size={16} />} {showAdd ? 'Batal' : 'Tambah Produk'}
          </button>
        )}
      </div>

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-2xl border border-border bg-card p-5 space-y-5">
          {/* Section 1: Info Dasar & Media */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Package size={14} className="text-primary" /> Informasi Dasar & Media</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:row-span-2">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Foto Produk <span className="font-normal text-muted-foreground">(opsional)</span></label>
                <ImageUploadArea imagePreview={imagePreview} onFileSelect={handleImageSelect} uploading={saving} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Nama Produk</label>
                <input className="input-field mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Kemeja Linen Premium" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">SKU Induk (Auto)</label>
                <div className="flex gap-2 mt-1">
                  <input className="input-field flex-1 font-mono bg-muted/50 cursor-not-allowed" value={form.sku} readOnly placeholder="Klik Generate →" />
                  <button type="button" onClick={handleGenerateSKU} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-bold hover:opacity-90 whitespace-nowrap transition-opacity">
                    <RefreshCw size={12} /> Generate SKU
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
                {showNewCategory ? (
                  <div className="flex gap-2 mt-1">
                    <input className="input-field flex-1" value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="Nama kategori baru" autoFocus />
                    <button type="button" onClick={async () => {
                      if (!newCategory.trim()) return;
                      if (categories.includes(newCategory.trim())) { showMessage('Peringatan: Kategori sudah ada!'); return; }
                      try { await firestoreAddCategory(newCategory.trim()); setForm({ ...form, category: newCategory.trim() }); addAuditLog('Kategori', `Kategori baru: ${newCategory.trim()}`); showMessage(`Berhasil: Kategori "${newCategory.trim()}" ditambahkan!`); setNewCategory(''); setShowNewCategory(false); } catch { showMessage('Gagal menambahkan kategori.'); }
                    }} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90">Simpan</button>
                    <button type="button" onClick={() => { setShowNewCategory(false); setNewCategory(''); }} className="px-3 py-2 rounded-xl bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/80">Batal</button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-1">
                    <select className="input-field flex-1" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                      {categories.map(c => <option key={c}>{c}</option>)}
                    </select>
                    {(isAdmin || isGudang) && (
                      <>
                        <button type="button" onClick={() => setShowNewCategory(true)} className="px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-bold hover:opacity-90 whitespace-nowrap">+ Baru</button>
                        <button type="button" onClick={() => setShowCategoryManager(true)} className="p-2 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition-colors" title="Kelola Kategori">
                          <Settings2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {canSeeHpp && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">HPP (Rp)</label>
                  <input className="input-field mt-1" value={formatNumber(form.hpp)} onChange={e => setForm({ ...form, hpp: unformatNumber(e.target.value) })} placeholder="100.000" />
                </div>
              )}
              {canEditPrice ? (
                <>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Harga Normal (Rp)</label>
                    <input className="input-field mt-1" value={formatNumber(form.price)} onChange={e => setForm({ ...form, price: unformatNumber(e.target.value) })} placeholder="285.000" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Harga Reseller (Rp)</label>
                    <input className="input-field mt-1" value={formatNumber(form.price_reseller)} onChange={e => setForm({ ...form, price_reseller: unformatNumber(e.target.value) })} placeholder="250.000" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Harga VVIP 1 (Rp)</label>
                    <input className="input-field mt-1" value={formatNumber(form.price_vvip1)} onChange={e => setForm({ ...form, price_vvip1: unformatNumber(e.target.value) })} placeholder="230.000" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Harga VVIP 2 (Rp)</label>
                    <input className="input-field mt-1" value={formatNumber(form.price_vvip2)} onChange={e => setForm({ ...form, price_vvip2: unformatNumber(e.target.value) })} placeholder="210.000" />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">Harga Jual (Rp) <Lock size={10} className="text-muted-foreground" /></label>
                  <p className="input-field mt-1 bg-muted/50 text-muted-foreground cursor-not-allowed text-sm">Hanya Admin Pusat</p>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Stok Minimal</label>
                <input className="input-field mt-1" type="number" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} placeholder="10" />
              </div>
            </div>
          </div>

          {/* Section 2: Varian & Stok */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Package size={14} className="text-primary" /> Daftar Varian Produk</h3>
              <button type="button" onClick={addVariant} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-bold hover:opacity-90">
                <Plus size={12} /> Tambah Varian
              </button>
            </div>
            {!form.sku && variants.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 italic py-2 text-center">⚠️ Generate SKU Induk terlebih dahulu agar barcode varian dapat dibuat otomatis.</p>
            )}
            {variants.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-xl">Belum ada varian. Klik "+ Tambah Varian" untuk menambahkan ukuran atau warna.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_100px_1fr_1fr_90px_36px] gap-2 text-[10px] font-semibold text-muted-foreground px-1">
                  <span>Warna</span>
                  <span>Size</span>
                  <span>Style</span>
                  <span>Barcode (Auto)</span>
                  <span className="text-center">Stok</span>
                  <span></span>
                </div>
                {variants.map((v, i) => (
                  <VariantRow key={i} variant={v} index={i} parentSku={form.sku} onChange={updateVariant} onRemove={removeVariant} />
                ))}
                <p className="text-xs font-bold text-foreground text-right pt-1">Total Stok Gudang: {totalVariantStock} Pcs</p>
              </div>
            )}
          </div>

          {/* Section 3: Product Knowledge */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Package size={14} className="text-primary" /> Product Knowledge</h3>
            <label className="text-xs font-semibold text-muted-foreground">Catatan Kasir / Deskripsi Produk</label>
            <textarea className="input-field mt-1 min-h-[80px] w-full" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Tuliskan keunggulan produk, bahan, atau cara perawatan agar kasir mudah menjelaskan ke pelanggan." />
          </div>

          {saving && (
            <div className="space-y-1">
              <Progress value={saveProgress} className="h-2" />
              <p className="text-[10px] text-muted-foreground text-center">
                {saveProgress < 30 ? 'Mengompresi gambar...' : saveProgress < 60 ? 'Mengupload gambar...' : saveProgress < 80 ? 'Menyiapkan data...' : 'Menyimpan ke database...'}
              </p>
            </div>
          )}
          <button type="submit" disabled={saving} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Menyimpan... (Loading)</> : 'Simpan Master Data'}
          </button>
        </form>
      )}

      {/* Edit Form */}
      {editId && (() => {
        const p = products.find(pr => pr.id === editId);
        if (!p) return null;
        return (
          <div className="p-5 rounded-2xl border-2 border-primary/30 bg-card space-y-5">
            <h3 className="font-bold text-foreground flex items-center gap-2"><Edit3 size={16} className="text-primary" /> Edit Produk: {p.sku}</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:row-span-2">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Foto Produk</label>
                <ImageUploadArea imagePreview={editImagePreview} onFileSelect={handleEditImageSelect} uploading={editSaving} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Nama Produk</label>
                <input className="input-field mt-1" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">SKU Induk (Auto)</label>
                <div className="flex gap-2 mt-1">
                  <input className="input-field flex-1 font-mono bg-muted/50 cursor-not-allowed" value={editForm.sku} readOnly />
                  <button type="button" onClick={handleGenerateEditSKU} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-bold hover:opacity-90 whitespace-nowrap transition-opacity">
                    <RefreshCw size={12} /> Generate
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
                <select className="input-field mt-1" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {canSeeHpp && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">HPP (Rp)</label>
                  <input className="input-field mt-1" value={formatNumber(editForm.hpp)} onChange={e => setEditForm({ ...editForm, hpp: unformatNumber(e.target.value) })} />
                </div>
              )}
              {canEditPrice ? (
                <>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Harga Normal (Rp)</label>
                    <input className="input-field mt-1" value={formatNumber(editForm.price)} onChange={e => setEditForm({ ...editForm, price: unformatNumber(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Harga Reseller (Rp)</label>
                    <input className="input-field mt-1" value={formatNumber(editForm.price_reseller)} onChange={e => setEditForm({ ...editForm, price_reseller: unformatNumber(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Harga VVIP 1 (Rp)</label>
                    <input className="input-field mt-1" value={formatNumber(editForm.price_vvip1)} onChange={e => setEditForm({ ...editForm, price_vvip1: unformatNumber(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Harga VVIP 2 (Rp)</label>
                    <input className="input-field mt-1" value={formatNumber(editForm.price_vvip2)} onChange={e => setEditForm({ ...editForm, price_vvip2: unformatNumber(e.target.value) })} />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">Harga Jual (Rp) <Lock size={10} className="text-muted-foreground" /></label>
                  <p className="input-field mt-1 bg-muted/50 text-muted-foreground cursor-not-allowed">Rp {formatNumber(p.price)} <span className="text-[10px]">(Hanya Admin Pusat)</span></p>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Stok Minimal</label>
                <input className="input-field mt-1" type="number" value={editForm.min_stock} onChange={e => setEditForm({ ...editForm, min_stock: e.target.value })} />
              </div>
            </div>
            {/* Section 2: Varian */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-foreground">Varian Produk</h3>
                <button type="button" onClick={addEditVariant} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-bold hover:opacity-90">
                  <Plus size={12} /> Tambah Varian
                </button>
              </div>
              {editVariants.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-xl">Belum ada varian.</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_100px_1fr_1fr_90px_36px] gap-2 text-[10px] font-semibold text-muted-foreground px-1">
                    <span>Warna</span>
                    <span>Size</span>
                    <span>Style</span>
                    <span>Barcode (Auto)</span>
                    <span className="text-center">Stok</span>
                    <span></span>
                  </div>
                  {editVariants.map((v, i) => (
                    <VariantRow key={i} variant={v} index={i} parentSku={editForm.sku} onChange={updateEditVariant} onRemove={removeEditVariant} />
                  ))}
                  <p className="text-xs font-bold text-foreground text-right pt-1">Total Stok Gudang: {totalEditVariantStock} Pcs</p>
                </div>
              )}
            </div>
            {/* Section 3: Notes */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Catatan Kasir / Deskripsi Produk</label>
              <textarea className="input-field mt-1 min-h-[80px] w-full" value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Tuliskan keunggulan produk, bahan, atau cara perawatan..." />
            </div>
            {editSaving && (
              <div className="space-y-1">
                <Progress value={editSaveProgress} className="h-2" />
                <p className="text-[10px] text-muted-foreground text-center">
                  {editSaveProgress < 30 ? 'Mengompresi gambar...' : editSaveProgress < 60 ? 'Mengupload gambar...' : editSaveProgress < 80 ? 'Menyiapkan data...' : 'Menyimpan ke database...'}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => handleEdit(p)} disabled={editSaving} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50">
                {editSaving ? <><Loader2 size={14} className="animate-spin" /> Menyimpan...</> : <><Check size={14} /> Simpan</>}
              </button>
              <button onClick={() => setEditId(null)} className="px-5 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-bold hover:bg-muted/80">Batal</button>
            </div>
          </div>
        );
      })()}

      {/* Search Bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Cari Nama Produk, SKU, atau Barcode Varian..."
          className="input-field w-full pl-10 pr-10 py-2.5 text-sm"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <PackageSearch size={48} strokeWidth={1.5} className="text-muted-foreground/30" />
          <p className="text-sm font-semibold">Produk atau SKU tidak ditemukan.</p>
          <p className="text-xs">Coba kata kunci lain atau hapus filter pencarian.</p>
        </div>
      ) : (
      <>
      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {filteredProducts.map(p => {
          const totalStock = p.variants && p.variants.length > 0
            ? p.variants.reduce((s, v) => s + (v.stock || 0), 0)
            : (p.stock_map?.['Gudang Utama'] || 0);
          const isLow = totalStock <= p.min_stock;
          return (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start gap-3">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-14 h-14 rounded-xl object-cover border border-border flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-muted/30 border border-dashed border-border flex items-center justify-center flex-shrink-0">
                    <ImageIcon size={18} className="text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-foreground text-sm">{p.sku}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.name}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${isLow ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                      {totalStock} Pcs
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Kategori:</span> <span className="font-semibold text-foreground">{p.category}</span></div>
                {canSeeHpp && <div><span className="text-muted-foreground">HPP:</span> <span className="font-semibold text-foreground">Rp {formatNumber(p.hpp)}</span></div>}
                <div><span className="text-muted-foreground">Harga:</span> <span className="font-semibold text-foreground">Rp {formatNumber(p.price)}</span></div>
                <div><span className="text-muted-foreground">Varian:</span> <span className="font-semibold text-foreground">{p.variants?.length || 0}</span></div>
              </div>
              {p.variants && p.variants.length > 0 && (
                <div className="text-[10px] text-muted-foreground border-t border-border pt-2 space-y-0.5">
                  {p.variants.map((v, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{variantDisplayName(v)} {v.barcode ? <span className="font-mono text-primary/70">({v.barcode})</span> : ''}</span>
                      <span className="font-semibold text-foreground">{v.stock} Pcs</span>
                    </div>
                  ))}
                </div>
              )}
              {(isAdmin || isGudang) && (
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => setHangtagProduct(p)} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-accent-foreground transition-colors" title="Cetak Hangtag"><Printer size={14} /></button>
                  <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"><Edit3 size={14} /></button>
                  {deleteConfirm === p.id ? (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleDelete(p)} className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold">Hapus</button>
                      <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-bold">Batal</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={14} /></button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Produk</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Kategori</th>
              {canSeeHpp && <th className="text-left px-4 py-3 font-semibold text-muted-foreground">HPP</th>}
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Harga Jual</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Min Stok</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Stok Gudang</th>
              {(isAdmin || isGudang) && <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(p => {
              const totalStock = p.variants && p.variants.length > 0
                ? p.variants.reduce((s, v) => s + (v.stock || 0), 0)
                : (p.stock_map?.['Gudang Utama'] || 0);
              const isLow = totalStock <= p.min_stock;
              return (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-border flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted/30 border border-dashed border-border flex items-center justify-center flex-shrink-0">
                          <ImageIcon size={14} className="text-muted-foreground/40" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-foreground">{p.sku}</p>
                        <p className="text-xs text-muted-foreground">{p.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                  {canSeeHpp && <td className="px-4 py-3 text-muted-foreground">Rp {formatNumber(p.hpp)}</td>}
                  <td className="px-4 py-3 font-semibold text-foreground">Rp {formatNumber(p.price)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.min_stock}</td>
                  <td className="px-4 py-3">
                    {p.variants && p.variants.length > 0 ? (
                      <VariantDetailPopover variants={p.variants} />
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${isLow ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                        {totalStock} Pcs
                      </span>
                    )}
                  </td>
                  {(isAdmin || isGudang) && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setHangtagProduct(p)} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-accent-foreground transition-colors" title="Cetak Hangtag"><Printer size={14} /></button>
                        <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Edit"><Edit3 size={14} /></button>
                        {deleteConfirm === p.id ? (
                          <>
                            <button onClick={() => handleDelete(p)} className="px-2 py-1 rounded-lg bg-destructive text-destructive-foreground text-[10px] font-bold">Hapus</button>
                            <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-bold">Batal</button>
                          </>
                        ) : (
                          <button onClick={() => setDeleteConfirm(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>
      )}

      {/* Hangtag Modal */}
      {hangtagProduct && (
        <HangtagModal product={hangtagProduct} open={!!hangtagProduct} onClose={() => setHangtagProduct(null)} />
      )}

      {/* Category Manager Dialog */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 size={18} /> Kelola Kategori</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {categoryDocs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Belum ada kategori kustom.</p>
            )}
            {categoryDocs.map(cat => {
              const productCount = products.filter(p => p.category === cat.name).length;
              const isEditing = editCatId === cat.id;

              return (
                <div key={cat.id} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card">
                  {isEditing ? (
                    <>
                      <input
                        className="input-field flex-1 text-sm"
                        value={editCatName}
                        onChange={e => setEditCatName(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.closest('div')?.querySelector<HTMLButtonElement>('button[data-save]')?.click(); }}
                      />
                      <button
                        data-save
                        disabled={catSaving}
                        onClick={async () => {
                          const trimmed = editCatName.trim();
                          if (!trimmed) return;
                          if (trimmed === cat.name) { setEditCatId(null); return; }
                          if (categories.includes(trimmed)) { showMessage('Peringatan: Kategori sudah ada!'); return; }
                          setCatSaving(true);
                          try {
                            await firestoreUpdateCategory(cat.id, trimmed);
                            const updated = await firestoreRenameCategoryOnProducts(cat.name, trimmed);
                            addAuditLog('Kategori', `Kategori "${cat.name}" → "${trimmed}" (${updated} produk diperbarui)`);
                            showMessage(`Berhasil: Kategori diubah menjadi "${trimmed}", ${updated} produk diperbarui.`);
                            setEditCatId(null);
                          } catch { showMessage('Gagal mengubah kategori.'); }
                          setCatSaving(false);
                        }}
                        className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        {catSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button onClick={() => setEditCatId(null)} className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80">
                        <X size={14} />
                      </button>
                    </>
                  ) : deleteCatConfirm === cat.id ? (
                    <>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-destructive">Hapus "{cat.name}"?</p>
                        {productCount > 0 && <p className="text-xs text-muted-foreground">{productCount} produk menggunakan kategori ini</p>}
                      </div>
                      <button
                        disabled={catSaving}
                        onClick={async () => {
                          setCatSaving(true);
                          try {
                            await firestoreDeleteCategory(cat.id);
                            addAuditLog('Kategori', `Kategori "${cat.name}" dihapus`);
                            showMessage(`Berhasil: Kategori "${cat.name}" dihapus.`);
                            setDeleteCatConfirm(null);
                          } catch { showMessage('Gagal menghapus kategori.'); }
                          setCatSaving(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold hover:opacity-90"
                      >
                        {catSaving ? <Loader2 size={12} className="animate-spin" /> : 'Ya, Hapus'}
                      </button>
                      <button onClick={() => setDeleteCatConfirm(null)} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/80">Batal</button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-foreground">{cat.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">({productCount} produk)</span>
                      </div>
                      <button onClick={() => { setEditCatId(cat.id); setEditCatName(cat.name); }} className="p-2 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-accent-foreground transition-colors" title="Edit">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => setDeleteCatConfirm(cat.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Hapus">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
