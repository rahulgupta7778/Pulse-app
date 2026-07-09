const Connections = {
  async init() {
    this._status = null;
    this._meta = null;
    const btn = document.getElementById('connBtn');
    btn.addEventListener('click', () => this.toggle());
    const mobileBtn = document.getElementById('connBtnMobile');
    if (mobileBtn) mobileBtn.addEventListener('click', () => { this.toggle(); document.querySelector('.nav-links').classList.remove('open'); document.getElementById('hamburgerBtn').textContent = '☰'; });
    document.getElementById('connSyncAll').addEventListener('click', () => this.syncAll());
    document.getElementById('connCloseBtn').addEventListener('click', () => this.close());
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('connDropdown');
      if (!dd.classList.contains('open')) return;
      if (!e.target.closest('#connDropdown') && !e.target.closest('#connBtn') && !e.target.closest('#connBtnMobile')) {
        dd.classList.remove('open');
      }
    });
    this.render();
    setTimeout(() => {
      btn.classList.add('pulse');
      if (mobileBtn) mobileBtn.classList.add('pulse');
    }, 2000);
  },

  async fetchMeta() {
    try {
      this._meta = await api('/integrations/meta');
    } catch { this._meta = {}; }
  },

  async fetchStatus() {
    try {
      this._status = await api('/integrations/status');
    } catch { this._status = {}; }
  },

  toggle() {
    document.getElementById('connDropdown').classList.toggle('open');
    if (document.getElementById('connDropdown').classList.contains('open')) {
      this.render();
    }
  },

  close() {
    document.getElementById('connDropdown').classList.remove('open');
  },

  async render() {
    if (!localStorage.getItem('pulse_token')) return;
    await Promise.all([this.fetchMeta(), this.fetchStatus()]);
    const list = document.getElementById('connList');
    const s = this._status || {};

    // Standardized set of exactly four supported Google Workspace connectors
    const allServices = [
      { key: 'gmail', icon: '📧', name: 'Gmail', desc: 'Sync action items directly from your Gmail inbox' },
      { key: 'googletasks', icon: '📋', name: 'Google Tasks', desc: 'Bi-directionally sync tasks with Google Tasks' },
      { key: 'googlemeet', icon: '📹', name: 'Google Meet', desc: 'Sync online meetings via Google Calendar' },
      { key: 'googleCalendar', icon: '📅', name: 'Google Calendar', desc: 'Integrate events and schedule time blocks' }
    ];

    list.innerHTML = allServices.map(svc => {
      let status = s[svc.key];
      if (svc.key === 'googlemeet') {
        // Google Meet leverages Google Calendar's connection state
        status = s['googleCalendar'];
      }
      const connected = status?.connected;
      const email = status?.email;
      const lastSync = status?.lastSync;
      const lastSyncText = lastSync ? new Date(lastSync).toLocaleString() : 'Never';
      return `
        <div class="conn-item" data-service="${svc.key}">
          <div class="conn-info">
            <span class="conn-icon">${svc.icon}</span>
            <div>
              <div class="conn-name">${svc.name}</div>
              <div class="conn-status ${connected ? 'conn-ok' : ''}">${connected ? '✓ Connected' + (email ? ' — ' + email : '') : 'Not connected'}</div>
              ${connected ? `<div class="conn-last">Last sync: ${lastSyncText}</div>` : ''}
            </div>
          </div>
          <div class="conn-actions">
            ${connected ? `
              <button class="btn-sm" onclick="Connections.sync('${svc.key}')">🔄 Sync</button>
              <button class="btn-sm" onclick="Connections.disconnect('${svc.key}')" style="color:var(--danger);">✕</button>
            ` : `
              <button class="btn-sm" onclick="Connections.connect('${svc.key}')">🔗 Connect</button>
            `}
          </div>
        </div>
      `;
    }).join('');
  },

  async connect(service) {
    if (service === 'googleCalendar') {
      try {
        const data = await Store.getCalendarAuthUrl();
        if (data.url) window.location.href = data.url;
      } catch (err) { Toast.error(err.message || 'Failed to connect'); }
    } else if (service === 'gmail') {
      try {
        const data = await api('/integrations/google/auth-url');
        if (data.url) window.location.href = data.url;
      } catch (err) { Toast.error(err.message || 'Failed to connect'); }
    } else if (service === 'googletasks') {
      try {
        const data = await api('/integrations/googletasks/auth-url');
        if (data.url) window.location.href = data.url;
      } catch (err) { Toast.error(err.message || 'Failed to connect'); }
    } else {
      Toast.info(`${service} connector coming soon.`);
    }
  },

  async sync(service) {
    try {
      let data;
      if (service === 'googleCalendar') {
        data = await Store.syncCalendar();
        Toast.success(`Calendar synced: ${data.synced} new, ${data.updated || 0} updated.`);
        if (typeof Timetable !== 'undefined') {
          if (Timetable.renderSlots) Timetable.renderSlots();
          if (Timetable.renderCanvas) Timetable.renderCanvas();
        }
      } else {
        data = await api(`/integrations/${service}/sync`, { method: 'POST' });
        Toast.success(`${this._meta?.[service]?.name || service} synced: ${data.count || 0} items.`);
      }
      if (typeof Tasks !== 'undefined' && Tasks._initialized) Tasks.render();
    } catch (err) {
      Toast.error(err.message || 'Sync failed');
    }
    this.render();
  },

  async disconnect(service) {
    if (!confirm(`Disconnect ${service === 'googleCalendar' ? 'Google Calendar' : (this._meta?.[service]?.name || service)}? All synced tasks will be removed.`)) return;
    try {
      if (service === 'googleCalendar') {
        await Store.disconnectCalendar();
        if (typeof Timetable !== 'undefined') {
          Timetable._calConnected = false;
          Timetable.renderSlots();
          Timetable.renderCanvas();
        }
      } else {
        await api(`/integrations/${service}/disconnect`, { method: 'POST' });
      }
      Toast.success(`Disconnected.`);
      if (typeof Tasks !== 'undefined' && Tasks._initialized) Tasks.render();
    } catch (err) {
      Toast.error(err.message || 'Failed to disconnect');
    }
    this.render();
  },

  async syncAll() {
    const btn = document.getElementById('connSyncAll');
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    try {
      const results = await api('/integrations/sync-all', { method: 'POST' });
      const total = Object.values(results).reduce((s, r) => s + (r.count || 0), 0);
      Toast.success(`Synced ${total} items total!`);
      if (typeof Tasks !== 'undefined' && Tasks._initialized) Tasks.render();
    } catch (err) {
      Toast.error(err.message || 'Sync failed');
    }
    btn.disabled = false;
    btn.textContent = '🔄 Sync All';
    this.render();
  }
};
