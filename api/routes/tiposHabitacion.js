const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');

// GET /api/tipos-habitacion
router.get('/tipos-habitacion', async (req, res) => {
  try {
    const pool = await getPool();  // ✅ usa la conexión central

    const result = await pool.request().query(`
      SELECT id, nombre, precio_base
      FROM TiposHabitacion
      ORDER BY id
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Error obteniendo tipos de habitación', err);
    res.status(500).json({ msg: 'Error obteniendo tipos de habitación' });
  }
});

module.exports = router;
