// Avatar sistemi: sınıf sahnesi, avatar düzenleme sayfası ve önizleme için ortak kod.
// Orantılar ve detaylar gerçekçi bir insan figürüne göre ayarlanmıştır (stilize, fotoğraf gerçekçiliğinde değildir).
(function () {
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const ENUM = {
    hair: ['short', 'long', 'bald', 'curly'],
    glasses: ['none', 'round', 'square'],
    headwear: ['none', 'hijab', 'cap', 'beret']
  };
  const DEFAULT = {
    height: 1, build: 1, skin: '#f1c27d', hair: 'short', hairColor: '#2b1d12',
    eyes: '#3b2a1a', glasses: 'none', shirt: '#2980b9', pants: '#2c3e50',
    headwear: 'none', headColor: '#1f4e9c'
  };

  function sanitize(input) {
    const a = input && typeof input === 'object' ? input : {};
    const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
    const en = (v, list, d) => (list.includes(v) ? v : d);
    const num = (v, min, max, d) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
    };
    return {
      height: num(a.height, 0.9, 1.1, DEFAULT.height),
      build: num(a.build, 0.85, 1.2, DEFAULT.build),
      skin: hex(a.skin, DEFAULT.skin),
      hair: en(a.hair, ENUM.hair, DEFAULT.hair),
      hairColor: hex(a.hairColor, DEFAULT.hairColor),
      eyes: hex(a.eyes, DEFAULT.eyes),
      glasses: en(a.glasses, ENUM.glasses, DEFAULT.glasses),
      shirt: hex(a.shirt, DEFAULT.shirt),
      pants: hex(a.pants, DEFAULT.pants),
      headwear: en(a.headwear, ENUM.headwear, DEFAULT.headwear),
      headColor: hex(a.headColor, DEFAULT.headColor)
    };
  }

  // Avatar grubunu oluşturur. Yüz -z yönüne bakar. Eklemler (kalça, omuz) pivot grupları olarak tutulur.
  function build(THREE, raw) {
    const a = sanitize(raw);
    const std = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r === undefined ? 0.7 : r, metalness: 0 });

    const skin = std(a.skin, 0.6);
    const shirt = std(a.shirt, 0.8);
    const pants = std(a.pants, 0.85);
    const hairM = std(a.hairColor, 0.5);
    const eyeM = std(a.eyes, 0.3);
    const headCover = std(a.headColor, 0.9);
    const coverDouble = new THREE.MeshStandardMaterial({ color: a.headColor, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const shoeM = std(0x1d1d1f, 0.5);
    const white = std(0xf4f1ea, 0.3);
    const lip = std(0x9c4f4a, 0.5);
    const frameM = std(0x161616, 0.4);

    const group = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.set(a.build, a.height, a.build);
    group.add(inner);
    const parts = {};

    const mk = (geo, m, parent, x, y, z) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x || 0, y || 0, z || 0);
      o.receiveShadow = true;
      (parent || inner).add(o);
      return o;
    };

    // Kalça, gövde, omuz, boyun
    const pelvis = mk(new THREE.CylinderGeometry(0.19, 0.17, 0.22, 20), pants, null, 0, 0.9);
    pelvis.castShadow = true;
    const torso = mk(new THREE.CylinderGeometry(0.19, 0.16, 0.56, 22), shirt, null, 0, 1.2);
    torso.scale.set(1.45, 1, 0.8);
    torso.castShadow = true;
    mk(new THREE.SphereGeometry(0.2, 20, 14), shirt, null, 0, 1.44, 0).scale.set(1.35, 0.5, 0.8);
    mk(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 14), skin, null, 0, 1.56, 0);

    // Kafa (ellips), kulak, burun, ağız
    const head = mk(new THREE.SphereGeometry(0.22, 28, 20), skin, null, 0, 1.7, 0);
    head.scale.set(0.92, 1.12, 1.0);
    head.castShadow = true;
    for (const s of [-1, 1]) {
      mk(new THREE.SphereGeometry(0.04, 10, 8), skin, null, s * 0.2, 1.7, 0).scale.set(0.5, 1.1, 0.8);
    }
    mk(new THREE.SphereGeometry(0.03, 10, 8), skin, null, 0, 1.66, -0.215).scale.set(0.9, 1.4, 1.1);
    mk(new THREE.BoxGeometry(0.07, 0.012, 0.02), lip, null, 0, 1.6, -0.2);

    // Gözler: beyaz, iris ve kaşlar
    for (const s of [-1, 1]) {
      const ex = s * 0.08;
      mk(new THREE.SphereGeometry(0.034, 12, 10), white, null, ex, 1.72, -0.196).scale.set(1.2, 0.85, 0.5);
      mk(new THREE.SphereGeometry(0.018, 10, 8), eyeM, null, ex, 1.72, -0.205);
      const brow = mk(new THREE.BoxGeometry(0.075, 0.016, 0.02), hairM, null, ex, 1.78, -0.2);
      brow.rotation.z = s * 0.12;
    }

    // Saç
    if (a.hair === 'short' || a.hair === 'long') {
      mk(new THREE.SphereGeometry(0.232, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, null, 0, 1.72, 0.01)
        .scale.set(0.95, 1.1, 1.02);
    }
    if (a.hair === 'long') {
      mk(new THREE.BoxGeometry(0.4, 0.52, 0.12), hairM, null, 0, 1.45, 0.14);
    }
    if (a.hair === 'curly') {
      for (let i = 0; i < 14; i++) {
        const t = i / 14 * Math.PI * 2;
        mk(new THREE.SphereGeometry(0.075, 12, 10), hairM, null, Math.cos(t) * 0.19, 1.8 + (i % 2) * 0.04, Math.sin(t) * 0.19);
      }
      mk(new THREE.SphereGeometry(0.15, 16, 12), hairM, null, 0, 1.86, 0.01);
    }

    // Baş giysisi
    if (a.headwear === 'hijab') {
      // Yüz açık kalacak şekilde ön kısmı boş bırakılmış kubbe ve boyun örtüsü
      const cover = mk(new THREE.SphereGeometry(0.245, 28, 18, -Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.6), headCover, null, 0, 1.7, 0);
      cover.scale.set(0.98, 1.12, 1.02);
      const drape = mk(new THREE.CylinderGeometry(0.22, 0.25, 0.36, 26, 1, true, Math.PI + 0.85, Math.PI * 2 - 1.7), coverDouble, null, 0, 1.45, 0);
      drape.scale.set(1.2, 1, 1);
    }
    if (a.headwear === 'cap') {
      mk(new THREE.SphereGeometry(0.236, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), headCover, null, 0, 1.72, 0)
        .scale.set(0.96, 1.08, 1.0);
      mk(new THREE.BoxGeometry(0.26, 0.02, 0.16), headCover, null, 0, 1.78, -0.2).rotation.x = -0.1;
    }
    if (a.headwear === 'beret') {
      const b = mk(new THREE.SphereGeometry(0.25, 24, 12), headCover, null, 0.02, 1.9, 0.02);
      b.scale.set(1.05, 0.28, 1.05);
      b.rotation.z = -0.15;
    }

    // Gözlük
    if (a.glasses === 'round') {
      for (const s of [-1, 1]) {
        mk(new THREE.TorusGeometry(0.05, 0.007, 8, 22), frameM, null, s * 0.08, 1.72, -0.218);
      }
      mk(new THREE.BoxGeometry(0.03, 0.006, 0.006), frameM, null, 0, 1.73, -0.218);
    }
    if (a.glasses === 'square') {
      for (const s of [-1, 1]) {
        const cx = s * 0.08, cy = 1.72, z = -0.218, w = 0.1, h = 0.07, t = 0.008;
        mk(new THREE.BoxGeometry(w, t, t), frameM, null, cx, cy + h / 2, z);
        mk(new THREE.BoxGeometry(w, t, t), frameM, null, cx, cy - h / 2, z);
        mk(new THREE.BoxGeometry(t, h, t), frameM, null, cx - w / 2, cy, z);
        mk(new THREE.BoxGeometry(t, h, t), frameM, null, cx + w / 2, cy, z);
      }
      mk(new THREE.BoxGeometry(0.03, 0.006, 0.006), frameM, null, 0, 1.73, -0.218);
    }

    // Bacaklar (kalça pivotu) ve kollar (omuz pivotu)
    for (const side of [-1, 1]) {
      const key = side < 0 ? 'L' : 'R';

      const hip = new THREE.Group();
      hip.position.set(side * 0.11, 0.8, 0);
      inner.add(hip);
      mk(new THREE.CylinderGeometry(0.08, 0.07, 0.42, 14), pants, hip, 0, -0.21, 0).castShadow = true;
      mk(new THREE.CylinderGeometry(0.065, 0.055, 0.42, 14), pants, hip, 0, -0.63, 0);
      mk(new THREE.BoxGeometry(0.12, 0.08, 0.26), shoeM, hip, 0, -0.86, -0.05);
      parts['leg' + key] = hip;

      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.31, 1.46, 0);
      inner.add(shoulder);
      mk(new THREE.SphereGeometry(0.065, 14, 10), shirt, shoulder, 0, 0, 0);
      mk(new THREE.CylinderGeometry(0.055, 0.047, 0.32, 14), shirt, shoulder, 0, -0.18, 0);
      mk(new THREE.CylinderGeometry(0.046, 0.04, 0.28, 14), skin, shoulder, 0, -0.46, 0);
      mk(new THREE.SphereGeometry(0.05, 12, 10), skin, shoulder, 0, -0.62, 0).scale.set(0.9, 1.3, 0.7);
      parts['arm' + key] = shoulder;
    }

    // El kaldırma işareti (sınıfta el kaldırınca görünür)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    hand.position.set(0, 2.45 * a.height, 0);
    hand.visible = false;
    group.add(hand);

    return { group, parts, hand };
  }

  window.AvatarKit = { DEFAULT, sanitize, build };

  // Sınıf sayfasında "Avatarım" bağlantısını menüye ekle
  if (location.pathname === '/' || location.pathname.endsWith('/index.html')) {
    document.addEventListener('DOMContentLoaded', () => {
      const hud = document.getElementById('hud');
      if (!hud) return;
      const a = document.createElement('a');
      a.href = '/avatar.html';
      a.className = 'btn ghost';
      a.textContent = '🧍 Avatarım';
      a.style.cssText = 'display:block;margin-top:8px;text-align:center;text-decoration:none';
      hud.appendChild(a);
    });
  }
})();
