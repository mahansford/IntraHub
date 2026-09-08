import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Personal overrides (config/local.yml, gitignored) win over the committed
// generic default (config/default.yml) so this project stays a clean AGPL
// template while still supporting a real household's own setup.
const CANDIDATE_PATHS = [
  process.env.CONFIG_PATH,
  path.join(__dirname, '..', 'config', 'local.yml'),
  path.join(__dirname, '..', 'config', 'default.yml'),
].filter(Boolean);

function loadSeedConfig() {
  for (const candidate of CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf8');
        const parsed = yaml.load(raw);
        console.log(`Loaded seed config from ${candidate}`);
        return parsed || {};
      } catch (err) {
        console.error(`Failed to parse config at ${candidate}:`, err.message);
      }
    }
  }
  console.log('No seed config file found; using built-in generic defaults.');
  return builtInDefaults();
}

function builtInDefaults() {
  return {
    site: {
      title: 'IntraHub',
      weather_lat: '51.5074',
      weather_lon: '-0.1278',
      weather_location_name: 'London',
    },
    sections: [
      { type: 'weather', title: 'Weather' },
      {
        type: 'todo',
        title: "Today's Brief",
        items: [{ text: 'Customize this dashboard from the Customize button', done: false }],
      },
      {
        type: 'links',
        title: 'Quick Links',
        links: [
          { label: 'Example', icon: 'link-2', url: '#' },
        ],
      },
      {
        type: 'leaderboard',
        title: 'Points Leaderboard',
        entries: [
          { name: 'Player 1', emoji: 'cat', points: 0 },
          { name: 'Player 2', emoji: 'dog', points: 0 },
        ],
      },
    ],
  };
}

export { loadSeedConfig };
