// Bedesten: Buhara medresesi tarzı avlu, iki katlı kemerli cepheler, taç kapı, marka vitrinleri.
// index.html'deki global yardımcıları (decorGroup, obstacles, makeTex, patternClone, archShape,
// makeSignTexture, starPath, seeded, SHARED, scene, floorMesh, api, openModal ...) kullanır.
// index.html'de ana betikten SONRA yüklenmelidir.
(function () {
  const ROOM_ID = 'bedesten';
  const H = 9.85;            // cephe çizgisi (duvarlar ±H)
  const G_H = 3.2;           // zemin kat yüksekliği
  const U_H = 2.6;           // üst kat yüksekliği
  const PARAPET = 0.5;
  const WALL_TOP = G_H + U_H + PARAPET;
  const PORTAL_W = 6.2, PORTAL_H = 10.4;
  const CENTERS = [-6.9, -4.1, -1.3, 1.3, 4.1, 6.9];

  // ---------- Dokular ----------
  function drawBrick(g, s) {
    g.fillStyle = '#d9c38f';
    g.fillRect(0, 0, s, s);
    const rows = 16, bh = s / rows, bw = bh * 2.4;
    const tones = ['#d5bd86', '#dcc693', '#cfb57e', '#e0ca98'];
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2;
      for (let x = -bw; x < s + bw; x += bw) {
        g.fillStyle = tones[(k++) % tones.length];
        g.fillRect(x + off + 1, r * bh + 1, bw - 2, bh - 2);
      }
    }
    g.strokeStyle = 'rgba(120,95,55,0.35)';
    g.lineWidth = 1;
    for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(0, r * bh); g.lineTo(s, r * bh); g.stroke(); }
  }

  function drawBukharaTile(g, s) {
    const r = seeded(17);
    const pal = ['#1c2f7a', '#2a4bb3', '#1aa6b7', '#f3efe3', '#7fd6dd', '#162a66'];
    g.fillStyle = '#1c2f7a';
    g.fillRect(0, 0, s, s);
    const n = 24, c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.save(); g.translate((i + .5) * c, (j + .5) * c); g.rotate(Math.PI / 4);
      g.fillStyle = pal[Math.floor(r() * pal.length)];
      const q = c * .42; g.fillRect(-q, -q, q * 2, q * 2); g.restore();
    }
    const N = 3, cell = s / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const cx = (i + .5) * cell, cy = (j + .5) * cell;
      g.fillStyle = '#f3efe3'; starPath(g, cx, cy, cell * .48, cell * .2, 8); g.fill();
      g.fillStyle = '#1aa6b7'; starPath(g, cx, cy, cell * .3, cell * .13, 8); g.fill();
      g.fillStyle = '#1c2f7a'; starPath(g, cx, cy, cell * .14, cell * .06, 8); g.fill();
      g.fillStyle = '#e9b52c'; g.beginPath(); g.arc(cx, cy, cell * .04, 0, Math.PI * 2); g.fill();
    }
  }

  function drawLattice(g, s) {
    g.fillStyle = '#2a1e12';
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'destination-out';
    const n = 8, c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const cx = (i + .5) * c + (j % 2 ? c / 2 : 0), cy = (j + .5) * c;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 3 * k;
        const x = cx + Math.cos(a) * c * .36, y = cy + Math.sin(a) * c * .36;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawPaving(g, s) {
    g.fillStyle = '#6f7378';
    g.fillRect(0, 0, s, s);
    const n = 6, c = s / n;
    const tones = ['#6a6e73', '#767a80', '#5f6368', '#7d8187'];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = tones[(i * 3 + j) % tones.length];
      g.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
    }
  }

  function drawKitabe(g, s) {
    g.fillStyle = '#1c2f7a';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#f3efe3';
    g.font = 'bold ' + Math.round(s * .42) + 'px Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('BEDESTEN', s / 2, s / 2);
  }

  let brickTex, tileTex2, latticeTex, paveTex, kitabeTex;
  function ensureTextures() {
    if (brickTex) return;
    brickTex = makeTex(drawBrick, 512);
    tileTex2 = makeTex(drawBukharaTile, 1024);
    latticeTex = makeTex(drawLattice, 256);
    paveTex = makeTex(drawPaving, 512);
    kitabeTex = makeTex(drawKitabe, 512);
    for (const t of [brickTex, tileTex2, latticeTex, paveTex, kitabeTex]) SHARED.add(t);
  }

  function brickMat(rx, ry) { return new THREE.MeshLambertMaterial({ map: patternClone(brickTex, rx, ry) }); }

  // ---------- Vitrin yerleri ----------
  // L/R: yan cepheler, F: giriş (ön) cephesi, B: taç kapının iki yanı, K: köşeler (büyük, ayrı fiyat)
  const SLOTS = [];
  function defineSlots() {
    SLOTS.length = 0;
    CENTERS.forEach((c, i) => {
      SLOTS.push({ id: 'L' + (i + 1), x: -H, z: c, nx: 1, nz: 0, corner: false });
      SLOTS.push({ id: 'R' + (i + 1), x: H, z: c, nx: -1, nz: 0, corner: false });
      SLOTS.push({ id: 'F' + (i + 1), x: c, z: H, nx: 0, nz: -1, corner: false });
    });
    for (const [id, c] of [['B1', -6.9], ['B2', -4.1], ['B3', 4.1], ['B4', 6.9]]) {
      SLOTS.push({ id, x: c, z: -H, nx: 0, nz: 1, corner: false });
    }
    for (const [id, x, z] of [['K1', -H + .9, -H + .9], ['K2', H - .9, -H + .9], ['K3', -H + .9, H - .9], ['K4', H - .9, H - .9]]) {
      SLOTS.push({ id, x, z, nx: -Math.sign(x) * 0.7071, nz: -Math.sign(z) * 0.7071, corner: true });
    }
  }

  // ---------- Cephe elemanları ----------
  function addPlane(w, h, material, x, y, z, rotY) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    decorGroup.add(m);
    return m;
  }

  // Bir cephe boyunca iki katlı kemerli hücre dizisi. along:'x' için z sabit, 'z' için x sabit.
  function facade(along, fixed, skipRange) {
    const rotY = along === 'x' ? (fixed > 0 ? Math.PI : 0) : (fixed < 0 ? Math.PI / 2 : -Math.PI / 2);
    const inward = fixed < 0 ? 1 : -1;
    const place = (c, y, off) => along === 'x'
      ? [c, y, fixed + inward * off]
      : [fixed + inward * off, y, c];

    // Ana tuğla duvar (iki kat + korkuluk)
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(along === 'x' ? S + 1 : 0.6, WALL_TOP, along === 'x' ? 0.6 : S + 1),
      brickMat(10, WALL_TOP / 2)
    );
    let [x, y, z] = place(0, WALL_TOP / 2, -0.3);
    wall.position.set(x, y, z);
    wall.receiveShadow = true;
    decorGroup.add(wall);

    const archG = new THREE.ExtrudeGeometry(archShape(1.9, 2.5), { depth: 0.08, bevelEnabled: false });
    const archU = new THREE.ExtrudeGeometry(archShape(1.7, 2.0), { depth: 0.08, bevelEnabled: false });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a2d1c });
    const darkU = new THREE.MeshLambertMaterial({ color: 0x4a3a26 });
    const tileM = new THREE.MeshBasicMaterial({ map: patternClone(tileTex2, 0.5, 0.25) });
    const latM = new THREE.MeshBasicMaterial({ map: latticeTex, transparent: true, side: THREE.DoubleSide });
    const railM = new THREE.MeshLambertMaterial({ color: 0x5a4328 });
    const pierM = brickMat(1, 3);

    for (const c of CENTERS) {
      if (skipRange && c > skipRange[0] && c < skipRange[1]) continue;
      // Zemin kat kemer nişi
      let a = new THREE.Mesh(archG, dark);
      [x, y, z] = place(c, 0.05, 0.02); a.position.set(x, y, z); a.rotation.y = rotY; decorGroup.add(a);
      // Kemer üstü çini pano
      addPlane(2.4, 0.75, tileM, ...place(c, G_H - 0.42, 0.04), rotY);
      // Üst kat: kemer, kafes pencere, çini, korkuluk
      a = new THREE.Mesh(archU, darkU);
      [x, y, z] = place(c, G_H + 0.25, 0.02); a.position.set(x, y, z); a.rotation.y = rotY; decorGroup.add(a);
      addPlane(1.1, 1.3, latM, ...place(c, G_H + 1.0, 0.09), rotY);
      addPlane(2.4, 0.55, tileM, ...place(c, G_H + U_H - 0.32, 0.04), rotY);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? 2.0 : 0.08, 0.5, along === 'x' ? 0.08 : 2.0), railM);
      [x, y, z] = place(c, G_H + 0.25, 0.22); rail.position.set(x, y, z); decorGroup.add(rail);
      // Ayak
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.5, G_H + U_H, 0.5), pierM);
      [x, y, z] = place(c + 1.4, (G_H + U_H) / 2, 0.1); pier.position.set(x, y, z); decorGroup.add(pier);
    }
    // Kat silmesi ve üst çini şerit
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(along === 'x' ? S + 1 : 0.5, 0.18, along === 'x' ? 0.5 : S + 1),
      new THREE.MeshLambertMaterial({ color: 0xc9b07a })
    );
    [x, y, z] = place(0, G_H, 0.12); cornice.position.set(x, y, z); decorGroup.add(cornice);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(along === 'x' ? S + 1 : 0.56, 0.5, along === 'x' ? 0.56 : S + 1),
      new THREE.MeshBasicMaterial({ map: patternClone(tileTex2, 4, 0.2) })
    );
    [x, y, z] = place(0, WALL_TOP - 0.25, 0.02); band.position.set(x, y, z); decorGroup.add(band);
  }

  // Taç kapı (iwan): arka cephenin ortasında yüksek çerçeve, büyük sivri kemer, çini pano, kitabe
  function portal() {
    const z = -H;
    const body = new THREE.Mesh(new THREE.BoxGeometry(PORTAL_W, PORTAL_H, 1.4), brickMat(3, 5));
    body.position.set(0, PORTAL_H / 2, z - 0.4);
    decorGroup.add(body);
    const frameM = new THREE.MeshBasicMaterial({ map: patternClone(tileTex2, 1, 6) });
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, PORTAL_H - 1.6, 0.1), frameM);
      m.position.set(sx * (PORTAL_W / 2 - 0.45), PORTAL_H / 2 - 0.5, z + 0.36);
      decorGroup.add(m);
    }
    addPlane(PORTAL_W - 1.4, 0.7, new THREE.MeshBasicMaterial({ map: kitabeTex }), 0, PORTAL_H - 0.95, z + 0.37, 0);
    addPlane(PORTAL_W - 1.4, 3.2, new THREE.MeshBasicMaterial({ map: patternClone(tileTex2, 1.5, 1) }), 0, PORTAL_H - 2.95, z + 0.37, 0);
    const niche = new THREE.Mesh(
      new THREE.ExtrudeGeometry(archShape(4.2, 6.3), { depth: 0.9, bevelEnabled: false }),
      new THREE.MeshLambertMaterial({ color: 0x5c4a30 })
    );
    niche.position.set(0, 0.05, z - 0.5);
    decorGroup.add(niche);
    addPlane(1.6, 1.4, new THREE.MeshBasicMaterial({ color: 0x9ec9ee }), 0, 5.0, z + 0.42, 0);
    const half = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 24, 12, 0, Math.PI, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: patternClone(tileTex2, 1, 1), side: THREE.DoubleSide })
    );
    half.position.set(0, 3.4, z + 0.3); half.rotation.y = Math.PI; decorGroup.add(half);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.12), new THREE.MeshLambertMaterial({ color: 0x5a2f16 }));
    door.position.set(0, 1.2, z + 0.42); decorGroup.add(door);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.42), new THREE.MeshBasicMaterial({ map: makeSignTexture('EĞİTİM MERKEZİ', '#1f4e9c') }));
    sign.position.set(0, 2.75, z + 0.44); decorGroup.add(sign);
    obstacles.push({ minX: -PORTAL_W / 2, maxX: PORTAL_W / 2, minZ: z - 1, maxZ: z + 0.5 });
  }

  function tree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.2, 10), new THREE.MeshLambertMaterial({ color: 0x5b3f24 }));
    trunk.position.set(x, 1.1, z); trunk.castShadow = true; decorGroup.add(trunk);
    const leaf = new THREE.MeshLambertMaterial({ color: 0x5d8a3c });
    for (const [dx, dy, dz, r] of [[0, 3.0, 0, 1.5], [0.9, 2.6, 0.4, 1.0], [-0.8, 2.7, -0.5, 1.0], [0.2, 3.7, -0.6, 0.9]]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), leaf);
      s.position.set(x + dx, dy, z + dz); s.castShadow = true; decorGroup.add(s);
    }
    obstacles.push({ minX: x - .3, maxX: x + .3, minZ: z - .3, maxZ: z + .3 });
  }

  // Avlunun ortasında çiçekli alçak çit tarhları (vitrin önlerini kapatmaz)
  function gardens() {
    const hm = new THREE.MeshLambertMaterial({ color: 0x3f7a35 });
    const fm = new THREE.MeshLambertMaterial({ color: 0xc9507a });
    for (const [x, z, w, d] of [[-4.6, -3, 4, 0.5], [4.6, -3, 4, 0.5], [-4.6, 3, 4, 0.5], [4.6, 3, 4, 0.5]]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), hm); h.position.set(x, 0.25, z); decorGroup.add(h);
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), fm); f.position.set(x, 0.56, z); decorGroup.add(f);
      obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }

  // ---------- Vitrinler ----------
  const shopClickables = [];
  let shopsData = {};

  function placeShopSigns() {
    for (const m of shopClickables) decorGroup.remove(m);
    shopClickables.length = 0;
    for (const s of SLOTS) {
      const b = shopsData[s.id];
      const label = b ? b.name : (s.corner ? 'KÖŞE VİTRİN' : 'BOŞ VİTRİN');
      const color = b ? (b.color || '#1f4e9c') : '#6b6b6b';
      const w = s.corner ? 1.6 : 1.5;
      const rot = Math.atan2(s.nx, s.nz);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.32), new THREE.MeshBasicMaterial({ map: makeSignTexture(label, color) }));
      sign.position.set(s.x + s.nx * 0.5, 2.3, s.z + s.nz * 0.5);
      sign.rotation.y = rot;
      sign.userData = { kind: 'shop', slotId: s.id };
      decorGroup.add(sign);
      shopClickables.push(sign);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(w, 1.9),
        new THREE.MeshBasicMaterial({ color: b ? 0xdcefff : 0x2a2a2a, transparent: true, opacity: b ? 0.35 : 0.8 })
      );
      glass.position.set(s.x + s.nx * 0.46, 1.05, s.z + s.nz * 0.46);
      glass.rotation.y = rot;
      glass.userData = sign.userData;
      decorGroup.add(glass);
      shopClickables.push(glass);
    }
  }

  async function loadShops() {
    try {
      const list = await api('/api/bedesten/shops');
      shopsData = {};
      for (const b of list) if (b.slot) shopsData[b.slot] = b;
    } catch (e) { shopsData = {}; }
    if (builtRoom === ROOM_ID) placeShopSigns();
  }

  // ---------- Dükkân penceresi ----------
  let shopModal = null;
  function ensureShopModal() {
    if (shopModal) return shopModal;
    const m = document.createElement('div');
    m.id = 'shopModal'; m.className = 'modal';
    m.innerHTML =
      '<div class="modalCard wide"><div class="head"><strong id="shopTitle"></strong>' +
      '<button class="btn ghost modalClose" type="button">Kapat</button></div>' +
      '<div class="muted" id="shopDesc"></div><div id="shopProducts"></div><p class="msg" id="shopMsg"></p></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) closeAllModals(); });
    m.querySelector('.modalClose').addEventListener('click', closeAllModals);
    shopModal = m;
    return m;
  }

  async function openShop(slotId) {
    const b = shopsData[slotId];
    ensureShopModal();
    const title = document.getElementById('shopTitle');
    const desc = document.getElementById('shopDesc');
    const box = document.getElementById('shopProducts');
    const msg = document.getElementById('shopMsg');
    msg.className = 'msg'; msg.textContent = '';
    box.innerHTML = '';
    if (!b) {
      title.textContent = 'Boş vitrin · ' + slotId;
      desc.textContent = 'Bu vitrin kiralanabilir. Bilgi için yönetime başvurun.';
      openModal('shopModal');
      return;
    }
    title.textContent = b.name;
    desc.textContent = b.description || '';
    openModal('shopModal');
    let products = [];
    try { products = await api('/api/bedesten/brands/' + b.id + '/products'); }
    catch (e) { msg.textContent = e.message; return; }
    if (!products.length) { box.textContent = 'Henüz ürün eklenmemiş.'; return; }
    for (const p of products) {
      const card = document.createElement('div');
      card.className = 'noteItem';
      card.style.cssText = 'display:flex;gap:10px;align-items:center';
      if (p.imageUrl) {
        const img = document.createElement('img');
        img.src = p.imageUrl; img.alt = p.name;
        img.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:8px;background:#222';
        card.appendChild(img);
      }
      const info = document.createElement('div');
      info.style.flex = '1';
      const n = document.createElement('strong'); n.textContent = p.name; info.appendChild(n);
      const d = document.createElement('div'); d.className = 'sub';
      d.textContent = (p.description ? p.description + ' · ' : '') + p.price.toLocaleString('tr-TR') + ' ₺' +
        (p.stock > 0 ? ' · stok: ' + p.stock : ' · tükendi');
      info.appendChild(d);
      card.appendChild(info);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn small';
      btn.textContent = 'Sipariş talebi'; btn.disabled = p.stock <= 0;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api('/api/bedesten/orders', { method: 'POST', body: { productId: p.id, qty: 1 } });
          msg.className = 'msg ok';
          msg.textContent = p.name + ' için sipariş talebin alındı. Marka seninle iletişime geçecek.';
        } catch (e) { msg.className = 'msg'; msg.textContent = e.message; btn.disabled = false; }
      });
      card.appendChild(btn);
      box.appendChild(card);
    }
  }

  // Tıklama: ana betiğin handleWorldClick fonksiyonunu sarmalayarak vitrinleri de yakala
  const shopRay = new THREE.Raycaster();
  const origClick = handleWorldClick;
  handleWorldClick = function (e) {
    origClick(e);
    if (builtRoom !== ROOM_ID || modalOpen) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    shopRay.setFromCamera(ndc, camera);
    const hits = shopRay.intersectObjects(shopClickables, false);
    if (!hits.length) return;
    const id = hits[0].object.userData.slotId;
    const s = SLOTS.find(q => q.id === id);
    if (s && Math.hypot(s.x - player.x, s.z - player.z) > 5) return showHint('Vitrine biraz daha yaklaş.');
    openShop(id);
  };

  // ---------- Oda kurulumu ----------
  function buildBedesten() {
    ensureTextures();
    defineSlots();
    scene.background.set(0x7fb8ea);
    scene.fog.color.set(0xa9cde8);
    floorMesh.material.color.set(0xffffff);
    const pave = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshLambertMaterial({ map: patternClone(paveTex, 10, 10) }));
    pave.rotation.x = -Math.PI / 2; pave.position.y = 0.012; pave.receiveShadow = true; decorGroup.add(pave);
    screen.visible = false; boardFrame.visible = false;

    facade('z', -H);                                            // sol
    facade('z', H);                                             // sağ
    facade('x', H);                                             // ön (giriş)
    facade('x', -H, [-PORTAL_W / 2 - 0.3, PORTAL_W / 2 + 0.3]);  // arka, ortada taç kapı
    portal();
    for (const [x, z] of [[-7.2, -6.6], [7.2, -6.6], [-7.2, 6.6], [7.2, 6.6]]) tree(x, z);
    gardens();
    placeShopSigns();
    loadShops();
  }

  // ---------- Ana betiğe bağlan ----------
  ROOM_NAMES[ROOM_ID] = 'Bedesten';
  const origBuildRoom = buildRoom;
  buildRoom = function (roomId) {
    if (roomId !== ROOM_ID) return origBuildRoom(roomId);
    if (typeof syncArchiveUI === 'function') syncArchiveUI(roomId);
    if (builtRoom === roomId) return;
    builtRoom = roomId;
    clearDecor();
    buildBedesten();
  };
  const sel = document.getElementById('room');
  if (sel && !sel.querySelector('option[value="' + ROOM_ID + '"]')) sel.appendChild(new Option('Bedesten', ROOM_ID));
})();
