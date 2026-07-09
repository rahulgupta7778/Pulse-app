const ACHIEVEMENT_DESC = {
  first_task: 'Create your first task', task_10: 'Complete 10 tasks', task_50: 'Complete 50 tasks', task_100: 'Complete 100 tasks',
  streak_7: '7-day habit streak', streak_30: '30-day habit streak',
  first_goal: 'Create your first goal', goal_done: 'Complete a goal',
  early_bird: 'Complete a task before 8 AM', focused: 'Complete a focus session',
  organized: 'Create a fixed time slot', connected: 'Connect an external service',
  night_owl: 'Complete a task after 10 PM', deep_work: 'Complete a focus session of 25+ min',
  high_achiever: 'Complete a high priority task', habit_champion: 'Maintain a 14-day habit streak',
  architect: 'Create 3 or more fixed time slots', overachiever: 'Complete 5 goals'
};

const Progress = {
  async init() {
    try {
      this.initWeeklyDebrief();
      await Promise.all([this.renderLevel(), this.renderHeatmap(), this.renderAchievements()]);
    } catch {}
  },

  initWeeklyDebrief() {
    const btn = document.getElementById('generateDebriefBtn');
    const statsGrid = document.getElementById('debriefStatsGrid');
    const textContent = document.getElementById('debriefTextContent');
    const placeholder = document.getElementById('debriefPlaceholder');

    const tasksEl = document.getElementById('debriefStatTasks');
    const sessionsEl = document.getElementById('debriefStatSessions');
    const minutesEl = document.getElementById('debriefStatMinutes');
    const moodEl = document.getElementById('debriefStatMood');

    if (!btn) return;

    btn.onclick = async () => {
      btn.disabled = true;
      btn.innerHTML = '<span>⚡</span> Scanning...';
      try {
        const debrief = await Store.getWeeklyDebrief();
        const stats = debrief.stats;

        tasksEl.textContent = `${stats.completedTasks}/${stats.totalTasks}`;
        sessionsEl.textContent = stats.totalFocusSessions;
        minutesEl.textContent = `${stats.totalFocusDuration}m`;
        moodEl.textContent = stats.topMood;

        statsGrid.style.display = 'grid';
        textContent.innerHTML = this.parseMarkdown(debrief.debriefText);
        textContent.style.display = 'block';
        placeholder.style.display = 'none';

        Toast.show("Pulse AI scan complete! Weekly debrief compiled.", "success");
      } catch (err) {
        Toast.show("Failed to generate weekly debrief: " + err.message, "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🔄</span> Scan & Generate';
      }
    };
  },

  parseMarkdown(md) {
    if (!md) return '';
    let html = md.trim();
    
    html = html.replace(/### (.*)/g, '<h4 style="margin: 1.25rem 0 0.5rem 0; font-size: 1rem; color: var(--primary); font-weight: 700; display: flex; align-items: center; gap: 0.4rem;">$1</h4>');
    html = html.replace(/## (.*)/g, '<h3 style="margin: 1.5rem 0 0.75rem 0; font-size: 1.1rem; color: var(--text); font-weight: 700;">$1</h3>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight: 700; color: var(--text);">$1</strong>');
    html = html.replace(/^[\-*]\s+(.*)/gm, '<div style="display: flex; gap: 0.5rem; margin-bottom: 0.6rem; font-size: 0.88rem; align-items: flex-start; padding-left: 0.25rem;"><span style="color: var(--primary); font-weight: bold; line-height: 1.2;">•</span><div style="color: var(--text); opacity: 0.95; line-height: 1.5; flex: 1;">$1</div></div>');
    
    return html
      .split(/\n\s*\n/)
      .map(p => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('<h') || trimmed.startsWith('<div')) return trimmed;
        return `<p style="margin-bottom: 0.8rem; font-size: 0.88rem; color: var(--text); opacity: 0.95; line-height: 1.55;">${trimmed}</p>`;
      })
      .join('');
  },

  async renderLevel() {
    try {
      const res = await fetch('/api/gamification/xp', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pulse_token') }
      });
      if (!res.ok) return;
      const xp = await res.json();
      const progress = xp.nextXp > 0 ? Math.min(100, ((xp.totalXp % 100) / ((xp.totalXp % 100) + xp.nextXp)) * 100) : 0;

      document.getElementById('progressLevelCircle').textContent = xp.level;
      document.getElementById('progressLevelNum').textContent = xp.level;
      document.getElementById('progressXpTotal').textContent = xp.totalXp;
      document.getElementById('progressXpNext').textContent = xp.nextXp > 0 ? xp.nextXp : 0;
      document.getElementById('progressXpBar').style.width = Math.min(100, progress) + '%';
    } catch {}
  },

  async renderHeatmap() {
    const container = document.getElementById('progressHeatmapContainer');
    if (!container) return;
    try {
      const tasks = await Store.getTasks().catch(() => []);
      const weeks = 20;
      const today = new Date();
      const dayMs = 86400000;

      const dateMap = {};
      for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(today.getTime() - (weeks * 7 - 1 - i) * dayMs);
        const key = d.toISOString().split('T')[0];
        dateMap[key] = { date: d, count: tasks.filter(t => t.completed && t.completedAt && t.completedAt.startsWith(key)).length };
      }

      const maxCount = Math.max(1, ...Object.values(dateMap).map(d => d.count));
      const containerWidth = container.clientWidth || 700;
      const cell = Math.min(15, Math.max(10, Math.floor((containerWidth - 80) / weeks) - 4));
      const gap = Math.max(2, Math.min(4, Math.floor(cell * 0.25)));

      let html = `<div style="display:flex;gap:${gap}px;">`;
      html += `<div style="display:flex;flex-direction:column;gap:${gap}px;padding-top:22px;width:28px;flex-shrink:0;">`;
      ['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach(l => html += `<div style="height:${cell}px;line-height:${cell}px;font-size:9px;color:var(--text-muted);text-align:right;padding-right:4px;">${l}</div>`);
      html += '</div>';

      const monthLabels = [];
      for (let w = 0; w < weeks; w++) {
        const d = new Date(today.getTime() - (weeks - 1 - w) * 7 * dayMs);
        const m = d.toLocaleDateString('en-US', { month: 'short' });
        if (!monthLabels.length || monthLabels[monthLabels.length - 1].m !== m) monthLabels.push({ m, w });
      }

      html += '<div style="flex:1;min-width:0;"><div style="display:flex;gap:'+gap+'px;height:22px;align-items:flex-end;margin-bottom:2px;">';
      for (let w = 0; w < weeks; w++) {
        const ml = monthLabels.find(x => x.w === w);
        html += `<div style="width:${cell}px;text-align:center;font-size:9px;color:var(--text-muted);font-weight:500;flex-shrink:0;">${ml ? ml.m : ''}</div>`;
      }
      html += '</div>';

      for (let day = 0; day < 7; day++) {
        html += `<div style="display:flex;gap:${gap}px;margin-bottom:${gap}px;">`;
        for (let w = 0; w < weeks; w++) {
          const d = new Date(today.getTime() - (weeks * 7 - 1 - (w * 7 + day)) * dayMs);
          const key = d.toISOString().split('T')[0];
          const info = dateMap[key];
          const count = info ? info.count : 0;
          const isFuture = d > today;
          const isToday = !isFuture && d.toDateString() === today.toDateString();
          const intensity = count / maxCount;

          let bg;
          if (isFuture) bg = 'transparent';
          else if (count === 0) bg = 'var(--border)';
          else if (intensity > 0.66) bg = '#059669';
          else if (intensity > 0.33) bg = '#34d399';
          else bg = '#a7f3d0';

          html += `<div title="${key}: ${count} task${count !== 1 ? 's' : ''}" style="width:${cell}px;height:${cell}px;border-radius:3px;background:${bg};${isFuture ? 'border:1px dashed var(--border);' : ''}${isToday ? 'outline:2px solid var(--primary);outline-offset:-2px;' : ''}"></div>`;
        }
        html += '</div>';
      }

      html += '<div style="display:flex;align-items:center;gap:4px;margin-top:8px;font-size:10px;color:var(--text-muted);">';
      html += '<span>Less</span>';
      ['var(--border)', '#a7f3d0', '#34d399', '#059669'].forEach(c => {
        html += `<div style="width:11px;height:11px;border-radius:2px;background:${c};"></div>`;
      });
      html += '<span>More</span></div></div></div>';
      container.innerHTML = html;
    } catch { container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No data available yet</div>'; }
  },

  async renderAchievements() {
    const container = document.getElementById('progressAchievementsList');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Loading achievements...</div>';
    try {
      const res = await fetch('/api/gamification/achievements', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pulse_token') }
      });
      if (!res.ok) { container.innerHTML = ''; return; }
      const ach = await res.json();
      const unlockedKeys = new Set(ach.achievements.map(a => a.key));
      const allKeys = Object.keys(ACHIEVEMENT_ICONS);

      container.innerHTML = allKeys.map(key => {
        const unlocked = unlockedKeys.has(key);
        const a = ach.achievements.find(x => x.key === key);
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;border:1px solid ${unlocked ? 'var(--primary)' : 'var(--border)'};opacity:${unlocked ? 1 : 0.55};">
            <div style="width:44px;height:44px;border-radius:12px;background:${unlocked ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'var(--border)'};display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">${ACHIEVEMENT_ICONS[key] || '🏆'}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:0.9rem;color:var(--text);margin-bottom:2px;">${ACHIEVEMENT_NAMES[key] || a?.title || key}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${unlocked ? '✅ Unlocked ' + new Date(a.unlockedAt).toLocaleDateString() : '🔒 ' + (ACHIEVEMENT_DESC[key] || 'Not yet unlocked')}</div>
            </div>
            ${unlocked ? '<span style="font-size:1.2rem;">✅</span>' : ''}
          </div>`;
      }).join('');
    } catch { container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Could not load achievements</div>'; }
  }
};
