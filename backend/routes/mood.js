const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

const MOODS = {
  energetic: { icon: '⚡', label: 'Energetic', productivity: 1.3 },
  focused: { icon: '🎯', label: 'Focused', productivity: 1.2 },
  neutral: { icon: '😐', label: 'Neutral', productivity: 1.0 },
  tired: { icon: '😴', label: 'Tired', productivity: 0.7 },
  stressed: { icon: '😰', label: 'Stressed', productivity: 0.5 },
  unmotivated: { icon: '😩', label: 'Unmotivated', productivity: 0.4 }
};

router.post('/log', (req, res) => {
  const { mood } = req.body;
  if (!mood || !MOODS[mood]) return res.status(400).json({ error: 'Invalid mood' });
  const today = new Date().toISOString().split('T')[0];
  const existing = db.getDailyLog(req.userId, today);
  const data = existing ? (typeof existing.data === 'string' ? JSON.parse(existing.data) : (existing.data || {})) : {};
  data.mood = mood;
  if (existing) {
    db.updateDailyLog(req.userId, today, data);
  } else {
    db.addDailyLog({ userId: req.userId, date: today, data });
  }
  res.json({ mood, ...MOODS[mood] });
});

router.get('/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const log = db.getDailyLog(req.userId, today);
  const data = log ? (typeof log.data === 'string' ? JSON.parse(log.data) : (log.data || {})) : {};
  const mood = data.mood || null;
  res.json({ mood, moodInfo: mood ? MOODS[mood] : null });
});

router.get('/history', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const logs = db.getDailyLogs(req.userId);
  const moodHistory = logs
    .filter(l => l.date >= since.toISOString().split('T')[0])
    .map(l => {
      const data = typeof l.data === 'string' ? JSON.parse(l.data) : (l.data || {});
      return data.mood ? { date: l.date, mood: data.mood } : null;
    })
    .filter(Boolean);
  res.json({ history: moodHistory });
});

module.exports = router;
