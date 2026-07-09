const Integrations = {
  _config: null,

  async init() {
    try {
      this._config = await api('/config');
    } catch {}
    this.render();
  },

  async render() {
    const container = document.getElementById('connectedServices');
    if (!container) return;

    let status;
    try {
      status = await api('/integrations/status');
    } catch {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Log in to manage integrations.</p>';
      return;
    }

    container.innerHTML = `
      <div class="int-grid">
        ${this._gmailCard(status.gmail)}
      </div>
      <div style="margin-top:0.75rem;text-align:right;">
        <button class="btn-sm" onclick="Integrations.syncAll()" id="syncAllBtn">🔄 Sync All Now</button>
      </div>
    `;
  },

  _gmailCard(status) {
    const connected = status?.connected;
    const email = status?.email;
    const lastSync = status?.lastSync;
    const lastSyncText = lastSync ? new Date(lastSync).toLocaleString() : 'Never';

    return `
      <div class="int-card ${connected ? 'int-connected' : ''}" id="int-card-gmail">
        <div class="int-icon">📧</div>
        <div class="int-info">
          <strong>Gmail</strong>
          ${connected ? `
            <span class="int-status int-connected-text">✓ Connected${email ? ' — ' + email : ''}</span>
            <span class="int-last-sync">Last sync: ${lastSyncText}</span>
            <div class="int-actions">
              <button class="btn-sm" onclick="Integrations.sync('gmail')" id="sync-gmail">Sync now</button>
              <button class="btn-sm" onclick="Integrations.disconnect('gmail')" style="color:var(--danger);">Disconnect</button>
            </div>
          ` : `
            <span class="int-status">Not connected</span>
            <div class="int-actions">
              <button class="btn-sm" onclick="Integrations.connect('gmail')">Connect Gmail</button>
            </div>
          `}
        </div>
      </div>
    `;
  },

  async connect(service) {
    const path = 'google';
    try {
      const data = await api(`/integrations/${path}/auth-url`);
      if (data.url) window.location.href = data.url;
    } catch (err) {
      Toast.error(err.message || 'Failed to get auth URL');
    }
  },

  async sync(service) {
    const btn = document.getElementById(`sync-${service}`);
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    try {
      const result = await api(`/integrations/${service}/sync`, { method: 'POST' });
      const count = result.count || 0;
      Toast.success(`Synced ${count} item${count !== 1 ? 's' : ''} from ${service}!`);
      await this.render();
      if (typeof Tasks !== 'undefined') Tasks.render();
    } catch (err) {
      Toast.error(err.message || `Sync failed for ${service}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sync now';
    }
  },

  async syncAll() {
    const btn = document.getElementById('syncAllBtn');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Syncing all...';
    try {
      const results = await api('/integrations/sync-all', { method: 'POST' });
      const total = Object.values(results).reduce((s, r) => s + (r.count || 0), 0);
      Toast.success(`Synced ${total} item${total !== 1 ? 's' : ''} total!`);
      await this.render();
      if (typeof Tasks !== 'undefined') Tasks.render();
    } catch (err) {
      Toast.error(err.message || 'Sync failed');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Sync All Now';
    }
  },

  async disconnect(service) {
    if (!confirm(`Disconnect ${service}? All synced tasks from this service will be removed.`)) return;
    try {
      await api(`/integrations/${service}/disconnect`, { method: 'POST' });
      Toast.success(`${service} disconnected`);
      await this.render();
      if (typeof Tasks !== 'undefined') Tasks.render();
    } catch (err) {
      Toast.error(err.message || 'Disconnect failed');
    }
  }
};
