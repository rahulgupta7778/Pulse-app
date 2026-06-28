const express = require('express');
const { google } = require('googleapis');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const googleTasks = require('../services/googleTasks');

const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
const REDIRECT_URI = `${APP_URL}/api/integrations/google/callback`;

function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

function getGoogleAuthClient(userId) {
  const token = db.getUserToken(userId);
  if (!token || !token.accessToken) return null;
  const oauth2Client = getGoogleOAuth2Client();
  if (!oauth2Client) return null;
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : null
  });
  return oauth2Client;
}

// Map connector services to their sync modules
const syncHandlers = {
  googletasks: googleTasks.sync
};

const connectorMeta = {
  googletasks: { icon: '✅', name: 'Google Tasks', desc: 'Sync your Google Tasks as Pulse tasks' }
};

// ─── Status ────────────────────────────────────────────────────────────
router.get('/status', authenticate, (req, res) => {
  const legacy = db.getIntegrationStatus(req.userId);
  const connectors = db.getAllConnectors(req.userId);
  const connMap = {};
  for (const c of connectors) connMap[c.service] = { connected: !!c.connected, email: c.email, lastSync: c.lastSync };

  const result = {
    googleCalendar: {
      connected: legacy ? !!legacy.calendarConnected : false,
      email: legacy ? (legacy.calendarEmail || null) : null,
      lastSync: legacy ? (legacy.lastCalendarSync || null) : null
    },
    gmail: {
      connected: legacy ? !!legacy.gmailConnected : false,
      email: legacy ? (legacy.gmailEmail || null) : null,
      lastSync: legacy ? (legacy.lastGmailSync || null) : null
    },
    ...connMap
  };
  // Add entries for services not yet connected (show available)
  for (const [svc, meta] of Object.entries(connectorMeta)) {
    if (!result[svc]) result[svc] = { connected: false, email: null, lastSync: null };
  }

  res.json(result);
});

router.get('/meta', (req, res) => {
  res.json(connectorMeta);
});

// ─── Google OAuth (Gmail) ─────────────────────────────────────────────
router.get('/google/auth-url', authenticate, (req, res) => {
  const oauth2Client = getGoogleOAuth2Client();
  if (!oauth2Client) {
    return res.status(400).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent',
    state: req.userId
  });
  res.json({ url });
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) return res.status(400).send('Missing code or state');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(400).send(
        `Google authorization failed: ${tokens.error} — ${tokens.error_description || ''}.`
      );
    }

    const oauth2Client = getGoogleOAuth2Client();
    oauth2Client.setCredentials(tokens);

    let gmailEmail = '';
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      gmailEmail = profile.data.emailAddress || '';
    } catch {}

    db.storeUserToken(userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    }, { gmailConnected: 1, gmailEmail });

    res.redirect('/#dashboard');
  } catch (e) {
    res.status(400).send('Authorization failed (' + e.message + ').');
  }
});

// ─── Gmail sync ────────────────────────────────────────────────────────
const TASK_KEYWORDS = [
  { regex: /deadline|due\s*date|submit|complete\s*by/i, priority: 'high' },
  { regex: /meeting|call|sync|standup|catch\s*up/i, priority: 'medium' },
  { regex: /reminder|don'?t\s*forget|follow\s*up/i, priority: 'medium' },
  { regex: /review|approve|feedback/i, priority: 'medium' },
  { regex: /rsvp|confirm|register|sign\s*up/i, priority: 'medium' }
];

async function syncGmail(userId) {
  const auth = getGoogleAuthClient(userId);
  if (!auth) return { error: 'Gmail not connected', count: 0 };

  const token = db.getUserToken(userId);
  if (!token.gmailConnected) return { error: 'Gmail not connected', count: 0 };

  const gmail = google.gmail({ version: 'v1', auth });

  const searchQueries = [
    'subject:(deadline OR "due date" OR reminder OR "follow up") newer_than:7d',
    'from:(meetup OR eventbrite OR calendly) newer_than:7d',
    'label:INBOX -category:social -category:promotions newer_than:3d'
  ];

  let messageIds = new Set();
  for (const query of searchQueries) {
    try {
      const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 15 });
      (res.data.messages || []).forEach(m => messageIds.add(m.id));
    } catch (e) {
      console.error('[Gmail Sync] Error:', e.message);
    }
  }

  let created = 0;
  for (const msgId of messageIds) {
    try {
      const externalId = 'gmail_' + msgId;
      if (db.getTaskByExternalId(userId, 'gmail', externalId)) continue;

      const msg = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'metadata' });
      const headers = {};
      (msg.data.payload?.headers || []).forEach(h => headers[h.name] = h.value);

      const subject = headers['Subject'] || '(no subject)';
      const from = headers['From'] || '';
      const snippet = msg.data.snippet || '';
      const threadUrl = `https://mail.google.com/mail/u/0/#inbox/${msgId}`;

      const matched = TASK_KEYWORDS.find(k => k.regex.test(subject) || k.regex.test(snippet));
      const priority = matched ? matched.priority : 'medium';

      let dueDate = null;
      const dateMatch = snippet.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?|\b(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
      if (dateMatch) {
        const d = new Date();
        if (dateMatch[1] && dateMatch[2]) {
          d.setMonth(parseInt(dateMatch[1]) - 1, parseInt(dateMatch[2]));
        }
        dueDate = d.toISOString().slice(0, 10);
      }

      const task = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        userId,
        title: subject,
        desc: `From: ${from}\n${snippet}`,
        dueDate: dueDate || new Date().toISOString().slice(0, 10),
        priority,
        category: 'email',
        completed: false,
        createdAt: new Date().toISOString(),
        subtasks: [],
        source: 'gmail',
        externalId,
        externalUrl: threadUrl
      };
      db.addTask(task);
      created++;
    } catch (e) {
      console.error('[Gmail Sync] Error processing:', e.message);
    }
  }

  db.updateIntegrationSync(userId, 'gmail');
  return { count: created };
}

router.post('/gmail/sync', authenticate, async (req, res) => {
  try {
    const result = await syncGmail(req.userId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Google Tasks ──────────────────────────────────────────────────────
router.get('/googletasks/auth-url', authenticate, (req, res) => {
  res.json({ url: googleTasks.getAuthUrl(req.userId) });
});

router.get('/googletasks/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) return res.status(400).send('Missing code or state');
    await googleTasks.handleCallback(code, userId);
    res.redirect('/#dashboard');
  } catch (e) {
    console.error('[GoogleTasks] Callback error:', e.message);
    res.status(400).send('Google Tasks authorization failed.');
  }
});

// ─── Dynamic Connector Routes ──────────────────────────────────────────

// Connect (store token/credentials for a connector)
router.post('/:service/connect', authenticate, (req, res) => {
  const { service } = req.params;
  if (!syncHandlers[service] && service !== 'gmail') {
    return res.status(400).json({ error: `Unknown connector: ${service}. Available: ${Object.keys(syncHandlers).join(', ')}` });
  }

  const { token, email } = req.body || {};
  db.setConnector(req.userId, service, { accessToken: token || null, email: email || null, connected: 1 });
  res.json({ success: true });
});

// Sync a specific connector
router.post('/:service/sync', authenticate, async (req, res) => {
  const { service } = req.params;
  const handler = syncHandlers[service];
  if (!handler) {
    return res.status(400).json({ error: `No sync handler for ${service}` });
  }
  try {
    const result = await handler(req.userId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Disconnect a connector (including gmail)
router.post('/:service/disconnect', authenticate, (req, res) => {
  const { service } = req.params;

  if (service === 'gmail') {
    db.updateUserToken(req.userId, { gmailConnected: 0, gmailEmail: null, lastGmailSync: null });
    db.deleteTasksBySource(req.userId, 'gmail');
    return res.json({ success: true });
  }

  if (!syncHandlers[service]) {
    return res.status(400).json({ error: `Unknown connector: ${service}` });
  }

  db.deleteConnector(req.userId, service);
  db.deleteTasksBySource(req.userId, service);
  res.json({ success: true });
});

// Sync all connected connectors
router.post('/sync-all', authenticate, async (req, res) => {
  const results = {};

  try { results.gmail = await syncGmail(req.userId); } catch (e) { results.gmail = { error: e.message, count: 0 }; }

  for (const [svc, handler] of Object.entries(syncHandlers)) {
    try {
      const conn = db.getConnector(req.userId, svc);
      if (conn && conn.connected) {
        results[svc] = await handler(req.userId);
      }
    } catch (e) {
      results[svc] = { error: e.message, count: 0 };
    }
  }

  res.json(results);
});

module.exports = router;
