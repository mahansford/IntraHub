import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pool,
  ensureSchema,
  getSettings,
  setSetting,
  isFreshInstall,
  seedFromConfig,
  buildBackupYaml,
  importBackup,
  SECTION_TYPES,
} from './db.js';
import { loadSeedConfig } from './config.js';
import * as auth from './auth.js';
import { getServerStats } from './stats.js';
import { getStockQuotes } from './stocks.js';
import { getCalendarEvents } from './calendar.js';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const SOURCE_URL = process.env.SOURCE_URL || 'https://github.com/mahansford/IntraHub';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';

// Bumped from the 100kb default so a small uploaded logo image (stored as a
// base64 data URL in settings) fits in one PATCH /api/settings request.
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

let dbReady = false;
async function initDb() {
  try {
    await ensureSchema();
    if (await isFreshInstall()) {
      const config = loadSeedConfig();
      await seedFromConfig(config);
    }
    dbReady = true;
    console.log('Connected to Postgres and schema ready.');
  } catch (err) {
    dbReady = false;
    console.error('Postgres not reachable yet, will retry in 10s:', err.message);
    setTimeout(initDb, 10000);
  }
}
initDb();

// node-postgres returns DATE columns as full ISO datetimes (midnight UTC).
// Normalize to a plain YYYY-MM-DD string so it round-trips cleanly through
// an HTML <input type="date"> and simple client-side date math.
function toDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function requireDb(req, res, next) {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database not connected yet. Check DB settings in .env.' });
  }
  next();
}

// ---- Meta / auth ----
app.get('/api/meta', (req, res) => {
  res.json({ sourceUrl: SOURCE_URL, license: 'AGPL-3.0-or-later' });
});
app.get('/api/auth/status', auth.status);
app.post('/api/auth/unlock', auth.unlock);
app.post('/api/auth/lock', auth.lock);

// ---- Weather ----
// `icon` names match public/icons.js's WEATHER_ICON_NAMES (Lucide icon set).
const WEATHER_CODES = {
  0: { text: 'Clear sky', icon: 'sun' },
  1: { text: 'Mostly clear', icon: 'cloud-sun' },
  2: { text: 'Partly cloudy', icon: 'cloud-sun' },
  3: { text: 'Overcast', icon: 'cloud' },
  45: { text: 'Foggy', icon: 'cloud-fog' },
  48: { text: 'Foggy', icon: 'cloud-fog' },
  51: { text: 'Light drizzle', icon: 'cloud-drizzle' },
  53: { text: 'Drizzle', icon: 'cloud-drizzle' },
  55: { text: 'Heavy drizzle', icon: 'cloud-drizzle' },
  61: { text: 'Light rain', icon: 'cloud-rain' },
  63: { text: 'Rain', icon: 'cloud-rain' },
  65: { text: 'Heavy rain', icon: 'cloud-rain' },
  71: { text: 'Light snow', icon: 'cloud-snow' },
  73: { text: 'Snow', icon: 'cloud-snow' },
  75: { text: 'Heavy snow', icon: 'cloud-snow' },
  80: { text: 'Rain showers', icon: 'cloud-rain' },
  81: { text: 'Rain showers', icon: 'cloud-rain' },
  82: { text: 'Heavy showers', icon: 'cloud-lightning' },
  95: { text: 'Thunderstorm', icon: 'cloud-lightning' },
  96: { text: 'Thunderstorm', icon: 'cloud-lightning' },
  99: { text: 'Thunderstorm', icon: 'cloud-lightning' },
};

// Open-Meteo returns local wall-clock strings like "2026-09-10T14:00" when
// timezone=auto is set — parsed as-is (no further TZ conversion) to avoid
// double-shifting them relative to the forecast location.
function formatHourLabel(localIso) {
  const hour = Number(localIso.slice(11, 13));
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}
function formatDayLabel(localDate, index) {
  if (index === 0) return 'Today';
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

let weatherCache = { data: null, fetchedAt: 0, key: null };
app.get('/api/weather', requireDb, async (req, res) => {
  const settings = await getSettings();
  const lat = settings.weather_lat || '51.5074';
  const lon = settings.weather_lon || '-0.1278';
  const locationName = settings.weather_location_name || 'Unknown location';
  const cacheKey = `${lat},${lon}`;

  const now = Date.now();
  if (weatherCache.data && weatherCache.key === cacheKey && now - weatherCache.fetchedAt < 15 * 60 * 1000) {
    return res.json(weatherCache.data);
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Open-Meteo responded ${resp.status}`);
    const raw = await resp.json();

    const currentCode = raw.current?.weather_code ?? 0;
    const todayCode = raw.daily?.weather_code?.[0] ?? currentCode;

    const hourlyTimes = raw.hourly?.time || [];
    const startIdx = Math.max(
      0,
      hourlyTimes.findIndex((t) => t >= raw.current?.time)
    );

    const data = {
      location: locationName,
      currentTempC: Math.round(raw.current?.temperature_2m),
      current: WEATHER_CODES[currentCode] || { text: 'Unknown', icon: 'cloud' },
      todayHighC: Math.round(raw.daily?.temperature_2m_max?.[0]),
      todayLowC: Math.round(raw.daily?.temperature_2m_min?.[0]),
      today: WEATHER_CODES[todayCode] || { text: 'Unknown', icon: 'cloud' },
      hourly: hourlyTimes.slice(startIdx, startIdx + 12).map((t, i) => {
        const idx = startIdx + i;
        const code = raw.hourly.weather_code[idx];
        return {
          hourLabel: formatHourLabel(t),
          tempC: Math.round(raw.hourly.temperature_2m[idx]),
          icon: (WEATHER_CODES[code] || {}).icon || 'cloud',
        };
      }),
      daily: (raw.daily?.time || []).map((d, i) => {
        const code = raw.daily.weather_code[i];
        return {
          dayLabel: formatDayLabel(d, i),
          tempHighC: Math.round(raw.daily.temperature_2m_max[i]),
          tempLowC: Math.round(raw.daily.temperature_2m_min[i]),
          icon: (WEATHER_CODES[code] || {}).icon || 'cloud',
          text: (WEATHER_CODES[code] || {}).text || 'Unknown',
        };
      }),
    };
    weatherCache = { data, fetchedAt: now, key: cacheKey };
    res.json(data);
  } catch (err) {
    console.error('Weather fetch failed:', err.message);
    res.status(502).json({ error: 'Could not fetch weather right now.' });
  }
});

// ---- Server stats ----
let statsCache = { data: null, fetchedAt: 0 };
app.get('/api/stats', requireDb, async (req, res) => {
  const now = Date.now();
  if (statsCache.data && now - statsCache.fetchedAt < 5000) {
    return res.json(statsCache.data);
  }
  try {
    const data = await getServerStats();
    statsCache = { data, fetchedAt: now };
    res.json(data);
  } catch (err) {
    console.error('Server stats read failed:', err.message);
    res.status(502).json({ error: 'Could not read server stats right now.' });
  }
});

// ---- Stocks ----
// Needs a free Finnhub API key (FINNHUB_API_KEY) — without one, this
// responds with configured:false rather than an error, so the card can
// show a friendly "add a key" message instead of looking broken.
const stocksCache = new Map(); // symbols key -> { data, fetchedAt }
app.get('/api/stocks', requireDb, async (req, res) => {
  if (!FINNHUB_API_KEY) {
    return res.json({ configured: false, quotes: [] });
  }
  const symbols = (req.query.symbols || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!symbols.length) return res.json({ configured: true, quotes: [] });

  const cacheKey = [...symbols].sort().join(',');
  const now = Date.now();
  const cached = stocksCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < 60_000) {
    return res.json({ configured: true, quotes: cached.data });
  }
  try {
    const quotes = await getStockQuotes(symbols, FINNHUB_API_KEY);
    stocksCache.set(cacheKey, { data: quotes, fetchedAt: now });
    res.json({ configured: true, quotes });
  } catch (err) {
    console.error('Stock quote fetch failed:', err.message);
    res.status(502).json({ error: 'Could not fetch stock quotes right now.' });
  }
});

// ---- Settings ----
const PUBLIC_SETTING_KEYS = [
  'site_title',
  'weather_lat',
  'weather_lon',
  'weather_location_name',
  'theme',
  'logo_data_url',
  'background_data_url',
  'kiosk_idle_minutes',
  'kiosk_default_duration',
  'kiosk_night_start',
  'kiosk_night_end',
];
const MAX_LOGO_DATA_URL_LENGTH = 1_500_000; // ~1MB of base64, plenty for a small logo
const MAX_BACKGROUND_DATA_URL_LENGTH = 2_500_000; // background images can be a bit bigger

app.get('/api/settings', requireDb, async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

app.patch('/api/settings', requireDb, auth.requireEdit, async (req, res) => {
  const body = req.body || {};
  if (typeof body.logo_data_url === 'string' && body.logo_data_url.length > MAX_LOGO_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Logo image is too large — please use a smaller image.' });
  }
  if (typeof body.background_data_url === 'string' && body.background_data_url.length > MAX_BACKGROUND_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Background image is too large — please use a smaller image.' });
  }
  const updated = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    if (typeof body[key] === 'string') {
      await setSetting(key, body[key]);
      updated[key] = body[key];
    }
  }
  // Explicit clear: {"background_data_url": null} removes a previously set
  // background (distinct from omitting the key, which leaves it alone).
  if (body.background_data_url === null) {
    await setSetting('background_data_url', '');
    updated.background_data_url = '';
  }
  if (body.logo_data_url === null) {
    await setSetting('logo_data_url', '');
    updated.logo_data_url = '';
  }
  res.json(updated);
});

// ---- Backup / restore ----
app.get('/api/backup', requireDb, auth.requireEdit, async (req, res) => {
  try {
    const yamlText = await buildBackupYaml();
    res.setHeader('Content-Type', 'application/x-yaml');
    res.setHeader('Content-Disposition', `attachment; filename="alcove-backup-${new Date().toISOString().slice(0, 10)}.yml"`);
    res.send(yamlText);
  } catch (err) {
    console.error('Backup export failed:', err.message);
    res.status(500).json({ error: 'Could not build backup.' });
  }
});

app.post('/api/backup', requireDb, auth.requireEdit, async (req, res) => {
  const text = req.body?.yaml;
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'yaml is required' });
  }
  let parsed;
  try {
    parsed = yaml.load(text);
  } catch (err) {
    return res.status(400).json({ error: 'Could not parse that file as YAML.' });
  }
  if (!parsed || typeof parsed !== 'object') {
    return res.status(400).json({ error: 'That file does not look like a valid backup.' });
  }
  try {
    await importBackup(parsed);
    res.json({ ok: true });
  } catch (err) {
    console.error('Backup import failed:', err.message);
    res.status(500).json({ error: 'Could not restore that backup.' });
  }
});

// ---- Full dashboard (settings + sections + their contents) ----
app.get('/api/dashboard', requireDb, async (req, res) => {
  const settings = await getSettings();
  const { rows: sections } = await pool.query(
    'SELECT id, type, title, enabled, sort_order, accent_color, kiosk_enabled, kiosk_duration_seconds, card_size FROM sections ORDER BY sort_order ASC, id ASC'
  );

  for (const section of sections) {
    if (section.type === 'links') {
      const { rows } = await pool.query(
        'SELECT id, label, url, icon, sort_order FROM links WHERE section_id = $1 ORDER BY sort_order ASC, id ASC',
        [section.id]
      );
      section.links = rows;
    } else if (section.type === 'todo') {
      const { rows } = await pool.query(
        'SELECT id, text, done FROM todo_items WHERE section_id = $1 ORDER BY done ASC, created_at ASC',
        [section.id]
      );
      section.items = rows;
    } else if (section.type === 'leaderboard') {
      const { rows } = await pool.query(
        'SELECT id, name, emoji, points, sort_order FROM leaderboard_entries WHERE section_id = $1 ORDER BY sort_order ASC, id ASC',
        [section.id]
      );
      section.entries = rows;
    } else if (section.type === 'notes') {
      const { rows } = await pool.query(
        'SELECT id, text, author, created_at FROM notes_items WHERE section_id = $1 ORDER BY created_at DESC',
        [section.id]
      );
      section.notes = rows;
    } else if (section.type === 'countdown') {
      const { rows } = await pool.query(
        'SELECT label, target_date FROM countdown_config WHERE section_id = $1',
        [section.id]
      );
      const countdown = rows[0] || { label: 'Countdown', target_date: null };
      section.countdown = { ...countdown, target_date: toDateOnly(countdown.target_date) };
    } else if (section.type === 'stocks') {
      const { rows } = await pool.query(
        'SELECT id, symbol, sort_order FROM stock_symbols WHERE section_id = $1 ORDER BY sort_order ASC, id ASC',
        [section.id]
      );
      section.symbols = rows;
    } else if (section.type === 'chores') {
      const { rows: kids } = await pool.query(
        'SELECT id, name, icon, sort_order FROM chore_kids WHERE section_id = $1 ORDER BY sort_order ASC, id ASC',
        [section.id]
      );
      for (const kid of kids) {
        const { rows: tasks } = await pool.query(
          `SELECT t.id, t.text, t.sort_order,
                  EXISTS (SELECT 1 FROM chore_completions c WHERE c.task_id = t.id AND c.completed_date = CURRENT_DATE) AS "doneToday"
           FROM chore_tasks t WHERE t.chore_kid_id = $1 ORDER BY t.sort_order ASC, t.id ASC`,
          [kid.id]
        );
        kid.tasks = tasks;
      }
      section.kids = kids;
    } else if (section.type === 'photos') {
      const { rows } = await pool.query(
        'SELECT id, image_data_url, sort_order FROM photos WHERE section_id = $1 ORDER BY sort_order ASC, id ASC',
        [section.id]
      );
      section.photos = rows;
    } else if (section.type === 'calendar') {
      const { rows } = await pool.query('SELECT ics_url FROM calendar_config WHERE section_id = $1', [section.id]);
      section.calendar = { ics_url: rows[0]?.ics_url || null };
    }
  }

  res.json({ settings, sections });
});

// ---- Sections ----
app.post('/api/sections', requireDb, auth.requireEdit, async (req, res) => {
  const { type, title } = req.body || {};
  if (!SECTION_TYPES.includes(type)) {
    return res.status(400).json({ error: 'invalid section type' });
  }
  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order), 0) AS max FROM sections');
  const sortOrder = maxRows[0].max + 1;
  const { rows } = await pool.query(
    'INSERT INTO sections (type, title, sort_order) VALUES ($1, $2, $3) RETURNING id, type, title, enabled, sort_order, accent_color, kiosk_enabled, kiosk_duration_seconds, card_size',
    [type, (title || type).trim() || type, sortOrder]
  );
  if (type === 'countdown') {
    await pool.query('INSERT INTO countdown_config (section_id, label) VALUES ($1, $2)', [rows[0].id, 'Countdown']);
  }
  if (type === 'calendar') {
    await pool.query('INSERT INTO calendar_config (section_id) VALUES ($1)', [rows[0].id]);
  }
  res.status(201).json(rows[0]);
});

app.post('/api/sections/reorder', requireDb, auth.requireEdit, async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < order.length; i++) {
      await client.query('UPDATE sections SET sort_order = $1 WHERE id = $2', [i + 1, order[i]]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'failed to reorder' });
  } finally {
    client.release();
  }
});

app.patch('/api/sections/:id', requireDb, auth.requireEdit, async (req, res) => {
  const body = req.body || {};
  const { title, enabled } = body;
  const fields = [];
  const values = [];
  let i = 1;
  if (typeof title === 'string' && title.trim()) {
    fields.push(`title = $${i++}`);
    values.push(title.trim());
  }
  if (typeof enabled === 'boolean') {
    fields.push(`enabled = $${i++}`);
    values.push(enabled);
  }
  // accent_color: a hex string sets it, null explicitly clears it back to
  // the theme default — distinct from omitting the key entirely.
  if ('accent_color' in body) {
    fields.push(`accent_color = $${i++}`);
    values.push(typeof body.accent_color === 'string' && body.accent_color.trim() ? body.accent_color.trim() : null);
  }
  if (typeof body.kiosk_enabled === 'boolean') {
    fields.push(`kiosk_enabled = $${i++}`);
    values.push(body.kiosk_enabled);
  }
  // kiosk_duration_seconds: a positive number sets a per-section override,
  // null explicitly clears it back to the dashboard-wide default.
  if ('kiosk_duration_seconds' in body) {
    fields.push(`kiosk_duration_seconds = $${i++}`);
    values.push(Number.isFinite(body.kiosk_duration_seconds) && body.kiosk_duration_seconds > 0 ? Math.round(body.kiosk_duration_seconds) : null);
  }
  if (['small', 'medium', 'large'].includes(body.card_size)) {
    fields.push(`card_size = $${i++}`);
    values.push(body.card_size);
  }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE sections SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, type, title, enabled, sort_order, accent_color, kiosk_enabled, kiosk_duration_seconds, card_size`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.delete('/api/sections/:id', requireDb, auth.requireEdit, async (req, res) => {
  await pool.query('DELETE FROM sections WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ---- Links ----
app.post('/api/sections/:id/links', requireDb, auth.requireEdit, async (req, res) => {
  const { label, url, icon } = req.body || {};
  if (!label || !url) return res.status(400).json({ error: 'label and url are required' });
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS max FROM links WHERE section_id = $1',
    [req.params.id]
  );
  const { rows } = await pool.query(
    'INSERT INTO links (section_id, label, url, icon, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id, label, url, icon, sort_order',
    [req.params.id, label.trim(), url.trim(), (icon || 'link-2').trim(), maxRows[0].max + 1]
  );
  res.status(201).json(rows[0]);
});

app.post('/api/sections/:id/links/reorder', requireDb, auth.requireEdit, async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < order.length; i++) {
      await client.query('UPDATE links SET sort_order = $1 WHERE id = $2 AND section_id = $3', [
        i + 1,
        order[i],
        req.params.id,
      ]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'failed to reorder' });
  } finally {
    client.release();
  }
});

app.patch('/api/links/:id', requireDb, auth.requireEdit, async (req, res) => {
  const { label, url, icon } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (typeof label === 'string' && label.trim()) {
    fields.push(`label = $${i++}`);
    values.push(label.trim());
  }
  if (typeof url === 'string' && url.trim()) {
    fields.push(`url = $${i++}`);
    values.push(url.trim());
  }
  if (typeof icon === 'string' && icon.trim()) {
    fields.push(`icon = $${i++}`);
    values.push(icon.trim());
  }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE links SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, label, url, icon, sort_order`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.delete('/api/links/:id', requireDb, auth.requireEdit, async (req, res) => {
  await pool.query('DELETE FROM links WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ---- Todo items (everyday use — no PIN required) ----
app.post('/api/sections/:id/todo', requireDb, async (req, res) => {
  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const { rows } = await pool.query(
    'INSERT INTO todo_items (section_id, text) VALUES ($1, $2) RETURNING id, text, done',
    [req.params.id, text]
  );
  res.status(201).json(rows[0]);
});

app.patch('/api/todo/:id', requireDb, async (req, res) => {
  const { done } = req.body || {};
  const { rows } = await pool.query(
    'UPDATE todo_items SET done = $1 WHERE id = $2 RETURNING id, text, done',
    [Boolean(done), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.delete('/api/todo/:id', requireDb, async (req, res) => {
  await pool.query('DELETE FROM todo_items WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ---- Leaderboard ----
// Adding/removing/renaming entries is a structural edit (PIN-protected).
// Nudging points up/down is everyday interaction and stays open, matching
// how the todo list works — it's the "game", not the dashboard layout.
app.post('/api/sections/:id/leaderboard', requireDb, auth.requireEdit, async (req, res) => {
  const { name, emoji } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS max FROM leaderboard_entries WHERE section_id = $1',
    [req.params.id]
  );
  const { rows } = await pool.query(
    'INSERT INTO leaderboard_entries (section_id, name, emoji, sort_order) VALUES ($1, $2, $3, $4) RETURNING id, name, emoji, points, sort_order',
    [req.params.id, name.trim(), (emoji || 'star').trim(), maxRows[0].max + 1]
  );
  res.status(201).json(rows[0]);
});

app.patch('/api/leaderboard/:id', requireDb, async (req, res) => {
  const { name, emoji, delta } = req.body || {};

  if (typeof delta === 'number' && name === undefined && emoji === undefined) {
    const { rows } = await pool.query(
      'UPDATE leaderboard_entries SET points = points + $1 WHERE id = $2 RETURNING id, name, emoji, points',
      [delta, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    return res.json(rows[0]);
  }

  // Renaming or changing the avatar is a structural edit, so it goes
  // through the same PIN-protected middleware, just invoked manually here
  // since this route also serves the always-open points delta above.
  return auth.requireEdit(req, res, async () => {
    const fields = [];
    const values = [];
    let i = 1;
    if (typeof name === 'string' && name.trim()) {
      fields.push(`name = $${i++}`);
      values.push(name.trim());
    }
    if (typeof emoji === 'string' && emoji.trim()) {
      fields.push(`emoji = $${i++}`);
      values.push(emoji.trim());
    }
    if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE leaderboard_entries SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, emoji, points, sort_order`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  });
});

app.delete('/api/leaderboard/:id', requireDb, auth.requireEdit, async (req, res) => {
  await pool.query('DELETE FROM leaderboard_entries WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ---- Stock symbols (structural — PIN-protected like links) ----
app.post('/api/sections/:id/stocks', requireDb, auth.requireEdit, async (req, res) => {
  const symbol = (req.body?.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS max FROM stock_symbols WHERE section_id = $1',
    [req.params.id]
  );
  const { rows } = await pool.query(
    'INSERT INTO stock_symbols (section_id, symbol, sort_order) VALUES ($1, $2, $3) RETURNING id, symbol, sort_order',
    [req.params.id, symbol, maxRows[0].max + 1]
  );
  res.status(201).json(rows[0]);
});

app.delete('/api/stocks/:id', requireDb, auth.requireEdit, async (req, res) => {
  await pool.query('DELETE FROM stock_symbols WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ---- Notes / announcements (everyday use — no PIN required) ----
app.post('/api/sections/:id/notes', requireDb, async (req, res) => {
  const text = (req.body?.text || '').trim();
  const author = (req.body?.author || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const { rows } = await pool.query(
    'INSERT INTO notes_items (section_id, text, author) VALUES ($1, $2, $3) RETURNING id, text, author, created_at',
    [req.params.id, text, author || null]
  );
  res.status(201).json(rows[0]);
});

app.delete('/api/notes/:id', requireDb, async (req, res) => {
  await pool.query('DELETE FROM notes_items WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ---- Countdown (structural config — PIN-protected like settings) ----
app.patch('/api/sections/:id/countdown', requireDb, auth.requireEdit, async (req, res) => {
  const { label, target_date: targetDate } = req.body || {};
  const { rows } = await pool.query(
    `INSERT INTO countdown_config (section_id, label, target_date) VALUES ($1, $2, $3)
     ON CONFLICT (section_id) DO UPDATE SET
       label = COALESCE(EXCLUDED.label, countdown_config.label),
       target_date = EXCLUDED.target_date
     RETURNING label, target_date`,
    [req.params.id, label?.trim() || 'Countdown', targetDate || null]
  );
  res.json({ ...rows[0], target_date: toDateOnly(rows[0].target_date) });
});

// ---- Chores ----
// Adding/removing kids and tasks is structural (PIN-protected). Toggling a
// task done/not-done today is everyday use, like the to-do list.
app.post('/api/sections/:id/chores/kids', requireDb, auth.requireEdit, async (req, res) => {
  const { name, icon } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS max FROM chore_kids WHERE section_id = $1',
    [req.params.id]
  );
  const { rows } = await pool.query(
    'INSERT INTO chore_kids (section_id, name, icon, sort_order) VALUES ($1, $2, $3, $4) RETURNING id, name, icon, sort_order',
    [req.params.id, name.trim(), (icon || 'star').trim(), maxRows[0].max + 1]
  );
  res.status(201).json({ ...rows[0], tasks: [] });
});

app.patch('/api/chores/kids/:id', requireDb, auth.requireEdit, async (req, res) => {
  const { name, icon } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (typeof name === 'string' && name.trim()) {
    fields.push(`name = $${i++}`);
    values.push(name.trim());
  }
  if (typeof icon === 'string' && icon.trim()) {
    fields.push(`icon = $${i++}`);
    values.push(icon.trim());
  }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE chore_kids SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, icon, sort_order`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.delete('/api/chores/kids/:id', requireDb, auth.requireEdit, async (req, res) => {
  await pool.query('DELETE FROM chore_kids WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

app.post('/api/chores/kids/:id/tasks', requireDb, auth.requireEdit, async (req, res) => {
  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS max FROM chore_tasks WHERE chore_kid_id = $1',
    [req.params.id]
  );
  const { rows } = await pool.query(
    'INSERT INTO chore_tasks (chore_kid_id, text, sort_order) VALUES ($1, $2, $3) RETURNING id, text, sort_order',
    [req.params.id, text, maxRows[0].max + 1]
  );
  res.status(201).json({ ...rows[0], doneToday: false });
});

app.delete('/api/chores/tasks/:id', requireDb, auth.requireEdit, async (req, res) => {
  await pool.query('DELETE FROM chore_tasks WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

app.patch('/api/chores/tasks/:id/toggle', requireDb, async (req, res) => {
  const { done } = req.body || {};
  if (done) {
    await pool.query(
      `INSERT INTO chore_completions (task_id, completed_date) VALUES ($1, CURRENT_DATE)
       ON CONFLICT DO NOTHING`,
      [req.params.id]
    );
  } else {
    await pool.query('DELETE FROM chore_completions WHERE task_id = $1 AND completed_date = CURRENT_DATE', [
      req.params.id,
    ]);
  }
  res.json({ ok: true, doneToday: Boolean(done) });
});

// ---- Photos ----
const MAX_PHOTO_DATA_URL_LENGTH = 1_200_000; // ~900KB raw image, plenty for a dashboard slideshow
const MAX_PHOTOS_PER_SECTION = 24;

app.post('/api/sections/:id/photos', requireDb, auth.requireEdit, async (req, res) => {
  const imageDataUrl = req.body?.image_data_url;
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'image_data_url must be a data:image/... URL' });
  }
  if (imageDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Photo is too large — please use a smaller image.' });
  }
  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM photos WHERE section_id = $1', [
    req.params.id,
  ]);
  if (countRows[0].count >= MAX_PHOTOS_PER_SECTION) {
    return res.status(400).json({ error: `This section already has the maximum of ${MAX_PHOTOS_PER_SECTION} photos.` });
  }
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS max FROM photos WHERE section_id = $1',
    [req.params.id]
  );
  const { rows } = await pool.query(
    'INSERT INTO photos (section_id, image_data_url, sort_order) VALUES ($1, $2, $3) RETURNING id, image_data_url, sort_order',
    [req.params.id, imageDataUrl, maxRows[0].max + 1]
  );
  res.status(201).json(rows[0]);
});

app.delete('/api/photos/:id', requireDb, auth.requireEdit, async (req, res) => {
  await pool.query('DELETE FROM photos WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ---- Calendar ----
const calendarCache = new Map(); // section id -> { data, fetchedAt }

app.patch('/api/sections/:id/calendar', requireDb, auth.requireEdit, async (req, res) => {
  const icsUrl = (req.body?.ics_url || '').trim();
  const { rows } = await pool.query(
    `INSERT INTO calendar_config (section_id, ics_url) VALUES ($1, $2)
     ON CONFLICT (section_id) DO UPDATE SET ics_url = EXCLUDED.ics_url
     RETURNING ics_url`,
    [req.params.id, icsUrl || null]
  );
  calendarCache.delete(req.params.id);
  res.json(rows[0]);
});

app.get('/api/sections/:id/calendar/events', requireDb, async (req, res) => {
  const { rows } = await pool.query('SELECT ics_url FROM calendar_config WHERE section_id = $1', [req.params.id]);
  const icsUrl = rows[0]?.ics_url;
  if (!icsUrl) return res.json({ configured: false, events: [] });

  const now = Date.now();
  const cached = calendarCache.get(req.params.id);
  if (cached && now - cached.fetchedAt < 15 * 60 * 1000) {
    return res.json({ configured: true, events: cached.data });
  }
  try {
    const events = await getCalendarEvents(icsUrl);
    calendarCache.set(req.params.id, { data: events, fetchedAt: now });
    res.json({ configured: true, events });
  } catch (err) {
    console.error('Calendar fetch failed:', err.message);
    res.status(502).json({ error: 'Could not read that calendar feed right now.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, dbReady });
});

app.listen(PORT, () => {
  console.log(`Alcove listening on port ${PORT}`);
});
