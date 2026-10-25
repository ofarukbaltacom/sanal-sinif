// Telefonda HUD menüsünü açıp kapatan düğme
(function () {
  if (!window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;

  const btn = document.createElement('button');
  btn.id = 'hudToggle';
  btn.className = 'btn ghost';
  btn.type = 'button';
  btn.textContent = '☰';
  btn.setAttribute('aria-label', 'Menüyü aç veya kapat');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.body.classList.toggle('hud-open');
  });
  document.body.appendChild(btn);
})();