const Timetable = {
  currentDay: new Date().getDay(),
  _initialized: false,

  /* Time bands: label, startHour, hourCount */
  bands: [
    { id: 'morning',  label: 'Morning',   start: 6,  hours: 6  },
    { id: 'afternoon', label: 'Afternoon', start: 12, hours: 6  },
    { id: 'evening',  label: 'Evening',   start: 18, hours: 6  },
    { id: 'night',    label: 'Night',     start: 0,  hours: 6  }
  ],

  async init() {
    if (this._initialized) { await this.renderSlots(); await this.renderCanvas(); return; }
    this._initialized = true;

    document.getElementById('addSlotBtn').addEventListener('click', () => this.openSlotModal());
    document.getElementById('optimizeDayBtn').addEventListener('click', () => this.optimizeDay());
    document.getElementById('slotForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveSlot();
    });

    // Planner Drawer triggers
    const openBtn = document.getElementById('openPlannerBtn');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.openPlannerDrawer());
    }
    const closeBtn = document.getElementById('closePlannerBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePlannerDrawer());
    }
    const backdrop = document.getElementById('drawerBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closePlannerDrawer());
    }

    this.setupDaySelector();
    this.setupCalendarSync();
    await this.renderSlots();
    await this.renderCanvas();
  },

  openPlannerDrawer() {
    const drawer = document.getElementById('plannerDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    if (drawer && backdrop) {
      drawer.classList.add('active');
      backdrop.classList.add('active');
      document.body.style.overflow = 'hidden'; // Avoid background scrolling
    }
  },

  closePlannerDrawer() {
    const drawer = document.getElementById('plannerDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    if (drawer && backdrop) {
      drawer.classList.remove('active');
      backdrop.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  async setupCalendarSync() {
    try {
      const status = await Store.getCalendarStatus();
      this._calConnected = status.connected;
      this._calEmail = status.email || null;
    } catch { this._calConnected = false; this._calEmail = null; }
  },

  renderCalendarUI() {
    const btn = document.getElementById('calHeaderBtn');
    let discBtn = document.getElementById('calDiscBtn');

    if (this._calConnected) {
      btn.textContent = '\uD83D\uDD0C Sync Now';
      btn.className = 'btn-secondary';
      btn.title = this._calEmail ? `Connected as ${this._calEmail}` : 'Connected \u2013 click to sync';
      btn.style.marginRight = '0.5rem';
      btn.style.display = '';
      if (!discBtn) {
        discBtn = document.createElement('button');
        discBtn.id = 'calDiscBtn';
        discBtn.textContent = '\u274C';
        discBtn.title = 'Disconnect Calendar';
        discBtn.style.cssText = 'background:none;border:1px solid rgba(239,68,68,0.5);color:#ef4444;border-radius:6px;padding:0.4rem 0.6rem;cursor:pointer;font-size:0.85rem;line-height:1;';
        btn.parentNode.insertBefore(discBtn, btn.nextSibling);
      }
      discBtn.style.display = '';
      discBtn.onclick = async () => {
        try {
          await Store.disconnectCalendar();
          this._calConnected = false;
          this.renderCalendarUI();
          this.showToast('Calendar disconnected. Synced tasks and slots removed.', 'success');
          this.renderSlots();
          this.renderCanvas();
          if (typeof Tasks !== 'undefined' && Tasks._initialized) Tasks.render();
        } catch (err) {
          this.showToast(err.message || 'Failed to disconnect', 'error');
        }
      };
    } else {
      btn.textContent = '\uD83D\uDD17 Connect Calendar';
      btn.className = 'btn-sm';
      btn.title = 'Sync Google Calendar events as fixed slots';
      btn.style.marginRight = '';
      if (discBtn) discBtn.style.display = 'none';
    }

    btn.onclick = async () => {
      if (this._calConnected) {
        btn.textContent = 'Syncing...';
        btn.disabled = true;
        try {
          const data = await Store.syncCalendar();
          this.showToast(`Synced ${data.synced} new, ${data.updated || 0} updated out of ${data.total} events.`, 'success');
          await this.renderSlots();
          await this.renderCanvas();
          if (typeof Tasks !== 'undefined' && Tasks._initialized) Tasks.render();
        } catch (err) {
          this.showToast(err.message || 'Sync failed', 'error');
        }
        btn.disabled = false;
        this.renderCalendarUI();
      } else {
        try {
          const data = await Store.getCalendarAuthUrl();
          if (data.url) window.location.href = data.url;
        } catch (err) {
          this.showToast(err.message || 'Failed to connect', 'error');
        }
      }
    };
  },

  async setupGmailSync() {
    try {
      const status = await api('/integrations/status');
      this._gmailConnected = status.gmail?.connected;
      this._gmailEmail = status.gmail?.email || null;
    } catch { this._gmailConnected = false; this._gmailEmail = null; }
    this.renderGmailUI();
  },

  renderGmailUI() {
    const btn = document.getElementById('gmailHeaderBtn');
    if (!btn) return;
    let discBtn = document.getElementById('gmailDiscBtn');

    if (this._gmailConnected) {
      btn.textContent = '\uD83D\uDD0C Sync Gmail';
      btn.className = 'btn-secondary';
      btn.title = this._gmailEmail ? `Connected as ${this._gmailEmail}` : 'Connected \u2013 click to sync';
      btn.style.marginRight = '0.35rem';
      btn.style.display = '';
      if (!discBtn) {
        discBtn = document.createElement('button');
        discBtn.id = 'gmailDiscBtn';
        discBtn.textContent = '\u274C';
        discBtn.title = 'Disconnect Gmail';
        discBtn.style.cssText = 'background:none;border:1px solid rgba(239,68,68,0.5);color:#ef4444;border-radius:6px;padding:0.4rem 0.6rem;cursor:pointer;font-size:0.85rem;line-height:1;';
        btn.parentNode.insertBefore(discBtn, btn.nextSibling);
      }
      discBtn.style.display = '';
      discBtn.onclick = async () => {
        try {
          await api('/integrations/gmail/disconnect', { method: 'POST' });
          this._gmailConnected = false;
          this.renderGmailUI();
          this.showToast('Gmail disconnected.', 'success');
        } catch (err) {
          this.showToast(err.message || 'Failed to disconnect', 'error');
        }
      };
    } else {
      btn.textContent = '\uD83D\uDD17 Connect Gmail';
      btn.className = 'btn-sm';
      btn.title = 'Sync Gmail emails as tasks';
      btn.style.marginRight = '';
      if (discBtn) discBtn.style.display = 'none';
    }

    btn.onclick = async () => {
      if (this._gmailConnected) {
        btn.textContent = 'Syncing...';
        btn.disabled = true;
        try {
          const data = await api('/integrations/gmail/sync', { method: 'POST' });
          this.showToast(`Synced ${data.count || 0} emails as tasks.`, 'success');
          if (typeof Tasks !== 'undefined' && Tasks._initialized) Tasks.render();
        } catch (err) {
          this.showToast(err.message || 'Sync failed', 'error');
        }
        btn.disabled = false;
        this.renderGmailUI();
      } else {
        try {
          const data = await api('/integrations/google/auth-url');
          if (data.url) window.location.href = data.url;
        } catch (err) {
          this.showToast(err.message || 'Failed to connect', 'error');
        }
      }
    };
  },

  showToast(msg, type) {
    let toast = document.getElementById('calToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'calToast';
      toast.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.9rem;z-index:9999;animation:fadeInUp 0.3s ease;';
      document.body.appendChild(toast);
    }
    toast.style.background = type === 'success' ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)';
    toast.style.color = '#fff';
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._hide);
    toast._hide = setTimeout(() => { toast.style.display = 'none'; }, 4000);
  },

  setupDaySelector() {
    document.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentDay = parseInt(btn.dataset.day);
        await this.renderCanvas();
      });
    });
    document.querySelectorAll('.day-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.day) === this.currentDay);
      b.classList.toggle('today', parseInt(b.dataset.day) === new Date().getDay());
    });
  },

  async renderSlots() {
    const container = document.getElementById('fixedSlotList');
    const slots = await Store.getSlots();
    if (slots.length === 0) {
      container.innerHTML = `
        <div class="empty-slots" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); background: var(--btn-ghost-bg); border: 1px dashed var(--border); border-radius: 12px; margin-top: 0.5rem;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.75rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.2));">🔒</span>
          <p style="margin: 0; font-size: 0.9rem; font-weight: 500;">No commitments yet.</p>
          <p style="margin: 0.25rem 0 0 0; font-size: 0.75rem; color: var(--text-muted);">Add your weekly schedule constraints using the "+ Add Slot" button.</p>
        </div>
      `;
      return;
    }

    // Group slots by day of week (0-6)
    const slotsByDay = {};
    slots.forEach(s => {
      const day = s.dayOfWeek;
      if (!slotsByDay[day]) slotsByDay[day] = [];
      slotsByDay[day].push(s);
    });

    let html = '';
    for (let dayNum = 0; dayNum <= 6; dayNum++) {
      const daySlots = slotsByDay[dayNum] || [];
      if (daySlots.length === 0) continue;

      // Sort slots chronologically
      daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

      const dayName = Utils.getDayName(dayNum);
      html += `
        <div class="commitment-day-group" style="margin-bottom: 1.25rem;">
          <div class="commitment-day-header" style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); margin-bottom: 0.6rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; display: flex; align-items: center; gap: 0.4rem;">
            <span>📅</span> ${dayName}
          </div>
          <div class="commitment-cards-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0.5rem;">
            ${daySlots.map(s => `
              <div class="slot-card" style="margin: 0; display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.6rem; min-width: 0; flex: 1;">
                   <span class="slot-color-dot" style="background:${s.color || 'var(--primary)'}; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 6px ${s.color || 'var(--primary)'};"></span>
                   <div style="min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 0.15rem;">
                     <span class="slot-name" style="font-size: 0.85rem; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${Utils.escapeHtml(s.title)}</span>
                     <span class="slot-detail" style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.25rem;">
                       <span>⏰</span> ${s.startTime} - ${s.endTime}
                     </span>
                   </div>
                </div>
                <button class="slot-delete-btn" data-id="${s.id}" title="Delete Commitment" style="background: none; border: none; color: var(--text-muted); cursor: pointer; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; line-height: 1; transition: all 0.2s; opacity: 0.5;" onmouseover="this.style.opacity='1'; this.style.color='var(--danger)'; this.style.background='var(--tag-urgent-bg)'" onmouseout="this.style.opacity='0.5'; this.style.color='var(--text-muted)'; this.style.background='none'">&times;</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    container.querySelectorAll('.slot-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await Store.deleteSlot(btn.dataset.id);
        await this.renderSlots();
        await this.renderCanvas();
      });
    });
  },

  async renderCanvas() {
    const canvas = document.getElementById('timetableCanvas');
    const day = this.currentDay;

    const allSlots = await Store.getSlots();
    const allTasks = await Store.getTasks();
    const daySlots = allSlots.filter(s => s.dayOfWeek === day);
    const dayTasks = allTasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate).getDay() === day);

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const isToday = day === now.getDay();

    let html = '';

    this.bands.forEach(band => {
      const bandStart = band.start;
      const bandEnd = band.start + band.hours;

      const slotsInBand = daySlots.filter(s => {
        const sMin = Utils.timeToMinutes(s.startTime);
        return sMin >= bandStart * 60 && sMin < bandEnd * 60;
      });
      const tasksInBand = dayTasks.filter(t => {
        const tMin = t.dueTime ? Utils.timeToMinutes(t.dueTime) : 540;
        return tMin >= bandStart * 60 && tMin < bandEnd * 60;
      });
      const totalItems = slotsInBand.length + tasksInBand.length;

      const defaultOpen = (
        totalItems > 0 ||
        (isToday && currentMins >= bandStart * 60 && currentMins < bandEnd * 60) ||
        (band.id === 'morning' && totalItems === 0)
      );

      let bandBody = '';
      if (totalItems > 0 || defaultOpen) {
        bandBody = this.renderBand(band, daySlots, dayTasks, isToday, currentMins);
      }

      html += `
        <div class="time-band" data-band="${band.id}">
          <div class="band-header" onclick="Timetable.toggleBand('${band.id}')">
            <span class="band-arrow ${defaultOpen ? 'open' : ''}">></span>
            <span class="band-label">${band.label}</span>
            <span class="band-range">${band.start === 0 ? '12AM' : band.start < 12 ? band.start + 'AM' : band.start === 12 ? '12PM' : (band.start - 12) + 'PM'} &ndash; ${bandEnd === 24 ? '12AM' : bandEnd < 12 ? bandEnd + 'AM' : bandEnd === 12 ? '12PM' : (bandEnd - 12) + 'PM'}</span>
            ${totalItems > 0 ? `<span class="band-count">${totalItems}</span>` : ''}
          </div>
          <div class="band-body ${defaultOpen ? 'open' : ''}" id="band-body-${band.id}">
            ${bandBody}
          </div>
        </div>
      `;
    });

    canvas.innerHTML = html;
    await this.renderRoadmap();
  },

  async renderRoadmap() {
    const container = document.getElementById('todayRoadmap');
    if (!container) return;
    
    const day = this.currentDay;
    const allTasks = await Store.getTasks();
    const dayTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate).getDay() === day);
    
    const allSlots = await Store.getSlots();
    const daySlots = allSlots.filter(s => s.dayOfWeek === day);

    // Convert tasks to roadmap items
    const taskItems = dayTasks.map(t => ({
      type: 'task',
      id: t.id,
      title: t.title,
      time: t.dueTime || '23:59',
      endTime: null,
      color: null,
      completed: t.completed,
      category: t.category,
      original: t
    }));

    // Convert slots to roadmap items
    const slotItems = daySlots.map(s => ({
      type: 'slot',
      id: s.id,
      title: s.title,
      time: s.startTime,
      endTime: s.endTime,
      color: s.color || '#6366f1',
      completed: true, // Fixed slots are treated as active anchors
      category: 'Fixed Commit',
      original: s
    }));

    // Combine and sort chronologically by time
    const sortedItems = [...taskItems, ...slotItems].sort((a, b) => {
      const timeA = a.time || '23:59';
      const timeB = b.time || '23:59';
      return timeA.localeCompare(timeB);
    });
    
    const totalTasks = sortedItems.filter(item => item.type === 'task').length;
    const completedTasks = sortedItems.filter(item => item.type === 'task' && item.completed).length;
    const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    const progressBadge = document.getElementById('roadmapProgressBadge');
    const progressBar = document.getElementById('roadmapProgressBar');
    const headerTitle = document.querySelector('.roadmap-section h3');
    
    const dayName = Utils.getDayName(day);
    const isToday = day === new Date().getDay();
    
    if (headerTitle) {
      headerTitle.innerHTML = `🗺️ ${isToday ? "Today's" : dayName + "'s"} Work Roadmap`;
    }
    if (progressBadge) {
      progressBadge.textContent = `${percent}% Complete`;
    }
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
    
    if (sortedItems.length === 0) {
      container.style.height = 'auto';
      container.style.width = '100%';
      container.innerHTML = `
        <div class="empty-roadmap" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); width: 100%;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">🏝️</div>
          <p style="margin: 0; font-size: 0.9rem;">No tasks or fixed slots scheduled for ${isToday ? 'today' : dayName}.</p>
          <div style="display: flex; gap: 0.75rem; justify-content: center; margin-top: 0.75rem; flex-wrap: wrap;">
            <button class="btn-sm" onclick="Tasks.openModal()">+ Create Task</button>
            <button class="btn-sm" onclick="Timetable.openPlannerDrawer(); Timetable.openSlotModal()">+ Add Slot</button>
          </div>
        </div>
      `;
      return;
    }
    
    function formatDueTime(timeStr) {
      if (!timeStr) return 'All Day';
      const [hStr, mStr] = timeStr.split(':');
      const h = parseInt(hStr, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      return `${displayHour}:${mStr} ${ampm}`;
    }

    // Dynamic sizing based on device (Mobile vertical timeline vs Desktop horizontal serpentine)
    const isMobile = window.innerWidth <= 768;
    let containerWidth = 0;
    if (isMobile) {
      container.style.height = 'auto';
      container.style.width = '100%';
    } else {
      container.style.height = '360px';
      containerWidth = Math.max(container.parentElement.clientWidth || 800, sortedItems.length * 280 + 100);
      container.style.width = `${containerWidth}px`;
    }

    // Modern color gradients
    const gradients = [
      'linear-gradient(135deg, #FF6B6B, #FF8E53)', // Warm Sunset
      'linear-gradient(135deg, #4E65FF, #92EFFD)', // Ocean Breeze
      'linear-gradient(135deg, #F355DA, #7006F2)', // Electric Purple
      'linear-gradient(135deg, #11998E, #38EF7D)', // Fresh Emerald
      'linear-gradient(135deg, #FF9900, #FF5E62)'  // Hot Neon
    ];

    // SVG Gradient Definitions for the pointers/connecting paths
    const svgGradients = `
      <defs>
        <linearGradient id="svgGrad-0" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF6B6B" />
          <stop offset="100%" stop-color="#FF8E53" />
        </linearGradient>
        <linearGradient id="svgGrad-1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4E65FF" />
          <stop offset="100%" stop-color="#92EFFD" />
        </linearGradient>
        <linearGradient id="svgGrad-2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F355DA" />
          <stop offset="100%" stop-color="#7006F2" />
        </linearGradient>
        <linearGradient id="svgGrad-3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#11998E" />
          <stop offset="100%" stop-color="#38EF7D" />
        </linearGradient>
        <linearGradient id="svgGrad-4" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF9900" />
          <stop offset="100%" stop-color="#FF5E62" />
        </linearGradient>
      </defs>
    `;

    // Dynamic wave paths coordinates calculation
    // Middle level is 230px, waves up (-50px) and down (+50px)
    const Y_mid = 230;
    const waveAmp = 50;
    const nodeSpacing = 280;

    let pathD = `M 40 ${Y_mid}`;
    const svgElements = [];

    // Pre-calculate positions of all nodes
    const nodeCoords = sortedItems.map((item, idx) => {
      const x = idx * nodeSpacing + 140;
      const isEven = idx % 2 === 0;
      const y = Y_mid + (isEven ? -waveAmp : waveAmp);
      return { x, y, isEven };
    });

    // Build the winding bezier curve string
    for (let i = 0; i < nodeCoords.length; i++) {
      const curr = nodeCoords[i];
      const prev = i === 0 ? { x: 40, y: Y_mid } : nodeCoords[i - 1];
      
      const cp1x = prev.x + 110;
      const cp1y = prev.y;
      const cp2x = curr.x - 110;
      const cp2y = curr.y;
      
      pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }

    if (nodeCoords.length > 0) {
      const last = nodeCoords[nodeCoords.length - 1];
      pathD += ` L ${last.x + 120} ${Y_mid}`;
    }

    // Generate connecting pointers from card bottom to node
    const pointerPolygons = nodeCoords.map((coord, idx) => {
      const cardBottom = coord.isEven ? 140 : 225;
      const nodeY = coord.isEven ? 190 : 280;
      return `<polygon points="${coord.x - 12},${cardBottom} ${coord.x + 12},${cardBottom} ${coord.x},${nodeY}" fill="url(#svgGrad-${idx % 5})" opacity="0.9" />`;
    }).join('');

    // Generate anchor circles on the wavy track line
    const anchorCircles = nodeCoords.map((coord, idx) => {
      const item = sortedItems[idx];
      let strokeColor = `url(#svgGrad-${idx % 5})`;
      let fillColor = '#ffffff';
      
      if (item.type === 'slot') {
        strokeColor = item.color;
        fillColor = item.color;
      } else if (item.completed) {
        strokeColor = '#10b981';
        fillColor = '#10b981';
      }
      
      return `
        <circle cx="${coord.x}" cy="${coord.y}" r="8" fill="${fillColor}" stroke="${strokeColor}" stroke-width="3" style="transition: all 0.4s ease;" />
        ${(item.type === 'task' && item.completed) ? `<circle cx="${coord.x}" cy="${coord.y}" r="4" fill="#ffffff" />` : ''}
        ${item.type === 'slot' ? `<circle cx="${coord.x}" cy="${coord.y}" r="3" fill="#ffffff" />` : ''}
      `;
    }).join('');

    // Construct the complete background SVG HTML
    const svgHtml = isMobile ? '' : `
      <svg width="${containerWidth}" height="360" style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1; max-width: none !important; height: 360px !important;">
        ${svgGradients}
        <!-- Wavy Road Track Shoulder -->
        <path d="${pathD}" stroke="var(--roadmap-shoulder, rgba(255, 255, 255, 0.05))" stroke-width="20" fill="none" stroke-linecap="round" />
        <!-- Wavy Road Track Main -->
        <path d="${pathD}" stroke="var(--roadmap-main, rgba(255, 255, 255, 0.15))" stroke-width="10" fill="none" stroke-linecap="round" />
        <!-- Dashed Centerline (Animated via CSS) -->
        <path class="roadmap-centerline" d="${pathD}" stroke="var(--roadmap-centerline, rgba(255, 255, 255, 0.35))" stroke-width="2" fill="none" stroke-linecap="round" />
        <!-- Speech bubble pointers pointing from card bottom to wavy path node -->
        ${pointerPolygons}
        <!-- Anchors on road -->
        ${anchorCircles}
      </svg>
    `;

    // Construct the card HTML blocks
    const cardsHtml = sortedItems.map((item, idx) => {
      const coord = nodeCoords[idx];
      const title = Utils.escapeHtml(item.title);
      const cardTop = coord.isEven ? 15 : 100;
      const grad = item.type === 'slot' ? `linear-gradient(135deg, ${item.color}, ${item.color}dd)` : gradients[idx % 5];
      
      if (item.type === 'slot') {
        const timeStr = `${formatDueTime(item.time)} - ${formatDueTime(item.endTime)}`;
        return `
          <div class="roadmap-card-node slot-node" 
               data-id="${item.id}"
               data-type="slot"
               style="left: ${coord.x - 115}px; top: ${cardTop}px; background: ${grad}; border: 1.5px dashed rgba(255,255,255,0.35); animation-delay: ${idx * 0.08}s; opacity: 0.95;">
            
            <div class="roadmap-circle-badge slot-badge" title="Fixed Weekly Commitment" style="background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.4); cursor: default;">
              <span>📅</span>
            </div>

            <div class="roadmap-card-time">
              <span>⏰</span> ${timeStr}
            </div>
            
            <h4 class="roadmap-card-title">${title}</h4>
            
            <div class="roadmap-card-action-hint">
              <span>🔒 Fixed Slot</span>
              <span style="font-weight: 600; text-transform: uppercase; font-size: 0.7rem; background: rgba(0,0,0,0.2); padding: 0.1rem 0.4rem; border-radius: 4px;">Weekly</span>
            </div>
          </div>
        `;
      } else {
        const t = item.original;
        const timeStr = formatDueTime(t.dueTime);
        const category = t.category ? Utils.escapeHtml(t.category) : '';
        const isCompleted = t.completed;
        
        // Check if subtasks list has contents
        let subtasksText = '';
        let subtaskList = t.subtasks || [];
        if (typeof subtaskList === 'string') {
          try { subtaskList = JSON.parse(subtaskList); } catch { subtaskList = []; }
        }
        
        if (subtaskList.length > 0) {
          const compCount = subtaskList.filter(s => s.completed).length;
          subtasksText = `📋 ${compCount}/${subtaskList.length} Subtasks`;
        } else if (t.desc && t.desc.toLowerCase().includes('subtask')) {
          subtasksText = `📋 View Subtasks`;
        } else {
          subtasksText = `✏️ View Details`;
        }

        return `
          <div class="roadmap-card-node ${isCompleted ? 'completed' : ''}" 
               data-id="${t.id}"
               data-type="task"
               style="left: ${coord.x - 115}px; top: ${cardTop}px; background: ${grad}; animation-delay: ${idx * 0.08}s;">
            
            <!-- Clicking circle toggles task completion -->
            <div class="roadmap-circle-badge" data-id="${t.id}" title="Click to toggle completion">
              <span>${String(idx + 1).padStart(2, '0')}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>

            <div class="roadmap-card-time">
              <span>⏰</span> ${timeStr}
            </div>
            
            <h4 class="roadmap-card-title">${title}</h4>
            
            <div class="roadmap-card-action-hint">
              <span>${category ? '🏷️ ' + category : ''}</span>
              <span style="font-weight: 600;">${subtasksText}</span>
            </div>
          </div>
        `;
      }
    }).join('');

    // Insert SVG path and absolute cards to container
    container.innerHTML = svgHtml + cardsHtml;

    // Attach click listeners to cards (clicking opens details popup modal)
    container.querySelectorAll('.roadmap-card-node').forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent click if clicking the completion circle badge
        if (e.target.closest('.roadmap-circle-badge')) return;
        const type = card.dataset.type;
        const id = card.dataset.id;
        
        if (type === 'slot') {
          // Open Weekly Planner drawer and scroll to slot list
          this.openPlannerDrawer();
          const list = document.getElementById('fixedSlotList');
          if (list) {
            list.scrollIntoView({ behavior: 'smooth' });
            list.style.outline = '2px solid var(--primary)';
            setTimeout(() => { list.style.outline = 'none'; }, 2000);
          }
        } else {
          this.showTaskDetails(id);
        }
      });
    });

    // Attach click listeners to completion badges (node circles)
    container.querySelectorAll('.roadmap-circle-badge').forEach(badge => {
      badge.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = badge.closest('.roadmap-card-node');
        if (!card || card.dataset.type === 'slot') return;
        
        const taskId = badge.dataset.id;
        const taskItem = sortedItems.find(item => item.type === 'task' && item.id === taskId);
        if (!taskItem) return;
        
        const wasCompleted = taskItem.completed;
        card.classList.toggle('completed', !wasCompleted);
        
        await Store.toggleTask(taskId);
        
        if (!wasCompleted) {
          Toast.success('Task completed!');
          Utils.confetti(40);
        }
        
        await this.renderCanvas();
        if (typeof Tasks !== 'undefined' && Tasks._initialized) await Tasks.render();
        if (typeof Dashboard !== 'undefined' && Dashboard._initialized) await Dashboard.init();
      });
    });

    // Drag-to-scroll functionality for desktop mouse users
    const scroller = container.parentElement; // .roadmap-scroller-container
    if (scroller && window.innerWidth > 768) {
      let isDown = false;
      let startX;
      let scrollLeft;
      let wasDragged = false;

      scroller.addEventListener('mousedown', (e) => {
        isDown = true;
        wasDragged = false;
        startX = e.pageX - scroller.offsetLeft;
        scrollLeft = scroller.scrollLeft;
      });

      scroller.addEventListener('mouseleave', () => {
        isDown = false;
      });

      scroller.addEventListener('mouseup', () => {
        isDown = false;
      });

      scroller.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - scroller.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 5) {
          wasDragged = true;
        }
        scroller.scrollLeft = scrollLeft - walk;
      });

      // Intercept and prevent card detail clicks if the user was drag-scrolling
      container.querySelectorAll('.roadmap-card-node').forEach(card => {
        card.addEventListener('click', (e) => {
          if (wasDragged) {
            e.stopPropagation();
            e.preventDefault();
            wasDragged = false;
          }
        }, true); // use capture phase
      });

      // Map vertical mouse wheel scrolling to horizontal scrolling over the roadmap
      scroller.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          scroller.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }
  },

  async showTaskDetails(taskId) {
    const allTasks = await Store.getTasks();
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Ensure task.subtasks is an array
    let subtasks = task.subtasks || [];
    if (typeof subtasks === 'string') {
      try { subtasks = JSON.parse(subtasks); } catch { subtasks = []; }
    }
    
    // On-the-fly migration of text description subtasks to real interactive database subtasks
    if (subtasks.length === 0 && task.desc) {
      const lines = task.desc.split('\n');
      const listItems = [];
      const remainingLines = [];
      let inSubtaskSec = false;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.toLowerCase().startsWith('subtasks:')) {
          inSubtaskSec = true;
          continue;
        }
        const matchNumbered = trimmed.match(/^\d+[\.\)\-]\s+(.+)/);
        const matchBullet = trimmed.match(/^[\-\*\+]\s+(.+)/);
        if ((inSubtaskSec || matchNumbered || matchBullet) && (matchNumbered || matchBullet)) {
          const content = (matchNumbered ? matchNumbered[1] : matchBullet[1]).trim();
          listItems.push({ title: content, completed: false });
        } else {
          remainingLines.push(line);
        }
      }
      
      if (listItems.length > 0) {
        subtasks = listItems;
        task.subtasks = subtasks;
        task.desc = remainingLines.join('\n').trim();
        await Store.updateTask(task.id, { subtasks: subtasks, desc: task.desc });
        // Refresh main views
        await this.renderRoadmap();
        if (typeof Tasks !== 'undefined' && Tasks._initialized) await Tasks.render();
      }
    }
    
    this.renderTaskDetailContent(task, subtasks);
    Utils.showModal('taskDetailModal');
  },

  renderTaskDetailContent(task, subtasks) {
    const contentContainer = document.getElementById('taskDetailContent');
    if (!contentContainer) return;
    
    const title = Utils.escapeHtml(task.title);
    const desc = task.desc ? Utils.escapeHtml(task.desc) : '';
    const priority = Utils.escapeHtml(task.priority);
    const category = Utils.escapeHtml(task.category || 'work');
    const location = task.location ? Utils.escapeHtml(task.location) : '';
    const links = task.links || '';
    
    const total = subtasks.length;
    const completed = subtasks.filter(s => s.completed).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    function formatTime(timeStr) {
      if (!timeStr) return 'All Day';
      const [hStr, mStr] = timeStr.split(':');
      const h = parseInt(hStr, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      return `${displayHour}:${mStr} ${ampm}`;
    }
    const timeStr = formatTime(task.dueTime);
    const dateStr = task.dueDate ? Utils.formatDate(task.dueDate) : 'No due date';
    
    let subtasksHtml = '';
    if (total > 0) {
      subtasksHtml = `
        <div class="subtasks-container" style="margin-top: 1.5rem;">
          <h4 class="subtasks-title">📋 Subtasks (${completed}/${total})</h4>
          <div class="roadmap-progress-bar-container" style="height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; margin-bottom: 1rem; overflow: hidden; position: relative;">
            <div id="modalSubtaskProgress" style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #10b981, #34d399); transition: width 0.3s; border-radius: 3px;"></div>
          </div>
          <div id="modalSubtaskList" class="subtask-list-scroll-area">
            ${subtasks.map((s, idx) => `
              <div class="subtask-list-item ${s.completed ? 'completed' : ''}">
                <div class="subtask-checkbox-container" data-idx="${idx}">
                  <div class="subtask-checkbox">
                    <svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <span class="subtask-title-text">${Utils.escapeHtml(s.title)}</span>
                </div>
                <button class="subtask-delete-btn" data-idx="${idx}" title="Delete subtask">🗑️</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      subtasksHtml = `
        <div class="subtasks-container" style="margin-top: 1.5rem;">
          <h4 class="subtasks-title">📋 Subtasks</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 0.75rem 0;">No subtasks added yet. Add one below!</p>
          <div id="modalSubtaskList" class="subtask-list-scroll-area"></div>
        </div>
      `;
    }
    
    contentContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; padding-right: 2.2rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span class="task-tag ${priority}" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; text-transform: uppercase;">${priority}</span>
          <span class="task-category" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; text-transform: uppercase;">${category}</span>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; padding: 0.15rem 0.4rem; border-radius: 6px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 0.25rem;">
            ${task.completed ? '<span style="color: #10b981; display: inline-flex; align-items: center; gap: 0.2rem;">✓ Completed</span>' : '⚡ Pending'}
          </span>
        </div>
      </div>
      
      <h2 style="font-size: 1.35rem; font-weight: 700; margin: 0 0 0.5rem 0; color: var(--text); line-height: 1.3;">${title}</h2>
      
      <div style="display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span>📅</span> <span>${dateStr} · <span class="monospace-time">${timeStr} (${task.duration} mins)</span></span>
        </div>
        ${location ? `
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>📍</span> <span>${location}</span>
          </div>
        ` : ''}
        ${links ? `
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span>🔗</span>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              ${links.split(/[\n,]/).map(u => u.trim()).filter(Boolean).map(u => {
                if (u.startsWith('http')) {
                  const host = u.replace('https://','').replace('http://','').split('/')[0];
                  return `<a href="${Utils.escapeHtml(u)}" target="_blank" rel="noopener" style="color: var(--primary); text-decoration: underline; font-weight: 500;">${Utils.escapeHtml(host)}</a>`;
                }
                return `<span>${Utils.escapeHtml(u)}</span>`;
              }).join(' · ')}
            </div>
          </div>
        ` : ''}
      </div>
      
      ${desc ? `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); padding: 0.85rem; border-radius: 12px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted); margin-bottom: 1.25rem; white-space: pre-wrap;">
          ${desc}
        </div>
      ` : ''}
      
      <div style="border-top: 1px solid var(--border); padding-top: 1rem;">
        ${subtasksHtml}
        
        <form id="modalSubtaskForm" class="subtask-add-form" style="margin-top: 0.75rem;">
          <input type="text" id="modalSubtaskInput" class="subtask-add-input" placeholder="+ Add a new subtask..." required />
          <button type="submit" class="btn-sm btn-primary" style="padding: 0.5rem 1rem; border-radius: 8px;">Add</button>
        </form>
      </div>
      
      <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.75rem; border-top: 1px solid var(--border); padding-top: 1.25rem;">
        <button class="btn-sm btn-secondary" onclick="Utils.hideModal('taskDetailModal')" style="padding: 0.5rem 1.25rem; border-radius: 10px;">Close</button>
        <button id="modalToggleTaskBtn" class="btn-sm" style="padding: 0.5rem 1.25rem; border-radius: 10px; background: ${task.completed ? 'rgba(255,255,255,0.08)' : '#10b981'}; color: ${task.completed ? 'var(--text)' : '#ffffff'}; border: 1px solid ${task.completed ? 'var(--border)' : '#10b981'}; font-weight: 600;">
          ${task.completed ? 'Undo Complete' : 'Mark Complete'}
        </button>
      </div>
    `;
    
    // Set up listeners for Subtask checkboxes
    contentContainer.querySelectorAll('.subtask-checkbox-container').forEach(container => {
      container.addEventListener('click', async () => {
        const idx = parseInt(container.dataset.idx);
        subtasks[idx].completed = !subtasks[idx].completed;
        await Store.updateTask(task.id, { subtasks: subtasks });
        
        // Visual toggle
        container.closest('.subtask-list-item').classList.toggle('completed', subtasks[idx].completed);
        
        // Re-render subtask section & progress
        const updatedTotal = subtasks.length;
        const updatedCompleted = subtasks.filter(s => s.completed).length;
        const updatedPercent = updatedTotal > 0 ? Math.round((updatedCompleted / updatedTotal) * 100) : 0;
        
        const pb = document.getElementById('modalSubtaskProgress');
        if (pb) pb.style.width = `${updatedPercent}%`;
        
        const titleH = contentContainer.querySelector('.subtasks-title');
        if (titleH) titleH.textContent = `📋 Subtasks (${updatedCompleted}/${updatedTotal})`;
        
        // Trigger confettis if subtask was completed and all are completed!
        if (subtasks[idx].completed && updatedCompleted === updatedTotal) {
          Utils.confetti(40);
          Toast.success('All subtasks completed! 🎉');
        }
        
        // Refresh the main roadmap view
        await this.renderRoadmap();
        if (typeof Tasks !== 'undefined' && Tasks._initialized) await Tasks.render();
        if (typeof Dashboard !== 'undefined' && Dashboard._initialized) await Dashboard.init();
      });
    });
    
    // Set up listeners for Subtask delete buttons
    contentContainer.querySelectorAll('.subtask-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        subtasks.splice(idx, 1);
        await Store.updateTask(task.id, { subtasks: subtasks });
        
        // Re-render detail content
        this.renderTaskDetailContent(task, subtasks);
        
        // Refresh main views
        await this.renderRoadmap();
        if (typeof Tasks !== 'undefined' && Tasks._initialized) await Tasks.render();
        if (typeof Dashboard !== 'undefined' && Dashboard._initialized) await Dashboard.init();
      });
    });
    
    // Set up listener for Add Subtask form
    const addForm = document.getElementById('modalSubtaskForm');
    if (addForm) {
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('modalSubtaskInput');
        const titleText = input.value.trim();
        if (!titleText) return;
        
        subtasks.push({ title: titleText, completed: false });
        await Store.updateTask(task.id, { subtasks: subtasks });
        
        input.value = '';
        
        // Re-render details
        this.renderTaskDetailContent(task, subtasks);
        
        // Refresh main views
        await this.renderRoadmap();
        if (typeof Tasks !== 'undefined' && Tasks._initialized) await Tasks.render();
        if (typeof Dashboard !== 'undefined' && Dashboard._initialized) await Dashboard.init();
      });
    }
    
    // Set up listener for main task toggle button
    const toggleBtn = document.getElementById('modalToggleTaskBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        const wasCompleted = task.completed;
        await Store.toggleTask(task.id);
        
        task.completed = !wasCompleted;
        
        if (!wasCompleted) {
          Toast.success('Task completed!');
          Utils.confetti(40);
        }
        
        Utils.hideModal('taskDetailModal');
        
        // Refresh views
        await this.renderCanvas();
        if (typeof Tasks !== 'undefined' && Tasks._initialized) await Tasks.render();
        if (typeof Dashboard !== 'undefined' && Dashboard._initialized) await Dashboard.init();
      });
    }
  },

  renderBand(band, daySlots, dayTasks, isToday, currentMins) {
    const bandStart = band.start * 60;
    const heightPerHour = 36;

    let html = `<div class="band-hours" style="--hour-count:${band.hours};height:${band.hours * heightPerHour}px">`;

    /* Hour labels */
    for (let i = 0; i < band.hours; i++) {
      const h = band.start + i;
      const label = h === 0 ? '12' : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? 'AM' : 'PM';
      html += `
        <div class="band-hour" style="top:${i * heightPerHour}px;">
          <div class="band-hour-label">
            <span>${label}</span>
            <span class="ampm">${ampm}</span>
          </div>
        </div>`;
    }

    html += '<div class="band-blocks">';

    /* Fixed slots */
    daySlots.filter(s => {
      const sMin = Utils.timeToMinutes(s.startTime);
      return sMin >= bandStart && sMin < bandStart + band.hours * 60;
    }).forEach(s => {
      const sMin = Utils.timeToMinutes(s.startTime);
      const eMin = Utils.timeToMinutes(s.endTime);
      const top = (sMin - bandStart) * (heightPerHour / 60);
      const height = Math.max((eMin - sMin) * (heightPerHour / 60), 18);
      html += `
        <div class="band-block fixed" style="top:${top}px;height:${height}px;background:${s.color}15;border-left-color:${s.color};">
          <div class="band-block-title">${s.title}</div>
          <div class="band-block-time">${s.startTime} - ${s.endTime}</div>
        </div>`;
    });

    /* Tasks */
    dayTasks.filter(t => {
      const tMin = t.dueTime ? Utils.timeToMinutes(t.dueTime) : 540;
      return tMin >= bandStart && tMin < bandStart + band.hours * 60;
    }).forEach(t => {
      const tMin = t.dueTime ? Utils.timeToMinutes(t.dueTime) : 540;
      const dur = t.duration || 30;
      const top = (tMin - bandStart) * (heightPerHour / 60);
      const height = Math.max(dur * (heightPerHour / 60), 18);
      html += `
        <div class="band-block task" style="top:${top}px;height:${height}px;">
          <div class="band-block-title">${t.title}</div>
          <div class="band-block-time">${t.dueTime || '09:00'} &middot; ${dur}min</div>
        </div>`;
    });

    /* Now indicator */
    if (isToday && currentMins >= bandStart && currentMins < bandStart + band.hours * 60) {
      const nowTop = (currentMins - bandStart) * (heightPerHour / 60);
      html += `<div class="now-line" style="top:${nowTop}px;"></div>`;
    }

    html += '</div></div>';
    return html;
  },

  toggleBand(bandId) {
    const body = document.getElementById(`band-body-${bandId}`);
    if (!body) return;
    const isOpen = body.classList.toggle('open');
    const header = body.previousElementSibling;
    if (header) {
      const arrow = header.querySelector('.band-arrow');
      if (arrow) arrow.classList.toggle('open', isOpen);
    }
  },

  openSlotModal() {
    document.getElementById('slotForm').reset();
    document.getElementById('slotId').value = '';
    document.getElementById('slotModalTitle').textContent = 'Add Fixed Time Slot';
    document.getElementById('slotDay').value = this.currentDay;
    Utils.showModal('slotModal');
  },

  async saveSlot() {
    const id = document.getElementById('slotId').value;
    const data = {
      title: document.getElementById('slotTitle').value.trim(),
      startTime: document.getElementById('slotStart').value,
      endTime: document.getElementById('slotEnd').value,
      color: document.getElementById('slotColor').value,
      dayOfWeek: parseInt(document.getElementById('slotDay').value)
    };
    if (!data.title || !data.startTime || !data.endTime) return;
    if (id) await Store.updateSlot(id, data);
    else await Store.addSlot(data);
    Utils.hideModal('slotModal');
    await this.renderSlots();
    await this.renderCanvas();
  },

  async optimizeDay() {
    const day = this.currentDay;
    const slots = (await Store.getSlots()).filter(s => s.dayOfWeek === day);
    const tasks = (await Store.getTasks()).filter(t => !t.completed && t.dueDate && new Date(t.dueDate).getDay() === day);
    const sorted = tasks.sort((a, b) => {
      const pa = Utils.priorityWeight(a.priority);
      const pb = Utils.priorityWeight(b.priority);
      if (pa !== pb) return pb - pa;
      return (a.duration || 30) - (b.duration || 30);
    });

    const busyRanges = slots.map(s => ({
      start: Utils.timeToMinutes(s.startTime),
      end: Utils.timeToMinutes(s.endTime)
    })).sort((a, b) => a.start - b.start);

    const freeRanges = [];
    let cursor = 0;
    for (const b of busyRanges) {
      if (cursor < b.start) freeRanges.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < 1440) freeRanges.push({ start: cursor, end: 1440 });

    const suggestions = [];
    let freeIdx = 0;
    for (const t of sorted) {
      const dur = t.duration || 30;
      while (freeIdx < freeRanges.length) {
        const fr = freeRanges[freeIdx];
        if (fr.end - fr.start >= dur) {
          suggestions.push({
            task: t.title,
            start: Utils.minutesToTime(fr.start),
            end: Utils.minutesToTime(fr.start + dur)
          });
          fr.start += dur;
          break;
        }
        freeIdx++;
      }
    }

    const container = document.getElementById('optimizeResult');
    if (suggestions.length === 0) {
      container.innerHTML = '<div class="empty-slots">Could not fit tasks into free slots. Try reducing durations or freeing up your schedule.</div>';
      return;
    }
    container.innerHTML =
      suggestions.map(s => `
        <div class="optimize-item">
          <span class="optimize-time">${s.start} - ${s.end}</span>
          <span class="optimize-task">${s.task}</span>
        </div>
      `).join('');
  }
};
