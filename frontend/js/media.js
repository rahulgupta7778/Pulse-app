const MediaHelper = {
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    });
  },

  getMapsUrl(text) {
    return 'https://www.google.com/maps/search/' + encodeURIComponent(text);
  },

  setupLocationField(inputId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <input type="text" id="${inputId}" placeholder="e.g. Room 301, Address" style="flex:1;min-width:150px;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:16px;background:var(--bg-card);color:var(--text);">
        <button type="button" class="btn-sm locate-btn" title="Use my location">📍</button>
        <button type="button" class="btn-sm maps-btn" title="Open in Google Maps" style="display:none;">🗺️</button>
      </div>`;

    const locateBtn = container.querySelector('.locate-btn');
    const mapsBtn = container.querySelector('.maps-btn');
    const inp = container.querySelector('#' + inputId);

    locateBtn.addEventListener('click', async () => {
      locateBtn.textContent = '⏳';
      locateBtn.disabled = true;
      try {
        const pos = await MediaHelper.getCurrentPosition();
        const addr = `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}`;
        inp.value = addr;
        mapsBtn.style.display = '';
        mapsBtn.onclick = () => window.open(MediaHelper.getMapsUrl(addr), '_blank');
        Toast.success('Location detected');
      } catch (e) {
        Toast.warning(e.message || 'Could not get location. Type it manually.');
      }
      locateBtn.textContent = '📍';
      locateBtn.disabled = false;
    });

    inp.addEventListener('input', () => {
      mapsBtn.style.display = inp.value.trim() ? '' : 'none';
      mapsBtn.onclick = () => window.open(MediaHelper.getMapsUrl(inp.value), '_blank');
    });
  },

  setupLinksField(textareaId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <textarea id="${textareaId}" placeholder="Paste URLs here (one per line)" rows="2" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:16px;background:var(--bg-card);color:var(--text);box-sizing:border-box;"></textarea>`;
  }
};
