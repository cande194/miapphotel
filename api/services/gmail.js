const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
require("dotenv").config();

// Ruta absoluta al archivo donde guardaste los tokens
const TOKEN_PATH = path.join(__dirname, "..", "gmail-tokens.json");

function getGmailClient() {
  // Verificamos si existe gmail-tokens.json
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error("❌ No existe gmail-tokens.json");
    return null;
  }

  // Cargamos los tokens
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));

  // Creamos el cliente OAuth2
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  // Le pasamos los tokens (IMPORTANTE)
  oAuth2Client.setCredentials(tokens);

  return oAuth2Client;
}

module.exports = getGmailClient;
