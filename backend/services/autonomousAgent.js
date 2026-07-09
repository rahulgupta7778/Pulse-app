const db = require('../config/db');
const scheduler = require('./scheduler');

const CHECK_INTERVAL = 5 * 60 * 1000;
let intervalId = null;

function start() {
  if (intervalId) return;
  console.log('[AutoAgent] Autonomous planning service started');
  runCycle();
  intervalId = setInterval(runCycle, CHECK_INTERVAL);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[AutoAgent] Service stopped');
  }
}

function runCycle() {
  try {
    const users = db.getAllUserIds();
    for (const { id } of users) {
      try {
        processUser(id);
      } catch (e) {
        console.error('[AutoAgent] Error processing user ' + id + ':', e.message);
      }
    }
  } catch (e) {
    console.error('[AutoAgent] Cycle error:', e.message);
  }
}

function processUser(userId) {
  const tasks = db.getTasks(userId);
  const slots = db.getSlots(userId);
  const autoPilot = db.getAutoPilot(userId);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const dayOfWeek = now.getDay();

  const pending = tasks.filter(t => !t.completed);
  const dueSoon = pending.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diffDays <= 2 && diffDays >= 0;
  });

  const overdue = pending.filter(t => t.dueDate && new Date(t.dueDate) < now);

  if (autoPilot && pending.length > 0) {
    const result = scheduler.optimizeDay(tasks, slots, dayOfWeek, todayStr);
    const planKey = JSON.stringify(result.schedule.map(s => s.taskId).sort());
    const priorLog = db.getDailyLog(userId, todayStr);
    const priorData = priorLog ? (typeof priorLog.data === 'string' ? safeJson(priorLog.data, {}) : (priorLog.data || {})) : {};
    const previousPlan = JSON.stringify(priorData.autoPlan?.taskIds?.sort() || []);

    if (result.schedule.length > 0 && planKey !== previousPlan) {
      scheduleTasks(userId, result, todayStr, priorLog);
    }
  }

  generateSuggestions(userId, pending, dueSoon, overdue, todayStr);
}

function scheduleTasks(userId, plan, dateStr, existingLog) {
  const planData = {
    type: 'autoPlan',
    taskIds: plan.schedule.map(s => s.taskId),
    schedule: plan.schedule,
    generatedAt: new Date().toISOString()
  };

  if (existingLog) {
    const data = safeJson(existingLog.data, {});
    data.autoPlan = planData;
    db.updateDailyLog(userId, dateStr, data);
  } else {
    db.addDailyLog({ userId, date: dateStr, data: { autoPlan: planData } });
  }

  const existing = db.getNotifications(userId, false);
  const alreadyNotified = existing.some(n => n.type === 'auto_plan' && n.createdAt.startsWith(dateStr));
  if (!alreadyNotified) {
    db.addNotification({
      userId,
      type: 'auto_plan',
      title: 'Schedule optimized',
      message: "I've planned " + plan.schedule.length + " tasks into today's free slots. Check your timetable!",
      taskId: null
    });
  }
}

function generateSuggestions(userId, pending, dueSoon, overdue, todayStr) {
  const suggestions = [];

  if (overdue.length > 0) {
    const count = overdue.length;
    suggestions.push('You have ' + count + ' overdue ' + (count === 1 ? 'task' : 'tasks') + '. Start with "' + overdue[0].title + '" to regain momentum.');
  }

  if (dueSoon.length > 0) {
    const nearest = dueSoon.reduce((a, b) => {
      if (!a.dueDate) return b;
      if (!b.dueDate) return a;
      return new Date(a.dueDate) < new Date(b.dueDate) ? a : b;
    });
    const diffDays = Math.ceil((new Date(nearest.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    const timeLabel = diffDays === 0 ? 'today' : diffDays === 1 ? 'tomorrow' : 'in ' + diffDays + ' days';
    suggestions.push('"' + nearest.title + '" is due ' + timeLabel + '. Consider starting it now.');
  }

  if (pending.length === 0) {
    suggestions.push('All tasks completed! Take a break or set new goals for tomorrow.');
  }

  const pendingHigh = pending.filter(t => t.priority === 'urgent' || t.priority === 'high');
  if (pendingHigh.length > 0 && suggestions.length < 2) {
    suggestions.push('Focus on high-priority tasks first: "' + pendingHigh[0].title + '".');
  }

  if (suggestions.length > 0) {
    const existingNotifs = db.getNotifications(userId, false);
    for (const suggestion of suggestions) {
      const alreadySent = existingNotifs.some(n => n.message === suggestion && n.createdAt.startsWith(todayStr));
      if (!alreadySent) {
        db.addNotification({
          userId,
          type: 'auto_suggestion',
          title: 'Proactive suggestion',
          message: suggestion,
          taskId: null
        });
      }
    }

    const existingLog = db.getDailyLog(userId, todayStr);
    if (existingLog) {
      const data = typeof existingLog.data === 'string' ? safeJson(existingLog.data, {}) : (existingLog.data || {});
      data.autoSuggestions = suggestions;
      db.updateDailyLog(userId, todayStr, data);
    } else {
      db.addDailyLog({ userId, date: todayStr, data: { autoSuggestions: suggestions } });
    }
  }
}

function safeJson(val, def) {
  try { return JSON.parse(val); } catch { return def; }
}

module.exports = { start, stop };
