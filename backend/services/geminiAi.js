function findMatchingTask(query, tasks) {
  const q = (query || '').toLowerCase().trim();
  if (!q || !tasks) return null;

  const exact = tasks.find(t => t.title?.toLowerCase() === q);
  if (exact) return exact;

  const matches = tasks.filter(t => {
    const title = t.title?.toLowerCase() || '';
    return title.includes(q) || q.includes(title);
  });
  if (matches.length === 1) return matches[0];

  const words = q.split(/\s+/).filter(w => w.length > 2);
  const best = tasks.map(t => {
    const title = t.title?.toLowerCase() || '';
    const score = words.filter(w => title.includes(w)).length;
    return { task: t, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  return best[0]?.task || null;
}

function classifyPriority(title, desc) {
  const text = ((title || '') + ' ' + (desc || '')).toLowerCase();
  const urgent = ['urgent', 'asap', 'immediately', 'critical', 'deadline', 'emergency', 'tonight', 'today', 'overdue'];
  const high = ['important', 'high priority', 'must', 'need', 'required', 'crucial', 'essential', 'tomorrow'];
  if (urgent.some(w => text.includes(w))) return 'urgent';
  if (high.some(w => text.includes(w))) return 'high';
  return 'medium';
}

function classifyCategory(title, desc) {
  const text = ((title || '') + ' ' + (desc || '')).toLowerCase();
  if (text.includes('health') || text.includes('gym') || text.includes('workout') || text.includes('doctor') || text.includes('meditat')) return 'health';
  if (text.includes('finance') || text.includes('bill') || text.includes('money') || text.includes('payment') || text.includes('bank')) return 'finance';
  if (text.includes('study') || text.includes('learn') || text.includes('course') || text.includes('read') || text.includes('class')) return 'study';
  if (text.includes('personal') || text.includes('family') || text.includes('friend') || text.includes('mom') || text.includes('dad')) return 'personal';
  return 'work';
}

function extractDueDate(message) {
  const lower = message.toLowerCase();
  const today = new Date();
  let date = null;

  if (lower.includes('today') || lower.includes('tonight')) {
    date = new Date(today);
  } else if (lower.includes('tomorrow')) {
    date = new Date(today);
    date.setDate(date.getDate() + 1);
  } else if (lower.includes('next week')) {
    date = new Date(today);
    date.setDate(date.getDate() + 7);
  } else if (lower.includes('next month')) {
    date = new Date(today);
    date.setMonth(date.getMonth() + 1);
  } else {
    const dayMatch = lower.match(/(?:this |next |on |by )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (dayMatch) {
      const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const targetDay = days.indexOf(dayMatch[1]);
      const currentDay = today.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      if (lower.includes('next')) diff += 7;
      date = new Date(today);
      date.setDate(date.getDate() + diff);
    } else {
      const dateMatch = lower.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i);
      if (dateMatch) {
        const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
        const monthStr = dateMatch[2].toLowerCase().slice(0, 3);
        date = new Date(parseInt(dateMatch[1]), months[monthStr], 1);
        if (date < today) date.setFullYear(date.getFullYear() + 1);
      }
    }
  }
  return date ? date.toISOString().split('T')[0] : null;
}

function extractTime(message) {
  const lower = message.toLowerCase();
  const match = lower.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i) || lower.match(/(\d{1,2})\s*(am|pm)/i);
  if (match) {
    let h = parseInt(match[1]);
    const m = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[match.length - 1]?.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (lower.includes('morning')) return '09:00';
  if (lower.includes('afternoon')) return '14:00';
  if (lower.includes('evening')) return '18:00';
  if (lower.includes('night')) return '21:00';
  return null;
}

function extractRecurrence(message) {
  const lower = message.toLowerCase();
  if (lower.includes('every day') || lower.includes('daily')) return 'daily';
  if (lower.includes('every week') || lower.includes('weekly') || lower.includes('every sunday') || lower.includes('every monday')) return 'weekly';
  if (lower.includes('every month') || lower.includes('monthly')) return 'monthly';
  if (lower.includes('every weekday') || lower.includes('weekdays')) return 'weekdays';
  if (lower.includes('every weekend') || lower.includes('weekends')) return 'weekends';
  return null;
}

function parseTaskFromMessage(message) {
  const lower = message.toLowerCase().trim();

  const patterns = [
    /(?:add|create|make|new)\s+(?:a\s+|an\s+|the\s+)?(?:task|todo|reminder|item|note)\s+(?:called\s+|titled\s+|named\s+)?["""]?(.+?)["""]?(?:\s+(?:with|having|due|by|at|on|priority)\s+.+)?$/i,
    /remind\s+(?:me\s+)?(?:to\s+)?(.+?)(?:\s+(?:at|on|by|every|daily|weekly|tomorrow|today)\s+.+)?$/i,
    /(?:i\s+)?(?:need\s+to|have\s+to|must|gotta|got\s+to)\s+(.+?)(?:\s+(?:by|before|at|on|today|tomorrow)\s+.+)?$/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1] && match[1].trim().length > 0) {
      let title = match[1].trim();
      const cutoff = title.search(/\s+(?:with|priority|due|by|at|on)\s+/i);
      if (cutoff > 0) title = title.slice(0, cutoff).trim();
      title = title.replace(/["""]+/g, '').trim();
      if (title.length < 3) continue;

      const dueDate = extractDueDate(message);
      const dueTime = extractTime(message);
      const recurrence = extractRecurrence(message);
      const priority = classifyPriority(title, message);
      const category = classifyCategory(title, message);

      let duration = 30;
      const durationMatch = message.match(/(\d+)\s*(?:min|minute|hour|hr)/i);
      if (durationMatch) {
        if (durationMatch[0].toLowerCase().includes('hour') || durationMatch[0].toLowerCase().includes('hr')) {
          duration = parseInt(durationMatch[1]) * 60;
        } else {
          duration = parseInt(durationMatch[1]);
        }
      }

      return { title, priority, category, dueDate, dueTime, duration, recurrence };
    }
  }
  return null;
}

function parseTaskToggle(message, tasks) {
  const lower = message.toLowerCase().trim();
  const toggleRe = /(?:mark|set|check|toggle|done|complete|finish)\s+(?:task\s+|the\s+|as\s+|it\s+|with\s+)?(.+?)\s+(?:as\s+|it\s+)?(?:done|complete|finished|incomplete|pending)/i;
  const m = lower.match(toggleRe);
  if (!m || !m[1]) return null;

  const taskName = m[1].replace(/["""]/g, '').trim();
  if (!taskName || taskName.length < 2) return null;
  const task = findMatchingTask(taskName, tasks);
  if (!task) return null;

  const completing = !task.completed;
  return {
    type: 'task_toggled',
    data: { task_id: task.id, completed: completing },
    label: task.title
  };
}

function parseTaskDelete(message, tasks) {
  const lower = message.toLowerCase().trim();
  const deleteRe = /(?:delete|remove|cancel|erase|get\s+rid\s+of|forget|drop|trash)\s+(?:task\s+|the\s+)?(.+)/i;
  const m = lower.match(deleteRe);
  if (!m || !m[1]) return null;

  const taskName = m[1].replace(/["""]/g, '').trim();
  if (!taskName || taskName.length < 2) return null;
  const task = findMatchingTask(taskName, tasks);
  if (!task) return null;

  return {
    type: 'task_deleted',
    data: { task_id: task.id },
    label: task.title
  };
}

function parseTaskUpdate(message, tasks) {
  const lower = message.toLowerCase().trim();
  const updatePatterns = [
    /(?:change|update|rename|reschedule|move|modify)\s+(?:task\s+|the\s+)?/i,
  ];
  const isUpdate = updatePatterns.some(p => p.test(lower));
  if (!isUpdate) return null;

  const rest = lower.replace(updatePatterns[0], '').replace(/["""]/g, '').trim();
  const taskName = rest.split(/\s+(?:to|by|for|on|as)\s+/)[0]?.trim();
  if (!taskName || taskName.length < 2) return null;
  const task = findMatchingTask(taskName, tasks);
  if (!task) return null;

  const updates = {};
  const remainder = rest.slice(taskName.length).trim();

  const titleMatch = remainder.match(/(?:to|as|rename)\s+(?:["""]?(.+?)["""]?)$/i);
  if (titleMatch) updates.title = titleMatch[1].replace(/["""]/g, '').trim();

  const priorityMatch = remainder.match(/(?:priority|as)\s+(urgent|high|medium|low)/i);
  if (priorityMatch) updates.priority = priorityMatch[1].toLowerCase();

  const date = extractDueDate(remainder);
  if (date) updates.dueDate = date;

  const time = extractTime(remainder);
  if (time) updates.due_time = time;

  if (remainder.includes('done') || remainder.includes('complete') || remainder.includes('finished')) {
    updates.completed = true;
  }

  if (!Object.keys(updates).length) return null;

  return {
    type: 'task_updated',
    data: { task_id: task.id, ...updates },
    label: task.title
  };
}

function parseGoalFromMessage(message) {
  const lower = message.toLowerCase().trim();
  const goalPatterns = [
    /(?:add|create|set|new|start)\s+(?:a\s+|an\s+|the\s+)?(?:goal|objective|target|aim)\s+(?:called\s+|titled\s+|named\s+)?["""]?(.+?)["""]?(?:\s+(?:with|target|count|called)\s+.+)?$/i,
    /(?:i\s+)?(?:want\s+to|aim\s+to|plan\s+to)\s+(.+?)(?:\s+(?:by|before|within|in)\s+.+)?$/i,
    /set\s+(?:a\s+)?(?:goal|target)\s+(?:to\s+|for\s+)?(.+?)$/i,
  ];

  for (const pattern of goalPatterns) {
    const match = lower.match(pattern);
    if (match && match[1] && match[1].trim().length > 0) {
      let title = match[1].trim();
      const cutoff = title.search(/\s+(?:with|target|count)\s+/i);
      if (cutoff > 0) title = title.slice(0, cutoff).trim();
      title = title.replace(/["""]+/g, '').trim();
      if (title.length < 3) continue;

      const category = classifyCategory(title, message);
      const countMatch = message.match(/(\d+)\s*(?:times?|count|x)/i);
      const targetCount = countMatch ? parseInt(countMatch[1]) : 1;

      return {
        type: 'goal_added',
        data: { title, category, target_count: targetCount },
        label: title
      };
    }
  }
  return null;
}

function parseHabitFromMessage(message) {
  const lower = message.toLowerCase().trim();
  const habitPatterns = [
    /(?:add|create|start|track)\s+(?:a\s+|an\s+|the\s+)?(?:habit|routine)\s+(?:called\s+|titled\s+|named\s+|of\s+)?["""]?(.+?)["""]?(?:\s+(?:with|daily|weekly|called)\s+.+)?$/i,
    /(?:i\s+)?(?:want\s+to|should|will)\s+(.+?)\s+(?:every\s+day|daily|each\s+day|every\s+week|weekly)/i,
  ];

  for (const pattern of habitPatterns) {
    const match = lower.match(pattern);
    if (match && match[1] && match[1].trim().length > 0) {
      let title = match[1].trim();
      const cutoff = title.search(/\s+(?:with|called)\s+/i);
      if (cutoff > 0) title = title.slice(0, cutoff).trim();
      title = title.replace(/["""]+/g, '').trim();
      if (title.length < 3) continue;

      let frequency = 'daily';
      if (lower.includes('weekly') || lower.includes('every week')) frequency = 'weekly';
      else if (lower.includes('weekday')) frequency = 'weekdays';
      else if (lower.includes('weekend')) frequency = 'weekends';

      return {
        type: 'habit_added',
        data: { title, frequency },
        label: title
      };
    }
  }
  return null;
}

const AIService = {
  async chat(message, context) {
    if (!message) return { response: "Hi! I'm your productivity assistant. How can I help?" };

    const lower = message.toLowerCase().trim();
    const tasks = context?.tasks || [];
    const slots = context?.slots || [];

    const taskIntent = parseTaskFromMessage(message);

    if (taskIntent && (lower.startsWith('add') || lower.startsWith('create') || lower.startsWith('make') || lower.startsWith('new') || lower.startsWith('remind'))) {
      const action = {
        type: 'task_added',
        data: {
          title: taskIntent.title,
          priority: taskIntent.priority,
          category: taskIntent.category,
          dueDate: taskIntent.dueDate,
          dueTime: taskIntent.dueTime,
          duration: taskIntent.duration
        }
      };

      let resp = `✅ **Task created:** "${taskIntent.title}"`;
      if (taskIntent.priority && taskIntent.priority !== 'medium') resp += ` (${taskIntent.priority} priority)`;
      if (taskIntent.dueDate) resp += ` — due ${new Date(taskIntent.dueDate).toLocaleDateString()}`;
      if (taskIntent.dueTime) resp += ` at ${taskIntent.dueTime}`;
      if (taskIntent.duration && taskIntent.duration !== 30) resp += ` (${taskIntent.duration} min)`;
      if (taskIntent.recurrence) resp += `\n🔄 Repeats ${taskIntent.recurrence} — I've noted that! You can set up a habit for recurring items.`;
      resp += '\n\nIs there anything else you need help with?';

      return { response: resp, actions: [action] };
    }

    const toggleIntent = parseTaskToggle(message, tasks);
    if (toggleIntent) {
      const status = toggleIntent.data.completed ? 'done' : 'uncompleted';
      return {
        response: `✅ Marked "${toggleIntent.label}" as **${status}**.`,
        actions: [toggleIntent]
      };
    }

    const deleteIntent = parseTaskDelete(message, tasks);
    if (deleteIntent) {
      return {
        response: `🗑️ Deleted "${deleteIntent.label}".`,
        actions: [deleteIntent]
      };
    }

    const updateIntent = parseTaskUpdate(message, tasks);
    if (updateIntent) {
      const parts = [];
      if (updateIntent.data.title) parts.push(`renamed to "${updateIntent.data.title}"`);
      if (updateIntent.data.priority) parts.push(`priority → ${updateIntent.data.priority}`);
      if (updateIntent.data.dueDate || updateIntent.data.due_time) {
        const d = updateIntent.data.dueDate ? new Date(updateIntent.data.dueDate).toLocaleDateString() : '';
        const t = updateIntent.data.due_time || '';
        parts.push(`due ${d} ${t}`.trim());
      }
      if (updateIntent.data.completed) parts.push('marked done');
      const detail = parts.length ? ` — ${parts.join(', ')}` : '';
      return {
        response: `✅ Updated "${updateIntent.label}"${detail}.`,
        actions: [updateIntent]
      };
    }

    const goalIntent = parseGoalFromMessage(message);
    if (goalIntent) {
      let resp = `🎯 **Goal created:** "${goalIntent.data.title}"`;
      if (goalIntent.data.target_count > 1) resp += ` (target: ${goalIntent.data.target_count} times)`;
      resp += '\n\nYou can link habits to this goal to track progress!';
      return { response: resp, actions: [goalIntent] };
    }

    const habitIntent = parseHabitFromMessage(message);
    if (habitIntent) {
      let resp = `🔄 **Habit created:** "${habitIntent.data.title}"`;
      if (habitIntent.data.frequency !== 'daily') resp += ` (${habitIntent.data.frequency})`;
      resp += '\n\nI\'ll help you stay consistent! Try logging it daily.';
      return { response: resp, actions: [habitIntent] };
    }

    if (lower.includes('prioritize') || lower.includes('what should i do first') || lower.includes('what to do') || lower.includes('important') || lower.includes('focus on') || lower.includes('should i work on') || lower.includes('most urgent') || lower.includes('what next')) {
      return { response: this._prioritize(tasks) };
    }

    if (lower.includes('break down') || lower.includes('subtask') || lower.includes('step')) {
      return { response: this._breakdown(tasks) };
    }

    if (lower.includes('motivat') || lower.includes('push') || lower.includes('encourage') || lower.includes('stuck') || lower.includes('procrastinat')) {
      return { response: this._motivate(tasks) };
    }

    if (lower.includes('risk') || lower.includes('miss') || lower.includes('overdue') || lower.includes('behind') || lower.includes('deadline')) {
      return { response: this._riskAnalysis(tasks) };
    }

    if (lower.includes('optimize') || lower.includes('schedule my day') || (lower.includes('schedule') && (lower.includes('today') || lower.includes('day') || lower.includes('my')))) {
      const schedule = this._optimize(tasks, slots);
      return {
        response: schedule,
        actions: [{
          type: 'schedule_created',
          data: { day: 'today', schedule }
        }]
      };
    }

    if (lower.includes('overview') || lower.includes('my day') || lower.includes("what's today") || lower.includes('plan')) {
      return { response: this._dayOverview(tasks, slots) };
    }

    if (lower.includes('tip') || lower.includes('advice') || lower.includes('suggest') || lower.includes('how to')) {
      return { response: this._productivityTip(tasks) };
    }

    if (lower.includes('pomodoro') || lower.includes('focus') || lower.includes('timer')) {
      return { response: "Try the Pomodoro technique: 25 minutes of focused work, then a 5-minute break. I can open the Focus Mode timer for you if you ask! It helps maintain concentration and prevents burnout." };
    }

    if (lower.includes('distract') || lower.includes('block')) {
      return { response: "To beat procrastination:\n1. Start with just 5 minutes — the hardest part is beginning\n2. Break your task into tiny steps\n3. Remove distractions (phone on silent, close extra tabs)\n4. Try the Pomodoro timer I can open for you\n5. Reward yourself after completing each step\n\nWhat's the task you're avoiding? I can help break it down." };
    }

    if (lower.includes('hello') || lower.includes('hi ') || lower.includes('hey') || lower.includes('help') || lower.includes('what can you')) {
      const count = tasks.filter(t => !t.completed).length;
      if (count === 0) {
        return { response: "Welcome back! You have no pending tasks — enjoy your free time! Want me to suggest something productive?" };
      }
      return { response: `Hello! You have **${count}** incomplete task${count > 1 ? 's' : ''} right now.\n\nI can help you:\n• **Create tasks** — "add task buy groceries tomorrow at 5pm"\n• **Update/complete tasks** — "mark buy groceries as done"\n• **Delete tasks** — "delete buy groceries"\n• **Set goals** — "add goal read 12 books"\n• **Track habits** — "start habit meditate daily"\n• **Prioritize** — What to focus on first\n• **Break down** — Split tasks into steps\n• **Motivate** — Get a productivity boost\n• **Check risks** — Find overdue deadlines\n• **Optimize** — Fit tasks into your free time\n• **My day** — See your day's overview\n• **Tips** — Productivity advice\n\nWhat would you like?` };
    }

    const overdueCount = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length;
    const dueToday = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate).toDateString() === new Date().toDateString()).length;
    if (overdueCount > 0 || dueToday > 0) {
      const parts = [];
      if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
      if (dueToday > 0) parts.push(`${dueToday} due today`);
      return { response: `Quick heads-up: You have ${parts.join(' and ')}. Say "prioritize" and I'll help you sort them out!` };
    }

    const snapshot = tasks.filter(t => !t.completed).slice(0, 5);
    let resp = "I'm here to help you stay productive!\n\n";
    if (snapshot.length > 0) {
      resp += "Here's what I see on your plate:\n";
      snapshot.forEach(t => resp += `• ${t.title}${t.dueDate ? ' (' + new Date(t.dueDate).toLocaleDateString() + ')' : ''}\n`);
      resp += '\n';
    } else {
      resp += "You have no pending tasks — enjoy your free time!\n\n";
    }
    resp += 'I can help with:\n• **Create tasks** — "add task buy groceries"\n• **Update/complete tasks** — "mark buy groceries as done"\n• **Delete tasks** — "delete buy groceries"\n• **Set goals** — "add goal read 12 books"\n• **Track habits** — "start habit meditate daily"\n• **Prioritize** — What to focus on first\n• **Break down** — Split tasks into steps\n• **Motivate** — Get a productivity boost\n• **Check risks** — Find overdue deadlines\n• **Optimize** — Fit tasks into your free time\n• **My day** — See your day\'s overview\n• **Tips** — Productivity advice\n\nWhat would you like help with?';
    return { response: resp };
  },

  _prioritize(tasks) {
    const incomplete = tasks.filter(t => !t.completed);
    if (incomplete.length === 0) return "You've completed everything! 🎉 Time to relax or add new tasks for tomorrow.";

    const sorted = [...incomplete].sort((a, b) => {
      const pa = { urgent: 4, high: 3, medium: 2, low: 1 }[a.priority] || 0;
      const pb = { urgent: 4, high: 3, medium: 2, low: 1 }[b.priority] || 0;
      if (pa !== pb) return pb - pa;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      return 0;
    });

    const urgent = sorted.filter(t => t.priority === 'urgent');
    const overdue = sorted.filter(t => t.dueDate && new Date(t.dueDate) < new Date());

    let resp = `📋 You have **${incomplete.length} pending**\n\n`;
    if (overdue.length > 0) {
      resp += `🚨 **Overdue (${overdue.length}):**\n`;
      overdue.slice(0, 3).forEach(t => resp += `   • ${t.title} (was due ${new Date(t.dueDate).toLocaleDateString()})\n`);
      resp += '\n';
    }
    resp += `**Focus order:**\n`;
    sorted.slice(0, 5).forEach((t, i) => {
      const badge = { urgent: '🔥', high: '⚡', medium: '📌', low: '💭' }[t.priority] || '📌';
      resp += `${i + 1}. ${badge} **${t.title}**`;
      if (t.dueDate) {
        const diff = Math.ceil((new Date(t.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        resp += diff < 0 ? ` ⏰ Overdue` : diff === 0 ? ` 📅 Due today` : ` 📅 ${diff}d left`;
      }
      if (t.duration) resp += ` (${t.duration}m)`;
      resp += '\n';
    });
    if (sorted.length > 5) resp += `\n...and ${sorted.length - 5} more. `;
    resp += "\n💡 Want me to break down the top task?";
    return resp;
  },

  _breakdown(tasks) {
    const target = tasks.find(t => !t.completed && (t.priority === 'urgent' || t.priority === 'high')) || tasks.find(t => !t.completed);
    if (!target) return "No tasks to break down. Add a task first!";
    const steps = [
      `🎯 Clarify what "done" looks like for "${target.title}"`,
      `📚 Gather required materials/resources`,
      `⏰ Set aside ${target.duration || 30} minutes of focused time`,
      `✍️ Start with the first small step — even 5 minutes counts`,
      `✅ Review progress and finalize`
    ];
    return `Here's a breakdown for **${target.title}**:\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nWould you like me to add these as subtasks?`;
  },

  _motivate(tasks) {
    const incomplete = tasks.filter(t => !t.completed);
    const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date());
    if (incomplete.length === 0 && tasks.some(t => t.completed)) return "Amazing — you've completed everything! 🏆 Take a moment to appreciate your progress!";
    if (overdue.length > 0) return `You have ${overdue.length} overdue, but that's OK! Pick the shortest one and knock it out in 5 minutes. You've got this! 💪`;
    const quotes = [
      "You've got this! Start with 5 minutes and build momentum. 🚀",
      "The hardest part is starting. Take one small step right now! ⚡",
      "Done is better than perfect. Progress over perfection! 🎯",
      "Small progress is still progress. Focus on what you can do RIGHT NOW. 💪",
      "Future you will thank you for starting today. ⏳",
      "You don't have to be extreme, just consistent. One task at a time! 📈",
      "The best time to plant a tree was 20 years ago. The second best time is NOW. 🌱"
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  },

  _riskAnalysis(tasks) {
    const now = new Date();
    const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now);
    const dueSoon = tasks.filter(t => {
      if (!t.dueDate || t.completed) return false;
      const diff = Math.ceil((new Date(t.dueDate) - now) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 2;
    });
    if (overdue.length === 0 && dueSoon.length === 0) return "✅ You're in great shape! No tasks are overdue or due in the next 2 days.";
    let resp = '';
    if (overdue.length > 0) {
      resp += `🚨 **Overdue (${overdue.length}):**\n`;
      overdue.forEach(t => resp += `   • ${t.title} — ${Math.ceil((now - new Date(t.dueDate)) / (1000 * 60 * 60 * 24))}d overdue\n`);
      resp += '\n';
    }
    if (dueSoon.length > 0) {
      resp += `⚠️ **Due within 2 days (${dueSoon.length}):**\n`;
      dueSoon.forEach(t => {
        const diff = Math.ceil((new Date(t.dueDate) - now) / (1000 * 60 * 60 * 24));
        resp += `   • ${t.title} — ${diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${diff} days`}\n`;
      });
    }
    resp += "\n💡 Tackle the shortest overdue task first to build momentum.";
    return resp;
  },

  _optimize(tasks, slots) {
    const incomplete = tasks.filter(t => !t.completed);
    if (incomplete.length === 0) return "No tasks to optimize! Enjoy your free time. 🎉";
    const todaySlots = slots.filter(s => s.dayOfWeek === new Date().getDay());
    const busyMin = todaySlots.reduce((sum, s) => {
      const [sh, sm] = (s.startTime || '00:00').split(':').map(Number);
      const [eh, em] = (s.endTime || '00:00').split(':').map(Number);
      return sum + (eh * 60 + em - sh * 60 - sm);
    }, 0);
    const freeMin = Math.max(0, 24 * 60 - busyMin);
    const totalEstimate = incomplete.reduce((sum, t) => sum + (t.duration || 30), 0);

    if (totalEstimate > freeMin) {
      const urgentCount = incomplete.filter(t => t.priority === 'urgent' || t.priority === 'high').length;
      return `⚠️ You have **${incomplete.length} tasks** (~${this._formatMin(totalEstimate)}) but only ~${this._formatMin(freeMin)} free today.\n\n**Suggestions:**\n• Focus on ${urgentCount} urgent/high priority tasks first\n• Defer or delegate low-priority items\n• Break large tasks into 15-min sessions`;
    }

    const sorted = [...incomplete].sort((a, b) => {
      const pa = { urgent: 4, high: 3, medium: 2, low: 1 }[a.priority] || 0;
      const pb = { urgent: 4, high: 3, medium: 2, low: 1 }[b.priority] || 0;
      return pb - pa;
    });

    let resp = `✅ You have ~${this._formatMin(freeMin)} free today — enough for your tasks (~${this._formatMin(totalEstimate)}).\n\n**Suggested schedule:**\n`;
    let startTime = 9 * 60;
    sorted.slice(0, 5).forEach((t, i) => {
      const dur = t.duration || 30;
      const start = this._minToTime(startTime);
      const end = this._minToTime(startTime + dur);
      resp += `${i + 1}. ${start}–${end}: **${t.title}** (${dur} min)\n`;
      startTime += dur + 10;
    });
    if (sorted.length > 5) resp += `\n...and ${sorted.length - 5} more`;
    resp += "\n\n💡 Take 5-min breaks between tasks to stay fresh!";
    return resp;
  },

  _dayOverview(tasks, slots) {
    const now = new Date();
    const today = now.toDateString();
    const todayTasks = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate).toDateString() === today);
    const todaySlots = slots.filter(s => s.dayOfWeek === now.getDay());
    const completedToday = tasks.filter(t => t.completed && t.completedAt && new Date(t.completedAt).toDateString() === today);

    let resp = `📅 **${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}**\n\n`;
    if (todaySlots.length > 0) {
      resp += `**Fixed schedule:**\n`;
      todaySlots.forEach(s => resp += `   • ${s.startTime}–${s.endTime}: ${s.title}\n`);
      resp += '\n';
    }
    if (todayTasks.length > 0) {
      resp += `**Tasks due today (${todayTasks.length}):**\n`;
      todayTasks.forEach(t => {
        const badge = { urgent: '🔥', high: '⚡', medium: '📌', low: '💭' }[t.priority] || '📌';
        resp += `   • ${badge} ${t.title} (${t.duration || 30} min)\n`;
      });
    } else {
      resp += "**Tasks due today:** None — enjoy your day! 🎉\n";
    }
    if (completedToday.length > 0) resp += `\n✅ **Completed today:** ${completedToday.length}`;
    resp += "\n\n💡 Want me to optimize your schedule?";
    return resp;
  },

  _productivityTip(tasks) {
    const tips = [
      "The **2-minute rule**: If a task takes less than 2 minutes, do it immediately.",
      "**Eat the frog**: Do your hardest task FIRST thing in the morning.",
      "**Time blocking**: Assign specific time blocks for different types of work.",
      "**Pomodoro Technique**: Work 25 min, break 5 min. Great for focus!",
      "**Batch similar tasks**: Group emails, calls, errands together.",
      "**The 80/20 rule**: 80% of results come from 20% of your efforts.",
      "**Review weekly**: Spend 10 minutes every Friday reviewing your week."
    ];
    let tip = tips[Math.floor(Math.random() * tips.length)];
    const incomplete = tasks.filter(t => !t.completed).length;
    if (incomplete > 5) tip += `\n\nWith ${incomplete} pending, start with quick wins first!`;
    return tip;
  },

  _formatMin(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} hour${h > 1 ? 's' : ''}`;
    return `${h}h ${m}m`;
  },

  _minToTime(min) {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
};

module.exports = AIService;
