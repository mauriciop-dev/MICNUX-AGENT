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
