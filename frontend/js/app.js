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
    const landingThemeBtn = document.getElementById('landingThemeBtn');
    if (landingThemeBtn) {
      landingThemeBtn.textContent = isDark ? '🌙' : '☀️';
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
  
  const landingThemeBtn = document.getElementById('landingThemeBtn');
  if (landingThemeBtn) {
    landingThemeBtn.addEventListener('click', toggleTheme);
  }

  initLandingPlayground();

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
      <div class="pomodoro-controls" style="margin-bottom: 1.5rem;">
        <button id="focusPomoStart" class="btn-primary">Start</button>
        <button id="focusPomoPause" class="btn-secondary" disabled>Pause</button>
        <button id="focusPomoSkip" class="btn-sm" style="color:var(--text-muted);">Skip</button>
      </div>
      <p class="focus-sessions" style="margin-bottom: 1.5rem;">Sessions: <span id="focusPomoSessions">0</span></p>
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

function initLandingPlayground() {
  // --- Tabs Switching Logic ---
  const tabs = document.querySelectorAll('.playground-tab');
  const contents = document.querySelectorAll('.playground-tab-content');
  if (tabs.length === 0) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const targetContent = document.getElementById(`tabContent-${target}`);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // --- Tab 1: Cognitive Load Guard Logic ---
  const toggleTasks = document.getElementById('toggleWorkloadTasks');
  const toggleEvents = document.getElementById('toggleWorkloadEvents');
  const toggleEnergy = document.getElementById('toggleWorkloadEnergy');
  
  const gaugePercent = document.getElementById('gaugeDisplayPercent');
  const gaugeFill = document.getElementById('gaugeRingFill');
  const gaugeStatus = document.getElementById('gaugeStatusText');
  const gaugeAdvice = document.getElementById('gaugeAdviceText');

  const updateGauge = () => {
    if (!gaugePercent) return;
    let load = 20; // Base load
    if (toggleTasks && toggleTasks.checked) load += 35;
    if (toggleEvents && toggleEvents.checked) load += 25;
    if (toggleEnergy && toggleEnergy.checked) load += 15;

    gaugePercent.textContent = `${load}%`;
    
    // SVG DashOffset Calculation (dasharray is 126 representing half a circle radius 40 -> circumference 2*pi*r = 251.3, half is ~126)
    // Offset ranges from 126 (0%) to 0 (100%)
    const maxDash = 126;
    const offset = maxDash - (load / 100) * maxDash;
    if (gaugeFill) {
      gaugeFill.style.strokeDashoffset = offset;
      // Change color based on load level
      if (load < 40) {
        gaugeFill.style.stroke = '#4ade80'; // Green
      } else if (load < 75) {
        gaugeFill.style.stroke = '#818cf8'; // Indigo
      } else {
        gaugeFill.style.stroke = '#ef4444'; // Red
      }
    }

    // Update status tag and advice
    if (gaugeStatus && gaugeAdvice) {
      gaugeStatus.className = 'gauge-status-tag';
      if (load < 40) {
        gaugeStatus.classList.add('status-optimal');
        gaugeStatus.textContent = 'Optimal Flow';
        gaugeAdvice.textContent = 'Fantastic! Your mental load is low and physical energy is high. This is the perfect window to tackle high-concept designing or creative projects.';
      } else if (load < 75) {
        gaugeStatus.classList.add('status-balanced');
        gaugeStatus.textContent = 'Moderate Load';
        gaugeAdvice.textContent = 'Your cognitive energy is well-balanced. You can maintain steady progress, but remember to schedule a short breath session in 30 minutes.';
      } else {
        gaugeStatus.classList.add('status-overload');
        gaugeStatus.textContent = 'Overload Warning';
        gaugeAdvice.textContent = 'Warning: Low subjective energy combined with complex deadlines is causing mental strain. Pulse recommends activating "Auto-Relieve Breath Loops" immediately.';
      }
    }
  };

  [toggleTasks, toggleEvents, toggleEnergy].forEach(toggle => {
    if (toggle) toggle.addEventListener('change', updateGauge);
  });
  updateGauge();

  // --- Tab 2: Smart AI Task Parser Logic ---
  const parserInput = document.getElementById('playgroundParserInput');
  const parseTitle = document.getElementById('parseTitle');
  const parseDate = document.getElementById('parseDate');
  const parsePriority = document.getElementById('parsePriority');
  const parseCategory = document.getElementById('parseCategory');
  const presetBtns = document.querySelectorAll('.parser-preset-btn');

  const runParser = (text) => {
    if (!text) return;
    
    // Simulated live parser
    let title = text;
    let priority = 'Medium';
    let category = 'Work';
    let date = 'No deadline';

    // Remove tags from title
    title = title.replace(/!high|!medium|!low|!urgent/gi, '')
                 .replace(/#work|#study|#health|#personal|#finance|#other/gi, '')
                 .trim();

    // Check Priority
    if (text.toLowerCase().includes('!urgent') || text.toLowerCase().includes('!high')) {
      priority = 'High';
      if (parsePriority) {
        parsePriority.textContent = 'High';
        parsePriority.className = 'preview-tag tag-urgent';
      }
    } else if (text.toLowerCase().includes('!low')) {
      priority = 'Low';
      if (parsePriority) {
        parsePriority.textContent = 'Low';
        parsePriority.className = 'preview-tag tag-low';
      }
    } else {
      priority = 'Medium';
      if (parsePriority) {
        parsePriority.textContent = 'Medium';
        parsePriority.className = 'preview-tag tag-medium';
      }
    }

    // Check Category
    if (text.toLowerCase().includes('#health')) {
      category = 'Health';
      if (parseCategory) {
        parseCategory.textContent = 'Health';
        parseCategory.className = 'preview-tag tag-health';
      }
    } else if (text.toLowerCase().includes('#study')) {
      category = 'Study';
      if (parseCategory) {
        parseCategory.textContent = 'Study';
        parseCategory.className = 'preview-tag tag-study';
      }
    } else if (text.toLowerCase().includes('#personal')) {
      category = 'Personal';
      if (parseCategory) {
        parseCategory.textContent = 'Personal';
        parseCategory.className = 'preview-tag tag-personal';
      }
    } else {
      category = 'Work';
      if (parseCategory) {
        parseCategory.textContent = 'Work';
        parseCategory.className = 'preview-tag tag-work';
      }
    }

    // Extrapolate due dates
    if (text.toLowerCase().includes('by friday') || text.toLowerCase().includes('friday')) {
      date = 'Friday, 12:00 PM';
    } else if (text.toLowerCase().includes('tomorrow')) {
      date = 'Tomorrow, 9:00 AM';
    } else if (text.toLowerCase().includes('daily')) {
      date = 'Recurring Daily';
    } else if (text.toLowerCase().includes('tonight')) {
      date = 'Tonight, 8:00 PM';
    } else {
      date = 'No specific deadline';
    }

    if (parseTitle) parseTitle.textContent = title || 'Untitled Task';
    if (parseDate) parseDate.textContent = date;
  };

  if (parserInput) {
    parserInput.addEventListener('input', (e) => runParser(e.target.value));
  }

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const txt = btn.dataset.text;
      if (parserInput) parserInput.value = txt;
      runParser(txt);
    });
  });

  // --- Tab 3: Guided Focus Breath Logic ---
  const breathBtn = document.getElementById('btnPlaygroundBreath');
  const breathSphere = document.getElementById('playgroundBreathSphere');
  const breathText = document.getElementById('playgroundBreathText');
  const breathInst = document.getElementById('playgroundBreathInst');
  const breathTimer = document.getElementById('playgroundBreathTimer');

  let breathInterval = null;
  let isBreathingActive = false;
  let breathCycle = 0; // 0 = inhale, 1 = hold, 2 = exhale

  const startBreathing = () => {
    isBreathingActive = true;
    if (breathBtn) {
      breathBtn.textContent = 'Stop Breathing';
      breathBtn.classList.add('landing-btn-secondary');
      breathBtn.classList.remove('landing-btn-primary');
    }

    let seconds = 240; // 4 mins
    
    const tick = () => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      if (breathTimer) {
        breathTimer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} remaining`;
      }
      seconds--;
      if (seconds < 0) stopBreathing();
    };

    tick();
    breathInterval = setInterval(tick, 1000);

    // Breath rhythm simulation (4s inhale, 4s hold, 4s exhale)
    const runCycle = () => {
      if (!isBreathingActive) return;
      if (breathCycle === 0) {
        if (breathText) breathText.textContent = 'Inhale';
        if (breathInst) breathInst.textContent = 'Fill your lungs slowly and synchronize with the expanding core...';
        if (breathSphere) {
          breathSphere.classList.add('breath-inhale');
          const outer = document.querySelector('.breath-sphere-outer');
          if (outer) outer.classList.add('breath-inhale-outer');
        }
        breathCycle = 1;
        this._breathTimeout1 = setTimeout(runCycle, 4000);
      } else if (breathCycle === 1) {
        if (breathText) breathText.textContent = 'Hold';
        if (breathInst) breathInst.textContent = 'Hold your breath calmly. Settle your awareness.';
        // Stop scaling, hold size
        breathCycle = 2;
        this._breathTimeout2 = setTimeout(runCycle, 4000);
      } else {
        if (breathText) breathText.textContent = 'Exhale';
        if (breathInst) breathInst.textContent = 'Exhale gently, releasing any residual cognitive tension...';
        if (breathSphere) {
          breathSphere.classList.remove('breath-inhale');
          const outer = document.querySelector('.breath-sphere-outer');
          if (outer) outer.classList.remove('breath-inhale-outer');
        }
        breathCycle = 0;
        this._breathTimeout3 = setTimeout(runCycle, 4000);
      }
    };

    breathCycle = 0;
    runCycle();
  };

  const stopBreathing = () => {
    isBreathingActive = false;
    clearInterval(breathInterval);
    if (this._breathTimeout1) clearTimeout(this._breathTimeout1);
    if (this._breathTimeout2) clearTimeout(this._breathTimeout2);
    if (this._breathTimeout3) clearTimeout(this._breathTimeout3);
    if (breathBtn) {
      breathBtn.textContent = 'Start Breathing Session';
      breathBtn.classList.remove('landing-btn-secondary');
      breathBtn.classList.add('landing-btn-primary');
    }
    if (breathText) breathText.textContent = 'Click Start';
    if (breathInst) breathInst.textContent = 'Align your breathing with the rhythm of the expanding circle.';
    if (breathTimer) breathTimer.textContent = '04:00 remaining';
    if (breathSphere) {
      breathSphere.classList.remove('breath-inhale');
      const outer = document.querySelector('.breath-sphere-outer');
      if (outer) outer.classList.remove('breath-inhale-outer');
    }
  };

  if (breathBtn) {
    breathBtn.addEventListener('click', () => {
      if (isBreathingActive) stopBreathing();
      else startBreathing();
    });
  }

  // --- Tab 4: Platform Sync Hub Logic ---
  const syncBtnGmail = document.getElementById('btnToggleSyncGmail');
  const syncBtnGtasks = document.getElementById('btnToggleSyncGtasks');
  const syncBtnGmeet = document.getElementById('btnToggleSyncGmeet');
  const syncBtnGcal = document.getElementById('btnToggleSyncGcal');

  const cardGmail = document.getElementById('syncCardGmail');
  const cardGtasks = document.getElementById('syncCardGtasks');
  const cardGmeet = document.getElementById('syncCardGmeet');
  const cardGcal = document.getElementById('syncCardGcal');

  const statusGmail = document.getElementById('gmailStatusText');
  const statusGtasks = document.getElementById('gtasksStatusText');
  const statusGmeet = document.getElementById('gmeetStatusText');
  const statusGcal = document.getElementById('gcalStatusText');

  const syncFeed = document.getElementById('playgroundSyncFeed');

  const appendFeed = (text, type = 'system') => {
    if (!syncFeed) return;
    const row = document.createElement('div');
    row.className = `feed-row ${type}-msg`;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    row.innerHTML = `[${timeStr}] ${text}`;
    syncFeed.appendChild(row);
    syncFeed.scrollTop = syncFeed.scrollHeight;
  };

  const toggleSync = (btn, card, status, name, successMsg) => {
    if (!card || !status || !btn) return;
    const isActive = card.classList.contains('active');
    
    if (isActive) {
      card.classList.remove('active');
      status.textContent = 'Not connected';
      btn.textContent = 'Connect';
      appendFeed(`Disconnected ${name}. Active syncing paused.`, 'alert');
    } else {
      card.classList.add('active');
      status.textContent = 'Connected (Active)';
      btn.textContent = 'Disconnect';
      appendFeed(`${name} authorization approved. Establishing secure API handshakes...`, 'system');
      setTimeout(() => {
        appendFeed(successMsg, 'sync');
      }, 800);
    }
  };

  if (syncBtnGmail) {
    syncBtnGmail.addEventListener('click', () => {
      toggleSync(syncBtnGmail, cardGmail, statusGmail, 'Gmail Inbox', 'Gmail sync successful: 4 urgent thread action items parsed into high-priority tasks. Cognitive Load updated!');
    });
  }
  if (syncBtnGtasks) {
    syncBtnGtasks.addEventListener('click', () => {
      toggleSync(syncBtnGtasks, cardGtasks, statusGtasks, 'Google Tasks', 'Google Tasks bi-directional sync completed: 7 active tasks synchronized with Pulse checklist.');
    });
  }
  if (syncBtnGmeet) {
    syncBtnGmeet.addEventListener('click', () => {
      toggleSync(syncBtnGmeet, cardGmeet, statusGmeet, 'Google Meet', 'Google Meet integration active: Synced 2 video conferencing sessions. Smart links and focus blocks generated.');
    });
  }
  if (syncBtnGcal) {
    syncBtnGcal.addEventListener('click', () => {
      toggleSync(syncBtnGcal, cardGcal, statusGcal, 'Google Calendar', 'Google Calendar synchronized: 3 upcoming schedule slots retrieved. Auto-detecting timetable collisions...');
    });
  }
}
