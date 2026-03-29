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

async function readSheet(spreadsheetId, range) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values || "Hoja vacía";
  } catch (error) {
    return `ERROR_GOOGLE_API: ${error.message}`;
  }
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
  } catch (error) {
    return `ERROR_CALENDAR_API: ${error.message}`;
  }
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
  } catch (error) {
    return `ERROR_GMAIL_API: ${error.message}`;
  }
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
  } catch (error) {
    return `ERROR_SHEETS_API: ${error.message}`;
  }
}

async function searchFiles(query = "") {
  try {
    const res = await drive.files.list({
      q: query ? `name contains '${query}'` : "trashed = false",
      fields: 'files(id, name, mimeType, webViewLink)',
      pageSize: 5
    });
    return res.data.files;
  } catch (error) {
    return `ERROR_DRIVE_API: ${error.message}`;
  }
}

async function createDocument(title) {
  try {
    const res = await docs.documents.create({ requestBody: { title } });
    return res.data;
  } catch (error) {
    return `ERROR_DOCS_API: ${error.message}`;
  }
}

module.exports = { 
  drive, sheets, searchFiles, 
  sendEmail, appendSheetRow, readSheet, 
  createCalendarEvent, createDocument
};
