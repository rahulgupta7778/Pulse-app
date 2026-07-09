const Toast = {
  _container: null,

  init() {
    this._container = document.createElement('div');
    this._container.id = 'toastContainer';
    this._container.className = 'toast-container';
    document.body.appendChild(this._container);
  },

  show(message, type = 'info', duration = 4000) {
    if (!this._container) this.init();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconMap = { success: '✓', error: '✕', info: '○', warning: '!' };
    toast.innerHTML = `<span class="toast-icon">${iconMap[type] || '○'}</span><span class="toast-msg">${message}</span>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', () => this._dismiss(toast));
    toast.appendChild(closeBtn);

    this._container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    if (duration > 0) {
      setTimeout(() => this._dismiss(toast), duration);
    }

    return toast;
  },

  success(message, duration) { return this.show(message, 'success', duration); },
  error(message, duration) { return this.show(message, 'error', duration); },
  info(message, duration) { return this.show(message, 'info', duration); },
  warning(message, duration) { return this.show(message, 'warning', duration); },

  undo(message, onUndo, duration = 6000) {
    if (!this._container) this.init();

    const toast = document.createElement('div');
    toast.className = 'toast toast-undo';

    toast.innerHTML = `<span class="toast-msg">${message}</span>`;

    const undoBtn = document.createElement('button');
    undoBtn.className = 'toast-undo-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', () => {
      onUndo();
      this._dismiss(toast);
    });
    toast.appendChild(undoBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', () => this._dismiss(toast));
    toast.appendChild(closeBtn);

    this._container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    if (duration > 0) {
      setTimeout(() => this._dismiss(toast), duration);
    }

    return toast;
  },

  _dismiss(toast) {
    if (toast.classList.contains('toast-hidden')) return;
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hidden');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }
};
