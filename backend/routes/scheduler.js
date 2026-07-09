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

// --- Conflict Detector ---
router.get('/conflicts', (req, res) => {
  res.json([]);
});

// POST /api/scheduler/resolve-conflict
router.post('/resolve-conflict', (req, res) => {
  const { taskId, action } = req.body;
  if (!taskId) return res.status(400).json({ error: 'taskId is required' });

  const tasks = db.getTasks(req.userId);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (action === 'defer') {
    const currentDueDate = task.dueDate ? new Date(task.dueDate) : new Date();
    currentDueDate.setDate(currentDueDate.getDate() + 1);
    const newDateStr = currentDueDate.toISOString().split('T')[0];
    db.updateTask(taskId, { ...task, dueDate: newDateStr });
    return res.json({ success: true, message: `Successfully postponed "${task.title}" to ${newDateStr}.` });
  }

  if (action === 'reschedule') {
    const slots = db.getSlots(req.userId);
    const dayOfWeek = task.dueDate ? new Date(task.dueDate).getDay() : new Date().getDay();
    const dateStr = task.dueDate || new Date().toISOString().split('T')[0];
    const freeSlots = scheduler.getFreeSlots(slots, dayOfWeek, dateStr);
    const bestSlot = scheduler.findBestTaskSlot(task, freeSlots);

    if (bestSlot) {
      const suggestedStart = scheduler.minToTime(bestSlot.start);
      db.updateTask(taskId, { ...task, dueTime: suggestedStart });
      return res.json({ success: true, message: `Successfully rescheduled "${task.title}" to a free slot at ${suggestedStart}.` });
    } else {
      // Find any later hour
      const currentStart = task.dueTime ? parseInt(task.dueTime.split(':')[0], 10) : 9;
      const nextHour = String((currentStart + 2) % 24).padStart(2, '0') + ':00';
      db.updateTask(taskId, { ...task, dueTime: nextHour });
      return res.json({ success: true, message: `No open slot found. Shifted "${task.title}" 2 hours later to ${nextHour}.` });
    }
  }

  res.status(400).json({ error: 'Invalid action' });
});

module.exports = router;
