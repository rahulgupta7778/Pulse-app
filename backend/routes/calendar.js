const express = require('express');
const { google } = require('googleapis');
const db = require('../config/db');
const { authenticate: authMiddleware } = require('../middleware/auth');
const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
const REDIRECT_URI = `${APP_URL}/api/calendar/callback`;

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

function getAuthClient(userId) {
  const token = db.getUserToken(userId);
  if (!token || !token.calendarConnected) return null;
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) return null;
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : null
  });
  return oauth2Client;
}

async function getCalendarService(userId) {
  const auth = getAuthClient(userId);
  if (!auth) return null;
  return google.calendar({ version: 'v3', auth });
}

// Auth URL
router.get('/auth-url', authMiddleware, asyncHandler(async (req, res) => {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    return res.status(400).json({ error: 'Google Calendar not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent',
    state: req.userId
  });
  res.json({ url });
}));

// OAuth callback
router.get('/callback', asyncHandler(async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) {
    return res.status(400).send('Missing code or state parameter');
  }

  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    console.error('Calendar callback: OAuth2 client not configured (check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)');
    return res.status(500).send('Calendar OAuth not configured');
  }

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  let calendarEmail = '';
  try {
    const calList = await calendar.calendarList.get({ calendarId: 'primary' });
    calendarEmail = calList.data.id || '';
  } catch {}

  db.storeUserToken(userId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
  });
  if (calendarEmail) {
    const token = db.getUserToken(userId);
    if (token) {
      token.calendarEmail = calendarEmail;
    }
  }
  res.redirect('/#timetable');
}));

// Status
router.get('/status', authMiddleware, asyncHandler(async (req, res) => {
  const token = db.getUserToken(req.userId);
  res.json({ connected: token ? !!token.calendarConnected : false, email: token ? (token.calendarEmail || null) : null });
}));

// Update a single event's status in Google Calendar
async function updateGoogleEventStatus(userId, googleEventId, completed) {
  const calendar = await getCalendarService(userId);
  if (!calendar || !googleEventId) return false;
  try {
    const event = await calendar.events.get({ calendarId: 'primary', eventId: googleEventId });
    const summary = event.data.summary || '';
    const prefix = '\u2705 ';
    if (completed && !summary.startsWith(prefix)) {
      await calendar.events.patch({ calendarId: 'primary', eventId: googleEventId, requestBody: { summary: prefix + summary } });
    } else if (!completed && summary.startsWith(prefix)) {
      await calendar.events.patch({ calendarId: 'primary', eventId: googleEventId, requestBody: { summary: summary.slice(prefix.length) } });
    }
    return true;
  } catch {
    return false;
  }
}

// Sync events
router.post('/sync', authMiddleware, asyncHandler(async (req, res) => {
  const calendar = await getCalendarService(req.userId);
  if (!calendar) {
    return res.status(400).json({ error: 'Calendar not connected' });
  }

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: weekFromNow.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });

  const events = response.data.items || [];
  const existingSlots = db.getSlots(req.userId);
  const existingTasks = db.getTasks(req.userId);

  const slotByGoogleId = {};
  const slotByKey = {};
  for (const s of existingSlots) {
    if (s.googleEventId) slotByGoogleId[s.googleEventId] = s;
    slotByKey[s.title + '|' + s.startTime + '|' + s.dayOfWeek] = s;
  }
  const taskByGoogleId = {};
  const taskByKey = {};
  for (const t of existingTasks) {
    if (t.googleEventId) taskByGoogleId[t.googleEventId] = t;
    if (t.dueDate) taskByKey[t.title + '|' + t.dueDate] = t;
  }

  let created = 0;
  let updated = 0;
  const colors = ['#6366f1', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#ec4899'];

  function getMeetUrl(event) {
    try {
      const entry = event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video');
      return entry?.uri || null;
    } catch { return null; }
  }

  for (const event of events) {
    const startStr = event.start?.dateTime || event.start?.date;
    if (!startStr) continue;

    const startDate = new Date(startStr);
    const endStr = event.end?.dateTime || event.end?.date;
    const endDate = new Date(endStr);

    const dayOfWeek = startDate.getDay();
    const startTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
    const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

    const title = event.summary || 'Busy';
    const googleEventId = event.id;
    const isCancelled = event.status === 'cancelled';
    const isCompletedGCal = title.startsWith('\u2705 ');

    if (isCancelled) {
      if (slotByGoogleId[googleEventId]) { db.deleteSlot(slotByGoogleId[googleEventId].id); }
      if (taskByGoogleId[googleEventId]) { db.deleteTask(taskByGoogleId[googleEventId].id); }
      continue;
    }

    let existingSlot = slotByGoogleId[googleEventId];
    const slotKey = title + '|' + startTime + '|' + dayOfWeek;
    const matchedSlotKey = slotByKey[slotKey];
    if (!existingSlot && matchedSlotKey) {
      existingSlot = matchedSlotKey;
      existingSlot.googleEventId = googleEventId;
      db.updateSlot(existingSlot.id, existingSlot);
    }
    if (existingSlot) {
      let changed = false;
      if (existingSlot.title !== title) { existingSlot.title = title; changed = true; }
      if (existingSlot.startTime !== startTime) { existingSlot.startTime = startTime; changed = true; }
      if (existingSlot.endTime !== endTime) { existingSlot.endTime = endTime; changed = true; }
      if (existingSlot.dayOfWeek !== dayOfWeek) { existingSlot.dayOfWeek = dayOfWeek; changed = true; }
      if (changed) { db.updateSlot(existingSlot.id, existingSlot); updated++; }
    } else {
      const colorIdx = created % colors.length;
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      const slot = {
        id, userId: req.userId, title,
        startTime, endTime, dayOfWeek,
        color: colors[colorIdx], googleEventId
      };
      db.addSlot(slot);
      created++;
    }

    const cleanTitle = isCompletedGCal ? title.slice(2).trim() : title;
    const dueDate = startDate.toISOString().slice(0, 10);

    let existingTask = taskByGoogleId[googleEventId];
    const taskKey = cleanTitle + '|' + dueDate;
    const matchedTaskKey = taskByKey[taskKey];
    if (!existingTask && matchedTaskKey) {
      existingTask = matchedTaskKey;
      existingTask.googleEventId = googleEventId;
      db.updateTask(existingTask.id, existingTask);
    }
    const meetUrl = getMeetUrl(event);
    if (existingTask) {
      let changed = false;
      if (existingTask.title !== cleanTitle) { existingTask.title = cleanTitle; changed = true; }
      if (existingTask.dueDate !== dueDate) { existingTask.dueDate = dueDate; changed = true; }
      if (existingTask.completed !== isCompletedGCal) { existingTask.completed = isCompletedGCal; existingTask.completedAt = isCompletedGCal ? new Date().toISOString() : null; changed = true; }
      if (existingTask.externalUrl !== meetUrl) { existingTask.externalUrl = meetUrl; changed = true; }
      if (changed) { db.updateTask(existingTask.id, existingTask); if (existingTask.completed !== isCompletedGCal) updated++; }
    } else {
      const task = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        userId: req.userId,
        title: cleanTitle,
        dueDate,
        priority: 'medium',
        category: 'calendar',
        completed: isCompletedGCal,
        completedAt: isCompletedGCal ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
        subtasks: [],
        googleEventId,
        source: 'google_calendar',
        externalId: googleEventId,
        externalUrl: meetUrl
      };
      db.addTask(task);
      created++;
    }
  }

  res.json({ synced: created, updated, total: events.length });
}));

// Toggle task completion → update Google Calendar
router.post('/update-event', authMiddleware, asyncHandler(async (req, res) => {
  const { googleEventId, completed } = req.body;
  if (!googleEventId) return res.status(400).json({ error: 'Missing googleEventId' });
  const ok = await updateGoogleEventStatus(req.userId, googleEventId, completed);
  res.json({ updated: ok });
}));

// Disconnect
router.post('/disconnect', authMiddleware, asyncHandler(async (req, res) => {
  db.deleteSyncedTasks(req.userId);
  db.deleteSyncedSlots(req.userId);
  db.disconnectCalendar(req.userId);
  res.json({ success: true });
}));

module.exports = { router, updateGoogleEventStatus };
