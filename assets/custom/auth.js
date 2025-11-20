// assets/custom/auth.js
export function getToken(){ return localStorage.getItem('token'); }
export function getRole(){ return localStorage.getItem('userRole'); }

// assets/custom/auth.js
export function setBackLink() {
  const a = document.getElementById('backLink');
  if (!a) return;
  const role = localStorage.getItem('userRole');
  a.href = (role === 'operador') ? 'operador-panel.html' : 'admin-panel.html';
}

export function requireRoles(...rolesPermitidos) {
  const t = localStorage.getItem('token');
  const r = localStorage.getItem('userRole');
  if (!t || !rolesPermitidos.includes(r)) {
    location.href = 'ingresar-admin.html';
  }
  return r;
}
