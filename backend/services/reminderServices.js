const db = require('../config/db');
const pushService = require('./pushService');

const CHECK_INTERVAL = 60 * 1000;
let intervalId = null;

const REMINDER_WINDOWS = [
  { label: '15 minutes', ms: 15 * 60 * 1000, type: 'urgent' },
  { label: '1 hour', ms: 60 * 60 * 1000, type: 'upcoming' },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000, type: 'daily' }
];

function start() {
  if (intervalId) return;
  console.log('[Reminders] Service started');
  checkAllUsers();
  intervalId = setInterval(checkAllUsers, CHECK_INTERVAL);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Reminders] Service stopped');
  }
}

function checkAllUsers() {
  try {
    const now = new Date();
    const allUsers = db.getAllUserIds();
    for (const { id } of allUsers) {
      const tasks = db.getTasks(id);
      if (tasks.length > 0) checkUserReminders(id, now);
    }
  } catch (e) {
    console.error('[Reminders] Error:', e.message);
  }
}

function hasExistingNotification(userId, taskId, type) {
  const notifs = db.getNotifications(userId, true);
  return notifs.some(n => n.taskId === taskId && n.type === type);
}

function checkUserReminders(userId, now) {
  const tasks = db.getTasks(userId);
  const nowMs = now.getTime();

  for (const task of tasks) {
    if (task.completed) continue;

    if (task.dueDate && task.dueTime) {
      const dueDate = new Date(`${task.dueDate}T${task.dueTime}`);
      const diffMs = dueDate.getTime() - nowMs;

      for (const window of REMINDER_WINDOWS) {
        if (diffMs > 0 && diffMs <= window.ms && diffMs > window.ms - CHECK_INTERVAL - 1000) {
          if (!hasExistingNotification(userId, task.id, `deadline_${window.type}`)) {
            db.addNotification({
              userId,
              type: `deadline_${window.type}`,
              title: `${window.label} warning`,
              message: `"${task.title}" is due in ${window.label}`,
              taskId: task.id
            });
            pushService.sendToUser(userId, `⏰ ${window.label} warning`, `"${task.title}" is due in ${window.label}`);
          }
        }
      }

      if (diffMs < 0 && Math.abs(diffMs) < CHECK_INTERVAL + 1000) {
        if (!hasExistingNotification(userId, task.id, 'overdue')) {
          db.addNotification({
            userId,
            type: 'overdue',
            title: 'Task overdue!',
            message: `"${task.title}" was due at ${task.dueTime}`,
            taskId: task.id
          });
          pushService.sendToUser(userId, '🚨 Task overdue!', `"${task.title}" was due at ${task.dueTime}`);
        }
      }
    }

    if (task.dueDate && !task.dueTime) {
      const dueDate = new Date(task.dueDate + 'T23:59:59');
      const diffMs = dueDate.getTime() - nowMs;

      if (diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000 && diffMs > 24 * 60 * 60 * 1000 - CHECK_INTERVAL - 1000) {
        if (!hasExistingNotification(userId, task.id, 'deadline_24h')) {
          db.addNotification({
            userId,
            type: 'deadline_daily',
            title: 'Due tomorrow',
            message: `"${task.title}" is due tomorrow`,
            taskId: task.id
          });
          pushService.sendToUser(userId, '📅 Due tomorrow', `"${task.title}" is due tomorrow`);
        }
      }

      if (diffMs < 0 && Math.abs(diffMs) < CHECK_INTERVAL + 1000) {
        if (!hasExistingNotification(userId, task.id, 'overdue')) {
          db.addNotification({
            userId,
            type: 'overdue',
            title: 'Task overdue!',
            message: `"${task.title}" was due yesterday`,
            taskId: task.id
          });
          pushService.sendToUser(userId, '🚨 Task overdue!', `"${task.title}" was due yesterday`);
        }
      }
    }
  }

  checkGoalReminders(userId);
  checkHabitReminders(userId, now);
}

function checkGoalReminders(userId) {
  const goals = db.getGoals(userId);
  for (const goal of goals) {
    if (goal.progress < goal.targetCount) {
      const remaining = goal.targetCount - goal.progress;
      if (remaining > 0 && !hasExistingNotification(userId, goal.id, 'goal_reminder')) {
        db.addNotification({
          userId,
          type: 'goal_reminder',
          title: 'Goal progress',
          message: `You're ${remaining} ${remaining === 1 ? 'session' : 'sessions'} away from your goal: "${goal.title}"`,
          taskId: goal.id
        });
        pushService.sendToUser(userId, '🎯 Goal progress', `You're ${remaining} ${remaining === 1 ? 'session' : 'sessions'} away: "${goal.title}"`);
      }
    }
  }
}

function checkHabitReminders(userId, now) {
  const habits = db.getHabits(userId);
  const today = now.toISOString().split('T')[0];
  for (const habit of habits) {
    const log = db.getHabitLogForDate(habit.id, today);
    if (!log && !hasExistingNotification(userId, habit.id, 'habit_reminder')) {
      db.addNotification({
        userId,
        type: 'habit_reminder',
        title: 'Habit reminder',
        message: `Don't forget to complete "${habit.title}" today!`,
        taskId: habit.id
      });
      pushService.sendToUser(userId, '🔄 Habit reminder', `Don't forget to complete "${habit.title}" today!`);
    }
  }
}

module.exports = { start, stop };
