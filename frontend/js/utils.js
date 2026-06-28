const Utils = {
  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  },

  formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit'
    });
  },

  formatDateInput(date) {
    return new Date(date).toISOString().split('T')[0];
  },

  timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  },

  minutesToTime(min) {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  isToday(date) {
    return this.formatDateInput(date) === this.formatDateInput(new Date());
  },

  isOverdue(date) {
    const endOfDay = new Date(date + 'T23:59:59');
    return endOfDay < new Date();
  },

  daysUntil(date) {
    const now = new Date();
    const target = new Date(date);
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} days overdue`;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `${diff} days`;
  },

  priorityWeight(p) {
    return { urgent: 4, high: 3, medium: 2, low: 1 }[p] || 0;
  },

  getDayName(d) {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d];
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  showModal(id) {
    document.getElementById(id).classList.remove('hidden');
  },

  hideModal(id) {
    document.getElementById(id).classList.add('hidden');
  },

  showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${pageId}`);
    if (page) page.classList.add('active');
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.classList.toggle('active', a.dataset.page === pageId);
    });
    localStorage.setItem('pulse_last_page', pageId);
  },

  confetti(count = 60) {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    const colors = ['#b8774f', '#4e7a8a', '#d4a050', '#5b8c5a', '#818cf8', '#f59e0b', '#ef4444'];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const size = 6 + Math.random() * 8;
      piece.style.left = Math.random() * 100 + '%';
      piece.style.width = size + 'px';
      piece.style.height = size * (0.4 + Math.random() * 0.6) + 'px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.animationDuration = (2 + Math.random() * 2) + 's';
      piece.style.animationDelay = Math.random() * 0.5 + 's';
      container.appendChild(piece);
    }
    setTimeout(() => { if (container.parentNode) container.parentNode.removeChild(container); }, 5000);
  }
};
