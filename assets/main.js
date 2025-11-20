async function login(e) {
  e.preventDefault();

  const body = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  };

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.msg || 'Credenciales inválidas');
    return;
  }

  // Guarda token / usuario si lo usás
  localStorage.setItem('token', data.token);
  localStorage.setItem('usuario', JSON.stringify(data.usuario));

  // 👇 ACÁ ES DONDE DECIDE A QUÉ PANEL IR
  const rol = data.usuario.rol;      // o data.usuario.rol_nombre / rol_id, según tu API

  if (rol === 'admin') {
    window.location.href = '/html/frontend/pages/admin-panel.html';
  } else if (rol === 'operador') {
    // ajustá la ruta a donde tengas el panel del operador
    window.location.href = '/html/frontend/pages/operador-panel.html';
  } else {
    // usuario normal
    window.location.href = '/index.html';
  }
}
