import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAppState, formatNumber, unformatNumber, type Product, type ProductVariant, type Member, type Reward, type CustomerType } from '@/lib/store';
import { firestoreUpdateProduct, firestoreAddReceivable, firestoreAddMember, firestoreUpdateMember, firestoreAddSalesTransaction, atomicDeductStock, addDocument, atomicAddStock, type SalesTransaction } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { getTierFromSpending, generateMemberId } from '@/components/views/MemberManagementView';
import WhatsAppOrderView from './WhatsAppOrderView';
import { playTransactionSuccessSound } from '@/lib/notification-sounds';
import ReturView from './ReturView';
import {
  ShoppingCart, Plus, Minus, CreditCard, Clock, Search,
  ScanBarcode, Printer, X, Loader2, CheckCircle2, Users, UserPlus, Gift, Trash2, Info, Package, ImageOff, MessageCircle, RotateCcw, Split
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Helper: get the correct price based on customer type
function getProductPrice(product: Product, customerType?: CustomerType): number {
  if (!customerType || customerType === 'Regular') return product.price;
  if (customerType === 'Reseller' && product.price_reseller) return product.price_reseller;
  if (customerType === 'VVIP 1' && product.price_vvip1) return product.price_vvip1;
  if (customerType === 'VVIP 2' && product.price_vvip2) return product.price_vvip2;
  return product.price; // fallback to normal price
}

interface CartItem {
  id: string;
  productId: string;
  name: string;
  variantName?: string;
  sku: string;
  category: string;
  hpp: number;
  price: number;
  min_stock: number;
  stock_map: Record<string, number>;
  qty: number;
  maxQty: number;
}

interface CompletedTransaction {
  items: CartItem[];
  subtotal: number;
  discount: number;
  grandTotal: number;
  paymentMethod: string;
  amountPaid: number;
  change: number;
  timestamp: string;
  transactionId: string;
  store: string;
  cashierName: string;
  hutangCustomer?: string;
  hutangDp?: number;
  hutangDueDate?: string;
  giftNote?: string;
  splitCash?: number;
  splitTransfer?: number;
}

export default function POSView() {
  const { products, setProducts, promos, kasirStore, members, setMembers, memberSettings, rewards, receivables, setReceivables, addAuditLog, showMessage, storeProfiles } = useAppState();
  const { profile } = useAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [processing, setProcessing] = useState(false);
  const [completedTx, setCompletedTx] = useState<CompletedTransaction | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showWAOrder, setShowWAOrder] = useState(false);
  const [showRetur, setShowRetur] = useState(false);

  // Variant selection modal
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [amountPaid, setAmountPaid] = useState('');

  // Piutang modal
  const [showPiutangModal, setShowPiutangModal] = useState(false);
  const [hutangCustomer, setHutangCustomer] = useState('');
  const [hutangWa, setHutangWa] = useState('');
  const [hutangDueDate, setHutangDueDate] = useState('');
  const [hutangDp, setHutangDp] = useState('');

  // Gift modal
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftNote, setGiftNote] = useState('');

  // Split payment
  const [splitMode, setSplitMode] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  const [splitTransfer, setSplitTransfer] = useState('');

  // Member selection
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberSearch, setShowMemberSearch] = useState(false);
  const [showRegisterMember, setShowRegisterMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberAddress, setNewMemberAddress] = useState('');
  const [redeemedReward, setRedeemedReward] = useState<Reward | null>(null);

  useEffect(() => { searchInputRef.current?.focus(); }, []);

  // Get current customer type for pricing
  const currentCustomerType: CustomerType = selectedMember?.customer_type || 'Regular';

  // Recalculate cart prices when customer type changes
  useEffect(() => {
    if (cart.length === 0) return;
    setCart(prev => prev.map(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return item;
      const newPrice = getProductPrice(product, currentCustomerType);
      return { ...item, price: newPrice };
    }));
  }, [currentCustomerType]); // eslint-disable-line react-hooks/exhaustive-deps

  const memberResults = memberSearch.trim()
    ? members.filter(m =>
        m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
        m.member_id?.toLowerCase().includes(memberSearch.toLowerCase()) ||
        m.phone?.includes(memberSearch)
      ).slice(0, 5)
    : [];

  const storeProducts = products.filter(p => {
    // Show products that have store stock OR variant stock
    const storeStock = p.stock_map?.[kasirStore] || 0;
    return storeStock > 0;
  });
  const activePromos = promos.filter(p => new Date(p.end_date) >= new Date() && p.is_active);

  const filteredProducts = searchQuery.trim()
    ? storeProducts.filter(p =>
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.variants || []).some(v =>
          v.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : storeProducts;

  // --- Cart Logic ---
  const addToCartDirect = (product: Product, variant?: ProductVariant) => {
    const cartId = variant ? `${product.id}__${variant.name}` : product.id;
    const maxQty = product.stock_map[kasirStore] || 0; // simplified: use store stock
    const inCart = cart.find(item => item.id === cartId)?.qty || 0;

    if (inCart >= maxQty) {
      showMessage('Peringatan: Stok tidak mencukupi!');
      return;
    }

    const existing = cart.find(item => item.id === cartId);
    if (existing) {
      setCart(cart.map(item => item.id === cartId ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, {
        id: cartId,
        productId: product.id,
        name: product.name,
        variantName: variant?.name,
        sku: variant?.sku || product.sku,
        category: product.category,
        hpp: product.hpp,
        price: getProductPrice(product, currentCustomerType),
        min_stock: product.min_stock,
        stock_map: product.stock_map,
        qty: 1,
        maxQty,
      }]);
    }
  };

  const handleProductClick = (product: Product) => {
    if (product.variants && product.variants.length > 0) {
      setVariantProduct(product);
    } else {
      addToCartDirect(product);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id !== id) return item;
      const newQty = Math.max(0, item.qty + delta);
      if (newQty > item.maxQty) { showMessage('Stok tidak mencukupi!'); return item; }
      return { ...item, qty: newQty };
    }).filter(item => item.qty > 0));
  };

  const removeFromCart = (id: string) => setCart(cart.filter(item => item.id !== id));

  const getDiscount = (item: CartItem) => {
    const promo = activePromos.find(p => p.target === 'Semua Kategori' || p.target === item.category);
    if (!promo) return 0;
    if (promo.type === 'Persentase') return item.price * item.qty * (promo.value / 100);
    if (promo.type === 'Nominal') return promo.value * item.qty;
    if (promo.type === 'Buy1Get1') return Math.floor(item.qty / 2) * item.price;
    return 0;
  };

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const totalDiscount = cart.reduce((acc, item) => acc + getDiscount(item), 0);
  const redeemDiscount = redeemedReward?.type === 'discount' ? (redeemedReward.discount_value || 0) : 0;
  const grandTotal = Math.max(0, subtotal - totalDiscount - redeemDiscount);

  const paidNum = parseInt(unformatNumber(amountPaid)) || 0;
  const changeAmount = Math.max(0, paidNum - grandTotal);

  // Handle scan/search - auto-add on exact SKU match
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();

      // 1. Check exact barcode match on variants first (scanner priority)
      for (const p of storeProducts) {
        if (p.variants && p.variants.length > 0) {
          const matchedVariant = p.variants.find(v =>
            v.barcode?.toLowerCase() === query || v.sku?.toLowerCase() === query
          );
          if (matchedVariant) {
            // Check store stock before adding
            const storeStock = p.stock_map?.[kasirStore] || 0;
            const inCartForProduct = cart.filter(c => c.productId === p.id).reduce((sum, c) => sum + c.qty, 0);
            if (storeStock - inCartForProduct <= 0) {
              setSearchQuery('');
              showMessage('Stok produk ini di toko habis!');
              return;
            }
            addToCartDirect(p, matchedVariant);
            setSearchQuery('');
            showMessage(`✓ ${p.name} - ${matchedVariant.name} ditambahkan`);
            return;
          }
        }
      }

      // 2. Exact SKU match on product
      const exactMatch = storeProducts.find(p => p.sku.toLowerCase() === query);
      if (exactMatch) {
        handleProductClick(exactMatch);
        setSearchQuery('');
        if (!exactMatch.variants?.length) showMessage(`✓ ${exactMatch.name} ditambahkan`);
      } else if (filteredProducts.length === 1) {
        handleProductClick(filteredProducts[0]);
        setSearchQuery('');
        if (!filteredProducts[0].variants?.length) showMessage(`✓ ${filteredProducts[0].name} ditambahkan`);
      } else {
        showMessage('Produk tidak ditemukan!');
      }
    }
  };

  // --- Checkout handlers ---
  const processCheckout = async (method: string, opts?: { hutangCustomer?: string; hutangWa?: string; hutangDueDate?: string; hutangDp?: number; giftNote?: string; amountPaid?: number; splitCash?: number; splitTransfer?: number }) => {
    if (cart.length === 0) return;
    setProcessing(true);
    try {
      const txId = method === 'Gift/Owner' ? `GIFT-${Date.now().toString(36).toUpperCase()}` : `TX-${Date.now().toString(36).toUpperCase()}`;
      const now = new Date();
      const cashierName = profile?.displayName || 'Kasir';
      const isGift = method === 'Gift/Owner';
      const finalTotal = isGift ? 0 : grandTotal;
      let dpAmount = opts?.hutangDp || 0;

      // Piutang
      if (method === 'Hutang Tempo') {
        if (!opts?.hutangCustomer || !opts?.hutangDueDate) {
          showMessage('Peringatan: Nama pelanggan dan tanggal jatuh tempo wajib diisi!');
          setProcessing(false);
          return;
        }
        const recData = {
          customer_name: opts.hutangCustomer,
          customer_wa: opts.hutangWa || '',
          total: grandTotal,
          paid: dpAmount,
          due_date: opts.hutangDueDate,
          items: cart.map(c => `${c.name}${c.variantName ? ` (${c.variantName})` : ''} x${c.qty}`).join(', '),
          status: dpAmount >= grandTotal ? 'Lunas' : 'Belum Lunas',
          timestamp: now.toISOString(),
        };
        const recId = await firestoreAddReceivable(recData);
        setReceivables(prev => [...prev, { ...recData, id: recId }]);
        addAuditLog('Transaksi Hutang', `${txId} | Hutang Rp ${formatNumber(grandTotal - dpAmount)} dari ${opts.hutangCustomer}`);
      } else if (isGift) {
        const totalHpp = cart.reduce((acc, item) => acc + item.hpp * item.qty, 0);
        addAuditLog('Barang Keluar Gift/Owner', `${txId} | ${cart.map(c => `${c.name} x${c.qty}`).join(', ')} | ${opts?.giftNote} | HPP: Rp ${formatNumber(totalHpp)}`);
      } else {
        addAuditLog('Transaksi POS', `${txId} | Rp ${formatNumber(grandTotal)} via ${method}${selectedMember ? ` | Member: ${selectedMember.name}` : ''}`);
      }

      // Member points — only for Regular customers
      const isRegularCustomer = !selectedMember?.customer_type || selectedMember.customer_type === 'Regular';
      if (selectedMember && redeemedReward && isRegularCustomer) {
        const newPoints = Math.max(0, (selectedMember.points || 0) - redeemedReward.points_cost);
        await firestoreUpdateMember(selectedMember.id, { points: newPoints });
        setMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, points: newPoints } : m));
      }
      if (selectedMember && isRegularCustomer && !isGift && grandTotal >= (memberSettings?.min_spending_for_points || 100000)) {
        const pointsToAdd = memberSettings?.points_per_transaction || 1;
        const currentPoints = redeemedReward ? Math.max(0, (selectedMember.points || 0) - redeemedReward.points_cost) : (selectedMember.points || 0);
        const newSpending = (selectedMember.total_spending || 0) + grandTotal;
        const newPoints = currentPoints + pointsToAdd;
        const newTier = getTierFromSpending(newSpending, memberSettings);
        await firestoreUpdateMember(selectedMember.id, { points: newPoints, total_spending: newSpending, tier: newTier });
        setMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, points: newPoints, total_spending: newSpending, tier: newTier } : m));
      }

      // Deduct stock ATOMICALLY using Firestore Transaction
      try {
        await atomicDeductStock(
          cart.map(cartItem => ({
            productId: cartItem.productId,
            qty: cartItem.qty,
            store: kasirStore,
          }))
        );
        // Update local state after successful atomic deduction
        for (const cartItem of cart) {
          setProducts(prev => prev.map(p => p.id === cartItem.productId
            ? { ...p, stock_map: { ...p.stock_map, [kasirStore]: (p.stock_map[kasirStore] || 0) - cartItem.qty } }
            : p
          ));
        }
      } catch (stockError: any) {
        showMessage(`Gagal: ${stockError.message || 'Stok bentrok dengan kasir lain. Coba lagi.'}`);
        setProcessing(false);
        return;
      }

      // Save transaction with DENORMALIZED data (hardcopy product info at transaction time)
      const txData: any = {
        transaction_id: txId,
        store: kasirStore,
        cashier_name: cashierName,
        items: cart.map(c => ({
          product_id: c.productId,
          sku: c.sku,
          name: c.name + (c.variantName ? ` - ${c.variantName}` : ''),
          variant_name: c.variantName || null,
          qty: c.qty,
          price: c.price,
          hpp: c.hpp,
          subtotal: c.price * c.qty,
          category: c.category,
        })),
        subtotal: isGift ? 0 : subtotal,
        discount: isGift ? 0 : totalDiscount + redeemDiscount,
        grand_total: finalTotal,
        payment_method: method,
        member_name: selectedMember?.name,
        member_id: selectedMember?.member_id,
        customer_type: currentCustomerType,
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        total_hpp: cart.reduce((a, c) => a + c.hpp * c.qty, 0),
      };
      if (isGift) {
        txData.transaction_type = 'Gift_Owner';
        txData.gift_note = opts?.giftNote;
      }
      if (method === 'Split') {
        txData.split_cash = opts?.splitCash || 0;
        txData.split_transfer = opts?.splitTransfer || 0;
      }
      await firestoreAddSalesTransaction(txData);
      playTransactionSuccessSound();

      setCompletedTx({
        items: [...cart],
        subtotal: isGift ? 0 : subtotal,
        discount: isGift ? 0 : totalDiscount + redeemDiscount,
        grandTotal: finalTotal,
        paymentMethod: method,
        amountPaid: opts?.amountPaid || 0,
        change: isGift ? 0 : Math.max(0, (opts?.amountPaid || 0) - finalTotal),
        timestamp: now.toISOString(),
        transactionId: txId,
        store: kasirStore,
        cashierName,
        hutangCustomer: method === 'Hutang Tempo' ? opts?.hutangCustomer : undefined,
        hutangDp: method === 'Hutang Tempo' ? dpAmount : undefined,
        hutangDueDate: method === 'Hutang Tempo' ? opts?.hutangDueDate : undefined,
        giftNote: isGift ? opts?.giftNote : undefined,
        splitCash: method === 'Split' ? opts?.splitCash : undefined,
        splitTransfer: method === 'Split' ? opts?.splitTransfer : undefined,
      });

      showMessage(`Berhasil: Transaksi ${txId} selesai!`);
      setCart([]);
      setSelectedMember(null);
      setRedeemedReward(null);
      setShowPayModal(false);
      setShowPiutangModal(false);
      setShowGiftModal(false);
      setAmountPaid('');
      setSplitMode(false); setSplitCash(''); setSplitTransfer('');
      setHutangCustomer(''); setHutangWa(''); setHutangDueDate(''); setHutangDp('');
      setGiftNote('');
    } catch {
      showMessage('Gagal memproses transaksi!');
    } finally {
      setProcessing(false);
    }
  };

  // --- Receipt printer ---
  const printReceipt = () => {
    if (!completedTx) return;
    const tx = completedTx;
    const storeProfile = storeProfiles.find(p => p.store_name === tx.store);
    const isPiutangOrGift = tx.paymentMethod === 'Hutang Tempo' || tx.paymentMethod === 'Gift/Owner';
    const dashes = '--------------------------------';

    const receiptHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Struk ${tx.transactionId}</title>
<style>
  @page { margin: 0; size: 58mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', 'Lucida Console', monospace; font-size: 11px; width: 218px; margin: 0 auto; padding: 8px; color: #000; background: #fff; line-height: 1.35; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .row { display: flex; justify-content: space-between; }
  .dashes { text-align: center; letter-spacing: -1px; color: #555; margin: 4px 0; font-size: 10px; }
  .store-name { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
  .total-row { font-size: 14px; font-weight: bold; }
  .item-name { font-weight: bold; font-size: 11px; }
  .small { font-size: 9px; }
  .footer-msg { font-size: 9px; line-height: 1.3; margin-top: 4px; }
  @media print { body { width: 58mm; } .no-print { display: none !important; } }
</style></head><body>
  <div class="center store-name">DALWA.CO</div>
  <div class="center bold" style="font-size:10px;margin-top:2px">Cabang: ${tx.store}</div>
  ${storeProfile?.address ? `<div class="center small" style="margin-top:2px">${storeProfile.address}</div>` : ''}
  ${storeProfile?.npwp ? `<div class="center small">NPWP: ${storeProfile.npwp}</div>` : ''}
  <div class="dashes">${dashes}</div>
  <div class="row small"><span>Tanggal</span><span>${new Date(tx.timestamp).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span></div>
  <div class="row small"><span>Jam</span><span>${new Date(tx.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span></div>
  <div class="row small"><span>No. Struk</span><span>${tx.transactionId}</span></div>
  <div class="row small"><span>Kasir</span><span>${tx.cashierName}</span></div>
  <div class="dashes">${dashes}</div>
  ${tx.items.map(item => `
    <div class="item-name">${item.name}${item.variantName ? ` - ${item.variantName}` : ''}</div>
    <div class="row"><span>${item.qty} x Rp ${formatNumber(item.price)}</span><span>Rp ${formatNumber(item.price * item.qty)}</span></div>
  `).join('')}
  <div class="dashes">${dashes}</div>
  ${tx.discount > 0 ? `<div class="row"><span>Diskon</span><span>-Rp ${formatNumber(tx.discount)}</span></div>` : ''}
  <div class="row total-row"><span>TOTAL</span><span>Rp ${formatNumber(tx.grandTotal)}</span></div>
  <div class="dashes">${dashes}</div>
  <div class="row small"><span>Tipe Bayar</span><span>${tx.paymentMethod}</span></div>
  ${tx.paymentMethod === 'Split' ? `
    <div class="row small"><span>Tunai</span><span>Rp ${formatNumber(tx.splitCash || 0)}</span></div>
    <div class="row small"><span>Transfer</span><span>Rp ${formatNumber(tx.splitTransfer || 0)}</span></div>
  ` : !isPiutangOrGift ? `
    <div class="row small"><span>Bayar</span><span>Rp ${formatNumber(tx.amountPaid)}</span></div>
    <div class="row small bold"><span>Kembalian</span><span>Rp ${formatNumber(tx.change)}</span></div>
  ` : ''}
  ${tx.hutangCustomer ? `
    <div class="dashes">${dashes}</div>
    <div class="center bold" style="font-size:10px">*** HUTANG TEMPO ***</div>
    <div class="row small"><span>Pelanggan</span><span>${tx.hutangCustomer}</span></div>
    <div class="row small"><span>DP</span><span>Rp ${formatNumber(tx.hutangDp || 0)}</span></div>
    <div class="row small bold"><span>Sisa</span><span>Rp ${formatNumber(tx.grandTotal - (tx.hutangDp || 0))}</span></div>
    <div class="row small"><span>Jatuh Tempo</span><span>${tx.hutangDueDate}</span></div>
  ` : ''}
  ${tx.giftNote ? `
    <div class="dashes">${dashes}</div>
    <div class="center bold small">*** GIFT / OWNER ***</div>
    <div class="center small">${tx.giftNote}</div>
  ` : ''}
  <div class="dashes">${dashes}</div>
  <div class="center footer-msg">Terima Kasih Telah Mempercayakan<br>Gaya Anda pada Kami!</div>
  <div class="center footer-msg">Kami harap Anda menyukai koleksi ini.<br>Mohon maaf, produk yang telah dibeli<br>belum dapat ditukar atau dikembalikan.</div>
  <div class="center footer-msg" style="margin-top:4px">IG: @dalwacollection.co<br>WEB: www.dalwacollection.com</div>
  <div style="margin-bottom:20px"></div>
</body></html>`;

    const printWindow = window.open('', '_blank', 'width=280,height=600');
    if (printWindow) {
      printWindow.document.write(receiptHtml);
      printWindow.document.close();
      setTimeout(() => { printWindow.print(); }, 300);
    }
  };

  if (showWAOrder) {
    return <WhatsAppOrderView onBack={() => setShowWAOrder(false)} />;
  }
  if (showRetur) {
    return <ReturView onBack={() => setShowRetur(false)} />;
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col gap-4 animate-fade-in">
      {/* WA Order & Retur Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setShowWAOrder(true)}
          className="px-4 py-2 rounded-xl bg-success/10 border border-success/30 text-success font-bold text-xs flex items-center gap-2 hover:bg-success/20 transition-colors"
        >
          <MessageCircle size={14} /> Pesanan WhatsApp
        </button>
        <button
          onClick={() => setShowRetur(true)}
          className="px-4 py-2 rounded-xl bg-warning/10 border border-warning/30 text-warning font-bold text-xs flex items-center gap-2 hover:bg-warning/20 transition-colors"
        >
          <RotateCcw size={14} /> Retur / Tukar
        </button>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
      {/* ===== LEFT: Catalog (65%) ===== */}
      <div className="w-[65%] flex flex-col gap-4 min-h-0">
        {/* Search Bar */}
        <div className="relative">
          <ScanBarcode size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" />
          <input
            ref={searchInputRef}
            className="w-full h-14 pl-12 pr-12 rounded-2xl border-2 border-border bg-card text-foreground text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all placeholder:text-muted-foreground/60"
            placeholder="Scan barcode / ketik SKU / nama produk..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          )}
        </div>

        {activePromos.length > 0 && (
          <div className="px-4 py-2.5 rounded-xl bg-warning/10 border border-warning/30 text-xs font-semibold text-warning">
            🎉 Promo Aktif: {activePromos.map(p => p.promo_name).join(', ')}
          </div>
        )}

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {searchQuery && filteredProducts.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <Search size={32} className="mx-auto mb-3 opacity-30" />
              Produk "{searchQuery}" tidak ditemukan di {kasirStore}.
            </div>
          )}
          <TooltipProvider delayDuration={200}>
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredProducts.map(p => {
                const storeStock = p.stock_map[kasirStore] || 0;
                const inCart = cart.filter(c => c.productId === p.id).reduce((sum, c) => sum + c.qty, 0);
                return (
                  <button
                    key={p.id}
                    onClick={() => handleProductClick(p)}
                    className="relative rounded-2xl border border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all text-left group overflow-hidden"
                  >
                    {/* Cart badge */}
                    {inCart > 0 && (
                      <span className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{inCart}×</span>
                    )}
                    {/* Product Knowledge icon */}
                    {p.notes && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full bg-card/90 border border-border flex items-center justify-center text-muted-foreground hover:text-primary cursor-help" onClick={e => e.stopPropagation()}>
                            <Info size={13} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[250px] text-xs leading-relaxed">
                          <p className="font-bold text-foreground mb-1">📋 Catatan Kasir</p>
                          <p className="text-muted-foreground whitespace-pre-wrap">{p.notes}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* Thumbnail */}
                    <div className="w-full aspect-square bg-muted/20 flex items-center justify-center overflow-hidden rounded-t-2xl">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground/40">
                          <ImageOff size={32} />
                          <span className="text-[9px] font-medium tracking-wide uppercase">No Image</span>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <p className="font-bold text-sm text-foreground truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{p.sku}</p>
                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <p className="font-extrabold text-foreground text-sm">Rp {formatNumber(getProductPrice(p, currentCustomerType))}</p>
                          {currentCustomerType !== 'Regular' && getProductPrice(p, currentCustomerType) !== p.price && (
                            <p className="text-[9px] text-muted-foreground line-through">Rp {formatNumber(p.price)}</p>
                          )}
                        </div>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${storeStock <= (p.min_stock || 3) ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                          Stok: {storeStock}
                        </span>
                      </div>
                      {p.variants && p.variants.length > 0 && (
                        <p className="text-[10px] text-primary mt-1 font-semibold">{p.variants.length} varian →</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* ===== RIGHT: Cart (35%) ===== */}
      <div className="w-[35%] flex flex-col gap-3 min-h-0">
        {/* Member */}
        <div className="rounded-2xl border border-border bg-card p-3.5">
          <p className="text-[10px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wider"><Users size={12} /> Pelanggan</p>
          {selectedMember ? (
            <div className="flex items-center justify-between p-2 rounded-xl bg-primary/5 border border-primary/20">
              <div>
                <p className="font-bold text-xs text-foreground">{selectedMember.name}</p>
                <p className="text-[10px] text-muted-foreground">ID: {selectedMember.member_id} • {selectedMember.customer_type || 'Regular'}{selectedMember.customer_type === 'Regular' || !selectedMember.customer_type ? ` • ${selectedMember.points} poin • ${selectedMember.tier}` : ''}</p>
                {selectedMember.customer_type && selectedMember.customer_type !== 'Regular' && (
                  <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">Harga {selectedMember.customer_type}</span>
                )}
              </div>
              <button onClick={() => { setSelectedMember(null); setRedeemedReward(null); }} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <input className="input-field text-[11px] flex-1 !py-2" placeholder="Cari member..."
                  value={memberSearch} onChange={e => { setMemberSearch(e.target.value); setShowMemberSearch(true); }} onFocus={() => setShowMemberSearch(true)} />
                <button onClick={() => setShowRegisterMember(true)} className="px-2.5 py-1.5 rounded-xl bg-success/90 text-success-foreground text-[10px] font-bold flex items-center gap-1 hover:opacity-90 shrink-0">
                  <UserPlus size={11} />
                </button>
              </div>
              {showMemberSearch && memberResults.length > 0 && (
                <div className="border border-border rounded-xl bg-card shadow-lg divide-y divide-border/50 max-h-32 overflow-y-auto">
                  {memberResults.map(m => (
                    <button key={m.id} onClick={() => { setSelectedMember(m); setMemberSearch(''); setShowMemberSearch(false); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-muted/30 transition-colors">
                      <p className="text-[11px] font-bold text-foreground">{m.name}</p>
                      <p className="text-[10px] text-muted-foreground">{m.member_id} • {m.customer_type || 'Regular'} • {m.tier}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Redeem Poin — only for Regular customers */}
        {selectedMember && (!selectedMember.customer_type || selectedMember.customer_type === 'Regular') && selectedMember.points > 0 && (
          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3.5">
            <p className="text-[10px] font-bold text-warning mb-2 flex items-center gap-1.5 uppercase tracking-wider"><Gift size={12} /> Tukar Poin ({selectedMember.points})</p>
            {redeemedReward ? (
              <div className="flex items-center justify-between p-2 rounded-xl bg-warning/10 border border-warning/20">
                <div>
                  <p className="font-bold text-[11px] text-foreground">{redeemedReward.name}</p>
                  <p className="text-[10px] text-muted-foreground">{redeemedReward.type === 'discount' ? `Diskon Rp ${formatNumber(redeemedReward.discount_value || 0)}` : redeemedReward.gift_description}</p>
                </div>
                <button onClick={() => setRedeemedReward(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
              </div>
            ) : (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {rewards.filter(r => r.is_active && r.points_cost <= (selectedMember?.points || 0)).map(r => (
                  <button key={r.id} onClick={() => setRedeemedReward(r)} className="w-full text-left px-2.5 py-1.5 rounded-lg border border-border bg-card hover:border-warning transition-colors">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-foreground">{r.name}</p>
                      <span className="text-[10px] font-bold text-warning">🏆 {r.points_cost}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cart Items */}
        <div className="flex-1 rounded-2xl border border-border bg-card flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2"><ShoppingCart size={16} /> Keranjang</h3>
            <span className="text-xs text-muted-foreground">{cart.length} item</span>
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
              <div className="text-center">
                <Package size={28} className="mx-auto mb-2 opacity-20" />
                Scan atau pilih produk
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/20 border border-border/50">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs text-foreground truncate">{item.name}</p>
                    {item.variantName && <p className="text-[10px] text-primary font-medium">{item.variantName}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">Rp {formatNumber(item.price)} × {item.qty} = <span className="font-bold text-foreground">Rp {formatNumber(item.price * item.qty)}</span></p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"><Minus size={11} /></button>
                    <span className="text-xs font-bold w-5 text-center">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"><Plus size={11} /></button>
                    <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 rounded-lg flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors ml-0.5"><Trash2 size={11} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary & Buttons */}
          {cart.length > 0 && (
            <div className="shrink-0 border-t border-border p-4 space-y-3">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>Rp {formatNumber(subtotal)}</span></div>
                {totalDiscount > 0 && <div className="flex justify-between text-success font-semibold"><span>Diskon Promo</span><span>-Rp {formatNumber(totalDiscount)}</span></div>}
                {redeemDiscount > 0 && <div className="flex justify-between text-warning font-semibold"><span>🏆 Redeem</span><span>-Rp {formatNumber(redeemDiscount)}</span></div>}
                <div className="flex justify-between text-base font-extrabold text-foreground pt-1.5 border-t border-border"><span>Total</span><span>Rp {formatNumber(grandTotal)}</span></div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setShowPayModal(true)}
                  disabled={processing}
                  className="w-full py-3 rounded-xl bg-success text-success-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <CreditCard size={16} /> Bayar (Tunai/QRIS) Rp {formatNumber(grandTotal)}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowPiutangModal(true)}
                    disabled={processing}
                    className="py-2.5 rounded-xl bg-warning text-warning-foreground font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <Clock size={13} /> Catat Piutang
                  </button>
                  <button
                    onClick={() => setShowGiftModal(true)}
                    disabled={processing}
                    className="py-2.5 rounded-xl border border-destructive/40 text-destructive font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-destructive/5 transition-colors disabled:opacity-50"
                  >
                    <Gift size={13} /> Gift / Owner
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== MODALS ===== */}

      {/* Variant Selection Modal */}
      {variantProduct && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setVariantProduct(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-bold text-foreground text-sm">Pilih Varian</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{variantProduct.name}</p>
              </div>
              <button onClick={() => setVariantProduct(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-2.5 max-h-80 overflow-y-auto">
              {(variantProduct.variants || []).map((v, i) => {
                // Use store stock from stock_map, not warehouse variant stock
                const storeStockTotal = variantProduct.stock_map?.[kasirStore] || 0;
                const inCartForProduct = cart.filter(c => c.productId === variantProduct.id).reduce((sum, c) => sum + c.qty, 0);
                const availableStock = storeStockTotal - inCartForProduct;
                const varStock = availableStock > 0 ? availableStock : 0;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (varStock <= 0) { showMessage('Stok produk ini di toko habis!'); return; }
                      addToCartDirect(variantProduct, v);
                      showMessage(`✓ ${variantProduct.name} - ${v.name} ditambahkan`);
                      setVariantProduct(null);
                    }}
                    disabled={varStock <= 0}
                    className={`p-3.5 rounded-xl border text-left transition-all ${varStock <= 0 ? 'opacity-40 cursor-not-allowed border-border bg-muted/20' : 'border-border bg-card hover:border-primary hover:shadow-md'}`}
                  >
                    <p className="font-bold text-sm text-foreground">{v.name}</p>
                    {v.sku && <p className="text-[10px] text-muted-foreground">{v.sku}</p>}
                    <p className={`text-xs mt-1.5 font-semibold ${varStock <= 0 ? 'text-destructive' : 'text-success'}`}>
                      Sisa: {varStock} pcs
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowPayModal(false); setSplitMode(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="font-bold text-foreground text-sm">Pembayaran</h3>
              <p className="text-2xl font-extrabold text-foreground mt-2">Rp {formatNumber(grandTotal)}</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Mode Toggle */}
              <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
                <button onClick={() => setSplitMode(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!splitMode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                  Tunai / QRIS
                </button>
                <button onClick={() => setSplitMode(true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${splitMode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                  <Split size={12} /> Split Payment
                </button>
              </div>

              {!splitMode ? (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">Uang Diterima (Rp)</label>
                    <input
                      className="input-field mt-1.5 text-xl font-bold text-center !h-14"
                      value={amountPaid ? formatNumber(amountPaid) : ''}
                      onChange={e => setAmountPaid(unformatNumber(e.target.value))}
                      placeholder="0"
                      autoFocus
                    />
                  </div>
                  {paidNum > 0 && paidNum >= grandTotal && (
                    <div className="p-3 rounded-xl bg-success/10 border border-success/30 text-center">
                      <p className="text-xs text-muted-foreground">Kembalian</p>
                      <p className="text-2xl font-extrabold text-success">Rp {formatNumber(changeAmount)}</p>
                    </div>
                  )}
                  {paidNum > 0 && paidNum < grandTotal && (
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-center">
                      <p className="text-xs text-destructive font-semibold">Uang kurang Rp {formatNumber(grandTotal - paidNum)}</p>
                    </div>
                  )}
                  {/* Quick amount buttons */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {[grandTotal, Math.ceil(grandTotal / 10000) * 10000, Math.ceil(grandTotal / 50000) * 50000, 50000, 100000, 200000].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6).map(amt => (
                      <button key={amt} onClick={() => setAmountPaid(amt.toString())}
                        className="py-2 rounded-lg bg-muted/50 border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                        {formatNumber(amt)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">Nominal Tunai (Rp)</label>
                    <input
                      className="input-field mt-1.5 text-lg font-bold text-center !h-12"
                      value={splitCash ? formatNumber(splitCash) : ''}
                      onChange={e => setSplitCash(unformatNumber(e.target.value))}
                      placeholder="0"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">Nominal Transfer / Debit (Rp)</label>
                    <input
                      className="input-field mt-1.5 text-lg font-bold text-center !h-12"
                      value={splitTransfer ? formatNumber(splitTransfer) : ''}
                      onChange={e => setSplitTransfer(unformatNumber(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  {(() => {
                    const cashVal = parseInt(unformatNumber(splitCash)) || 0;
                    const transferVal = parseInt(unformatNumber(splitTransfer)) || 0;
                    const splitTotal = cashVal + transferVal;
                    const diff = splitTotal - grandTotal;
                    return (
                      <div className={`p-3 rounded-xl border text-center ${diff === 0 ? 'bg-success/10 border-success/30' : diff > 0 ? 'bg-warning/10 border-warning/30' : 'bg-destructive/10 border-destructive/30'}`}>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Tunai + Transfer = Rp {formatNumber(splitTotal)}</p>
                        {diff === 0 && <p className="text-sm font-bold text-success">✓ Pas!</p>}
                        {diff > 0 && <p className="text-sm font-bold text-warning">Kelebihan Rp {formatNumber(diff)}</p>}
                        {diff < 0 && <p className="text-sm font-bold text-destructive">Kurang Rp {formatNumber(Math.abs(diff))}</p>}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
            <div className="p-5 pt-0 grid grid-cols-2 gap-2">
              {!splitMode ? (
                <>
                  <button
                    onClick={() => processCheckout('Tunai', { amountPaid: paidNum })}
                    disabled={processing || paidNum < grandTotal}
                    className="py-3 rounded-xl bg-success text-success-foreground font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {processing ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} Tunai
                  </button>
                  <button
                    onClick={() => processCheckout('QRIS', { amountPaid: grandTotal })}
                    disabled={processing}
                    className="py-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {processing ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} QRIS
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    const cashVal = parseInt(unformatNumber(splitCash)) || 0;
                    const transferVal = parseInt(unformatNumber(splitTransfer)) || 0;
                    if (cashVal + transferVal < grandTotal) { showMessage('Total Tunai + Transfer harus sama dengan Total Tagihan!'); return; }
                    processCheckout('Split', { amountPaid: grandTotal, splitCash: cashVal, splitTransfer: transferVal });
                  }}
                  disabled={processing || ((parseInt(unformatNumber(splitCash)) || 0) + (parseInt(unformatNumber(splitTransfer)) || 0)) < grandTotal}
                  className="col-span-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {processing ? <Loader2 size={14} className="animate-spin" /> : <Split size={14} />} Bayar Split
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Piutang Modal */}
      {showPiutangModal && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPiutangModal(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2"><Clock size={16} className="text-warning" /> Catat Piutang</h3>
              <button onClick={() => setShowPiutangModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-center p-3 rounded-xl bg-warning/10 border border-warning/30">
                <p className="text-xs text-muted-foreground">Total Piutang</p>
                <p className="text-xl font-extrabold text-warning">Rp {formatNumber(grandTotal)}</p>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Nama Pelanggan *</label>
                <input className="input-field mt-1 text-xs" value={hutangCustomer} onChange={e => setHutangCustomer(e.target.value)} placeholder="Nama lengkap" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">No. WhatsApp</label>
                <input className="input-field mt-1 text-xs" value={hutangWa} onChange={e => setHutangWa(e.target.value)} placeholder="08xxxxxxxxxx" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Tanggal Jatuh Tempo *</label>
                <input className="input-field mt-1 text-xs" type="date" value={hutangDueDate} onChange={e => setHutangDueDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Uang Muka / DP (Rp)</label>
                <input className="input-field mt-1 text-xs" value={hutangDp ? formatNumber(hutangDp) : ''} onChange={e => setHutangDp(unformatNumber(e.target.value))} placeholder="0" />
              </div>
            </div>
            <div className="p-5 pt-0">
              <button
                onClick={() => processCheckout('Hutang Tempo', { hutangCustomer, hutangWa, hutangDueDate, hutangDp: hutangDp ? parseInt(unformatNumber(hutangDp)) : 0 })}
                disabled={processing || !hutangCustomer.trim() || !hutangDueDate}
                className="w-full py-3 rounded-xl bg-warning text-warning-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {processing ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />} Konfirmasi Piutang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gift Modal */}
      {showGiftModal && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowGiftModal(false); setGiftNote(''); }}>
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2"><Gift size={16} className="text-destructive" /> Gift / Diambil Owner</h3>
              <button onClick={() => { setShowGiftModal(false); setGiftNote(''); }} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20 text-xs text-destructive font-medium">
                ⚠️ Barang keluar <strong>tanpa pembayaran</strong> (Rp 0). HPP tercatat untuk laporan.
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.id} className="flex justify-between text-[11px] px-2 py-1.5 rounded-lg bg-muted/30">
                    <span className="text-foreground">{item.name}{item.variantName ? ` (${item.variantName})` : ''} × {item.qty}</span>
                    <span className="text-muted-foreground">HPP: Rp {formatNumber(item.hpp * item.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs font-bold border-t border-border pt-2">
                <span>Total HPP</span>
                <span className="text-destructive">Rp {formatNumber(cart.reduce((a, c) => a + c.hpp * c.qty, 0))}</span>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Keterangan / Nama Penerima *</label>
                <input className="input-field mt-1 text-xs" value={giftNote} onChange={e => setGiftNote(e.target.value)} placeholder="Contoh: Hadiah untuk Bapak X" />
              </div>
            </div>
            <div className="p-5 pt-0">
              <button
                onClick={() => processCheckout('Gift/Owner', { giftNote: giftNote.trim() })}
                disabled={processing || !giftNote.trim()}
                className="w-full py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {processing ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />} Konfirmasi (Rp 0)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register Member Modal */}
      {showRegisterMember && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl animate-fade-in">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground text-sm">Daftarkan Member Baru</h3>
              <button onClick={() => setShowRegisterMember(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="text-[11px] font-semibold text-muted-foreground">Nama *</label>
                <input className="input-field mt-1 text-xs" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="Nama lengkap" /></div>
              <div><label className="text-[11px] font-semibold text-muted-foreground">No. Telepon / WA</label>
                <input className="input-field mt-1 text-xs" value={newMemberPhone} onChange={e => setNewMemberPhone(e.target.value)} placeholder="08xxxxxxxxxx" /></div>
              <div><label className="text-[11px] font-semibold text-muted-foreground">Alamat</label>
                <input className="input-field mt-1 text-xs" value={newMemberAddress} onChange={e => setNewMemberAddress(e.target.value)} placeholder="Alamat (opsional)" /></div>
            </div>
            <div className="p-5 pt-0">
              <button onClick={async () => {
                if (!newMemberName.trim()) { showMessage('Peringatan: Nama wajib diisi!'); return; }
                const memberId = generateMemberId();
                const newM: Omit<Member, 'id'> = {
                  member_id: memberId, name: newMemberName.trim(), phone: newMemberPhone.trim(),
                  address: newMemberAddress.trim(), store_name: '', tier: 'Warga', customer_type: 'Regular', points: 0,
                  total_spending: 0, wa: newMemberPhone.trim(), timestamp: new Date().toISOString(),
                };
                const id = await firestoreAddMember(newM);
                const created = { ...newM, id };
                setMembers(prev => [...prev, created]);
                setSelectedMember(created);
                addAuditLog('Daftar Member (POS)', `${newMemberName} (${memberId})`);
                showMessage(`Berhasil: Member ${newMemberName} terdaftar!`);
                setNewMemberName(''); setNewMemberPhone(''); setNewMemberAddress('');
                setShowRegisterMember(false);
              }} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
                Daftarkan & Pilih
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Success Modal */}
      {completedTx && (
        <div className="fixed inset-0 z-50 bg-foreground/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border text-center">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={24} className="text-success" />
              </div>
              <h3 className="font-bold text-foreground">Transaksi Berhasil!</h3>
              <p className="text-xs text-muted-foreground mt-1">{completedTx.transactionId}</p>
            </div>

            {/* Mini receipt preview */}
            <div className="mx-5 mt-4 p-4 rounded-xl bg-white text-black border border-border/30" style={{ fontFamily: "'Courier New', monospace", fontSize: '11px' }}>
              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px' }}>DALWA.CO</div>
              <div style={{ textAlign: 'center', fontSize: '10px' }}>Cabang: {completedTx.store}</div>
              <div style={{ textAlign: 'center', fontSize: '9px', color: '#666', margin: '2px 0 4px' }}>
                {new Date(completedTx.timestamp).toLocaleString('id-ID')}
              </div>
              <div style={{ borderTop: '1px dashed #999', margin: '4px 0' }} />
              <div style={{ fontSize: '9px' }}>No: {completedTx.transactionId} | Kasir: {completedTx.cashierName}</div>
              <div style={{ borderTop: '1px dashed #999', margin: '4px 0' }} />
              {completedTx.items.map((item, i) => (
                <div key={i} style={{ marginBottom: '3px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '10px' }}>{item.name}{item.variantName ? ` - ${item.variantName}` : ''}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span>{item.qty} x Rp {formatNumber(item.price)}</span>
                    <span>Rp {formatNumber(item.price * item.qty)}</span>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px dashed #999', margin: '4px 0' }} />
              {completedTx.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span>Diskon</span><span>-Rp {formatNumber(completedTx.discount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px' }}>
                <span>TOTAL</span><span>Rp {formatNumber(completedTx.grandTotal)}</span>
              </div>
              <div style={{ borderTop: '1px dashed #999', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span>Bayar</span><span>{completedTx.paymentMethod}</span>
              </div>
              {completedTx.paymentMethod === 'Split' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span>Tunai</span><span>Rp {formatNumber(completedTx.splitCash || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span>Transfer</span><span>Rp {formatNumber(completedTx.splitTransfer || 0)}</span>
                  </div>
                </>
              ) : completedTx.paymentMethod !== 'Hutang Tempo' && completedTx.paymentMethod !== 'Gift/Owner' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span>Tunai</span><span>Rp {formatNumber(completedTx.amountPaid)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold' }}>
                    <span>Kembali</span><span>Rp {formatNumber(completedTx.change)}</span>
                  </div>
                </>
              ) : null}
              <div style={{ borderTop: '1px dashed #999', margin: '4px 0' }} />
              <div style={{ textAlign: 'center', fontSize: '9px', lineHeight: '1.3' }}>
                Terima Kasih Telah Mempercayakan<br />Gaya Anda pada Kami!
              </div>
            </div>

            <div className="p-5 space-y-2">
              <button onClick={printReceipt} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                <Printer size={16} /> Cetak Struk
              </button>
              <button onClick={() => { setCompletedTx(null); searchInputRef.current?.focus(); }} className="w-full py-2.5 rounded-xl bg-muted text-muted-foreground font-semibold text-xs hover:bg-muted/80 transition-colors">
                Tutup & Transaksi Baru
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
