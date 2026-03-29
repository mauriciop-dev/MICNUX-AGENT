const { google } = require('googleapis');

// Inicialización de la Autenticación de Google (Service Account)
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/spreadsheets'
  ],
});

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });
const gmail = google.gmail({ version: 'v1', auth }); // <--- GMAIL ACTIVADO

/**
 * Envía un correo electrónico usando la API de Gmail.
 */
async function sendEmail(to, subject, body) {
  try {
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `From: Micnux Agent <agente-micnux@gen-lang-client-0221087124.iam.gserviceaccount.com>`,
      `To: ${to}`,
      `Content-Type: text/html; charset=utf-8`,
      `MIME-Version: 1.0`,
      `Subject: ${utf8Subject}`,
      ``,
      body,
    ];
    const message = messageParts.join('\n');

    // El mensaje debe estar codificado en base64url
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });
    return res.data;
  } catch (error) {
    console.error("Gmail Error:", error.message);
    return null;
  }
}

/**
 * Agrega una fila a una hoja de cálculo de Google.
 */
async function appendSheetRow(spreadsheetId, range, values) {
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });
    return res.data;
  } catch (error) {
    console.error("Sheets Error:", error.message);
    return null;
  }
}

/**
 * Busca archivos en Google Drive.
 */
async function searchFiles(query = "") {
  try {
    const res = await drive.files.list({
      q: query ? `name contains '${query}'` : "trashed = false",
      fields: 'files(id, name, mimeType, webViewLink)',
      pageSize: 5
    });
    return res.data.files;
  } catch (error) {
    console.error("Google Drive Error:", error.message);
    return null;
  }
}

module.exports = { drive, sheets, searchFiles };
