const { google } = require('googleapis');
const db = require('../config/db');

const SCOPES = ['https://www.googleapis.com/auth/tasks'];
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
const REDIRECT_URI = `${APP_URL}/api/integrations/googletasks/callback`;

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

function getAuthUrl(userId) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: userId
  });
}

async function handleCallback(code, userId) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  let email = '';
  try {
    const tasks = google.tasks({ version: 'v1', auth: oauth2Client });
    const lists = await tasks.tasklists.list();
    email = `tasks_${userId}`;
  } catch {}

  db.setConnector(userId, 'googletasks', {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    connected: 1,
    email: 'Google Tasks'
  });

  return tokens;
}

async function sync(userId) {
  const conn = db.getConnector(userId, 'googletasks');
  if (!conn || !conn.accessToken) return { error: 'Google Tasks not connected', count: 0 };

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: conn.accessToken,
    refresh_token: conn.refreshToken,
    expiry_date: conn.tokenExpiry ? new Date(conn.tokenExpiry).getTime() : null
  });

  const tasks = google.tasks({ version: 'v1', auth: oauth2Client });

  let created = 0;
  try {
    const taskLists = await tasks.tasklists.list({ maxResults: 10 });
    const lists = taskLists.data.items || [];

    for (const list of lists) {
      const res = await tasks.tasks.list({ tasklist: list.id, showCompleted: false, maxResults: 50 });
      const items = res.data.items || [];

      for (const item of items) {
        const externalId = 'googletasks_' + item.id;
        if (db.getTaskByExternalId(userId, 'googletasks', externalId)) continue;

        const task = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          userId,
          title: item.title || '(no title)',
          desc: item.notes || '',
          dueDate: item.due ? new Date(item.due).toISOString().slice(0, 10) : null,
          priority: 'medium',
          category: 'tasks',
          completed: false,
          createdAt: new Date().toISOString(),
          subtasks: [],
          source: 'googletasks',
          externalId,
          externalUrl: null
        };
        db.addTask(task);
        created++;
      }
    }

    db.setConnector(userId, 'googletasks', { lastSync: new Date().toISOString(), connected: 1 });
  } catch (e) {
    return { error: e.message, count: created };
  }

  return { count: created };
}

module.exports = { sync, getAuthUrl, handleCallback };
