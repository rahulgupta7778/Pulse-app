const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const scheduler = require('../services/scheduler');
const router = express.Router();
router.use(authenticate);

router.post('/optimize-day', (req, res) => {
  const { dayOfWeek, date } = req.body;
  const tasks = db.getTasks(req.userId);
  const slots = db.getSlots(req.userId);
  const d = dayOfWeek !== undefined ? dayOfWeek : new Date().getDay();
  const dateStr = date || new Date().toISOString().split('T')[0];
  const result = scheduler.optimizeDay(tasks, slots, d, dateStr);
  res.json(result);
});

router.post('/optimize-week', (req, res) => {
  const tasks = db.getTasks(req.userId);
  const slots = db.getSlots(req.userId);
  const results = scheduler.optimizeWeek(tasks, slots);
  res.json(results);
});

router.post('/suggest-slot', (req, res) => {
  const { taskId } = req.body;
  const tasks = db.getTasks(req.userId);
  const slots = db.getSlots(req.userId);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const today = new Date().getDay();
  const freeSlots = scheduler.getFreeSlots(slots, today, new Date().toISOString().split('T')[0]);
  const slot = scheduler.findBestTaskSlot(task, freeSlots);

  if (slot) {
    res.json({
      taskId: task.id,
      title: task.title,
      suggestedStart: scheduler.minToTime(slot.start),
      suggestedEnd: scheduler.minToTime(slot.end),
      duration: task.duration || 30
    });
  } else {
    res.json({ taskId: task.id, title: task.title, suggestedStart: null, suggestedEnd: null, message: 'No free slot available today' });
  }
});

module.exports = router;
