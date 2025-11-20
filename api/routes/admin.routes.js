// api/routes/admin.routes.js
const express = require('express');
const sql = require('mssql');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

// 🔒 Todas las rutas acá requieren estar logueado
router.use(requireAuth);

/* ===================== Helpers ===================== */
async function getHabitCols() {
  const rq = new sql.Request();
  const rs = await rq.query(`
    SELECT LOWER(c.name) AS col
    FROM sys.columns c
    JOIN sys.tables  t ON t.object_id = c.object_id
    WHERE t.name = 'Habitaciones';
  `);
  const cols = (rs.recordset || []).map(r => r.col);

  const pick = (exact = [], contains = []) => {
    for (const e of exact) if (cols.includes(e)) return e;
    for (const frag of contains) {
      const c = cols.find(x => x.includes(frag));
      if (c) return c;
    }
    return null;
  };

  return {
    cols,
    col_num:   pick(['numero'], ['num','nro']),
    col_piso:  pick(['piso'], ['piso','floor']),
    col_tipo:  pick(['tipo_id'], ['tipo_id','type_id','id_tipo','tipo']),
    col_est:   pick(['estado','estado_habitacion','status'], ['estado','status','dispon']),
    col_fecha: pick(['fecha_estado'], ['fecha_est','f_estado','fech_estado'])
  };
}

/* ===================== Habitaciones ===================== */

/**
 * GET /api/admin/habitaciones
 * - Si NO viene ?fecha= -> usa la tabla Habitaciones como siempre (estado actual).
 * - Si viene ?fecha=YYYY-MM-DD -> mira primero HabitacionesEstado para esa fecha;
 *   si no hay registro para ese día, usa el estado actual de Habitaciones.
 */
router.get('/habitaciones', requireRole('admin','operador'), async (req, res) => {
  try {
    const fechaParam = req.query.fecha; // '2025-11-19' por ej.
    const rq = new sql.Request();

    let sqlText;

    if (fechaParam) {
      // Hay fecha -> usar historial
      rq.input('f', sql.Date, fechaParam);

      sqlText = `
        -- Aseguro tabla HabitacionesEstado
        IF OBJECT_ID('HabitacionesEstado') IS NULL
        BEGIN
          CREATE TABLE HabitacionesEstado(
            id            INT IDENTITY PRIMARY KEY,
            habitacion_id INT NOT NULL,
            fecha         DATE NOT NULL,
            estado        VARCHAR(40) NOT NULL,
            CONSTRAINT UQ_HabitacionesEstado UNIQUE (habitacion_id, fecha)
          );
        END;

        SELECT
          h.id,
          h.numero,
          h.piso,
          th.nombre AS tipo_db,
          CASE
            WHEN th.nombre LIKE 'EstandarSuperior_%' THEN N'Estándar con Vistas'
            WHEN th.nombre LIKE 'Estandar_%'         THEN N'Estándar'
            WHEN th.nombre LIKE 'SuiteJunior_%'      THEN N'Suite Junior'
            WHEN th.nombre LIKE 'SuitePremium_%'     THEN N'Suite Presidencial'
            WHEN th.nombre LIKE 'Premium_%'          THEN N'Premium'
            ELSE th.nombre
          END AS tipo,
          -- estado para la fecha elegida (si hay), si no el actual
          estado       = ISNULL(he.estado, h.estado),
          -- fecha que se muestra: la del registro de historial, o la fecha_estado actual
          fecha_estado = ISNULL(he.fecha, h.fecha_estado)
        FROM Habitaciones h
        LEFT JOIN TiposHabitacion th
          ON th.id = h.tipo_id
        LEFT JOIN HabitacionesEstado he
          ON he.habitacion_id = h.id
         AND he.fecha = @f
        ORDER BY h.piso, h.numero;
      `;
    } else {
      // Sin fecha -> comportamiento viejo (estado actual)
      sqlText = `
        SELECT
          h.id,
          h.numero,
          h.piso,
          th.nombre AS tipo_db,
          CASE
            WHEN th.nombre LIKE 'EstandarSuperior_%' THEN N'Estándar con Vistas'
            WHEN th.nombre LIKE 'Estandar_%'         THEN N'Estándar'
            WHEN th.nombre LIKE 'SuiteJunior_%'      THEN N'Suite Junior'
            WHEN th.nombre LIKE 'SuitePremium_%'     THEN N'Suite Presidencial'
            WHEN th.nombre LIKE 'Premium_%'          THEN N'Premium'
            ELSE th.nombre
          END AS tipo,
          h.estado,
          h.fecha_estado
        FROM Habitaciones h
        LEFT JOIN TiposHabitacion th ON th.id = h.tipo_id
        ORDER BY h.piso, h.numero;
      `;
    }

    const r = await rq.query(sqlText);
    res.json(r.recordset);
  } catch (e) {
    console.error('Error al listar habitaciones:', e);
    res.status(500).json({ msg: 'Error al listar habitaciones' });
  }
});

// Cambiar estado (admin u operador) — acepta PATCH y PUT
// AHORA guarda en Habitaciones y en HabitacionesEstado (por fecha).
const changeRoomState = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const raw = (req.body && (req.body.estado ?? req.body.action ?? req.body.acc ?? req.body.status)) || '';
    const bodyEstado = String(raw).toLowerCase().trim();

    const map = {
      abrir: 'abierta',
      abierta: 'abierta',
      disponible: 'abierta',
      ocupar: 'cerrada',
      ocupada: 'cerrada',
      cerrar: 'cerrada',
      mantenimiento: 'mantenimiento'
    };

    const nuevoEstado = map[bodyEstado];
    if (!id || !nuevoEstado) {
      return res.status(400).json({ msg: 'Parámetros inválidos', id, bodyEstado });
    }

    const { col_est, col_fecha } = await getHabitCols();
    if (!col_est) {
      return res.status(500).json({ msg: 'No se encontró columna estado en Habitaciones' });
    }

    // Fecha que viene del front (ej: "2025-11-19"), o hoy si no vino nada
    const fechaBruta = req.body?.fecha_estado || req.body?.fecha || null;
    const fechaISO = (fechaBruta ? new Date(fechaBruta) : new Date())
      .toISOString()
      .slice(0, 10); // YYYY-MM-DD

    // Aseguro tabla de historial
    await new sql.Request().query(`
      IF OBJECT_ID('HabitacionesEstado') IS NULL
      BEGIN
        CREATE TABLE HabitacionesEstado(
          id            INT IDENTITY PRIMARY KEY,
          habitacion_id INT NOT NULL,
          fecha         DATE NOT NULL,
          estado        VARCHAR(40) NOT NULL,
          CONSTRAINT UQ_HabitacionesEstado UNIQUE (habitacion_id, fecha)
        );
      END
    `);

    const rq = new sql.Request()
      .input('id', sql.Int, id)
      .input('estado', sql.VarChar(40), nuevoEstado)
      .input('f', sql.Date, fechaISO);

    // 1) Actualizo tabla principal Habitaciones
    // 2) UPSERT en tabla historial HabitacionesEstado
    let sqlText = `
      UPDATE Habitaciones
      SET [${col_est}] = @estado
          ${col_fecha ? `, [${col_fecha}] = @f` : ''}
      WHERE id = @id;

      IF EXISTS (
        SELECT 1 FROM HabitacionesEstado
        WHERE habitacion_id = @id AND fecha = @f
      )
      BEGIN
        UPDATE HabitacionesEstado
        SET estado = @estado
        WHERE habitacion_id = @id AND fecha = @f;
      END
      ELSE
      BEGIN
        INSERT INTO HabitacionesEstado(habitacion_id, fecha, estado)
        VALUES(@id, @f, @estado);
      END;
    `;

    await rq.query(sqlText);

    return res.json({ ok: true, id, estado: nuevoEstado, fecha_estado: fechaISO });
  } catch (e) {
    console.error('changeRoomState error:', e);
    return res.status(500).json({ msg: 'No se pudo actualizar' });
  }
};

router.patch('/habitaciones/:id/estado', requireRole('admin','operador'), changeRoomState);
router.put  ('/habitaciones/:id/estado', requireRole('admin','operador'), changeRoomState);

// Crear (solo admin)
router.post('/habitaciones', requireRole('admin'), async (req,res)=>{
  try{
    const { numero, piso, tipo_id, estado } = req.body||{};
    const { col_num, col_piso, col_tipo, col_est } = await getHabitCols();
    if(!col_num || !col_piso || !col_tipo){
      return res.status(500).json({msg:'Faltan columnas en Habitaciones'});
    }
    const rq = new sql.Request();
    rq.input('numero', sql.VarChar(30), numero);
    rq.input('piso', sql.Int, piso);
    rq.input('tipo', sql.Int, tipo_id);
    if (col_est) rq.input('estado', sql.VarChar(40), (estado||'abierta').toLowerCase());

    const r = await rq.query(`
      INSERT INTO Habitaciones([${col_num}],[${col_piso}],[${col_tipo}]${col_est?`,[${col_est}]`:''})
      VALUES(@numero,@piso,@tipo${col_est?',@estado':''});
      SELECT SCOPE_IDENTITY() AS id;
    `);
    res.status(201).json({ id: r.recordset[0].id });
  }catch(e){
    console.error(e);
    res.status(500).json({msg:'No se pudo crear'});
  }
});

// Editar (solo admin)
router.put('/habitaciones/:id', requireRole('admin'), async (req,res)=>{
  try{
    const id = parseInt(req.params.id,10);
    const { numero, piso, tipo_id, estado } = req.body||{};
    if(!id) return res.status(400).json({msg:'ID inválido'});

    const { col_num, col_piso, col_tipo, col_est } = await getHabitCols();
    if(!col_num || !col_piso || !col_tipo){
      return res.status(500).json({msg:'Faltan columnas en Habitaciones'});
    }

    const rq = new sql.Request();
    rq.input('id', sql.Int, id);
    rq.input('numero', sql.VarChar(30), numero);
    rq.input('piso', sql.Int, piso);
    rq.input('tipo', sql.Int, tipo_id);
    if (col_est) rq.input('estado', sql.VarChar(40), (estado||'abierta').toLowerCase());

    await rq.query(`
      UPDATE Habitaciones
      SET [${col_num}]=@numero, [${col_piso}]=@piso, [${col_tipo}]=@tipo
          ${col_est?`, [${col_est}]=@estado`:''}
      WHERE id=@id;
    `);
    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({msg:'No se pudo actualizar'});
  }
});

// Eliminar (solo admin)
router.delete('/habitaciones/:id', requireRole('admin'), async (req,res)=>{
  try{
    const id = parseInt(req.params.id,10);
    if(!id) return res.status(400).json({msg:'ID inválido'});
    await new sql.Request().input('id', sql.Int, id)
      .query(`DELETE FROM Habitaciones WHERE id=@id;`);
    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({msg:'No se pudo eliminar'});
  }
});


/* ===================== Usuarios (solo admin) ===================== */
router.get('/usuarios', requireRole('admin'), async (_req, res) => {
  try {
    const r = await new sql.Request().query(`
      SELECT u.id, u.nombre, u.email, u.activo, r.nombre AS rol
      FROM Usuarios u
      LEFT JOIN Roles r ON r.id = u.rol_id
      ORDER BY u.id DESC;
    `);
    res.json(r.recordset);
  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: 'Error al listar usuarios' });
  }
});

/* ===================== Reservas (admin u operador) ===================== */
// Listado “fuzzy” por si cambian nombres
router.get('/reservas', requireRole('admin','operador'), async (_req, res) => {
  try {
    const rq = new sql.Request();

    const colsRes = await rq.query(`
      SELECT LOWER(c.name) AS col
      FROM sys.columns c
      JOIN sys.tables  t ON t.object_id = c.object_id
      WHERE t.name = 'Reservas';
    `);
    const cols = (colsRes.recordset || []).map(r => r.col);

    const pick = (columns, exact = [], contains = []) => {
      for (const e of exact) if (columns.includes(e)) return e;
      for (const frag of contains) {
        const c = columns.find(x => x.includes(frag));
        if (c) return c;
      }
      return null;
    };

    const col_fd  = pick(cols, ['fecha_desde','fecha_inicio','check_in','desde'], ['fecha_des','fdesde','inicio','checkin','desde']);
    const col_fh  = pick(cols, ['fecha_hasta','fecha_fin','check_out','hasta'], ['fecha_has','fhasta','fin','checkout','hasta']);
    const col_est = pick(cols, ['estado','estado_reserva','status'], ['estado','estatus','status']);
    const col_hid = pick(cols, ['habitacion_id','id_habitacion'], ['habit','hab_id','id_hab']);
    const col_cid = pick(cols, ['cliente_id','id_cliente','usuario_id'], ['client','usuari','huesped','titular']);

    const meta2 = await rq.query(`
      SELECT
        tiene_hab = CASE WHEN OBJECT_ID('Habitaciones')    IS NOT NULL THEN 1 ELSE 0 END,
        tiene_th  = CASE WHEN OBJECT_ID('TiposHabitacion') IS NOT NULL THEN 1 ELSE 0 END,
        tiene_cli = CASE WHEN OBJECT_ID('Clientes')         IS NOT NULL THEN 1 ELSE 0 END,
        tiene_usu = CASE WHEN OBJECT_ID('Usuarios')         IS NOT NULL THEN 1 ELSE 0 END
    `);
    const M = meta2.recordset[0] || {tiene_hab:0,tiene_th:0,tiene_cli:0,tiene_usu:0};

    let select = `SELECT res.id`;
    if (col_fd)  select += `, res.[${col_fd}] AS fecha_desde`; else select += `, CAST(NULL AS DATETIME) AS fecha_desde`;
    if (col_fh)  select += `, res.[${col_fh}] AS fecha_hasta`; else select += `, CAST(NULL AS DATETIME) AS fecha_hasta`;
    if (col_est) select += `, res.[${col_est}] AS estado`;     else select += `, CAST(NULL AS VARCHAR(30)) AS estado`;

    let joins = ` FROM Reservas res `;
    if (col_hid && M.tiene_hab) {
      select += `, h.numero AS habitacion`;
      joins  += ` LEFT JOIN Habitaciones h ON h.id = res.[${col_hid}]`;
      if (M.tiene_th) {
        select += `, th.nombre AS tipo`;
        joins  += ` LEFT JOIN TiposHabitacion th ON th.id = h.tipo_id`;
      } else {
        select += `, CAST(NULL AS VARCHAR(40)) AS tipo`;
      }
    } else {
      select += `, CAST(NULL AS VARCHAR(20)) AS habitacion, CAST(NULL AS VARCHAR(40)) AS tipo`;
    }

    if (col_cid && M.tiene_cli) {
      select += `, cli.nombre AS cliente, cli.email AS email_cliente`;
      joins  += ` LEFT JOIN Clientes cli ON cli.id = res.[${col_cid}]`;
    } else if (col_cid && M.tiene_usu) {
      select += `, u.nombre AS cliente, u.email AS email_cliente`;
      joins  += ` LEFT JOIN Usuarios u ON u.id = res.[${col_cid}]`;
    } else {
      select += `, CAST(NULL AS VARCHAR(80)) AS cliente, CAST(NULL AS VARCHAR(80)) AS email_cliente`;
    }

    const q = `${select} ${joins} ORDER BY res.id DESC;`;
    const r = await rq.query(q);
    res.json(r.recordset);
  } catch (e) {
    console.error('RESERVAS error:', e);
    res.status(500).json({ msg: 'Error al listar reservas' });
  }
});

/* ====== PAGOS DE RESERVA (admin u operador) ================================= */

// GET: resumen de pagos (total/pagado/saldo)
router.get('/reservas/:id/pagos', requireRole('admin','operador'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ msg: 'ID inválido' });

    // Asegurar tabla Pagos
    await new sql.Request().query(`
      IF OBJECT_ID('Pagos') IS NULL
      BEGIN
        CREATE TABLE Pagos(
          id         INT IDENTITY PRIMARY KEY,
          reserva_id INT NOT NULL,
          fecha      DATETIME NOT NULL DEFAULT GETDATE(),
          monto      DECIMAL(18,2) NOT NULL,
          medio      VARCHAR(30) NULL,
          moneda     VARCHAR(10) NULL,
          obs        VARCHAR(200) NULL
        );
        CREATE INDEX IX_Pagos_reserva_id ON Pagos(reserva_id);
      END
    `);

    // Traer total de la reserva (y estado actual por si hace falta)
    const rTot = await new sql.Request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 total, estado FROM Reservas WHERE id=@id;`);

    if (!rTot.recordset.length) return res.status(404).json({ msg: 'Reserva no encontrada' });

    const total = Number(rTot.recordset[0].total || 0);

    // Suma de pagos
    const rPag = await new sql.Request()
      .input('id', sql.Int, id)
      .query(`SELECT pagado = ISNULL(SUM(monto),0) FROM Pagos WHERE reserva_id=@id;`);

    const pagado = Number(rPag.recordset[0].pagado || 0);
    const saldo  = Number((total - pagado).toFixed(2));

    res.json({ resumen: { total, pagado, saldo } });
  } catch (e) {
    console.error('GET /reservas/:id/pagos error:', e);
    res.status(500).json({ msg: 'Error al obtener pagos' });
  }
});

// POST: registrar un pago y actualizar estado si corresponde
router.post('/reservas/:id/pagos', requireRole('admin','operador'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { medio, monto, moneda, obs } = req.body || {};
    const montoNum = Number(monto);

    if (!id || !montoNum || montoNum <= 0) {
      return res.status(400).json({ msg: 'Datos inválidos' });
    }

    // Traer total de la reserva
    const rTot = await new sql.Request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 total, estado FROM Reservas WHERE id=@id;`);

    if (!rTot.recordset.length) return res.status(404).json({ msg: 'Reserva no encontrada' });

    const total = Number(rTot.recordset[0].total || 0);

    // Pagado hasta ahora
    const rPag = await new sql.Request()
      .input('id', sql.Int, id)
      .query(`SELECT pagado = ISNULL(SUM(monto),0) FROM Pagos WHERE reserva_id=@id;`);

    const pagadoAntes = Number(rPag.recordset[0].pagado || 0);

    // Insertar pago
    await new sql.Request()
      .input('reserva_id', sql.Int, id)
      .input('monto', sql.Decimal(18,2), montoNum)
      .input('medio', sql.VarChar(30), (medio||'').toLowerCase())
      .input('moneda', sql.VarChar(10), (moneda||'ARS').toUpperCase())
      .input('obs', sql.VarChar(200), obs || null)
      .query(`
        INSERT INTO Pagos(reserva_id, monto, medio, moneda, obs)
        VALUES(@reserva_id, @monto, @medio, @moneda, @obs);
      `);

    // Recalcular saldo y actualizar estado
    const pagadoDespues = pagadoAntes + montoNum;
    const saldo = Number((total - pagadoDespues).toFixed(2));

    // Si salda exacto o pasaste, marcamos finalizada; si no, activa
    const nuevoEstado = (saldo <= 0) ? 'finalizada' : 'activa';

    await new sql.Request()
      .input('id', sql.Int, id)
      .input('est', sql.VarChar(30), nuevoEstado)
      .query(`UPDATE Reservas SET estado=@est WHERE id=@id;`);

    res.status(201).json({ ok:true, nuevoEstado, saldo });
  } catch (e) {
    console.error('POST /reservas/:id/pagos error:', e);
    res.status(500).json({ msg: 'Error al registrar pago' });
  }
});

/* ===================== Tipos de Habitación (solo admin) ===================== */
router.get('/tipos-habitacion', requireRole('admin'), async (_req,res)=>{
  const r = await new sql.Request().query(
    `IF OBJECT_ID('TiposHabitacion') IS NULL
       CREATE TABLE TiposHabitacion(id INT IDENTITY PRIMARY KEY, nombre VARCHAR(80) NOT NULL);
     SELECT id, nombre FROM TiposHabitacion ORDER BY nombre;`
  );
  res.json(r.recordset);
});

router.post('/tipos-habitacion', requireRole('admin'), async (req,res)=>{
  const { nombre } = req.body || {};
  if(!nombre) return res.status(400).json({msg:'Falta nombre'});
  const r = await new sql.Request()
    .input('n', sql.VarChar(80), nombre.trim())
    .query(`INSERT INTO TiposHabitacion(nombre) VALUES(@n); SELECT SCOPE_IDENTITY() AS id;`);
  res.status(201).json({ id: r.recordset[0].id, nombre });
});

router.put('/tipos-habitacion/:id', requireRole('admin'), async (req,res)=>{
  const id = +req.params.id, { nombre } = req.body || {};
  if(!id || !nombre) return res.status(400).json({msg:'Datos inválidos'});
  await new sql.Request().input('n', sql.VarChar(80), nombre.trim()).input('id', sql.Int, id)
    .query('UPDATE TiposHabitacion SET nombre=@n WHERE id=@id;');
  res.json({ok:true});
});

router.delete('/tipos-habitacion/:id', requireRole('admin'), async (req,res)=>{
  const id = +req.params.id;
  if(!id) return res.status(400).json({msg:'ID inválido'});
  await new sql.Request().input('id', sql.Int, id)
    .query('DELETE FROM TiposHabitacion WHERE id=@id;');
  res.json({ok:true});
});

/* ===================== Configuración (solo admin) ===================== */
router.get('/config', requireRole('admin'), async (_req,res)=>{
  const r = await new sql.Request().query('SELECT TOP 1 * FROM HotelPerfil ORDER BY id;');
  res.json(r.recordset[0] || null);
});
router.put('/config', requireRole('admin'), async (req,res)=>{
  const { nombre, descripcion, logo_url } = req.body||{};
  const rq = new sql.Request();
  rq.input('n', sql.VarChar(120), nombre||'Hotel');
  rq.input('d', sql.VarChar(1000), descripcion||'');
  rq.input('l', sql.VarChar(300), logo_url||'');
  await rq.query(`
    IF EXISTS(SELECT 1 FROM HotelPerfil)
      UPDATE HotelPerfil SET nombre=@n, descripcion=@d, logo_url=@l;
    ELSE
      INSERT INTO HotelPerfil(nombre,descripcion,logo_url) VALUES(@n,@d,@l);
  `);
  res.json({ok:true});
});

/* ===================== Dashboard ===================== */
// Ocupación actual por estado (admin u operador) – basado en Habitaciones
router.get('/dashboard/ocupacion-actual', requireRole('admin','operador'), async (_req, res) => {
  try {
    const r = await new sql.Request().query(`
      SELECT
        total         = COUNT(*),
        disponibles   = SUM(CASE WHEN LOWER(ISNULL(estado,'')) IN ('abierta','disponible') THEN 1 ELSE 0 END),
        ocupadas      = SUM(CASE WHEN LOWER(ISNULL(estado,'')) IN ('cerrada','ocupada')    THEN 1 ELSE 0 END),
        mantenimiento = SUM(CASE WHEN LOWER(ISNULL(estado,'')) LIKE '%mant%'             THEN 1 ELSE 0 END)
      FROM Habitaciones;
    `);
    return res.json(r.recordset[0]);
  } catch (e) {
    console.error('ocupacion-actual', e);
    return res.status(500).json({ msg: 'Error ocupación' });
  }
});

// Consultas parametrizadas del rango (admin u operador)
router.get('/dashboard/rango', requireRole('admin','operador'), async (req, res) => {
  try {
    const d = req.query.desde ? new Date(req.query.desde) : new Date(Date.now() - 29*86400000);
    const h = req.query.hasta ? new Date(req.query.hasta) : new Date();
    const desde = d.toISOString().slice(0,10);
    const hasta = h.toISOString().slice(0,10);

    const rqCols = new sql.Request();
    const colsRes = await rqCols.query(`
      SELECT LOWER(c.name) col
      FROM sys.columns c
      JOIN sys.tables  t ON t.object_id=c.object_id
      WHERE t.name='Reservas';
    `);
    const C = colsRes.recordset.map(x=>x.col);
    const pick = (exact=[], contains=[]) => {
      for (const e of exact) if (C.includes(e)) return e;
      for (const frag of contains) { const f=C.find(x=>x.includes(frag)); if (f) return f; }
      return null;
    };

    const c_fd  = pick(['fecha_desde','check_in','desde'], ['fec_des','desde','checkin','inicio','entrada']) || 'fecha_desde';
    const c_est = pick(['estado','status'], ['estado','estatus','status']);
    const c_hid = pick(['habitacion_id','id_habitacion'], ['hab','habit']);
    const c_mon = pick(['monto','importe','total','monto_total','precio_total'], ['monto','importe','total']);

    const rq = new sql.Request();
    rq.input('d', sql.Date, desde);
    rq.input('h', sql.Date, hasta);

    const ingresoExpr = c_mon ? `TRY_CONVERT(DECIMAL(18,2), res.[${c_mon}])` : `CAST(0 AS DECIMAL(18,2))`;

    const sqlText = `
      IF OBJECT_ID('tempdb..#R') IS NOT NULL DROP TABLE #R;
      SELECT
        f        = CONVERT(date, res.[${c_fd}]),
        estado   = LOWER(ISNULL(${c_est ? `res.[${c_est}]` : `NULL`}, '')),
        ingreso  = ${ingresoExpr},
        hab_id   = ${c_hid ? `res.[${c_hid}]` : `NULL`}
      INTO #R
      FROM Reservas res
      WHERE CONVERT(date, res.[${c_fd}] ) BETWEEN @d AND @h;

      -- KPIs
      SELECT
        total_reservas = COUNT(*),
        total_ocupadas = SUM(CASE WHEN estado IN ('cerrada','ocupada','finalizada') THEN 1 ELSE 0 END),
        ingresos       = SUM(ingreso)
      FROM #R;

      -- Serie por día
      SELECT f AS fecha, COUNT(*) AS cantidad
      FROM #R
      GROUP BY f
      ORDER BY f;

      -- Estados en el rango
      SELECT estado, COUNT(*) AS cantidad
      FROM #R
      GROUP BY estado
      ORDER BY cantidad DESC;

      -- Top tipos (si tenemos hab_id podemos llegar al tipo)
      ${c_hid ? `
      SELECT TOP 5
        etiqueta = ISNULL(th.nombre,'(s/tipo)'),
        cantidad = COUNT(*)
      FROM #R r
      LEFT JOIN Habitaciones h     ON h.id = r.hab_id
      LEFT JOIN TiposHabitacion th ON th.id = h.tipo_id
      GROUP BY th.nombre
      ORDER BY COUNT(*) DESC, etiqueta ASC;
      ` : `SELECT TOP 0 '' AS etiqueta, 0 AS cantidad;`}
    `;

    const rs = await rq.query(sqlText);

    return res.json({
      kpis:     rs.recordsets[0]?.[0] || { total_reservas:0, total_ocupadas:0, ingresos:0 },
      serie:    rs.recordsets[1] || [],
      estados:  rs.recordsets[2] || [],
      topTipos: rs.recordsets[3] || []
    });
  } catch (e) {
    console.error('dashboard/rango', e);
    return res.status(500).json({ msg: 'Error dashboard', error: String(e) });
  }
});

// Compatibilidad: /api/admin/dashboard (lo que espera tu frontend)
router.get('/dashboard', requireRole('admin'), async (req, res) => {
  try {
    // Rango (default últimos 30 días)
    const d = req.query.desde ? new Date(req.query.desde) : new Date(Date.now() - 29*86400000);
    const h = req.query.hasta ? new Date(req.query.hasta) : new Date();
    const desde = d.toISOString().slice(0,10);
    const hasta = h.toISOString().slice(0,10);

    // Detectar columnas en Reservas
    const rqCols = new sql.Request();
    const colsRes = await rqCols.query(`
      SELECT LOWER(c.name) col
      FROM sys.columns c
      JOIN sys.tables  t ON t.object_id=c.object_id
      WHERE t.name='Reservas';
    `);
    const C = colsRes.recordset.map(x=>x.col);
    const pick = (exact=[], contains=[]) => {
      for (const e of exact) if (C.includes(e)) return e;
      for (const frag of contains) { const f=C.find(x=>x.includes(frag)); if (f) return f; }
      return null;
    };
    const c_fd  = pick(['fecha_desde','check_in','desde'], ['fec_des','desde','checkin','inicio','entrada']) || 'fecha_desde';
    const c_est = pick(['estado','status'], ['estado','estatus','status']);
    const c_hid = pick(['habitacion_id','id_habitacion'], ['hab','habit']);
    const c_mon = pick(['monto','importe','total','monto_total','precio_total'], ['monto','importe','total']);

    const rq = new sql.Request();
    rq.input('d', sql.Date, desde);
    rq.input('h', sql.Date, hasta);

    const ingresoExpr = c_mon ? `TRY_CONVERT(DECIMAL(18,2), res.[${c_mon}])` : `CAST(0 AS DECIMAL(18,2))`;

    // KPIs + series (reservasPorDia, porEstado, topTipos)
    const sqlDashboard = `
      WITH R AS (
        SELECT
          f       = CONVERT(date, res.[${c_fd}]),
          estado  = LOWER(ISNULL(${c_est ? `res.[${c_est}]` : `NULL`}, '')),
          ingreso = ${ingresoExpr},
          habitacion_id = ${c_hid ? `res.[${c_hid}]` : `NULL`}
        FROM Reservas res
        WHERE CONVERT(date, res.[${c_fd}]) BETWEEN @d AND @h
      )
      SELECT
        total_reservas = COUNT(*),
        ocupadas       = SUM(CASE WHEN estado IN ('cerrada','ocupada','finalizada') THEN 1 ELSE 0 END),
        ingresos       = SUM(ingreso)
      FROM R;

      SELECT f AS dia, COUNT(*) AS cantidad
      FROM R GROUP BY f ORDER BY f;

      SELECT estado, COUNT(*) AS cantidad
      FROM R GROUP BY estado ORDER BY cantidad DESC;

      SELECT TOP 6 th.nombre AS tipo, COUNT(*) AS cantidad
      FROM R
      LEFT JOIN Habitaciones h     ON h.id = R.habitacion_id
      LEFT JOIN TiposHabitacion th ON th.id = h.tipo_id
      GROUP BY th.nombre
      ORDER BY COUNT(*) DESC, tipo ASC;
    `;
    const rs = await rq.query(sqlDashboard);

    // Snapshot ocupación actual + total habitaciones
    const rq2 = new sql.Request();
    const [rSnap, rTot] = await Promise.all([
      rq2.query(`
        SELECT
          cerradas      = SUM(CASE WHEN LOWER(ISNULL(estado,'')) IN ('cerrada','ocupada') THEN 1 ELSE 0 END),
          abiertas      = SUM(CASE WHEN LOWER(ISNULL(estado,'')) IN ('abierta','disponible') THEN 1 ELSE 0 END),
          mantenimiento = SUM(CASE WHEN LOWER(ISNULL(estado,'')) LIKE '%mant%' THEN 1 ELSE 0 END)
        FROM Habitaciones;
      `),
      rq2.query(`SELECT total = COUNT(*) FROM Habitaciones;`)
    ]);

    const k = rs.recordsets[0]?.[0] || { total_reservas:0, ocupadas:0, ingresos:0 };
    const reservasPorDia = rs.recordsets[1] || [];
    const porEstado      = rs.recordsets[2] || [];
    const topTipos       = rs.recordsets[3] || [];
    const snap = rSnap.recordset?.[0] || { cerradas:0, abiertas:0, mantenimiento:0 };
    const totalHabitaciones = rTot.recordset?.[0]?.total ?? 0;

    res.json({
      rango: { desde, hasta },
      totalHabitaciones,
      kpis: {
        totalReservas: Number(k.total_reservas||0),
        ocupadas:      Number(k.ocupadas||0),
        ingresos:      k.ingresos==null ? null : Number(k.ingresos)
      },
      series: {
        reservasPorDia,
        porEstado,
        topTipos
      },
      snapshot: snap
    });
  } catch (e) {
    console.error('dashboard compat', e);
    res.status(500).json({ msg: 'Error al generar dashboard' });
  }
});

/* ===================== CREAR NUEVA RESERVA ===================== */
router.post('/reservas', requireRole('usuario', 'operador', 'admin'), async (req, res) => {
  try {
    const {
      habitacion_id,
      nombre,
      email,
      telefono,
      fecha_desde,
      fecha_hasta,
      cant_personas,
      obs
    } = req.body;

    if (!habitacion_id || !nombre || !fecha_desde || !fecha_hasta || !cant_personas) {
      return res.status(400).json({ msg: 'Faltan datos obligatorios' });
    }

    await new sql.Request().query(`
      IF OBJECT_ID('Reservas') IS NULL
      BEGIN
        CREATE TABLE Reservas(
          id             INT IDENTITY PRIMARY KEY,
          habitacion_id  INT NOT NULL,
          nombre         VARCHAR(100) NOT NULL,
          email          VARCHAR(100) NULL,
          telefono       VARCHAR(50) NULL,
          fecha_desde    DATE NOT NULL,
          fecha_hasta    DATE NOT NULL,
          cant_personas  INT NOT NULL,
          estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente',
          obs            VARCHAR(200) NULL,
          fecha_creacion DATETIME NOT NULL DEFAULT GETDATE()
        );
      END
    `);

    const request = new sql.Request();
    request
      .input('habitacion_id', sql.Int, habitacion_id)
      .input('nombre', sql.VarChar(100), nombre)
      .input('email', sql.VarChar(100), email || null)
      .input('telefono', sql.VarChar(50), telefono || null)
      .input('fecha_desde', sql.Date, fecha_desde)
      .input('fecha_hasta', sql.Date, fecha_hasta)
      .input('cant_personas', sql.Int, cant_personas)
      .input('obs', sql.VarChar(200), obs || null);

    const result = await request.query(`
      INSERT INTO Reservas
        (habitacion_id, nombre, email, telefono, fecha_desde, fecha_hasta, cant_personas, obs)
      OUTPUT INSERTED.*
      VALUES
        (@habitacion_id, @nombre, @email, @telefono, @fecha_desde, @fecha_hasta, @cant_personas, @obs);
    `);

    const nuevaReserva = result.recordset[0];

    res.status(201).json({
      msg: 'Reserva creada correctamente',
      reserva: nuevaReserva
    });

  } catch (err) {
    console.error('Error al crear reserva:', err);
    res.status(500).json({ msg: 'Error interno al crear la reserva' });
  }
});

module.exports = router;
