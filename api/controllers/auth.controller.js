// api/controllers/auth.controller.js
const sql  = require('mssql');
const jwt  = require('jsonwebtoken');

/* ====================== REGISTRAR USUARIO ====================== */
// Crea usuario de tipo: usuario / operador / admin
exports.registrar = async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ ok: false, msg: 'Faltan datos' });
    }

    // 1) Verificar que el correo no exista
    let r = await new sql.Request()
      .input('email', sql.NVarChar, email)
      .query(`
        SELECT TOP 1 id
        FROM Usuarios
        WHERE LTRIM(RTRIM(email)) = LTRIM(RTRIM(@email));
      `);

    if (r.recordset.length) {
      return res.status(400).json({ ok: false, msg: 'Ese correo ya está registrado' });
    }

    // 2) Buscar rol_id en tabla Roles (usuario / operador / admin)
    const nombreRol = (rol || 'usuario').toLowerCase(); // por defecto "usuario"

    r = await new sql.Request()
      .input('nombre', sql.VarChar, nombreRol)
      .query(`
        SELECT id
        FROM Roles
        WHERE nombre = @nombre;
      `);

    if (!r.recordset.length) {
      return res.status(400).json({ ok: false, msg: 'Rol inválido' });
    }

    const rol_id = r.recordset[0].id;

    // 3) Insertar usuario con hash de contraseña
    await new sql.Request()
      .input('nombre', sql.NVarChar, nombre)
      .input('email',  sql.NVarChar, email)
      .input('pass',   sql.NVarChar, password)
      .input('rol_id', sql.Int,      rol_id)
      .query(`
        INSERT INTO Usuarios (nombre, email, hash_password, rol_id, activo, creado_en)
        VALUES (
          LTRIM(RTRIM(@nombre)),
          LTRIM(RTRIM(@email)),
          LOWER(CONVERT(VARCHAR(64),
            HASHBYTES('SHA2_256',
              CONVERT(VARCHAR(200), LTRIM(RTRIM(@pass)), 0)
            ), 2)),
          @rol_id,
          1,
          SYSDATETIME()
        );
      `);

    return res.json({ ok: true, msg: 'Usuario creado correctamente' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error de servidor' });
  }
};

/* ========================= LOGIN ========================= */
// tu login tal cual lo tenías
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const r = await new sql.Request()
      .input('email', sql.NVarChar, email)
      .input('pass',  sql.NVarChar, password)
      .query(`
        SELECT TOP 1
          u.id, u.nombre, u.email, ISNULL(r.nombre,'') AS rol
        FROM Usuarios u
        LEFT JOIN Roles r ON r.id = u.rol_id
        WHERE LTRIM(RTRIM(u.email)) = LTRIM(RTRIM(@email))
          AND u.activo = 1
          AND LTRIM(RTRIM(LOWER(CAST(u.hash_password AS NVARCHAR(64))))) =
              LOWER(CONVERT(VARCHAR(64),
                    HASHBYTES('SHA2_256',
                      CONVERT(VARCHAR(200), LTRIM(RTRIM(@pass)), 0)
                    ), 2));
      `);

    if (!r.recordset.length) return res.status(401).json({ msg: 'Credenciales incorrectas' });

    const { id, nombre, rol } = r.recordset[0];
    const token = jwt.sign({ sub: id, rol, email }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ id, nombre, rol, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: 'Error de servidor' });
  }
};
