import React, { useEffect, useState } from 'react';
import { ShoppingBag, User, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
  stock: number;
}

interface CartItem extends Product {
  qty: number;
}

interface DemoUser {
  id: string;
  phone: string;
  name: string;
}

interface OrderRecord {
  orderId: string;
  total: number;
  createdAt: string;
}

export function DemoStorefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [user, setUser] = useState<DemoUser | null>(null);

  const [authOpen, setAuthOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [couponInput, setCouponInput] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [shippingAddress, setShippingAddress] = useState('');

  useEffect(() => {
    fetch('/demo-api/products')
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .catch(() => {});
  }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch('/demo-api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || 'Failed to send OTP');
      return;
    }
    setOtpSent(true);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch('/demo-api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneInput, otp: otpInput, name: nameInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || 'OTP verification failed');
      return;
    }
    setUser(data.user);
    setAuthOpen(false);
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  // Intentionally allows negative / zero values to demonstrate Veriflow cart abuse detection
  const updateQty = (id: string, rawVal: string) => {
    const parsed = Number(rawVal);
    if (Number.isNaN(parsed)) return;
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: parsed } : i)));
  };

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const total = subtotal * (1 - discountPercent / 100);

  const handleApplyCoupon = async () => {
    setCheckoutError(null);
    const res = await fetch('/demo-api/coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: couponInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCheckoutError(data.error || `Coupon request failed (${res.status})`);
      return;
    }
    setDiscountPercent(data.discountPercent || 0);
  };

  // Intentionally does NOT disable button during async submit so rapid double-clicks create duplicate orders
  const handlePlaceOrder = async () => {
    setCheckoutError(null);
    const res = await fetch('/demo-api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: user?.phone || '',
        items: cart,
        total,
        coupon: couponInput || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCheckoutError(data.error || 'Order submission failed');
      return;
    }
    setOrders((prev) => [...prev, data.order]);
  };

  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#181615]">
      {/* Storefront Header */}
      <header className="border-b border-[#E8E3DC] bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <span className="font-display text-lg font-bold tracking-tight">Kanso Goods</span>
            <a href="/" className="text-xs text-[#5E5851] hover:text-[#181615]">
              Back to Veriflow QA
            </a>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <span className="text-xs font-mono text-[#15803D] inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {user.name} ({user.phone})
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="px-3.5 py-2 text-xs font-medium border border-[#E8E3DC] rounded-lg hover:border-[#181615] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <User className="w-3.5 h-3.5" />
                Sign In / Sign Up
              </button>
            )}

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="px-4 py-2 text-xs font-medium bg-[#181615] text-[#FAF8F5] rounded-lg hover:bg-[#2F2B28] inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Cart ({totalItems})
            </button>
          </div>
        </div>
      </header>

      {/* Main Catalog */}
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <div className="max-w-xl space-y-2">
          <div className="text-xs text-[#5E5851]">Sandbox E-Commerce Target · Master OTP 123456</div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Architectural Coffee & Tableware
          </h1>
          <p className="text-sm text-[#5E5851]">
            Interactive test storefront with real Phone + OTP signup, cart state, coupon endpoints, and deliberate QA edge cases for Veriflow to uncover.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-white border border-[#E8E3DC] rounded-xl overflow-hidden flex flex-col justify-between"
            >
              <div className="aspect-[4/3] bg-[#F4F0EA] overflow-hidden">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="text-xs text-[#8B847B]">{product.category}</div>
                  <h2 className="text-sm font-semibold text-[#181615]">{product.name}</h2>
                  <div className="text-sm font-mono tabular-nums font-medium text-[#181615]">
                    ${product.price.toFixed(2)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(product)}
                  aria-label={`Add ${product.name} to cart`}
                  className="w-full py-2 px-3 text-xs font-medium bg-[#181615] text-white rounded-lg hover:bg-[#2F2B28] transition-colors"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          ))}
        </div>

        {orders.length > 0 && (
          <section className="bg-white border border-[#E8E3DC] rounded-xl p-6 space-y-3">
            <h2 className="font-display text-base font-semibold">Recent Orders Placed</h2>
            <div className="divide-y divide-[#EFECE6] text-xs font-mono">
              {orders.map((ord) => (
                <div key={ord.orderId} className="py-2 flex items-center justify-between">
                  <span>{ord.orderId}</span>
                  <span className="tabular-nums">${ord.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Phone + OTP Auth Modal */}
      {authOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div role="dialog" aria-label="Phone and OTP Sign In" className="bg-white border border-[#E8E3DC] rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Sign In with Phone</h2>
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                aria-label="Close sign in dialog"
                className="p-1 text-[#5E5851] hover:text-[#181615]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-3.5">
                <div className="space-y-1">
                  <label htmlFor="demo-name" className="text-xs font-medium">Full Name</label>
                  <input
                    id="demo-name"
                    name="name"
                    type="text"
                    placeholder="Alex Rivera"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E8E3DC] rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="demo-phone" className="text-xs font-medium">Phone Number</label>
                  <input
                    id="demo-phone"
                    name="phone"
                    type="tel"
                    placeholder="5551234567"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E8E3DC] rounded-lg"
                  />
                </div>
                {authError && (
                  <p role="alert" className="text-xs text-[#B91C1C] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {authError}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full py-2.5 text-xs font-medium bg-[#181615] text-white rounded-lg hover:bg-[#2F2B28]"
                >
                  Send OTP
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3.5">
                <p className="text-xs text-[#5E5851]">
                  Enter verification code sent to <span className="font-mono">{phoneInput}</span> (Master OTP: 123456).
                </p>
                <div className="space-y-1">
                  <label htmlFor="demo-otp" className="text-xs font-medium">6-Digit OTP</label>
                  <input
                    id="demo-otp"
                    name="otp"
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E8E3DC] rounded-lg"
                  />
                </div>
                {authError && (
                  <p role="alert" className="text-xs text-[#B91C1C] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {authError}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full py-2.5 text-xs font-medium bg-[#181615] text-white rounded-lg hover:bg-[#2F2B28]"
                >
                  Verify & Sign In
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Cart & Checkout Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex justify-end">
          <div role="dialog" aria-label="Shopping Cart and Checkout" className="bg-white w-full max-w-md h-full p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-[#E8E3DC] pb-4">
                <h2 className="font-display text-lg font-semibold">Cart & Checkout</h2>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  aria-label="Close cart drawer"
                  className="p-1 text-[#5E5851] hover:text-[#181615]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {cart.length === 0 ? (
                <p className="text-xs text-[#5E5851] py-8 text-center">Your cart is empty.</p>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 border-b border-[#EFECE6] pb-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{item.name}</div>
                        <div className="text-xs font-mono text-[#5E5851]">${item.price.toFixed(2)}</div>
                      </div>
                      <input
                        type="number"
                        aria-label={`Quantity for ${item.name}`}
                        value={item.qty}
                        onChange={(e) => updateQty(item.id, e.target.value)}
                        className="w-20 px-2 py-1 text-xs font-mono tabular-nums border border-[#E8E3DC] rounded"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label htmlFor="demo-address" className="text-xs font-medium">Shipping Address</label>
                  <input
                    id="demo-address"
                    name="address"
                    type="text"
                    placeholder="742 Evergreen Terrace"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E8E3DC] rounded-lg"
                  />
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    name="coupon"
                    placeholder="Promo code (e.g. SAVE20)"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs font-mono border border-[#E8E3DC] rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="px-3.5 py-2 text-xs font-medium border border-[#E8E3DC] rounded-lg hover:border-[#181615]"
                  >
                    Apply
                  </button>
                </div>

                {checkoutError && (
                  <p role="alert" className="text-xs text-[#B91C1C] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {checkoutError}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-[#E8E3DC] pt-4 space-y-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Order Total</span>
                <span className="font-mono tabular-nums">${total.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={handlePlaceOrder}
                className="w-full py-2.5 text-xs font-medium bg-[#181615] text-white rounded-lg hover:bg-[#2F2B28]"
              >
                Place Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
