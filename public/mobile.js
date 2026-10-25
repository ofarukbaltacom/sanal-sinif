// Mobil düzen yardımcıları: menü, Kalk düğmesi, dışa tıklayınca kapanma.
(function () {
  if (!window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;

  // Menü düğmesi (☰)
  const menuBtn = document.createElement('button');
  menuBtn.id = 'hudToggle';
  menuBtn.type = 'button';
  menuBtn.textContent = '☰';
  menuBtn.setAttribute('aria-label', 'Menüyü aç veya kapat');
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    document.body.classList.toggle('hud-open');
  });
  document.body.appendChild(menuBtn);

  // Menü dışına dokununca kapat
  document.addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('hud-open')) return;
    const hud = document.getElementById('hud');
    if (hud && !hud.contains(e.target) && e.target !== menuBtn) {
      document.body.classList.remove('hud-open');
    }
  });

  // Menüden bir düğmeye basınca menüyü kapat (oda değiştirme, çıkış vb. hariç açık kalabilir)
  const hud = document.getElementById('hud');
  if (hud) {
    hud.addEventListener('click', e => {
      if (e.target.closest('button, a') && !e.target.closest('select')) {
        const keepOpen = e.target.closest('#profileBtn, #helpBtn, #teacherBtn, #fullBtn, #qualitySel');
        if (!keepOpen) document.body.classList.remove('hud-open');
      }
    });
  }

  // Kalk düğmesi: oturulduğunda görünür, gizli orijinal düğmeyi tetikler
  const standBtn = document.createElement('button');
  standBtn.id = 'mobileStand';
  standBtn.type = 'button';
  standBtn.className = 'btn danger';
  standBtn.textContent = '🪑 Kalk';
  standBtn.style.display = 'none';
  standBtn.addEventListener('click', () => {
    const real = document.getElementById('standBtn');
    if (real) real.click();
  });
  document.body.appendChild(standBtn);

  let lastSeated = null;
  setInterval(() => {
    const real = document.getElementById('standBtn');
    const seated = !!real && real.style.display === 'block';
    if (seated !== lastSeated) {
      lastSeated = seated;
      standBtn.style.display = seated ? 'block' : 'none';
    }
  }, 200);
})();
