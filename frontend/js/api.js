const TOKEN_KEY = 'pulse_token';
const USER_KEY = 'pulse_user';

async function api(endpoint, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.body = JSON.stringify(options.body);
  }
  let res;
  try {
    res = await fetch(`/api${endpoint}`, { ...options, headers });
  } catch {
    throw new Error('Cannot reach server. Make sure the backend is running');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
    if (res.status === 401 && body.error && body.error.toLowerCase().includes('token')) {
      const hasToken = !!localStorage.getItem(TOKEN_KEY);
      if (hasToken) {
        Store.clearUser();
        document.getElementById('mainNav').classList.add('hidden');
        Utils.showPage('auth');
        throw new Error('Session expired. Please log in again.');
      }
    }
    throw new Error(body.error || 'Request failed');
  }
  return res.json();
}

const Store = {
  _user: null,

  init() {
    this._user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    this.syncUser();
  },

  async syncUser() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) this.setUser(data.user);
      } else if (res.status === 401) {
        this.clearUser();
        const mainNav = document.getElementById('mainNav');
        if (mainNav) mainNav.classList.add('hidden');
        Utils.showPage('landing');
      }
    } catch {}
  },

  getUser() { return this._user; },

  setUser(u) {
    this._user = u;
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  },

  clearUser() {
    this._user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async login(email, password) {
    const data = await api('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    this.setUser(data.user);
    return data;
  },

  async signup(name, email, password, dob) {
    const data = await api('/auth/signup', {
      method: 'POST', body: JSON.stringify({ name, email, password, dob })
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    this.setUser(data.user);
    return data;
  },

  async googleLogin(credential) {
    const data = await api('/auth/google', {
      method: 'POST', body: JSON.stringify({ credential })
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    this.setUser(data.user);
    return data;
  },

  async getTasks() { return api('/tasks'); },

  async addTask(task) {
    return api('/tasks', { method: 'POST', body: JSON.stringify(task) });
  },

  async updateTask(id, updates) {
    return api(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  },

  async deleteTask(id) {
    return api(`/tasks/${id}`, { method: 'DELETE' });
  },

  async toggleTask(id) {
    return api(`/tasks/${id}/toggle`, { method: 'PATCH' });
  },

  async reorderTasks(order) {
    return api('/tasks/reorder/all', { method: 'PUT', body: JSON.stringify({ order }) });
  },

  async getSlots() { return api('/slots'); },

  async addSlot(slot) {
    return api('/slots', { method: 'POST', body: JSON.stringify(slot) });
  },

  async updateSlot(id, updates) {
    return api(`/slots/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  },

  async deleteSlot(id) {
    return api(`/slots/${id}`, { method: 'DELETE' });
  },

  async getStats() { return api('/analytics/stats'); },

  async logDaily(data) {
    return api('/analytics/log', { method: 'POST', body: JSON.stringify(data) });
  },

  async getCalendarStatus() { return api('/calendar/status'); },
  async getCalendarAuthUrl() { return api('/calendar/auth-url'); },
  async syncCalendar() { return api('/calendar/sync', { method: 'POST' }); },
  async disconnectCalendar() { return api('/calendar/disconnect', { method: 'POST' }); },

  // Reminders
  async getNotifications() { return api('/reminders'); },
  async getUnreadNotifications() { return api('/reminders/unread'); },
  async markNotificationRead(id) { return api(`/reminders/${id}/read`, { method: 'POST' }); },
  async markAllNotificationsRead() { return api('/reminders/read-all', { method: 'POST' }); },

  // Auto-pilot
  async getAutoPilot() { return api('/autopilot'); },
  async setAutoPilot(enabled) { return api('/autopilot', { method: 'POST', body: JSON.stringify({ enabled }) }); },

  // Goals
  async getGoals() { return api('/goals'); },
  async addGoal(goal) { return api('/goals', { method: 'POST', body: JSON.stringify(goal) }); },
  async updateGoal(id, updates) { return api(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(updates) }); },
  async deleteGoal(id) { return api(`/goals/${id}`, { method: 'DELETE' }); },
  async incrementGoal(id) { return api(`/goals/${id}/increment`, { method: 'POST' }); },

  // Habits
  async getHabits() { return api('/goals/habits'); },
  async getHabitsWithLogs() { return api('/goals/habits/with-logs'); },
  async addHabit(habit) { return api('/goals/habits', { method: 'POST', body: JSON.stringify(habit) }); },
  async updateHabit(id, updates) { return api(`/goals/habits/${id}`, { method: 'PUT', body: JSON.stringify(updates) }); },
  async deleteHabit(id) { return api(`/goals/habits/${id}`, { method: 'DELETE' }); },

  // Habit Logs
  async getHabitLogs(habitId) { return api(`/goals/habits/${habitId}/logs`); },
  async logHabit(habitId) { return api(`/goals/habits/${habitId}/log`, { method: 'POST' }); },

  // --- Focus sessions & Premium Metrics ---
  async addFocusSession(session) {
    return api('/analytics/focus-session', { method: 'POST', body: session });
  },
  async getFocusSessions() {
    return api('/analytics/focus-sessions');
  },
  async getLoadScore() {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const dayOfWeek = new Date().getDay();
    return api(`/analytics/load-score?date=${todayStr}&dayOfWeek=${dayOfWeek}`);
  },
  async autoRelieveLoad() {
    return api('/analytics/auto-relieve', { method: 'POST' });
  },
  async getWeeklyDebrief() {
    return api('/analytics/weekly-debrief');
  },
  async getConflicts() {
    return api('/scheduler/conflicts');
  },
  async resolveConflict(taskId, action) {
    return api('/scheduler/resolve-conflict', { method: 'POST', body: { taskId, action } });
  }
};

const AIService = {
  async chat(message, context) {
    return api('/ai/chat', {
      method: 'POST', body: JSON.stringify({ message, context })
    });
  },

  async generateSubtasks(title, description) {
    const data = await api('/ai/subtasks', {
      method: 'POST', body: JSON.stringify({ title, description })
    });
    return data.subtasks;
  },

  async parseTask(text) {
    return api('/ai/parse-task', { method: 'POST', body: { text } });
  },

  async getMorningBriefing(lang = 'en') {
    return api(`/ai/morning-briefing?lang=${lang}`);
  }
};
