const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { Server } = require('socket.io');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, 'data.sqlite');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const REC_DIR = path.join(DATA_DIR, 'recordings');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REC_BYTES = 1024 * 1024 * 1024;

process.on('uncaughtException', e => console.error('Beklenmeyen hata:', e));
fs.mkdirSync(REC_DIR, { recursive: true });

// ---------- Veritabanı ----------
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    room_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_date TEXT NOT NULL,
    event_time TEXT,
    room_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    room_id TEXT NOT NULL,
    day TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, room_id, day)
  );
  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// ---------- Yardımcılar ----------
function clean(value, max) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function own(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function localDay() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}

function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const test = crypto.scryptSync(pw, salt, 64);
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

// Yönetici hesabı her zaman moderatör olarak girer
function publicUser(r) {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.is_admin ? 'moderator' : r.role,
    isAdmin: !!r.is_admin
  };
}

function userFromToken(token) {
  if (typeof token !== 'string' || !token) return null;
  const r = db.prepare(
    'SELECT u.*, s.created_at AS session_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).get(token);
  if (!r) return null;
  if (Date.now() - new Date(r.session_at).getTime() > SESSION_MS) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return publicUser(r);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, userId, new Date().toISOString());
  return token;
}

setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE created_at < ?')
    .run(new Date(Date.now() - SESSION_MS).toISOString());
}, 60 * 60 * 1000).unref();

function eventView(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description || '',
    date: r.event_date,
    time: r.event_time || '',
    roomId: r.room_id || ''
  };
}

function noteView(r) {
  return { id: r.id, roomId: r.room_id, text: r.text, createdAt: r.created_at };
}

function notesForRoom(userId, roomId) {
  return db.prepare('SELECT * FROM notes WHERE user_id = ? AND room_id = ? ORDER BY id ASC')
    .all(userId, roomId).map(noteView);
}

const saveAttendance = db.prepare(
  'INSERT OR IGNORE INTO attendance (user_id, room_id, day, created_at) VALUES (?, ?, ?, ?)'
);

// İlk yönetici hesabı (veritabanı boşsa)
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const pw = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare(
    'INSERT INTO users (username, display_name, password_hash, role, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('admin', 'Yönetici', hashPassword(pw), 'teacher', 1, new Date().toISOString());
  console.log('UYARI: İlk yönetici oluşturuldu. Kullanıcı: admin  Şifre: ' + pw + '  (Lütfen hemen değiştir.)');
}

// ---------- Yedekleme ----------
function backupDb() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(BACKUP_DIR, 'data-' + stamp + '.sqlite');
    db.exec("VACUUM INTO '" + file.replace(/'/g, "''") + "'");
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('data-')).sort();
    while (files.length > 14) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    console.log('Yedek alındı: ' + file);
  } catch (e) {
    console.error('Yedekleme hatası:', e.message);
  }
}
backupDb();
setInterval(backupDb, 6 * 60 * 60 * 1000).unref();

// ---------- Hız sınırı ----------
const hits = new Map();
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const id = (req.ip || 'x') + ':' + name;
    const now = Date.now();
    let e = hits.get(id);
    if (!e || now > e.reset) {
      e = { count: 0, reset: now + windowMs };
      hits.set(id, e);
    }
    e.count++;
    if (e.count > max) {
      return res.status(429).json({ error: 'Çok fazla istek. Biraz bekleyip tekrar dene.' });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
}, 60 * 1000).unref();

// ---------- Odalar ----------
const ROOMS = {
  'sinif-1':    { name: 'Kudüs Sınıfı', type: 'class', teacherId: null, announce: null, timerEnd: 0, roll: null, poll: null, rec: null },
  'sinif-2':    { name: 'Medine Sınıfı', type: 'class', teacherId: null, announce: null, timerEnd: 0, roll: null, poll: null, rec: null },
  'ortak-alan': { name: 'Ortak Alan', type: 'common', teacherId: null, announce: null, timerEnd: 0, roll: null, poll: null, rec: null },
  'etkinlik':   { name: 'Etkinlik Salonu', type: 'common', teacherId: null, announce: null, timerEnd: 0, roll: null, poll: null, rec: null }
};

function roomExists(id) {
  return typeof id === 'string' && own(ROOMS, id);
}

function isClassRoom(id) {
  return roomExists(id) && ROOMS[id].type === 'class';
}

// ---------- Koltuklar ----------
const SEAT_ROWS = [{ letter: 'A', z: -4 }, { letter: 'B', z: -1 }, { letter: 'C', z: 2 }];
const SEAT_COLS = [-5, -2.5, 0, 2.5, 5];
const SEATS = {};
SEAT_ROWS.forEach(row => {
  SEAT_COLS.forEach((x, i) => {
    const id = row.letter + (i + 1);
    SEATS[id] = { id, x, z: row.z + 0.75, role: 'student', yaw: 0 };
  });
});
SEATS.T1 = { id: 'T1', x: 1.2, z: -7.6, role: 'teacher', yaw: Math.PI };
SEATS.M1 = { id: 'M1', x: -1.2, z: -7.6, role: 'moderator', yaw: Math.PI };

const TEACHER_SPAWN = { x: 0, z: -5.6, yaw: Math.PI };
const MOD_SPAWN = { x: -1.2, z: -5.6, yaw: Math.PI };
const STUDENT_SPAWNS = [
  { x: -6, z: 7.5 }, { x: -3, z: 7.5 }, { x: 0, z: 7.5 }, { x: 3, z: 7.5 }, { x: 6, z: 7.5 },
  { x: -6, z: 5.5 }, { x: -3, z: 5.5 }, { x: 0, z: 5.5 }, { x: 3, z: 5.5 }, { x: 6, z: 5.5 }
];

const players = {};
const chatTimes = {};

function spawnFor(role) {
  if (role === 'teacher') return { ...TEACHER_SPAWN };
  if (role === 'moderator') return { ...MOD_SPAWN };
  const s = STUDENT_SPAWNS[Math.floor(Math.random() * STUDENT_SPAWNS.length)];
  return { x: s.x, z: s.z, yaw: 0 };
}

function findStandSpot(roomId, seat, selfId) {
  for (const off of [0.95, 1.2, 1.4]) {
    const x = seat.x;
    const z = seat.z + off;
    const crowded = Object.values(players).some(q =>
      q.id !== selfId && q.roomId === roomId && Math.hypot(q.x - x, q.z - z) < 0.6
    );
    if (!crowded) return { x, z };
  }
  return { x: seat.x, z: seat.z + 0.95 };
}

function roomList() {
  return Object.entries(ROOMS).map(([id, r]) => ({
    id,
    name: r.name,
    type: r.type,
    hasTeacher: !!r.teacherId,
    count: Object.values(players).filter(p => p.roomId === id).length
  }));
}

function broadcastRooms() {
  io.emit('rooms', roomList());
}

function selfView(p) {
  return { id: p.id, name: p.name, role: p.role, roomId: p.roomId, x: p.x, z: p.z, yaw: p.yaw, hand: p.hand, seat: p.seat };
}

function seatTaken(roomId, seatId) {
  return Object.values(players).some(p => p.roomId === roomId && p.seat === seatId);
}

function leaveRoom(socket, p) {
  const room = ROOMS[p.roomId];
  if (!room) return;
  const rid = p.roomId;
  socket.leave(rid);
  if (room.teacherId === socket.id) room.teacherId = null;
  if (room.rec && p.role === 'moderator' && room.rec.by === p.name) {
    room.rec = null;
    io.to(rid).emit('notice', 'Moderatör ayrıldığı için ders kaydı durduruldu.');
    broadcastExtras(rid);
  }
  io.to(rid).emit('player-left', socket.id);
  p.roomId = null;
  p.seat = null;
}

// Eğitmen veya moderatör mi? (ders yönetimi yetkisi)
function canHost(p) {
  if (!p || !p.roomId || !isClassRoom(p.roomId)) return false;
  if (p.role === 'moderator') return true;
  return p.role === 'teacher' && ROOMS[p.roomId].teacherId === p.id;
}

// Oda yoklama ve ders bilgisini gören host soketleri
function hostSockets(roomId) {
  return Object.values(players)
    .filter(q => q.roomId === roomId && (q.role === 'moderator' || (q.role === 'teacher' && ROOMS[roomId].teacherId === q.id)))
    .map(q => q.id);
}

function pollView(poll) {
  if (!poll) return null;
  const counts = poll.options.map(() => 0);
  for (const v of Object.values(poll.votes)) counts[v]++;
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options,
    counts,
    open: poll.open,
    total: Object.keys(poll.votes).length
  };
}

function roomExtras(roomId) {
  const r = ROOMS[roomId];
  return {
    now: Date.now(),
    announce: r.announce || null,
    timerEnd: r.timerEnd || 0,
    rollOpen: !!(r.roll && r.roll.open),
    poll: pollView(r.poll),
    rec: r.rec ? { by: r.rec.by } : null
  };
}

function broadcastExtras(roomId) {
  io.to(roomId).emit('room-extras', roomExtras(roomId));
}

function sendRoll(roomId) {
  const r = ROOMS[roomId];
  if (!r) return;
  const names = r.roll ? Object.values(r.roll.present) : [];
  const payload = { open: !!(r.roll && r.roll.open), names, count: names.length };
  for (const id of hostSockets(roomId)) io.to(id).emit('roll-state', payload);
}

function standPlayer(p, sock) {
  if (!p || !p.seat) return;
  const seat = SEATS[p.seat];
  p.seat = null;
  const spot = findStandSpot(p.roomId, seat, p.id);
  p.x = spot.x;
  p.z = spot.z;
  p.yaw = p.role === 'student' ? 0 : Math.PI;
  sock.emit('you', selfView(p));
}

// Oyuncuyu başka bir odaya taşır (oda değiştirme ve moderatör çıkarma için ortak kod)
function moveRoom(socket, p, roomId) {
  const target = ROOMS[roomId];
  if (p.role === 'teacher') {
    if (target.type !== 'class') return socket.emit('room-denied', 'Eğitmen yalnızca sınıflara geçebilir.');
    if (target.teacherId) return socket.emit('room-denied', 'Hedef sınıfta zaten bir eğitmen var.');
  }
  leaveRoom(socket, p);
  if (p.role === 'teacher') target.teacherId = socket.id;

  p.roomId = roomId;
  p.hand = false;
  const spawn = spawnFor(p.role);
  p.x = spawn.x;
  p.z = spawn.z;
  p.yaw = spawn.yaw;

  socket.join(roomId);
  socket.emit('room-changed', selfView(p));
  socket.emit('my-room-notes', notesForRoom(p.userId, roomId));
  socket.emit('room-extras', roomExtras(roomId));
  sendRoll(roomId);
  broadcastRooms();
}

// ---------- Express (HTTP) ----------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; " +
    "connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
  next();
});

app.use(express.json({ limit: '50kb' }));
app.use('/api', rateLimit('api', 300, 60 * 1000));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = userFromToken(token);
  if (!user) return res.status(401).json({ error: 'Giriş gerekli.' });
  req.user = user;
  req.token = token;
  next();
}

function adminOnly(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Yetkiniz yok.' });
  next();
}

app.post('/api/login', rateLimit('login', 10, 15 * 60 * 1000), (req, res) => {
  const b = req.body || {};
  const username = clean(b.username, 30).toLowerCase();
  const password = String(b.password || '');
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }
  const token = createSession(row.id);
  res.json({ token, user: publicUser(row) });
});

app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/events', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY event_date, event_time').all();
  res.json(rows.map(eventView));
});

app.get('/api/my-notes', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.user.id);
  res.json(rows.map(noteView));
});

app.get('/api/my-attendance', auth, (req, res) => {
  const rows = db.prepare(
    'SELECT room_id, day, created_at FROM attendance WHERE user_id = ? ORDER BY day DESC, id DESC'
  ).all(req.user.id);
  res.json(rows.map(r => ({ roomId: r.room_id, day: r.day, createdAt: r.created_at })));
});

// Moderatör kaydı: ham video verisi olarak yüklenir (yalnızca yöneticiler)
app.post('/api/recordings', auth, adminOnly,
  express.raw({ type: 'video/*', limit: MAX_REC_BYTES }),
  (req, res) => {
    const roomId = req.headers['x-room'];
    if (!isClassRoom(roomId)) return res.status(400).json({ error: 'Geçersiz sınıf.' });
    if (!Buffer.isBuffer(req.body) || req.body.length < 1000) {
      return res.status(400).json({ error: 'Kayıt boş.' });
    }
    const duration = Math.max(0, Math.min(Number(req.headers['x-duration']) || 0, 24 * 3600 * 1000));
    const file = crypto.randomBytes(16).toString('hex') + '.webm';
    fs.writeFileSync(path.join(REC_DIR, file), req.body);
    db.prepare(
      'INSERT INTO recordings (room_id, file_name, size_bytes, duration_ms, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(roomId, file, req.body.length, Math.round(duration), req.user.displayName, new Date().toISOString());
    res.json({ ok: true });
  }
);

app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT id, username, display_name, role, is_admin, created_at FROM users ORDER BY id').all();
  res.json(rows.map(r => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    isAdmin: !!r.is_admin,
    createdAt: r.created_at
  })));
});

app.post('/api/admin/users', auth, adminOnly, (req, res) => {
  const b = req.body || {};
  const username = clean(b.username, 30).toLowerCase();
  const displayName = clean(b.displayName, 40);
  const password = String(b.password || '');
  const role = b.role === 'teacher' ? 'teacher' : 'student';
  const isAdmin = b.isAdmin ? 1 : 0;

  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Kullanıcı adı 3-30 karakter olmalı (harf, rakam, _ . -).' });
  }
  if (!displayName) return res.status(400).json({ error: 'Görünen ad gerekli.' });
  if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' });

  try {
    db.prepare(
      'INSERT INTO users (username, display_name, password_hash, role, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, displayName, hashPassword(password), role, isAdmin, new Date().toISOString());
  } catch (e) {
    return res.status(400).json({ error: 'Bu kullanıcı adı zaten var.' });
  }
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/password', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const password = String((req.body || {}).password || '');
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz kullanıcı.' });
  if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/admin/events', auth, adminOnly, (req, res) => {
  const b = req.body || {};
  const title = clean(b.title, 100);
  const date = String(b.date || '');
  const time = clean(b.time, 5);
  const description = clean(b.description, 500);
  const roomId = roomExists(b.roomId) ? b.roomId : null;

  if (!title) return res.status(400).json({ error: 'Başlık gerekli.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Geçerli bir tarih seçin.' });
  if (time && !/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: 'Saat SS:DD biçiminde olmalı.' });

  db.prepare(
    'INSERT INTO events (title, description, event_date, event_time, room_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(title, description, date, time || null, roomId, new Date().toISOString());
  res.json({ ok: true });
});

app.delete('/api/admin/events/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (Number.isInteger(id)) db.prepare('DELETE FROM events WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/admin/notes', auth, adminOnly, (req, res) => {
  const userId = Number(req.query.userId);
  if (!Number.isInteger(userId)) return res.json([]);
  const rows = db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(userId);
  res.json(rows.map(noteView));
});

app.get('/api/admin/recordings', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM recordings ORDER BY id DESC').all();
  res.json(rows.map(r => ({
    id: r.id,
    roomId: r.room_id,
    roomName: roomExists(r.room_id) ? ROOMS[r.room_id].name : r.room_id,
    sizeBytes: r.size_bytes,
    durationMs: r.duration_ms,
    createdBy: r.created_by,
    createdAt: r.created_at
  })));
});

app.get('/api/admin/recordings/:id/file', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz kayıt.' });
  const row = db.prepare('SELECT file_name FROM recordings WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
  res.setHeader('Content-Type', 'video/webm');
  res.sendFile(path.join(REC_DIR, row.file_name));
});

app.delete('/api/admin/recordings/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz kayıt.' });
  const row = db.prepare('SELECT file_name FROM recordings WHERE id = ?').get(id);
  if (row) {
    try { fs.unlinkSync(path.join(REC_DIR, row.file_name)); } catch (e) {}
    db.prepare('DELETE FROM recordings WHERE id = ?').run(id);
  }
  res.json({ ok: true });
});

// ---------- Socket.IO (canlı sınıf) ----------
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

io.use((socket, next) => {
  const user = userFromToken(socket.handshake.auth && socket.handshake.auth.token);
  if (!user) return next(new Error('Oturum geçersiz. Lütfen yeniden giriş yap.'));
  socket.data.user = user;
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  socket.emit('rooms', roomList());

  socket.on('join', (data) => {
    const d = data || {};
    if (players[socket.id]) return;
    if (Object.values(players).some(p => p.userId === user.id)) {
      return socket.emit('join-error', 'Bu hesap başka bir pencerede açık.');
    }

    const roomId = roomExists(d.roomId) ? d.roomId : 'sinif-1';
    const room = ROOMS[roomId];
    const role = user.role;

    if (role === 'teacher') {
      if (room.type !== 'class') return socket.emit('join-error', 'Eğitmen yalnızca sınıflara girebilir.');
      if (room.teacherId) return socket.emit('join-error', 'Bu sınıfta zaten bir eğitmen var.');
      room.teacherId = socket.id;
    }

    const spawn = spawnFor(role);
    const p = {
      id: socket.id,
      userId: user.id,
      name: user.displayName,
      role,
      roomId,
      x: spawn.x,
      z: spawn.z,
      yaw: spawn.yaw,
      hand: false,
      seat: null
    };
    players[socket.id] = p;
    socket.join(roomId);
    socket.emit('joined', selfView(p));
    socket.emit('my-room-notes', notesForRoom(user.id, roomId));
    socket.emit('room-extras', roomExtras(roomId));
    sendRoll(roomId);
    broadcastRooms();
  });

  socket.on('change-room', (data) => {
    const d = data || {};
    const p = players[socket.id];
    if (!p || !roomExists(d.roomId) || d.roomId === p.roomId) return;
    moveRoom(socket, p, d.roomId);
  });

  socket.on('move', (data) => {
    const d = data || {};
    const p = players[socket.id];
    if (!p || !p.roomId) return;
    if (Number.isFinite(d.yaw)) p.yaw = d.yaw;
    if (p.seat) return;
    if (Number.isFinite(d.x)) p.x = Math.max(-9.5, Math.min(9.5, d.x));
    if (Number.isFinite(d.z)) p.z = Math.max(-9.5, Math.min(9.5, d.z));
  });

  socket.on('hand', (raised) => {
    const p = players[socket.id];
    if (p) p.hand = raised === true;
  });

  socket.on('sit', (data) => {
    const d = data || {};
    const p = players[socket.id];
    if (!p || !p.roomId || p.seat) return;
    if (!own(SEATS, d.seatId)) return;
    const seat = SEATS[d.seatId];
    if (seat.role !== p.role) {
      return socket.emit('room-denied', seat.role === 'student' ? 'Bu koltuk öğrencilere ait.' : 'Bu koltuk sana ait değil.');
    }
    if (!isClassRoom(p.roomId)) return;
    if (seatTaken(p.roomId, seat.id)) return socket.emit('room-denied', 'Bu koltuk dolu.');
    p.seat = seat.id;
    p.x = seat.x;
    p.z = seat.z;
    p.yaw = seat.yaw || 0;
    socket.emit('you', selfView(p));
  });

  socket.on('stand', () => {
    standPlayer(players[socket.id], socket);
  });

  socket.on('note', (text) => {
    const p = players[socket.id];
    if (!p || !p.roomId || !isClassRoom(p.roomId)) return;
    const now = Date.now();
    if (now - (chatTimes[socket.id] || 0) < 500) return;
    const msg = clean(text, 500);
    if (!msg) return;
    chatTimes[socket.id] = now;
    db.prepare('INSERT INTO notes (user_id, room_id, text, created_at) VALUES (?, ?, ?, ?)')
      .run(user.id, p.roomId, msg, new Date().toISOString());
    socket.emit('my-room-notes', notesForRoom(user.id, p.roomId));
  });

  socket.on('chat', (text) => {
    const p = players[socket.id];
    if (!p || !p.roomId) return;
    const now = Date.now();
    if (now - (chatTimes[socket.id] || 0) < 500) return;
    const msg = clean(text, 200);
    if (!msg) return;
    chatTimes[socket.id] = now;
    io.to(p.roomId).emit('chat', { name: p.name, role: p.role, text: msg });
  });

  // ----- Duyuru -----
  socket.on('announce', (text) => {
    const p = players[socket.id];
    if (!canHost(p)) return;
    ROOMS[p.roomId].announce = clean(text, 200) || null;
    broadcastExtras(p.roomId);
  });

  // ----- Yoklama -----
  socket.on('roll-start', () => {
    const p = players[socket.id];
    if (!canHost(p)) return;
    ROOMS[p.roomId].roll = { open: true, present: {} };
    broadcastExtras(p.roomId);
    sendRoll(p.roomId);
  });

  socket.on('roll-here', () => {
    const p = players[socket.id];
    if (!p || !p.roomId || p.role !== 'student') return;
    const r = ROOMS[p.roomId];
    if (!r.roll || !r.roll.open) return;
    r.roll.present[String(user.id)] = p.name;
    sendRoll(p.roomId);
  });

  socket.on('roll-end', () => {
    const p = players[socket.id];
    if (!canHost(p)) return;
    const r = ROOMS[p.roomId];
    if (!r.roll || !r.roll.open) return;
    const day = localDay();
    const now = new Date().toISOString();
    let saved = 0;
    for (const uid of Object.keys(r.roll.present)) {
      const info = saveAttendance.run(Number(uid), p.roomId, day, now);
      if (info.changes) saved++;
    }
    r.roll.open = false;
    broadcastExtras(p.roomId);
    sendRoll(p.roomId);
    socket.emit('roll-saved', { count: Object.keys(r.roll.present).length, saved });
  });

  // ----- Anket -----
  socket.on('poll-start', (data) => {
    const p = players[socket.id];
    if (!canHost(p)) return;
    const d = data || {};
    const question = clean(d.question, 160);
    const options = (Array.isArray(d.options) ? d.options : [])
      .map(o => clean(o, 60)).filter(Boolean).slice(0, 6);
    if (!question || options.length < 2) {
      return socket.emit('room-denied', 'Anket için soru ve en az 2 seçenek gerekli.');
    }
    ROOMS[p.roomId].poll = { id: Date.now(), question, options, votes: {}, open: true };
    broadcastExtras(p.roomId);
  });

  socket.on('poll-vote', (idx) => {
    const p = players[socket.id];
    if (!p || !p.roomId || p.role !== 'student') return;
    const poll = ROOMS[p.roomId].poll;
    if (!poll || !poll.open) return;
    if (!Number.isInteger(idx) || idx < 0 || idx >= poll.options.length) return;
    poll.votes[String(user.id)] = idx;
    broadcastExtras(p.roomId);
  });

  socket.on('poll-end', () => {
    const p = players[socket.id];
    if (!canHost(p)) return;
    const poll = ROOMS[p.roomId].poll;
    if (!poll) return;
    poll.open = false;
    broadcastExtras(p.roomId);
  });

  socket.on('poll-clear', () => {
    const p = players[socket.id];
    if (!canHost(p)) return;
    ROOMS[p.roomId].poll = null;
    broadcastExtras(p.roomId);
  });

  // ----- Zamanlayıcı -----
  socket.on('timer-set', (minutes) => {
    const p = players[socket.id];
    if (!canHost(p)) return;
    const m = Math.floor(Number(minutes));
    ROOMS[p.roomId].timerEnd = (Number.isFinite(m) && m > 0) ? Date.now() + Math.min(m, 180) * 60000 : 0;
    broadcastExtras(p.roomId);
  });

  // ----- Moderatör: kayıt -----
  socket.on('rec-start', () => {
    const p = players[socket.id];
    if (!canHost(p) || p.role !== 'moderator') return;
    const r = ROOMS[p.roomId];
    if (r.rec) return;
    r.rec = { by: p.name, since: Date.now() };
    io.to(p.roomId).emit('notice', 'Ders kaydı başlatıldı. Katılımcılar kayıttan haberdar edilmiştir.');
    broadcastExtras(p.roomId);
  });

  socket.on('rec-stop', () => {
    const p = players[socket.id];
    if (!p || p.role !== 'moderator' || !p.roomId) return;
    const r = ROOMS[p.roomId];
    if (!r.rec) return;
    r.rec = null;
    io.to(p.roomId).emit('notice', 'Ders kaydı durduruldu.');
    broadcastExtras(p.roomId);
  });

  // ----- Moderatör: katılımcı yönetimi -----
  socket.on('kick', (data) => {
    const p = players[socket.id];
    if (!p || p.role !== 'moderator' || !p.roomId) return;
    const t = players[(data || {}).targetId];
    if (!t || t.roomId !== p.roomId || t.role !== 'student') return;
    const ts = io.sockets.sockets.get(t.id);
    if (!ts) return;
    moveRoom(ts, t, 'ortak-alan');
    ts.emit('notice', 'Moderatör seni bu odadan çıkardı.');
  });

  socket.on('force-stand', (data) => {
    const p = players[socket.id];
    if (!p || p.role !== 'moderator' || !p.roomId) return;
    const t = players[(data || {}).targetId];
    if (!t || t.roomId !== p.roomId || !t.seat) return;
    const ts = io.sockets.sockets.get(t.id);
    if (ts) standPlayer(t, ts);
  });

  socket.on('clear-hands', () => {
    const p = players[socket.id];
    if (!p || p.role !== 'moderator' || !p.roomId) return;
    for (const q of Object.values(players)) {
      if (q.roomId === p.roomId) q.hand = false;
    }
  });

  ['rtc-offer', 'rtc-answer', 'rtc-ice', 'need-stream'].forEach((type) => {
    socket.on(type, (payload) => {
      const me = players[socket.id];
      const target = payload && players[payload.to];
      if (!me || !target || target.roomId !== me.roomId) return;
      io.to(payload.to).emit(type, { ...payload, from: socket.id });
    });
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (!p) return;
    leaveRoom(socket, p);
    delete players[socket.id];
    delete chatTimes[socket.id];
    broadcastRooms();
  });
});

setInterval(() => {
  for (const id of Object.keys(ROOMS)) {
    const list = Object.values(players).filter(p => p.roomId === id);
    if (list.length) io.to(id).volatile.emit('state', list);
  }
}, 50);

server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});