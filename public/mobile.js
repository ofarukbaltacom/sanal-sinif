// Telefonda HUD menüsü ve oturunca görünen Kalk düğmesi
(function () {
  if (!window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;

  // Menü düğmesi (☰)
  const menuBtn = document.createElement('button');
  menuBtn.id = 'hudToggle';
  menuBtn.className = 'btn ghost';
  menuBtn.type = 'button';
  menuBtn.textContent = '☰';
  menuBtn.setAttribute('aria-label', 'Menüyü aç veya kapat');
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    document.body.classList.toggle('hud-open');
  });
  document.body.appendChild(menuBtn);

  // Oturunca görünen büyük Kalk düğmesi
  const standBtn = document.createElement('button');
  standBtn.id = 'mobileStand';
  standBtn.className = 'btn danger';
  standBtn.type = 'button';
  standBtn.textContent = '🪑 Kalk';
  standBtn.style.cssText =
    'position:fixed;top:64px;right:8px;z-index:15;padding:12px 16px;' +
    'font-size:15px;border-radius:12px;display:none;box-shadow:0 8px 24px rgba(0,0,0,.4)';
  standBtn.addEventListener('click', () => {
    const real = document.getElementById('standBtn');
    if (real) real.click();
  });
  document.body.appendChild(standBtn);

  // Orijinal Kalk düğmesi görünür olduğunda (yani oturulduğunda) bizimkini göster
  setInterval(() => {
    const real = document.getElementById('standBtn');
    const seated = !!real && real.style.display === 'block';
    standBtn.style.display = seated ? 'block' : 'none';
  }, 250);
})();
