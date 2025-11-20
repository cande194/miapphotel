// api/middlewares/auth.js
const jwt = require('jsonwebtoken');

exports.requireAuth = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ msg: 'No autorizado' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { sub, rol, email }
    next();
  } catch {
    return res.status(401).json({ msg: 'Token inválido' });
  }
};

exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ msg: 'No autorizado' });
  if (!roles.includes(req.user.rol)) return res.status(403).json({ msg: 'Prohibido' });
  next();
};
