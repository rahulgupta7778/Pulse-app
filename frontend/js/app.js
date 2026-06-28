document.addEventListener('DOMContentLoaded', () => {
  try {
  Store.init();
  Auth.init();
  Reminders.init();
  Toast.init();
  Connections.init();

  const splash = document.getElementById('splashScreen');
  if (splash) {
    const hideSplash = () => {
      splash.classList.add('hidden');
      setTimeout(() => splash.remove(), 600);
    };
    setTimeout(hideSplash, 2000);
    setTimeout(hideSplash, 5000);
  }

  Mood.init();
  const hamburger = document.getElementById('hamburgerBtn');
  const navLinks = document.querySelector('.nav-links');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      hamburger.textContent = navLinks.classList.contains('open') ? '✕' : '☰';
    });
  }

  Goals.setupGoalForm();
  Goals.setupHabitForm();

  document.getElementById('addGoalBtn')?.addEventListener('click', () => Goals.openGoalModal(null));
  document.getElementById('addHabitBtn')?.addEventListener('click', () => Goals.openHabitModal(null));

  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      Utils.showPage(page);
      navLinks.classList.remove('open');
      if (hamburger) hamburger.textContent = '☰';
      document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      if (page === 'dashboard') { await Dashboard.init(); }
      else if (page === 'tasks') await Tasks.init();
      else if (page === 'timetable') await Timetable.init();
      else if (page === 'goals') await Goals.init();
      else if (page === 'analytics') await Analytics.init();
      else if (page === 'progress') await Progress.init();
      else if (page === 'assistant') AIAssistant.init();
    });
  });

  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  const themeToggleMobile = document.getElementById('themeToggleMobile');
  const savedTheme = localStorage.getItem('pulse_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const updateThemeUI = (isDark) => {
    const icon = isDark ? '\uD83C\uDF19' : '\u2600\uFE0F';
    themeToggle.innerHTML = '<span class="toggle-icon">' + icon + '</span>';
    if (themeToggleMobile) {
      themeToggleMobile.textContent = isDark ? 'Dark mode' : 'Light mode';
    }
  };
  updateThemeUI(savedTheme === 'dark');

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pulse_theme', next);
    updateThemeUI(next === 'dark');
  };

  themeToggle.addEventListener('click', toggleTheme);
  if (themeToggleMobile) themeToggleMobile.addEventListener('click', toggleTheme);

  } catch(e) { console.error('Init error:', e); }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    const activePage = document.querySelector('.page.active');
    if (!activePage) return;
    const pageId = activePage.id.replace('page-', '');

    switch (e.key) {
      case 'n':
      case 'N':
        e.preventDefault();
        if (pageId === 'tasks') document.getElementById('addTaskBtn')?.click();
        else if (pageId === 'timetable') document.getElementById('addSlotBtn')?.click();
        else if (pageId === 'goals') {
          if (e.shiftKey) document.getElementById('addHabitBtn')?.click();
          else document.getElementById('addGoalBtn')?.click();
        }
        break;
      case '/':
        e.preventDefault();
        const searchInput = document.getElementById('searchTask');
        if (searchInput) searchInput.focus();
        break;
      case 'f':
      case 'F':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          toggleFocusMode();
        }
        break;
    }
  });

  // Focus mode
  const focusOverlay = document.createElement('div');
  focusOverlay.className = 'focus-overlay';
  focusOverlay.id = 'focusOverlay';
  focusOverlay.innerHTML = `
    <div class="focus-content">
      <h2>○ Focus Mode</h2>
      <p>Eliminate distractions and stay in the zone.</p>
      <div class="focus-time-picker" id="focusTimePicker">
        <button class="focus-time-option" data-minutes="15">15m</button>
        <button class="focus-time-option active" data-minutes="25">25m</button>
        <button class="focus-time-option" data-minutes="45">45m</button>
        <button class="focus-time-option" data-minutes="60">60m</button>
        <button class="focus-time-option" data-minutes="custom">Custom</button>
      </div>
      <div class="focus-custom-time hidden" id="focusCustomTime">
        <input type="number" id="focusCustomMinutes" min="1" max="180" value="30" />
        <span>minutes</span>
      </div>
      <div class="pomodoro-timer" id="focusTimerDisplay">25:00</div>
      <div class="pomodoro-controls">
        <button id="focusPomoStart" class="btn-primary">Start</button>
        <button id="focusPomoPause" class="btn-secondary" disabled>Pause</button>
        <button id="focusPomoSkip" class="btn-sm" style="color:var(--text-muted);">Skip</button>
      </div>
      <p class="focus-sessions">Sessions: <span id="focusPomoSessions">0</span></p>
    </div>`;
  document.body.appendChild(focusOverlay);

  const exitBtn = document.createElement('button');
  exitBtn.className = 'focus-exit-btn';
  exitBtn.id = 'focusExitBtn';
  exitBtn.textContent = '✕ Exit Focus Mode';
  document.body.appendChild(exitBtn);

  let focusPomoInterval = null;
  let focusPomoTime = 25 * 60;
  let focusPomoRunning = false;
  let focusPomoSessions = 0;

  const setFocusTime = (minutes) => {
    if (focusPomoRunning) return;
    focusPomoTime = minutes * 60;
    updateFocusDisplay();
    document.querySelectorAll('.focus-time-option').forEach(b => b.classList.remove('active'));
  };

  const updateFocusDisplay = () => {
    const m = Math.floor(focusPomoTime / 60);
    const s = focusPomoTime % 60;
    document.getElementById('focusTimerDisplay').textContent =
      `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  document.querySelectorAll('.focus-time-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.focus-time-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.minutes;
      if (val === 'custom') {
        document.getElementById('focusCustomTime').classList.remove('hidden');
        return;
      }
      document.getElementById('focusCustomTime').classList.add('hidden');
      setFocusTime(parseInt(val));
    });
  });

  document.getElementById('focusCustomMinutes')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (val > 0) setFocusTime(val);
  });

  const focusPomoStart = () => {
    if (focusPomoRunning) return;
    focusPomoRunning = true;
    document.getElementById('focusPomoStart').disabled = true;
    document.getElementById('focusPomoPause').disabled = false;
    focusPomoInterval = setInterval(() => {
      focusPomoTime--;
      updateFocusDisplay();
      if (focusPomoTime <= 0) {
        clearInterval(focusPomoInterval);
        focusPomoRunning = false;
        focusPomoSessions++;
        document.getElementById('focusPomoSessions').textContent = focusPomoSessions;
        document.getElementById('focusPomoStart').disabled = false;
        document.getElementById('focusPomoPause').disabled = true;
        Toast.success('Focus session complete!');
        Utils.confetti(40);
        const activeOpt = document.querySelector('.focus-time-option.active');
        const mins = activeOpt ? parseInt(activeOpt.dataset.minutes) : 25;
        focusPomoTime = (mins && !isNaN(mins) ? mins : 25) * 60;
        updateFocusDisplay();
      }
    }, 1000);
  };

  const focusPomoPause = () => {
    clearInterval(focusPomoInterval);
    focusPomoRunning = false;
    document.getElementById('focusPomoStart').disabled = false;
    document.getElementById('focusPomoPause').disabled = true;
  };

  const focusPomoSkip = () => {
    clearInterval(focusPomoInterval);
    focusPomoRunning = false;
    document.getElementById('focusPomoStart').disabled = false;
    document.getElementById('focusPomoPause').disabled = true;
    const activeOpt = document.querySelector('.focus-time-option.active');
    const mins = activeOpt ? parseInt(activeOpt.dataset.minutes) : 25;
    focusPomoTime = (mins && !isNaN(mins) ? mins : 25) * 60;
    updateFocusDisplay();
  };

  document.getElementById('focusPomoStart')?.addEventListener('click', focusPomoStart);
  document.getElementById('focusPomoPause')?.addEventListener('click', focusPomoPause);
  document.getElementById('focusPomoSkip')?.addEventListener('click', focusPomoSkip);

  window.toggleFocusMode = async () => {
    const overlay = document.getElementById('focusOverlay');
    const btn = document.getElementById('focusExitBtn');
    const isActive = overlay.classList.toggle('active');
    btn.classList.toggle('active', isActive);
    if (!isActive) {
      focusPomoPause();
    } else {
      const tasks = await Store.getTasks().catch(() => []);
      const top = tasks.filter(t => !t.completed).sort((a, b) => {
        const pa = { urgent: 4, high: 3, medium: 2, low: 1 }[a.priority] || 0;
        const pb = { urgent: 4, high: 3, medium: 2, low: 1 }[b.priority] || 0;
        return pb - pa;
      })[0];
      if (top) {
        const existingSuggestion = document.getElementById('focusSuggestion');
        if (!existingSuggestion) {
          const el = document.createElement('p');
          el.id = 'focusSuggestion';
          el.style.cssText = 'margin-top:0.75rem;font-size:0.8rem;color:var(--text-muted);text-align:center;';
          el.textContent = '💡 Suggested: ' + top.title;
          document.querySelector('.focus-content')?.appendChild(el);
        }
      }
    }
  };

  // Export / Restore
  window.downloadExport = async (url, filename) => {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pulse_token') }
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Download failed'); }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      Toast.error(e.message);
    }
  };

  exitBtn.addEventListener('click', toggleFocusMode);
  focusOverlay.addEventListener('click', (e) => {
    if (e.target === focusOverlay) toggleFocusMode();
  });

  // Add focus mode button
  const focusBtn = document.createElement('button');
  focusBtn.className = 'btn-focus';
  focusBtn.id = 'focusModeBtn';
  focusBtn.innerHTML = '○ Focus';
  focusBtn.title = 'Focus Mode (Ctrl+F)';
  focusBtn.addEventListener('click', toggleFocusMode);
  const headerActions = document.querySelectorAll('.header-actions');
  if (headerActions.length > 0) {
    headerActions[0].appendChild(focusBtn);
  }

  // Onboarding
  const hasSeenOnboarding = localStorage.getItem('pulse_onboarded');
  if (!hasSeenOnboarding) {
    setTimeout(() => showOnboarding(), 600);
  } else {
    setTimeout(() => setupPushNotifications(), 1000);
  }
});

function showOnboarding() {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card">
      <h2>Welcome to Pulse</h2>
      <p class="onboarding-sub">Your AI-powered productivity companion</p>
      <div class="onboarding-steps">
        <div class="onboarding-step">
          <span class="onboarding-num">1</span>
          <div><strong>Add Tasks</strong><br><span>Press <kbd>N</kbd> to quickly create a new task</span></div>
        </div>
        <div class="onboarding-step">
          <span class="onboarding-num">2</span>
          <div><strong>Schedule Smart</strong><br><span>Use the Timetable to define your fixed slots</span></div>
        </div>
        <div class="onboarding-step">
          <span class="onboarding-num">3</span>
          <div><strong>Track Habits</strong><br><span>Build streaks and achieve your weekly goals</span></div>
        </div>
        <div class="onboarding-step">
          <span class="onboarding-num">4</span>
          <div><strong>Stay Focused</strong><br><span>Press <kbd>Ctrl+F</kbd> to enter Focus Mode</span></div>
        </div>
      </div>
      <button id="onboardingDone" class="btn-primary" style="width:100%;">Get Started</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('onboardingDone').addEventListener('click', () => {
    overlay.classList.add('onboarding-exit');
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 400);
    localStorage.setItem('pulse_onboarded', '1');
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('onboarding-exit');
      setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 400);
      localStorage.setItem('pulse_onboarded', '1');
    }
  });

  setupPushNotifications();
}

async function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');

    const existingSub = await reg.pushManager.getSubscription();
    if (existingSub) {
      const token = localStorage.getItem('pulse_token');
      if (token) {
        const raw = existingSub.toJSON();
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ endpoint: raw.endpoint, keys: raw.keys })
        });
      }
      return;
    }

    const configRes = await fetch('/api/config');
    const config = await configRes.json();
    if (!config.vapidPublicKey) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey)
    });

    const token = localStorage.getItem('pulse_token');
    if (token) {
      const raw = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ endpoint: raw.endpoint, keys: raw.keys })
      });
    }
  } catch (e) {
    console.warn('Push subscription failed:', e.message);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}
