const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const oldDbPath = '/tmp/data.db';
const persistentDbPath = path.join(__dirname, '..', 'data.db');

// Migrate old data.db from /tmp if it exists and persistent database does not exist yet
if (fs.existsSync(oldDbPath) && !fs.existsSync(persistentDbPath)) {
  try {
    fs.copyFileSync(oldDbPath, persistentDbPath);
    console.log('[Database Migration] Successfully migrated data.db from /tmp to persistent storage.');
    
    const oldWalPath = oldDbPath + '-wal';
    const newWalPath = persistentDbPath + '-wal';
    if (fs.existsSync(oldWalPath)) {
      fs.copyFileSync(oldWalPath, newWalPath);
      console.log('[Database Migration] Successfully migrated WAL file.');
    }
  } catch (err) {
    console.error('[Database Migration] Failed to migrate database:', err);
  }
}

const db = new Database(persistentDbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    desc TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    dueDate TEXT,
    dueTime TEXT,
    duration INTEGER DEFAULT 30,
    category TEXT DEFAULT 'work',
    completed INTEGER DEFAULT 0,
    completedAt TEXT,
    createdAt TEXT NOT NULL,
    subtasks TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS fixed_slots (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    dayOfWeek INTEGER NOT NULL,
    color TEXT DEFAULT '#4f46e5'
  );

  CREATE TABLE IF NOT EXISTS user_tokens (
    userId TEXT PRIMARY KEY,
    accessToken TEXT,
    refreshToken TEXT,
    tokenExpiry TEXT,
    calendarConnected INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    date TEXT NOT NULL,
    data TEXT DEFAULT ''
  );
`);

try { db.exec("ALTER TABLE tasks ADD COLUMN googleEventId TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN position INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'manual'"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN externalId TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN dob TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN externalUrl TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN links TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN location TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE fixed_slots ADD COLUMN googleEventId TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE user_tokens ADD COLUMN calendarEmail TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE user_tokens ADD COLUMN gmailConnected INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE user_tokens ADD COLUMN gmailEmail TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE user_tokens ADD COLUMN zoomConnected INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE user_tokens ADD COLUMN zoomEmail TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE user_tokens ADD COLUMN zoomRefreshToken TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE user_tokens ADD COLUMN lastCalendarSync TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE user_tokens ADD COLUMN lastGmailSync TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE user_tokens ADD COLUMN lastZoomSync TEXT DEFAULT NULL"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN autoPilot INTEGER DEFAULT 0"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    taskId TEXT,
    read INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'personal',
    targetCount INTEGER DEFAULT 1,
    progress INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    bestStreak INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    archived INTEGER DEFAULT 0,
    links TEXT DEFAULT '',
    location TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    goalId TEXT,
    title TEXT NOT NULL,
    frequency TEXT DEFAULT 'daily',
    daysOfWeek TEXT DEFAULT '[]',
    streak INTEGER DEFAULT 0,
    bestStreak INTEGER DEFAULT 0,
    totalCount INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    archived INTEGER DEFAULT 0,
    links TEXT DEFAULT '',
    location TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habitId TEXT NOT NULL,
    userId TEXT NOT NULL,
    date TEXT NOT NULL,
    completed INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS connectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    service TEXT NOT NULL,
    connected INTEGER DEFAULT 0,
    accessToken TEXT,
    refreshToken TEXT,
    tokenExpiry TEXT,
    email TEXT,
    externalId TEXT,
    metadata TEXT DEFAULT '{}',
    lastSync TEXT,
    UNIQUE(userId, service)
  );

  CREATE TABLE IF NOT EXISTS xp_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE(userId, endpoint)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    key TEXT NOT NULL,
    title TEXT NOT NULL,
    unlockedAt TEXT NOT NULL,
    UNIQUE(userId, key)
  );
`);

try { db.exec("ALTER TABLE goals ADD COLUMN links TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE goals ADD COLUMN location TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE habits ADD COLUMN links TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE habits ADD COLUMN location TEXT DEFAULT ''"); } catch {}

// --- Dynamic Firebase Config ---
let firebaseConfig = {};
try {
  const configPath = path.join(__dirname, '..', '..', 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (err) {
  console.error('[Firebase Config] Failed to load firebase-applet-config.json:', err);
}

const { getFirestore } = require('firebase-admin/firestore');

const firebaseProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID;
const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || 'default';
console.log(`[Firebase Config] Resolved ProjectID: ${firebaseProjectId}, DatabaseID: ${firestoreDatabaseId}`);

let appInstance = null;
if (firebaseProjectId) {
  try {
    if (admin.apps.length === 0) {
      appInstance = admin.initializeApp({
        projectId: firebaseProjectId
      });
    } else {
      appInstance = admin.apps[0];
    }
    console.log(`[Firebase] Initialized Admin SDK with ProjectID: ${firebaseProjectId}`);
  } catch (err) {
    console.error('[Firebase] Error initializing Firebase Admin:', err);
  }
}

const firestore = (firebaseProjectId && appInstance) ? getFirestore(appInstance, firestoreDatabaseId) : null;

// Background helper to write/update/delete documents in Firestore
function safeFirestoreWrite(collectionName, docId, data, isDelete = false) {
  if (!firestore) return;
  Promise.resolve().then(async () => {
    try {
      const docRef = firestore.collection(collectionName).doc(String(docId));
      if (isDelete) {
        await docRef.delete();
      } else {
        const sanitized = {};
        for (const [k, v] of Object.entries(data)) {
          if (v === undefined) {
            sanitized[k] = null;
          } else if (typeof v === 'object' && v !== null) {
            sanitized[k] = JSON.parse(JSON.stringify(v));
          } else {
            sanitized[k] = v;
          }
        }
        await docRef.set(sanitized, { merge: true });
      }
    } catch (err) {
      console.error(`[Firestore Sync Error] Failed on ${collectionName}/${docId}:`, err);
    }
  });
}

// Global Startup Sync from Firestore
if (firestore) {
  Promise.resolve().then(async () => {
    try {
      console.log('[Firestore Sync] Starting startup synchronization from Cloud Firestore...');
      
      const collectionsToSync = [
        {
          name: 'users',
          table: 'users',
          columns: ['id', 'name', 'email', 'password', 'dob', 'autoPilot']
        },
        {
          name: 'tasks',
          table: 'tasks',
          columns: [
            'id', 'userId', 'title', 'desc', 'priority', 'dueDate', 'dueTime', 'duration',
            'category', 'completed', 'completedAt', 'createdAt', 'subtasks', 'googleEventId',
            'position', 'source', 'externalId', 'externalUrl', 'links', 'location'
          ]
        },
        {
          name: 'fixed_slots',
          table: 'fixed_slots',
          columns: ['id', 'userId', 'title', 'startTime', 'endTime', 'dayOfWeek', 'color', 'googleEventId']
        },
        {
          name: 'user_tokens',
          table: 'user_tokens',
          columns: [
            'userId', 'accessToken', 'refreshToken', 'tokenExpiry', 'calendarConnected',
            'calendarEmail', 'gmailConnected', 'gmailEmail', 'zoomConnected', 'zoomEmail',
            'zoomRefreshToken', 'lastCalendarSync', 'lastGmailSync', 'lastZoomSync'
          ]
        },
        {
          name: 'daily_logs',
          table: 'daily_logs',
          columns: ['id', 'userId', 'date', 'data']
        },
        {
          name: 'notifications',
          table: 'notifications',
          columns: ['id', 'userId', 'type', 'title', 'message', 'taskId', 'read', 'createdAt']
        },
        {
          name: 'goals',
          table: 'goals',
          columns: [
            'id', 'userId', 'title', 'description', 'category', 'targetCount', 'progress',
            'streak', 'bestStreak', 'createdAt', 'updatedAt', 'archived', 'links', 'location'
          ]
        },
        {
          name: 'habits',
          table: 'habits',
          columns: [
            'id', 'userId', 'goalId', 'title', 'frequency', 'daysOfWeek', 'streak',
            'bestStreak', 'totalCount', 'createdAt', 'archived', 'links', 'location'
          ]
        },
        {
          name: 'habit_logs',
          table: 'habit_logs',
          columns: ['id', 'habitId', 'userId', 'date', 'completed']
        },
        {
          name: 'connectors',
          table: 'connectors',
          columns: [
            'id', 'userId', 'service', 'connected', 'accessToken', 'refreshToken', 'tokenExpiry',
            'email', 'externalId', 'metadata', 'lastSync'
          ]
        },
        {
          name: 'xp_log',
          table: 'xp_log',
          columns: ['id', 'userId', 'amount', 'reason', 'createdAt']
        },
        {
          name: 'push_subscriptions',
          table: 'push_subscriptions',
          columns: ['id', 'userId', 'endpoint', 'p256dh', 'auth', 'createdAt']
        },
        {
          name: 'achievements',
          table: 'achievements',
          columns: ['id', 'userId', 'key', 'title', 'unlockedAt']
        }
      ];

      for (const col of collectionsToSync) {
        try {
          const snapshot = await firestore.collection(col.name).get();
          if (snapshot.empty) {
            console.log(`[Firestore Sync] No documents in Firestore for table ${col.table}.`);
            continue;
          }
          
          db.prepare(`DELETE FROM ${col.table}`).run();
          
          const placeholders = col.columns.map(() => '?').join(', ');
          const stmt = db.prepare(`INSERT OR REPLACE INTO ${col.table} (${col.columns.join(', ')}) VALUES (${placeholders})`);
          
          const transaction = db.transaction((docs) => {
            for (const doc of docs) {
              const data = doc.data();
              const values = col.columns.map(fName => {
                let val = data[fName];
                if (val === undefined) return null;
                if (typeof val === 'object' && val !== null) {
                  return JSON.stringify(val);
                }
                return val;
              });
              stmt.run(...values);
            }
          });
          
          transaction(snapshot.docs);
          console.log(`[Firestore Sync] Synced ${snapshot.size} rows into local SQLite table: ${col.table}`);
        } catch (colErr) {
          console.error(`[Firestore Sync] Failed on collection: ${col.name}`, colErr);
        }
      }
      console.log('[Firestore Sync] Completed startup synchronization from Cloud Firestore successfully.');
    } catch (err) {
      console.error('[Firestore Sync] Global startup sync failed:', err);
    }
  });
}

function xpForLevel(level) { return level * 100 + level * (level - 1) * 25; }

function getLevel(totalXp) {
  let level = 0;
  while (totalXp >= xpForLevel(level + 1)) { level++; }
  return level;
}

const ACHIEVEMENTS = [
  { key: 'first_task', title: 'First Task', desc: 'Create your first task', check: u => u.tasksCreated >= 1, xp: 25 },
  { key: 'task_10', title: 'Task Machine', desc: 'Complete 10 tasks', check: u => u.tasksCompleted >= 10, xp: 50 },
  { key: 'task_50', title: 'Productivity Pro', desc: 'Complete 50 tasks', check: u => u.tasksCompleted >= 50, xp: 100 },
  { key: 'task_100', title: 'Centurion', desc: 'Complete 100 tasks', check: u => u.tasksCompleted >= 100, xp: 200 },
  { key: 'streak_7', title: 'Week Warrior', desc: 'Maintain a 7-day habit streak', check: u => u.bestStreak >= 7, xp: 75 },
  { key: 'streak_30', title: 'Monthly Master', desc: 'Maintain a 30-day habit streak', check: u => u.bestStreak >= 30, xp: 150 },
  { key: 'first_goal', title: 'Goal Setter', desc: 'Create your first goal', check: u => u.goalsCreated >= 1, xp: 25 },
  { key: 'goal_done', title: 'Goal Crusher', desc: 'Complete a goal', check: u => u.goalsCompleted >= 1, xp: 75 },
  { key: 'early_bird', title: 'Early Bird', desc: 'Complete a task before 8 AM', check: u => u.earlyTasks >= 1, xp: 30 },
  { key: 'focused', title: 'Laser Focus', desc: 'Complete a focus session', check: u => u.focusSessions >= 1, xp: 40 },
  { key: 'organized', title: 'Well Organized', desc: 'Create a fixed time slot', check: u => u.slotsCreated >= 1, xp: 25 },
  { key: 'connected', title: 'Well Connected', desc: 'Connect an external service', check: u => u.connections >= 1, xp: 50 },
];

function row(task) {
  if (!task) return null;
  return { ...task, completed: !!task.completed, subtasks: safeJson(task.subtasks, []) };
}

function safeJson(val, def) {
  try { return JSON.parse(val); } catch { return def; }
}

module.exports = {
  // Raw prepared statement access
  query(sql, ...params) {
    const info = db.prepare(sql).run(...params);
    if (sql.includes('UPDATE tasks SET position=?')) {
      const [position, id] = params;
      safeFirestoreWrite('tasks', id, { position });
    }
    return info;
  },
  
  get(sql, ...params) {
    return db.prepare(sql).get(...params);
  },

  findUser(email) {
    return db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email) || null;
  },

  findUserById(id) {
    return db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id) || null;
  },

  updateUser(id, updates) {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    db.prepare('UPDATE users SET name=?, password=?, dob=? WHERE id=?').run(
      merged.name, merged.password, merged.dob || null, id
    );
    const updated = { id, name: merged.name, email: existing.email, dob: merged.dob };
    safeFirestoreWrite('users', id, { ...merged, email_lc: existing.email.toLowerCase() });
    return updated;
  },

  createUser(user) {
    db.prepare('INSERT INTO users (id, name, email, password, dob) VALUES (?, ?, ?, ?, ?)').run(
      user.id, user.name, user.email, user.password, user.dob || null
    );
    safeFirestoreWrite('users', user.id, { ...user, email_lc: user.email.toLowerCase(), autoPilot: 0 });
    return user;
  },

  findOrCreateGoogleUser(profile) {
    let user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(profile.email);
    if (!user) {
      const id = Date.now().toString();
      db.prepare('INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)').run(
        id, profile.name, profile.email, 'GOOGLE_AUTH'
      );
      user = { id, name: profile.name, email: profile.email, password: 'GOOGLE_AUTH', dob: null, autoPilot: 0 };
      safeFirestoreWrite('users', id, { id, name: profile.name, email: profile.email, password: 'GOOGLE_AUTH', dob: null, autoPilot: 0, email_lc: profile.email.toLowerCase() });
    }
    return user;
  },

  updateUserPassword(userId, hashedPassword) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);
    safeFirestoreWrite('users', userId, { password: hashedPassword });
  },

  // --- Tasks ---
  getTasks(userId) {
    return db.prepare('SELECT * FROM tasks WHERE userId = ? ORDER BY position ASC, createdAt DESC').all(userId).map(row);
  },

  addTask(task) {
    db.prepare(`INSERT INTO tasks (id, userId, title, desc, priority, dueDate, dueTime, duration, category, completed, completedAt, createdAt, subtasks, source, externalId, externalUrl, links, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      task.id, task.userId, task.title, task.desc || '', task.priority || 'medium',
      task.dueDate || null, task.dueTime || null, task.duration || 30, task.category || 'work',
      task.completed ? 1 : 0, task.completedAt || null, task.createdAt, JSON.stringify(task.subtasks || []),
      task.source || 'manual', task.externalId || null, task.externalUrl || null,
      task.links || '', task.location || ''
    );
    
    safeFirestoreWrite('tasks', task.id, {
      ...task,
      desc: task.desc || '',
      priority: task.priority || 'medium',
      dueDate: task.dueDate || null,
      dueTime: task.dueTime || null,
      duration: task.duration || 30,
      category: task.category || 'work',
      completed: task.completed ? 1 : 0,
      completedAt: task.completedAt || null,
      subtasks: task.subtasks || [],
      source: task.source || 'manual',
      externalId: task.externalId || null,
      externalUrl: task.externalUrl || null,
      links: task.links || '',
      location: task.location || ''
    });
    return task;
  },

  updateTask(id, updates) {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    db.prepare(`UPDATE tasks SET title=?, desc=?, priority=?, dueDate=?, dueTime=?, duration=?, category=?, completed=?, completedAt=?, subtasks=?, source=?, externalId=?, externalUrl=?, links=?, location=?
      WHERE id=?`).run(
      merged.title, merged.desc || '', merged.priority, merged.dueDate || null,
      merged.dueTime || null, merged.duration || 30, merged.category || 'work',
      merged.completed ? 1 : 0, merged.completedAt || null, JSON.stringify(merged.subtasks || []),
      merged.source || 'manual', merged.externalId || null, merged.externalUrl || null,
      merged.links || '', merged.location || '', id
    );
    const formatted = row(merged);
    safeFirestoreWrite('tasks', id, {
      ...formatted,
      completed: formatted.completed ? 1 : 0
    });
    return formatted;
  },

  deleteTask(id) {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    safeFirestoreWrite('tasks', id, null, true);
  },

  // --- Fixed Slots ---
  getSlots(userId) {
    return db.prepare('SELECT * FROM fixed_slots WHERE userId = ?').all(userId);
  },

  addSlot(slot) {
    db.prepare('INSERT INTO fixed_slots (id, userId, title, startTime, endTime, dayOfWeek, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      slot.id, slot.userId, slot.title, slot.startTime, slot.endTime, slot.dayOfWeek, slot.color || '#4f46e5'
    );
    safeFirestoreWrite('fixed_slots', slot.id, slot);
    return slot;
  },

  updateSlot(id, updates) {
    const existing = db.prepare('SELECT * FROM fixed_slots WHERE id = ?').get(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    db.prepare('UPDATE fixed_slots SET title=?, startTime=?, endTime=?, dayOfWeek=?, color=? WHERE id=?').run(
      merged.title, merged.startTime, merged.endTime, merged.dayOfWeek, merged.color, id
    );
    safeFirestoreWrite('fixed_slots', id, merged);
    return merged;
  },

  deleteSlot(id) {
    db.prepare('DELETE FROM fixed_slots WHERE id = ?').run(id);
    safeFirestoreWrite('fixed_slots', id, null, true);
  },

  // --- Daily Logs ---
  getDailyLogs(userId) {
    return db.prepare('SELECT * FROM daily_logs WHERE userId = ?').all(userId).map(l => ({ ...l, data: safeJson(l.data, {}) }));
  },

  addDailyLog(log) {
    const info = db.prepare('INSERT INTO daily_logs (userId, date, data) VALUES (?, ?, ?)').run(
      log.userId, log.date, JSON.stringify(log.data || {})
    );
    const id = info.lastInsertRowid;
    const record = { id, userId: log.userId, date: log.date, data: log.data || {} };
    safeFirestoreWrite('daily_logs', id, record);
    return record;
  },

  // --- External Integrations ---
  getUserToken(userId) {
    return db.prepare('SELECT * FROM user_tokens WHERE userId = ?').get(userId) || null;
  },

  storeUserToken(userId, tokens, extra = {}) {
    const existing = db.prepare('SELECT * FROM user_tokens WHERE userId = ?').get(userId);
    let record;
    if (existing) {
      const setClauses = ['accessToken=?', 'refreshToken=?', 'tokenExpiry=?', 'calendarConnected=?'];
      const values = [tokens.accessToken, tokens.refreshToken, tokens.tokenExpiry, 1];
      for (const [key, val] of Object.entries(extra)) {
        setClauses.push(`${key}=?`);
        values.push(val);
      }
      values.push(userId);
      db.prepare(`UPDATE user_tokens SET ${setClauses.join(', ')} WHERE userId=?`).run(...values);
      record = db.prepare('SELECT * FROM user_tokens WHERE userId = ?').get(userId);
    } else {
      const cols = ['userId', 'accessToken', 'refreshToken', 'tokenExpiry', 'calendarConnected'];
      const vals = [userId, tokens.accessToken, tokens.refreshToken, tokens.tokenExpiry, 1];
      for (const [key, val] of Object.entries(extra)) {
        cols.push(key);
        vals.push(val);
      }
      db.prepare(`INSERT INTO user_tokens (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);
      record = { userId, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenExpiry: tokens.tokenExpiry, calendarConnected: 1, ...extra };
    }
    safeFirestoreWrite('user_tokens', userId, record);
  },

  disconnectCalendar(userId) {
    db.prepare('UPDATE user_tokens SET calendarConnected=0 WHERE userId=?').run(userId);
    safeFirestoreWrite('user_tokens', userId, { calendarConnected: 0 });
  },

  getTaskByGoogleEventId(googleEventId) {
    return row(db.prepare('SELECT * FROM tasks WHERE googleEventId = ?').get(googleEventId));
  },

  getSlotByGoogleEventId(googleEventId) {
    return db.prepare('SELECT * FROM fixed_slots WHERE googleEventId = ?').get(googleEventId) || null;
  },

  deleteSyncedTasks(userId) {
    const tasks = db.prepare('SELECT id FROM tasks WHERE userId=? AND googleEventId IS NOT NULL').all(userId);
    db.prepare('DELETE FROM tasks WHERE userId=? AND googleEventId IS NOT NULL').run(userId);
    for (const t of tasks) {
      safeFirestoreWrite('tasks', t.id, null, true);
    }
  },

  deleteSyncedSlots(userId) {
    const slots = db.prepare('SELECT id FROM fixed_slots WHERE userId=? AND googleEventId IS NOT NULL').all(userId);
    db.prepare('DELETE FROM fixed_slots WHERE userId=? AND googleEventId IS NOT NULL').run(userId);
    for (const s of slots) {
      safeFirestoreWrite('fixed_slots', s.id, null, true);
    }
  },

  // --- Goals ---
  getGoals(userId) {
    return db.prepare('SELECT * FROM goals WHERE userId=? AND archived=0 ORDER BY createdAt DESC').all(userId);
  },

  addGoal(goal) {
    db.prepare('INSERT INTO goals (id, userId, title, description, category, targetCount, progress, streak, bestStreak, createdAt, updatedAt, archived, links, location) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?)').run(
      goal.id, goal.userId, goal.title, goal.description || '', goal.category || 'personal',
      goal.targetCount || 1, goal.progress || 0, goal.streak || 0, goal.bestStreak || 0,
      goal.createdAt, goal.updatedAt, goal.links || '', goal.location || ''
    );
    safeFirestoreWrite('goals', goal.id, {
      ...goal,
      description: goal.description || '',
      category: goal.category || 'personal',
      targetCount: goal.targetCount || 1,
      progress: goal.progress || 0,
      streak: goal.streak || 0,
      bestStreak: goal.bestStreak || 0,
      archived: 0,
      links: goal.links || '',
      location: goal.location || ''
    });
    return goal;
  },

  updateGoal(id, updates) {
    const existing = db.prepare('SELECT * FROM goals WHERE id=?').get(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    const updatedAt = new Date().toISOString();
    db.prepare('UPDATE goals SET title=?, description=?, category=?, targetCount=?, progress=?, streak=?, bestStreak=?, updatedAt=?, links=?, location=? WHERE id=?').run(
      merged.title, merged.description, merged.category, merged.targetCount,
      merged.progress, merged.streak, merged.bestStreak, updatedAt,
      merged.links || '', merged.location || '', id
    );
    const updated = { ...merged, updatedAt };
    safeFirestoreWrite('goals', id, updated);
    return updated;
  },

  deleteGoal(id) {
    const habits = db.prepare('SELECT id FROM habits WHERE goalId=?').all(id);
    db.prepare('DELETE FROM goals WHERE id=?').run(id);
    db.prepare('DELETE FROM habits WHERE goalId=?').run(id);
    db.prepare('DELETE FROM habit_logs WHERE habitId IN (SELECT id FROM habits WHERE goalId=?)').run(id);
    
    safeFirestoreWrite('goals', id, null, true);
    for (const h of habits) {
      safeFirestoreWrite('habits', h.id, null, true);
    }
  },

  // --- Habits ---
  getHabits(userId) {
    return db.prepare('SELECT * FROM habits WHERE userId=? AND archived=0 ORDER BY createdAt DESC').all(userId).map(h => ({
      ...h,
      daysOfWeek: safeJson(h.daysOfWeek, [])
    }));
  },

  getHabitsByGoal(goalId) {
    return db.prepare('SELECT * FROM habits WHERE goalId=? AND archived=0').all(goalId).map(h => ({
      ...h,
      daysOfWeek: safeJson(h.daysOfWeek, [])
    }));
  },

  addHabit(habit) {
    db.prepare('INSERT INTO habits (id, userId, goalId, title, frequency, daysOfWeek, streak, bestStreak, totalCount, createdAt, archived, links, location) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)').run(
      habit.id, habit.userId, habit.goalId || null, habit.title, habit.frequency || 'daily',
      JSON.stringify(habit.daysOfWeek || []), habit.streak || 0, habit.bestStreak || 0, habit.totalCount || 0,
      habit.createdAt, habit.links || '', habit.location || ''
    );
    safeFirestoreWrite('habits', habit.id, {
      ...habit,
      goalId: habit.goalId || null,
      frequency: habit.frequency || 'daily',
      daysOfWeek: habit.daysOfWeek || [],
      streak: habit.streak || 0,
      bestStreak: habit.bestStreak || 0,
      totalCount: habit.totalCount || 0,
      archived: 0,
      links: habit.links || '',
      location: habit.location || ''
    });
    return habit;
  },

  updateHabit(id, updates) {
    const existing = db.prepare('SELECT * FROM habits WHERE id=?').get(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    db.prepare('UPDATE habits SET title=?, frequency=?, daysOfWeek=?, streak=?, bestStreak=?, totalCount=?, links=?, location=? WHERE id=?').run(
      merged.title, merged.frequency, JSON.stringify(merged.daysOfWeek || []),
      merged.streak, merged.bestStreak, merged.totalCount,
      merged.links || '', merged.location || '', id
    );
    const updated = {
      ...merged,
      daysOfWeek: Array.isArray(merged.daysOfWeek) ? merged.daysOfWeek : safeJson(merged.daysOfWeek, [])
    };
    safeFirestoreWrite('habits', id, updated);
    return updated;
  },

  deleteHabit(id) {
    db.prepare('DELETE FROM habits WHERE id=?').run(id);
    db.prepare('DELETE FROM habit_logs WHERE habitId=?').run(id);
    safeFirestoreWrite('habits', id, null, true);
  },

  // --- Habit Logs ---
  getHabitLogs(habitId) {
    return db.prepare('SELECT * FROM habit_logs WHERE habitId=? ORDER BY date DESC').all(habitId);
  },

  getHabitLogForDate(habitId, date) {
    return db.prepare('SELECT * FROM habit_logs WHERE habitId=? AND date=?').get(habitId, date) || null;
  },

  logHabit(habitId, userId, date) {
    const existing = db.prepare('SELECT * FROM habit_logs WHERE habitId=? AND date=?').get(habitId, date);
    if (existing) {
      const newCompleted = existing.completed ? 0 : 1;
      db.prepare('UPDATE habit_logs SET completed=? WHERE id=?').run(newCompleted, existing.id);
      const updated = { ...existing, completed: newCompleted };
      safeFirestoreWrite('habit_logs', existing.id, updated);
      return updated;
    }
    const info = db.prepare('INSERT INTO habit_logs (habitId, userId, date, completed) VALUES (?,?,?,1)').run(habitId, userId, date);
    const id = info.lastInsertRowid;
    const record = { id, habitId, userId, date, completed: 1 };
    safeFirestoreWrite('habit_logs', id, record);
    return record;
  },

  getStreakData(habitId) {
    return db.prepare('SELECT date FROM habit_logs WHERE habitId=? AND completed=1 ORDER BY date DESC').all(habitId);
  },

  // --- Notifications ---
  addNotification(n) {
    const createdAt = new Date().toISOString();
    const info = db.prepare('INSERT INTO notifications (userId, type, title, message, taskId, createdAt) VALUES (?,?,?,?,?,?)').run(
      n.userId, n.type, n.title, n.message, n.taskId || null, createdAt
    );
    const id = info.lastInsertRowid;
    safeFirestoreWrite('notifications', id, { id, userId: n.userId, type: n.type, title: n.title, message: n.message, taskId: n.taskId || null, read: 0, createdAt });
  },

  getNotifications(userId, unreadOnly) {
    if (unreadOnly) {
      return db.prepare('SELECT * FROM notifications WHERE userId=? AND read=0 ORDER BY createdAt DESC').all(userId);
    }
    return db.prepare('SELECT * FROM notifications WHERE userId=? ORDER BY createdAt DESC').all(userId);
  },

  markNotificationRead(id) {
    db.prepare('UPDATE notifications SET read=1 WHERE id=?').run(id);
    safeFirestoreWrite('notifications', id, { read: 1 });
  },

  markAllNotificationsRead(userId) {
    const unread = db.prepare('SELECT id FROM notifications WHERE userId=? AND read=0').all(userId);
    db.prepare('UPDATE notifications SET read=1 WHERE userId=? AND read=0').run(userId);
    for (const n of unread) {
      safeFirestoreWrite('notifications', n.id, { read: 1 });
    }
  },

  getUnreadNotificationCount(userId) {
    const row = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE userId=? AND read=0').get(userId);
    return row ? row.count : 0;
  },

  // --- Autopilot ---
  getAutoPilot(userId) {
    const u = db.prepare('SELECT autoPilot FROM users WHERE id=?').get(userId);
    return u ? !!u.autoPilot : false;
  },

  setAutoPilot(userId, enabled) {
    db.prepare('UPDATE users SET autoPilot=? WHERE id=?').run(enabled ? 1 : 0, userId);
    safeFirestoreWrite('users', userId, { autoPilot: enabled ? 1 : 0 });
  },

  // --- Global Users ---
  getAllUserIds() {
    return db.prepare('SELECT id FROM users').all();
  },

  getDailyLog(userId, date) {
    const log = db.prepare('SELECT * FROM daily_logs WHERE userId=? AND date=?').get(userId, date);
    if (!log) return null;
    return { ...log, data: safeJson(log.data, {}) };
  },

  updateDailyLog(userId, date, data) {
    db.prepare('UPDATE daily_logs SET data=? WHERE userId=? AND date=?').run(JSON.stringify(data), userId, date);
    const log = db.prepare('SELECT * FROM daily_logs WHERE userId=? AND date=?').get(userId, date);
    if (log) {
      safeFirestoreWrite('daily_logs', log.id, { ...log, data });
    }
  },

  // --- External tasks integration helpers ---
  getTaskByExternalId(userId, source, externalId) {
    return row(db.prepare('SELECT * FROM tasks WHERE userId=? AND source=? AND externalId=?').get(userId, source, externalId));
  },

  getTasksBySource(userId, source) {
    return db.prepare('SELECT * FROM tasks WHERE userId=? AND source=? ORDER BY createdAt DESC').all(userId, source).map(row);
  },

  getIntegrationStatus(userId) {
    return this.getUserToken(userId);
  },

  updateIntegrationSync(userId, service) {
    const col = `last${service.charAt(0).toUpperCase() + service.slice(1)}Sync`;
    const now = new Date().toISOString();
    db.prepare(`UPDATE user_tokens SET ${col}=? WHERE userId=?`).run(now, userId);
    safeFirestoreWrite('user_tokens', userId, { [col]: now });
  },

  updateUserToken(userId, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const setClauses = keys.map(k => `${k}=?`);
    const values = keys.map(k => fields[k]);
    values.push(userId);
    db.prepare(`UPDATE user_tokens SET ${setClauses.join(', ')} WHERE userId=?`).run(...values);
    safeFirestoreWrite('user_tokens', userId, fields);
  },

  deleteTasksBySource(userId, source) {
    const tasks = db.prepare('SELECT id FROM tasks WHERE userId=? AND source=?').all(userId, source);
    db.prepare('DELETE FROM tasks WHERE userId=? AND source=?').run(userId, source);
    for (const t of tasks) {
      safeFirestoreWrite('tasks', t.id, null, true);
    }
  },

  // --- Connectors ---
  getConnector(userId, service) {
    const c = db.prepare('SELECT * FROM connectors WHERE userId=? AND service=?').get(userId, service) || null;
    if (c) {
      return { ...c, metadata: safeJson(c.metadata, {}) };
    }
    return null;
  },

  getAllConnectors(userId) {
    return db.prepare('SELECT * FROM connectors WHERE userId=?').all(userId).map(c => ({
      ...c,
      metadata: safeJson(c.metadata, {})
    }));
  },

  setConnector(userId, service, data) {
    const existing = db.prepare('SELECT * FROM connectors WHERE userId=? AND service=?').get(userId, service);
    let record;
    if (existing) {
      const setClauses = Object.keys(data).map(k => `${k}=?`);
      const values = Object.keys(data).map(k => data[k]);
      values.push(userId, service);
      db.prepare(`UPDATE connectors SET ${setClauses.join(', ')} WHERE userId=? AND service=?`).run(...values);
      record = db.prepare('SELECT * FROM connectors WHERE id=?').get(existing.id);
    } else {
      const cols = ['userId', 'service', ...Object.keys(data)];
      const vals = [userId, service, ...Object.keys(data).map(k => data[k])];
      const info = db.prepare(`INSERT INTO connectors (${cols.join(', ')}) VALUES (${vals.map(() => '?').join(', ')})`).run(...vals);
      record = { id: info.lastInsertRowid, userId, service, ...data };
    }
    if (record) {
      safeFirestoreWrite('connectors', record.id, {
        ...record,
        metadata: typeof record.metadata === 'string' ? safeJson(record.metadata, {}) : (record.metadata || {})
      });
    }
  },

  deleteConnector(userId, service) {
    const existing = db.prepare('SELECT id FROM connectors WHERE userId=? AND service=?').get(userId, service);
    if (existing) {
      db.prepare('DELETE FROM connectors WHERE userId=? AND service=?').run(userId, service);
      safeFirestoreWrite('connectors', existing.id, null, true);
    }
  },

  // --- Push Subscriptions ---
  getPushSubscriptions(userId) {
    return db.prepare('SELECT * FROM push_subscriptions WHERE userId=?').all(userId);
  },

  getAllPushSubscriptions() {
    return db.prepare('SELECT * FROM push_subscriptions').all();
  },

  addPushSubscription(userId, sub) {
    const existing = db.prepare('SELECT id FROM push_subscriptions WHERE userId=? AND endpoint=?').get(userId, sub.endpoint);
    if (existing) {
      db.prepare('UPDATE push_subscriptions SET p256dh=?, auth=? WHERE id=?').run(sub.p256dh, sub.auth, existing.id);
      safeFirestoreWrite('push_subscriptions', existing.id, { p256dh: sub.p256dh, auth: sub.auth });
      return;
    }
    const createdAt = new Date().toISOString();
    const info = db.prepare('INSERT INTO push_subscriptions (userId, endpoint, p256dh, auth, createdAt) VALUES (?,?,?,?,?)').run(
      userId, sub.endpoint, sub.p256dh, sub.auth, createdAt
    );
    const id = info.lastInsertRowid;
    safeFirestoreWrite('push_subscriptions', id, { id, userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, createdAt });
  },

  removePushSubscription(endpoint) {
    const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint=?').all(endpoint);
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint);
    for (const sub of existing) {
      safeFirestoreWrite('push_subscriptions', sub.id, null, true);
    }
  },

  deleteAllPushSubscriptions(userId) {
    const subs = db.prepare('SELECT id FROM push_subscriptions WHERE userId=?').all(userId);
    db.prepare('DELETE FROM push_subscriptions WHERE userId=?').run(userId);
    for (const sub of subs) {
      safeFirestoreWrite('push_subscriptions', sub.id, null, true);
    }
  },

  deleteAllUserData(userId) {
    db.prepare('DELETE FROM tasks WHERE userId=?').run(userId);
    db.prepare('DELETE FROM goals WHERE userId=?').run(userId);
    db.prepare('DELETE FROM habits WHERE userId=?').run(userId);
    db.prepare('DELETE FROM habit_logs WHERE userId=?').run(userId);
    db.prepare('DELETE FROM notifications WHERE userId=?').run(userId);
    db.prepare('DELETE FROM daily_logs WHERE userId=?').run(userId);
    db.prepare('DELETE FROM fixed_slots WHERE userId=?').run(userId);
    db.prepare('DELETE FROM xp_log WHERE userId=?').run(userId);
    db.prepare('DELETE FROM achievements WHERE userId=?').run(userId);
    db.prepare('DELETE FROM push_subscriptions WHERE userId=?').run(userId);

    Promise.resolve().then(async () => {
      try {
        const collections = ['tasks', 'goals', 'habits', 'habit_logs', 'notifications', 'daily_logs', 'fixed_slots', 'xp_log', 'achievements', 'push_subscriptions'];
        for (const col of collections) {
          const snapshot = await firestore.collection(col).where('userId', '==', userId).get();
          const batch = firestore.batch();
          snapshot.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
      } catch (err) {
        console.error('[Firestore Sync Error] Failed to delete all user data:', err);
      }
    });
  },

  // --- Gamification ---
  addXp(userId, amount, reason) {
    const createdAt = new Date().toISOString();
    const info = db.prepare('INSERT INTO xp_log (userId, amount, reason, createdAt) VALUES (?, ?, ?, ?)').run(userId, amount, reason, createdAt);
    const id = info.lastInsertRowid;
    safeFirestoreWrite('xp_log', id, { id, userId, amount, reason, createdAt });
    
    // Increment xp directly in users document for fast queries
    if (firestore) {
      Promise.resolve().then(async () => {
        try {
          const total = this.getXp(userId);
          await firestore.collection('users').doc(String(userId)).set({ xp: total }, { merge: true });
        } catch (err) {
          console.error('[Firestore Sync Error] Failed to update user total XP:', err);
        }
      });
    }
  },

  getXp(userId) {
    const row = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM xp_log WHERE userId=?').get(userId);
    return row ? row.total : 0;
  },

  getLevel(userId) {
    const total = this.getXp(userId);
    let level = 0;
    while (total >= xpForLevel(level + 1)) { level++; }
    return level;
  },

  getNextLevelXp(userId) {
    const total = this.getXp(userId);
    const currentLevel = getLevel(total);
    return xpForLevel(currentLevel + 1) - total;
  },

  getLeaderboard(limit = 20) {
    return db.prepare(`
      SELECT u.id, u.name, COALESCE(SUM(x.amount), 0) as xp
      FROM users u LEFT JOIN xp_log x ON u.id = x.userId
      GROUP BY u.id ORDER BY xp DESC LIMIT ?
    `).all(limit);
  },

  unlockAchievement(userId, key) {
    const existing = db.prepare('SELECT id FROM achievements WHERE userId=? AND key=?').get(userId, key);
    if (existing) return false;
    const a = ACHIEVEMENTS.find(a => a.key === key);
    if (!a) return false;
    const unlockedAt = new Date().toISOString();
    const info = db.prepare('INSERT INTO achievements (userId, key, title, unlockedAt) VALUES (?, ?, ?, ?)').run(userId, key, a.title, unlockedAt);
    const id = info.lastInsertRowid;
    safeFirestoreWrite('achievements', id, { id, userId, key, title: a.title, unlockedAt });
    this.addXp(userId, a.xp, `Achievement: ${a.title}`);
    return true;
  },

  checkAchievements(userId) {
    const tasks = db.prepare('SELECT * FROM tasks WHERE userId=?').all(userId);
    const goals = db.prepare('SELECT * FROM goals WHERE userId=?').all(userId);
    const habits = db.prepare('SELECT * FROM habits WHERE userId=?').all(userId);
    const slots = db.prepare('SELECT * FROM fixed_slots WHERE userId=?').all(userId);
    const connectors = db.prepare('SELECT * FROM connectors WHERE userId=? AND connected=1').all(userId);

    const userStats = {
      tasksCreated: tasks.length,
      tasksCompleted: tasks.filter(t => t.completed).length,
      goalsCreated: goals.length,
      goalsCompleted: goals.filter(g => g.progress >= g.targetCount).length,
      bestStreak: Math.max(...habits.map(h => h.bestStreak), 0),
      earlyTasks: tasks.filter(t => {
        if (!t.completed || !t.completedAt) return false;
        const h = new Date(t.completedAt).getHours();
        return h < 8;
      }).length,
      focusSessions: 0,
      slotsCreated: slots.length,
      connections: connectors.length
    };

    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (a.check(userStats)) {
        if (this.unlockAchievement(userId, a.key)) {
          unlocked.push(a);
        }
      }
    }
    return unlocked;
  },

  getAchievements(userId) {
    return db.prepare('SELECT * FROM achievements WHERE userId=? ORDER BY unlockedAt DESC').all(userId);
  },

  getXpHistory(userId, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return db.prepare('SELECT date(createdAt) as day, SUM(amount) as xp FROM xp_log WHERE userId=? AND createdAt >= ? GROUP BY day ORDER BY day').all(userId, since.toISOString());
  }
};
