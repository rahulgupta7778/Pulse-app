const ACHIEVEMENT_ICONS = {
  first_task: '🌱', task_10: '⚡', task_50: '🔥', task_100: '💎',
  streak_7: '📅', streak_30: '📆',
  first_goal: '🎯', goal_done: '🏆',
  early_bird: '🌅', focused: '🧘',
  organized: '📋', connected: '🔗',
  night_owl: '🦉', deep_work: '🧠',
  high_achiever: '⭐', habit_champion: '👑',
  architect: '🏗️', overachiever: '🏅'
};

const ACHIEVEMENT_NAMES = {
  first_task: 'First Task', task_10: 'Task Machine', task_50: 'Productivity Pro', task_100: 'Centurion',
  streak_7: 'Week Warrior', streak_30: 'Monthly Master',
  first_goal: 'Goal Setter', goal_done: 'Goal Crusher',
  early_bird: 'Early Bird', focused: 'Laser Focus',
  organized: 'Well Organized', connected: 'Well Connected',
  night_owl: 'Night Owl', deep_work: 'Deep Work Master',
  high_achiever: 'High Achiever', habit_champion: 'Habit Champion',
  architect: 'Time Architect', overachiever: 'Goal Master'
};

const Gamification = {
  async load() {
    try {
      const [xpRes, achRes] = await Promise.all([
        fetch('/api/gamification/xp', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pulse_token') } }),
        fetch('/api/gamification/achievements', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pulse_token') } })
      ]);
      if (!xpRes.ok) return;
      const xp = await xpRes.json();
      const ach = await achRes.json();

      const el = document.getElementById('gamificationBadge');
      if (el) {
        const xpInLevel = xp.totalXp;
        const xpForNext = xp.nextXp > 0 ? xp.nextXp : 100;
        const progress = xp.nextXp > 0 ? Math.min(100, ((xpInLevel % 100) / (xpInLevel % 100 + xpForNext)) * 100) : 0;
        el.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--bg-card);border-radius:12px;border:1px solid var(--border);">
            <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#ef4444);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;color:#fff;flex-shrink:0;">${xp.level}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-weight:600;font-size:0.9rem;color:var(--text);">Level ${xp.level}</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">${xp.totalXp} XP</span>
              </div>
              <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(100, progress)}%;background:linear-gradient(90deg,#f59e0b,#ef4444);border-radius:3px;transition:width 0.6s ease;"></div>
              </div>
            </div>
          </div>`;
      }

      const achContainer = document.getElementById('achievementsList');
      if (achContainer) {
        const unlockedKeys = new Set(ach.achievements.map(a => a.key));
        const allKeys = Object.keys(ACHIEVEMENT_NAMES);
        achContainer.innerHTML = allKeys.map(key => {
          const unlocked = unlockedKeys.has(key);
          const a = ach.achievements.find(x => x.key === key);
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:${unlocked ? 'var(--bg-card)' : 'transparent'};border:1px solid ${unlocked ? 'var(--border)' : 'var(--border)'};opacity:${unlocked ? 1 : 0.4};">
              <span style="font-size:1.3rem;">${ACHIEVEMENT_ICONS[key] || '🏆'}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:500;font-size:0.85rem;color:var(--text);">${ACHIEVEMENT_NAMES[key] || key}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">${unlocked ? 'Unlocked ' + new Date(a.unlockedAt).toLocaleDateString() : 'Not yet unlocked'}</div>
              </div>
              ${unlocked ? '<span style="font-size:0.8rem;">✅</span>' : '<span style="font-size:0.8rem;color:var(--text-muted);">🔒</span>'}
            </div>`;
        }).join('');
      }
    } catch {}
  }
};
