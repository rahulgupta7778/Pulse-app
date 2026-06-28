const AIAssistant = {
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
    document.getElementById('voiceInputBtn').addEventListener('click', () => this.startVoice());
    document.getElementById('voiceBtn').addEventListener('click', () => this.startVoice());

    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('chatInput');
        input.value = btn.dataset.query;
        input.focus();
        if (btn.dataset.mode !== 'prompt') {
          this.sendMessage();
        }
      });
    });

    const quickToggle = document.getElementById('quickToggle');
    const quickGrid = document.getElementById('quickBtnGrid');
    if (quickToggle && quickGrid) {
      quickToggle.addEventListener('click', () => {
        const isOpen = quickGrid.classList.toggle('open');
        quickToggle.classList.toggle('open');
      });
    }
  },

  async sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    this.addMessage(text, 'user');
    input.value = '';

    if (text.toLowerCase().includes('pomodoro') || text.toLowerCase().includes('focus mode')) {
      document.getElementById('pomoStatus').textContent = 'Ready to focus';
      document.getElementById('timerDisplay').textContent = '25:00';
      Analytics.pomodoro.reset();
      this.addMessage("I've opened the Focus Mode timer for you!", 'bot');
      return;
    }

    const [tasks, slots, goals, habits] = await Promise.all([
      Store.getTasks(),
      Store.getSlots(),
      Store.getGoals(),
      Store.getHabits()
    ]);
    const context = { tasks, slots, goals, habits };

    const loadingEl = this.addMessage('Thinking...', 'bot');
    const loadingMsg = loadingEl;

    try {
      const data = await AIService.chat(text, context);
      loadingMsg.remove();
      this.addMessage(data.response, 'bot');

      if (data.actions && data.actions.length > 0) {
        for (const action of data.actions) {
          if (action.type === 'schedule_created') {
            this.renderSchedule(action.data);
          }
        }
        const hasChanges = data.actions.some(a => ['task_added','task_updated','task_deleted','task_toggled','goal_added','habit_added'].includes(a.type));
        if (hasChanges) {
          const activePage = document.querySelector('.page.active');
          const pageId = activePage ? activePage.id.replace('page-', '') : '';
          if (pageId === 'tasks' && typeof Tasks !== 'undefined') Tasks.render();
          if (pageId === 'goals' && typeof Goals !== 'undefined') Goals.render();
          if (pageId === 'dashboard' && typeof Dashboard !== 'undefined') Dashboard.render();
          if (typeof Toast !== 'undefined') {
            const added = data.actions.filter(a => a.type.endsWith('_added'));
            const done = data.actions.filter(a => a.type === 'task_toggled' && a.data.completed);
            if (added.length) Toast.success(`Added ${added.length} item${added.length > 1 ? 's' : ''}!`);
            if (done.length) Toast.success(`Completed ${done.length} task${done.length > 1 ? 's' : ''}!`);
          }
        }
      }
    } catch {
      loadingMsg.remove();
      this.addMessage("Sorry, I couldn't process that. Please try again.", 'bot');
    }
  },

  addMessage(text, sender) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    const escaped = Utils.escapeHtml(text);
    div.innerHTML = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  },

  startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS) {
        this.addMessage("Voice input isn't available on iOS Safari. Use the keyboard's built-in mic or try a different app.", 'bot');
      } else {
        this.addMessage("Voice recognition isn't supported in your browser. Try Chrome on desktop or Android.", 'bot');
      }
      return;
    }

    const voiceBtn = document.getElementById('voiceInputBtn');
    if (voiceBtn.classList.contains('listening')) {
      this._recognition?.abort();
      voiceBtn.classList.remove('listening');
      return;
    }

    this._recognition = new SpeechRecognition();
    this._recognition.lang = 'en-US';
    this._recognition.continuous = true;
    this._recognition.interimResults = true;
    this._recognition.maxAlternatives = 1;

    voiceBtn.classList.add('listening');
    this.addMessage("🎤 Listening... tap the mic again to stop.", 'bot');

    let finalTranscript = '';

    this._recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
    };

    this._recognition.onerror = (event) => {
      voiceBtn.classList.remove('listening');
      this._recognition = null;
      if (event.error === 'no-speech') {
        this.addMessage("I didn't hear anything. Tap the mic and speak.", 'bot');
      } else if (event.error === 'audio-capture') {
        this.addMessage("No microphone found. Check your device settings.", 'bot');
      } else if (event.error === 'not-allowed') {
        this.addMessage("Microphone access was denied. Allow mic access in your browser/device settings.", 'bot');
      } else {
        this.addMessage("Voice input stopped. Try again or type your message.", 'bot');
      }
    };

    this._recognition.onend = () => {
      voiceBtn.classList.remove('listening');
      this._recognition = null;
      if (finalTranscript.trim()) {
        document.getElementById('chatInput').value = finalTranscript.trim();
        this.sendMessage();
      }
    };

    try {
      this._recognition.start();
    } catch {
      voiceBtn.classList.remove('listening');
      this._recognition = null;
      this.addMessage("Couldn't start voice input. Try typing instead.", 'bot');
    }
  },

  renderSchedule(schedule) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'chat-msg bot schedule-timeline';

    const dayName = schedule.dayName || 'Selected day';
    let html = `<div style="background:var(--bg-card);border-radius:var(--radius);padding:12px;margin-top:8px;border:1px solid var(--border);">
      <div style="font-weight:600;margin-bottom:8px;color:var(--text);">📅 ${dayName} — ${schedule.totalTasksScheduled || 0} tasks (${schedule.totalDuration || 0} min)</div>`;

    if (!schedule.schedule || schedule.schedule.length === 0) {
      html += `<div style="color:var(--text-muted);font-size:0.9rem;">No tasks could be scheduled. Add free time slots in your timetable first!</div>`;
    } else {
      schedule.schedule.forEach(item => {
        const badge = { urgent: '🔴', high: '🟡', medium: '🔵', low: '⚪' }[item.priority] || '⚪';
        const title = Utils.escapeHtml(item.title);
        html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.9rem;">
          <span style="color:var(--text-muted);white-space:nowrap;font-variant-numeric:tabular-nums;">${item.startTime}–${item.endTime}</span>
          <span>${badge}</span>
          <span style="color:var(--text);flex:1;">${title}</span>
          <span style="color:var(--text-muted);font-size:0.8rem;">${item.duration}m</span>
        </div>`;
      });
    }

    html += `</div>`;
    div.innerHTML = html;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }
};
