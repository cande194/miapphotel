// api/routes/reservas-operador.js
const express = require("express");
const sql = require("mssql");
const { requireAuth, requireRole } = require("../middlewares/auth");

const router = express.Router();

// Todas requieren operador o admin
router.use(requireAuth);
router.use(requireRole("operador", "admin"));

/* ============================================
   GET /api/operador/reservas
   Lista básica para el operador
============================================ */
router.get("/reservas", async (req, res) => {
  try {
    const q = `
      SELECT r.id,
             u.nombre AS cliente,
             u.email AS email_cliente,
             h.numero AS habitacion,
             th.nombre AS tipo,
             r.checkin AS fecha_desde,
             r.checkout AS fecha_hasta,
             r.estado
      FROM Reservas r
        JOIN Usuarios u ON u.id = r.usuario_id
        JOIN Habitaciones h ON h.id = r.habitacion_id
        JOIN TiposHabitacion th ON th.id = h.tipo_id
      ORDER BY r.id DESC;
    `;
    const rs = await new sql.Request().query(q);
    res.json(rs.recordset);
  } catch (err) {
    console.error("Error GET reservas operador:", err);
    res.status(500).send("Error cargando reservas");
  }
});

/* ============================================
   POST /api/operador/reservas
   Crear una reserva usando SP sp_CrearReserva
============================================ */
router.post("/reservas", async (req, res) => {
  try {
    const { usuario_id, habitacion_id, checkin, checkout, total } = req.body;

    if (!usuario_id || !habitacion_id || !checkin || !checkout)
      return res.status(400).send("Faltan campos obligatorios");

    const request = new sql.Request();
    request.input("usuario_id", sql.Int, usuario_id);
    request.input("habitacion_id", sql.Int, habitacion_id);
    request.input("checkin", sql.DateTime2, checkin);
    request.input("checkout", sql.DateTime2, checkout);
    request.input("total", sql.Decimal(12,2), total ?? 0);
    request.output("reserva_id_out", sql.Int);

    await request.execute("sp_CrearReserva");

    res.json({
      ok: true,
      id: request.parameters.reserva_id_out.value
    });
  } catch (err) {
    console.error("Error crear reserva:", err);
    res.status(500).send(err.originalError?.info?.message || "Error al crear reserva");
  }
});

module.exports = router;
