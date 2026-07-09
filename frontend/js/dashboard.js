const Dashboard = {
  _prevStats: {},

  async init() {
    this._initialized = true;
    this._autoPilotLoaded = false;
    await this.render();
    if (this._interval) clearInterval(this._interval);
    this._interval = setInterval(async () => await this.render(), 30000);
  },

  async renderMentalLoad() {
    const badge = document.getElementById('loadLevelBadge');
    const bar = document.getElementById('loadProgressBar');
    const desc = document.getElementById('loadLevelDesc');
    const relieveBtn = document.getElementById('relieveLoadBtn');

    if (!badge) return;

    try {
      const load = await Store.getLoadScore();
      badge.textContent = load.level;
      badge.style.background = load.levelColor;
      bar.style.width = `${load.percentage}%`;
      bar.style.background = load.levelColor;

      let descText = `Load Score: ${load.score}/25. Tasks today: ${load.tasksCount}, events: ${load.slotsCount}. Current mood: ${load.mood}.`;
      if (load.suggestions && load.suggestions.length > 0) {
        descText += '<br/><span style="margin-top: 0.3rem; display: block; font-size: 0.76rem; color: var(--text-muted);">' + load.suggestions.join(' ') + '</span>';
      }
      desc.innerHTML = descText;

      // Show auto-relieve if load is heavy or overloaded
      if (load.level === 'Heavy' || load.level === 'Overloaded') {
        relieveBtn.style.display = 'inline-flex';
        relieveBtn.onclick = async () => {
          relieveBtn.disabled = true;
          relieveBtn.textContent = 'Relieving...';
          try {
            const res = await Store.autoRelieveLoad();
            Toast.show(res.message, 'success');
            await this.render();
          } catch (err) {
            Toast.show('Failed to relieve load: ' + err.message, 'error');
          } finally {
            relieveBtn.disabled = false;
            relieveBtn.textContent = '🧘 Auto-Relieve Load';
          }
        };
      } else {
        relieveBtn.style.display = 'none';
      }
    } catch (err) {
      desc.textContent = 'Failed to load mental load score';
    }
  },

  async render() {
    const tasks = await Store.getTasks();
    await this.loadAutoPilot();
    const now = new Date();
    const hr = now.getHours();
    let greet = 'Good evening';
    if (hr < 12) greet = 'Good morning';
    else if (hr < 17) greet = 'Good afternoon';
    const user = Store.getUser();
    document.getElementById('greeting').textContent = `${greet}, ${user?.name || 'there'}!`;

    const dueToday = tasks.filter(t => !t.completed && t.dueDate && Utils.isToday(t.dueDate)).length;
    const overdue = tasks.filter(t => !t.completed && t.dueDate && Utils.isOverdue(t.dueDate)).length;
    const completed = tasks.filter(t => t.completed).length;
    const score = this.calcProductivityScore(tasks);

    this._setStat('statDueToday', dueToday);
    this._setStat('statOverdue', overdue);
    this._setStat('statCompleted', completed);
    document.getElementById('statScore').textContent = score;
    document.getElementById('statScore').classList.remove('skeleton', 'skeleton-text');

    this._prevStats = { dueToday, overdue, completed, score };

    this.renderTimeline(tasks);
    this.renderDeadlines(tasks);
    this.renderMentalLoad();
    this.renderAITip(tasks);
    this.renderMindfulQuote();
    Gamification.load();
  },

  countUp(el, target, duration = 600) {
    if (target === '--' || target === 0) { el.textContent = target; return; }
    const start = performance.now();
    const initial = parseInt(el.textContent) || 0;
    const diff = target - initial;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(initial + diff * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  _setStat(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (this._prevStats[id] !== value) this.countUp(el, value);
    el.classList.remove('skeleton', 'skeleton-text');
  },

  calcProductivityScore(tasks) {
    if (tasks.length === 0) return '--';
    const completed = tasks.filter(t => t.completed).length;
    return Math.round((completed / tasks.length) * 100);
  },

  renderTimeline(tasks) {
    const container = document.getElementById('todayTimeline');
    const todayTasks = tasks.filter(t => !t.completed && t.dueDate && Utils.isToday(t.dueDate));
    if (todayTasks.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem; padding: 0.5rem 0;">No tasks scheduled for today. Add some tasks!</p>';
      return;
    }
    container.innerHTML = todayTasks.map(t => {
      const title = Utils.escapeHtml(t.title);
      const dueTime = Utils.escapeHtml(t.dueTime || 'All day');
      return `
      <div class="timeline-item">
        <span class="timeline-dot ${t.priority === 'urgent' ? 'overdue' : t.priority === 'high' ? 'due-soon' : 'upcoming'}"></span>
        <div class="timeline-content">
          <div class="timeline-title">${title}</div>
          <div class="timeline-meta">${dueTime} ${t.duration ? `· ${t.duration} min` : ''}</div>
        </div>
      </div>`;
    }).join('');
  },

  renderDeadlines(tasks) {
    const container = document.getElementById('upcomingDeadlines');
    const upcoming = tasks
      .filter(t => !t.completed && t.dueDate && !Utils.isOverdue(t.dueDate))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 5);
    if (upcoming.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem; padding: 0.5rem 0;">No upcoming deadlines. You\'re on top of things!</p>';
      return;
    }
    container.innerHTML = upcoming.map(t => {
      const diffMs = new Date(t.dueDate + 'T' + (t.dueTime || '23:59:59')) - new Date();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      let countdownText = '';
      if (diffDays > 0) {
        countdownText = `${diffDays}d ${diffHours}h left`;
      } else if (diffHours > 0) {
        countdownText = `${diffHours}h ${diffMins}m left`;
      } else {
        countdownText = `${diffMins}m left`;
      }

      const badgeClass = diffDays <= 1 ? 'urgent' : diffDays <= 3 ? 'warning' : 'soon';
      const title = Utils.escapeHtml(t.title);
      const dueTime = t.dueTime ? Utils.escapeHtml(t.dueTime) : '';
      return `
        <div class="deadline-item">
          <div class="deadline-info">
            <div class="deadline-name">${title}</div>
            <div class="deadline-date">${Utils.formatDate(t.dueDate)}${dueTime ? ` at ${dueTime}` : ''}</div>
          </div>
          <span class="deadline-badge ${badgeClass}" style="font-size: 0.72rem; padding: 0.25rem 0.5rem;">${countdownText}</span>
        </div>
      `;
    }).join('');
  },

  async loadAutoPilot() {
    const toggle = document.getElementById('autoPilotToggle');
    if (!toggle) return;
    if (this._autoPilotLoaded) return;
    try {
      const { autoPilot } = await Store.getAutoPilot();
      toggle.checked = autoPilot;
      this._autoPilotLoaded = true;
    } catch {}
    toggle.onchange = async () => {
      const isChecked = toggle.checked;
      try {
        await Store.setAutoPilot(isChecked);
        Toast.show(isChecked ? 'Auto-Pilot Mode activated 🤖' : 'Auto-Pilot Mode deactivated 🤖', 'success');
      } catch (err) {
        toggle.checked = !isChecked;
        Toast.show('Failed to update Auto-Pilot: ' + err.message, 'error');
      }
    };
  },

  async renderAITip(tasks) {
    const el = document.getElementById('aiTip');
    el.innerHTML = `<div class="ai-tip-text ai-tip-loading">Loading insights...</div>`;
    try {
      const { recommendations } = await api('/ai/recommend');
      if (recommendations && recommendations.length > 0) {
        el.innerHTML = recommendations.map(r => `
          <div class="rec-item">
            <div class="rec-icon">${r.icon || '💡'}</div>
            <div class="rec-body">
              <div class="rec-title">${Utils.escapeHtml(r.title)}</div>
              <div class="rec-desc">${Utils.escapeHtml(r.description)}</div>
            </div>
          </div>
        `).join('');
      } else {
        el.innerHTML = `<div class="ai-tip-text">Complete some tasks to receive personalized insights.</div>`;
      }
    } catch {
      el.innerHTML = `<div class="ai-tip-text">Complete some tasks to receive personalized insights about your productivity patterns.</div>`;
    }
  },

  renderMindfulQuote() {
    const el = document.getElementById('dynamicMindfulQuote');
    if (!el) return;
    const quotes = [
      "Focus on being productive instead of busy. A calm mind produces clear, powerful decisions.",
      "Take a deep breath. Big achievements are built from quiet, steady moments of focus.",
      "Deep work requires deep rest. Give yourself permission to pause between challenges today.",
      "Your mind is for having ideas, not holding them. Capture your tasks, then clear your thoughts.",
      "One mindful task at a time is the fastest path to elegant, error-free execution.",
      "Align your daily schedule with your natural energy flow. Rest when you need; excel when you can.",
      "Calm is a superpower. Approach your task list with deliberate, relaxed focus.",
      "A structured calendar frees the mind. Keep your commitments clear and your boundaries respected.",
      "Excellence is not a singular act, but a mindful habit. Take a 2-minute pause to recharge.",
      "Your speed doesn't matter if you're heading in the wrong direction. Pause, assess, then progress."
    ];
    // Rotate based on day of the month or random
    const index = new Date().getDate() % quotes.length;
    el.textContent = `"${quotes[index]}"`;
  }
};
