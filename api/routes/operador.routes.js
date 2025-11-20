const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');
const requireRole = require('../middlewares/auth'); // si usás roles


// ======================
// HABITACIONES (operador)
// ======================
router.get('/habitaciones', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT h.id, h.numero, h.piso, h.tipo, h.estado
      FROM Habitaciones h
      ORDER BY h.piso, h.numero
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Error obteniendo habitaciones operador:", err);
    res.status(500).json({ msg: "Error en servidor" });
  }
});

// ======================
// RESERVAS (operador)
// ======================
router.get('/reservas', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT *
      FROM Reservas
      ORDER BY fecha_inicio DESC
    `);

    res.json(r.recordset);
  } catch (err) {
    console.error("Error en reservas operador:", err);
    res.status(500).json({ msg: "Error servidor" });
  }
});

module.exports = router;
