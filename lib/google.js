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

/**
 * Lista los últimos correos recibidos.
 */
async function listEmails(maxResults = 2) {
  try {
    const res = await gmail.users.messages.list({ userId: 'me', maxResults });
    if (!res.data.messages) return "No se encontraron correos.";
    
    const messages = [];
    for (const msg of res.data.messages) {
      const details = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      const subject = details.data.payload.headers.find(h => h.name === 'Subject')?.value || "Sin asunto";
      const from = details.data.payload.headers.find(h => h.name === 'From')?.value || "Desconocido";
      messages.push({ from, subject, snippet: details.data.snippet });
    }
    return messages;
  } catch (error) {
    return `ERROR_GMAIL_READ: ${error.message}`;
  }
}

/**
 * Lista los próximos eventos del calendario.
 */
async function listCalendarEvents(maxResults = 5) {
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: (new Date()).toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items || "No hay eventos próximos.";
  } catch (error) {
    return `ERROR_CALENDAR_READ: ${error.message}`;
  }
}

// FUNCIONES EXISTENTES (Souvering Status)
async function readSheet(spreadsheetId, range) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values || "Vacia";
  } catch (e) { return `ERROR_SHEETS: ${e.message}`; }
}

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
  } catch (e) { return `ERROR_CALENDAR_WRITE: ${e.message}`; }
}

async function sendEmail(to, subject, body) {
  try {
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
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
  } catch (e) { return `ERROR_GMAIL_SEND: ${e.message}`; }
}

async function appendSheetRow(spreadsheetId, range, values) {
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [values] }
    });
    return res.data;
  } catch (e) { return `ERROR_SHEETS_APPEND: ${e.message}`; }
}

async function searchFiles(query = "") {
  try {
    const res = await drive.files.list({
      q: query ? `name contains '${query}'` : "trashed = false",
      fields: 'files(id, name, mimeType, webViewLink)',
      pageSize: 10
    });
    return res.data.files;
  } catch (e) { return `ERROR_DRIVE: ${e.message}`; }
}

async function createDocument(title) {
  try {
    const res = await docs.documents.create({ requestBody: { title } });
    return res.data;
  } catch (e) { return `ERROR_DOCS: ${e.message}`; }
}

module.exports = { 
  drive, sheets, searchFiles, 
  sendEmail, listEmails, appendSheetRow, readSheet, 
  createCalendarEvent, listCalendarEvents, createDocument 
};
