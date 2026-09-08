import pg from 'pg';
import yaml from 'js-yaml';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
});

const SECTION_TYPES = [
  'weather',
  'todo',
  'links',
  'leaderboard',
  'stats',
  'notes',
  'countdown',
  'stocks',
  'chores',
  'photos',
  'calendar',
];

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
      type TEXT NOT NULL CHECK (type IN ('weather','todo','links','leaderboard','stats','notes','countdown','stocks','chores','photos','calendar')),
      title TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Per-section accent color override, added after the initial release —
  // ALTER ... IF NOT EXISTS so it's safe to run against an already-seeded
  // database, not just a fresh one.
  await pool.query(`ALTER TABLE sections ADD COLUMN IF NOT EXISTS accent_color TEXT;`);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_symbols (
      id SERIAL PRIMARY KEY,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chore_kids (
      id SERIAL PRIMARY KEY,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'star',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chore_tasks (
      id SERIAL PRIMARY KEY,
      chore_kid_id INTEGER NOT NULL REFERENCES chore_kids(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  // A task is "done today" iff a row exists here for (task_id, today) — so
  // completion naturally resets every day with no cron job needed.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chore_completions (
      task_id INTEGER NOT NULL REFERENCES chore_tasks(id) ON DELETE CASCADE,
      completed_date DATE NOT NULL,
      PRIMARY KEY (task_id, completed_date)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      image_data_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_config (
      section_id INTEGER PRIMARY KEY REFERENCES sections(id) ON DELETE CASCADE,
      ics_url TEXT
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
 * config object (see config/default.yml for shape). Used both for the
 * first-boot seed (only against an empty database) and for restoring a
 * backup (against a just-wiped database — see importBackup below).
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
        `INSERT INTO sections (type, title, enabled, sort_order, accent_color)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [section.type, section.title || section.type, section.enabled !== false, order, section.accent_color || null]
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

      if (section.type === 'stocks') {
        let symbolOrder = 0;
        for (const symbol of section.symbols || []) {
          symbolOrder += 1;
          await client.query(
            `INSERT INTO stock_symbols (section_id, symbol, sort_order) VALUES ($1, $2, $3)`,
            [sectionId, String(symbol).toUpperCase(), symbolOrder]
          );
        }
      }

      if (section.type === 'chores') {
        let kidOrder = 0;
        for (const kid of section.kids || []) {
          kidOrder += 1;
          const { rows: kidRows } = await client.query(
            `INSERT INTO chore_kids (section_id, name, icon, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
            [sectionId, kid.name, kid.icon || 'star', kidOrder]
          );
          let taskOrder = 0;
          for (const task of kid.tasks || []) {
            taskOrder += 1;
            await client.query(
              `INSERT INTO chore_tasks (chore_kid_id, text, sort_order) VALUES ($1, $2, $3)`,
              [kidRows[0].id, typeof task === 'string' ? task : task.text, taskOrder]
            );
          }
        }
      }

      if (section.type === 'calendar') {
        await client.query(`INSERT INTO calendar_config (section_id, ics_url) VALUES ($1, $2)`, [
          sectionId,
          section.ics_url || null,
        ]);
      }

      // Photos aren't seeded from YAML (binary image data doesn't belong in
      // a text config file) — add them via the UI after first boot.
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Builds a config-shaped object of the current live dashboard, suitable for
 * yaml.dump()-ing as a downloadable backup and later feeding straight back
 * into seedFromConfig() to restore it. */
async function buildBackupObject() {
  const settings = await getSettings();
  const { rows: sections } = await pool.query(
    'SELECT id, type, title, enabled, sort_order, accent_color FROM sections ORDER BY sort_order ASC, id ASC'
  );

  const out = { site: settings, sections: [] };

  for (const section of sections) {
    const base = { type: section.type, title: section.title, enabled: section.enabled };
    if (section.accent_color) base.accent_color = section.accent_color;

    if (section.type === 'links') {
      const { rows } = await pool.query(
        'SELECT label, url, icon FROM links WHERE section_id = $1 ORDER BY sort_order ASC, id ASC',
        [section.id]
      );
      base.links = rows;
    } else if (section.type === 'leaderboard') {
      const { rows } = await pool.query(
        'SELECT name, emoji, points FROM leaderboard_entries WHERE section_id = $1 ORDER BY sort_order ASC, id ASC',
        [section.id]
      );
      base.entries = rows;
    } else if (section.type === 'todo') {
      const { rows } = await pool.query(
        'SELECT text, done FROM todo_items WHERE section_id = $1 ORDER BY created_at ASC',
        [section.id]
      );
      base.items = rows;
    } else if (section.type === 'notes') {
      const { rows } = await pool.query(
        'SELECT text, author FROM notes_items WHERE section_id = $1 ORDER BY created_at ASC',
        [section.id]
      );
      base.notes = rows;
    } else if (section.type === 'countdown') {
      const { rows } = await pool.query(
        'SELECT label, target_date FROM countdown_config WHERE section_id = $1',
        [section.id]
      );
      if (rows[0]) {
        base.label = rows[0].label;
        base.target_date = rows[0].target_date ? new Date(rows[0].target_date).toISOString().slice(0, 10) : null;
      }
    } else if (section.type === 'stocks') {
      const { rows } = await pool.query(
        'SELECT symbol FROM stock_symbols WHERE section_id = $1 ORDER BY sort_order ASC, id ASC',
        [section.id]
      );
      base.symbols = rows.map((r) => r.symbol);
    } else if (section.type === 'chores') {
      const { rows: kids } = await pool.query(
        'SELECT id, name, icon FROM chore_kids WHERE section_id = $1 ORDER BY sort_order ASC, id ASC',
        [section.id]
      );
      base.kids = [];
      for (const kid of kids) {
        const { rows: tasks } = await pool.query(
          'SELECT text FROM chore_tasks WHERE chore_kid_id = $1 ORDER BY sort_order ASC, id ASC',
          [kid.id]
        );
        base.kids.push({ name: kid.name, icon: kid.icon, tasks: tasks.map((t) => t.text) });
      }
    } else if (section.type === 'calendar') {
      const { rows } = await pool.query('SELECT ics_url FROM calendar_config WHERE section_id = $1', [section.id]);
      base.ics_url = rows[0]?.ics_url || null;
    }
    // 'weather', 'stats' and 'photos' carry no extra seedable config.

    out.sections.push(base);
  }

  return out;
}

async function buildBackupYaml() {
  const obj = await buildBackupObject();
  return yaml.dump(obj, { lineWidth: -1 });
}

/** Wipes all dashboard content and settings, then reseeds from a parsed
 * config object (e.g. a previously-exported backup). Destructive — callers
 * must confirm with the user before invoking this. */
async function importBackup(config) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sections'); // cascades to all child tables
    await client.query('DELETE FROM settings');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await seedFromConfig(config);
}

export {
  pool,
  ensureSchema,
  getSetting,
  getSettings,
  setSetting,
  isFreshInstall,
  seedFromConfig,
  buildBackupYaml,
  importBackup,
  SECTION_TYPES,
};
