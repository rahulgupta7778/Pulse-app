const webpush = require('web-push');
const db = require('../config/db');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
  webpush.setVapidDetails(
    'mailto:push@localhost',
    publicKey,
    privateKey
  );
}

async function sendToUser(userId, title, body, url = null) {
  const subs = db.getPushSubscriptions(userId);
  if (!subs.length) return 0;

  const payload = JSON.stringify({
    title,
    body,
    url: url || '/',
    timestamp: Date.now()
  });

  const results = await Promise.allSettled(subs.map(sub => {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    };
    return webpush.sendNotification(subscription, payload)
      .then(() => true)
      .catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          db.removePushSubscription(sub.endpoint);
        }
        return false;
      });
  }));

  return results.filter(r => r.status === 'fulfilled' && r.value === true).length;
}

async function sendToAllUsers(title, body, userIds = null) {
  const subs = userIds
    ? userIds.flatMap(uid => db.getPushSubscriptions(uid))
    : db.getAllPushSubscriptions();

  if (!subs.length) return 0;

  const payload = JSON.stringify({ title, body, url: '/', timestamp: Date.now() });
  let sent = 0;

  for (const sub of subs) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    };

    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.removePushSubscription(sub.endpoint);
      }
    }
  }
  return sent;
}

module.exports = { sendToUser, sendToAllUsers };
