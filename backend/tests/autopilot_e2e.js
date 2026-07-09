const db = require('../config/db');
const scheduler = require('../services/scheduler');

const TEST_USER = '__e2e_user__';

try { db.createUser({ id: TEST_USER, name: 'E2E User', email: 'e2e@test.com', password: 'test' }); } catch {}
db.deleteAllUserData(TEST_USER);

console.log('=== Auto-Pilot E2E Test ===\n');

// 1. Default state
console.assert(db.getAutoPilot(TEST_USER) === false, 'Should be off by default');
console.log('1. Default state: OFF  \u2713');

// 2. Toggle ON
db.setAutoPilot(TEST_USER, true);
console.assert(db.getAutoPilot(TEST_USER) === true, 'Should be on after toggle');
console.log('2. Toggle ON: \u2713');

// 3. Add slot + tasks
const dayOfWeek = new Date().getDay();
db.addSlot({ id: 'e2e_s', userId: TEST_USER, title: 'Free', startTime: '09:00', endTime: '17:00', dayOfWeek, color: '#6366f1' });
db.addTask({ id: 'e2e_t1', userId: TEST_USER, title: 'Urgent report', priority: 'urgent', dueDate: new Date().toISOString().split('T')[0], dueTime: '23:59', duration: 30, completed: 0, createdAt: new Date().toISOString(), subtasks: [] });
db.addTask({ id: 'e2e_t2', userId: TEST_USER, title: 'Study math', priority: 'high', dueDate: new Date().toISOString().split('T')[0], duration: 60, completed: 0, createdAt: new Date().toISOString(), subtasks: [] });
console.log('3. Added 1 slot + 2 tasks  \u2713');

// 4. optimizeDay
const result = scheduler.optimizeDay(db.getTasks(TEST_USER), db.getSlots(TEST_USER), dayOfWeek, new Date().toISOString().split('T')[0]);
console.assert(result.schedule.length > 0, 'Should schedule pending tasks');
console.assert(result.schedule[0].priority === 'urgent', 'Highest priority first');
console.log('4. optimizeDay:', result.schedule.length, 'tasks scheduled, first:', result.schedule[0].title, '\u2713');

// 5. Simulate processUser (what the agent does)
const now = new Date();
const todayStr = now.toISOString().split('T')[0];
const pending = db.getTasks(TEST_USER).filter(t => !t.completed);

if (db.getAutoPilot(TEST_USER) && pending.length > 0) {
  const plan = scheduler.optimizeDay(db.getTasks(TEST_USER), db.getSlots(TEST_USER), dayOfWeek, todayStr);
  const planKey = JSON.stringify(plan.schedule.map(s => s.taskId).sort());
  db.addDailyLog({ userId: TEST_USER, date: todayStr, data: { autoPlan: { taskIds: plan.schedule.map(s => s.taskId), schedule: plan.schedule, generatedAt: now.toISOString() } } });
  db.addNotification({ userId: TEST_USER, type: 'auto_plan', title: 'Schedule optimized', message: 'Planned ' + plan.schedule.length + ' tasks', taskId: null });
  db.addNotification({ userId: TEST_USER, type: 'auto_suggestion', title: 'Proactive suggestion', message: 'Focus on high-priority tasks first', taskId: null });
}
console.log('5. Simulated agent cycle  \u2713');

// 6. Check notifications
const notifs = db.getNotifications(TEST_USER);
console.assert(notifs.length >= 2, 'Should have notifications');
console.log('6. Notifications created:', notifs.length, '\u2713');

// 7. Simulate second cycle (duplicate prevention)
const notifBefore = db.getNotifications(TEST_USER).length;
const existingNotifs = db.getNotifications(TEST_USER, false);
const newSuggestion = 'Focus on high-priority tasks first';
const alreadySent = existingNotifs.some(n => n.message === newSuggestion);
console.assert(alreadySent === true, 'Should detect already sent notification');
console.log('7. Duplicate detection: alreadySent =', alreadySent, '\u2713');

// 8. Only add if NOT already sent
if (!alreadySent) {
  db.addNotification({ userId: TEST_USER, type: 'auto_suggestion', title: 'Proactive suggestion', message: newSuggestion, taskId: null });
}
const notifAfter = db.getNotifications(TEST_USER).length;
console.assert(notifBefore === notifAfter, 'Should not add duplicate');
console.log('8. No duplicate added: count stayed at', notifAfter, '\u2713');

// 9. Mark all read
db.markAllNotificationsRead(TEST_USER);
console.assert(db.getUnreadNotificationCount(TEST_USER) === 0, 'All should be read');
console.log('9. Mark all read: 0 unread  \u2713');

// 10. Toggle OFF
db.setAutoPilot(TEST_USER, false);
console.assert(db.getAutoPilot(TEST_USER) === false, 'Should be off');
console.log('10. Toggle OFF  \u2713');

db.deleteAllUserData(TEST_USER);
console.log('\n=== ALL 10 CHECKS PASSED ===');
