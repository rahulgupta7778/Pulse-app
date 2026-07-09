const Labs = {
  _initialized: false,
  _audioContext: null,
  _audioSource: null,
  _isPlaying: false,

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    // 2. Negotiator
    await this.loadNegotiatorTasks();
    document.getElementById('btnGenerateNegotiation')?.addEventListener('click', () => this.generateNegotiation());
    document.getElementById('btnCopyNegotiation')?.addEventListener('click', () => this.copyNegotiationText());

    // 3. Shadow Calendar
    await this.loadShadowCalendar();
    document.getElementById('shadowCalcInput')?.addEventListener('input', () => this.runShadowCalculator());

    // 4. Life Balance Radar Chart
    this.drawRadarChart();

    // 5. Smart Recurring Task Intelligence
    await this.loadSmartRecurring();

    // 6. "What Would I Lose?" Postpone Analyzer
    await this.loadPostponeTasks();
    document.getElementById('btnAnalyzePostpone')?.addEventListener('click', () => this.analyzePostpone());

    // 7. Ambient Soundscapes
    this.setupSoundscapes();

    // 8. Personal Productivity Twin
    document.getElementById('btnGenerateTwin')?.addEventListener('click', () => this.generateTwin());

    // 9. Integrations Hub Notion/Todoist
    document.getElementById('btnImportWorkspace')?.addEventListener('click', () => this.importWorkspace());

    // 10. WhatsApp/Telegram Bot Simulator
    document.getElementById('botSimSendBtn')?.addEventListener('click', () => this.sendBotMessage());
    document.getElementById('botSimInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendBotMessage();
    });
  },

  // 2. Conflict Negotiator
  async loadNegotiatorTasks() {
    try {
      const tasks = await Store.getTasks();
      const selectA = document.getElementById('negTaskA');
      const selectB = document.getElementById('negTaskB');

      if (!selectA || !selectB) return;

      selectA.innerHTML = '';
      selectB.innerHTML = '';

      if (tasks.length === 0) {
        selectA.innerHTML = '<option value="">(No active tasks found)</option>';
        selectB.innerHTML = '<option value="">(No active tasks found)</option>';
        return;
      }

      tasks.forEach((t, index) => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify({ title: t.title, desc: t.desc || '' });
        opt.textContent = t.title;
        selectA.appendChild(opt);

        const optB = opt.cloneNode(true);
        selectB.appendChild(optB);
      });

      // Select distinct tasks initially if possible
      if (selectB.options.length > 1) {
        selectB.selectedIndex = 1;
      }
    } catch (err) {
      console.error('Error loading negotiator tasks:', err);
    }
  },

  async generateNegotiation() {
    const btn = document.getElementById('btnGenerateNegotiation');
    const selectA = document.getElementById('negTaskA');
    const selectB = document.getElementById('negTaskB');
    const toneSelect = document.getElementById('negTone');
    const resultBox = document.getElementById('negotiationResultBox');

    if (!selectA || !selectB || !selectA.value || !selectB.value) {
      Toast.warning('Please select two tasks to identify conflicts!');
      return;
    }

    const tA = JSON.parse(selectA.value);
    const tB = JSON.parse(selectB.value);

    if (tA.title === tB.title) {
      Toast.warning('Please select two distinct tasks!');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⚡ drafting request with Gemini...';
    }

    try {
      const res = await api('/ai/draft-extension', {
        method: 'POST',
        body: { task1: tA, task2: tB, tone: toneSelect.value }
      });

      document.getElementById('negSubject').textContent = `Subject: ${res.subject}`;
      document.getElementById('negBody').textContent = res.body;
      document.getElementById('negTip').textContent = `💡 Pro-Tip: ${res.tips}`;
      
      resultBox?.classList.remove('hidden');
      Toast.success('Negotiation proposal drafted successfully!');
    } catch (err) {
      Toast.error('Drafting request failed: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Draft Extension Request';
      }
    }
  },

  copyNegotiationText() {
    const subject = document.getElementById('negSubject').textContent;
    const body = document.getElementById('negBody').textContent;
    const fullText = `${subject}\n\n${body}`;

    navigator.clipboard.writeText(fullText).then(() => {
      Toast.success('Email draft copied to clipboard!');
    }).catch(() => {
      Toast.error('Failed to copy text.');
    });
  },

  // 3. Shadow Calendar
  async loadShadowCalendar() {
    try {
      const data = await api('/ai/shadow-calendar');
      const container = document.getElementById('shadowBarsContainer');
      if (!container) return;

      container.innerHTML = '';
      data.categories.forEach(cat => {
        const pct = cat.differencePct > 0 ? cat.differencePct : 0;
        const color = cat.differencePct > 15 ? 'var(--primary)' : 'var(--secondary)';
        
        const row = document.createElement('div');
        row.className = 'shadow-bar-row';
        row.innerHTML = `
          <div class="shadow-bar-labels">
            <strong>${cat.category}</strong>
            <span style="color:${color};font-weight:600;">${cat.factorLabel}</span>
          </div>
          <div class="shadow-bar-track">
            <div class="shadow-bar-estimated" style="width: 50%;"></div>
            <div class="shadow-bar-actual" style="width: ${50 + Math.min(pct / 2, 45)}%; background: ${color};"></div>
          </div>
          <div style="font-size:0.65rem;color:var(--text-muted);display:flex;justify-content:space-between;margin-top:0.1rem;">
            <span>Sched Avg: ${cat.estimated}m</span>
            <span>Focus Avg: ${cat.actual}m</span>
          </div>
        `;
        container.appendChild(row);
      });

      this.runShadowCalculator();
    } catch (err) {
      console.error('Error loading shadow calendar:', err);
    }
  },

  runShadowCalculator() {
    const input = document.getElementById('shadowCalcInput');
    const output = document.getElementById('shadowCalcOutput');
    if (!input || !output) return;

    const val = parseInt(input.value) || 0;
    // Factor study +40%
    const adjusted = Math.round(val * 1.4);
    output.textContent = `${adjusted} mins shadow-adjusted`;
  },

  // 4. Life Balance Radar Chart
  drawRadarChart() {
    const svg = document.getElementById('radarSvg');
    if (!svg) return;

    // Center 100, 100. Radius 70.
    const cx = 100, cy = 100, r = 70;
    const categories = ['Work', 'Health', 'Relations', 'Learning', 'Finance', 'Personal'];
    // Let's fetch some random values that sum beautifully
    const values = [0.85, 0.4, 0.7, 0.9, 0.5, 0.65];

    let svgContent = '';

    // Draw background concentric hexagons
    const levels = [0.25, 0.5, 0.75, 1.0];
    levels.forEach(lvl => {
      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * 2 * Math.PI) / 6 - Math.PI / 2;
        const x = cx + r * lvl * Math.cos(angle);
        const y = cy + r * lvl * Math.sin(angle);
        points.push(`${x},${y}`);
      }
      svgContent += `<polygon points="${points.join(' ')}" class="radar-grid-line" fill="none" />`;
    });

    // Draw diagonal axes
    for (let i = 0; i < 6; i++) {
      const angle = (i * 2 * Math.PI) / 6 - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      svgContent += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-axis" />`;

      // Draw labels
      const labelDist = r + 15;
      const lx = cx + labelDist * Math.cos(angle);
      const ly = cy + labelDist * Math.sin(angle) + 3;
      svgContent += `<text x="${lx}" y="${ly}" class="radar-label">${categories[i]}</text>`;
    }

    // Draw user actual polygon
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i * 2 * Math.PI) / 6 - Math.PI / 2;
      const x = cx + r * values[i] * Math.cos(angle);
      const y = cy + r * values[i] * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    svgContent += `<polygon points="${points.join(' ')}" class="radar-polygon" />`;

    // Draw little circles on nodes
    for (let i = 0; i < 6; i++) {
      const angle = (i * 2 * Math.PI) / 6 - Math.PI / 2;
      const x = cx + r * values[i] * Math.cos(angle);
      const y = cy + r * values[i] * Math.sin(angle);
      svgContent += `<circle cx="${x}" cy="${y}" r="3" fill="var(--primary)" />`;
    }

    svg.innerHTML = svgContent;
  },

  // 5. Smart Recurring Task Intelligence
  async loadSmartRecurring() {
    try {
      const suggestions = await api('/ai/smart-recurring');
      const container = document.getElementById('smartRecContainer');
      if (!container) return;

      container.innerHTML = '';
      suggestions.forEach(s => {
        const item = document.createElement('div');
        item.style.border = '1px solid var(--border)';
        item.style.borderRadius = '6px';
        item.style.padding = '0.5rem';
        item.style.background = 'var(--bg-card)';
        item.style.fontSize = '0.75rem';
        item.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;">
            <strong>${s.title}</strong>
            <span style="font-size:0.65rem;color:var(--success);font-weight:700;">${s.confidence}% Match</span>
          </div>
          <p style="color:var(--text-muted);font-size:0.7rem;line-height:1.25;margin-bottom:0.35rem;">${s.reason}</p>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.65rem;color:var(--text-muted);">From ${s.scheduledTime} ➔ <strong>${s.actualTime}</strong></span>
            <button class="btn-primary btn-sm btn-align-rec" data-id="${s.id}" data-time="${s.actualTime}" style="font-size:0.65rem;padding:2px 8px;">Align</button>
          </div>
        `;
        container.appendChild(item);
      });

      // Bind Align actions
      container.querySelectorAll('.btn-align-rec').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          btn.textContent = 'Syncing...';
          try {
            const res = await api('/ai/align-recurring', {
              method: 'POST',
              body: { id: btn.dataset.id, actualTime: btn.dataset.time }
            });
            Toast.success(res.message);
            btn.parentElement.parentElement.remove();
          } catch {
            Toast.error('Recurring shift failed.');
            btn.disabled = false;
            btn.textContent = 'Align';
          }
        };
      });
    } catch (err) {
      console.error('Error loading recurring intelligence:', err);
    }
  },

  // 6. "What Would I Lose?" Postpone Analyzer
  async loadPostponeTasks() {
    try {
      const tasks = await Store.getTasks();
      const select = document.getElementById('postponeTaskSelect');
      if (!select) return;

      select.innerHTML = '';
      if (tasks.length === 0) {
        select.innerHTML = '<option value="">(No active tasks found)</option>';
        return;
      }

      tasks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title;
        select.appendChild(opt);
      });
    } catch (err) {
      console.error('Error loading postpone tasks:', err);
    }
  },

  async analyzePostpone() {
    const select = document.getElementById('postponeTaskSelect');
    const btn = document.getElementById('btnAnalyzePostpone');
    const resultBox = document.getElementById('postponeResultBox');

    if (!select || !select.value) {
      Toast.warning('Please select a task to analyze postponement!');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = '🧠 Analyzing causal impact...';
    }

    try {
      const res = await api('/ai/postpone-impact', {
        method: 'POST',
        body: { taskId: select.value }
      });

      document.getElementById('postponeStreak').textContent = res.streakRisk;
      document.getElementById('postponeRipple').textContent = res.rippleEffect;
      document.getElementById('postponeGoal').textContent = res.goalImpact;
      document.getElementById('postponeMotivation').textContent = `"${res.motivation}"`;

      resultBox?.classList.remove('hidden');
      Toast.success('AI evaluation complete!');
    } catch (err) {
      Toast.error('Analyzer request failed: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Evaluate Postpone Impact';
      }
    }
  },

  // 7. Ambient Soundscapes
  setupSoundscapes() {
    const selects = document.querySelectorAll('#soundscapeSelect');
    const playBtns = document.querySelectorAll('#btnToggleSoundscape');
    const statusTexts = document.querySelectorAll('#soundscapeStatus');
    const syncCheckboxes = document.querySelectorAll('#soundscapeSyncMood');

    if (playBtns.length === 0) return;

    // Ambient URLs
    const audioUrls = {
      rain: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // reliable sample loops
      lofi: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      binaural: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
      synth: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3'
    };

    const togglePlayback = () => {
      const audioNode = document.getElementById('ambientAudioNode');
      if (!audioNode) return;

      if (this._isPlaying) {
        audioNode.pause();
        this._isPlaying = false;
        playBtns.forEach(btn => btn.textContent = '▶️');
        statusTexts.forEach(txt => txt.textContent = 'Stopped');
      } else {
        const val = selects[0]?.value || 'rain';
        audioNode.src = audioUrls[val];
        audioNode.volume = 0.3;
        
        audioNode.play().then(() => {
          this._isPlaying = true;
          playBtns.forEach(btn => btn.textContent = '⏸️');
          statusTexts.forEach(txt => txt.textContent = 'Playing ' + val.toUpperCase());
        }).catch(err => {
          console.warn('Network audio blocked or failed. Activating Synthesis engine fallback...', err);
          this.playSyntheticNoise(val);
        });
      }
    };

    playBtns.forEach(btn => {
      btn.onclick = togglePlayback;
    });

    selects.forEach(sel => {
      sel.onchange = () => {
        selects.forEach(otherSel => {
          if (otherSel !== sel) otherSel.value = sel.value;
        });
        if (this._isPlaying) {
          this._isPlaying = false;
          togglePlayback();
        }
      };
    });
  },

  playSyntheticNoise(type) {
    try {
      if (!this._audioContext) {
        this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Stop previous synthesis if any
      if (this._audioSource) {
        try { this._audioSource.stop(); } catch {}
      }

      const bufferSize = 2 * this._audioContext.sampleRate;
      const noiseBuffer = this._audioContext.createBuffer(1, bufferSize, this._audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      // Generate pink/white noise for Rain/Binaural
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this._audioContext.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Filter to shape sound (e.g. lowpass filter to sound like soft rain)
      const filter = this._audioContext.createBiquadFilter();
      filter.type = type === 'rain' ? 'lowpass' : 'bandpass';
      filter.frequency.value = type === 'rain' ? 400 : 180;

      const gain = this._audioContext.createGain();
      gain.gain.value = 0.08;

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this._audioContext.destination);

      whiteNoise.start();
      this._audioSource = whiteNoise;
      this._isPlaying = true;

      document.getElementById('btnToggleSoundscape').textContent = '⏸️';
      document.getElementById('soundscapeStatus').textContent = 'Synthesizing ' + type.toUpperCase();
      Toast.success('Activated Real-time Synthetic Audio Generator!');
    } catch (err) {
      console.error('Audio synthesis failed:', err);
      Toast.error('Playback failed. Please allow microphone/audio permissions.');
    }
  },

  // 8. Personal Productivity Twin
  async generateTwin() {
    const btn = document.getElementById('btnGenerateTwin');
    const box = document.getElementById('twinProfileBox');

    if (btn) {
      btn.disabled = true;
      btn.textContent = '🧙‍♂️ Deconstructing your subconscious productivity...';
    }

    try {
      const res = await api('/ai/productivity-twin');
      
      document.getElementById('twinArchetype').textContent = res.archetype;
      document.getElementById('twinBio').textContent = res.bio;
      document.getElementById('twinPeak').textContent = res.peakHour;
      document.getElementById('twinSuper').textContent = res.superpower;
      document.getElementById('twinKryptonite').textContent = res.kryptonite;

      box?.classList.remove('hidden');
      Toast.success('Productivity Twin Persona deconstructed!');
    } catch (err) {
      Toast.error('Twin evaluation failed: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Deconstruct My Twin Persona';
      }
    }
  },

  // 9. Notion / Todoist Import
  async importWorkspace() {
    const textarea = document.getElementById('importRawText');
    const btn = document.getElementById('btnImportWorkspace');
    if (!textarea || !textarea.value.trim()) {
      Toast.warning('Please paste some Notion copy or Todoist export clipboard text!');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = '📥 Parsing workspace schema...';
    }

    try {
      const res = await api('/ai/import-tasks', {
        method: 'POST',
        body: { content: textarea.value }
      });

      Toast.success(`Successfully imported ${res.count} tasks from Notion export!`);
      textarea.value = '';
      
      // Reload and render tasks view and Labs dropdowns
      if (typeof Tasks !== 'undefined' && Tasks.init) {
        Tasks._initialized = false; 
        await Tasks.init();
      }
      await this.loadNegotiatorTasks();
      await this.loadPostponeTasks();
    } catch (err) {
      Toast.error('Import failed: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sync & Sync to Calendar';
      }
    }
  },

  // 10. WhatsApp / Telegram Bot Simulator
  async sendBotMessage() {
    const input = document.getElementById('botSimInput');
    const sendBtn = document.getElementById('botSimSendBtn');
    const container = document.getElementById('botSimMessages');

    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = '';

    // Append user message
    this.appendBotSimBubble(userText, 'user');

    // Create typing bubble
    const typingBubble = this.appendBotSimBubble('✍️ Pulse Bot typing...', 'bot');

    if (sendBtn) sendBtn.disabled = true;

    try {
      const res = await api('/ai/bot-message', {
        method: 'POST',
        body: { message: userText }
      });

      typingBubble.remove();
      this.appendBotSimBubble(res.reply, 'bot');
      
      // If there was an action, sync the apps task lists!
      if (res.action === 'add_task') {
        if (typeof Tasks !== 'undefined' && Tasks.init) {
          Tasks._initialized = false;
          await Tasks.init();
        }
        await this.loadNegotiatorTasks();
        await this.loadPostponeTasks();
      }
    } catch (err) {
      typingBubble.remove();
      this.appendBotSimBubble('⚠️ Connection lost with the bot gateway. Try again in a second.', 'bot');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      container.scrollTop = container.scrollHeight;
    }
  },

  appendBotSimBubble(text, sender) {
    const container = document.getElementById('botSimMessages');
    if (!container) return null;

    const bubble = document.createElement('div');
    bubble.className = `bot-sim-bubble ${sender}`;
    bubble.innerHTML = text;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
  }
};

window.Labs = Labs;
