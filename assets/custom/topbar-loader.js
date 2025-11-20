async function mountTopbar(activePage) {
  // 1) Inyecta el HTML del parcial
  const mount = document.getElementById('topbar-mount');
  const res = await fetch('../partials/admin-topbar.html', { cache: 'no-store' });
  mount.innerHTML = await res.text();

  // 2) Protección básica por token/rol
  const token = localStorage.getItem('token');
  const role  = localStorage.getItem('userRole'); // 'admin' | 'operador'
  const name  = localStorage.getItem('userName') || 'Usuario';
  if (!token || (role!=='admin' && role!=='operador')) {
    location.href = 'ingresar-admin.html';
    return;
  }

  // 3) Chip usuario
  document.getElementById('userName').textContent = name;
  const badge = document.getElementById('userRoleBadge');
  badge.textContent = role;
  if (role === 'admin') { badge.style.background='rgba(230,28,93,.12)'; badge.style.color='#e61c5d'; }

  // 4) Menú: oculta ítems por rol
  const nav = document.getElementById('mainNav');
  nav.querySelectorAll('a[data-roles]').forEach(a => {
    const ok = a.getAttribute('data-roles').split(',').map(s=>s.trim());
    if (!ok.includes(role)) a.style.display = 'none';
  });

  // 5) Marca activo según la página
  if (activePage) {
    nav.querySelectorAll('a[data-page]').forEach(a => {
      if (a.dataset.page === activePage) a.classList.add('active');
    });
  }

  // 6) Logout
  document.getElementById('btnLogout')?.addEventListener('click', () => {
    localStorage.clear();
    location.href = 'mi-cuenta.html';
  });
}
