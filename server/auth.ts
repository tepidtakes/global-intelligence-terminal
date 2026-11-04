// Email + password auth: scrypt hashes, random session tokens stored hashed,
// httpOnly SameSite=Lax cookie. Every private route requires a session.
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { get, run, now, uid } from './db.js';
import { ALLOW_SIGNUP } from './config.js';

const COOKIE = 'git_session';
const SESSION_DAYS = 30;

function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pw: string, stored: string) {
  const [, saltHex, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function startSession(res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)', sha(token), userId, expires.toISOString());
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${expires.toUTCString()}${secure}`);
}

export interface AuthedRequest extends Request { userId?: string; userEmail?: string; }

export function sessionMiddleware(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (token) {
    const row = get<{ user_id: string; expires_at: string; email: string }>(
      'SELECT s.user_id, s.expires_at, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?', sha(token));
    if (row && row.expires_at > now()) { req.userId = row.user_id; req.userEmail = row.email; }
  }
  next();
}

export function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: 'Sign in required' });
  next();
}

// Slow down password guessing: at most 10 failed logins per address+email per 15 minutes.
const failures = new Map<string, { n: number; until: number }>();
const throttleKey = (req: Request, email: string) => `${req.socket.remoteAddress || ''}|${email}`;
function throttled(key: string) { const f = failures.get(key); return !!f && f.n >= 10 && f.until > Date.now(); }
function recordFailure(key: string) {
  const f = failures.get(key);
  failures.set(key, !f || f.until < Date.now() ? { n: 1, until: Date.now() + 15 * 60_000 } : { n: f.n + 1, until: f.until });
  if (failures.size > 10_000) for (const [k, v] of failures) if (v.until < Date.now()) failures.delete(k);
}

export function register(req: Request, res: Response) {
  if (!ALLOW_SIGNUP) return res.status(403).json({ error: 'New accounts are disabled on this server.' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password.length > 256) return res.status(400).json({ error: 'Password must be at most 256 characters.' });
  if (get('SELECT id FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'An account with that email already exists.' });
  const id = uid();
  run('INSERT INTO users (id, email, password_hash, created_at) VALUES (?,?,?,?)', id, email, hashPassword(password), now());
  run('INSERT INTO watchlists (id, user_id, name, entity_ids) VALUES (?,?,?,?)', uid(), id, 'Main watchlist', '[]');
  startSession(res, id);
  res.json({ id, email });
}

export function login(req: Request, res: Response) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '').slice(0, 256);
  const key = throttleKey(req, email);
  if (throttled(key)) return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  const user = get<{ id: string; password_hash: string }>('SELECT id, password_hash FROM users WHERE email = ?', email);
  if (!user || !verifyPassword(password, user.password_hash)) { recordFailure(key); return res.status(401).json({ error: 'Email or password is incorrect.' }); }
  failures.delete(key);
  startSession(res, user.id);
  res.json({ id: user.id, email });
}

export function logout(req: Request, res: Response) {
  const token = readCookie(req, COOKIE);
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
}
