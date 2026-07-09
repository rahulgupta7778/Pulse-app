const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const enabled = db.getAutoPilot(req.userId);
  res.json({ autoPilot: enabled });
});

router.post('/', (req, res) => {
  const { enabled } = req.body;
  db.setAutoPilot(req.userId, !!enabled);
  res.json({ autoPilot: !!enabled });
});

module.exports = router;
