function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const Analytics = {
  async init() {
    await this.render();
    this.pomodoro.init();
  },

  async render() {
    const tasks = await Store.getTasks();
    this.renderScore(tasks);
    this.renderTaskChart(tasks);
    this.renderFocusChart(tasks);
    this.renderScoreChart(tasks);
    this.renderCategoryChart(tasks);
    this.renderHeatmap(tasks);
  },

  /* ---- Easing ---- */
  easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
  easeOutQuad(t) { return t * (2 - t); },

  /* ---- Animate helper ---- */
  animate(duration, drawFrame, onDone) {
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      drawFrame(progress);
      if (progress < 1) requestAnimationFrame(tick);
      else if (onDone) onDone();
    };
    requestAnimationFrame(tick);
  },

  /* ---- Score ---- */
  renderScore(tasks) {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const targetScore = total === 0 ? 0 : Math.round((completed / total) * 100);
    const circle = document.getElementById('scoreCircle');
    const value = document.getElementById('scoreValue');
    const label = document.getElementById('scoreLabel');
    const desc = document.getElementById('scoreDesc');

    circle.className = 'score-circle';
    label.textContent = 'Productivity Score';

    if (total === 0) {
      circle.classList.add('average');
      value.textContent = '--';
      desc.textContent = 'Add tasks and start completing them to see your productivity score.';
      return;
    }

    const cls = targetScore >= 80 ? 'excellent' : targetScore >= 60 ? 'good' : targetScore >= 40 ? 'average' : 'poor';
    circle.classList.add(cls);

    const msgs = {
      excellent: `You've completed ${completed} of ${total} tasks. Keep up the great work!`,
      good: `You've completed ${completed} of ${total} tasks. A little more effort!`,
      average: `You've completed ${completed} of ${total} tasks. Focus on one at a time.`,
      poor: `You've completed ${completed} of ${total} tasks. Start with small wins.`
    };
    desc.textContent = msgs[cls];

    value.textContent = '0%';
    this.animate(800, (p) => {
      const current = Math.round(this.easeOutCubic(p) * targetScore);
      value.textContent = current + '%';
    });
  },

  /* ---- Animated bar chart ---- */
  renderAnimatedBarChart(canvasId, data, options) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    const w = canvas.parentElement.clientWidth - 40;
    const h = 200;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const { label, max, colorStart, colorEnd, barW: customBarW, textColor, axisColor } = options;
    const maxVal = max || Math.max(...data.values, 1);
    const barW = customBarW || Math.max((w - 40) / data.values.length - 4, 8);
    const gap = (w - 40) / data.values.length;

    ctx.clearRect(0, 0, w, h);

    /* label */
    ctx.fillStyle = textColor;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 10, 14);

    this.animate(700, (p) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = textColor;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, 10, 14);

      data.values.forEach((c, i) => {
        const x = 20 + i * gap;
        const targetH = (c / maxVal) * (h - 40);
        const currentH = targetH * this.easeOutCubic(p);
        const y = h - 20 - currentH;

        const grad = ctx.createLinearGradient(0, y, 0, h - 20);
        grad.addColorStop(0, colorStart);
        grad.addColorStop(1, colorEnd);
        ctx.fillStyle = grad;

        const r = Math.min(barW / 2, 4);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, h - 20 - r);
        ctx.quadraticCurveTo(x + barW, h - 20, x + barW - r, h - 20);
        ctx.lineTo(x + r, h - 20);
        ctx.quadraticCurveTo(x, h - 20, x, h - 20 - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.fill();
      });

      ctx.fillStyle = axisColor;
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      data.values.forEach((c, i) => {
        const x = 20 + i * gap + barW / 2;
        ctx.fillText(data.labels[i], x, h - 5);
      });
    });
  },

  /* ---- Tasks completed chart ---- */
  renderTaskChart(tasks) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(Utils.formatDateInput(d));
    }
    const counts = days.map(day =>
      tasks.filter(t => t.completed && t.completedAt && Utils.formatDateInput(t.completedAt) === day).length
    );
    this.renderAnimatedBarChart('chartTasks', {
      values: counts,
      labels: days.map(d => d.slice(5))
    }, {
      label: 'Tasks completed (last 7 days)',
      colorStart: getCSSVar('--chart-bar-task-start'),
      colorEnd: getCSSVar('--chart-bar-task-end'),
      textColor: getCSSVar('--chart-text'),
      axisColor: getCSSVar('--chart-axis')
    });
  },

  /* ---- Focus hours chart ---- */
  renderFocusChart(tasks) {
    const dayLabels = [];
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(Utils.formatDateInput(d));
      dayLabels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }
    const focusHours = days.map(day => {
      const dayTasks = tasks.filter(t => t.completed && t.completedAt && Utils.formatDateInput(t.completedAt) === day);
      return Math.round(dayTasks.reduce((s, t) => s + (t.duration || 30), 0) / 60);
    });
    this.renderAnimatedBarChart('chartFocus', {
      values: focusHours,
      labels: dayLabels
    }, {
      label: 'Focus hours (last 7 days)',
      colorStart: getCSSVar('--chart-bar-focus-start'),
      colorEnd: getCSSVar('--chart-bar-focus-end'),
      textColor: getCSSVar('--chart-text'),
      axisColor: getCSSVar('--chart-axis')
    });
  },

  /* ---- Score trend (animated line draw) ---- */
  renderScoreChart(tasks) {
    const canvas = document.getElementById('chartScore');
    const ctx = canvas.getContext('2d');
    const w = canvas.parentElement.clientWidth - 40;
    const h = 200;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const dayLabels = [];
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(Utils.formatDateInput(d));
      dayLabels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }

    const scores = days.map(day => {
      const dayTasks = tasks.filter(t => {
        const date = t.completedAt || t.createdAt || t.dueDate;
        return date && Utils.formatDateInput(date) === day;
      });
      const total = dayTasks.length;
      if (total === 0) return null;
      return Math.round((dayTasks.filter(t => t.completed).length / total) * 100);
    });

    const gap = (w - 40) / 7;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    [25, 50, 75, 100].forEach(v => {
      const y = h - 20 - (v / 100) * (h - 40);
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
      ctx.fillStyle = getCSSVar('--chart-text');
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(v + '%', 16, y + 3);
    });
    ctx.setLineDash([]);

    ctx.fillStyle = getCSSVar('--chart-text');
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Productivity score trend', 10, 14);

    const points = scores.map((s, i) => ({
      x: 20 + i * gap + gap / 2,
      y: s !== null ? h - 20 - (s / 100) * (h - 40) : null,
      val: s
    }));

    this.animate(1000, (p) => {
      const progress = this.easeOutCubic(p);

      ctx.beginPath();
      ctx.strokeStyle = getCSSVar('--chart-line');
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      let started = false;

      points.forEach((pt, i) => {
        if (pt.y === null) { started = false; return; }
        const prev = points[i - 1];
        const segmentProgress = prev && prev.y !== null ? Math.min(Math.max((progress * points.length - i + 1), 0), 1) : 1;

        if (!started) {
          ctx.moveTo(pt.x, pt.y);
          started = true;
          return;
        }

        const prevX = prev.x;
        const prevY = prev.y;
        const cp1x = prevX + (pt.x - prevX) * 0.3;
        const cp1y = prevY;
        const cp2x = pt.x - (pt.x - prevX) * 0.3;
        const cp2y = pt.y;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, pt.x, pt.y);
      });

      ctx.stroke();

      /* dots */
      points.forEach((pt, i) => {
        if (pt.y === null || i / points.length > progress + 0.05) return;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = getCSSVar('--chart-line');
        ctx.fill();
        ctx.strokeStyle = getCSSVar('--chart-dot-stroke');
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });
  },

  /* ---- Category pie (animated reveal) ---- */
  renderCategoryChart(tasks) {
    const canvas = document.getElementById('chartCategory');
    const ctx = canvas.getContext('2d');
    const w = Math.max(canvas.parentElement.clientWidth - 40, 100);
    const h = 200;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const categories = ['work', 'study', 'personal', 'health', 'finance', 'other'];
    const colors = [
      getCSSVar('--chart-pie-1'),
      getCSSVar('--chart-pie-2'),
      getCSSVar('--chart-pie-3'),
      getCSSVar('--chart-pie-4'),
      getCSSVar('--chart-pie-5'),
      getCSSVar('--chart-pie-6')
    ];
    const counts = categories.map(c => tasks.filter(t => t.category === c).length);
    const total = counts.reduce((a, b) => a + b, 0) || 1;

    const cx = w / 2 - 30;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, w, h);

    /* legend */
    let legendY = 20;
    categories.forEach((cat, i) => {
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.roundRect(w - 80, legendY, 10, 10, 2);
      ctx.fill();
      ctx.fillStyle = getCSSVar('--chart-axis');
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(cat.charAt(0).toUpperCase() + cat.slice(1), w - 64, legendY + 9);
      legendY += 20;
    });

    ctx.fillStyle = getCSSVar('--chart-text');
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Tasks by category', 10, 14);

    if (total > 0) {
      ctx.fillStyle = getCSSVar('--chart-text');
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(total + ' total', cx, cy + 4);
    }

    this.animate(800, (p) => {
      const progress = this.easeOutQuad(p);
      const totalAngle = progress * Math.PI * 2;
      let startAngle = -Math.PI / 2;

      /* fade out previous */
      ctx.clearRect(0, 0, cx + r + 10, h);

      counts.forEach((c, i) => {
        if (c === 0) return;
        const sliceAngle = (c / total) * Math.PI * 2;
        const endAngle = startAngle + Math.min(sliceAngle, Math.max(0, totalAngle - (startAngle + Math.PI / 2)));

        if (endAngle <= startAngle) return;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = colors[i];
        ctx.fill();
        startAngle += sliceAngle;
      });

      /* full circle outline when done */
      if (progress >= 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = getCSSVar('--chart-grid');
        ctx.lineWidth = 1;
        ctx.stroke();

        if (total > 0) {
          ctx.fillStyle = getCSSVar('--chart-text');
          ctx.font = '10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(total + ' total', cx, cy + 4);
        }
      }
    }, () => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = getCSSVar('--chart-grid');
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  },

  /* ---- Heatmap ---- */
  renderHeatmap(tasks) {
    const container = document.getElementById('heatmapContainer');
    if (!container) return;
    const weeks = 17;
    const today = new Date();
    const dayMs = 86400000;

    const dateMap = {};
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(today.getTime() - (weeks * 7 - 1 - i) * dayMs);
      const key = d.toISOString().split('T')[0];
      dateMap[key] = { date: d, count: tasks.filter(t => t.completed && t.completedAt && t.completedAt.startsWith(key)).length };
    }

    const maxCount = Math.max(1, ...Object.values(dateMap).map(d => d.count));
    const w = container.clientWidth - 24;
    const cellSize = Math.max(10, Math.min(14, Math.floor((w - 30) / (weeks + 1))));
    const gap = 3;
    const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

    let html = `<div style="display:flex;gap:${gap}px;">`;
    html += `<div style="display:flex;flex-direction:column;gap:${gap}px;padding-top:20px;width:28px;flex-shrink:0;">`;
    dayLabels.forEach(l => html += `<div style="height:${cellSize}px;line-height:${cellSize}px;font-size:9px;color:var(--text-muted);text-align:right;padding-right:4px;">${l}</div>`);
    html += '</div>';

    const monthLabels = [];
    for (let w = 0; w < weeks; w++) {
      const d = new Date(today.getTime() - (weeks - 1 - w) * 7 * dayMs);
      const m = d.toLocaleDateString('en-US', { month: 'short' });
      if (!monthLabels.length || monthLabels[monthLabels.length - 1].m !== m) monthLabels.push({ m, w });
    }

    html += '<div><div style="display:flex;gap:3px;height:20px;align-items:flex-end;margin-bottom:2px;">';
    for (let w = 0; w < weeks; w++) {
      const ml = monthLabels.find(x => x.w === w);
      html += `<div style="width:${cellSize}px;text-align:center;font-size:8px;color:var(--text-muted);font-weight:500;">${ml ? ml.m : ''}</div>`;
    }
    html += '</div>';

    for (let day = 0; day < 7; day++) {
      html += `<div style="display:flex;gap:3px;margin-bottom:${gap}px;">`;
      for (let w = 0; w < weeks; w++) {
        const d = new Date(today.getTime() - (weeks * 7 - 1 - (w * 7 + day)) * dayMs);
        const key = d.toISOString().split('T')[0];
        const info = dateMap[key];
        const count = info ? info.count : 0;
        const intensity = count / maxCount;
        const isToday = key === today.toISOString().split('T')[0];
        const isFuture = d > today;

        let bg;
        if (isFuture) bg = 'transparent';
        else if (count === 0) bg = getCSSVar('--border');
        else if (intensity > 0.66) bg = '#059669';
        else if (intensity > 0.33) bg = '#34d399';
        else bg = '#a7f3d0';

        const title = isFuture ? '' : `${key}: ${count} task${count !== 1 ? 's' : ''} completed`;
        html += `<div title="${title}" style="width:${cellSize}px;height:${cellSize}px;border-radius:3px;background:${bg};${isToday ? 'outline:2px solid var(--primary);outline-offset:-1px;' : ''}${isFuture ? 'border:1px dashed var(--border);' : ''}"></div>`;
      }
      html += '</div>';
    }

    html += '<div style="display:flex;align-items:center;gap:4px;margin-top:6px;font-size:9px;color:var(--text-muted);">';
    html += '<span>Less</span>';
    ['var(--border)', '#a7f3d0', '#34d399', '#059669'].forEach(c => {
      html += `<div style="width:10px;height:10px;border-radius:2px;background:${c};"></div>`;
    });
    html += '<span>More</span></div></div></div>';

    container.innerHTML = html;
  },

  /* ===== Pomodoro ===== */
  pomodoro: {
    timer: null,
    running: false,
    minutes: 25,
    seconds: 0,
    sessionCount: 0,

    init() {
      document.getElementById('pomoStartBtn').addEventListener('click', () => this.start());
      document.getElementById('pomoPauseBtn').addEventListener('click', () => this.pause());
      document.getElementById('pomoResetBtn').addEventListener('click', () => this.reset());
    },

    start() {
      if (this.running) return;
      this.running = true;
      document.getElementById('pomoStartBtn').disabled = true;
      document.getElementById('pomoPauseBtn').disabled = false;
      document.getElementById('pomoStatus').textContent = 'Focus time!';
      this.timer = setInterval(() => {
        if (this.seconds === 0) {
          if (this.minutes === 0) { this.complete(); return; }
          this.minutes--;
          this.seconds = 59;
        } else this.seconds--;
        this.updateDisplay();
      }, 1000);
    },

    pause() {
      this.running = false;
      clearInterval(this.timer);
      document.getElementById('pomoStartBtn').disabled = false;
      document.getElementById('pomoPauseBtn').disabled = true;
      document.getElementById('pomoStatus').textContent = 'Paused';
    },

    reset() {
      this.running = false;
      clearInterval(this.timer);
      this.minutes = 25;
      this.seconds = 0;
      this.updateDisplay();
      document.getElementById('pomoStartBtn').disabled = false;
      document.getElementById('pomoPauseBtn').disabled = true;
      document.getElementById('pomoStatus').textContent = 'Ready to focus';
    },

    complete() {
      clearInterval(this.timer);
      this.running = false;
      this.sessionCount++;
      this.minutes = 25;
      this.seconds = 0;
      this.updateDisplay();
      document.getElementById('pomoStartBtn').disabled = false;
      document.getElementById('pomoPauseBtn').disabled = true;
      document.getElementById('pomoStatus').textContent = 'Great focus session! Take a 5-min break.';
      document.getElementById('pomoSessions').textContent = `Sessions completed: ${this.sessionCount}`;
      try { new Notification('Pomodoro Complete!', { body: 'Great work! Time for a short break.' }); } catch {}
    },

    updateDisplay() {
      document.getElementById('timerDisplay').textContent =
        `${String(this.minutes).padStart(2, '0')}:${String(this.seconds).padStart(2, '0')}`;
    }
  }
};
