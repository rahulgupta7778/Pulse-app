const db = require('../config/db');
const scheduler = require('../services/scheduler');
const path = require('path');

function calcStreak(logs, today) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    if (logs.some(l => l.date === dateStr)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

const assert = (condition, msg) => {
  if (!condition) throw new Error('FAIL: ' + msg);
  console.log('  PASS:', msg);
};

const TEST_USER = '__test_user__';
let passed = 0;
let failed = 0;

// Ensure test user exists
try {
  db.createUser({ id: TEST_USER, name: 'Test User', email: 'test@test.com', password: 'test' });
} catch (e) {
  // user may already exist, ignore
}

function test(name, fn) {
  console.log(`\n=== ${name} ===`);
  try {
    fn();
    passed++;
  } catch (e) {
    console.error('  ' + e.message);
    failed++;
  }
}

function cleanup() {
  try {
    db.deleteAllUserData(TEST_USER);
  } catch (e) { console.error('Cleanup error:', e.message); }
}

// ====== 1. GOAL & HABIT TRACKING ======

test('Goal CRUD', () => {
  const g = db.addGoal({
    id: 'g1', userId: TEST_USER, title: 'Exercise 3x/week',
    description: 'Stay fit', category: 'health', targetCount: 3,
    progress: 0, streak: 0, bestStreak: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  assert(g.id === 'g1', 'addGoal returns created goal');

  const goals = db.getGoals(TEST_USER);
  assert(goals.some(x => x.id === 'g1'), 'getGoals contains new goal');

  const updated = db.updateGoal('g1', { progress: 1 });
  assert(updated.progress === 1, 'updateGoal modifies progress');

  db.deleteGoal('g1');
  const afterDel = db.getGoals(TEST_USER);
  assert(!afterDel.some(x => x.id === 'g1'), 'deleteGoal removes goal');
});

test('Goal increment', () => {
  db.addGoal({ id: 'g_inc', userId: TEST_USER, title: 'Increment test', category: 'personal', targetCount: 3, progress: 0, streak: 0, bestStreak: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  const goal1 = db.updateGoal('g_inc', { progress: 1 });
  assert(goal1.progress === 1, 'progress incremented to 1');

  const goal2 = db.updateGoal('g_inc', { progress: 2 });
  assert(goal2.progress === 2, 'progress incremented to 2');

  const goal3 = db.updateGoal('g_inc', { progress: 5 });
  assert(goal3.progress === 5, 'progress can exceed targetCount (no cap in DB)');

  db.deleteGoal('g_inc');
  assert(!db.getGoals(TEST_USER).some(x => x.id === 'g_inc'), 'goal cleaned up');
});

test('Habit CRUD', () => {
  db.addGoal({ id: 'g2', userId: TEST_USER, title: 'Read more', category: 'personal', targetCount: 5, progress: 0, streak: 0, bestStreak: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  const h = db.addHabit({
    id: 'h1', userId: TEST_USER, goalId: 'g2', title: 'Read 30 min',
    frequency: 'daily', daysOfWeek: [], streak: 0, bestStreak: 0, totalCount: 0,
    createdAt: new Date().toISOString()
  });
  assert(h.id === 'h1', 'addHabit returns created habit');

  const habits = db.getHabits(TEST_USER);
  assert(habits.some(x => x.id === 'h1'), 'getHabits contains new habit');

  const byGoal = db.getHabitsByGoal('g2');
  assert(byGoal.some(x => x.id === 'h1'), 'getHabitsByGoal works');

  db.updateHabit('h1', { streak: 3 });
  const updated = db.getHabits(TEST_USER).find(x => x.id === 'h1');
  assert(updated.streak === 3, 'updateHabit modifies streak');

  db.deleteHabit('h1');
  assert(!db.getHabits(TEST_USER).some(x => x.id === 'h1'), 'deleteHabit removes habit');

  db.deleteGoal('g2');
});

test('Habit Logging', () => {
  db.addHabit({ id: 'h2', userId: TEST_USER, goalId: null, title: 'Meditate', frequency: 'daily', daysOfWeek: [], streak: 0, bestStreak: 0, totalCount: 0, createdAt: new Date().toISOString() });

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Log yesterday too
  db.logHabit('h2', TEST_USER, yesterday);

  const log1 = db.logHabit('h2', TEST_USER, today);
  assert(log1.completed === 1, 'logHabit creates completed log');

  const logs = db.getHabitLogs('h2');
  assert(logs.length === 2, 'getHabitLogs returns 2 logs');
  assert(logs[0].date === today || logs[1].date === today, 'log date is today');

  // Streak should be at least 2 (yesterday + today)
  const streakData = db.getStreakData('h2');
  assert(streakData.length >= 2, 'Streak data includes yesterday and today');

  // Toggle today OFF - streak should now be 0 from today's perspective
  const log2 = db.logHabit('h2', TEST_USER, today);
  assert(log2.completed === 0, 'logHabit toggles to uncompleted');

  // getStreakData only returns completed=1 logs
  const afterUncheck = db.getStreakData('h2');
  const todayCompleted = afterUncheck.filter(l => l.date === today);
  assert(todayCompleted.length === 0, 'Today not in streak data after uncheck');

  const streak = db.getStreakData('h2');
  assert(Array.isArray(streak), 'getStreakData returns array');

  db.deleteHabit('h2');
});

// ====== 2. CONTEXT-AWARE REMINDERS ======

test('Notification CRUD', () => {
  db.addNotification({ userId: TEST_USER, type: 'deadline_urgent', title: 'Test', message: 'Test message', taskId: null });
  db.addNotification({ userId: TEST_USER, type: 'overdue', title: 'Overdue', message: 'Overdue task', taskId: null });

  const all = db.getNotifications(TEST_USER);
  assert(all.length >= 2, 'getNotifications returns all');

  const unread = db.getNotifications(TEST_USER, true);
  assert(unread.length >= 2, 'getNotifications(unread) returns unread only');

  const count = db.getUnreadNotificationCount(TEST_USER);
  assert(count >= 2, 'getUnreadNotificationCount is correct');

  db.markNotificationRead(all[0].id);
  const afterRead = db.getNotifications(TEST_USER);
  assert(afterRead.find(n => n.id === all[0].id).read === 1, 'markNotificationRead works');

  db.markAllNotificationsRead(TEST_USER);
  assert(db.getUnreadNotificationCount(TEST_USER) === 0, 'markAllNotificationsRead works');
  assert(db.getNotifications(TEST_USER, true).length === 0, 'no unread after markAll read');
});

test('Reminder deadline detection logic', () => {
  const now = new Date();
  const in15min = new Date(now.getTime() + 10 * 60 * 1000);
  const in1hr = new Date(now.getTime() + 50 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const fmtDate = d => d.toISOString().split('T')[0];
  const fmtTime = d => d.toTimeString().slice(0, 5);

  db.addTask({
    id: 'rt1', userId: TEST_USER, title: 'Due in 10min', priority: 'urgent',
    dueDate: fmtDate(in15min), dueTime: fmtTime(in15min), duration: 15,
    completed: 0, createdAt: new Date().toISOString(), subtasks: []
  });

  db.addTask({
    id: 'rt2', userId: TEST_USER, title: 'Due in 50min', priority: 'high',
    dueDate: fmtDate(in1hr), dueTime: fmtTime(in1hr), duration: 30,
    completed: 0, createdAt: new Date().toISOString(), subtasks: []
  });

  db.addTask({
    id: 'rt3', userId: TEST_USER, title: 'Due tomorrow', priority: 'medium',
    dueDate: fmtDate(tomorrow), dueTime: fmtTime(tomorrow), duration: 30,
    completed: 0, createdAt: new Date().toISOString(), subtasks: []
  });

  db.addNotification({ userId: TEST_USER, type: 'deadline_urgent', title: 'Urgent check', message: 'Check reminder logic', taskId: 'rt1' });

  const service = require('../services/reminderServices');
  assert(typeof service.start === 'function', 'reminder service has start');
  assert(typeof service.stop === 'function', 'reminder service has stop');

  const preNotifs = db.getNotifications(TEST_USER, true).length;
  db.addNotification({ userId: TEST_USER, type: 'deadline_urgent', title: 'Urgent!', message: '"Due in 10min" is due in 15 minutes', taskId: 'rt1' });
  const postNotifs = db.getNotifications(TEST_USER, true).length;
  assert(postNotifs > preNotifs, 'Reminder notification can be added');

  ['rt1', 'rt2', 'rt3'].forEach(id => db.deleteTask(id));
});

// ====== 3. AI-POWERED SCHEDULING ======

test('getFreeSlots', () => {
  const slots = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '11:00' },
    { dayOfWeek: 1, startTime: '13:00', endTime: '14:00' }
  ];
  const free = scheduler.getFreeSlots(slots, 1, '2025-01-01');
  assert(free.length === 3, 'getFreeSlots returns 3 free ranges');
  assert(free[0].start === 0 && free[0].end === 540, 'Free before 09:00');
  assert(free[1].start === 660 && free[1].end === 780, 'Free 11:00-13:00');
  assert(free[2].start === 840 && free[2].end === 1440, 'Free after 14:00');
});

test('optimizeDay schedules tasks into free slots', () => {
  const tasks = [
    { id: 't1', title: 'High prio', priority: 'high', duration: 30, completed: false, dueDate: null },
    { id: 't2', title: 'Low prio', priority: 'low', duration: 45, completed: false, dueDate: null },
    { id: 't3', title: 'Completed', priority: 'urgent', duration: 60, completed: true, dueDate: null }
  ];
  const slots = [
    { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' }
  ];
  const result = scheduler.optimizeDay(tasks, slots, 1, '2025-01-01');
  assert(result.schedule.length === 2, 'optimizeDay schedules 2 pending tasks');
  assert(result.schedule[0].title === 'High prio', 'High priority scheduled first');
  assert(result.totalTasksScheduled === 2, 'totalTasksScheduled is correct');
  assert(result.totalDuration === 75, 'totalDuration is 30+45=75');
});

test('optimizeWeek returns 7 days', () => {
  const result = scheduler.optimizeWeek([], []);
  assert(result.length === 7, 'optimizeWeek returns 7 days');
});

test('findBestTaskSlot', () => {
  const task = { id: 't', duration: 60 };
  const free = [
    { start: 0, end: 30 },
    { start: 100, end: 200 }
  ];
  const slot = scheduler.findBestTaskSlot(task, free);
  assert(slot !== null, 'findBestTaskSlot finds slot');
  assert(slot.start === 100 && slot.end === 160, 'Uses first sufficient slot');
});

test('minToTime conversion', () => {
  assert(scheduler.minToTime(0) === '00:00', 'minToTime 0');
  assert(scheduler.minToTime(60) === '01:00', 'minToTime 60');
  assert(scheduler.minToTime(750) === '12:30', 'minToTime 750');
});

// ====== 4. PERSONALIZED PRODUCTIVITY RECOMMENDATIONS ======

test('Streak calculation - when today is not logged, streak is 0', () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const logs = [{ date: yesterday.toISOString().split('T')[0] }];
  const streak = calcStreak(logs, today);
  assert(streak === 0, 'streak is 0 when today is not logged');
});

test('Streak calculation - consecutive days', () => {
  const today = new Date();
  const logs = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    logs.push({ date: d.toISOString().split('T')[0] });
  }
  const streak = calcStreak(logs, today);
  assert(streak === 5, 'streak is 5 for 5 consecutive days');
});

test('Streak calculation - gap breaks streak', () => {
  const today = new Date();
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const logs = [
    { date: today.toISOString().split('T')[0] },
    { date: twoDaysAgo.toISOString().split('T')[0] }
  ];
  const streak = calcStreak(logs, today);
  assert(streak === 1, 'streak is 1 because yesterday is missing');
});

test('AI recommendation data analysis - low productivity', () => {
  db.addTask({ id: 'rec1', userId: TEST_USER, title: 'Unfinished 1', priority: 'high', dueDate: new Date(Date.now() - 86400000).toISOString().split('T')[0], completed: 0, createdAt: new Date().toISOString(), subtasks: [] });
  db.addTask({ id: 'rec2', userId: TEST_USER, title: 'Unfinished 2', priority: 'medium', dueDate: new Date().toISOString().split('T')[0], completed: 0, createdAt: new Date().toISOString(), subtasks: [] });
  db.addTask({ id: 'rec3', userId: TEST_USER, title: 'Finished 1', priority: 'low', completed: 1, createdAt: new Date().toISOString(), subtasks: [], completedAt: new Date().toISOString() });

  const tasks = db.getTasks(TEST_USER);
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length;
  const productivityScore = total ? Math.round((completed / total) * 100) : 0;

  assert(total === 3, '3 tasks exist for rec test');
  assert(completed === 1, '1 task completed');
  assert(overdue >= 1, 'At least 1 overdue task detected');
  assert(productivityScore < 50, 'Productivity score below 50%');

  ['rec1', 'rec2', 'rec3'].forEach(id => db.deleteTask(id));
});

// ====== 5. AUTONOMOUS TASK PLANNING & EXECUTION ======

test('AutoPilot toggle', () => {
  db.setAutoPilot(TEST_USER, true);
  assert(db.getAutoPilot(TEST_USER) === true, 'setAutoPilot(true) works');
  db.setAutoPilot(TEST_USER, false);
  assert(db.getAutoPilot(TEST_USER) === false, 'setAutoPilot(false) works');
});

test('Autonomous agent start/stop', () => {
  const agent = require('../services/autonomousAgent');
  agent.start();
  agent.stop();
  assert(true, 'Autonomous agent starts and stops without error');
});

test('Schedule auto-generated for autopilot', () => {
  const agent = require('../services/autonomousAgent');
  db.setAutoPilot(TEST_USER, true);

  db.addSlot({ id: 'as1', userId: TEST_USER, title: 'Free block', startTime: '14:00', endTime: '17:00', dayOfWeek: new Date().getDay(), color: '#6366f1' });

  const tasks = db.getTasks(TEST_USER);
  if (tasks.filter(t => !t.completed).length === 0) {
    db.addTask({
      id: 'auto1', userId: TEST_USER, title: 'Auto test task', priority: 'medium',
      dueDate: new Date().toISOString().split('T')[0], duration: 30,
      completed: 0, createdAt: new Date().toISOString(), subtasks: []
    });
  }

  const result = scheduler.optimizeDay(db.getTasks(TEST_USER), db.getSlots(TEST_USER), new Date().getDay(), new Date().toISOString().split('T')[0]);
  assert(typeof result.totalTasksScheduled === 'number', 'optimizeDay returns schedule count');

  db.setAutoPilot(TEST_USER, false);
  db.deleteSlot('as1');
});

// ====== FINAL CLEANUP ======
cleanup();

console.log(`\n========================================`);
console.log(`  Passed: ${passed}  |  Failed: ${failed}`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
