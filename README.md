# IntraHub

A self-hosted, family-friendly home dashboard: weather, server stats, a
customisable to-do/brief list, a customisable grid of quick links, a family
notes board, event countdowns, and a points leaderboard — all fully editable
from the page itself, no rebuild required. Choose from four built-in themes
(Neon Night, Sunset Warm, Ocean Depths, Forest Glow) and upload your own
logo. Responsive for laptop, tablet and phone. Runs in a single Docker
container and stores its data in your own Postgres database.

Licensed under [AGPL-3.0-or-later](LICENSE).

## Features

- **Customisable sections** — add, remove, rename, hide, and reorder as many
  Weather / Server Stats / To-do / Links / Notes / Countdown / Leaderboard
  sections as you like, straight from the dashboard.
- **Customisable links** — each Links section is its own grid of icon +
  label + URL tiles you add, edit and remove inline.
- **Server Stats** — live host CPU load, memory, disk and uptime (see
  [Server Stats](#server-stats) below for the Docker mount it needs).
- **Notes board** — a simple shared message board the whole family can post
  to.
- **Countdown** — a days-to-go counter for a birthday, holiday or event.
- **Points leaderboard** — a lightweight, editable scoreboard (name, emoji,
  points) for whatever game or reward system you're running at home.
- **Themes + logo** — pick from four built-in color themes and upload your
  own logo image, both from the Settings card.
- **No login by default** — designed for a trusted home network. Optionally
  protect the edit/customize mode with a PIN (`ADMIN_PIN`) — the dashboard
  itself stays open to everyone either way.
- **No env-var lock-in** — first-boot content comes from an editable YAML
  config file, then lives in Postgres from then on.

## Quick start

```bash
git clone https://github.com/mahansford/intrahub.git
cd intrahub
cp .env.example .env
```

Edit `.env`: set your Postgres connection details, and optionally an
`ADMIN_PIN`. Optionally copy `config/local.example.yml` to
`config/local.yml` to seed your own dashboard on first boot instead of the
generic default (see [Configuration](#configuration) below).

One-time setup on your Postgres server:

```sql
CREATE DATABASE intranet;
CREATE USER intranet WITH PASSWORD 'choose-a-real-password';
GRANT ALL PRIVILEGES ON DATABASE intranet TO intranet;
```

(On Postgres 15+, also connect to the `intranet` database and run
`GRANT ALL ON SCHEMA public TO intranet;` if the app can't create tables.)

Then run:

```bash
docker compose up -d --build
```

Visit `http://<this-machine's-LAN-IP>:8080` from any laptop, phone or
tablet on the same network.

### Using the published image

Once this project has a Docker Hub release (see
[Publishing](#publishing-to-docker-hub)), you can skip building locally —
edit `docker-compose.yml` to use `image: yourdockerhubusername/intrahub:latest`
instead of `build: .`, or run directly:

```bash
docker run -d --name intrahub -p 8080:8080 \
  --env-file .env \
  -v ./config:/app/config:ro \
  yourdockerhubusername/intrahub:latest
```

## Configuration

Everything about the dashboard's *content* — sections, links, leaderboard
entries, site title, weather location — is editable live from the ⚙️
**Customize** button in the header, backed by Postgres. Nothing needs a
restart.

`config/default.yml` (or `config/local.yml`, if present — see
`config/local.example.yml`) only matters **once**, the very first time the
app starts against an empty database: it seeds the initial dashboard. After
that it's never read again. This keeps the committed `config/default.yml`
generic (fine for anyone cloning this repo), while your own
`config/local.yml` (gitignored) can hold your real setup without touching
git history.

Environment variables (`.env`, see `.env.example`):

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Your Postgres connection |
| `ADMIN_PIN` | Optional PIN required to enter Customize/edit mode. Leave blank for no protection. |
| `SOURCE_URL` | Link shown in the footer — point it at your fork if you modify the code (see [License](#license)) |
| `CONFIG_PATH` | Override which YAML file seeds a fresh install (defaults to `config/local.yml` then `config/default.yml`) |

## Editing the dashboard

Click **⚙️ Customize** in the header (enter the PIN if you set one).
While in edit mode you can:

- Rename, reorder (↑/↓), hide (🙈), or delete (🗑️) any section
- Add a new section (pick a type and a title, bottom of the page)
- Add/edit/delete links within a Links section
- Add/edit/delete entries within a Leaderboard section
- Edit the dashboard title and weather location in the Settings card

Day-to-day interactions — ticking off a to-do item, adding one, posting a
note, and adjusting leaderboard points with +/− — always stay open, even
with a PIN set, since that's normal use rather than editing the layout.

## Server Stats

The Server Stats card reads `/proc` (load average, memory, uptime) and does
a `statfs` on disk usage. By default `docker-compose.yml` mounts your real
host's `/proc` and `/` into the container **read-only** so the card shows
the actual machine's stats, not just this one container's slice:

```yaml
volumes:
  - /proc:/hostproc:ro
  - /:/hostfs:ro
```

**Docker Desktop / OrbStack on macOS or Windows**: there's no way around an
inherent limitation here — Docker itself only has access to its internal
Linux VM, not literally macOS/Windows, so the mounts above give you the
VM's stats, not your real host. This works as intended (true host stats) on
a native Linux server, which is the common case for a home server. If you'd
rather not mount host paths at all, delete or comment out those two volume
lines and the matching `HOST_PROC_PATH`/`HOST_FS_PATH` env vars — the card
falls back to the container's own stats automatically.

## Publishing to Docker Hub

A GitHub Actions workflow at
[.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)
builds a multi-arch (amd64 + arm64, so it runs on a Raspberry Pi) image and
pushes it to Docker Hub whenever you push a `vX.Y.Z` tag.

1. Update `DOCKERHUB_IMAGE` in that workflow file to your real Docker Hub
   namespace/image name.
2. Add repo secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (an access
   token, not your password) under Settings → Secrets → Actions.
3. `git tag v1.0.0 && git push --tags`

Or build/push manually:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t yourdockerhubusername/intrahub:latest --push .
```

## License

This project is licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0-or-later).

The AGPL requires that if you modify this project and let others use it
over a network (e.g. your own family runs your fork), you make your
modified source available to them. Set `SOURCE_URL` in `.env` to point at
your fork so the footer link stays accurate.

## Notes

- Weather comes from the free [Open-Meteo](https://open-meteo.com/) API —
  no API key needed.
- If Postgres isn't reachable, the dashboard still loads — weather still
  works, and other sections show a friendly error until the database is
  configured correctly. The server retries the DB connection every 10s.
