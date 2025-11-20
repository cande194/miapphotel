require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const app = express();
const tiposHabitacionRouter = require('./routes/tiposHabitacion');



app.use(cors());
app.use(express.json());
const reservasOperador = require('./routes/reservas-operador');
app.use('/api/operador', reservasOperador);
// Configuración SQL
const sqlConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASS,
  database: process.env.SQL_DB,
  server: process.env.SQL_SERVER,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: process.env.SQL_INSTANCE
  }
};

// Conexión a SQL Server
sql.connect(sqlConfig)
  .then(() => console.log('✅ Conectado a SQL Server'))
  .catch(err => console.error('❌ Error al conectar a SQL Server:', err));


// =======================
//   RUTAS DE LA APP
// =======================
app.use('/api', require('./routes/public'));
app.use('/api', tiposHabitacionRouter);
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/operator', require('./routes/operador.routes'));


// ======================================================
//   RUTA OBLIGATORIA PARA RECIBIR EL TOKEN DE GOOGLE
// ======================================================
app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("No llegó el código de Google.");
  }

  try {
    const { google } = require("googleapis");
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );

    const { tokens } = await oAuth2Client.getToken(code);

    console.log("👉 TOKENS DE GOOGLE RECIBIDOS:");
    console.log(tokens);

    // Guardar tokens en archivo local
    const fs = require("fs");
    fs.writeFileSync("gmail-tokens.json", JSON.stringify(tokens, null, 2));

    res.send(`
      <h2 style="font-family:Arial">✔ Gmail autorizado correctamente</h2>
      <p>Podés cerrar esta ventana.</p>
    `);

  } catch (err) {
    console.error(err);
    return res.status(500).send("Error al obtener tokens de Google.");
  }
});



// =======================
//  Servidor
// =======================
app.listen(process.env.PORT || 4000, () => {
  console.log('🚀 Servidor backend corriendo en puerto ' + (process.env.PORT || 4000));
});

app.use("/api/mail", require("./routes/mail.routes"));