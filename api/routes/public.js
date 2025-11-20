const express = require('express');
const router = express.Router();
const { getPool } = require('../db');

// Ejemplo: obtener habitaciones
router.get('/habitaciones', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        h.id            AS IdHabitacion,
        h.numero        AS Numero,
        h.piso          AS Piso,
        th.nombre       AS Tipo,
        th.descripcion  AS Descripcion,
        th.capacidad    AS Capacidad,
        th.ninos_max    AS NinosMax,
        th.precio_base  AS PrecioBase,
        th.categoria    AS Categoria
      FROM dbo.Habitaciones h
      JOIN dbo.TiposHabitacion th
        ON th.id = h.tipo_id
      ORDER BY h.piso, h.numero;
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error('❌ Error al obtener habitaciones:', error);
    res.status(500).send('Error al conectar con la base de datos');
  }
});


// Ruta de prueba para conexión
router.get('/test-db', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT GETDATE() AS fecha_actual;');
    res.json({
      ok: true,
      mensaje: '✅ Conexión a la base de datos exitosa',
      resultado: result.recordset
    });
  } catch (error) {
    console.error('❌ Error de conexión:', error);
    res.status(500).json({ ok: false, mensaje: 'Error de conexión', error: error.message });
  }
});


module.exports = router;
