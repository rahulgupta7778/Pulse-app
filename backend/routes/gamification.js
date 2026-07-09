const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

router.get('/xp', (req, res) => {
  const totalXp = db.getXp(req.userId);
  const level = db.getLevel(req.userId);
  const nextXp = db.getNextLevelXp(req.userId);
  res.json({ totalXp, level, nextXp });
});

router.get('/achievements', (req, res) => {
  const achievements = db.getAchievements(req.userId);
  res.json({ achievements });
});

router.post('/check', (req, res) => {
  const unlocked = db.checkAchievements(req.userId);
  res.json({ unlocked });
});

router.get('/history', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const history = db.getXpHistory(req.userId, days);
  res.json({ history });
});

router.get('/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const leaderboard = db.getLeaderboard(limit);
  res.json({ leaderboard });
});

module.exports = router;
