import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

// When docker-compose mounts the host's /proc and / read-only (see
// docker-compose.yml), these point there instead of the container's own —
// giving true host-machine stats rather than just this container's slice.
const HOST_PROC = process.env.HOST_PROC_PATH || '/hostproc';
const HOST_FS = process.env.HOST_FS_PATH || '/hostfs';

function resolveProcPath() {
  return fsSync.existsSync(HOST_PROC) ? HOST_PROC : '/proc';
}

function resolveFsPath() {
  return fsSync.existsSync(HOST_FS) ? HOST_FS : '/';
}

async function readLoadAvg(procPath) {
  const raw = await fs.readFile(path.join(procPath, 'loadavg'), 'utf8');
  const [one, five, fifteen] = raw.trim().split(' ').map(Number);
  return { one, five, fifteen };
}

async function readMemInfo(procPath) {
  const raw = await fs.readFile(path.join(procPath, 'meminfo'), 'utf8');
  const lines = raw.split('\n');
  const kb = (key) => {
    const line = lines.find((l) => l.startsWith(key + ':'));
    const match = line?.match(/(\d+)/);
    return match ? Number(match[1]) * 1024 : null;
  };
  const totalBytes = kb('MemTotal');
  const availableBytes = kb('MemAvailable') ?? kb('MemFree');
  const usedBytes = totalBytes != null && availableBytes != null ? totalBytes - availableBytes : null;
  return {
    totalBytes,
    availableBytes,
    usedBytes,
    usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : null,
  };
}

async function readUptimeSeconds(procPath) {
  const raw = await fs.readFile(path.join(procPath, 'uptime'), 'utf8');
  return Number(raw.trim().split(' ')[0]);
}

async function readCpuCount(procPath) {
  const raw = await fs.readFile(path.join(procPath, 'cpuinfo'), 'utf8').catch(() => '');
  const count = (raw.match(/^processor\s*:/gm) || []).length;
  return count || null;
}

async function readDisk(fsPath) {
  const stat = await fs.statfs(fsPath);
  const totalBytes = stat.blocks * stat.bsize;
  const freeBytes = stat.bfree * stat.bsize;
  const usedBytes = totalBytes - freeBytes;
  return {
    totalBytes,
    freeBytes,
    usedBytes,
    usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : null,
  };
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (days || hours) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

async function getServerStats() {
  const procPath = resolveProcPath();
  const fsPath = resolveFsPath();
  const hostMounted = procPath === HOST_PROC;

  const [load, memory, uptimeSeconds, cpuCount, disk] = await Promise.all([
    readLoadAvg(procPath),
    readMemInfo(procPath),
    readUptimeSeconds(procPath),
    readCpuCount(procPath),
    readDisk(fsPath).catch(() => null),
  ]);

  return {
    hostMounted,
    load,
    cpuCount,
    memory,
    uptimeSeconds,
    uptimeText: formatUptime(uptimeSeconds),
    disk,
  };
}

export { getServerStats };
