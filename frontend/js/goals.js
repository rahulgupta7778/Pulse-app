const Goals = {
  _goals: [],
  _habits: [],

  async init() {
    await this.load();
    this.render();
  },

  async load() {
    try {
      this._goals = await Store.getGoals();
      this._habits = await Store.getHabitsWithLogs();
    } catch { this._goals = []; this._habits = []; }
  },

  render() {
    this.renderGoalList();
    this.renderHabitList();
    this.renderStats();
  },

  renderStats() {
    const total = this._goals.length;
    const completed = this._goals.filter(g => g.progress >= g.targetCount).length;
    const totalStreak = this._habits.reduce((s, h) => s + h.streak, 0);
    document.getElementById('goalTotal').textContent = total;
    document.getElementById('goalCompleted').textContent = completed;
    document.getElementById('habitStreak').textContent = totalStreak;
    ['goalTotal', 'goalCompleted', 'habitStreak'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('skeleton', 'skeleton-text');
    });
  },

  renderGoalList() {
    const container = document.getElementById('goalList');
    if (!this._goals.length) {
      container.innerHTML = '<div class="empty-state">No goals yet. Set your first goal!</div>';
      return;
    }
    container.innerHTML = this._goals.map(g => {
      const pct = g.targetCount > 0 ? Math.round((g.progress / g.targetCount) * 100) : 0;
      return `<div class="goal-card" data-id="${g.id}">
        <div class="goal-header">
          <span class="goal-category cat-${g.category}">${g.category}</span>
          <div class="goal-actions">
            <button class="goal-edit-btn" data-id="${g.id}" title="Edit">✏️</button>
            <button class="goal-del-btn" data-id="${g.id}" title="Delete">🗑️</button>
          </div>
        </div>
        <h3 class="goal-title">${g.title}</h3>
        ${g.description ? `<p class="goal-desc">${g.description}</p>` : ''}
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="goal-meta">
          <span>Progress: ${g.progress}/${g.targetCount}</span>
          <span>Streak: ${g.streak} days</span>
        </div>
        ${g.collaboratorEmail ? `<div style="margin-top: 0.4rem; background: rgba(14, 165, 233, 0.15); color: #0ea5e9; font-weight: 500; font-size: 0.72rem; padding: 0.1rem 0.4rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.2rem; width: max-content;">👥 ${Utils.escapeHtml(g.collaboratorEmail)}</div>` : ''}
        ${g.location ? `<div class="task-location" style="margin-top:0.4rem;">📍 <a href="${MediaHelper.getMapsUrl(g.location)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;text-underline-offset:2px;">${g.location}</a></div>` : ''}
        ${g.links ? `<div class="task-links">${g.links.split(/[\n,]/).map(u => u.trim()).filter(Boolean).map(u => {
          if (u.startsWith('http')) {
            const host = u.replace('https://','').replace('http://','').split('/')[0];
            return `<a href="${u}" target="_blank" rel="noopener">🔗 ${host}</a>`;
          }
          return u;
        }).join(' · ')}</div>` : ''}
        ${g.progress < g.targetCount ? `<button class="goal-inc-btn" data-id="${g.id}" title="Log progress">+1</button>` : `<span class="goal-done-badge">✓ Done</span>`}
      </div>`;
    }).join('');

    container.querySelectorAll('.goal-inc-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        btn.disabled = true;
        btn.textContent = '...';
        try {
          await Store.incrementGoal(btn.dataset.id);
          const goal = this._goals.find(g => g.id === btn.dataset.id);
          if (goal && goal.progress + 1 >= goal.targetCount) {
            Toast.success('Goal achieved!');
            Utils.confetti(50);
          } else {
            Toast.success('Progress logged!');
          }
          await this.init();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '+1';
          Toast.error('Failed to increment: ' + err.message);
        }
      });
    });

    container.querySelectorAll('.goal-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openGoalModal(btn.dataset.id));
    });
    container.querySelectorAll('.goal-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const goalId = btn.dataset.id;
        const goal = this._goals.find(g => g.id === goalId);
        if (!goal) return;
        await Store.deleteGoal(goalId);
        Toast.undo('Goal deleted', async () => {
          await Store.addGoal(goal);
          const habits = this._habits.filter(h => h.goalId === goalId);
          for (const h of habits) await Store.addHabit(h);
          await this.init();
          Toast.success('Goal restored');
        });
        await this.init();
      });
    });
  },

  renderHabitList() {
    const container = document.getElementById('habitList');
    if (!this._habits.length) {
      container.innerHTML = '<div class="empty-state">No habits yet. Create a habit to track!</div>';
      return;
    }
    container.innerHTML = this._habits.map(h => {
      const goal = this._goals.find(g => g.id === h.goalId);
      const checked = h.loggedToday;
      return `<div class="habit-card" data-id="${h.id}">
        <div class="habit-left">
          <button class="habit-check-btn${checked ? ' is-checked' : ''}" data-id="${h.id}">${checked ? '✓' : '○'}</button>
          <div class="habit-info">
            <span class="habit-title">${h.title}</span>
            ${goal ? `<span class="habit-goal-tag">→ ${goal.title}</span>` : ''}
            <span class="habit-streak">🔥 ${h.streak} day streak</span>
            ${h.location ? `<span class="habit-location">📍 <a href="${MediaHelper.getMapsUrl(h.location)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;text-underline-offset:2px;">${h.location}</a></span>` : ''}
            ${h.links ? `<span class="habit-links">${h.links.split(/[\n,]/).map(u => u.trim()).filter(Boolean).map(u => {
              if (u.startsWith('http')) {
                const host = u.replace('https://','').replace('http://','').split('/')[0];
                return `<a href="${u}" target="_blank" rel="noopener">🔗 ${host}</a>`;
              }
              return u;
            }).join(' · ')}</span>` : ''}
          </div>
        </div>
        <div class="habit-actions">
          <button class="habit-edit-btn" data-id="${h.id}" title="Edit">✏️</button>
          <button class="habit-del-btn" data-id="${h.id}" title="Delete">🗑️</button>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.habit-check-btn').forEach(btn => {
      const toggle = () => {
        const isChecked = btn.classList.contains('is-checked');
        btn.textContent = isChecked ? '○' : '✓';
        btn.classList.toggle('is-checked');
      };
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        toggle();
        try {
          await Store.logHabit(btn.dataset.id);
          await this.init();
        } catch (err) {
          toggle();
          Toast.error('Failed to log habit');
        }
      });
    });
    container.querySelectorAll('.habit-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openHabitModal(btn.dataset.id));
    });
    container.querySelectorAll('.habit-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const habitId = btn.dataset.id;
        const habit = this._habits.find(h => h.id === habitId);
        if (!habit) return;
        await Store.deleteHabit(habitId);
        Toast.undo('Habit deleted', async () => {
          await Store.addHabit(habit);
          await this.init();
          Toast.success('Habit restored');
        });
        await this.init();
      });
    });
  },

  async openGoalModal(id) {
    const goal = id ? this._goals.find(g => g.id === id) : null;
    document.getElementById('goalModalId').value = goal ? goal.id : '';
    document.getElementById('goalModalTitle').textContent = goal ? 'Edit Goal' : 'New Goal';
    document.getElementById('goalFormTitle').value = goal ? goal.title : '';
    document.getElementById('goalFormDesc').value = goal ? goal.description : '';
    document.getElementById('goalFormCategory').value = goal ? goal.category : 'personal';
    document.getElementById('goalFormTarget').value = goal ? goal.targetCount : 1;

    const colab = document.getElementById('goalCollaborator');
    if (colab) colab.value = goal ? (goal.collaboratorEmail || '') : '';

    MediaHelper.setupLocationField('goalFormLocation', 'goalLocationField');
    MediaHelper.setupLinksField('goalFormLinks', 'goalLinksField');
    const loc = document.getElementById('goalFormLocation');
    if (loc) loc.value = goal ? (goal.location || '') : '';
    const links = document.getElementById('goalFormLinks');
    if (links) links.value = goal ? (goal.links || '') : '';

    Utils.showModal('goalModal');
  },

  async openHabitModal(id) {
    const habit = id ? this._habits.find(h => h.id === id) : null;
    document.getElementById('habitModalId').value = habit ? habit.id : '';
    document.getElementById('habitModalTitle').textContent = habit ? 'Edit Habit' : 'New Habit';
    document.getElementById('habitFormTitle').value = habit ? habit.title : '';

    const goalSelect = document.getElementById('habitFormGoal');
    goalSelect.innerHTML = '<option value="">-- No goal --</option>' +
      this._goals.map(g => `<option value="${g.id}" ${habit && habit.goalId === g.id ? 'selected' : ''}>${g.title}</option>`).join('');

    document.getElementById('habitFormFreq').value = habit ? habit.frequency : 'daily';

    MediaHelper.setupLocationField('habitFormLocation', 'habitLocationField');
    MediaHelper.setupLinksField('habitFormLinks', 'habitLinksField');
    const loc = document.getElementById('habitFormLocation');
    if (loc) loc.value = habit ? (habit.location || '') : '';
    const links = document.getElementById('habitFormLinks');
    if (links) links.value = habit ? (habit.links || '') : '';

    const freq = document.getElementById('habitFreqDays');
    if (freq) freq.style.display = 'none';
    Utils.showModal('habitModal');
  },

  setupGoalForm() {
    document.getElementById('goalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('goalModalId').value;
      const data = {
        title: document.getElementById('goalFormTitle').value,
        description: document.getElementById('goalFormDesc').value,
        category: document.getElementById('goalFormCategory').value,
        targetCount: parseInt(document.getElementById('goalFormTarget').value) || 1,
        location: document.getElementById('goalFormLocation').value.trim(),
        links: document.getElementById('goalFormLinks').value.trim(),
        collaboratorEmail: document.getElementById('goalCollaborator') ? document.getElementById('goalCollaborator').value.trim() || null : null
      };
      if (id) {
        await Store.updateGoal(id, data);
        Toast.success('Goal updated');
      } else {
        await Store.addGoal(data);
        Toast.success('Goal created');
      }
      Utils.hideModal('goalModal');
      await this.init();
    });
  },

  setupHabitForm() {
    document.getElementById('habitForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('habitModalId').value;
      const data = {
        title: document.getElementById('habitFormTitle').value,
        goalId: document.getElementById('habitFormGoal').value || null,
        frequency: document.getElementById('habitFormFreq').value,
        location: document.getElementById('habitFormLocation').value.trim(),
        links: document.getElementById('habitFormLinks').value.trim()
      };
      if (id) {
        await Store.updateHabit(id, data);
        Toast.success('Habit updated');
      } else {
        await Store.addHabit(data);
        Toast.success('Habit created');
      }
      Utils.hideModal('habitModal');
      await this.init();
    });
  }
};
