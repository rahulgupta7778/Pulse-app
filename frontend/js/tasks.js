const Tasks = {
  currentFilter: 'all',
  _initialized: false,

  async init() {
    if (this._initialized) { await this.render(); return; }
    this._initialized = true;

    document.getElementById('addTaskBtn').addEventListener('click', () => this.openModal());

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        await this.render();
      });
    });

    document.getElementById('searchTask').addEventListener('input', () => this.render());

    document.getElementById('taskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveTask();
    });

    document.getElementById('aiBreakdownBtn').addEventListener('click', () => this.generateSubtasks());

    document.querySelectorAll('.modal-close').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      });
    });
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) e.target.classList.add('hidden');
    });

    // NL parser
    const nlParseBtn = document.getElementById('nlParseBtn');
    if (nlParseBtn) {
      nlParseBtn.onclick = async () => {
        const input = document.getElementById('nlTaskInput');
        if (!input || !input.value.trim()) {
          Toast.warning('Please enter some text to parse!');
          return;
        }
        nlParseBtn.disabled = true;
        nlParseBtn.innerHTML = 'Parsing...';
        try {
          const res = await AIService.parseTask(input.value.trim());
          this.openModal(null, res);
          Toast.success('Task details parsed with AI!');
          input.value = '';
        } catch (err) {
          Toast.error('AI parsing failed: ' + err.message);
        } finally {
          nlParseBtn.disabled = false;
          nlParseBtn.innerHTML = 'Parse with AI';
        }
      };
    }

    // Voice recognition
    const nlVoiceBtn = document.getElementById('nlVoiceBtn');
    if (nlVoiceBtn) {
      let recognition = null;
      let isRecording = false;
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          isRecording = true;
          nlVoiceBtn.classList.add('listening');
          Toast.info("Listening... Speak now.");
        };

        recognition.onresult = (event) => {
          if (event.results && event.results.length > 0) {
            const transcript = event.results[0][0].transcript;
            const input = document.getElementById('nlTaskInput');
            if (input) {
              input.value = transcript;
              Toast.success("Voice input captured!");
            }
          }
        };

        recognition.onerror = (event) => {
          console.error("Speech Recognition Error:", event.error);
          if (event.error === 'not-allowed') {
            Toast.error("Microphone access denied. Please allow microphone access in your browser settings.");
          } else if (event.error === 'no-speech') {
            Toast.warning("No speech detected. Please try again.");
          } else {
            Toast.error("Voice input error: " + (event.error || "failed"));
          }
        };

        recognition.onend = () => {
          isRecording = false;
          nlVoiceBtn.classList.remove('listening');
        };
      }

      nlVoiceBtn.onclick = () => {
        if (!recognition) {
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
          if (isIOS) {
            Toast.warning("Voice input isn't available on iOS Safari. Try a different browser.");
          } else {
            Toast.warning("Voice recognition is not supported in this browser");
          }
          return;
        }
        if (isRecording) {
          try {
            recognition.stop();
          } catch (e) {}
        } else {
          try {
            recognition.start();
          } catch (e) {
            console.error("Failed to start recognition:", e);
            Toast.error("Could not start microphone. Try again.");
          }
        }
      };
    }

    await this.render();
  },

  getFilteredTasks(tasks) {
    const search = document.getElementById('searchTask').value.trim().toLowerCase();
    let filtered = tasks;
    if (search) filtered = filtered.filter(t => t.title.toLowerCase().includes(search));

    const f = this.currentFilter;
    if (f === 'all') return filtered;
    if (f === 'today') return filtered.filter(t => t.dueDate && Utils.isToday(t.dueDate));
    if (f === 'upcoming') return filtered.filter(t => !t.completed && t.dueDate && !Utils.isToday(t.dueDate) && !Utils.isOverdue(t.dueDate));
    if (f === 'overdue') return filtered.filter(t => !t.completed && t.dueDate && Utils.isOverdue(t.dueDate));
    if (f === 'completed') return filtered.filter(t => t.completed);
    return filtered;
  },

  async render() {
    const container = document.getElementById('taskList');
    try {
      const allTasks = await Store.getTasks();
      const tasks = this.getFilteredTasks(allTasks);

    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"></div>
          <p>No tasks found</p>
          <button class="btn-primary" onclick="Tasks.openModal()">Add a Task</button>
        </div>
      `;
      return;
    }

    container.innerHTML = tasks.map((t, i) => {
      const isOverdue = !t.completed && t.dueDate && Utils.isOverdue(t.dueDate);
      const isDueToday = !t.completed && t.dueDate && Utils.isToday(t.dueDate);
      let dueClass = '';
      if (isOverdue) dueClass = 'overdue';
      else if (isDueToday) dueClass = 'due-today';
      const title = Utils.escapeHtml(t.title);
      const priority = Utils.escapeHtml(t.priority);
      const category = t.category ? Utils.escapeHtml(t.category) : '';
      const source = t.source ? Utils.escapeHtml(t.source) : '';
      const location = t.location ? Utils.escapeHtml(t.location) : '';
      const links = t.links || '';
      const externalUrl = t.externalUrl ? Utils.escapeHtml(t.externalUrl) : '';

      return `
        <div class="task-card ${t.completed ? 'completed' : ''}" draggable="true" data-id="${t.id}" data-index="${i}">
          <div class="task-drag-handle">⋮⋮</div>
          <div class="task-checkbox ${t.completed ? 'checked' : ''}" data-id="${t.id}">${t.completed ? '✓' : ''}</div>
          <div class="task-info">
            <h3>${title}</h3>
            <div class="task-meta">
              <span class="task-tag ${priority}">${priority}</span>
              ${category ? `<span class="task-category">${category}</span>` : ''}
              ${source && t.source !== 'manual' ? `<span class="task-source ${source}">${source}</span>` : ''}
              ${t.dueDate ? `<span class="task-due ${dueClass}">${Utils.formatDate(t.dueDate)}${t.dueTime ? ' ' + t.dueTime : ''}</span>` : ''}
              ${t.collaboratorEmail ? `<span class="task-collaborator" style="background: rgba(14, 165, 233, 0.15); color: #0ea5e9; font-weight: 500; font-size: 0.72rem; padding: 0.1rem 0.4rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.2rem;">👥 ${Utils.escapeHtml(t.collaboratorEmail)}</span>` : ''}
            </div>
            ${location ? `<div class="task-location">📍 ${location}</div>` : ''}
            ${links ? `<div class="task-links">${links.split(/[\n,]/).map(u => u.trim()).filter(Boolean).map(u => {
              if (u.startsWith('http')) {
                const host = u.replace('https://','').replace('http://','').split('/')[0];
                return `<a href="${Utils.escapeHtml(u)}" target="_blank" rel="noopener">🔗 ${Utils.escapeHtml(host)}</a>`;
              }
              return Utils.escapeHtml(u);
            }).join(' · ')}</div>` : ''}
          </div>
          <div class="task-actions">
            ${externalUrl && t.source === 'google_calendar' ? `<a href="${externalUrl}" target="_blank" class="join-btn" title="Join">▶</a>` : ''}
            <button class="edit-btn" data-id="${t.id}">✏️</button>
            <button class="delete-btn" data-id="${t.id}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    this._setupDragDrop(container);

    container.querySelectorAll('.task-checkbox').forEach(el => {
      el.addEventListener('click', async () => {
        const taskId = el.dataset.id;
        const task = allTasks.find(t => t.id === taskId);
        const wasCompleted = task?.completed;
        await Store.toggleTask(taskId);
        if (!wasCompleted) {
          Toast.success('Task completed!');
          Utils.confetti(40);
        }
        await this.render();
        await Dashboard.init();
      });
    });
    container.querySelectorAll('.edit-btn').forEach(el => {
      el.addEventListener('click', () => this.openModal(el.dataset.id));
    });
    container.querySelectorAll('.delete-btn').forEach(el => {
      el.addEventListener('click', async () => {
        const taskId = el.dataset.id;
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;
        await Store.deleteTask(taskId);
        const toast = Toast.undo('Task deleted', async () => {
          await Store.addTask(task);
          await this.render();
          await Dashboard.init();
          Toast.success('Task restored');
        });
        await this.render();
        await Dashboard.init();
      });
    });
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>Something went wrong: ${Utils.escapeHtml(err.message)}</p><button class="btn-primary" onclick="Tasks.openModal()">Add a Task</button></div>`;
    }
  },

  _setupDragDrop(container) {
    let dragSrcEl = null;

    container.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        dragSrcEl = card;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('task-dragging');
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const after = card.getBoundingClientRect().top + card.offsetHeight / 2 < e.clientY;
        card.classList.add(after ? 'task-drop-after' : 'task-drop-before');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('task-drop-before', 'task-drop-after');
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('task-drop-before', 'task-drop-after');
        if (dragSrcEl === card) return;

        const cards = [...container.querySelectorAll('.task-card')];
        const fromIdx = cards.indexOf(dragSrcEl);
        const toIdx = cards.indexOf(card);
        if (fromIdx < 0 || toIdx < 0) return;

        if (fromIdx < toIdx) {
          card.parentNode.insertBefore(dragSrcEl, card.nextSibling);
        } else {
          card.parentNode.insertBefore(dragSrcEl, card);
        }

        const reordered = [...container.querySelectorAll('.task-card')].map(c => c.dataset.id);
        try {
          await Store.reorderTasks(reordered);
        } catch {}
      });

      card.addEventListener('dragend', () => {
        container.querySelectorAll('.task-card').forEach(c => {
          c.classList.remove('task-dragging', 'task-drop-before', 'task-drop-after');
        });
        dragSrcEl = null;
      });
    });
  },

  openModal(id, prefillData = null) {
    const form = document.getElementById('taskForm');
    form.reset();
    document.getElementById('taskId').value = '';

    const colabInput = document.getElementById('taskCollaborator');
    if (colabInput) colabInput.value = '';

    MediaHelper.setupLocationField('taskLocation', 'taskLocationField');
    MediaHelper.setupLinksField('taskLinks', 'taskLinksField');

    if (prefillData) {
      document.getElementById('taskModalTitle').textContent = 'New Task (AI Parsed)';
      document.getElementById('taskTitle').value = prefillData.title || '';
      document.getElementById('taskDesc').value = prefillData.desc || '';
      document.getElementById('taskPriority').value = prefillData.priority || 'medium';
      document.getElementById('taskDueDate').value = prefillData.dueDate || Utils.formatDateInput(new Date());
      document.getElementById('taskDueTime').value = prefillData.dueTime || '';
      document.getElementById('taskDuration').value = prefillData.duration || 30;
      document.getElementById('taskCategory').value = prefillData.category || 'work';
      const loc = document.getElementById('taskLocation');
      if (loc) loc.value = prefillData.location || '';
      const links = document.getElementById('taskLinks');
      if (links) links.value = prefillData.links || '';
      if (colabInput && prefillData.collaboratorEmail) colabInput.value = prefillData.collaboratorEmail;
    } else if (id) {
      Store.getTasks().then(tasks => {
        const task = tasks.find(t => t.id === id);
        if (!task) return;
        document.getElementById('taskModalTitle').textContent = 'Edit Task';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDesc').value = task.desc || '';
        document.getElementById('taskPriority').value = task.priority;
        document.getElementById('taskDueDate').value = task.dueDate || '';
        document.getElementById('taskDueTime').value = task.dueTime || '';
        document.getElementById('taskDuration').value = task.duration || 30;
        document.getElementById('taskCategory').value = task.category || 'work';
        const loc = document.getElementById('taskLocation');
        if (loc) loc.value = task.location || '';
        const links = document.getElementById('taskLinks');
        if (links) links.value = task.links || '';
        if (colabInput) colabInput.value = task.collaboratorEmail || '';
      });
    } else {
      document.getElementById('taskModalTitle').textContent = 'New Task';
      document.getElementById('taskDueDate').value = Utils.formatDateInput(new Date());
    }
    Utils.showModal('taskModal');
  },

  async saveTask() {
    const id = document.getElementById('taskId').value;
    const data = {
      title: document.getElementById('taskTitle').value.trim(),
      desc: document.getElementById('taskDesc').value.trim(),
      priority: document.getElementById('taskPriority').value,
      dueDate: document.getElementById('taskDueDate').value || null,
      dueTime: document.getElementById('taskDueTime').value || null,
      duration: parseInt(document.getElementById('taskDuration').value) || 30,
      category: document.getElementById('taskCategory').value,
      location: document.getElementById('taskLocation').value.trim(),
      links: document.getElementById('taskLinks').value.trim(),
      collaboratorEmail: document.getElementById('taskCollaborator') ? document.getElementById('taskCollaborator').value.trim() || null : null
    };
    if (!data.title) { Toast.warning('Please enter a task title'); return; }
    try {
      if (id) {
        await Store.updateTask(id, data);
        Toast.success('Task updated');
      } else {
        await Store.addTask(data);
        Toast.success('Task created');
      }
      Utils.hideModal('taskModal');
      await this.render();
      await Dashboard.init();
      // Reload Pomodoro tasks dropdown as well!
      if (typeof Dashboard !== 'undefined' && Dashboard.pomodoro && typeof Dashboard.pomodoro.loadTasksDropdown === 'function') {
        await Dashboard.pomodoro.loadTasksDropdown();
      }
    } catch (err) {
      Toast.error('Failed to save task: ' + err.message);
    }
  },

  async generateSubtasks() {
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) { Toast.warning('Enter a task title first!'); return; }
    const desc = document.getElementById('taskDesc').value.trim();
    const subtasks = await AIService.generateSubtasks(title, desc);
    const current = document.getElementById('taskDesc').value;
    document.getElementById('taskDesc').value = (current ? current + '\n\n' : '') + 'Subtasks:\n' + subtasks.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }
};
