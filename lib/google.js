const { google } = require('googleapis');

// Inicialización de la Autenticación de Google (Nivel Soberano - Docs Incluido)
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
    'https://www.googleapis.com/auth/documents' // <--- GOOGLE DOCS HABILITADO
  ],
});

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });
const gmail = google.gmail({ version: 'v1', auth });
const calendar = google.calendar({ version: 'v3', auth });
const docs = google.docs({ version: 'v1', auth }); // <--- MOTOR DE DOCS

/**
 * Crea un nuevo Google Doc.
 */
async function createDocument(title) {
  try {
    const res = await docs.documents.create({ requestBody: { title } });
    return res.data;
  } catch (error) {
    console.error("Docs Create Error:", error.message);
    return null;
  }
}

/**
 * Lee el contenido de un Google Doc.
 */
async function readDocument(documentId) {
  try {
    const res = await docs.documents.get({ documentId });
    // Extraer texto simple del documento
    let content = "";
    res.data.body.content.forEach(element => {
      if (element.paragraph) {
        element.paragraph.elements.forEach(el => {
          if (el.textRun) content += el.textRun.content;
        });
      }
    });
    return content;
  } catch (error) {
    console.error("Docs Read Error:", error.message);
    return null;
  }
}

/**
 * Inserta texto al final de un Google Doc.
 */
async function appendToDocument(documentId, text) {
  try {
    const res = await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{ insertText: { endOfSegmentLocation: { segmentId: '' }, text: `\n${text}` } }]
      }
    });
    return res.data;
  } catch (error) {
    console.error("Docs Update Error:", error.message);
    return null;
  }
}

// FUNCIONES EXISTENTES (Sheets, Drive, Gmail, Calendar)
async function readSheet(spreadsheetId, range) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values;
  } catch (e) { return null; }
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
  } catch (e) { return null; }
}

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
  } catch (e) { return null; }
}

async function appendSheetRow(spreadsheetId, range, values) {
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    });
    return res.data;
  } catch (e) { return null; }
}

async function searchFiles(query = "") {
  try {
    const res = await drive.files.list({
      q: query ? `name contains '${query}'` : "trashed = false",
      fields: 'files(id, name, mimeType, webViewLink)',
      pageSize: 10
    });
    return res.data.files;
  } catch (e) { return null; }
}

module.exports = { 
  drive, sheets, searchFiles, 
  sendEmail, appendSheetRow, readSheet, 
  createCalendarEvent, createDocument, readDocument, appendToDocument
};
