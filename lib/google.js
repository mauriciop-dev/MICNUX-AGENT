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

// 🗝️ MOTOR DE CORREO (NODEMAILER)
// Configuración robusta para saltar los fallos de Google Cloud OAuth
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: USER_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD // <-- Requiere la clave de 16 caracteres
  }
});

/**
 * Envío de Correo Real (Vía Nodemailer + App Password)
 */
async function sendEmail(to, subject, body) {
  try {
    if (!process.env.GMAIL_APP_PASSWORD) {
      return "ERROR_AUTH: Falta GMAIL_APP_PASSWORD. Genera una en myaccount.google.com/apppasswords y añádela al .env.";
    }
    const mailOptions = { from: `Micnux Agent <${USER_EMAIL}>`, to, subject, html: body };
    const info = await transporter.sendMail(mailOptions);
    return `CORREO_ENVIADO: ${info.messageId}`;
  } catch (error) { return `ERROR_EMAIL_SEND: ${error.message}`; }
}

/**
 * Busca archivos con mayor flexibilidad.
 */
async function searchFiles(query = "") {
  try {
    let q = "trashed = false";
    if (query) {
      const clean = query.replace(/[_-]/g, " ").trim();
      q = `(name contains '${query}' or name contains '${clean}') and trashed = false`;
    }
    const res = await drive.files.list({ q, fields: 'files(id, name, mimeType, webViewLink)', pageSize: 10 });
    return res.data.files;
  } catch (e) { return `ERROR_DRIVE: ${e.message}`; }
}

async function readSheet(spreadsheetId, range) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values || "Vacía";
  } catch (e) { return `ERROR_SHEETS: ${e.message}`; }
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
    return `Evento Agendado: ${res.data.htmlLink}`;
  } catch (e) { return `ERROR_CALENDAR: ${e.message}`; }
}

async function listEmails(maxResults = 2) {
  // Para ver correos, seguimos usando la API de solo lectura
  const gmail = google.gmail({ version: 'v1', auth });
  try {
    const res = await gmail.users.messages.list({ userId: 'me', maxResults });
    return res.data.messages ? "Tienes correos pendientes. Úsalos como contexto." : "Bandeja vacía.";
  } catch (e) { return `ERROR_GMAIL_READ: ${e.message}`; }
}

module.exports = { 
  drive, sheets, searchFiles, readSheet, 
  sendEmail, createCalendarEvent, listEmails, 
  appendSheetRow: (spreadsheetId, range, values) => sheets.spreadsheets.values.append({ spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [values] } }),
  createDocument: (title) => docs.documents.create({ requestBody: { title } })
};
