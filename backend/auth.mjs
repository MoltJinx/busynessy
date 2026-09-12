import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const TTL = 8 * 60 * 60 * 1000;
const COOKIE = 'busynessy_session';
const digest = value => createHash('sha256').update(value).digest('hex');
export const fault = (status, message) => Object.assign(Error(message), { status });
export const publicUser = user => ({ id: user.clerkId || user.id, username: user.username, companyId: user.customerId, primaryAccountId:user.accountIds?.[0] || null });

// Almacén local de desarrollo. Nunca se guardan contraseñas ni cookies en claro.
// Un único proceso de backend debe usar este archivo; producción requiere una BD.
export function createAuthStore(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : { users: [], sessions: [] };
  if (!Array.isArray(db.users) || !Array.isArray(db.sessions)) throw Error('Almacén de autenticación inválido.');
  const pending = new Set();
  const attempts = new Map();
  const persist = () => {
    fs.writeFileSync(filename + '.tmp', JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(filename + '.tmp', filename);
  };
  const token = req => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
  const passwordHash = (password, salt) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  function throttle(address) {
    const now = Date.now();
    for (const [key, state] of attempts) if (state.until <= now) attempts.delete(key);
    const state = attempts.get(address) || { count: 0, until: now + 60000 };
    state.count++;
    attempts.set(address, state);
    if (state.count > 15) throw fault(429, 'Demasiados intentos. Espera un minuto.');
  }
  function linkAccount(user, accountId) {
    if (!db.users.includes(user) || typeof accountId !== 'string' || !accountId) throw Error('Vínculo de cuenta inválido.');
    user.accountIds = [...new Set([...(user.accountIds || []),accountId])];
    persist();
  }
  return {
    throttle,
    linkAccount,
    findByClerkId(clerkId) {
      return db.users.find(user => user.clerkId === clerkId) || null;
    },
    async registerClerk(input, provision) {
      const clerkId = String(input.clerkId || '').trim();
      const username = String(input.username || '').trim().toLowerCase().slice(0, 100) || clerkId;
      if (!clerkId) throw fault(401, 'No se pudo identificar la sesión.');
      if (this.findByClerkId(clerkId) || pending.has(clerkId)) throw fault(409, 'Esta cuenta ya tiene una empresa vinculada.');
      pending.add(clerkId);
      try {
        const user = { id: randomUUID(), clerkId, username, customerId: null, accountIds: [] };
        const result = await provision(customerId => {
          user.customerId = customerId;
          db.users.push(user);
          persist();
        }, accountId => linkAccount(user, accountId));
        return { user, result };
      } finally {
        pending.delete(clerkId);
      }
    },
    async register(input, provision) {
      const username = String(input.username || '').trim().toLowerCase();
      const companyName = String(input.name || '').trim();
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw fault(400, 'Usuario: usa de 3 a 40 letras, números, puntos, guiones o guiones bajos.');
      if (username === 'admin') throw fault(409, 'Ese usuario no está disponible.');
      if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) throw fault(400, 'La contraseña debe tener entre 12 y 128 caracteres.');
      if (!companyName || companyName.length > 100) throw fault(400, 'Escribe el nombre de tu empresa (máximo 100 caracteres).');
      if (pending.has(username) || db.users.some(u => u.username === username)) throw fault(409, 'Ese usuario no está disponible.');
      pending.add(username);
      try {
        const salt = randomBytes(16).toString('hex');
        const hash = (await passwordHash(input.password, salt)).toString('hex');
        const user = { id: randomUUID(), username, salt, hash, customerId: null, accountIds:[] };
        const result = await provision(customerId => {
          user.customerId = customerId;
          db.users.push(user);
          persist(); // Vincular antes de abrir la cuenta: un fallo no deja la empresa sin dueño.
        }, accountId => linkAccount(user,accountId));
        return { user, result };
      } finally { pending.delete(username); }
    },
    async login(username, password) {
      const user = db.users.find(u => u.username === String(username || '').trim().toLowerCase());
      const validInput = typeof password === 'string' && password.length <= 128;
      const candidate = await passwordHash(validInput ? password : '', user?.salt || '0'.repeat(32));
      const expected = user ? Buffer.from(user.hash, 'hex') : Buffer.alloc(64);
      if (!validInput || !user || !timingSafeEqual(candidate, expected)) throw fault(401, 'Usuario o contraseña incorrectos.');
      return user;
    },
    start(user, req, res) {
      const previous = digest(token(req));
      const raw = randomBytes(32).toString('hex');
      db.sessions = db.sessions.filter(s => s.expires > Date.now() && s.hash !== previous);
      const owned = db.sessions.filter(s => s.userId === user.id);
      if (owned.length >= 5) db.sessions = db.sessions.filter(s => !owned.slice(0, owned.length - 4).includes(s));
      db.sessions.push({ hash: digest(raw), userId: user.id, expires: Date.now() + TTL });
      persist();
      res.setHeader('Set-Cookie', `${COOKIE}=${raw}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${TTL / 1000}`);
    },
    startAdmin(req, res) {
      const previous = digest(token(req));
      const raw = randomBytes(32).toString('hex');
      db.sessions = db.sessions.filter(s => s.expires > Date.now() && s.hash !== previous && s.role !== 'admin');
      db.sessions.push({ hash: digest(raw), role: 'admin', expires: Date.now() + TTL });
      persist();
      res.setHeader('Set-Cookie', `${COOKIE}=${raw}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${TTL / 1000}`);
    },
    current(req) {
      const raw = token(req);
      if (!/^[a-f0-9]{64}$/.test(raw)) throw fault(401, 'Inicia sesión para continuar.');
      const session = db.sessions.find(s => s.hash === digest(raw) && s.expires > Date.now());
      const user = session && db.users.find(u => u.id === session.userId);
      if (!user) throw fault(401, 'Tu sesión terminó. Inicia sesión de nuevo.');
      return user;
    },
    currentAdmin(req) {
      const raw = token(req);
      if (!/^[a-f0-9]{64}$/.test(raw)) throw fault(401, 'Inicia sesión para continuar.');
      const session = db.sessions.find(s => s.hash === digest(raw) && s.role === 'admin' && s.expires > Date.now());
      if (!session) throw fault(401, 'Tu sesión terminó. Inicia sesión de nuevo.');
      return session;
    },
    logout(req, res) {
      const hash = digest(token(req));
      db.sessions = db.sessions.filter(s => s.hash !== hash);
      persist();
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`);
    },
  };
}
