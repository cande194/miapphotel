require("dotenv").config();
const express = require("express");
const { google } = require("googleapis");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// 1) GENERA EL LINK DE AUTORIZACIÓN
const url = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://mail.google.com/"],
});

console.log("👇 Abrí este link para autorizar Gmail:");
console.log(url);

// 2) INICIA SERVIDOR PARA RECIBIR EL CALLBACK
const app = express();

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send("❌ No llegó el código.");
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);

    console.log("\n🔑 REFRESH TOKEN:");
    console.log(tokens.refresh_token);

    res.send(`<h1>✔ Gmail autorizado correctamente</h1>
              <p>Copiá el refresh token que apareció en la consola.</p>`);
  } catch (err) {
    console.error("ERROR AL OBTENER TOKENS: ", err);
    res.send("❌ Error al obtener los tokens.");
  }
});

app.listen(4000, () => {
  console.log("\n🚀 Servidor listo. Esperando autorización...");
  console.log("➡ Cuando aceptes en Google, volverá a:");
  console.log("   http://localhost:4000/oauth2callback\n");
});
