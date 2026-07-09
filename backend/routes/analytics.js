const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

router.get('/stats', (req, res) => {
  const tasks = db.getTasks(req.userId);
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length;
  const dueToday = tasks.filter(t => {
    if (!t.dueDate || t.completed) return false;
    return new Date(t.dueDate).toDateString() === new Date().toDateString();
  }).length;

  res.json({ total, completed, overdue, dueToday, productivityScore: total ? Math.round((completed / total) * 100) : 0 });
});

router.post('/log', (req, res) => {
  const log = { ...req.body, userId: req.userId, date: new Date().toISOString().split('T')[0] };
  db.addDailyLog(log);
  res.status(201).json(log);
});

// --- Focus Sessions ---
router.post('/focus-session', (req, res) => {
  const { taskId, duration, moodBefore } = req.body;
  const session = {
    id: 'fs' + Date.now() + Math.random().toString(36).slice(2, 6),
    userId: req.userId,
    taskId: taskId || null,
    duration: parseInt(duration, 10) || 25,
    moodBefore: moodBefore || 'neutral',
    createdAt: new Date().toISOString()
  };
  db.addFocusSession(session);
  res.status(201).json(session);
});

router.get('/focus-sessions', (req, res) => {
  const sessions = db.getFocusSessions(req.userId);
  res.json(sessions);
});

// --- Cognitive Load Score ---
router.get('/load-score', (req, res) => {
  const todayStr = req.query.date || new Date().toISOString().split('T')[0];
  const currentDay = req.query.dayOfWeek !== undefined ? parseInt(req.query.dayOfWeek) : new Date().getDay();
  
  const tasks = db.getTasks(req.userId);
  const slots = db.getSlots(req.userId);
  
  // Mood logged today
  const dailyLogs = db.getDailyLogs(req.userId);
  const todayLog = dailyLogs.find(l => l.date === todayStr);
  const mood = todayLog && todayLog.data && todayLog.data.mood ? todayLog.data.mood : 'neutral';

  const todayTasks = tasks.filter(t => !t.completed && t.dueDate === todayStr);
  const overdueTasks = tasks.filter(t => !t.completed && t.dueDate && t.dueDate < todayStr);
  const backlogTasks = tasks.filter(t => !t.completed && !t.dueDate);

  const todaySlots = slots.filter(s => {
    return s.dayOfWeek === currentDay;
  });

  // Calculate score
  let score = 0;
  
  todayTasks.forEach(t => {
    if (t.priority === 'urgent') score += 5;
    else if (t.priority === 'high') score += 4;
    else if (t.priority === 'medium') score += 3;
    else score += 2;
  });

  overdueTasks.forEach(t => {
    if (t.priority === 'urgent') score += 4;
    else if (t.priority === 'high') score += 3;
    else if (t.priority === 'medium') score += 2;
    else score += 1.5;
  });

  backlogTasks.forEach(t => {
    if (t.priority === 'urgent') score += 3;
    else if (t.priority === 'high') score += 2;
    else if (t.priority === 'medium') score += 1.5;
    else score += 1;
  });

  todaySlots.forEach(() => {
    score += 2; // 2 points per meeting/slot
  });

  // Mood modifier
  let moodMultiplier = 1.0;
  if (mood === 'stressed' || mood === 'tired') moodMultiplier = 1.4;
  else if (mood === 'unmotivated') moodMultiplier = 1.3;
  else if (mood === 'focused' || mood === 'energetic') moodMultiplier = 0.8;

  score = Math.round(score * moodMultiplier);

  let level = 'Low';
  let levelColor = '#10b981'; // green
  if (score >= 20) {
    level = 'Overloaded';
    levelColor = '#ef4444'; // red
  } else if (score >= 13) {
    level = 'Heavy';
    levelColor = '#f97316'; // orange
  } else if (score >= 6) {
    level = 'Moderate';
    levelColor = '#eab308'; // yellow
  }

  // Suggestions based on level and mood
  const suggestions = [];
  if (level === 'Overloaded' || level === 'Heavy') {
    suggestions.push("⚠️ High cognitive load detected. We recommend postponing non-urgent tasks to tomorrow.");
    suggestions.push("🌿 Try adding a 10-minute buffer time slot between your upcoming fixed slots.");
  } else {
    suggestions.push("✅ Your workload is well-balanced today. Excellent time for deep-focus projects.");
  }

  if (mood === 'stressed') {
    suggestions.push("🧘 Feel a bit stressed? Take a 5-minute deep-breathing break right now.");
  } else if (mood === 'tired') {
    suggestions.push("☕ Energy is low. Tackle small tasks first to build easy, low-stress momentum.");
  } else if (mood === 'energetic' || mood === 'focused') {
    suggestions.push("🚀 Energy high! Capitalize on this zone to tackle your most challenging 'urgent' task.");
  }

  res.json({
    score,
    level,
    levelColor,
    percentage: Math.min(Math.round((score / 25) * 100), 100),
    tasksCount: todayTasks.length,
    slotsCount: todaySlots.length,
    mood,
    suggestions
  });
});

// --- Auto-Relieve Cognitive Load ---
router.post('/auto-relieve', (req, res) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const tasks = db.getTasks(req.userId);
  
  // Find non-essential non-completed tasks due today
  const todayTasks = tasks.filter(t => !t.completed && t.dueDate === todayStr);
  const relievable = todayTasks.filter(t => t.priority !== 'urgent' && t.priority !== 'high');

  let relievedCount = 0;
  relievable.forEach(t => {
    db.updateTask(t.id, { ...t, dueDate: tomorrowStr });
    relievedCount++;
  });

  res.json({ success: true, relievedCount, message: `Successfully deferred ${relievedCount} low-priority tasks to tomorrow to relieve cognitive load.` });
});

// --- Weekly Debrief ---
router.get('/weekly-debrief', async (req, res) => {
  const tasks = db.getTasks(req.userId);
  const slots = db.getSlots(req.userId);
  const dailyLogs = db.getDailyLogs(req.userId);
  const focusSessions = db.getFocusSessions(req.userId);

  // Stats over last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentTasks = tasks.filter(t => {
    const d = new Date(t.createdAt || Date.now());
    return d >= sevenDaysAgo;
  });

  const completedTasks = recentTasks.filter(t => t.completed).length;
  const totalTasks = recentTasks.length;

  const recentSessions = focusSessions.filter(s => {
    const d = new Date(s.createdAt);
    return d >= sevenDaysAgo;
  });

  const totalFocusSessions = recentSessions.length;
  const totalFocusDuration = recentSessions.reduce((acc, s) => acc + s.duration, 0);
  const avgFocusSessionLength = totalFocusSessions > 0 ? Math.round(totalFocusDuration / totalFocusSessions) : 0;

  // Most common mood
  const recentLogs = dailyLogs.filter(l => {
    const d = new Date(l.date);
    return d >= sevenDaysAgo;
  });

  const moodCounts = {};
  recentLogs.forEach(l => {
    const m = l.data && l.data.mood;
    if (m) moodCounts[m] = (moodCounts[m] || 0) + 1;
  });

  let topMood = 'Neutral';
  let maxCount = 0;
  for (const [m, c] of Object.entries(moodCounts)) {
    if (c > maxCount) {
      maxCount = c;
      topMood = m.charAt(0).toUpperCase() + m.slice(1);
    }
  }

  const stats = {
    totalTasks,
    completedTasks,
    totalFocusSessions,
    totalFocusDuration,
    avgFocusSessionLength,
    topMood,
    weeklyCommitmentsCount: slots.length
  };

  let debriefText = await callGeminiForDebrief(stats);
  if (!debriefText) {
    debriefText = generateFallbackDebrief(stats);
  }

  res.json({ stats, debriefText });
});

async function callGeminiForDebrief(stats) {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [{
        role: 'user',
        parts: [{
          text: `You are an expert productivity coach. Analyze these performance stats for the user:
${JSON.stringify(stats)}

Provide a highly personalized, energetic, and ultra-concise Weekly performance review in raw Markdown. It must be brief, punchy, and scannable so the user can read it in under 30 seconds without feeling bored (max 120 words). Avoid long paragraphs or fluff.

Strictly format the response as follows:
### 📊 Quick Recap
1-2 punchy sentences summarizing tasks completed vs scheduled, and their deep focus momentum.

### 🧠 Energy & Focus
1-2 insightful sentences correlating their logged moods (like "${stats.topMood || 'Neutral'}") with their focus or completion velocity.

### 🎯 Next Steps
- **Action 1**: Bullet point with 1 concrete, highly actionable tip.
- **Action 2**: Bullet point with another concrete, actionable tip.`
        }]
      }]
    });
    return response.text;
  } catch (err) {
    console.error("[Debrief AI] Error calling Gemini:", err);
    return null;
  }
}

function generateFallbackDebrief(stats) {
  const completionRate = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;
  return `### 📊 Quick Recap
You completed **${stats.completedTasks}/${stats.totalTasks}** tasks (**${completionRate}%** velocity) and registered **${stats.totalFocusSessions}** focus sessions for a total of **${stats.totalFocusDuration} minutes** of deep flow state.

### 🧠 Energy & Focus
Your dominant mood was **"${stats.topMood || 'Neutral'}"**. Staying focused during these emotional states averages **${stats.avgFocusSessionLength} minutes** per session.

### 🎯 Next Steps
- **Action 1**: Schedule deep focus blocks during your high-energy times to minimize cognitive friction.
- **Action 2**: Use the Mental Load Meter to delegate or push back low-priority tasks when stress builds up.`;
}

module.exports = router;