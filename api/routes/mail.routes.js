// api/routes/mail.routes.js
const express = require("express");
const router = express.Router();
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Ruta absoluta al archivo de tokens
const TOKEN_PATH = path.join(__dirname, "..", "gmail-tokens.json");

// =============== CLIENTE GMAIL DESDE TOKENS ==================
function getGmailClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.log("❌ No existe gmail-tokens.json");
    return null;
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  oAuth2Client.setCredentials(tokens); // muy importante
  return oAuth2Client;
}

/* ============================================================
   LISTAR CORREOS (INBOX + ENVIADOS + SPAM/PAPELERA)
   ============================================================ */
router.get("/leer", async (req, res) => {
  try {
    const client = getGmailClient();
    if (!client) {
      return res.json({ ok: false, error: "No hay tokens cargados" });
    }

    const gmail = google.gmail({ version: "v1", auth: client });

    // Pedimos INBOX y SENT por separado y luego los unimos
    const [inboxRes, sentRes] = await Promise.all([
      gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        includeSpamTrash: true,
        maxResults: 50
      }),
      gmail.users.messages.list({
        userId: "me",
        labelIds: ["SENT"],
        includeSpamTrash: true,
        maxResults: 50
      })
    ]);

    const mensajes = [];
    const vistos = new Set();

    const agregar = (lista) => {
      if (!lista || !lista.messages) return;
      for (const m of lista.messages) {
        if (!vistos.has(m.id)) {
          vistos.add(m.id);
          mensajes.push(m); // { id, threadId }
        }
      }
    };

    agregar(inboxRes.data);
    agregar(sentRes.data);

    return res.json({ ok: true, mensajes });

  } catch (error) {
    console.error("❌ Error al leer correos:", error);
    res.status(500).json({ ok: false, error: "Error al leer Gmail" });
  }
});

/* ============================================================
   LEER CORREO POR ID
   ============================================================ */
router.get("/mensaje/:id", async (req, res) => {
  try {
    const client = getGmailClient();
    if (!client) return res.json({ ok: false, error: "No hay tokens cargados" });

    const gmail = google.gmail({ version: "v1", auth: client });
    const messageId = req.params.id;

    const msg = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full"
    });

    const headers = msg.data.payload.headers || [];
    const getHeader = (name) => {
      const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase());
      return h ? h.value : "";
    };

    // Decodificar cuerpo
    let body = "";
    if (msg.data.payload.parts) {
      const part =
        msg.data.payload.parts.find(p => p.mimeType === "text/html") ||
        msg.data.payload.parts.find(p => p.mimeType === "text/plain");

      if (part && part.body && part.body.data) {
        body = Buffer.from(part.body.data, "base64").toString("utf8");
      }
    } else if (msg.data.payload.body && msg.data.payload.body.data) {
      body = Buffer.from(msg.data.payload.body.data, "base64").toString("utf8");
    }

    res.json({
      ok: true,
      id: msg.data.id,
      fecha: getHeader("Date"),
      de: getHeader("From"),
      para: getHeader("To"),
      asunto: getHeader("Subject"),
      cuerpo: body
    });

  } catch (err) {
    console.error("❌ Error al leer mensaje específico:", err);
    res.status(500).json({ ok: false, error: "Error al leer mensaje" });
  }
});

/* ============================================================
   RESPONDER CORREO (desde panel del operador)
   ============================================================ */
router.post("/responder", async (req, res) => {
  try {
    // Acepta nombres en español o inglés por si acaso
    const to = req.body.to || req.body.para;
    const subject = req.body.subject || req.body.asunto;
    const message = req.body.message || req.body.mensaje;

    if (!to || !subject || !message) {
      return res.status(400).json({ ok: false, error: "Datos incompletos" });
    }

    const client = getGmailClient();
    if (!client) return res.json({ ok: false, error: "No hay tokens cargados" });

    const gmail = google.gmail({ version: "v1", auth: client });

    const raw = Buffer.from(
      `From: Hotel Alejandro I <${process.env.HOTEL_EMAIL}>\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${subject}\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
      `${message}`
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw }
    });

    res.json({ ok: true, data: response.data });

  } catch (error) {
    console.error("❌ Error al enviar correo:", error);
    res.status(500).json({ ok: false, error: "Error al enviar correo" });
  }
});

/* ============================================================
   BORRAR (ENVIAR A PAPELERA)
   ============================================================ */
router.delete("/borrar/:id", async (req, res) => {
  try {
    const client = getGmailClient();
    if (!client) {
      return res.status(400).json({ ok: false, error: "No hay tokens cargados" });
    }

    const gmail = google.gmail({ version: "v1", auth: client });
    const id = req.params.id;

    // Enviar a la papelera (no borra definitivamente)
    await gmail.users.messages.trash({
      userId: "me",
      id
    });

    res.json({ ok: true, id });

  } catch (err) {
    console.error("❌ Error al borrar correo:", err);
    res.status(500).json({ ok: false, error: "Error al borrar correo" });
  }
});

/* ============================================================
   ENVIAR CORREO DESDE FORMULARIO DE CONTACTO DE LA WEB
   (contact.html)
   ============================================================ */
router.post("/contacto", async (req, res) => {
  try {
    const { nombre, telefono, email, mensaje } = req.body;

    if (!nombre || !email || !mensaje) {
      return res.json({ ok: false, error: "Faltan datos obligatorios" });
    }

    const client = getGmailClient();
    if (!client) return res.json({ ok: false, error: "Sin tokens" });

    const gmail = google.gmail({ version: "v1", auth: client });

    const html = `
      <h2>📩 Nuevo mensaje desde la web del Hotel</h2>
      <p><b>Nombre:</b> ${nombre}</p>
      <p><b>Teléfono:</b> ${telefono || "-"}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Mensaje:</b></p>
      <p>${mensaje}</p>
    `;

    // From = hotel (para que Gmail no se queje)
    // Reply-To = mail del usuario (para que al responder vaya al cliente)
    const raw = Buffer.from(
      `From: Hotel Alejandro I <${process.env.HOTEL_EMAIL}>\r\n` +
      `Reply-To: ${nombre} <${email}>\r\n` +
      `To: ${process.env.HOTEL_EMAIL}\r\n` +
      `Subject: Nuevo mensaje desde la web\r\n` +
      `Content-Type: text/html; charset="UTF-8"\r\n\r\n` +
      html
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw }
    });

    res.json({ ok: true, msg: "Correo enviado correctamente" });

  } catch (error) {
    console.error("❌ Error enviando correo de contacto:", error);
    res.status(500).json({ ok: false, error: "Error al enviar" });
  }
});

module.exports = router;
