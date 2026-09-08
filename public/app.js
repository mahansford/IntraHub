// Icons come from icons.js (loaded before this file): svgIcon(name, size),
// renderIcon(value, size) [falls back to text for unknown values], plus
// ICON_PICKER_NAMES, WEATHER_ICON_NAMES, DEFAULT_LINK_ICON, DEFAULT_AVATAR_ICON.

const state = {
  settings: {},
  sections: [],
  authStatus: { pinRequired: false, unlocked: true },
  editMode: false,
  loadHistory: [],
  lastStatsSampleAt: 0,
  kioskMode: false,
  kioskIndex: 0,
};

let kioskTimer = null;
let dragState = null; // { id, startIndex } while a section drag is in progress

const THEMES = ['neon', 'sunset', 'ocean', 'forest'];

const SECTION_ICON_NAMES = {
  weather: 'cloud',
  todo: 'square-check',
  links: 'grid-3x3',
  leaderboard: 'trophy',
  stats: 'activity',
  notes: 'message-square',
  countdown: 'hourglass',
  stocks: 'trending-up',
  chores: 'list-checks',
  photos: 'image',
  calendar: 'calendar',
};

const SECTION_TYPE_LABELS = {
  links: 'Links',
  todo: 'To-do list',
  leaderboard: 'Leaderboard',
  weather: 'Weather',
  stats: 'Server Stats',
  notes: 'Notes',
  countdown: 'Countdown',
  stocks: 'Stocks',
  chores: 'Chores',
  photos: 'Photos',
  calendar: 'Calendar',
};

// Sections a viewer can drag-reorder are tracked by id; ACCENT_COLOR_OPTIONS
// are the swatches offered in the per-section accent picker (kept in step
// with the app's own theme accent hues so it feels like one system).
const ACCENT_COLOR_OPTIONS = ['#22e8ff', '#ff3ec9', '#84cc16', '#f97316', '#a855f7', '#06b6d4', '#facc15', '#f43f5e'];

// ---- Helpers ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

function initialsFromTitle(title) {
  const words = (title || 'IntraHub').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'IH';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

function ringGauge(percent, { size = 68, stroke = 7, color = 'var(--accent)' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const offset = c - (pct / 100) * c;
  return `
    <div class="ring-gauge" style="width:${size}px; height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" style="fill:none; stroke:rgba(255,255,255,0.08); stroke-width:${stroke};" />
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" style="fill:none; stroke:${color}; stroke-width:${stroke}; stroke-linecap:round;" stroke-dasharray="${c}" stroke-dashoffset="${offset}" />
      </svg>
      <div class="ring-gauge-label">${percent == null ? '—' : pct + '%'}</div>
    </div>`;
}

function sparkline(values, { width = 130, height = 34, color = 'var(--accent)' } = {}) {
  if (!values.length) {
    return `<div class="sparkline-wrap muted" style="font-size:0.72rem; padding-top:4px;">Gathering history…</div>`;
  }
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - (Math.min(v, max) / max) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<div class="sparkline-wrap"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polyline points="${points}" style="fill:none; stroke:${color}; stroke-width:2; stroke-linecap:round; stroke-linejoin:round;" /></svg></div>`;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    alert('Edit session expired — please unlock again.');
    state.editMode = false;
    state.authStatus.unlocked = false;
    render();
    throw new Error('unauthorized');
  }
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- Clock ----
function updateClock() {
  const now = new Date();
  document.getElementById('clock-time').textContent = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  document.getElementById('clock-date').textContent = now.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// ---- Load ----
function initStaticIcons() {
  document.getElementById('footer-heart').innerHTML = svgIcon('heart', 14);
}

async function loadMeta() {
  try {
    const meta = await api('/api/meta');
    document.getElementById('footer-license').textContent = meta.license;
    document.getElementById('footer-source').href = meta.sourceUrl;
  } catch (err) {
    /* footer is cosmetic, ignore failures */
  }
}

async function loadAuthStatus() {
  try {
    state.authStatus = await api('/api/auth/status');
  } catch (err) {
    state.authStatus = { pinRequired: false, unlocked: true };
  }
}

async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    state.settings = data.settings;
    state.sections = data.sections;
    render();
  } catch (err) {
    document.getElementById('dashboard').innerHTML = `<p class="error-text">Couldn't load the dashboard (is the database configured?).</p>`;
  }
}

// ---- Weather (fetched separately, filled into slots) ----
async function loadAllWeather() {
  const slots = document.querySelectorAll('[data-weather-slot]');
  if (!slots.length) return;
  try {
    const w = await api('/api/weather');
    const html = `
      <span class="weather-icon">${svgIcon(w.current.icon, 46)}</span>
      <div>
        <div class="weather-temp">${w.currentTempC}°C</div>
        <div class="weather-meta">${w.current.text} · ${escapeHtml(w.location)}</div>
        <div class="weather-meta mono">H ${w.todayHighC}° · L ${w.todayLowC}°</div>
      </div>`;
    slots.forEach((el) => (el.innerHTML = html));
  } catch (err) {
    slots.forEach((el) => (el.innerHTML = `<p class="error-text">Couldn't load weather right now.</p>`));
  }
}

// ---- Server stats (fetched separately, filled into slots) ----
async function loadAllStats() {
  const slots = document.querySelectorAll('[data-stats-slot]');
  if (!slots.length) return;
  try {
    const s = await api('/api/stats');

    const now = Date.now();
    if (now - state.lastStatsSampleAt > 8000) {
      state.loadHistory.push(s.load ? s.load.one : 0);
      if (state.loadHistory.length > 24) state.loadHistory.shift();
      state.lastStatsSampleAt = now;
    }

    const load = s.load ? s.load.one.toFixed(2) : '—';
    const memPct = s.memory?.usedPercent ?? null;
    const diskPct = s.disk?.usedPercent ?? null;

    const html = `
      <div class="stat-tile">
        <div class="stat-label">${svgIcon('cpu', 13)} Load avg${s.cpuCount ? ` · ${s.cpuCount} cores` : ''}</div>
        <div class="stat-value">${load}</div>
        ${sparkline(state.loadHistory, { color: 'var(--accent)' })}
      </div>
      <div class="stat-tile stat-tile-gauge">
        <div class="stat-label">${svgIcon('memory-stick', 13)} Memory</div>
        ${ringGauge(memPct, { color: 'var(--accent)' })}
        <div class="stat-sub">${formatBytes(s.memory?.usedBytes)} / ${formatBytes(s.memory?.totalBytes)}</div>
      </div>
      <div class="stat-tile stat-tile-gauge">
        <div class="stat-label">${svgIcon('hard-drive', 13)} Disk</div>
        ${ringGauge(diskPct, { color: 'var(--primary)' })}
        <div class="stat-sub">${formatBytes(s.disk?.usedBytes)} / ${formatBytes(s.disk?.totalBytes)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">${svgIcon('clock', 13)} Uptime</div>
        <div class="stat-value mono" style="font-size:1.05rem;">${s.uptimeText}</div>
      </div>
    `;
    slots.forEach((el) => {
      el.innerHTML = html;
      const note = el.parentElement.querySelector('[data-stats-note]');
      if (note) {
        note.textContent = s.hostMounted
          ? ''
          : "Showing this container's own resources — mount the host /proc and / for true host stats (see docker-compose.yml).";
      }
    });
  } catch (err) {
    slots.forEach((el) => (el.innerHTML = `<p class="error-text">Couldn't read server stats right now.</p>`));
  }
}

// ---- Stocks (fetched separately per section, filled into slots) ----
async function loadAllStocks() {
  const slots = document.querySelectorAll('[data-stocks-slot]');
  if (!slots.length) return;
  await Promise.all(
    Array.from(slots).map(async (el) => {
      const symbols = el.dataset.symbols;
      if (!symbols) {
        el.innerHTML = `<p class="muted">No symbols yet — add one in Customize mode.</p>`;
        return;
      }
      try {
        const res = await api(`/api/stocks?symbols=${encodeURIComponent(symbols)}`);
        if (!res.configured) {
          el.innerHTML = `<p class="muted small">Add a free <a href="https://finnhub.io/register" target="_blank" rel="noopener">Finnhub API key</a> as <code>FINNHUB_API_KEY</code> to show live quotes.</p>`;
          return;
        }
        if (!res.quotes.length) {
          el.innerHTML = `<p class="muted">No data for these symbols.</p>`;
          return;
        }
        el.innerHTML = res.quotes
          .map((q) => {
            const up = q.changePercent != null && q.changePercent >= 0;
            const changeText = q.changePercent != null ? `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—';
            return `
          <div class="stock-row">
            <span class="stock-symbol">${escapeHtml(q.symbol)}</span>
            <span class="stock-price mono">${q.price != null ? '$' + q.price.toFixed(2) : '—'}</span>
            <span class="stock-change ${up ? 'up' : 'down'}">${svgIcon(up ? 'trending-up' : 'trending-down', 13)} ${changeText}</span>
          </div>`;
          })
          .join('');
      } catch (err) {
        el.innerHTML = `<p class="error-text">Couldn't load stock quotes right now.</p>`;
      }
    })
  );
}

// ---- Calendar (fetched separately per section, filled into slots) ----
function formatEventTime(iso, allDay) {
  const d = new Date(iso);
  const dayLabel = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  if (allDay) return dayLabel;
  const timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dayLabel} · ${timeLabel}`;
}

async function loadAllCalendars() {
  const slots = document.querySelectorAll('[data-calendar-slot]');
  if (!slots.length) return;
  await Promise.all(
    Array.from(slots).map(async (el) => {
      const sectionId = el.dataset.sectionId;
      try {
        const res = await api(`/api/sections/${sectionId}/calendar/events`);
        if (!res.configured) {
          el.innerHTML = `<p class="muted">No calendar linked yet.</p>`;
          return;
        }
        if (!res.events.length) {
          el.innerHTML = `<p class="muted">No upcoming events.</p>`;
          return;
        }
        el.innerHTML = res.events
          .map(
            (ev) => `
          <div class="calendar-event">
            <div class="calendar-event-summary">${escapeHtml(ev.summary)}${ev.recurring ? ' <span class="muted small" style="margin:0;">(recurring)</span>' : ''}</div>
            <div class="calendar-event-time mono">${formatEventTime(ev.start, ev.allDay)}${ev.location ? ' · ' + escapeHtml(ev.location) : ''}</div>
          </div>`
          )
          .join('');
      } catch (err) {
        el.innerHTML = `<p class="error-text">Couldn't load that calendar right now.</p>`;
      }
    })
  );
}

// ---- Photo slideshow (client-side rotation through already-loaded images) ----
// Every render() rebuilds the DOM, orphaning any slideshow <img> a previous
// interval still targets — track timers in a plain array and clear all of
// them up front so they don't pile up forever on a long-running kiosk.
let photoSlideshowTimers = [];

function loadAllPhotoSlideshows() {
  photoSlideshowTimers.forEach(clearInterval);
  photoSlideshowTimers = [];

  const slots = document.querySelectorAll('[data-photo-slot]');
  slots.forEach((el) => {
    const urls = (el.dataset.photos || '').split('|||').filter(Boolean);
    if (!urls.length) return;
    let index = 0;
    const img = el.querySelector('img');
    img.src = urls[0];
    if (urls.length > 1) {
      const timer = setInterval(() => {
        index = (index + 1) % urls.length;
        img.style.opacity = '0';
        setTimeout(() => {
          img.src = urls[index];
          img.style.opacity = '1';
        }, 300);
      }, 6000);
      photoSlideshowTimers.push(timer);
    }
  });
}

const MAX_PHOTO_FILE_BYTES = 900_000;

async function uploadPhotos(sectionId, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (file.size > MAX_PHOTO_FILE_BYTES) {
      alert(`"${file.name}" is too large — please use images under 900KB.`);
      continue;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    try {
      await api(`/api/sections/${sectionId}/photos`, {
        method: 'POST',
        body: JSON.stringify({ image_data_url: dataUrl }),
      });
    } catch (err) {
      if (err.message !== 'unauthorized') alert(err.message);
      break;
    }
  }
  await loadDashboard();
}

// ---- Render ----
function render() {
  applyTheme();
  applyBackground();
  renderHeader();
  if (state.kioskMode) {
    renderKiosk();
  } else {
    renderDashboard();
  }
  // Rebuilding the dashboard DOM (every render — not just after a fresh
  // fetch) replaces any already-filled weather/stats/stocks/calendar slots
  // with their "Loading…" placeholders, so refill them every time.
  loadAllWeather();
  loadAllStats();
  loadAllStocks();
  loadAllCalendars();
  loadAllPhotoSlideshows();
}

function applyTheme() {
  const theme = THEMES.includes(state.settings.theme) ? state.settings.theme : 'neon';
  document.documentElement.setAttribute('data-theme', theme);
}

function applyBackground() {
  const url = state.settings.background_data_url;
  if (url) {
    document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${url})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
  } else {
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundPosition = '';
    document.body.style.backgroundAttachment = '';
  }
}

function renderHeader() {
  const title = state.settings.site_title || 'IntraHub';
  document.getElementById('site-title').textContent = title;
  document.getElementById('page-title').textContent = title;

  const logoBox = document.getElementById('logo-box');
  logoBox.classList.toggle('editable', state.editMode);
  logoBox.classList.toggle('custom-image', Boolean(state.settings.logo_data_url));
  if (state.settings.logo_data_url) {
    logoBox.style.backgroundImage = `url(${state.settings.logo_data_url})`;
    logoBox.textContent = '';
  } else {
    logoBox.style.backgroundImage = '';
    logoBox.textContent = initialsFromTitle(title);
  }
  // A custom logo is usually a self-contained wordmark — showing the plain
  // text title right next to it just repeats the same name twice.
  document.getElementById('site-title').hidden = Boolean(state.settings.logo_data_url);

  document.getElementById('edit-toggle-icon').innerHTML = svgIcon(state.editMode ? 'square-check' : 'settings', 16);
  document.getElementById('edit-toggle-label').textContent = state.editMode ? 'Done' : 'Customize';
  document.getElementById('edit-toggle').classList.toggle('active', state.editMode);
  document.getElementById('kiosk-toggle-icon').innerHTML = svgIcon('monitor', 16);
}

function renderDashboard() {
  const root = document.getElementById('dashboard');
  root.classList.remove('kiosk-active');
  const visible = state.sections.filter((s) => s.enabled || state.editMode);

  let html = '';
  if (state.editMode) html += renderSettingsCard();
  if (!visible.length && !state.editMode) {
    html += `<p class="muted">Nothing here yet.</p>`;
  } else {
    html += visible.map(renderSection).join('');
  }
  if (state.editMode) html += renderAddSectionBar();

  root.innerHTML = html;
}

// ---- Kiosk mode: auto-cycling fullscreen view for a wall-mounted tablet ----
function renderKiosk() {
  const root = document.getElementById('dashboard');
  root.classList.add('kiosk-active');
  const enabled = state.sections.filter((s) => s.enabled);
  if (!enabled.length) {
    root.innerHTML = `<p class="muted">Nothing enabled to show in kiosk mode.</p>`;
    return;
  }
  if (state.kioskIndex >= enabled.length) state.kioskIndex = 0;
  const section = enabled[state.kioskIndex];
  root.innerHTML = `
    <button type="button" class="kiosk-exit" data-action="exit-kiosk" title="Exit kiosk mode">${svgIcon('x', 16)}</button>
    <div class="kiosk-view">${renderSection(section)}</div>
  `;
}

function enterKiosk() {
  state.kioskMode = true;
  state.kioskIndex = 0;
  document.body.classList.add('kiosk-mode');
  if (kioskTimer) clearInterval(kioskTimer);
  kioskTimer = setInterval(() => {
    const enabledCount = state.sections.filter((s) => s.enabled).length;
    if (!enabledCount) return;
    state.kioskIndex = (state.kioskIndex + 1) % enabledCount;
    render();
  }, 12000);
  render();
}

function exitKiosk() {
  state.kioskMode = false;
  document.body.classList.remove('kiosk-mode');
  if (kioskTimer) {
    clearInterval(kioskTimer);
    kioskTimer = null;
  }
  render();
}

document.getElementById('kiosk-toggle').addEventListener('click', enterKiosk);

function renderSettingsCard() {
  const s = state.settings;
  const currentTheme = THEMES.includes(s.theme) ? s.theme : 'neon';
  return `
  <section class="card settings-card">
    <div class="section-header-title" style="margin-bottom: 20px;">
      ${svgIcon('settings', 18)}
      <h2>Dashboard Settings</h2>
    </div>

    <div class="settings-groups">
      <div>
        <div class="settings-group-label">Logo</div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="${s.logo_data_url ? `height:60px; width:auto; min-width:44px; max-width:220px; background:url(${s.logo_data_url}) left center/contain no-repeat;` : `width:44px; height:44px; background:linear-gradient(135deg, var(--primary), var(--accent));`} border-radius:13px; display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--on-primary); flex-shrink:0;">${s.logo_data_url ? '' : escapeHtml(initialsFromTitle(s.site_title))}</div>
          <button type="button" class="btn-secondary" data-action="upload-logo">${svgIcon('upload', 14)} Upload image</button>
        </div>
      </div>
      <div>
        <div class="settings-group-label">Theme</div>
        <div class="theme-swatches">
          ${THEMES.map(
            (theme) => `<button type="button" class="theme-swatch ${theme === currentTheme ? 'selected' : ''}" data-action="set-theme" data-theme-value="${theme}" title="${theme[0].toUpperCase() + theme.slice(1)}"><span class="theme-swatch-fill theme-swatch-${theme}"></span></button>`
          ).join('')}
        </div>
      </div>
      <div>
        <div class="settings-group-label">Background image</div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn-secondary" data-action="upload-background">${svgIcon('image', 14)} ${s.background_data_url ? 'Change' : 'Upload'}</button>
          ${s.background_data_url ? `<button type="button" class="btn-secondary" data-action="remove-background">${svgIcon('x', 14)} Remove</button>` : ''}
        </div>
      </div>
      <div>
        <div class="settings-group-label">Backup</div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn-secondary" data-action="download-backup">${svgIcon('download', 14)} Download</button>
          <button type="button" class="btn-secondary" data-action="restore-backup">${svgIcon('upload', 14)} Restore…</button>
        </div>
      </div>
    </div>

    <form class="settings-form" data-action="save-settings">
      <label>Dashboard title
        <input name="site_title" value="${escapeAttr(s.site_title || '')}" />
      </label>
      <label>Weather location name
        <input name="weather_location_name" value="${escapeAttr(s.weather_location_name || '')}" />
      </label>
      <label>Latitude
        <input name="weather_lat" value="${escapeAttr(s.weather_lat || '')}" />
      </label>
      <label>Longitude
        <input name="weather_lon" value="${escapeAttr(s.weather_lon || '')}" />
      </label>
      <div class="modal-actions">
        <button type="submit" class="btn-primary">Save settings</button>
        ${state.authStatus.pinRequired ? `<button type="button" class="btn-secondary" data-action="lock-now">${svgIcon('lock', 14)} Lock now</button>` : ''}
      </div>
    </form>
  </section>`;
}

function renderAddSectionBar() {
  return `
  <section class="card add-section-card">
    <div class="section-header-title" style="margin-bottom: 16px;">
      ${svgIcon('plus', 18)}
      <h2>Add Section</h2>
    </div>
    <form class="add-section-form" data-action="add-section">
      <input name="title" placeholder="Section title" required />
      <select name="type">
        ${Object.entries(SECTION_TYPE_LABELS)
          .map(([value, label]) => `<option value="${value}">${label}</option>`)
          .join('')}
      </select>
      <button type="submit" class="btn-primary">Add</button>
    </form>
  </section>`;
}

function renderSection(section) {
  const hiddenClass = !section.enabled ? 'section-hidden' : '';
  const icon = svgIcon(SECTION_ICON_NAMES[section.type] || '', 18);
  const accentSwatches = ACCENT_COLOR_OPTIONS.map(
    (c) =>
      `<button type="button" class="accent-swatch ${section.accent_color === c ? 'selected' : ''}" data-action="set-section-accent" data-color="${c}" style="background:${c};" title="${c}"></button>`
  ).join('');
  const header =
    state.editMode && !state.kioskMode
      ? `
    <div class="section-header">
      <button type="button" class="drag-handle" data-action="drag-handle" title="Drag to reorder">${svgIcon('grip-vertical', 15)}</button>
      <input class="section-title-input" data-action="rename-section" value="${escapeAttr(section.title)}" />
      <div class="section-controls">
        <div class="accent-picker">
          ${accentSwatches}
          ${section.accent_color ? `<button type="button" class="icon-btn" data-action="reset-section-accent" title="Reset to theme accent">${svgIcon('rotate-ccw', 13)}</button>` : ''}
        </div>
        <button type="button" class="icon-btn" data-action="move-up" title="Move up">${svgIcon('arrow-up', 13)}</button>
        <button type="button" class="icon-btn" data-action="move-down" title="Move down">${svgIcon('arrow-down', 13)}</button>
        <button type="button" class="icon-btn" data-action="toggle-enabled" title="${section.enabled ? 'Hide' : 'Show'}">${svgIcon(section.enabled ? 'eye' : 'eye-off', 13)}</button>
        <button type="button" class="icon-btn danger" data-action="delete-section" title="Delete section">${svgIcon('trash', 13)}</button>
      </div>
    </div>`
      : `<div class="section-header"><div class="section-header-title">${icon}<h2>${escapeHtml(section.title)}</h2></div></div>`;

  let body = '';
  if (section.type === 'weather') body = renderWeatherBody();
  else if (section.type === 'todo') body = renderTodoBody(section);
  else if (section.type === 'links') body = renderLinksBody(section);
  else if (section.type === 'leaderboard') body = renderLeaderboardBody(section);
  else if (section.type === 'stats') body = renderStatsBody();
  else if (section.type === 'notes') body = renderNotesBody(section);
  else if (section.type === 'countdown') body = renderCountdownBody(section);
  else if (section.type === 'stocks') body = renderStocksBody(section);
  else if (section.type === 'chores') body = renderChoresBody(section);
  else if (section.type === 'photos') body = renderPhotosBody(section);
  else if (section.type === 'calendar') body = renderCalendarBody(section);

  const accentStyle = section.accent_color ? ` style="--accent:${escapeAttr(section.accent_color)};"` : '';
  return `<section class="card section ${hiddenClass}" data-section-id="${section.id}" data-type="${section.type}"${accentStyle}>
    ${header}
    <div class="section-body">${body}</div>
  </section>`;
}

function renderWeatherBody() {
  return `<div class="weather-body" data-weather-slot><p class="muted">Loading weather…</p></div>`;
}

function renderStatsBody() {
  return `
    <div class="stats-grid" data-stats-slot><p class="muted">Loading…</p></div>
    <div class="stat-note" data-stats-note></div>
  `;
}

function renderStocksBody(section) {
  const symbols = section.symbols || [];

  if (state.editMode) {
    const rows = symbols
      .map(
        (s) => `
      <div class="stock-edit-row" data-stock-id="${s.id}">
        <span class="stock-symbol">${escapeHtml(s.symbol)}</span>
        <button type="button" class="item-delete" data-action="delete-stock">${svgIcon('x', 13)}</button>
      </div>`
      )
      .join('');

    return `
      <div class="stocks-edit-list">${rows || `<p class="muted">No symbols yet.</p>`}</div>
      <form class="add-stock-form" data-action="add-stock">
        <input name="symbol" placeholder="Ticker, e.g. AAPL" required maxlength="10" style="text-transform:uppercase;" />
        <button type="submit">+ Add</button>
      </form>`;
  }

  const symbolsAttr = symbols.map((s) => s.symbol).join(',');
  return `<div class="stocks-list" data-stocks-slot data-symbols="${escapeAttr(symbolsAttr)}"><p class="muted">Loading…</p></div>`;
}

function renderTodoBody(section) {
  const items = section.items || [];
  const list = items.length
    ? items
        .map(
          (item) => `
      <li class="${item.done ? 'done' : ''}" data-item-id="${item.id}">
        <input type="checkbox" ${item.done ? 'checked' : ''} data-action="toggle-todo" />
        <span class="item-text">${escapeHtml(item.text)}</span>
        <button type="button" class="item-delete" data-action="delete-todo">${svgIcon('x', 13)}</button>
      </li>`
        )
        .join('')
    : `<li class="muted" style="background:none; border:none; padding:4px 0;">Nothing planned yet — add something below!</li>`;

  return `
    <ul class="today-list">${list}</ul>
    <form class="today-form" data-action="add-todo">
      <input type="text" name="text" placeholder="Add something…" autocomplete="off" required />
      <button type="submit">Add</button>
    </form>`;
}

function renderLinksBody(section) {
  const links = section.links || [];

  if (state.editMode) {
    const rows = links
      .map(
        (link) => `
      <div class="link-edit-row" data-link-id="${link.id}">
        <button type="button" class="icon-pick-btn" data-action="pick-icon" data-role="link-existing" title="Change icon">${renderIcon(link.icon, 20)}</button>
        <input data-field="label" value="${escapeAttr(link.label)}" placeholder="Label" />
        <input data-field="url" value="${escapeAttr(link.url)}" placeholder="https://…" />
        <button type="button" class="item-delete" data-action="delete-link">${svgIcon('x', 13)}</button>
      </div>`
      )
      .join('');

    return `
      <div class="links-edit-list">${rows}</div>
      <form class="add-link-form" data-action="add-link">
        <button type="button" class="icon-pick-btn" data-action="pick-icon" data-role="link-new" title="Choose icon">${svgIcon(DEFAULT_LINK_ICON, 20)}</button>
        <input type="hidden" name="icon" value="${DEFAULT_LINK_ICON}" data-role="icon-hidden" />
        <input name="label" placeholder="Label" required />
        <input name="url" placeholder="https://…" required />
        <button type="submit">+ Add link</button>
      </form>`;
  }

  const tiles = links
    .map(
      (link, i) => `
      <a class="link-tile" href="${escapeAttr(link.url)}" target="_blank" rel="noopener">
        <div class="link-tile-icon ${i % 2 ? 'grad-b' : 'grad-a'}">${renderIcon(link.icon, 24)}</div>
        <span class="link-label">${escapeHtml(link.label)}</span>
      </a>`
    )
    .join('');

  const emptyMsg = !links.length ? `<p class="muted">No links yet.</p>` : '';
  return `<div class="links-grid">${tiles}</div>${emptyMsg}`;
}

function renderLeaderboardBody(section) {
  const entries = section.entries || [];
  const rows = entries
    .map(
      (kid) => `
    <div class="kid-row" data-kid-id="${kid.id}">
      ${
        state.editMode
          ? `<button type="button" class="icon-pick-btn" data-action="pick-icon" data-role="kid-existing" title="Change avatar">${renderIcon(kid.emoji, 20)}</button>`
          : `<span class="kid-emoji">${renderIcon(kid.emoji, 20)}</span>`
      }
      ${
        state.editMode
          ? `<input class="kid-name-input" data-field="name" value="${escapeAttr(kid.name)}" />`
          : `<span class="kid-name">${escapeHtml(kid.name)}</span>`
      }
      <button type="button" class="kid-btn minus" data-action="minus" aria-label="Subtract point">−</button>
      <span class="kid-points mono">${kid.points}</span>
      <button type="button" class="kid-btn plus" data-action="plus" aria-label="Add point">+</button>
      ${state.editMode ? `<button type="button" class="item-delete" data-action="delete-kid">${svgIcon('x', 13)}</button>` : ''}
    </div>`
    )
    .join('');

  const addForm = state.editMode
    ? `
    <form class="add-kid-form" data-action="add-kid">
      <button type="button" class="icon-pick-btn" data-action="pick-icon" data-role="kid-new" title="Choose avatar">${svgIcon(DEFAULT_AVATAR_ICON, 20)}</button>
      <input type="hidden" name="emoji" value="${DEFAULT_AVATAR_ICON}" data-role="icon-hidden" />
      <input name="name" placeholder="Name" required />
      <button type="submit">+ Add</button>
    </form>`
    : '';

  const emptyMsg = !entries.length && !state.editMode ? `<p class="muted">No entries yet.</p>` : '';

  return `<div class="leaderboard-list">${rows}</div>${emptyMsg}${addForm}`;
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function renderNotesBody(section) {
  const notes = section.notes || [];
  const list = notes.length
    ? notes
        .map(
          (note) => `
      <div class="note-item" data-note-id="${note.id}">
        <div class="note-item-body">
          <div class="note-text">${escapeHtml(note.text)}</div>
          <div class="note-meta">${note.author ? escapeHtml(note.author) + ' · ' : ''}${timeAgo(note.created_at)}</div>
        </div>
        <button type="button" class="item-delete" data-action="delete-note">${svgIcon('x', 13)}</button>
      </div>`
        )
        .join('')
    : `<p class="muted" style="margin:0 0 14px;">No notes yet — leave one for the family below!</p>`;

  return `
    <div class="notes-list">${notes.length ? list : ''}</div>
    ${!notes.length ? list : ''}
    <form class="add-note-form" data-action="add-note">
      <input type="text" name="text" placeholder="Leave a note…" autocomplete="off" required />
      <input type="text" name="author" placeholder="Name (optional)" style="max-width:140px;" autocomplete="off" />
      <button type="submit">Post</button>
    </form>`;
}

function renderCountdownBody(section) {
  const cd = section.countdown || { label: 'Countdown', target_date: null };
  let daysHtml = `<span class="countdown-number">—</span><span class="countdown-unit">no date set</span>`;
  if (cd.target_date) {
    const target = new Date(cd.target_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((target - today) / 86400000);
    if (days > 0) {
      daysHtml = `<span class="countdown-number">${days}</span><span class="countdown-unit">day${days === 1 ? '' : 's'} to go</span>`;
    } else if (days === 0) {
      daysHtml = `<span class="countdown-number">${svgIcon('party-popper', 40)}</span><span class="countdown-unit">it's today!</span>`;
    } else {
      daysHtml = `<span class="countdown-number">${Math.abs(days)}</span><span class="countdown-unit">day${Math.abs(days) === 1 ? '' : 's'} ago</span>`;
    }
  }

  const view = `
    <div class="countdown-body">
      ${daysHtml}
      <div class="countdown-label">${escapeHtml(cd.label)}</div>
    </div>`;

  const editRow = state.editMode
    ? `
    <form class="countdown-edit-row" data-action="save-countdown">
      <input type="text" name="label" placeholder="Label" value="${escapeAttr(cd.label)}" />
      <input type="date" name="target_date" value="${escapeAttr(cd.target_date || '')}" />
      <button type="submit" class="btn-primary">Save</button>
    </form>`
    : '';

  return view + editRow;
}

function renderChoresBody(section) {
  const kids = section.kids || [];

  const kidBlocks = kids
    .map((kid) => {
      const tasks = kid.tasks || [];
      const doneCount = tasks.filter((t) => t.doneToday).length;
      const taskRows = tasks
        .map(
          (task) => `
        <li class="${task.doneToday ? 'done' : ''}" data-task-id="${task.id}">
          <input type="checkbox" ${task.doneToday ? 'checked' : ''} data-action="toggle-chore-task" />
          <span class="item-text">${escapeHtml(task.text)}</span>
          ${state.editMode ? `<button type="button" class="item-delete" data-action="delete-chore-task">${svgIcon('x', 13)}</button>` : ''}
        </li>`
        )
        .join('');

      return `
      <div class="chore-kid-block" data-kid-id="${kid.id}">
        <div class="chore-kid-header">
          ${
            state.editMode
              ? `<button type="button" class="icon-pick-btn" data-action="pick-icon" data-role="chore-kid-existing" title="Change avatar">${renderIcon(kid.icon, 18)}</button>`
              : `<span class="kid-emoji" style="width:30px; height:30px;">${renderIcon(kid.icon, 16)}</span>`
          }
          <span class="chore-kid-name">${escapeHtml(kid.name)}</span>
          <span class="chore-kid-progress mono">${doneCount}/${tasks.length}</span>
          ${state.editMode ? `<button type="button" class="item-delete" data-action="delete-chore-kid">${svgIcon('x', 13)}</button>` : ''}
        </div>
        <ul class="today-list">${taskRows || `<li class="muted" style="background:none; border:none; padding:4px 0;">No chores yet.</li>`}</ul>
        ${
          state.editMode
            ? `<form class="add-chore-task-form" data-action="add-chore-task">
                <input type="text" name="text" placeholder="Add a chore…" autocomplete="off" required />
                <button type="submit">Add</button>
              </form>`
            : ''
        }
      </div>`;
    })
    .join('');

  const addKidForm = state.editMode
    ? `
    <form class="add-kid-form" data-action="add-chore-kid">
      <button type="button" class="icon-pick-btn" data-action="pick-icon" data-role="chore-kid-new" title="Choose avatar">${svgIcon(DEFAULT_AVATAR_ICON, 20)}</button>
      <input type="hidden" name="icon" value="${DEFAULT_AVATAR_ICON}" data-role="icon-hidden" />
      <input name="name" placeholder="Name" required />
      <button type="submit">+ Add kid</button>
    </form>`
    : '';

  const emptyMsg = !kids.length && !state.editMode ? `<p class="muted">No one set up yet.</p>` : '';

  return `<div class="chores-list">${kidBlocks}</div>${emptyMsg}${addKidForm}`;
}

function renderPhotosBody(section) {
  const photos = section.photos || [];

  if (state.editMode) {
    const thumbs = photos
      .map(
        (p) => `
      <div class="photo-thumb" data-photo-id="${p.id}">
        <img src="${escapeAttr(p.image_data_url)}" alt="" />
        <button type="button" class="item-delete photo-thumb-delete" data-action="delete-photo">${svgIcon('x', 13)}</button>
      </div>`
      )
      .join('');

    return `
      <div class="photos-thumb-grid">${thumbs || `<p class="muted">No photos yet.</p>`}</div>
      <button type="button" class="btn-secondary" data-action="upload-photo" style="margin-top:12px;">${svgIcon('upload', 14)} Upload photo</button>
      <p class="stat-note">Up to 24 photos, ~900KB each.</p>`;
  }

  if (!photos.length) {
    return `<p class="muted">No photos yet — add some in Customize mode.</p>`;
  }

  const slidesAttr = escapeAttr(photos.map((p) => p.image_data_url).join('|||'));
  return `<div class="photo-slideshow" data-photo-slot data-photos="${slidesAttr}"><img alt="" /></div>`;
}

function renderCalendarBody(section) {
  const cal = section.calendar || { ics_url: null };

  const editRow = state.editMode
    ? `
    <form class="calendar-edit-row" data-action="save-calendar">
      <input type="url" name="ics_url" placeholder="https://…/calendar.ics" value="${escapeAttr(cal.ics_url || '')}" />
      <button type="submit" class="btn-primary">Save</button>
    </form>`
    : '';

  if (!cal.ics_url) {
    return `<p class="muted">${state.editMode ? 'Paste a public .ics calendar link below.' : 'No calendar linked yet.'}</p>${editRow}`;
  }

  return `<div class="calendar-list" data-calendar-slot data-section-id="${section.id}"><p class="muted">Loading…</p></div>${editRow}`;
}

// ---- Edit mode toggle & PIN flow ----
function openPinModal() {
  const modal = document.getElementById('pin-modal');
  document.getElementById('pin-error').hidden = true;
  document.getElementById('pin-input').value = '';
  modal.hidden = false;
  document.getElementById('pin-input').focus();
}

function closePinModal() {
  document.getElementById('pin-modal').hidden = true;
}

document.getElementById('edit-toggle').addEventListener('click', () => {
  if (state.editMode) {
    state.editMode = false;
    render();
    return;
  }
  if (!state.authStatus.pinRequired || state.authStatus.unlocked) {
    state.editMode = true;
    render();
    return;
  }
  openPinModal();
});

document.getElementById('pin-cancel').addEventListener('click', closePinModal);

document.getElementById('pin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = document.getElementById('pin-input').value;
  try {
    const res = await fetch('/api/auth/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      document.getElementById('pin-error').hidden = false;
      return;
    }
    state.authStatus.unlocked = true;
    state.editMode = true;
    closePinModal();
    render();
  } catch (err) {
    document.getElementById('pin-error').hidden = false;
  }
});

// ---- Icon picker ----
let iconPickerCallback = null;

function openIconPicker(onSelect) {
  const grid = document.getElementById('icon-picker-grid');
  grid.innerHTML = ICON_PICKER_NAMES.map(
    (name) => `<button type="button" class="icon-picker-item" data-icon-name="${name}" title="${name}">${svgIcon(name, 20)}</button>`
  ).join('');
  iconPickerCallback = onSelect;
  document.getElementById('icon-picker-modal').hidden = false;
}

function closeIconPicker() {
  document.getElementById('icon-picker-modal').hidden = true;
  iconPickerCallback = null;
}

document.getElementById('icon-picker-cancel').addEventListener('click', closeIconPicker);

document.getElementById('icon-picker-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.icon-picker-item');
  if (!btn) return;
  const name = btn.dataset.iconName;
  const callback = iconPickerCallback;
  closeIconPicker();
  if (callback) callback(name);
});

// ---- Logo upload ----
const MAX_LOGO_FILE_BYTES = 700_000;

function triggerLogoUpload() {
  if (!state.editMode) return;
  document.getElementById('logo-input').click();
}

document.getElementById('logo-box').addEventListener('click', triggerLogoUpload);

document.getElementById('logo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please choose an image file.');
    return;
  }
  if (file.size > MAX_LOGO_FILE_BYTES) {
    alert('That image is too large — please use one under 700KB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ logo_data_url: reader.result }) });
      await loadDashboard();
    } catch (err) {
      if (err.message !== 'unauthorized') alert(err.message);
    }
  };
  reader.readAsDataURL(file);
});

// ---- Background image upload ----
const MAX_BACKGROUND_FILE_BYTES = 1_800_000;

document.getElementById('background-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please choose an image file.');
    return;
  }
  if (file.size > MAX_BACKGROUND_FILE_BYTES) {
    alert('That image is too large — please use one under 1.8MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ background_data_url: reader.result }) });
      await loadDashboard();
    } catch (err) {
      if (err.message !== 'unauthorized') alert(err.message);
    }
  };
  reader.readAsDataURL(file);
});

// ---- Backup / restore ----
document.getElementById('backup-restore-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!confirm('Restoring will replace everything on this dashboard with the contents of this backup file. Continue?')) {
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await api('/api/backup', { method: 'POST', body: JSON.stringify({ yaml: reader.result }) });
      await loadDashboard();
    } catch (err) {
      if (err.message !== 'unauthorized') alert(err.message);
    }
  };
  reader.readAsText(file);
});

// ---- Event delegation for the dashboard ----
const dashboard = document.getElementById('dashboard');

function sectionIdOf(el) {
  return el.closest('[data-section-id]')?.dataset.sectionId;
}

// ---- Section drag-and-drop reordering ----
// Pointer Events (not native HTML5 drag-and-drop) so this works uniformly
// with mouse, touch and pen — plain HTML5 DnD is unreliable on iPad, which
// this dashboard is explicitly meant to run well on.
document.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.drag-handle');
  if (!handle) return;
  const card = handle.closest('.section');
  if (!card) return;
  e.preventDefault();

  dragState = { card, order: Array.from(dashboard.querySelectorAll('.section')).map((c) => Number(c.dataset.sectionId)) };
  card.classList.add('dragging');

  const onMove = (ev) => {
    if (!dragState) return;
    const y = ev.clientY;
    const siblings = Array.from(dashboard.querySelectorAll('.section')).filter((c) => c !== dragState.card);
    let target = null;
    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        target = sib;
        break;
      }
    }
    if (target) {
      dashboard.insertBefore(dragState.card, target);
    } else {
      const addBar = dashboard.querySelector('.add-section-card');
      if (addBar) dashboard.insertBefore(dragState.card, addBar);
      else dashboard.appendChild(dragState.card);
    }
    dragState.order = Array.from(dashboard.querySelectorAll('.section')).map((c) => Number(c.dataset.sectionId));
  };

  const onUp = async () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (!dragState) return;
    const order = dragState.order;
    dragState.card.classList.remove('dragging');
    dragState = null;
    try {
      await api('/api/sections/reorder', { method: 'POST', body: JSON.stringify({ order }) });
      await loadDashboard();
    } catch (err) {
      if (err.message !== 'unauthorized') console.error(err);
    }
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
});

dashboard.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  const action = target?.dataset.action;
  if (!action) return;

  try {
    if (action === 'lock-now') {
      await api('/api/auth/lock', { method: 'POST' });
      state.authStatus.unlocked = false;
      state.editMode = false;
      render();
      return;
    }

    if (action === 'upload-logo') {
      document.getElementById('logo-input').click();
      return;
    }

    if (action === 'upload-background') {
      document.getElementById('background-input').click();
      return;
    }

    if (action === 'remove-background') {
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ background_data_url: null }) });
      await loadDashboard();
      return;
    }

    if (action === 'download-backup') {
      window.location.href = '/api/backup';
      return;
    }

    if (action === 'restore-backup') {
      document.getElementById('backup-restore-input').click();
      return;
    }

    if (action === 'exit-kiosk') {
      exitKiosk();
      return;
    }

    if (action === 'set-theme') {
      const theme = target.dataset.themeValue;
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ theme }) });
      await loadDashboard();
      return;
    }

    if (action === 'set-section-accent') {
      const id = sectionIdOf(target);
      await api(`/api/sections/${id}`, { method: 'PATCH', body: JSON.stringify({ accent_color: target.dataset.color }) });
      await loadDashboard();
      return;
    }

    if (action === 'reset-section-accent') {
      const id = sectionIdOf(target);
      await api(`/api/sections/${id}`, { method: 'PATCH', body: JSON.stringify({ accent_color: null }) });
      await loadDashboard();
      return;
    }

    if (action === 'pick-icon') {
      const role = target.dataset.role;

      if (role === 'link-existing') {
        const linkId = target.closest('[data-link-id]').dataset.linkId;
        openIconPicker(async (name) => {
          try {
            await api(`/api/links/${linkId}`, { method: 'PATCH', body: JSON.stringify({ icon: name }) });
            await loadDashboard();
          } catch (err) {
            if (err.message !== 'unauthorized') alert(err.message);
          }
        });
      } else if (role === 'link-new') {
        openIconPicker((name) => {
          target.innerHTML = svgIcon(name, 20);
          target.nextElementSibling.value = name;
        });
      } else if (role === 'kid-existing') {
        const kidId = target.closest('[data-kid-id]').dataset.kidId;
        openIconPicker(async (name) => {
          try {
            await api(`/api/leaderboard/${kidId}`, { method: 'PATCH', body: JSON.stringify({ emoji: name }) });
            await loadDashboard();
          } catch (err) {
            if (err.message !== 'unauthorized') alert(err.message);
          }
        });
      } else if (role === 'kid-new') {
        openIconPicker((name) => {
          target.innerHTML = svgIcon(name, 20);
          target.nextElementSibling.value = name;
        });
      } else if (role === 'chore-kid-existing') {
        const kidId = target.closest('[data-kid-id]').dataset.kidId;
        openIconPicker(async (name) => {
          try {
            await api(`/api/chores/kids/${kidId}`, { method: 'PATCH', body: JSON.stringify({ icon: name }) });
            await loadDashboard();
          } catch (err) {
            if (err.message !== 'unauthorized') alert(err.message);
          }
        });
      } else if (role === 'chore-kid-new') {
        openIconPicker((name) => {
          target.innerHTML = svgIcon(name, 20);
          target.nextElementSibling.value = name;
        });
      }
      return;
    }

    if (action === 'move-up' || action === 'move-down') {
      const id = Number(sectionIdOf(target));
      const ids = state.sections.map((s) => s.id);
      const idx = ids.indexOf(id);
      const swapWith = action === 'move-up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= ids.length) return;
      [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
      await api('/api/sections/reorder', { method: 'POST', body: JSON.stringify({ order: ids }) });
      await loadDashboard();
      return;
    }

    if (action === 'toggle-enabled') {
      const id = sectionIdOf(target);
      const section = state.sections.find((s) => String(s.id) === String(id));
      await api(`/api/sections/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !section.enabled }) });
      await loadDashboard();
      return;
    }

    if (action === 'delete-section') {
      if (!confirm('Delete this section and everything in it?')) return;
      const id = sectionIdOf(target);
      await api(`/api/sections/${id}`, { method: 'DELETE' });
      await loadDashboard();
      return;
    }

    if (action === 'delete-todo') {
      const id = target.closest('[data-item-id]').dataset.itemId;
      await api(`/api/todo/${id}`, { method: 'DELETE' });
      await loadDashboard();
      return;
    }

    if (action === 'delete-link') {
      const id = target.closest('[data-link-id]').dataset.linkId;
      await api(`/api/links/${id}`, { method: 'DELETE' });
      await loadDashboard();
      return;
    }

    if (action === 'delete-kid') {
      const id = target.closest('[data-kid-id]').dataset.kidId;
      await api(`/api/leaderboard/${id}`, { method: 'DELETE' });
      await loadDashboard();
      return;
    }

    if (action === 'delete-note') {
      const id = target.closest('[data-note-id]').dataset.noteId;
      await api(`/api/notes/${id}`, { method: 'DELETE' });
      await loadDashboard();
      return;
    }

    if (action === 'delete-stock') {
      const id = target.closest('[data-stock-id]').dataset.stockId;
      await api(`/api/stocks/${id}`, { method: 'DELETE' });
      await loadDashboard();
      return;
    }

    if (action === 'delete-chore-kid') {
      const id = target.closest('[data-kid-id]').dataset.kidId;
      await api(`/api/chores/kids/${id}`, { method: 'DELETE' });
      await loadDashboard();
      return;
    }

    if (action === 'delete-chore-task') {
      const id = target.closest('[data-task-id]').dataset.taskId;
      await api(`/api/chores/tasks/${id}`, { method: 'DELETE' });
      await loadDashboard();
      return;
    }

    if (action === 'upload-photo') {
      const id = sectionIdOf(target);
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.addEventListener('change', () => uploadPhotos(id, input.files));
      input.click();
      return;
    }

    if (action === 'delete-photo') {
      const id = target.closest('[data-photo-id]').dataset.photoId;
      await api(`/api/photos/${id}`, { method: 'DELETE' });
      await loadDashboard();
      return;
    }

    if (action === 'plus' || action === 'minus') {
      const id = target.closest('[data-kid-id]').dataset.kidId;
      const delta = action === 'plus' ? 1 : -1;
      await api(`/api/leaderboard/${id}`, { method: 'PATCH', body: JSON.stringify({ delta }) });
      await loadDashboard();
      return;
    }
  } catch (err) {
    if (err.message !== 'unauthorized') console.error(err);
  }
});

dashboard.addEventListener('change', async (e) => {
  try {
    if (e.target.dataset.action === 'toggle-todo') {
      const id = e.target.closest('[data-item-id]').dataset.itemId;
      await api(`/api/todo/${id}`, { method: 'PATCH', body: JSON.stringify({ done: e.target.checked }) });
      await loadDashboard();
      return;
    }

    if (e.target.dataset.action === 'rename-section') {
      const id = sectionIdOf(e.target);
      const title = e.target.value.trim();
      if (!title) return;
      await api(`/api/sections/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      return; // no reload needed, value already reflects intent
    }

    if (e.target.dataset.field && e.target.closest('.link-edit-row')) {
      const linkId = e.target.closest('[data-link-id]').dataset.linkId;
      const field = e.target.dataset.field;
      await api(`/api/links/${linkId}`, { method: 'PATCH', body: JSON.stringify({ [field]: e.target.value }) });
      return;
    }

    if (e.target.dataset.field && e.target.closest('.kid-row')) {
      const kidId = e.target.closest('[data-kid-id]').dataset.kidId;
      const field = e.target.dataset.field;
      await api(`/api/leaderboard/${kidId}`, { method: 'PATCH', body: JSON.stringify({ [field]: e.target.value }) });
      return;
    }

    if (e.target.dataset.action === 'toggle-chore-task') {
      const id = e.target.closest('[data-task-id]').dataset.taskId;
      await api(`/api/chores/tasks/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ done: e.target.checked }) });
      await loadDashboard();
      return;
    }
  } catch (err) {
    if (err.message !== 'unauthorized') console.error(err);
  }
});

dashboard.addEventListener('submit', async (e) => {
  e.preventDefault();
  const action = e.target.dataset.action;
  if (!action) return;
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());

  try {
    if (action === 'add-todo') {
      const id = sectionIdOf(form);
      await api(`/api/sections/${id}/todo`, { method: 'POST', body: JSON.stringify({ text: data.text }) });
      await loadDashboard();
      return;
    }

    if (action === 'add-link') {
      const id = sectionIdOf(form);
      await api(`/api/sections/${id}/links`, { method: 'POST', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }

    if (action === 'add-kid') {
      const id = sectionIdOf(form);
      await api(`/api/sections/${id}/leaderboard`, { method: 'POST', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }

    if (action === 'add-note') {
      const id = sectionIdOf(form);
      await api(`/api/sections/${id}/notes`, { method: 'POST', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }

    if (action === 'add-stock') {
      const id = sectionIdOf(form);
      await api(`/api/sections/${id}/stocks`, { method: 'POST', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }

    if (action === 'add-chore-kid') {
      const id = sectionIdOf(form);
      await api(`/api/sections/${id}/chores/kids`, { method: 'POST', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }

    if (action === 'add-chore-task') {
      const kidId = form.closest('[data-kid-id]').dataset.kidId;
      await api(`/api/chores/kids/${kidId}/tasks`, { method: 'POST', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }

    if (action === 'save-calendar') {
      const id = sectionIdOf(form);
      await api(`/api/sections/${id}/calendar`, { method: 'PATCH', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }

    if (action === 'save-countdown') {
      const id = sectionIdOf(form);
      await api(`/api/sections/${id}/countdown`, { method: 'PATCH', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }

    if (action === 'add-section') {
      await api('/api/sections', { method: 'POST', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }

    if (action === 'save-settings') {
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify(data) });
      await loadDashboard();
      return;
    }
  } catch (err) {
    if (err.message !== 'unauthorized') alert(err.message);
  }
});

// ---- Init ----
initStaticIcons();
updateClock();
setInterval(updateClock, 30_000);
loadMeta();
loadAuthStatus().then(loadDashboard);
setInterval(loadAllWeather, 15 * 60 * 1000);
setInterval(loadAllStats, 10 * 1000);
setInterval(loadAllStocks, 60 * 1000);
