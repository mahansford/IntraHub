import crypto from 'node:crypto';
import cookie from 'cookie';

const COOKIE_NAME = 'edit_token';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Single-instance in-memory session store — fine for a small self-hosted
// dashboard with no horizontal scaling.
const validTokens = new Map();

function pinRequired() {
  return Boolean(process.env.ADMIN_PIN && process.env.ADMIN_PIN.trim());
}

function pruneExpired() {
  const now = Date.now();
  for (const [token, expiry] of validTokens) {
    if (expiry < now) validTokens.delete(token);
  }
}

function issueToken() {
  const token = crypto.randomBytes(24).toString('hex');
  validTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function readToken(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const parsed = cookie.parse(header);
  return parsed[COOKIE_NAME] || null;
}

function isUnlocked(req) {
  if (!pinRequired()) return true;
  pruneExpired();
  const token = readToken(req);
  return Boolean(token && validTokens.has(token));
}

function requireEdit(req, res, next) {
  if (isUnlocked(req)) return next();
  res.status(401).json({ error: 'Edit mode is locked. Enter the admin PIN to make changes.' });
}

function unlock(req, res) {
  if (!pinRequired()) {
    return res.json({ ok: true, pinRequired: false });
  }
  const { pin } = req.body || {};
  if (typeof pin !== 'string' || pin !== process.env.ADMIN_PIN) {
    return res.status(403).json({ error: 'Incorrect PIN' });
  }
  const token = issueToken();
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: TOKEN_TTL_MS / 1000,
      path: '/',
    })
  );
  res.json({ ok: true, pinRequired: true });
}

function lock(req, res) {
  const token = readToken(req);
  if (token) validTokens.delete(token);
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, '', { path: '/', maxAge: 0 }));
  res.json({ ok: true });
}

function status(req, res) {
  res.json({ pinRequired: pinRequired(), unlocked: isUnlocked(req) });
}

export { requireEdit, unlock, lock, status, pinRequired };
