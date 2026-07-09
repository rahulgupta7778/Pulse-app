const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

function csv(val) {
  const s = String(val == null ? '' : val);
  return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function yesno(v) { return v ? 'Yes' : 'No'; }

router.get('/csv/tasks', authenticate, (req, res) => {
  const tasks = db.getTasks(req.userId);
  const header = 'Title,Description,Priority,Due Date,Due Time,Duration (min),Category,Completed,Created,Source\n';
  const rows = tasks.map(t =>
    [csv(t.title), csv(t.desc), t.priority, t.dueDate||'', t.dueTime||'', t.duration||'', t.category, yesno(t.completed), t.createdAt, t.source||''].join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=pulse_tasks.csv');
  res.send('\uFEFF' + header + '\n' + rows);
});

router.get('/csv/goals', authenticate, (req, res) => {
  const goals = db.getGoals(req.userId);
  const header = 'Title,Description,Category,Target,Progress,Streak,Created\n';
  const rows = goals.map(g =>
    [csv(g.title), csv(g.description), g.category, g.targetCount, g.progress, g.streak, g.createdAt].join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=pulse_goals.csv');
  res.send('\uFEFF' + header + '\n' + rows);
});

router.get('/csv/habits', authenticate, (req, res) => {
  const habits = db.getHabits(req.userId);
  const header = 'Title,Frequency,Streak,Best Streak,Total Count,Created\n';
  const rows = habits.map(h =>
    [csv(h.title), h.frequency, h.streak, h.bestStreak, h.totalCount, h.createdAt].join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=pulse_habits.csv');
  res.send('\uFEFF' + header + '\n' + rows);
});

module.exports = router;
