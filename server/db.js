import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
});

const SECTION_TYPES = ['weather', 'todo', 'links', 'leaderboard', 'stats', 'notes', 'countdown'];

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sections (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('weather','todo','links','leaderboard','stats','notes','countdown')),
      title TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      id SERIAL PRIMARY KEY,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'link-2',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS todo_items (
      id SERIAL PRIMARY KEY,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard_entries (
      id SERIAL PRIMARY KEY,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT 'star',
      points INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes_items (
      id SERIAL PRIMARY KEY,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      author TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS countdown_config (
      section_id INTEGER PRIMARY KEY REFERENCES sections(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Countdown',
      target_date DATE
    );
  `);
}

async function getSetting(key, fallback = null) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : fallback;
}

async function getSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}

async function isFreshInstall() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM sections');
  return rows[0].count === 0;
}

/**
 * Seeds sections/links/todo items/leaderboard entries/settings from a parsed
 * config object (see config/default.yml for shape). Only runs against an
 * empty database, so it never clobbers live edits made through the UI.
 */
async function seedFromConfig(config) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (config.site) {
      for (const [key, value] of Object.entries(config.site)) {
        if (value === undefined || value === null) continue;
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, String(value)]
        );
      }
    }

    let order = 0;
    for (const section of config.sections || []) {
      if (!SECTION_TYPES.includes(section.type)) continue;
      order += 1;
      const { rows } = await client.query(
        `INSERT INTO sections (type, title, enabled, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [section.type, section.title || section.type, section.enabled !== false, order]
      );
      const sectionId = rows[0].id;

      if (section.type === 'links') {
        let linkOrder = 0;
        for (const link of section.links || []) {
          linkOrder += 1;
          await client.query(
            `INSERT INTO links (section_id, label, url, icon, sort_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [sectionId, link.label, link.url, link.icon || 'link-2', linkOrder]
          );
        }
      }

      if (section.type === 'leaderboard') {
        let entryOrder = 0;
        for (const entry of section.entries || []) {
          entryOrder += 1;
          await client.query(
            `INSERT INTO leaderboard_entries (section_id, name, emoji, points, sort_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [sectionId, entry.name, entry.emoji || 'star', entry.points || 0, entryOrder]
          );
        }
      }

      if (section.type === 'todo') {
        for (const item of section.items || []) {
          await client.query(
            `INSERT INTO todo_items (section_id, text, done) VALUES ($1, $2, $3)`,
            [sectionId, item.text, Boolean(item.done)]
          );
        }
      }

      if (section.type === 'notes') {
        for (const note of section.notes || []) {
          await client.query(
            `INSERT INTO notes_items (section_id, text, author) VALUES ($1, $2, $3)`,
            [sectionId, note.text, note.author || null]
          );
        }
      }

      if (section.type === 'countdown') {
        await client.query(
          `INSERT INTO countdown_config (section_id, label, target_date) VALUES ($1, $2, $3)`,
          [sectionId, section.label || 'Countdown', section.target_date || null]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool, ensureSchema, getSetting, getSettings, setSetting, isFreshInstall, seedFromConfig, SECTION_TYPES };
