// Bedesten API: markalar, vitrin atamaları, ürünler ve sipariş talepleri.
// server.js tarafından: require('./brands-api')(app, db, auth, adminOnly, clean, hashPassword);
module.exports = function registerBrands(app, db, auth, adminOnly, clean, hashPassword) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      slot TEXT UNIQUE,
      contact TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      qty INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'talep',
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brand_users (
      user_id INTEGER PRIMARY KEY,
      brand_id INTEGER NOT NULL
    );
  `);

  const SLOT_RE = /^(K[1-4]|[LRF][1-6]|B[1-4])$/;
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const STATUSES = ['talep', 'onaylandi', 'kargoda', 'teslim', 'iptal'];

  const brandView = r => ({
    id: r.id, name: r.name, description: r.description || '', color: r.color || '#1f4e9c',
    slot: r.slot || '', contact: r.contact || '', active: !!r.active, isCorner: /^K/.test(r.slot || ''), createdAt: r.created_at
  });
  const publicBrand = r => ({ id: r.id, name: r.name, description: r.description || '', color: r.color || '#1f4e9c', slot: r.slot || '' });
  const productView = r => ({
    id: r.id, brandId: r.brand_id, name: r.name, description: r.description || '',
    price: r.price, stock: r.stock, imageUrl: r.image_url || '', active: !!r.active
  });

  function validImage(u) {
    if (!u) return '';
    try { const x = new URL(u); return x.protocol === 'https:' ? String(u).slice(0, 500) : ''; } catch (e) { return ''; }
  }

  // ---- Ziyaretçi ----
  app.get('/api/bedesten/shops', auth, (req, res) => {
    res.json(db.prepare('SELECT * FROM brands WHERE active = 1 AND slot IS NOT NULL ORDER BY slot').all().map(publicBrand));
  });

  app.get('/api/bedesten/brands/:id/products', auth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json([]);
    res.json(db.prepare('SELECT * FROM products WHERE brand_id = ? AND active = 1 ORDER BY id').all(id).map(productView));
  });

  app.post('/api/bedesten/orders', auth, (req, res) => {
    const b = req.body || {};
    const productId = Number(b.productId);
    const qty = Math.max(1, Math.min(20, Math.floor(Number(b.qty) || 1)));
    const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(productId);
    if (!p) return res.status(400).json({ error: 'Ürün bulunamadı.' });
    if (p.stock < qty) return res.status(400).json({ error: 'Yeterli stok yok.' });
    const recent = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE user_id = ? AND created_at > ?')
      .get(req.user.id, new Date(Date.now() - 60 * 60 * 1000).toISOString()).c;
    if (recent >= 10) return res.status(429).json({ error: 'Çok fazla talep. Biraz sonra tekrar dene.' });
    db.prepare('INSERT INTO orders (user_id, product_id, qty, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, productId, qty, 'talep', clean(b.note, 300) || null, new Date().toISOString());
    res.json({ ok: true });
  });

  app.get('/api/bedesten/my-orders', auth, (req, res) => {
    const rows = db.prepare(`
      SELECT o.*, p.name AS product_name, p.price, b.name AS brand_name
      FROM orders o JOIN products p ON p.id = o.product_id JOIN brands b ON b.id = p.brand_id
      WHERE o.user_id = ? ORDER BY o.id DESC`).all(req.user.id);
    res.json(rows.map(r => ({ id: r.id, product: r.product_name, brand: r.brand_name, qty: r.qty, price: r.price, status: r.status, createdAt: r.created_at })));
  });

  // ---- Yönetici ----
  app.get('/api/admin/brands', auth, adminOnly, (req, res) => {
    res.json(db.prepare('SELECT * FROM brands ORDER BY id').all().map(brandView));
  });

  function brandInput(b) {
    const name = clean(b.name, 60);
    const slot = b.slot ? String(b.slot).toUpperCase() : null;
    if (!name) return { error: 'Marka adı gerekli.' };
    if (slot && !SLOT_RE.test(slot)) return { error: 'Geçersiz vitrin kodu.' };
    return {
      name, slot,
      description: clean(b.description, 400),
      color: HEX.test(b.color || '') ? b.color : '#1f4e9c',
      contact: clean(b.contact, 120),
      active: b.active === false ? 0 : 1
    };
  }

  app.post('/api/admin/brands', auth, adminOnly, (req, res) => {
    const v = brandInput(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    try {
      db.prepare('INSERT INTO brands (name, description, color, slot, contact, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(v.name, v.description, v.color, v.slot, v.contact, v.active, new Date().toISOString());
    } catch (e) { return res.status(400).json({ error: 'Bu vitrin zaten dolu.' }); }
    res.json({ ok: true });
  });

  app.put('/api/admin/brands/:id', auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    const v = brandInput(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    try {
      db.prepare('UPDATE brands SET name = ?, description = ?, color = ?, slot = ?, contact = ?, active = ? WHERE id = ?')
        .run(v.name, v.description, v.color, v.slot, v.contact, v.active, id);
    } catch (e) { return res.status(400).json({ error: 'Bu vitrin zaten dolu.' }); }
    res.json({ ok: true });
  });

  app.delete('/api/admin/brands/:id', auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) {
      for (const r of db.prepare('SELECT user_id FROM brand_users WHERE brand_id = ?').all(id)) {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(r.user_id);
        db.prepare("DELETE FROM users WHERE id = ? AND role = 'brand'").run(r.user_id);
      }
      db.prepare('DELETE FROM brand_users WHERE brand_id = ?').run(id);
      db.prepare('DELETE FROM products WHERE brand_id = ?').run(id);
      db.prepare('DELETE FROM brands WHERE id = ?').run(id);
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/brands/:id/products', auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    res.json(db.prepare('SELECT * FROM products WHERE brand_id = ? ORDER BY id').all(id).map(productView));
  });

  function productInput(b) {
    const name = clean(b.name, 80);
    const price = Number(b.price);
    const stock = Math.max(0, Math.floor(Number(b.stock) || 0));
    if (!name) return { error: 'Ürün adı gerekli.' };
    if (!Number.isFinite(price) || price < 0) return { error: 'Geçerli bir fiyat gir.' };
    return { name, price, stock, description: clean(b.description, 400), imageUrl: validImage(b.imageUrl), active: b.active === false ? 0 : 1 };
  }

  app.post('/api/admin/brands/:id/products', auth, adminOnly, (req, res) => {
    const brandId = Number(req.params.id);
    if (!db.prepare('SELECT id FROM brands WHERE id = ?').get(brandId)) return res.status(404).json({ error: 'Marka yok.' });
    const v = productInput(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    db.prepare('INSERT INTO products (brand_id, name, description, price, stock, image_url, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(brandId, v.name, v.description, v.price, v.stock, v.imageUrl || null, v.active, new Date().toISOString());
    res.json({ ok: true });
  });

  app.put('/api/admin/products/:id', auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    const v = productInput(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    db.prepare('UPDATE products SET name = ?, description = ?, price = ?, stock = ?, image_url = ?, active = ? WHERE id = ?')
      .run(v.name, v.description, v.price, v.stock, v.imageUrl || null, v.active, id);
    res.json({ ok: true });
  });

  app.delete('/api/admin/products/:id', auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.get('/api/admin/orders', auth, adminOnly, (req, res) => {
    const rows = db.prepare(`
      SELECT o.*, p.name AS product_name, p.price, b.name AS brand_name, u.display_name AS user_name, u.username
      FROM orders o JOIN products p ON p.id = o.product_id JOIN brands b ON b.id = p.brand_id JOIN users u ON u.id = o.user_id
      ORDER BY o.id DESC LIMIT 500`).all();
    res.json(rows.map(r => ({
      id: r.id, product: r.product_name, brand: r.brand_name, user: r.user_name, username: r.username,
      qty: r.qty, price: r.price, status: r.status, note: r.note || '', createdAt: r.created_at
    })));
  });

  app.post('/api/admin/orders/:id/status', auth, adminOnly, (req, res) => {
    const r = setOrderStatus(Number(req.params.id), String((req.body || {}).status || ''), null);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  });

  // ---- Sipariş durumu (stok mantığı) ----
  // Onaylanınca stok düşer; onaylanmış/kargodaki bir sipariş iptal edilirse stok geri eklenir.
  const STOCK_HELD = ['onaylandi', 'kargoda', 'teslim'];
  function setOrderStatus(orderId, status, brandId) {
    if (!STATUSES.includes(status)) return { error: 'Geçersiz durum.' };
    const o = db.prepare('SELECT o.*, p.brand_id, p.stock FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id = ?').get(orderId);
    if (!o) return { error: 'Sipariş bulunamadı.' };
    if (brandId !== null && o.brand_id !== brandId) return { error: 'Bu sipariş sana ait değil.' };
    const wasHeld = STOCK_HELD.includes(o.status);
    const willHold = STOCK_HELD.includes(status);
    db.exec('BEGIN');
    try {
      if (!wasHeld && willHold) {
        if (o.stock < o.qty) { db.exec('ROLLBACK'); return { error: 'Stok yetersiz, önce stoğu güncelle.' }; }
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(o.qty, o.product_id);
      } else if (wasHeld && !willHold) {
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(o.qty, o.product_id);
      }
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return { error: 'Durum güncellenemedi.' };
    }
    return { ok: true };
  }

  // ---- Marka hesapları (yönetici açar) ----
  app.get('/api/admin/brands/:id/accounts', auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    const rows = db.prepare('SELECT u.id, u.username, u.display_name FROM brand_users bu JOIN users u ON u.id = bu.user_id WHERE bu.brand_id = ? ORDER BY u.id').all(id);
    res.json(rows.map(r => ({ id: r.id, username: r.username, displayName: r.display_name })));
  });

  app.post('/api/admin/brands/:id/accounts', auth, adminOnly, (req, res) => {
    const brandId = Number(req.params.id);
    if (!db.prepare('SELECT id FROM brands WHERE id = ?').get(brandId)) return res.status(404).json({ error: 'Marka yok.' });
    const b = req.body || {};
    const username = clean(b.username, 30).toLowerCase();
    const displayName = clean(b.displayName, 40);
    const password = String(b.password || '');
    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Kullanıcı adı 3-30 karakter olmalı (harf, rakam, _ . -).' });
    if (!displayName) return res.status(400).json({ error: 'Görünen ad gerekli.' });
    if (password.length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı.' });
    let info;
    try {
      info = db.prepare('INSERT INTO users (username, display_name, password_hash, role, is_admin, created_at) VALUES (?, ?, ?, ?, 0, ?)')
        .run(username, displayName, hashPassword(password), 'brand', new Date().toISOString());
    } catch (e) { return res.status(400).json({ error: 'Bu kullanıcı adı zaten var.' }); }
    db.prepare('INSERT INTO brand_users (user_id, brand_id) VALUES (?, ?)').run(Number(info.lastInsertRowid), brandId);
    res.json({ ok: true });
  });

  app.delete('/api/admin/brand-accounts/:userId', auth, adminOnly, (req, res) => {
    const uid = Number(req.params.userId);
    if (!db.prepare('SELECT user_id FROM brand_users WHERE user_id = ?').get(uid)) return res.status(404).json({ error: 'Hesap bulunamadı.' });
    db.prepare('DELETE FROM brand_users WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
    db.prepare("DELETE FROM users WHERE id = ? AND role = 'brand'").run(uid);
    res.json({ ok: true });
  });

  // ---- Marka paneli (marka hesabı kendi verisini görür) ----
  function brandOnly(req, res, next) {
    const row = db.prepare('SELECT brand_id FROM brand_users WHERE user_id = ?').get(req.user.id);
    if (!row) return res.status(403).json({ error: 'Bu sayfa yalnızca marka hesapları içindir.' });
    req.brandId = row.brand_id;
    next();
  }

  app.get('/api/brand/me', auth, brandOnly, (req, res) => {
    const b = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.brandId);
    if (!b) return res.status(404).json({ error: 'Marka bulunamadı.' });
    res.json(brandView(b));
  });

  app.get('/api/brand/orders', auth, brandOnly, (req, res) => {
    const rows = db.prepare(`
      SELECT o.*, p.name AS product_name, p.price, u.display_name AS user_name, u.username
      FROM orders o JOIN products p ON p.id = o.product_id JOIN users u ON u.id = o.user_id
      WHERE p.brand_id = ? ORDER BY o.id DESC LIMIT 500`).all(req.brandId);
    res.json(rows.map(r => ({
      id: r.id, product: r.product_name, user: r.user_name, username: r.username,
      qty: r.qty, price: r.price, status: r.status, note: r.note || '', createdAt: r.created_at
    })));
  });

  app.post('/api/brand/orders/:id/status', auth, brandOnly, (req, res) => {
    const r = setOrderStatus(Number(req.params.id), String((req.body || {}).status || ''), req.brandId);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  });

  app.get('/api/brand/products', auth, brandOnly, (req, res) => {
    res.json(db.prepare('SELECT * FROM products WHERE brand_id = ? ORDER BY id').all(req.brandId).map(productView));
  });

  app.post('/api/brand/products', auth, brandOnly, (req, res) => {
    const v = productInput(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    db.prepare('INSERT INTO products (brand_id, name, description, price, stock, image_url, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.brandId, v.name, v.description, v.price, v.stock, v.imageUrl || null, v.active, new Date().toISOString());
    res.json({ ok: true });
  });

  app.put('/api/brand/products/:id', auth, brandOnly, (req, res) => {
    const id = Number(req.params.id);
    const p = db.prepare('SELECT brand_id FROM products WHERE id = ?').get(id);
    if (!p || p.brand_id !== req.brandId) return res.status(404).json({ error: 'Ürün bulunamadı.' });
    const v = productInput(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    db.prepare('UPDATE products SET name = ?, description = ?, price = ?, stock = ?, image_url = ?, active = ? WHERE id = ?')
      .run(v.name, v.description, v.price, v.stock, v.imageUrl || null, v.active, id);
    res.json({ ok: true });
  });
};
