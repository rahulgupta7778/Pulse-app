const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;

process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled rejection:', err);
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());

// Serve frontend and uploads
app.use(express.static(path.join(__dirname, '..', 'frontend')));


// API Routes
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const analyticsRoutes = require('./routes/analytics');
const slotRoutes = require('./routes/slots');
const goalRoutes = require('./routes/goals');
const reminderRoutes = require('./routes/reminders');
const schedulerRoutes = require('./routes/scheduler');
const autopilotRoutes = require('./routes/autopilot');
const { router: calendarRoutes } = require('./routes/calendar');
const integrationsRoutes = require('./routes/integrations');
const exportRoutes = require('./routes/export');
const gamificationRoutes = require('./routes/gamification');
const moodRoutes = require('./routes/mood');
const pushRoutes = require('./routes/push');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false
});
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/autopilot', autopilotRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/mood', moodRoutes);
app.use('/api/push', pushRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);

// Expose config to frontend
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    calendarEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null
  });
});

// Serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    require('./services/reminderServices').start();
  } catch (e) {
    console.error('Failed to start reminder service:', e.message);
  }
  try {
    require('./services/autonomousAgent').start();
  } catch (e) {
    console.error('Failed to start autonomous agent:', e.message);
  }
  try {
    require('./services/syncService').start();
  } catch (e) {
    console.error('Failed to start sync service:', e.message);
  }
});