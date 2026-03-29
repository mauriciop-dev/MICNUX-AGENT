const { google } = require('googleapis');

// Inicialización de la Autenticación de Google (Nivel Fundador - Permisos Totales)
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: [
    'https://www.googleapis.com/auth/drive',      // Control TOTAL de Archivos
    'https://www.googleapis.com/auth/gmail.modify',// Leer, Organizar y Enviar Correos
    'https://www.googleapis.com/auth/spreadsheets',// Control TOTAL de Hojas de Cálculo
    'https://www.googleapis.com/auth/calendar',   // Control TOTAL de Calendario
    'https://www.googleapis.com/auth/contacts'    // Leer y Gestionar Contactos
  ],
});

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });
const gmail = google.gmail({ version: 'v1', auth });
const calendar = google.calendar({ version: 'v3', auth });

/**
 * Lee datos de una hoja de cálculo.
 */
async function readSheet(spreadsheetId, range) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values;
  } catch (error) {
    console.error("Sheets Read Error:", error.message);
    return null;
  }
}

/**
 * Crea un evento en Google Calendar.
 */
async function createCalendarEvent(summary, startTime, endTime, description = "") {
  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: { dateTime: startTime, timeZone: 'America/Bogota' },
        end: { dateTime: endTime, timeZone: 'America/Bogota' },
      },
    });
    return res.data;
  } catch (error) {
    console.error("Calendar Error:", error.message);
    return null;
  }
}

/**
 * Envía un correo electrónico profesional.
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
    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } });
    return res.data;
  } catch (error) {
    console.error("Gmail Error:", error.message);
    return null;
  }
}

/**
 * Agrega una fila a una hoja de cálculo.
 */
async function appendSheetRow(spreadsheetId, range, values) {
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    });
    return res.data;
  } catch (error) {
    console.error("Sheets Append Error:", error.message);
    return null;
  }
}

/**
 * Busca archivos en Google Drive (Búsqueda agresiva).
 */
async function searchFiles(query = "") {
  try {
    const res = await drive.files.list({
      q: query ? `name contains '${query}'` : "trashed = false",
      fields: 'files(id, name, mimeType, webViewLink, owners)',
      pageSize: 10
    });
    return res.data.files;
  } catch (error) {
    console.error("Drive Search Error:", error.message);
    return null;
  }
}

module.exports = { 
  drive, sheets, searchFiles, 
  sendEmail, appendSheetRow, readSheet, 
  createCalendarEvent 
};
