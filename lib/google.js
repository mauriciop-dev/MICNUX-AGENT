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

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });
const calendar = google.calendar({ version: 'v3', auth });
const docs = google.docs({ version: 'v1', auth });

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

async function searchFiles(query = "") {
  try {
    let q = "trashed = false";
    if (query) q = `name contains '${query}' and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id, name, mimeType, webViewLink)', pageSize: 15 });
    return res.data.files;
  } catch (e) { return `ERROR_DRIVE: ${e.message}`; }
}

async function readSheet(spreadsheetId, range) {
  try {
    // 🕵️‍♂️ Robustez: Si el rango falla, intentamos leer la primera hoja por defecto
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values || "VACIA";
  } catch (e) {
    if (e.message.includes("403")) return "ERROR_PERMISOS: Debes compartir el archivo con el correo del Agente Micnux.";
    return `ERROR_SHEETS: ${e.message}`;
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
  drive, sheets, searchFiles, readSheet, 
  sendEmail, createCalendarEvent,
  appendSheetRow: (spreadsheetId, range, values) => sheets.spreadsheets.values.append({ spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [values] } }),
  createDocument: (title) => docs.documents.create({ requestBody: { title } })
};
