const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const notifications = db.getNotifications(req.userId, false);
  const unreadCount = db.getUnreadNotificationCount(req.userId);
  res.json({ notifications, unreadCount });
});

router.get('/unread', (req, res) => {
  const notifications = db.getNotifications(req.userId, true);
  res.json({ notifications, count: notifications.length });
});

router.post('/:id/read', (req, res) => {
  db.markNotificationRead(req.params.id);
  res.json({ success: true });
});

router.post('/read-all', (req, res) => {
  db.markAllNotificationsRead(req.userId);
  res.json({ success: true });
});

module.exports = router;
