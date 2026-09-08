import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, ensureSchema, getSettings, setSetting, isFreshInstall, seedFromConfig, SECTION_TYPES } from './db.js';
import { loadSeedConfig } from './config.js';
import * as auth from './auth.js';
import { getServerStats } from './stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const SOURCE_URL = process.env.SOURCE_URL || 'https://github.com/mahansford/IntraHub';

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
const WEATHER_CODES = {
  0: { text: 'Clear sky', icon: '☀️' },
  1: { text: 'Mostly clear', icon: '🌤️' },
  2: { text: 'Partly cloudy', icon: '⛅' },
  3: { text: 'Overcast', icon: '☁️' },
  45: { text: 'Foggy', icon: '🌫️' },
  48: { text: 'Foggy', icon: '🌫️' },
  51: { text: 'Light drizzle', icon: '🌦️' },
  53: { text: 'Drizzle', icon: '🌦️' },
  55: { text: 'Heavy drizzle', icon: '🌧️' },
  61: { text: 'Light rain', icon: '🌦️' },
  63: { text: 'Rain', icon: '🌧️' },
  65: { text: 'Heavy rain', icon: '🌧️' },
  71: { text: 'Light snow', icon: '🌨️' },
  73: { text: 'Snow', icon: '❄️' },
  75: { text: 'Heavy snow', icon: '❄️' },
  80: { text: 'Rain showers', icon: '🌦️' },
  81: { text: 'Rain showers', icon: '🌧️' },
  82: { text: 'Heavy showers', icon: '⛈️' },
  95: { text: 'Thunderstorm', icon: '⛈️' },
  96: { text: 'Thunderstorm', icon: '⛈️' },
  99: { text: 'Thunderstorm', icon: '⛈️' },
};

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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Open-Meteo responded ${resp.status}`);
    const raw = await resp.json();

    const currentCode = raw.current?.weather_code ?? 0;
    const todayCode = raw.daily?.weather_code?.[0] ?? currentCode;

    const data = {
      location: locationName,
      currentTempC: Math.round(raw.current?.temperature_2m),
      current: WEATHER_CODES[currentCode] || { text: 'Unknown', icon: '❓' },
      todayHighC: Math.round(raw.daily?.temperature_2m_max?.[0]),
      todayLowC: Math.round(raw.daily?.temperature_2m_min?.[0]),
      today: WEATHER_CODES[todayCode] || { text: 'Unknown', icon: '❓' },
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

// ---- Settings ----
const PUBLIC_SETTING_KEYS = [
  'site_title',
  'weather_lat',
  'weather_lon',
  'weather_location_name',
  'theme',
  'logo_data_url',
];
const MAX_LOGO_DATA_URL_LENGTH = 1_500_000; // ~1MB of base64, plenty for a small logo

app.get('/api/settings', requireDb, async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

app.patch('/api/settings', requireDb, auth.requireEdit, async (req, res) => {
  const body = req.body || {};
  if (typeof body.logo_data_url === 'string' && body.logo_data_url.length > MAX_LOGO_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Logo image is too large — please use a smaller image.' });
  }
  const updated = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    if (typeof body[key] === 'string') {
      await setSetting(key, body[key]);
      updated[key] = body[key];
    }
  }
  res.json(updated);
});

// ---- Full dashboard (settings + sections + their contents) ----
app.get('/api/dashboard', requireDb, async (req, res) => {
  const settings = await getSettings();
  const { rows: sections } = await pool.query(
    'SELECT id, type, title, enabled, sort_order FROM sections ORDER BY sort_order ASC, id ASC'
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
    'INSERT INTO sections (type, title, sort_order) VALUES ($1, $2, $3) RETURNING id, type, title, enabled, sort_order',
    [type, (title || type).trim() || type, sortOrder]
  );
  if (type === 'countdown') {
    await pool.query('INSERT INTO countdown_config (section_id, label) VALUES ($1, $2)', [rows[0].id, 'Countdown']);
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
  const { title, enabled } = req.body || {};
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
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE sections SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, type, title, enabled, sort_order`,
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
    [req.params.id, label.trim(), url.trim(), (icon || '🔗').trim(), maxRows[0].max + 1]
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
    [req.params.id, name.trim(), (emoji || '⭐').trim(), maxRows[0].max + 1]
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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, dbReady });
});

app.listen(PORT, () => {
  console.log(`IntraHub listening on port ${PORT}`);
});
