const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToTime(m) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function getFreeSlots(slots, dayOfWeek, dateStr) {
  const daySlots = slots
    .filter(s => s.dayOfWeek === dayOfWeek)
    .sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));

  const freeRanges = [];
  let cursor = 0;

  for (const s of daySlots) {
    const start = timeToMin(s.startTime);
    if (cursor < start) {
      freeRanges.push({ start: cursor, end: start });
    }
    const end = timeToMin(s.endTime);
    cursor = Math.max(cursor, end);
  }

  if (cursor < 1440) {
    freeRanges.push({ start: cursor, end: 1440 });
  }

  return freeRanges;
}

function priorityScore(task) {
  const weights = { urgent: 4, high: 3, medium: 2, low: 1 };
  let score = weights[task.priority] || 2;

  if (task.dueDate) {
    const now = new Date();
    const due = new Date(task.dueDate);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    score += Math.max(0, 4 - diffDays);
  }

  if (task.completed) score = 0;
  return score;
}

function estimateDuration(task) {
  return task.duration || 30;
}

function optimizeDay(tasks, slots, dayOfWeek, dateStr) {
  const freeSlots = getFreeSlots(slots, dayOfWeek, dateStr);
  const pending = tasks
    .filter(t => !t.completed)
    .sort((a, b) => priorityScore(b) - priorityScore(a));

  const schedule = [];

  for (const task of pending) {
    const duration = estimateDuration(task);
    for (let fi = 0; fi < freeSlots.length; fi++) {
      const fs = freeSlots[fi];
      const available = fs.end - fs.start;
      if (available >= duration) {
        schedule.push({
          taskId: task.id,
          title: task.title,
          priority: task.priority,
          startTime: minToTime(fs.start),
          endTime: minToTime(fs.start + duration),
          duration
        });
        fs.start += duration;
        break;
      }
    }
  }

  return {
    date: dateStr,
    dayOfWeek,
    dayName: DAY_NAMES[dayOfWeek],
    schedule: schedule.sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime)),
    totalTasksScheduled: schedule.length,
    totalDuration: schedule.reduce((s, t) => s + t.duration, 0)
  };
}

function optimizeWeek(tasks, slots) {
  const results = [];
  for (let d = 0; d < 7; d++) {
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + ((d - today.getDay() + 7) % 7));
    const dateStr = targetDate.toISOString().split('T')[0];
    results.push(optimizeDay(tasks, slots, d, dateStr));
  }
  return results;
}

function findBestTaskSlot(task, freeSlots) {
  const duration = estimateDuration(task);
  for (const fs of freeSlots) {
    if (fs.end - fs.start >= duration) {
      return { start: fs.start, end: fs.start + duration };
    }
  }
  return null;
}

module.exports = { optimizeDay, optimizeWeek, getFreeSlots, findBestTaskSlot, minToTime };
