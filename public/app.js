const state = {
  settings: {},
  sections: [],
  authStatus: { pinRequired: false, unlocked: true },
  editMode: false,
};

const THEMES = ['neon', 'sunset', 'ocean', 'forest'];

const ICONS = {
  cloud: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 19a4.5 4.5 0 0 1-.5-8.98A5.5 5.5 0 0 1 16.9 8.02 4.5 4.5 0 0 1 16.5 19h-10Z"/></svg>`,
  cloudBig: `<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 19a4.5 4.5 0 0 1-.5-8.98A5.5 5.5 0 0 1 16.9 8.02 4.5 4.5 0 0 1 16.5 19h-10Z"/></svg>`,
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  grid: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  trophy: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/></svg>`,
  activity: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>`,
  note: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"/></svg>`,
  hourglass: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12M6 22h12M6 2c0 6 12 6 12 10s-12 4-12 10M18 2c0 6-12 6-12 10s12 4 12 10"/></svg>`,
  arrowUp: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
  arrowDown: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`,
  eye: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>`,
  close: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  lock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  gear: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.6 7.6 0 0 0 .1-1 7.6 7.6 0 0 0-.1-1l2-1.6-2-3.4-2.3.9a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.4a7.4 7.4 0 0 0-1.7 1l-2.3-.9-2 3.4L6.6 11a7.6 7.6 0 0 0-.1 1 7.6 7.6 0 0 0 .1 1l-2 1.6 2 3.4 2.3-.9a7.4 7.4 0 0 0 1.7 1l.4 2.4h4l.4-2.4a7.4 7.4 0 0 0 1.7-1l2.3.9 2-3.4-2-1.6Z"/></svg>`,
  plus: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  upload: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`,
};

const SECTION_ICONS = {
  weather: ICONS.cloud,
  todo: ICONS.check,
  links: ICONS.grid,
  leaderboard: ICONS.trophy,
  stats: ICONS.activity,
  notes: ICONS.note,
  countdown: ICONS.hourglass,
};

const SECTION_TYPE_LABELS = {
  links: 'Links',
  todo: 'To-do list',
  leaderboard: 'Leaderboard',
  weather: 'Weather',
  stats: 'Server Stats',
  notes: 'Notes',
  countdown: 'Countdown',
};

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
  if (!words.length) return 'FD';
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
      ${ICONS.cloudBig.replace('<svg ', '<svg class="weather-icon" ')}
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
    const load = s.load ? s.load.one.toFixed(2) : '—';
    const memPct = s.memory?.usedPercent ?? null;
    const diskPct = s.disk?.usedPercent ?? null;
    const html = `
      <div class="stat-tile">
        <div class="stat-label">Load avg (1m)</div>
        <div class="stat-value">${load}${s.cpuCount ? ` <span class="muted" style="font-size:0.7rem;">/ ${s.cpuCount} cores</span>` : ''}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Memory</div>
        <div class="stat-value">${memPct != null ? memPct + '%' : '—'}</div>
        <div class="muted" style="font-size:0.72rem; margin-top:2px;">${formatBytes(s.memory?.usedBytes)} / ${formatBytes(s.memory?.totalBytes)}</div>
        ${memPct != null ? `<div class="stat-bar-track"><div class="stat-bar-fill" style="width:${memPct}%"></div></div>` : ''}
      </div>
      <div class="stat-tile">
        <div class="stat-label">Disk</div>
        <div class="stat-value">${diskPct != null ? diskPct + '%' : '—'}</div>
        <div class="muted" style="font-size:0.72rem; margin-top:2px;">${formatBytes(s.disk?.usedBytes)} / ${formatBytes(s.disk?.totalBytes)}</div>
        ${diskPct != null ? `<div class="stat-bar-track"><div class="stat-bar-fill" style="width:${diskPct}%"></div></div>` : ''}
      </div>
      <div class="stat-tile">
        <div class="stat-label">Uptime</div>
        <div class="stat-value mono" style="font-size:1.05rem;">${s.uptimeText}</div>
      </div>
    `;
    slots.forEach((el) => {
      el.innerHTML = html;
      const note = el.parentElement.querySelector('[data-stats-note]');
      if (note) note.textContent = s.hostMounted ? '' : 'Showing this container\'s own resources — mount the host /proc and / for true host stats (see docker-compose.yml).';
    });
  } catch (err) {
    slots.forEach((el) => (el.innerHTML = `<p class="error-text">Couldn't read server stats right now.</p>`));
  }
}

// ---- Render ----
function render() {
  applyTheme();
  renderHeader();
  renderDashboard();
  // Rebuilding the dashboard DOM (every render — not just after a fresh
  // fetch) replaces any already-filled weather/stats slots with their
  // "Loading…" placeholders, so refill them every time.
  loadAllWeather();
  loadAllStats();
}

function applyTheme() {
  const theme = THEMES.includes(state.settings.theme) ? state.settings.theme : 'neon';
  document.documentElement.setAttribute('data-theme', theme);
}

function renderHeader() {
  const title = state.settings.site_title || 'IntraHub';
  document.getElementById('site-title').textContent = title;
  document.getElementById('page-title').textContent = title;

  const logoBox = document.getElementById('logo-box');
  logoBox.classList.toggle('editable', state.editMode);
  if (state.settings.logo_data_url) {
    logoBox.style.backgroundImage = `url(${state.settings.logo_data_url})`;
    logoBox.textContent = '';
  } else {
    logoBox.style.backgroundImage = '';
    logoBox.textContent = initialsFromTitle(title);
  }

  const btn = document.getElementById('edit-toggle');
  document.getElementById('edit-toggle-label').textContent = state.editMode ? 'Done' : 'Customize';
  btn.classList.toggle('active', state.editMode);
}

function renderDashboard() {
  const root = document.getElementById('dashboard');
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

function renderSettingsCard() {
  const s = state.settings;
  const currentTheme = THEMES.includes(s.theme) ? s.theme : 'neon';
  return `
  <section class="card settings-card">
    <div class="section-header-title" style="margin-bottom: 20px;">
      ${ICONS.gear}
      <h2>Dashboard Settings</h2>
    </div>

    <div class="settings-groups">
      <div>
        <div class="settings-group-label">Logo</div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:44px; height:44px; border-radius:13px; background:${s.logo_data_url ? `url(${s.logo_data_url}) center/cover` : 'linear-gradient(135deg, var(--primary), var(--accent))'}; display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--on-primary); flex-shrink:0;">${s.logo_data_url ? '' : escapeHtml(initialsFromTitle(s.site_title))}</div>
          <button type="button" class="btn-secondary" data-action="upload-logo">${ICONS.upload} Upload image</button>
        </div>
      </div>
      <div>
        <div class="settings-group-label">Theme</div>
        <div class="theme-swatches">
          ${THEMES.map(
            (theme) => `<button type="button" class="theme-swatch theme-swatch-${theme} ${theme === currentTheme ? 'selected' : ''}" data-action="set-theme" data-theme-value="${theme}" title="${theme[0].toUpperCase() + theme.slice(1)}"></button>`
          ).join('')}
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
        ${state.authStatus.pinRequired ? `<button type="button" class="btn-secondary" data-action="lock-now">${ICONS.lock} Lock now</button>` : ''}
      </div>
    </form>
  </section>`;
}

function renderAddSectionBar() {
  return `
  <section class="card add-section-card">
    <div class="section-header-title" style="margin-bottom: 16px;">
      ${ICONS.plus}
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
  const icon = SECTION_ICONS[section.type] || '';
  const header = state.editMode
    ? `
    <div class="section-header">
      <input class="section-title-input" data-action="rename-section" value="${escapeAttr(section.title)}" />
      <div class="section-controls">
        <button type="button" class="icon-btn" data-action="move-up" title="Move up">${ICONS.arrowUp}</button>
        <button type="button" class="icon-btn" data-action="move-down" title="Move down">${ICONS.arrowDown}</button>
        <button type="button" class="icon-btn" data-action="toggle-enabled" title="${section.enabled ? 'Hide' : 'Show'}">${ICONS.eye}</button>
        <button type="button" class="icon-btn danger" data-action="delete-section" title="Delete section">${ICONS.trash}</button>
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

  return `<section class="card section ${hiddenClass}" data-section-id="${section.id}" data-type="${section.type}">
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

function renderTodoBody(section) {
  const items = section.items || [];
  const list = items.length
    ? items
        .map(
          (item) => `
      <li class="${item.done ? 'done' : ''}" data-item-id="${item.id}">
        <input type="checkbox" ${item.done ? 'checked' : ''} data-action="toggle-todo" />
        <span class="item-text">${escapeHtml(item.text)}</span>
        <button type="button" class="item-delete" data-action="delete-todo">${ICONS.close}</button>
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
  const tiles = links
    .map((link, i) =>
      state.editMode
        ? `
      <div class="link-tile-edit" data-link-id="${link.id}">
        <div class="link-tile-icon ${i % 2 ? 'grad-b' : 'grad-a'}" style="font-size:1.2rem;">${escapeHtml(link.icon)}</div>
        <input class="link-icon-input" data-field="icon" value="${escapeAttr(link.icon)}" maxlength="4" />
        <input data-field="label" value="${escapeAttr(link.label)}" placeholder="Label" />
        <input data-field="url" value="${escapeAttr(link.url)}" placeholder="https://…" />
        <button type="button" class="item-delete" data-action="delete-link">${ICONS.close}</button>
      </div>`
        : `
      <a class="link-tile" href="${escapeAttr(link.url)}" target="_blank" rel="noopener">
        <div class="link-tile-icon ${i % 2 ? 'grad-b' : 'grad-a'}" style="font-size:1.5rem;">${escapeHtml(link.icon)}</div>
        <span class="link-label">${escapeHtml(link.label)}</span>
      </a>`
    )
    .join('');

  const addForm = state.editMode
    ? `
    <form class="add-link-form" data-action="add-link" style="margin-top:14px;">
      <input name="icon" placeholder="🔗" maxlength="4" value="🔗" style="max-width:56px; text-align:center;" />
      <input name="label" placeholder="Label" required />
      <input name="url" placeholder="https://…" required />
      <button type="submit">+ Add link</button>
    </form>`
    : '';

  const emptyMsg = !links.length && !state.editMode ? `<p class="muted">No links yet.</p>` : '';

  return `<div class="links-grid">${tiles}</div>${emptyMsg}${addForm}`;
}

function renderLeaderboardBody(section) {
  const entries = section.entries || [];
  const rows = entries
    .map(
      (kid) => `
    <div class="kid-row" data-kid-id="${kid.id}">
      ${
        state.editMode
          ? `<input class="kid-emoji-input" data-field="emoji" value="${escapeAttr(kid.emoji)}" maxlength="4" />`
          : `<span class="kid-emoji">${kid.emoji}</span>`
      }
      ${
        state.editMode
          ? `<input class="kid-name-input" data-field="name" value="${escapeAttr(kid.name)}" />`
          : `<span class="kid-name">${escapeHtml(kid.name)}</span>`
      }
      <button type="button" class="kid-btn minus" data-action="minus" aria-label="Subtract point">−</button>
      <span class="kid-points mono">${kid.points}</span>
      <button type="button" class="kid-btn plus" data-action="plus" aria-label="Add point">+</button>
      ${state.editMode ? `<button type="button" class="item-delete" data-action="delete-kid">${ICONS.close}</button>` : ''}
    </div>`
    )
    .join('');

  const addForm = state.editMode
    ? `
    <form class="add-kid-form" data-action="add-kid">
      <input name="emoji" placeholder="⭐" maxlength="4" value="⭐" style="max-width:56px; text-align:center;" />
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
        <button type="button" class="item-delete" data-action="delete-note">${ICONS.close}</button>
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
    if (days > 0) daysHtml = `<span class="countdown-number">${days}</span><span class="countdown-unit">day${days === 1 ? '' : 's'} to go</span>`;
    else if (days === 0) daysHtml = `<span class="countdown-number">🎉</span><span class="countdown-unit">it's today!</span>`;
    else daysHtml = `<span class="countdown-number">${Math.abs(days)}</span><span class="countdown-unit">day${Math.abs(days) === 1 ? '' : 's'} ago</span>`;
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

// ---- Event delegation for the dashboard ----
const dashboard = document.getElementById('dashboard');

function sectionIdOf(el) {
  return el.closest('[data-section-id]')?.dataset.sectionId;
}

dashboard.addEventListener('click', async (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const target = e.target.closest('[data-action]');

  try {
    if (action === 'lock-now') {
      await api('/api/auth/lock', { method: 'POST' });
      state.authStatus.unlocked = false;
      state.editMode = false;
      render();
      return;
    }

    if (action === 'upload-logo') {
      state.editMode = true; // settings card only renders in edit mode already
      document.getElementById('logo-input').click();
      return;
    }

    if (action === 'set-theme') {
      const theme = target.dataset.themeValue;
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ theme }) });
      await loadDashboard();
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

    if (e.target.dataset.field && e.target.closest('.link-tile-edit')) {
      const linkId = e.target.closest('[data-link-id]').dataset.linkId;
      const field = e.target.dataset.field;
      await api(`/api/links/${linkId}`, { method: 'PATCH', body: JSON.stringify({ [field]: e.target.value }) });
      await loadDashboard();
      return;
    }

    if (e.target.dataset.field && e.target.closest('.kid-row')) {
      const kidId = e.target.closest('[data-kid-id]').dataset.kidId;
      const field = e.target.dataset.field;
      await api(`/api/leaderboard/${kidId}`, { method: 'PATCH', body: JSON.stringify({ [field]: e.target.value }) });
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
updateClock();
setInterval(updateClock, 30_000);
loadMeta();
loadAuthStatus().then(loadDashboard);
setInterval(loadAllWeather, 15 * 60 * 1000);
setInterval(loadAllStats, 30 * 1000);
