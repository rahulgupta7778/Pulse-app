const db = require('../config/db');

const SYNC_HANDLERS = {
  googletasks: require('./googleTasks').sync
};

const SYNC_INTERVAL = 10 * 60 * 1000;
let intervalId = null;

function start() {
  if (intervalId) return;
  console.log('[SyncService] Auto-sync started (every 10 min)');
  runCycle();
  intervalId = setInterval(runCycle, SYNC_INTERVAL);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[SyncService] Stopped');
  }
}

async function runCycle() {
  try {
    const users = db.getAllUserIds();
    for (const { id: userId } of users) {
      for (const [service, handler] of Object.entries(SYNC_HANDLERS)) {
        try {
          const conn = db.getConnector(userId, service);
          if (!conn || !conn.connected) continue;
          const result = await handler(userId);
          if (result.count > 0) {
            console.log(`[SyncService] Synced ${result.count} tasks from ${service} for user ${userId}`);
          }
        } catch (e) {
          console.error(`[SyncService] Error syncing ${service} for user ${userId}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.error('[SyncService] Cycle error:', e.message);
  }
}

module.exports = { start, stop };
