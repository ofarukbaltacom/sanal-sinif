// Bedesten: Buhara medresesi tarzı avlu, iki katlı kemerli cepheler, taç kapı, ortada fıskiye, marka vitrinleri.
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

  // ---------- Fıskiye (Pervane Medresesi avlusundaki gibi) ----------
  // Sekizgen taş havuz, ortada kademeli altın sarısı taş kaseler, kaselerden dökülen su perdeleri,
  // havuzun çevresinde beyaz saksılarda bitkiler.
  const FOUNTAIN_R = 2.5;
  let waterTex = null, streamTex = null;
  const fountainAnim = { water: [], streams: [] };

  function drawWater(g, s) {
    const grd = g.createLinearGradient(0, 0, s, s);
    grd.addColorStop(0, '#5fb7c4'); grd.addColorStop(1, '#3f97a8');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    const r = seeded(5);
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const x = r() * s, y = r() * s, w = 20 + r() * 50;
      g.beginPath(); g.ellipse(x, y, w, w * 0.35, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  function drawStream(g, s) {
    g.clearRect(0, 0, s, s);
    const r = seeded(9);
    for (let i = 0; i < 60; i++) {
      const x = r() * s, len = 20 + r() * 80, y = r() * s;
      g.strokeStyle = 'rgba(230,248,255,' + (0.35 + r() * 0.5) + ')';
      g.lineWidth = 1 + r() * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + len); g.stroke();
    }
  }

  function octagon(R) {
    const sh = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
    }
    sh.closePath();
    return sh;
  }
  function octagonPath(R) {
    const p = new THREE.Path();
    for (let i = 7; i >= 0; i--) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      if (i === 7) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
    return p;
  }

  // Kase profili (dönerek oluşturulan yüzey): geniş, sığ, kenarı kıvrık
  function bowlGeometry(r) {
    const pts = [
      [0.0, -0.32], [r * 0.18, -0.32], [r * 0.32, -0.26], [r * 0.6, -0.16],
      [r * 0.85, -0.04], [r, 0.06], [r * 1.03, 0.1], [r * 0.97, 0.12], [r * 0.9, 0.05], [0, 0.0]
    ].map(([x, y]) => new THREE.Vector2(x, y * r * 1.2));
    return new THREE.LatheGeometry(pts, 32);
  }

  function addWaterDisc(geo, y, x, z) {
    const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      map: patternClone(waterTex, 1, 1), color: 0xffffff, transparent: true, opacity: 0.88, shininess: 120, specular: 0xffffff
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x || 0, y, z || 0);
    decorGroup.add(m);
    fountainAnim.water.push(m.material.map);
    return m;
  }

  function addStream(rTop, rBottom, yTop, yBottom) {
    const h = yTop - yBottom;
    const tex = patternClone(streamTex, 6, 1);
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBottom, h, 40, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide })
    );
    m.position.y = yBottom + h / 2;
    decorGroup.add(m);
    fountainAnim.streams.push(tex);
  }

  function fountain() {
    if (!waterTex) {
      waterTex = makeTex(drawWater, 256);
      streamTex = makeTex(drawStream, 256);
      SHARED.add(waterTex); SHARED.add(streamTex);
    }
    fountainAnim.water.length = 0;
    fountainAnim.streams.length = 0;

    const stone = new THREE.MeshStandardMaterial({ color: 0xd9cfb6, roughness: 0.85 });
    const stoneDark = new THREE.MeshStandardMaterial({ color: 0x8f8a7c, roughness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a640, roughness: 0.45, metalness: 0.35 });

    // Havuz duvarı: sekizgen halka, üstte kalın taş kenar
    const ring = octagon(FOUNTAIN_R);
    ring.holes.push(octagonPath(FOUNTAIN_R - 0.28));
    const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.55, bevelEnabled: false }), stone);
    wall.rotation.x = -Math.PI / 2;
    wall.castShadow = true; wall.receiveShadow = true;
    decorGroup.add(wall);
    const capRing = octagon(FOUNTAIN_R + 0.08);
    capRing.holes.push(octagonPath(FOUNTAIN_R - 0.34));
    const cap = new THREE.Mesh(new THREE.ExtrudeGeometry(capRing, { depth: 0.08, bevelEnabled: false }), stone);
    cap.rotation.x = -Math.PI / 2; cap.position.y = 0.55;
    decorGroup.add(cap);

    // Havuz tabanı ve su yüzeyi
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(octagon(FOUNTAIN_R - 0.28)), stoneDark);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.03;
    decorGroup.add(floor);
    addWaterDisc(new THREE.ShapeGeometry(octagon(FOUNTAIN_R - 0.28)), 0.42);

    // Orta ayak: havuzun içinde kademeli altın kaide
    const baseProfile = [[0, 0], [0.62, 0], [0.62, 0.12], [0.5, 0.18], [0.32, 0.3], [0.24, 0.55], [0.2, 0.6], [0, 0.6]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const base = new THREE.Mesh(new THREE.LatheGeometry(baseProfile, 8), gold);
    base.position.y = 0.03; base.castShadow = true;
    decorGroup.add(base);

    // Kademeli kaseler (alttan üste küçülür), her kasenin içinde su ve kenarından dökülen su perdesi
    const tiers = [
      { y: 0.85, r: 0.95 },
      { y: 1.45, r: 0.62 },
      { y: 1.95, r: 0.38 }
    ];
    let prevTop = 0.63;
    tiers.forEach((t, i) => {
      // Kaseyi taşıyan sütun (balüster)
      const colH = t.y - prevTop - 0.18;
      if (colH > 0) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, colH, 12), gold);
        col.position.y = prevTop + colH / 2; decorGroup.add(col);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), gold);
        knob.scale.y = 0.6; knob.position.y = prevTop + colH * 0.5; decorGroup.add(knob);
      }
      const bowl = new THREE.Mesh(bowlGeometry(t.r), gold);
      bowl.position.y = t.y; bowl.castShadow = true;
      decorGroup.add(bowl);
      // Kase kenarında süs halkası
      const rim = new THREE.Mesh(new THREE.TorusGeometry(t.r * 1.0, 0.035, 8, 40), gold);
      rim.rotation.x = Math.PI / 2; rim.position.y = t.y + t.r * 0.13; decorGroup.add(rim);
      // Kase içi su
      addWaterDisc(new THREE.CircleGeometry(t.r * 0.9, 32), t.y + t.r * 0.08);
      // Kenardan bir alttaki kaseye (ya da havuza) dökülen su perdesi
      const below = i === 0 ? 0.42 : tiers[i - 1].y + tiers[i - 1].r * 0.08;
      addStream(t.r * 1.02, t.r * 1.12, t.y + t.r * 0.12, below);
      prevTop = t.y + 0.02;
    });

    // Tepedeki taç: küçük soğan kubbe ve fışkıran su
    const topCol = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 10), gold);
    topCol.position.y = 2.1; decorGroup.add(topCol);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), gold);
    bulb.scale.y = 1.3; bulb.position.y = 2.3; decorGroup.add(bulb);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 10), gold);
    tip.position.y = 2.5; decorGroup.add(tip);
    addStream(0.02, 0.18, 2.75, 2.0);

    obstacles.push({ minX: -FOUNTAIN_R - 0.1, maxX: FOUNTAIN_R + 0.1, minZ: -FOUNTAIN_R - 0.1, maxZ: FOUNTAIN_R + 0.1 });
  }

  // Havuz çevresinde beyaz saksılarda bitkiler
  function planters() {
    const pot = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 });
    const soil = new THREE.MeshLambertMaterial({ color: 0x4a3524 });
    const leafA = new THREE.MeshLambertMaterial({ color: 0x4f8a3a });
    const leafB = new THREE.MeshLambertMaterial({ color: 0x6aa04a });
    const flower = new THREE.MeshLambertMaterial({ color: 0xe0605f });
    const R = FOUNTAIN_R + 0.75;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.55), pot);
      p.position.set(x, 0.2, z); p.rotation.y = -a; p.castShadow = true; decorGroup.add(p);
      const sTop = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.48), soil);
      sTop.position.set(x, 0.41, z); sTop.rotation.y = -a; decorGroup.add(sTop);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), i % 2 ? leafA : leafB);
      bush.scale.y = 0.85; bush.position.set(x, 0.66, z); bush.castShadow = true; decorGroup.add(bush);
      if (i % 2 === 0) {
        for (let k = 0; k < 4; k++) {
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), flower);
          const b = k * Math.PI / 2 + a;
          f.position.set(x + Math.cos(b) * 0.22, 0.86, z + Math.sin(b) * 0.22);
          decorGroup.add(f);
        }
      }
      obstacles.push({ minX: x - .3, maxX: x + .3, minZ: z - .3, maxZ: z + .3 });
    }
  }

  // Su animasyonu: yalnızca Bedesten açıkken dokular kaydırılır
  (function animateWater() {
    requestAnimationFrame(animateWater);
    if (builtRoom !== ROOM_ID) return;
    const t = performance.now() * 0.001;
    for (const tex of fountainAnim.streams) tex.offset.y = (t * 0.9) % 1;
    for (const tex of fountainAnim.water) { tex.offset.x = (t * 0.02) % 1; tex.offset.y = (t * 0.015) % 1; }
  })();

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
      '<div class="muted" id="shopDesc"></div>' +
      '<textarea id="shopNote" class="field" rows="2" maxlength="300" placeholder="Sipariş notu: beden, renk, iletişim tercihi (isteğe bağlı). Bu not yalnızca marka ve yönetim tarafından görülür."></textarea>' +
      '<div id="shopProducts"></div><p class="msg" id="shopMsg"></p></div>';
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
    const note = document.getElementById('shopNote');
    note.value = '';
    note.style.display = b ? 'block' : 'none';
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
          await api('/api/bedesten/orders', { method: 'POST', body: { productId: p.id, qty: 1, note: document.getElementById('shopNote').value.trim() } });
          msg.className = 'msg ok';
          msg.textContent = p.name + ' için sipariş talebin alındı. Durumunu Profil → Siparişlerim bölümünden takip edebilirsin.';
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
    fountain();
    planters();
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
