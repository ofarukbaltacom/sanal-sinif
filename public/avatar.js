// Avatar sistemi: sınıf sahnesinde ve avatar düzenleme sayfasında kullanılır.
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

  // Avatar grubunu oluşturur. Yüz -z yönüne bakar.
  function build(THREE, raw) {
    const a = sanitize(raw);
    const M = c => new THREE.MeshLambertMaterial({ color: c });
    const group = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.set(a.build, a.height, a.build);
    group.add(inner);
    const parts = {};

    const add = (geo, material, x, y, z) => {
      const o = new THREE.Mesh(geo, material);
      o.position.set(x, y, z);
      o.castShadow = true;
      inner.add(o);
      return o;
    };

    // Gövde, kafa, burun, gözler
    add(new THREE.CylinderGeometry(0.28, 0.3, 0.9, 16), M(a.shirt), 0, 0.95, 0);
    add(new THREE.SphereGeometry(0.24, 16, 16), M(a.skin), 0, 1.5, 0);
    add(new THREE.SphereGeometry(0.03, 8, 8), M(a.skin), 0, 1.47, -0.245);
    for (const ex of [-0.08, 0.08]) {
      add(new THREE.SphereGeometry(0.035, 8, 8), M(a.eyes), ex, 1.54, -0.23);
    }

    // Saç
    const hairM = M(a.hairColor);
    if (a.hair === 'short' || a.hair === 'long') {
      add(new THREE.SphereGeometry(0.255, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, 0, 1.52, 0.01);
    }
    if (a.hair === 'long') {
      add(new THREE.BoxGeometry(0.46, 0.5, 0.14), hairM, 0, 1.3, 0.17);
    }
    if (a.hair === 'curly') {
      for (let i = 0; i < 8; i++) {
        const t = i / 8 * Math.PI * 2;
        add(new THREE.SphereGeometry(0.09, 10, 8), hairM, Math.cos(t) * 0.19, 1.66, Math.sin(t) * 0.19);
      }
    }

    // Baş giysisi
    if (a.headwear === 'hijab') {
      // Arka yarı küre: yüz açık kalır
      add(new THREE.SphereGeometry(0.285, 20, 14, 0, Math.PI, 0, Math.PI * 0.62), M(a.headColor), 0, 1.5, 0);
      const cloth = new THREE.MeshLambertMaterial({ color: a.headColor, side: THREE.DoubleSide });
      add(new THREE.CylinderGeometry(0.3, 0.36, 0.3, 16, 1, true), cloth, 0, 1.22, 0);
    }
    if (a.headwear === 'cap') {
      add(new THREE.SphereGeometry(0.252, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M(a.headColor), 0, 1.5, 0);
      add(new THREE.BoxGeometry(0.28, 0.02, 0.18), M(a.headColor), 0, 1.6, -0.27);
    }
    if (a.headwear === 'beret') {
      const b = add(new THREE.SphereGeometry(0.27, 16, 10), M(a.headColor), 0.03, 1.73, 0);
      b.scale.set(1.05, 0.3, 1.05);
    }

    // Gözlük
    const frameM = new THREE.LineBasicMaterial({ color: 0x111111 });
    if (a.glasses === 'round') {
      for (const ex of [-0.08, 0.08]) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 8, 20), M(0x1d1d1d));
        r.position.set(ex, 1.54, -0.238);
        inner.add(r);
      }
    }
    if (a.glasses === 'square') {
      for (const ex of [-0.08, 0.08]) {
        const r = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.12, 0.08, 0.01)), frameM);
        r.position.set(ex, 1.54, -0.238);
        inner.add(r);
      }
    }

    // Bacaklar ve kollar
    for (const side of [-1, 1]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.14, 0.5, 0);
      inner.add(legPivot);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), M(a.pants));
      leg.position.y = -0.275;
      leg.castShadow = true;
      legPivot.add(leg);

      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.38, 1.2, 0);
      inner.add(armPivot);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), M(a.shirt));
      arm.position.y = -0.275;
      arm.castShadow = true;
      armPivot.add(arm);

      parts[side < 0 ? 'legL' : 'legR'] = legPivot;
      parts[side < 0 ? 'armL' : 'armR'] = armPivot;
    }

    // El kaldırma işareti
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
