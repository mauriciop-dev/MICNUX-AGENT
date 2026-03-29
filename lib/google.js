const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/documents'
  ],
});

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });
const calendar = google.calendar({ version: 'v3', auth });

const USER_EMAIL = 'micnux.ia@gmail.com'; 

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: USER_EMAIL, pass: process.env.GMAIL_APP_PASSWORD }
});

async function sendEmail(to, subject, body) {
  try {
    const mailOptions = { from: `Micnux Agent <${USER_EMAIL}>`, to, subject, html: body, replyTo: USER_EMAIL };
    const info = await transporter.sendMail(mailOptions);
    return `CORREO_ENVIADO: ${info.messageId}`;
  } catch (error) { return `ERROR_EMAIL: ${error.message}`; }
}

/**
 * Lector Universal de Contactos (Fuzzy Metadata)
 */
async function readSheet(spreadsheetId, rangeInput) {
  try {
    // 1. Primero intentamos leer el rango solicitado
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: rangeInput });
      if (res.data.values) return res.data.values;
    } catch (e) { console.log("Prueba Rango Falló, intentando exploración..."); }

    // 2. Si falla, exploramos los metadatos de la hoja para encontrar la pestaña real
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = meta.data.sheets.map(s => s.properties.title);
    
    // Buscamos algo parecido a "Familia" o simplemente usamos la primera hoja
    const targetSheet = sheetNames.find(n => n.toLowerCase().includes("familia")) || sheetNames[0];
    
    const finalRes = await sheets.spreadsheets.values.get({ 
      spreadsheetId, 
      range: `${targetSheet}!A1:E50` 
    });
    
    return finalRes.data.values || "VACIA";
  } catch (e) {
    return `ERROR_TECNICO_SHEETS: ${e.message} (Verifica que el ID ${spreadsheetId} sea correcto y que el Agente Micnux sea Editor).`;
  }
}

async function createCalendarEvent(summary, startTime, endTime, description = "") {
  try {
    const res = await calendar.events.insert({
      calendarId: USER_EMAIL,
      requestBody: {
        summary, description,
        start: { dateTime: startTime, timeZone: 'America/Bogota' },
        end: { dateTime: endTime, timeZone: 'America/Bogota' },
      },
    });
    return `EVENTO_CALENDARIO: ${res.data.htmlLink}`;
  } catch (error) { return `ERROR_CALENDAR: ${error.message}`; }
}

module.exports = { 
  drive, sheets, readSheet, sendEmail, createCalendarEvent,
  searchFiles: async (q) => (await drive.files.list({ q: `name contains '${q}' and trashed = false`, fields: 'files(id, name, webViewLink)' })).data.files,
  appendSheetRow: (id, range, values) => sheets.spreadsheets.values.append({ spreadsheetId: id, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [values] } })
};
