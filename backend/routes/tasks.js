const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { updateGoogleEventStatus } = require('./calendar');
const router = express.Router();

router.use(authenticate);

router.get('/', (req, res) => {
  const tasks = db.getTasks(req.userId);
  res.json(tasks);
});

router.post('/', (req, res) => {
  const existing = db.getTasks(req.userId);
  const maxPos = existing.reduce((m, t) => Math.max(m, t.position || 0), 0);
  const task = {
    ...req.body,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    userId: req.userId,
    completed: false,
    createdAt: new Date().toISOString(),
    subtasks: [],
    position: maxPos + 1
  };
  db.addTask(task);
  db.addXp(req.userId, 5, 'Task created');
  db.checkAchievements(req.userId);
  res.status(201).json(task);
});

router.put('/:id', (req, res) => {
  const existing = db.getTasks(req.userId).find(t => t.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const updated = db.updateTask(req.params.id, req.body);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const existing = db.getTasks(req.userId).find(t => t.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  db.deleteTask(req.params.id);
  res.json({ success: true });
});

router.patch('/:id/toggle', async (req, res) => {
  const task = db.getTasks(req.userId).find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const becomingComplete = !task.completed;
  task.completed = becomingComplete;
  task.completedAt = becomingComplete ? new Date().toISOString() : null;
  db.updateTask(req.params.id, task);
  if (task.googleEventId) {
    updateGoogleEventStatus(req.userId, task.googleEventId, task.completed).catch(() => {});
  }
  if (becomingComplete) {
    db.addXp(req.userId, 10, 'Task completed');
    db.checkAchievements(req.userId);
  }
  res.json(task);
});

router.put('/reorder/all', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of task IDs' });
  order.forEach((id, index) => {
    db.query('UPDATE tasks SET position=? WHERE id=? AND userId=?', index, id, req.userId);
  });
  res.json({ success: true });
});

module.exports = router;
