const Mood = {
  init() {
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mood = btn.dataset.mood;
        try {
          const data = await api('/mood/log', {
            method: 'POST',
            body: { mood }
          });
          document.querySelectorAll('.mood-btn').forEach(b => {
            b.style.opacity = '0.5';
            b.style.outline = 'none';
          });
          btn.style.opacity = '1';
          btn.style.outline = '2px solid var(--primary)';
          document.getElementById('moodStatus').textContent = 'Logged: ' + btn.textContent;
          Toast.success(`Mood logged: ${data.label || mood} ${data.icon || ''}`);
          if (typeof Dashboard !== 'undefined') {
            await Dashboard.init();
          }
        } catch (err) {
          console.warn('Failed to log mood:', err);
          Toast.error('Failed to log mood');
        }
      });
    });
    this.loadToday();
  },

  async loadToday() {
    if (!localStorage.getItem('pulse_token')) return;
    try {
      const data = await api('/mood/today');
      if (data && data.mood) {
        document.querySelectorAll('.mood-btn').forEach(b => {
          if (b.dataset.mood === data.mood) {
            b.style.opacity = '1';
            b.style.outline = '2px solid var(--primary)';
          } else {
            b.style.opacity = '0.5';
            b.style.outline = 'none';
          }
        });
        document.getElementById('moodStatus').textContent = 'Today\'s mood: ' + (data.moodInfo?.label || data.mood);
      }
    } catch (err) {
      console.warn('Failed to load today\'s mood:', err);
    }
  }
};
