const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

router.get('/', (req, res) => {
  const slots = db.getSlots(req.userId);
  res.json(slots);
});

router.post('/', (req, res) => {
  const slot = {
    ...req.body,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    userId: req.userId
  };
  db.addSlot(slot);
  res.status(201).json(slot);
});

router.put('/:id', (req, res) => {
  const existing = db.get('SELECT * FROM fixed_slots WHERE id=? AND userId=?', req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Slot not found' });
  const updated = db.updateSlot(req.params.id, req.body);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const existing = db.get('SELECT * FROM fixed_slots WHERE id=? AND userId=?', req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Slot not found' });
  db.deleteSlot(req.params.id);
  res.json({ success: true });
});

module.exports = router;
