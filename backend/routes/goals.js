const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

// --- GOALS ---
router.get('/', (req, res) => {
  res.json(db.getGoals(req.userId));
});

router.post('/', (req, res) => {
  const { title, description, category, targetCount } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const goal = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    userId: req.userId,
    title,
    description: description || '',
    category: category || 'personal',
    targetCount: targetCount || 1,
    progress: 0,
    streak: 0,
    bestStreak: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.addGoal(goal);
  db.addXp(req.userId, 15, 'Goal created');
  db.checkAchievements(req.userId);
  res.status(201).json(goal);
});

router.put('/:id', (req, res) => {
  const existing = db.getGoals(req.userId).find(g => g.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Goal not found' });
  const goal = db.updateGoal(req.params.id, req.body);
  res.json(goal);
});

router.delete('/:id', (req, res) => {
  const existing = db.getGoals(req.userId).find(g => g.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Goal not found' });
  db.deleteGoal(req.params.id);
  res.json({ success: true });
});

router.post('/:id/increment', (req, res) => {
  const goal = db.getGoals(req.userId).find(g => g.id === req.params.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  const newProgress = Math.min(goal.progress + 1, goal.targetCount);
  const updated = db.updateGoal(req.params.id, { progress: newProgress });
  if (newProgress >= goal.targetCount && goal.progress < goal.targetCount) {
    db.addNotification({
      userId: req.userId, type: 'goal_complete',
      title: 'Goal achieved!',
      message: `Congratulations! You completed your goal: "${goal.title}"`,
      taskId: goal.id
    });
  }
  res.json(updated);
});

// --- HABITS ---
router.get('/habits', (req, res) => {
  const habits = db.getHabits(req.userId);
  res.json(habits);
});

router.get('/habits/with-logs', (req, res) => {
  const habits = db.getHabits(req.userId);
  const today = new Date().toISOString().split('T')[0];
  const result = habits.map(h => {
    const log = db.getHabitLogForDate(h.id, today);
    return { ...h, loggedToday: log ? !!log.completed : false };
  });
  res.json(result);
});

router.get('/:goalId/habits', (req, res) => {
  res.json(db.getHabitsByGoal(req.params.goalId));
});

router.post('/habits', (req, res) => {
  const { title, goalId, frequency, daysOfWeek } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const habit = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    userId: req.userId,
    goalId: goalId || null,
    title,
    frequency: frequency || 'daily',
    daysOfWeek: daysOfWeek || [],
    streak: 0,
    bestStreak: 0,
    totalCount: 0,
    createdAt: new Date().toISOString()
  };
  db.addHabit(habit);
  res.status(201).json(habit);
});

router.put('/habits/:id', (req, res) => {
  const existing = db.getHabits(req.userId).find(h => h.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Habit not found' });
  const habit = db.updateHabit(req.params.id, req.body);
  res.json(habit);
});

router.delete('/habits/:id', (req, res) => {
  const existing = db.getHabits(req.userId).find(h => h.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Habit not found' });
  db.deleteHabit(req.params.id);
  res.json({ success: true });
});

// --- HABIT LOGS ---
router.get('/habits/:id/logs', (req, res) => {
  res.json(db.getHabitLogs(req.params.id));
});

router.post('/habits/:id/log', (req, res) => {
  try {
    const habit = db.getHabits(req.userId).find(h => h.id === req.params.id);
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    const date = new Date().toISOString().split('T')[0];
    const result = db.logHabit(req.params.id, req.userId, date);

    const logs = db.getStreakData(req.params.id);
    let streak = 0;
    const today = new Date();
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
    const totalCount = logs.length;
    const bestStreak = Math.max(streak, habit.bestStreak || 0);
    db.updateHabit(req.params.id, { streak, bestStreak, totalCount });
    db.addXp(req.userId, 8, 'Habit logged');
    db.checkAchievements(req.userId);

    if (habit.goalId) {
      const goalHabits = db.getHabitsByGoal(habit.goalId);
      const allLogged = goalHabits.every(h => {
        const log = db.getHabitLogForDate(h.id, date);
        return log && log.completed;
      });
      const goal = db.getGoals(req.userId).find(g => g.id === habit.goalId);
      if (goal) {
        const newProgress = allLogged ? Math.min(goal.progress + 1, goal.targetCount) : goal.progress;
        const goalStreak = allLogged ? (goal.streak || 0) + 1 : 0;
        db.updateGoal(habit.goalId, {
          progress: newProgress,
          streak: goalStreak,
          bestStreak: Math.max(goalStreak, goal.bestStreak || 0)
        });
        if (allLogged && newProgress >= goal.targetCount && goal.progress < goal.targetCount) {
          db.addNotification({
            userId: req.userId, type: 'goal_complete',
            title: 'Goal achieved!',
            message: `Congratulations! You completed your goal: "${goal.title}"`,
            taskId: goal.id
          });
        }
      }
    }

    res.json(result);
  } catch (e) {
    console.error('Habit log error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
