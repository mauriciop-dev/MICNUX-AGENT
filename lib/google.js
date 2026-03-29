const { google } = require('googleapis');

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
const gmail = google.gmail({ version: 'v1', auth });
const calendar = google.calendar({ version: 'v3', auth });
const docs = google.docs({ version: 'v1', auth });

const USER_CALENDAR_ID = 'micnux.ia@gmail.com'; 

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
    const res = await drive.files.list({
      q: q,
      fields: 'files(id, name, mimeType, webViewLink)',
      pageSize: 10
    });
    return res.data.files;
  } catch (error) { return `ERROR_DRIVE: ${error.message}`; }
}

/**
 * Misión de Reconocimiento: Lista TODO lo que Micnux puede ver.
 */
async function debugListAllFiles() {
  try {
    const res = await drive.files.list({
      pageSize: 20,
      fields: 'files(id, name)',
      q: "trashed = false"
    });
    return res.data.files.map(f => f.name).join(", ");
  } catch (e) { return `ERROR_DEBUG: ${e.message}`; }
}

async function createCalendarEvent(summary, startTime, endTime, description = "") {
  try {
    const res = await calendar.events.insert({
      calendarId: USER_CALENDAR_ID,
      requestBody: {
        summary,
        description,
        start: { dateTime: startTime, timeZone: 'America/Bogota' },
        end: { dateTime: endTime, timeZone: 'America/Bogota' },
      },
    });
    return `Evento Creado: ${res.data.htmlLink}`;
  } catch (error) { return `ERROR_CALENDAR_WRITE: ${error.message}`; }
}

// RESTO DE FUNCIONES (Sheets, Gmail, etc.)
async function listEmails(maxResults = 2) {
  try {
    const res = await gmail.users.messages.list({ userId: 'me', maxResults });
    if (!res.data.messages) return "No hay correos.";
    const messages = [];
    for (const msg of res.data.messages) {
      const details = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      const subject = details.data.payload.headers.find(h => h.name === 'Subject')?.value || "Sin asunto";
      messages.push({ from: details.data.payload.headers.find(h => h.name === 'From')?.value, subject });
    }
    return messages;
  } catch (e) { return `ERROR_GMAIL: ${e.message}`; }
}

async function readSheet(spreadsheetId, range) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values || "Vacía";
  } catch (e) { return `ERROR_SHEETS: ${e.message}`; }
}

async function appendSheetRow(spreadsheetId, range, values) {
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [values] }
    });
    return res.data;
  } catch (e) { return `ERROR_SHEETS_APPEND: ${e.message}`; }
}

async function createDocument(title) {
  try {
    const res = await docs.documents.create({ requestBody: { title } });
    return res.data;
  } catch (e) { return `ERROR_DOCS: ${e.message}`; }
}

async function listCalendarEvents(maxResults = 5) {
  try {
    const res = await calendar.events.list({
      calendarId: USER_CALENDAR_ID,
      timeMin: (new Date()).toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items || "Sin eventos.";
  } catch (e) { return `ERROR_CALENDAR_READ: ${e.message}`; }
}

module.exports = { 
  drive, sheets, searchFiles, debugListAllFiles,
  sendEmail: (to, subject, body) => "Pendiente Config OAuth2 (Solo Gmail)", // Placeholder para claridad
  listEmails, appendSheetRow, readSheet, 
  createCalendarEvent, listCalendarEvents, createDocument 
};
