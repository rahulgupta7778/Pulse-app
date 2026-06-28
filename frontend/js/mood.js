const Mood = {
  init() {
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mood = btn.dataset.mood;
        try {
          const res = await fetch('/api/mood/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('pulse_token') },
            body: JSON.stringify({ mood })
          });
          if (res.ok) {
            document.querySelectorAll('.mood-btn').forEach(b => b.style.opacity = '0.5');
            btn.style.opacity = '1';
            btn.style.outline = '2px solid var(--primary)';
            document.getElementById('moodStatus').textContent = 'Logged: ' + btn.textContent;
          }
        } catch {}
      });
    });
    this.loadToday();
  },

  async loadToday() {
    try {
      const res = await fetch('/api/mood/today', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pulse_token') }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.mood) {
          document.querySelectorAll('.mood-btn').forEach(b => {
            if (b.dataset.mood === data.mood) {
              b.style.opacity = '1';
              b.style.outline = '2px solid var(--primary)';
            } else {
              b.style.opacity = '0.5';
            }
          });
          document.getElementById('moodStatus').textContent = 'Today\'s mood: ' + (data.moodInfo?.label || data.mood);
        }
      }
    } catch {}
  }
};
