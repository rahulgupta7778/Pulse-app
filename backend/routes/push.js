const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../config/db');

const router = express.Router();
router.use(authenticate);

router.post('/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  db.addPushSubscription(req.userId, {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth
  });
  res.json({ success: true });
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    const sub = db.get('SELECT id FROM push_subscriptions WHERE endpoint=? AND userId=?', endpoint, req.userId);
    if (sub) db.removePushSubscription(endpoint);
  }
  res.json({ success: true });
});

module.exports = router;
