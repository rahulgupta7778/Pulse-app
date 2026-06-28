const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getFallbackAI() {
  return require('../services/geminiAi');
}

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

let _keyIndex = 0;
let _rateLimitUntil = 0;
const RATE_LIMIT_COOLDOWN = 30000;

let _geminiRateLimitUntil = 0;
const GEMINI_RATE_LIMIT_COOLDOWN = 60000;

function getGroqKeys() {
  const raw = process.env.GROQ_API_KEY || '';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

async function callGemini(messages, tools = null) {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  if (Date.now() < _geminiRateLimitUntil) {
    return null;
  }

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

    const systemMsg = messages.find(m => m.role === 'system');
    const systemInstruction = systemMsg ? systemMsg.content : undefined;

    const contents = [];
    for (const msg of messages) {
      if (msg.role === 'system') continue;

      let role = msg.role;
      if (role === 'assistant') role = 'model';
      if (role === 'tool') role = 'tool';

      const parts = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments
            }
          });
        }
      }

      if (msg.role === 'tool') {
        let responseData;
        try {
          responseData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
        } catch {
          responseData = { output: msg.content };
        }
        parts.push({
          functionResponse: {
            name: msg.name || msg.tool_call_id,
            response: responseData
          }
        });
      }

      if (parts.length === 0) {
        parts.push({ text: '' });
      }

      contents.push({ role, parts });
    }

    let functionDeclarations = undefined;
    if (tools && tools.length > 0) {
      functionDeclarations = tools.map(t => {
        const properties = {};
        const required = t.function.parameters.required || [];

        if (t.function.parameters.properties) {
          for (const [key, prop] of Object.entries(t.function.parameters.properties)) {
            properties[key] = {
              type: prop.type.toUpperCase(),
              description: prop.description || ''
            };
            if (prop.enum) {
              properties[key].enum = prop.enum;
            }
          }
        }

        return {
          name: t.function.name,
          description: t.function.description || '',
          parameters: {
            type: 'OBJECT',
            properties,
            required
          }
        };
      });
    }

    const config = {
      systemInstruction,
      temperature: 0.7
    };
    if (functionDeclarations) {
      config.tools = [{ functionDeclarations }];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
      config
    });

    const text = response.text || '';
    let tool_calls = undefined;

    if (response.functionCalls && response.functionCalls.length > 0) {
      tool_calls = response.functionCalls.map(fc => ({
        id: fc.id || 'call_' + Math.random().toString(36).slice(2, 9),
        type: 'function',
        function: {
          name: fc.name,
          arguments: JSON.stringify(fc.args)
        }
      }));
    }

    return {
      role: 'assistant',
      content: text,
      tool_calls
    };
  } catch (err) {
    const errMsg = err.message || '';
    if (
      err.status === 'RESOURCE_EXHAUSTED' ||
      err.code === 429 ||
      errMsg.includes('429') ||
      errMsg.includes('quota') ||
      errMsg.includes('Quota') ||
      errMsg.includes('limit') ||
      errMsg.includes('Limit')
    ) {
      _geminiRateLimitUntil = Date.now() + GEMINI_RATE_LIMIT_COOLDOWN;
    }
    console.log('[AI] Gemini service temporarily unavailable, routing to alternate provider.');
    return null;
  }
}

async function callGroq(messages, tools = null, useFallback = true) {
  const keys = getGroqKeys();
  if (!keys.length) {
    return useFallback ? callFallback(messages, tools) : null;
  }

  if (Date.now() < _rateLimitUntil) {
    return useFallback ? callFallback(messages, tools) : null;
  }

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (_keyIndex + attempt) % keys.length;
    const apiKey = keys[idx];

    try {
      const body = {
        model: GROQ_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 2048
      };
      if (tools) body.tools = tools;

      const res = await fetch(GROQ_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        _keyIndex = idx;
        const data = await res.json();
        return data.choices?.[0]?.message || null;
      }

      const isRateLimit = res.status === 429;
      const isAuthError = res.status === 401;

      if (isRateLimit || isAuthError) {
        if (isRateLimit) await new Promise(r => setTimeout(r, 100));
        continue;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  _keyIndex = 0;
  _rateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN;
  return useFallback ? callFallback(messages, tools) : null;
}

async function callAI(messages, tools = null, useFallback = true) {
  if (process.env.GEMINI_API_KEY) {
    const geminiResult = await callGemini(messages, tools);
    if (geminiResult) {
      return geminiResult;
    }
  }
  return callGroq(messages, tools, useFallback);
}

function extractJsonArray(content, prefix) {
  if (!content) return [];
  const idx = content.indexOf(prefix);
  if (idx === -1) return [];
  
  const startIdx = content.indexOf('[', idx + prefix.length);
  if (startIdx === -1) return [];
  
  let bracketCount = 0;
  let inString = false;
  let escape = false;
  
  for (let i = startIdx; i < content.length; i++) {
    const char = content[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '[') {
        bracketCount++;
      } else if (char === ']') {
        bracketCount--;
        if (bracketCount === 0) {
          try {
            const jsonStr = content.slice(startIdx, i + 1);
            return JSON.parse(jsonStr);
          } catch (e) {
            console.warn(`[Fallback] JSON parse failed for ${prefix}:`, e);
            return [];
          }
        }
      }
    }
  }
  return [];
}

async function callFallback(messages, tools) {
  const fallbackAI = getFallbackAI();
  if (!fallbackAI || !fallbackAI.chat) {
    console.warn('[FallbackAI] No fallback AI available');
    return null;
  }
  console.log('[FallbackAI] Routing to Gemini rule-based AI');
  
  const userMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!userMsg) return null;

  // Extract context (tasks, slots, goals, habits) from system message if present
  const systemMsg = messages.find(m => m.role === 'system');
  const context = { tasks: [], slots: [], goals: [], habits: [] };
  if (systemMsg && systemMsg.content) {
    const content = systemMsg.content;
    context.tasks = extractJsonArray(content, 'Tasks:');
    context.slots = extractJsonArray(content, 'Fixed Schedule:');
    context.goals = extractJsonArray(content, 'Goals:');
    context.habits = extractJsonArray(content, 'Habits:');
  }

  try {
    const result = await fallbackAI.chat(userMsg.content, context);
    
    let tool_calls = undefined;
    if (result.actions && result.actions.length > 0) {
      tool_calls = result.actions.map(act => {
        let name = '';
        if (act.type === 'task_added') name = 'add_task';
        else if (act.type === 'goal_added') name = 'add_goal';
        else if (act.type === 'habit_added') name = 'add_habit';
        else if (act.type === 'task_toggled') name = 'toggle_task';
        else if (act.type === 'task_deleted') name = 'delete_task';
        else if (act.type === 'task_updated') name = 'update_task';
        else if (act.type === 'schedule_created') name = 'optimize_schedule';

        const mappedArgs = { ...act.data };
        if (name === 'add_task') {
          if (act.data.dueDate && !act.data.due_date) mappedArgs.due_date = act.data.dueDate;
          if (act.data.dueTime && !act.data.due_time) mappedArgs.due_time = act.data.dueTime;
        } else if (name === 'toggle_task') {
          if (act.data.task_id) mappedArgs.task_id = act.data.task_id;
        } else if (name === 'delete_task') {
          if (act.data.task_id) mappedArgs.task_id = act.data.task_id;
        } else if (name === 'add_goal') {
          if (act.data.target_count) mappedArgs.target_count = act.data.target_count;
        } else if (name === 'add_habit') {
          if (act.data.goal_id) mappedArgs.goal_id = act.data.goal_id;
        }

        return {
          id: 'call_' + Math.random().toString(36).slice(2, 9),
          type: 'function',
          function: {
            name,
            arguments: JSON.stringify(mappedArgs)
          }
        };
      });
    }

    return {
      role: 'assistant',
      content: result.response,
      tool_calls
    };
  } catch (err) {
    console.error('[FallbackAI] Error executing rule-based fallback:', err);
    return null;
  }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Add a new task to the task list',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description or notes' },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Priority level' },
          due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
          due_time: { type: 'string', description: 'Due time in HH:MM format' },
          duration: { type: 'number', description: 'Estimated duration in minutes' },
          category: { type: 'string', enum: ['work', 'study', 'personal', 'health', 'finance', 'other'], description: 'Task category' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update an existing task',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID of the task to update. Get it from the task list context.' },
          title: { type: 'string', description: 'New task title' },
          description: { type: 'string', description: 'New description' },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
          due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
          due_time: { type: 'string', description: 'Due time in HH:MM format' },
          duration: { type: 'number', description: 'Duration in minutes' },
          category: { type: 'string', enum: ['work', 'study', 'personal', 'health', 'finance', 'other'] },
          completed: { type: 'boolean', description: 'Mark as complete or incomplete' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Delete a task',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID of the task to delete' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_task',
      description: 'Mark a task as completed or uncompleted',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID of the task to toggle' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_goal',
      description: 'Add a new goal',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Goal title' },
          description: { type: 'string', description: 'Goal description' },
          category: { type: 'string', enum: ['work', 'study', 'personal', 'health', 'finance', 'other'], description: 'Goal category' },
          target_count: { type: 'number', description: 'Number of times to complete this goal (e.g. 5 times)' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_habit',
      description: 'Add a new habit (can optionally be linked to a goal)',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Habit title' },
          goal_id: { type: 'string', description: 'ID of the goal to link this habit to (optional)' },
          frequency: { type: 'string', enum: ['daily', 'weekly', 'weekdays', 'weekends'], description: 'How often to do this habit' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'optimize_schedule',
      description: 'Create an optimized daily schedule by fitting incomplete tasks into free time slots',
      parameters: {
        type: 'object',
        properties: {
          day: { type: 'string', enum: ['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], description: 'Which day to schedule. Default: today' }
        }
      }
    }
  }
];

function executeTool(db, userId, toolCall) {
  const args = typeof toolCall.function.arguments === 'string'
    ? JSON.parse(toolCall.function.arguments)
    : (toolCall.function.arguments || {});
  const now = new Date().toISOString();

  switch (toolCall.function.name) {
    case 'add_task': {
      const task = {
        id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
        userId,
        title: args.title,
        desc: args.description || '',
        priority: args.priority || 'medium',
        dueDate: args.due_date || null,
        dueTime: args.due_time || null,
        duration: args.duration || 30,
        category: args.category || 'work',
        completed: 0,
        completedAt: null,
        createdAt: now,
        subtasks: []
      };
      db.addTask(task);
      return { type: 'task_added', data: { id: task.id, title: task.title } };
    }

    case 'update_task': {
      const existing = db.getTasks(userId).find(t => t.id === args.task_id);
      if (!existing) return { type: 'error', data: { message: `Task ${args.task_id} not found` } };
      const updates = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.desc = args.description;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.due_date !== undefined) updates.dueDate = args.due_date;
      if (args.due_time !== undefined) updates.dueTime = args.due_time;
      if (args.duration !== undefined) updates.duration = args.duration;
      if (args.category !== undefined) updates.category = args.category;
      if (args.completed !== undefined) {
        updates.completed = args.completed ? 1 : 0;
        if (args.completed) updates.completedAt = now;
        else updates.completedAt = null;
      }
      const merged = { ...existing, ...updates };
      db.updateTask(args.task_id, merged);
      return { type: 'task_updated', data: { id: args.task_id, title: merged.title } };
    }

    case 'delete_task': {
      db.deleteTask(args.task_id);
      return { type: 'task_deleted', data: { id: args.task_id } };
    }

    case 'toggle_task': {
      const existing = db.getTasks(userId).find(t => t.id === args.task_id);
      if (!existing) return { type: 'error', data: { message: `Task ${args.task_id} not found` } };
      const completed = existing.completed ? 0 : 1;
      db.updateTask(args.task_id, { completed, completedAt: completed ? now : null });
      return { type: 'task_toggled', data: { id: args.task_id, completed: !!completed } };
    }

    case 'add_goal': {
      const goal = {
        id: 'g' + Date.now() + Math.random().toString(36).slice(2, 6),
        userId,
        title: args.title,
        description: args.description || '',
        category: args.category || 'personal',
        targetCount: args.target_count || 1,
        progress: 0,
        streak: 0,
        bestStreak: 0,
        createdAt: now,
        updatedAt: now
      };
      db.addGoal(goal);
      return { type: 'goal_added', data: { id: goal.id, title: goal.title } };
    }

    case 'add_habit': {
      const habit = {
        id: 'h' + Date.now() + Math.random().toString(36).slice(2, 6),
        userId,
        goalId: args.goal_id || null,
        title: args.title,
        frequency: args.frequency || 'daily',
        daysOfWeek: [],
        streak: 0,
        bestStreak: 0,
        totalCount: 0,
        createdAt: now
      };
      db.addHabit(habit);
      return { type: 'habit_added', data: { id: habit.id, title: habit.title } };
    }

    case 'optimize_schedule': {
      const scheduler = require('../services/scheduler');
      const tasks = db.getTasks(userId);
      const slots = db.getSlots(userId);
      const dayMap = {sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
      let targetDay = args.day ? dayMap[args.day.toLowerCase()] : new Date().getDay();
      if (args.day === 'today') targetDay = new Date().getDay();
      if (args.day === 'tomorrow') targetDay = (new Date().getDay() + 1) % 7;

      const today = new Date();
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + ((targetDay - today.getDay() + 7) % 7));
      const dateStr = targetDate.toISOString().split('T')[0];

      const result = scheduler.optimizeDay(tasks, slots, targetDay, dateStr);
      return { type: 'schedule_created', data: result };
    }

    default:
      return { type: 'error', data: { message: `Unknown tool: ${toolCall.function.name}` } };
  }
}

router.post('/chat', asyncHandler(async (req, res) => {
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const db = require('../config/db');
  const goals = db.getGoals(req.userId);
  const habits = db.getHabits(req.userId);

  const systemPrompt = `You are a helpful AI productivity assistant that can also take actions. The user has:

Tasks: ${JSON.stringify(context?.tasks || [])}
Fixed Schedule: ${JSON.stringify(context?.slots || [])}
Goals: ${JSON.stringify(goals)}
Habits: ${JSON.stringify(habits)}

When the user asks you to create, update, delete, or toggle tasks/goals/habits, use the available tools to do so.

CRITICAL INSTRUCTIONS ON TOOL CALLS:
- ONLY call the tool that precisely matches the user's explicit intent.
- Do NOT create a task, a goal, and a habit all at the same time for the same request unless the user explicitly asked for all of them in their input.
- If the user says "add task X" or "create a task X", ONLY call "add_task". Do NOT call "add_goal" or "add_habit".
- If the user says "add goal X" or "set a goal X", ONLY call "add_goal". Do NOT call "add_task" or "add_habit".
- If the user says "add habit X" or "start habit X", ONLY call "add_habit". Do NOT call "add_task" or "add_goal".
- Keep tool calls strictly single-focused unless the user explicitly requests a combination (e.g., "create a goal and a linked habit to meditate").

After executing a tool, confirm what was done in your response.
Be friendly, concise, and practical. Never mention you're an AI.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ];

  let actions = [];
  let finalText = '';

  for (let turn = 0; turn < 5; turn++) {
    const result = await callAI(messages, TOOLS, turn === 0);
    if (!result) break;

    if (result.content) {
      finalText = result.content;
    }

    if (!result.tool_calls || result.tool_calls.length === 0) {
      break;
    }

    messages.push(result);

    for (const toolCall of result.tool_calls) {
      if (toolCall.type === 'function') {
        const action = executeTool(db, req.userId, toolCall);
        actions.push(action);
        const args = typeof toolCall.function.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments)
          : (toolCall.function.arguments || {});
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(action.data)
        });
      }
    }
  }

  if (!finalText && actions.length > 0) {
    const addedTasks = actions.filter(a => a.type === 'task_added');
    const addedGoals = actions.filter(a => a.type === 'goal_added');
    const addedHabits = actions.filter(a => a.type === 'habit_added');
    const updatedTasks = actions.filter(a => a.type === 'task_updated');
    const toggledTasks = actions.filter(a => a.type === 'task_toggled');
    const deletedTasks = actions.filter(a => a.type === 'task_deleted');
    
    let parts = [];
    if (addedTasks.length) parts.push(`added ${addedTasks.length} task${addedTasks.length > 1 ? 's' : ''}`);
    if (addedGoals.length) parts.push(`added ${addedGoals.length} goal${addedGoals.length > 1 ? 's' : ''}`);
    if (addedHabits.length) parts.push(`added ${addedHabits.length} habit${addedHabits.length > 1 ? 's' : ''}`);
    if (updatedTasks.length) parts.push(`updated ${updatedTasks.length} task${updatedTasks.length > 1 ? 's' : ''}`);
    if (toggledTasks.length) parts.push(`completed/updated ${toggledTasks.length} task${toggledTasks.length > 1 ? 's' : ''}`);
    if (deletedTasks.length) parts.push(`deleted ${deletedTasks.length} task${deletedTasks.length > 1 ? 's' : ''}`);
    
    if (parts.length > 0) {
      finalText = `✅ I have successfully ${parts.join(' and ')} for you!`;
    } else {
      finalText = "I've successfully processed your request.";
    }
  }

  if (finalText) {
    return res.json({ response: finalText, actions });
  }

  try {
    const fallbackAI = getFallbackAI();
    const fallbackResult = await fallbackAI.chat(message, context);
    const fallbackActions = fallbackResult.actions || [];
    const db = require('../config/db');
    const now = new Date().toISOString();
    for (const action of fallbackActions) {
      if (action.type === 'task_added' && action.data) {
        const task = {
          id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
          userId: req.userId,
          title: action.data.title,
          desc: action.data.description || '',
          priority: action.data.priority || 'medium',
          dueDate: action.data.dueDate || null,
          dueTime: action.data.dueTime || null,
          duration: action.data.duration || 30,
          category: action.data.category || 'work',
          completed: 0,
          completedAt: null,
          createdAt: now,
          subtasks: []
        };
        db.addTask(task);
        action.data.id = task.id;
      } else if (action.type === 'task_toggled' && action.data) {
        const existing = db.getTasks(req.userId).find(t => t.id === action.data.task_id);
        if (existing) {
          const completed = action.data.completed ? 1 : 0;
          db.updateTask(action.data.task_id, { completed, completedAt: completed ? now : null });
        }
      } else if (action.type === 'task_deleted' && action.data) {
        const existing = db.getTasks(req.userId).find(t => t.id === action.data.task_id);
        if (existing) db.deleteTask(action.data.task_id);
      } else if (action.type === 'task_updated' && action.data) {
        const existing = db.getTasks(req.userId).find(t => t.id === action.data.task_id);
        if (existing) {
          const updates = {};
          if (action.data.title !== undefined) updates.title = action.data.title;
          if (action.data.priority !== undefined) updates.priority = action.data.priority;
          if (action.data.dueDate !== undefined) updates.dueDate = action.data.dueDate;
          if (action.data.due_time !== undefined) updates.dueTime = action.data.due_time;
          if (action.data.completed !== undefined) {
            updates.completed = action.data.completed ? 1 : 0;
            if (action.data.completed) updates.completedAt = now;
          }
          db.updateTask(action.data.task_id, { ...existing, ...updates });
        }
      } else if (action.type === 'goal_added' && action.data) {
        const goal = {
          id: 'g' + Date.now() + Math.random().toString(36).slice(2, 6),
          userId: req.userId,
          title: action.data.title,
          description: '',
          category: action.data.category || 'personal',
          targetCount: action.data.target_count || 1,
          progress: 0,
          streak: 0,
          bestStreak: 0,
          createdAt: now,
          updatedAt: now
        };
        db.addGoal(goal);
        action.data.id = goal.id;
      } else if (action.type === 'habit_added' && action.data) {
        const habit = {
          id: 'h' + Date.now() + Math.random().toString(36).slice(2, 6),
          userId: req.userId,
          goalId: action.data.goal_id || null,
          title: action.data.title,
          frequency: action.data.frequency || 'daily',
          daysOfWeek: [],
          streak: 0,
          bestStreak: 0,
          totalCount: 0,
          createdAt: now
        };
        db.addHabit(habit);
        action.data.id = habit.id;
      }
    }
    actions.push(...fallbackActions);
    return res.json({ response: fallbackResult.response, actions });
  } catch (e) {
    console.error('[FallbackAI] Error:', e.message);
    return res.json({
      response: "I'm here to help! You can ask me to create tasks, prioritize, break down work, check deadlines, or optimize your schedule. What do you need?",
      actions
    });
  }
}));

router.post('/subtasks', asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const result = await callAI([
    { role: 'system', content: 'You are a task breakdown assistant. Break down tasks into concrete, actionable steps. Return ONLY a JSON array of strings, no other text.' },
    { role: 'user', content: `Break down this task into 3-5 steps:\nTitle: ${title}\nDescription: ${description || 'N/A'}` }
  ]);
  if (result?.content) {
    try {
      const cleaned = result.content.replace(/```json|```/g, '').trim();
      const subtasks = JSON.parse(cleaned);
      if (Array.isArray(subtasks)) return res.json({ subtasks });
    } catch { /* fall through */ }
  }

  res.json({
    subtasks: [
      `Research & plan for "${title}"`,
      'Gather required resources',
      'Work on main execution',
      'Review and finalize',
      'Submit/complete'
    ]
  });
}));

router.get('/recommend', asyncHandler(async (req, res) => {
  const db = require('../config/db');
  const tasks = db.getTasks(req.userId);
  const goals = db.getGoals(req.userId);
  const habits = db.getHabits(req.userId);
  const slots = db.getSlots(req.userId);
  const logs = db.getDailyLogs(req.userId);

  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length;
  const dueToday = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate).toDateString() === new Date().toDateString()).length;
  const productivityScore = total ? Math.round((completed / total) * 100) : 0;

  const dataSummary = {
    totalTasks: total,
    completedTasks: completed,
    overdueTasks: overdue,
    dueToday,
    productivityScore,
    activeGoals: goals.length,
    goalsCompleted: goals.filter(g => g.progress >= g.targetCount).length,
    habitsTracked: habits.length,
    habitStreaks: habits.filter(h => h.streak > 0).length,
    totalSlots: slots.length,
    recentLogs: logs.slice(-7)
  };

  const result = await callAI([
    { role: 'system', content: 'You are a data-driven productivity analyst. Based on the user data below, give 1-3 specific, actionable recommendations. Return ONLY a JSON array of objects, each with "icon" (emoji), "title" (short bold headline), and "description" (1-2 sentence explanation). No other text.' },
    { role: 'user', content: `User's productivity data: ${JSON.stringify(dataSummary)}\nTasks: ${JSON.stringify(tasks.slice(0, 10))}\nGoals: ${JSON.stringify(goals.slice(0, 5))}` }
  ]);

  if (result?.content) {
    try {
      const cleaned = result.content.replace(/```json|```/g, '').trim();
      const recommendations = JSON.parse(cleaned);
      if (Array.isArray(recommendations) && recommendations.length > 0) {
        return res.json({ recommendations, data: dataSummary });
      }
    } catch { /* fall through */ }
  }

  const tips = [];
  if (overdue > 0) tips.push({ icon: '🚨', title: 'Overdue tasks', description: `You have ${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}. Start with the most urgent one to reduce your backlog.` });
  if (dueToday > 0) tips.push({ icon: '📅', title: 'Tasks due today', description: `You have ${dueToday} ${dueToday === 1 ? 'task' : 'tasks'} due today. Focus on completing these first to maintain momentum.` });
  if (productivityScore < 50) tips.push({ icon: '📈', title: 'Boost your score', description: `Your productivity score is ${productivityScore}%. Try the Pomodoro technique: 25-minute focused sessions with short breaks.` });
  else if (productivityScore < 80) tips.push({ icon: '📈', title: 'Keep improving', description: `Your productivity score is ${productivityScore}%. You're doing well! Batch similar tasks together to save context-switching time.` });
  else tips.push({ icon: '🏆', title: 'Great momentum', description: `Productivity score of ${productivityScore}%! Challenge yourself by setting a weekly goal to maintain this momentum.` });
  if (goals.length > 0) {
    const incompleteGoals = goals.filter(g => g.progress < g.targetCount);
    if (incompleteGoals.length > 0) tips.push({ icon: '🎯', title: 'Active goals', description: `You have ${incompleteGoals.length} active ${incompleteGoals.length === 1 ? 'goal' : 'goals'} in progress. Completing just one habit per day builds unstoppable momentum.` });
  }
  if (habits.length > 0) {
    const topStreak = Math.max(...habits.map(h => h.streak), 0);
    tips.push(topStreak > 0 ? { icon: '🔥', title: 'Best streak', description: `Your best habit streak is ${topStreak} days. Keep it going! Consistency beats intensity.` } : { icon: '🌱', title: 'Start a habit', description: 'Start tracking a daily habit. Even 5 minutes a day builds lasting change.' });
  }
  if (tips.length === 0) tips.push({ icon: '💡', title: 'Add some tasks', description: "Add tasks to get personalized productivity insights. I'll help you optimize your workflow!" });

  res.json({ recommendations: tips.slice(0, 3), data: dataSummary });
}));

module.exports = router;