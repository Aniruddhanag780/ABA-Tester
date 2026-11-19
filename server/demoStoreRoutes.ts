import { Router } from 'express';

interface DemoUser {
  id: string;
  phone: string;
  name: string;
  createdAt: string;
}

interface DemoOrder {
  orderId: string;
  phone: string;
  items: Array<{ id: string; name: string; qty: number; price: number }>;
  total: number;
  coupon?: string;
  createdAt: string;
}

const demoUsers = new Map<string, DemoUser>();
const demoOrders: DemoOrder[] = [];

export const DEMO_PRODUCTS = [
  {
    id: 'prod-kettle',
    name: 'Alabaster Ceramic Pour-Over Kettle',
    price: 128,
    category: 'Brewing',
    image: '/src/assets/images/demo_ceramic_kettle_1795103643657.jpg',
    stock: 14,
  },
  {
    id: 'prod-cups',
    name: 'Stoneware Espresso Cup Duo',
    price: 54,
    category: 'Tableware',
    image: '/src/assets/images/demo_espresso_cup_1795103643794.jpg',
    stock: 22,
  },
  {
    id: 'prod-apron',
    name: 'French Linen Barista Apron',
    price: 86,
    category: 'Apparel',
    image: '/src/assets/images/demo_linen_apron_1795103643796.jpg',
    stock: 9,
  },
  {
    id: 'prod-grinder',
    name: 'Brushed Steel Hand Grinder',
    price: 165,
    category: 'Hardware',
    // Intentionally broken asset path so Veriflow detects a broken product image in QA runs
    image: '/demo-api/assets/missing-grinder-photo.jpg',
    stock: 6,
  },
];

export function createDemoStoreRouter(): Router {
  const router = Router();

  router.get('/products', (_req, res) => {
    res.json({ products: DEMO_PRODUCTS });
  });

  router.post('/auth/send-otp', (req, res) => {
    const phone = String(req.body?.phone ?? '').trim();
    if (!phone || phone.replace(/\D/g, '').length < 7) {
      res.status(400).json({ error: 'Enter a valid phone number (at least 7 digits).' });
      return;
    }
    res.json({ ok: true, message: 'Verification code dispatched.' });
  });

  router.post('/auth/verify-otp', (req, res) => {
    const phone = String(req.body?.phone ?? '').trim();
    const otp = String(req.body?.otp ?? '').trim();
    const name = String(req.body?.name ?? '').trim() || 'Shopper';

    if (!phone || phone.replace(/\D/g, '').length < 7) {
      res.status(400).json({ error: 'Invalid phone number.' });
      return;
    }

    if (otp !== '123456') {
      res.status(401).json({ error: 'Invalid OTP code. Use 123456 in sandbox mode.' });
      return;
    }

    let user = demoUsers.get(phone);
    const isNewUser = !user;
    if (!user) {
      user = {
        id: `usr-${Date.now().toString(36)}`,
        phone,
        name,
        createdAt: new Date().toISOString(),
      };
      demoUsers.set(phone, user);
    }

    res.json({ user, isNewUser });
  });

  router.post('/coupon', (req, res) => {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Enter a promo code.' });
      return;
    }
    if (code === 'CRASH500' || code === 'TEST500' || code === 'ERR') {
      res.status(500).json({ error: 'Internal promo engine failure while evaluating discount.' });
      return;
    }
    if (code === 'SAVE20') {
      res.json({ code, discountPercent: 20 });
      return;
    }
    res.status(404).json({ error: `Promo code "${code}" was not found.` });
  });

  router.post('/orders', (req, res) => {
    const phone = String(req.body?.phone ?? '').trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const total = Number(req.body?.total ?? 0);
    const coupon = typeof req.body?.coupon === 'string' ? req.body.coupon : undefined;

    if (!phone) {
      res.status(401).json({ error: 'Please sign in before placing an order.' });
      return;
    }
    if (items.length === 0) {
      res.status(400).json({ error: 'Cannot place an order with an empty cart.' });
      return;
    }

    // Intentionally lacks idempotency key check & negative total guard so QA runner detects real defects
    const order: DemoOrder = {
      orderId: `ORD-${Math.floor(10000 + Math.random() * 89999)}-${demoOrders.length + 1}`,
      phone,
      items,
      total,
      coupon,
      createdAt: new Date().toISOString(),
    };
    demoOrders.push(order);

    setTimeout(() => {
      res.status(201).json({ order, totalOrdersForUser: demoOrders.filter((o) => o.phone === phone).length });
    }, 180);
  });

  router.get('/orders', (req, res) => {
    const phone = String(req.query.phone ?? '').trim();
    const list = phone ? demoOrders.filter((o) => o.phone === phone) : demoOrders.slice(-20);
    res.json({ orders: list });
  });

  router.post('/reset', (_req, res) => {
    demoOrders.length = 0;
    demoUsers.clear();
    res.json({ ok: true });
  });

  return router;
}
