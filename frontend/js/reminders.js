const Reminders = {
  _pollInterval: null,
  _lastCount: 0,

  async init() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    this.startPolling();
    this.setupBellUI();
  },

  startPolling() {
    if (this._pollInterval) clearInterval(this._pollInterval);
    this.poll();
    this._pollInterval = setInterval(() => this.poll(), 30000);
  },

  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  },

  async poll() {
    try {
      const { notifications, unreadCount } = await Store.getNotifications();
      this._lastCount = unreadCount;
      this.updateBellBadge(unreadCount);

      if (notifications && notifications.length > 0) {
        this.showNotifications(notifications);
      }
    } catch { }
  },

  showNotifications(notifications) {
    const shownIds = JSON.parse(sessionStorage.getItem('_shownNotifs') || '[]');
    for (const n of notifications) {
      if (!n.read && !shownIds.includes(n.id)) {
        shownIds.push(n.id);
        if (Notification.permission === 'granted') {
          new Notification(n.title, { body: n.message, icon: '/favicon.svg' });
        }
      }
    }
    sessionStorage.setItem('_shownNotifs', JSON.stringify(shownIds.slice(-50)));
  },

  setupBellUI() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;

    const bell = document.createElement('button');
    bell.id = 'notifBell';
    bell.className = 'notif-bell';
    bell.innerHTML = '\uD83D\uDD14<span id="notifBadge" class="notif-badge hidden">0</span>';
    bell.title = 'Notifications';
    navRight.insertBefore(bell, navRight.firstChild);

    bell.addEventListener('click', () => this.showPanel());
    this.createPanel();

    const bellMobile = document.getElementById('notifBellMobile');
    if (bellMobile) {
      bellMobile.addEventListener('click', () => this.showPanel());
    }

    document.addEventListener('click', (e) => {
      const panel = document.getElementById('notifPanel');
      if (panel && !panel.contains(e.target) && e.target.id !== 'notifBell' && e.target.id !== 'notifBellMobile') {
        panel.classList.add('hidden');
      }
    });
  },

  createPanel() {
    if (document.getElementById('notifPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'notifPanel';
    panel.className = 'notif-panel hidden';
    panel.innerHTML = '<div class="notif-panel-header"><h3>Notifications</h3><button id="markAllReadBtn" class="btn-sm">Mark all read</button></div><div id="notifList" class="notif-list"></div>';
    document.body.appendChild(panel);

    document.getElementById('markAllReadBtn')?.addEventListener('click', async () => {
      await Store.markAllNotificationsRead();
      await this.poll();
      const panel = document.getElementById('notifPanel');
      if (panel && !panel.classList.contains('hidden')) {
        const { notifications } = await Store.getNotifications();
        this.renderPanelList(notifications || []);
      }
    });
  },

  renderPanelList(notifications) {
    const list = document.getElementById('notifList');
    if (!notifications || !notifications.length) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }
    list.innerHTML = notifications.slice(0, 20).map(n => `
      <div class="notif-item ${n.read ? '' : 'notif-unread'}" data-id="${n.id}">
        <div class="notif-title">${n.title}</div>
        <div class="notif-msg">${n.message}</div>
        <div class="notif-time">${Utils.formatDate(n.createdAt)}</div>
      </div>
    `).join('');
    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        await Store.markNotificationRead(id);
        item.classList.remove('notif-unread');
        this.poll();
      });
    });
  },

  async showPanel() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      const { notifications } = await Store.getNotifications();
      this.renderPanelList(notifications || []);
    }
  },

  updateBellBadge(count) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
};
