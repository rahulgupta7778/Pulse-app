const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

router.get('/stats', (req, res) => {
  const tasks = db.getTasks(req.userId);
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length;
  const dueToday = tasks.filter(t => {
    if (!t.dueDate || t.completed) return false;
    return new Date(t.dueDate).toDateString() === new Date().toDateString();
  }).length;

  res.json({ total, completed, overdue, dueToday, productivityScore: total ? Math.round((completed / total) * 100) : 0 });
});

router.post('/log', (req, res) => {
  const log = { ...req.body, userId: req.userId, date: new Date().toISOString().split('T')[0] };
  db.addDailyLog(log);
  res.status(201).json(log);
});

module.exports = router;