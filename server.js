'use strict';
/* NOUR COCHES — Fleet management & booking platform.
   Zero-dependency Node.js (>=22): node:http + node:sqlite + node:crypto. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 8932;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'nour.sqlite');
const PUBLIC_DIR = path.join(__dirname, 'public');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vehicles(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE NOT NULL,
  brand TEXT NOT NULL, model TEXT NOT NULL, trim TEXT DEFAULT '',
  year INTEGER, plate TEXT, category TEXT DEFAULT '',
  transmission TEXT DEFAULT 'Manuelle', fuel TEXT DEFAULT 'Essence',
  seats INTEGER DEFAULT 5, doors INTEGER DEFAULT 5,
  photos TEXT DEFAULT '[]', description TEXT DEFAULT '',
  price_day REAL NOT NULL DEFAULT 0, price_week REAL DEFAULT 0, price_month REAL DEFAULT 0,
  deposit REAL DEFAULT 0, extra_fees TEXT DEFAULT '{}',
  mileage INTEGER DEFAULT 0, documents TEXT DEFAULT '',
  manual_status TEXT NOT NULL DEFAULT 'none',
  is_published INTEGER NOT NULL DEFAULT 1,
  seed_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL, vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT DEFAULT '',
  pickup_at TEXT NOT NULL, return_at TEXT NOT NULL, location TEXT DEFAULT '',
  extras TEXT DEFAULT '[]', days INTEGER NOT NULL, total REAL NOT NULL,
  deposit_due REAL DEFAULT 0, deposit_status TEXT DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS maintenance(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
  notes TEXT DEFAULT '', done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL,
  detail TEXT DEFAULT '', booking_ref TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`);

/* ---------- settings ---------- */
const DEFAULT_SETTINGS = {
  confirmation_mode: 'manual',           // 'manual' (request -> admin confirms) | 'auto'
  whatsapp_number: '212608028793',       // agency WhatsApp (public, from its own posts)
  agency_name: 'NOUR COCHES',
  agency_city: 'Jirari 1, Tanger',
  smtp_host: '', smtp_port: '587', smtp_user: '', smtp_from: '',   // empty = email not configured
  extras_catalog: JSON.stringify([
    { name: 'GPS', price: 30 }, { name: 'Siège bébé', price: 20 },
    { name: 'Conducteur supplémentaire', price: 50 }, { name: 'Assurance tous risques', price: 100 }])
};
function getSetting(k) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  return r ? r.value : (DEFAULT_SETTINGS[k] ?? '');
}
function setSetting(k, v) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
}
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  if (!db.prepare('SELECT 1 FROM settings WHERE key=?').get(k)) setSetting(k, v);
}

/* ---------- admin bootstrap (env only; never stored in code) ---------- */
function hashPass(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
(function bootstrapAdmin() {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0) return;
  const email = process.env.ADMIN_EMAIL || 'admin@nourcoches.ma';
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users(email,pass_hash,salt,role,created_at) VALUES(?,?,?,?,?)')
    .run(email, hashPass(password, salt), salt, 'admin', new Date().toISOString());
  console.log('============================================================');
  console.log('ADMIN ACCOUNT CREATED');
  console.log('  email   :', email);
  console.log('  password:', password, process.env.ADMIN_PASSWORD ? '' : '(generated — save it now, set ADMIN_PASSWORD to choose your own)');
  console.log('============================================================');
})();

/* ---------- DEMO dataset (presentation only) ----------
   Models from the agency's own posts; every other field is fictional sample data,
   clearly identified: plates DEMO-xxxx, customers "(démo)", refs NC-DEMO-xxx.
   Dates are relative to seed day so the dashboard is always coherent. */
function dayAt(offset, hour = 10) {
  const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}
function seedDemoData() {
  const now = new Date().toISOString();
  const fleet = [
    ['Renault','Clio','5',2023,38500,'Citadine','Manuelle','Essence',5,5,'clio',200],
    ['Peugeot','208','',2023,41200,'Citadine','Manuelle','Essence',5,5,'p208',200],
    ['Renault','Captur','',2022,53800,'SUV compact','Manuelle','Essence',5,5,'captur',250],
    ['Volkswagen','Golf','8',2022,47600,'Compacte','Manuelle','Diesel',5,5,'golf',300],
    ['SEAT','León','',2023,35900,'Compacte','Manuelle','Diesel',5,5,'leon',300],
    ['Dacia','Duster','',2024,28400,'SUV','Manuelle','Diesel',5,5,'duster',300],
    ['Volkswagen','T-Roc','R-Line',2023,33100,'SUV','Automatique','Essence',5,5,'troc',400],
    ['Volkswagen','Tiguan','',2023,44900,'SUV familial','Automatique','Diesel',5,5,'tiguan',400],
    ['Hyundai','Tucson','',2026,12300,'SUV','Automatique','Hybride',5,5,'tucson',450],
    ['Peugeot','3008','GT Line',2023,39700,'SUV Premium','Automatique','Diesel',5,5,'p3008',450],
    ['Toyota','RAV4','',2024,21800,'SUV Premium','Automatique','Hybride',5,5,'rav4',500],
    ['Kia','EV6','',2024,17900,'Électrique','Automatique','Électrique',5,5,'ev6',600]
  ];
  const ins = db.prepare(`INSERT INTO vehicles(uid,brand,model,trim,year,plate,category,transmission,fuel,seats,doors,photos,description,price_day,price_week,price_month,deposit,mileage,documents,manual_status,is_published,seed_demo,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'none',1,1,?,?)`);
  fleet.forEach((f, i) => {
    ins.run('NCV-' + String(i + 1).padStart(4, '0'), f[0], f[1], f[2], f[3], 'DEMO-' + (1001 + i), f[5], f[6], f[7], f[8], f[9],
      JSON.stringify(['/assets/img/' + f[10] + '.webp']),
      'Véhicule de démonstration — fiche d\u2019exemple complète (modèle vu dans les publications de l\u2019agence ; caractéristiques et prix fictifs, à remplacer par les données réelles).',
      f[11], f[11] * 6, f[11] * 22, 5000, f[4],
      'Documents de démonstration : assurance et vignette fictives (exemples).', now, now);
  });
  const veh = uid => db.prepare('SELECT * FROM vehicles WHERE uid=?').get(uid);
  const insB = db.prepare(`INSERT INTO bookings(ref,vehicle_id,customer_name,phone,email,pickup_at,return_at,location,extras,days,total,deposit_due,deposit_status,status,notes,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const sample = [
    ['NC-DEMO-101','NCV-0001','Yasmine El Fassi (démo)','0600000011','yasmine.demo@exemple.ma',-10,-7,'Agence — Jirari 1',[],'completed','returned'],
    ['NC-DEMO-102','NCV-0002','Omar Bennani (démo)','0600000012','omar.demo@exemple.ma',-2,2,'Aéroport Ibn Battouta',['GPS'],'active','paid'],
    ['NC-DEMO-103','NCV-0004','Sara Amrani (démo)','0600000013','sara.demo@exemple.ma',-6,-1,'Agence — Jirari 1',['Siège bébé'],'active','paid'],
    ['NC-DEMO-104','NCV-0003','Karim Haddad (démo)','0600000014','karim.demo@exemple.ma',3,6,'Port Tanger Ville',[],'confirmed','pending'],
    ['NC-DEMO-105','NCV-0007','Lina Berrada (démo)','0600000015','lina.demo@exemple.ma',1,4,'Agence — Jirari 1',['Assurance tous risques'],'confirmed','pending'],
    ['NC-DEMO-106','NCV-0005','Adam Chraïbi (démo)','0600000016','adam.demo@exemple.ma',2,5,'Aéroport Ibn Battouta',['GPS'],'pending','pending'],
    ['NC-DEMO-107','NCV-0012','Yasmine El Fassi (démo)','0600000011','yasmine.demo@exemple.ma',-20,-18,'Agence — Jirari 1',[],'completed','returned'],
    ['NC-DEMO-108','NCV-0012','Omar Bennani (démo)','0600000012','omar.demo@exemple.ma',10,12,'Agence — Jirari 1',[],'confirmed','pending']
  ];
  for (const s of sample) {
    const v = veh(s[1]);
    const from = dayAt(s[5]), to = dayAt(s[6]);
    const days = rentalDays(from, to);
    const ex = priceExtras(s[8], days);
    const total = priceFor(v, days).total + ex.total;
    insB.run(s[0], v.id, s[2], s[3], s[4], from, to, s[7], JSON.stringify(ex.items), days, total, v.deposit, s[10], s[9], 'Réservation d\u2019exemple (démonstration).', now, now);
  }
  const insM = db.prepare('INSERT INTO maintenance(vehicle_id,title,starts_at,ends_at,notes,done,created_at) VALUES(?,?,?,?,?,?,?)');
  insM.run(veh('NCV-0009').id, 'Révision complète (démo)', dayAt(-1, 9), dayAt(3, 18), 'Exemple : véhicule actuellement en maintenance.', 0, now);
  insM.run(veh('NCV-0011').id, 'Changement de pneus (démo)', dayAt(7, 9), dayAt(9, 18), 'Exemple de maintenance planifiée.', 0, now);
  insM.run(veh('NCV-0006').id, 'Vidange (démo)', dayAt(-15, 9), dayAt(-14, 18), 'Exemple d\u2019historique de maintenance.', 1, now);
  notify('booking_request', 'NC-DEMO-106', 'SEAT León · Adam Chraïbi (démo) — exemple de notification');
  notify('booking_confirmed', 'NC-DEMO-104', 'Renault Captur · Karim Haddad (démo) — exemple de notification');
  console.log('Seeded DEMO dataset:', fleet.length, 'vehicles,', sample.length, 'bookings, 3 maintenance entries.');
}


/* ---------- helpers ---------- */
const nowISO = () => new Date().toISOString();
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2e6) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('invalid json')); } });
    req.on('error', reject);
  });
}
function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && bStart < aEnd; }

/* Blocking sources: confirmed/active bookings + open maintenance windows + manual block. */
function blockingRanges(vehicleId, excludeBookingId = 0) {
  const bk = db.prepare(`SELECT pickup_at, return_at, ref FROM bookings
    WHERE vehicle_id=? AND status IN ('confirmed','active') AND id<>?`).all(vehicleId, excludeBookingId);
  const mt = db.prepare(`SELECT starts_at, ends_at, title FROM maintenance
    WHERE vehicle_id=? AND done=0`).all(vehicleId);
  return {
    bookings: bk.map(b => ({ start: b.pickup_at, end: b.return_at, ref: b.ref })),
    maintenance: mt.map(m => ({ start: m.starts_at, end: m.ends_at, title: m.title }))
  };
}
function findConflict(vehicle, start, end, excludeBookingId = 0) {
  if (vehicle.manual_status === 'unavailable') return { type: 'blocked', detail: 'Véhicule bloqué par l\u2019administrateur' };
  const { bookings, maintenance } = blockingRanges(vehicle.id, excludeBookingId);
  for (const b of bookings) if (overlaps(start, end, b.start, b.end)) return { type: 'booking', detail: 'Chevauchement avec la réservation ' + b.ref };
  for (const m of maintenance) if (overlaps(start, end, m.start, m.end)) return { type: 'maintenance', detail: 'Maintenance planifiée : ' + m.title };
  if (vehicle.manual_status === 'maintenance') return { type: 'blocked', detail: 'Véhicule en maintenance (statut manuel) — utilisez une fenêtre de maintenance pour bloquer des dates précises' };
  return null;
}
/* Derived live status at a given instant. */
function liveStatus(vehicle, atISO = nowISO()) {
  const active = db.prepare(`SELECT ref, return_at FROM bookings WHERE vehicle_id=? AND status='active' AND pickup_at<=? ORDER BY pickup_at LIMIT 1`).get(vehicle.id, atISO);
  if (active) return { status: 'RENTED', detail: (active.return_at < atISO ? '⚠️ Retour en retard · ' : 'En location · ') + active.ref };
  const mt = db.prepare(`SELECT title FROM maintenance WHERE vehicle_id=? AND done=0 AND starts_at<=? AND ends_at>? LIMIT 1`).get(vehicle.id, atISO, atISO);
  if (mt || vehicle.manual_status === 'maintenance') return { status: 'MAINTENANCE', detail: mt ? mt.title : 'Au garage (manuel)' };
  if (vehicle.manual_status === 'unavailable') return { status: 'UNAVAILABLE', detail: 'Bloqué par l\u2019administrateur' };
  const next = db.prepare(`SELECT ref, pickup_at FROM bookings WHERE vehicle_id=? AND status IN ('confirmed','active') AND return_at>? ORDER BY pickup_at LIMIT 1`).get(vehicle.id, atISO);
  if (next) return { status: 'RESERVED', detail: 'Réservé · ' + next.ref + ' dès le ' + next.pickup_at.slice(0, 10), next_booking: next };
  return { status: 'AVAILABLE', detail: 'Prêt à louer' };
}
function rentalDays(pickup, ret) {
  const ms = new Date(ret) - new Date(pickup);
  return Math.max(0, Math.ceil(ms / 86400000));
}
/* Best-price split: months -> weeks -> days, using the vehicle's own rates. */
function priceFor(vehicle, days) {
  let d = days, total = 0; const parts = [];
  if (vehicle.price_month > 0) { const m = Math.floor(d / 30); if (m) { total += m * vehicle.price_month; parts.push(m + ' mois'); d -= m * 30; } }
  if (vehicle.price_week > 0) { const w = Math.floor(d / 7); if (w) { total += w * vehicle.price_week; parts.push(w + ' sem.'); d -= w * 7; } }
  if (d > 0) { total += d * vehicle.price_day; parts.push(d + ' j'); }
  return { total, parts: parts.join(' + ') };
}
function extrasCatalog() { try { return JSON.parse(getSetting('extras_catalog')); } catch { return []; } }
function priceExtras(names, days) {
  const cat = extrasCatalog(); let total = 0; const items = [];
  for (const n of names || []) { const f = cat.find(c => c.name === n); if (f) { total += f.price * days; items.push({ name: f.name, price: f.price }); } }
  return { total, items };
}
/* Notifications: honest delivery model. WhatsApp = deep link prepared for a human/agent
   to send (never claimed auto-sent). Email = only if SMTP configured. */
function notify(type, bookingRef, detail) {
  const wa = getSetting('whatsapp_number');
  const waStatus = wa ? 'link_ready' : 'not_configured';
  db.prepare('INSERT INTO notifications(type,channel,status,detail,booking_ref,created_at) VALUES(?,?,?,?,?,?)')
    .run(type, 'whatsapp', waStatus, (wa ? 'https://wa.me/' + wa : 'WhatsApp non configuré') + ' — ' + detail, bookingRef, nowISO());
  const smtpReady = getSetting('smtp_host') && getSetting('smtp_user');
  db.prepare('INSERT INTO notifications(type,channel,status,detail,booking_ref,created_at) VALUES(?,?,?,?,?,?)')
    .run(type, 'email', smtpReady ? 'queued' : 'not_configured', smtpReady ? 'SMTP configuré — envoi à implémenter par le fournisseur' : 'SMTP non configuré (voir Paramètres)', bookingRef, nowISO());
}
function publicVehicle(v, range) {
  const live = liveStatus(v);
  let quote = null, available = null;
  if (range && range.from && range.to) {
    const days = rentalDays(range.from, range.to);
    if (days > 0) {
      const conflict = findConflict(v, range.from, range.to);
      available = !conflict;
      const p = priceFor(v, days);
      quote = { days, total: p.total, parts: p.parts };
    }
  }
  return {
    uid: v.uid, brand: v.brand, model: v.model, trim: v.trim, year: v.year, category: v.category,
    transmission: v.transmission, fuel: v.fuel, seats: v.seats, doors: v.doors,
    photos: JSON.parse(v.photos || '[]'), description: v.description,
    price_day: v.price_day, price_week: v.price_week, price_month: v.price_month, deposit: v.deposit,
    status: live.status, status_detail: live.detail, available_for_range: available, quote
  };
}

/* seed runs here: helpers (const nowISO etc.) are initialized by now */
if (db.prepare('SELECT COUNT(*) c FROM vehicles').get().c === 0) seedDemoData();

/* ---------- auth ---------- */
const loginAttempts = new Map();
function getSession(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/nc_session=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(m[1]);
  if (!s || s.expires_at < Date.now()) return null;
  return db.prepare('SELECT id,email,role FROM users WHERE id=?').get(s.user_id);
}
function requireAdmin(req, res) {
  const u = getSession(req);
  if (!u) { json(res, 401, { error: 'unauthorized', detail: 'Connexion administrateur requise' }); return null; }
  return u;
}

/* ---------- validation ---------- */
function isDT(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !isNaN(new Date(s)); }
function badPrice(v) { return v === undefined || v === null || isNaN(+v) || +v < 0 || +v > 1000000; }

/* ---------- public booking creation (shared by modes) ---------- */
function createBooking(body) {
  const v = db.prepare('SELECT * FROM vehicles WHERE uid=? AND is_published=1').get(String(body.vehicle_uid || ''));
  if (!v) return { code: 404, error: 'vehicle_not_found', detail: 'Véhicule introuvable ou non publié' };
  if (!isDT(body.pickup_at) || !isDT(body.return_at)) return { code: 400, error: 'invalid_dates', detail: 'Choisissez une date et une heure de départ et de retour.' };
  const days = rentalDays(body.pickup_at, body.return_at);
  if (days < 1) return { code: 400, error: 'invalid_range', detail: 'Le retour doit être après le départ (1 jour minimum)' };
  if (new Date(body.pickup_at) < new Date(Date.now() - 3600e3)) return { code: 400, error: 'pickup_in_past', detail: 'La date de départ est déjà passée — choisissez une date à venir.' };
  const name = String(body.customer_name || '').trim();
  const phone = String(body.phone || '').replace(/[\s-]/g, '');
  const email = String(body.email || '').trim();
  if (name.length < 3) return { code: 400, error: 'invalid_name', detail: 'Entrez votre nom complet (3 caractères minimum).' };
  if (!/^\+?\d{9,15}$/.test(phone)) return { code: 400, error: 'invalid_phone', detail: 'Entrez un numéro de téléphone valide (ex. 06 XX XX XX XX).' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { code: 400, error: 'invalid_email', detail: 'Adresse email invalide — vérifiez le format.' };
  const mode = getSetting('confirmation_mode');
  const status = mode === 'auto' ? 'confirmed' : 'pending';
  /* Availability: transaction + recheck. Confirmed (auto) bookings must not overlap anything.
     Pending requests do not block, but if the range is already fully blocked we warn. */
  let conflict = null;
  db.exec('BEGIN IMMEDIATE');
  try {
    conflict = findConflict(v, body.pickup_at, body.return_at);
    if (conflict && status === 'confirmed') { db.exec('ROLLBACK'); return { code: 409, error: 'not_available', detail: conflict.detail }; }
    const base = priceFor(v, days);
    const ex = priceExtras(body.extras, days);
    const total = base.total + ex.total;
    const ref = 'NC-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
    db.prepare(`INSERT INTO bookings(ref,vehicle_id,customer_name,phone,email,pickup_at,return_at,location,extras,days,total,deposit_due,deposit_status,status,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ref, v.id, name, phone, email, body.pickup_at, body.return_at, String(body.location || 'Agence — Jirari 1'),
        JSON.stringify(ex.items), days, total, v.deposit, 'pending', status, String(body.notes || ''), nowISO(), nowISO());
    db.exec('COMMIT');
    notify(status === 'confirmed' ? 'booking_confirmed' : 'booking_request', ref, v.brand + ' ' + v.model + ' · ' + name + ' · ' + body.pickup_at.slice(0, 10) + ' → ' + body.return_at.slice(0, 10));
    return { code: 201, booking: { ref, status, days, total, deposit_due: v.deposit, vehicle: v.brand + ' ' + v.model, price_parts: base.parts, extras: ex.items, conflict_warning: conflict ? conflict.detail : null } };
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

/* ---------- router ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    /* ----- public API ----- */
    if (p === '/api/vehicles' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams);
      let rows = db.prepare('SELECT * FROM vehicles WHERE is_published=1 ORDER BY price_day').all();
      rows = rows.filter(v =>
        (!q.brand || v.brand === q.brand) &&
        (!q.transmission || v.transmission === q.transmission) &&
        (!q.fuel || v.fuel === q.fuel) &&
        (!q.seats || v.seats >= +q.seats) &&
        (!q.max_price || v.price_day <= +q.max_price) &&
        (!q.search || (v.brand + ' ' + v.model).toLowerCase().includes(q.search.toLowerCase())));
      const range = (q.from && q.to) ? { from: q.from, to: q.to } : null;
      return json(res, 200, { vehicles: rows.map(v => publicVehicle(v, range)), extras_catalog: extrasCatalog(), confirmation_mode: getSetting('confirmation_mode'), whatsapp: getSetting('whatsapp_number') });
    }
    if (p === '/api/bookings' && req.method === 'POST') {
      const body = await readBody(req);
      const r = createBooking(body);
      return json(res, r.code, r.booking || { error: r.error, detail: r.detail });
    }
    if (p.startsWith('/api/bookings/') && req.method === 'GET') {
      const ref = decodeURIComponent(p.split('/')[3]);
      const phone = (url.searchParams.get('phone') || '').replace(/[\s-]/g, '');
      const b = db.prepare('SELECT b.*, v.brand, v.model FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.ref=?').get(ref);
      if (!b || (phone && b.phone !== phone)) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { ref: b.ref, status: b.status, vehicle: b.brand + ' ' + b.model, pickup_at: b.pickup_at, return_at: b.return_at, total: b.total, days: b.days });
    }
    /* ----- auth ----- */
    if (p === '/api/auth/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || 'x';
      const att = loginAttempts.get(ip) || { n: 0, until: 0 };
      if (att.until > Date.now()) return json(res, 429, { error: 'too_many_attempts' });
      const body = await readBody(req);
      const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(body.email || '').toLowerCase());
      const ok = u && crypto.timingSafeEqual(Buffer.from(hashPass(String(body.password || ''), u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
      if (!ok) {
        att.n++; if (att.n >= 5) { att.until = Date.now() + 10 * 60e3; att.n = 0; }
        loginAttempts.set(ip, att);
        return json(res, 401, { error: 'invalid_credentials' });
      }
      loginAttempts.delete(ip);
      const token = crypto.randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(token, u.id, Date.now() + 7 * 86400e3);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `nc_session=${token}; HttpOnly; Path=/; Max-Age=${7 * 86400}; SameSite=Lax` });
      return res.end(JSON.stringify({ email: u.email, role: u.role }));
    }
    if (p === '/api/auth/logout' && req.method === 'POST') {
      const cookie = req.headers.cookie || ''; const m = cookie.match(/nc_session=([A-Za-z0-9_-]+)/);
      if (m) db.prepare('DELETE FROM sessions WHERE token=?').run(m[1]);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'nc_session=; HttpOnly; Path=/; Max-Age=0' });
      return res.end('{}');
    }
    if (p === '/api/auth/me' && req.method === 'GET') {
      const u = getSession(req);
      return u ? json(res, 200, u) : json(res, 401, { error: 'unauthorized' });
    }
    /* ----- admin API ----- */
    if (p.startsWith('/api/admin/')) {
      const admin = requireAdmin(req, res); if (!admin) return;
      return await adminRoute(req, res, p, url, admin);
    }
    /* ----- static ----- */
    let file = p === '/' ? '/index.html' : p;
    if (file === '/admin') file = '/admin.html';
    const full = path.join(PUBLIC_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }
    const ext = path.extname(full);
    const data = fs.readFileSync(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
    return res.end(data);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server_error', detail: String(e.message || e) });
  }
});

async function adminRoute(req, res, p, url, adminUser) {
  if (p === '/api/admin/change-password' && req.method === 'POST') {
    const b = await readBody(req);
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(adminUser.id);
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPass(String(b.current_password || ''), u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
    if (!ok) return json(res, 401, { error: 'wrong_current_password' });
    if (String(b.new_password || '').length < 8) return json(res, 400, { error: 'password_too_short', detail: '8 caractères minimum' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE users SET pass_hash=?, salt=? WHERE id=?').run(hashPass(String(b.new_password), salt), salt, u.id);
    return json(res, 200, { ok: true });
  }
  const q = Object.fromEntries(url.searchParams);
  /* stats + alerts */
  if (p === '/api/admin/stats' && req.method === 'GET') {
    const vehicles = db.prepare('SELECT * FROM vehicles').all();
    const counts = { total: vehicles.length, AVAILABLE: 0, RESERVED: 0, RENTED: 0, MAINTENANCE: 0, UNAVAILABLE: 0 };
    for (const v of vehicles) counts[liveStatus(v).status]++;
    const now = nowISO(), in24 = new Date(Date.now() + 86400e3).toISOString(), in3d = new Date(Date.now() + 3 * 86400e3).toISOString();
    const activeBookings = db.prepare(`SELECT COUNT(*) c FROM bookings WHERE status IN ('pending','confirmed','active')`).get().c;
    const upcomingReturns = db.prepare(`SELECT b.ref,b.return_at,v.brand,v.model FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.status='active' AND b.return_at>=? ORDER BY b.return_at LIMIT 8`).all(now);
    const overdue = db.prepare(`SELECT b.ref,b.return_at,b.customer_name,b.phone,v.brand,v.model FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.status='active' AND b.return_at<?`).all(now);
    const pickups24 = db.prepare(`SELECT b.ref,b.pickup_at,b.customer_name,v.brand,v.model FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.status='confirmed' AND b.pickup_at>=? AND b.pickup_at<=? ORDER BY b.pickup_at`).all(now, in24);
    const maintSoon = db.prepare(`SELECT m.title,m.ends_at,v.brand,v.model FROM maintenance m JOIN vehicles v ON v.id=m.vehicle_id WHERE m.done=0 AND m.ends_at>=? AND m.ends_at<=?`).all(now, in3d);
    const incomplete = vehicles.filter(v => v.seed_demo && (!v.plate || !v.year)).map(v => v.uid + ' · ' + v.brand + ' ' + v.model);
    const revenue = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM bookings WHERE status IN ('active','completed')`).get().s;
    return json(res, 200, { counts, active_bookings: activeBookings, upcoming_returns: upcomingReturns, alerts: { overdue, pickups_24h: pickups24, maintenance_ending: maintSoon, incomplete_vehicles: incomplete }, revenue_total: revenue });
  }
  /* vehicles CRUD */
  if (p === '/api/admin/vehicles' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM vehicles ORDER BY brand, model').all();
    return json(res, 200, { vehicles: rows.map(v => ({ ...v, photos: JSON.parse(v.photos || '[]'), live: liveStatus(v) })) });
  }
  if (p === '/api/admin/vehicles' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.brand || !b.model) return json(res, 400, { error: 'brand_model_required' });
    if (badPrice(b.price_day) || badPrice(b.price_week ?? 0) || badPrice(b.price_month ?? 0) || badPrice(b.deposit ?? 0)) return json(res, 400, { error: 'invalid_price', detail: 'Les prix doivent être des nombres positifs' });
    if (b.plate && db.prepare('SELECT 1 FROM vehicles WHERE plate=?').get(String(b.plate))) return json(res, 409, { error: 'plate_exists', detail: 'Immatriculation déjà utilisée par un autre véhicule' });
    const uid = 'NCV-' + String(db.prepare('SELECT COALESCE(MAX(id),0) m FROM vehicles').get().m + 1).padStart(4, '0');
    const info = db.prepare(`INSERT INTO vehicles(uid,brand,model,trim,year,plate,category,transmission,fuel,seats,doors,photos,description,price_day,price_week,price_month,deposit,extra_fees,mileage,documents,manual_status,is_published,seed_demo,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`)
      .run(uid, String(b.brand), String(b.model), String(b.trim || ''), b.year ? +b.year : null, b.plate ? String(b.plate) : null,
        String(b.category || ''), String(b.transmission || 'Manuelle'), String(b.fuel || 'Essence'), +b.seats || 5, +b.doors || 5,
        JSON.stringify(Array.isArray(b.photos) ? b.photos : []), String(b.description || ''), +b.price_day, +b.price_week || 0, +b.price_month || 0,
        +b.deposit || 0, JSON.stringify(b.extra_fees || {}), +b.mileage || 0, String(b.documents || ''),
        ['none', 'maintenance', 'unavailable'].includes(b.manual_status) ? b.manual_status : 'none', b.is_published ? 1 : 0, nowISO(), nowISO());
    return json(res, 201, { uid, id: info.lastInsertRowid });
  }
  const vm = p.match(/^\/api\/admin\/vehicles\/(\d+)$/);
  if (vm && req.method === 'PUT') {
    const id = +vm[1];
    const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(id);
    if (!v) return json(res, 404, { error: 'not_found' });
    const b = await readBody(req);
    if (b.price_day !== undefined && badPrice(b.price_day)) return json(res, 400, { error: 'invalid_price' });
    if (b.plate && db.prepare('SELECT 1 FROM vehicles WHERE plate=? AND id<>?').get(String(b.plate), id)) return json(res, 409, { error: 'plate_exists' });
    /* Guard: a manual status change never overrides an active rental silently. */
    let warning = null;
    if (b.manual_status !== undefined && b.manual_status !== v.manual_status) {
      const active = db.prepare(`SELECT ref FROM bookings WHERE vehicle_id=? AND status='active'`).get(id);
      if (active) warning = 'Attention : la réservation ' + active.ref + ' est en cours (statut RENTED conservé tant que la location est active).';
    }
    const fields = ['brand','model','trim','year','plate','category','transmission','fuel','seats','doors','description','price_day','price_week','price_month','deposit','mileage','documents','manual_status','is_published'];
    const sets = [], vals = [];
    for (const f of fields) if (b[f] !== undefined) { sets.push(f + '=?'); vals.push(f === 'is_published' ? (b[f] ? 1 : 0) : b[f]); }
    if (b.photos !== undefined) { sets.push('photos=?'); vals.push(JSON.stringify(b.photos)); }
    if (b.extra_fees !== undefined) { sets.push('extra_fees=?'); vals.push(JSON.stringify(b.extra_fees)); }
    if (sets.length) { sets.push('seed_demo=0', 'updated_at=?'); vals.push(nowISO(), id); db.prepare('UPDATE vehicles SET ' + sets.join(',') + ' WHERE id=?').run(...vals); }
    return json(res, 200, { ok: true, warning, live: liveStatus(db.prepare('SELECT * FROM vehicles WHERE id=?').get(id)) });
  }
  if (vm && req.method === 'DELETE') {
    const id = +vm[1];
    const blocker = db.prepare(`SELECT ref FROM bookings WHERE vehicle_id=? AND status IN ('pending','confirmed','active') LIMIT 1`).get(id);
    if (blocker) return json(res, 409, { error: 'has_open_bookings', detail: 'Réservation ouverte : ' + blocker.ref });
    const history = db.prepare(`SELECT COUNT(*) c FROM bookings WHERE vehicle_id=?`).get(id);
    if (history.c > 0) return json(res, 409, { error: 'has_history', detail: 'Ce véhicule a un historique de ' + history.c + ' réservation(s) — dépubliez-le (Publié = Non) au lieu de le supprimer, pour préserver les dossiers clients.' });
    db.prepare('DELETE FROM maintenance WHERE vehicle_id=?').run(id);
    db.prepare('DELETE FROM vehicles WHERE id=?').run(id);
    return json(res, 200, { ok: true });
  }
  /* bookings admin */
  if (p === '/api/admin/bookings' && req.method === 'GET') {
    let sql = `SELECT b.*, v.brand, v.model, v.uid vehicle_uid FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id`;
    const cond = [], vals = [];
    if (q.status) { cond.push('b.status=?'); vals.push(q.status); }
    if (q.vehicle_id) { cond.push('b.vehicle_id=?'); vals.push(+q.vehicle_id); }
    if (q.search) { cond.push('(b.ref LIKE ? OR b.customer_name LIKE ? OR b.phone LIKE ?)'); vals.push('%' + q.search + '%', '%' + q.search + '%', '%' + q.search + '%'); }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY b.created_at DESC LIMIT 300';
    return json(res, 200, { bookings: db.prepare(sql).all(...vals) });
  }
  const bm = p.match(/^\/api\/admin\/bookings\/(\d+)\/(confirm|cancel|pickup|complete|extend)$/);
  if (bm && req.method === 'POST') {
    const id = +bm[1], action = bm[2];
    const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    if (!b) return json(res, 404, { error: 'not_found' });
    const body = await readBody(req).catch(() => ({}));
    const upd = (status, extra = {}) => {
      const sets = ['status=?', 'updated_at=?']; const vals = [status, nowISO()];
      for (const [k, val] of Object.entries(extra)) { sets.push(k + '=?'); vals.push(val); }
      vals.push(id);
      db.prepare('UPDATE bookings SET ' + sets.join(',') + ' WHERE id=?').run(...vals);
    };
    if (action === 'confirm') {
      if (b.status !== 'pending') return json(res, 400, { error: 'not_pending' });
      const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(b.vehicle_id);
      const c = findConflict(v, b.pickup_at, b.return_at, b.id);
      if (c) return json(res, 409, { error: 'conflict', detail: c.detail });
      upd('confirmed'); notify('booking_confirmed', b.ref, 'Confirmée par l\u2019admin');
    } else if (action === 'cancel') {
      if (['completed', 'cancelled'].includes(b.status)) return json(res, 400, { error: 'already_closed' });
      upd('cancelled'); notify('booking_cancelled', b.ref, 'Annulée par l\u2019admin');
    } else if (action === 'pickup') {
      if (b.status !== 'confirmed') return json(res, 400, { error: 'not_confirmed' });
      const c = findConflict(db.prepare('SELECT * FROM vehicles WHERE id=?').get(b.vehicle_id), b.pickup_at, nowISO(), b.id);
      upd('active', body.deposit_status ? { deposit_status: String(body.deposit_status) } : {});
    } else if (action === 'complete') {
      if (b.status !== 'active') return json(res, 400, { error: 'not_active' });
      upd('completed', { deposit_status: 'returned' });
    } else if (action === 'extend') {
      if (!['confirmed', 'active'].includes(b.status)) return json(res, 400, { error: 'not_extendable' });
      if (!isDT(body.new_return_at) || new Date(body.new_return_at) <= new Date(b.return_at)) return json(res, 400, { error: 'invalid_extension' });
      const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(b.vehicle_id);
      const c = findConflict(v, b.pickup_at, body.new_return_at, b.id);
      if (c) return json(res, 409, { error: 'conflict', detail: c.detail });
      const days = rentalDays(b.pickup_at, body.new_return_at);
      const exItems = JSON.parse(b.extras || '[]');
      const total = priceFor(v, days).total + exItems.reduce((s, e) => s + e.price, 0) * days;
      upd(b.status, { return_at: body.new_return_at, days, total });
      notify('booking_extended', b.ref, 'Nouveau retour : ' + body.new_return_at.slice(0, 10));
      return json(res, 200, { ok: true, days, total });
    }
    const after = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    return json(res, 200, { ok: true, booking: after, vehicle_live: liveStatus(db.prepare('SELECT * FROM vehicles WHERE id=?').get(b.vehicle_id)) });
  }
  /* calendar */
  if (p === '/api/admin/calendar' && req.method === 'GET') {
    const rows = db.prepare(`SELECT b.ref,b.pickup_at,b.return_at,b.status,b.customer_name, v.uid vehicle_uid, v.brand, v.model
      FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.status IN ('pending','confirmed','active') ORDER BY b.pickup_at`).all();
    const mt = db.prepare(`SELECT m.title,m.starts_at,m.ends_at, v.uid vehicle_uid, v.brand, v.model FROM maintenance m JOIN vehicles v ON v.id=m.vehicle_id WHERE m.done=0 ORDER BY m.starts_at`).all();
    return json(res, 200, { bookings: rows, maintenance: mt });
  }
  /* customers */
  if (p === '/api/admin/customers' && req.method === 'GET') {
    const rows = db.prepare(`SELECT customer_name, phone, email, COUNT(*) bookings_count, COALESCE(SUM(CASE WHEN status IN ('active','completed') THEN total ELSE 0 END),0) spent,
      MAX(created_at) last_booking FROM bookings GROUP BY phone ORDER BY last_booking DESC`).all();
    return json(res, 200, { customers: rows });
  }
  /* maintenance CRUD */
  if (p === '/api/admin/maintenance' && req.method === 'GET') {
    return json(res, 200, { maintenance: db.prepare(`SELECT m.*, v.brand, v.model, v.uid vehicle_uid FROM maintenance m JOIN vehicles v ON v.id=m.vehicle_id ORDER BY m.starts_at DESC`).all() });
  }
  if (p === '/api/admin/maintenance' && req.method === 'POST') {
    const b = await readBody(req);
    const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(+b.vehicle_id);
    if (!v) return json(res, 404, { error: 'vehicle_not_found' });
    if (!isDT(b.starts_at) || !isDT(b.ends_at) || new Date(b.ends_at) <= new Date(b.starts_at)) return json(res, 400, { error: 'invalid_dates' });
    const conflict = db.prepare(`SELECT ref FROM bookings WHERE vehicle_id=? AND status IN ('confirmed','active') AND pickup_at<? AND return_at>? LIMIT 1`).get(v.id, b.ends_at, b.starts_at);
    if (conflict) return json(res, 409, { error: 'conflict', detail: 'Une réservation confirmée chevauche cette période : ' + conflict.ref });
    const info = db.prepare('INSERT INTO maintenance(vehicle_id,title,starts_at,ends_at,notes,done,created_at) VALUES(?,?,?,?,?,0,?)')
      .run(v.id, String(b.title || 'Maintenance'), b.starts_at, b.ends_at, String(b.notes || ''), nowISO());
    notify('maintenance_scheduled', '', v.brand + ' ' + v.model + ' · ' + b.title);
    return json(res, 201, { id: info.lastInsertRowid });
  }
  const mm = p.match(/^\/api\/admin\/maintenance\/(\d+)$/);
  if (mm && req.method === 'DELETE') { db.prepare('DELETE FROM maintenance WHERE id=?').run(+mm[1]); return json(res, 200, { ok: true }); }
  if (mm && req.method === 'PUT') {
    const b = await readBody(req);
    if (b.done !== undefined) db.prepare('UPDATE maintenance SET done=? WHERE id=?').run(b.done ? 1 : 0, +mm[1]);
    return json(res, 200, { ok: true });
  }
  /* reports */
  if (p === '/api/admin/reports' && req.method === 'GET') {
    const revenueByMonth = db.prepare(`SELECT substr(created_at,1,7) month, COUNT(*) bookings, COALESCE(SUM(total),0) revenue FROM bookings WHERE status IN ('active','completed') GROUP BY month ORDER BY month DESC LIMIT 12`).all();
    const util = db.prepare('SELECT * FROM vehicles').all().map(v => {
      const days = db.prepare(`SELECT COALESCE(SUM(days),0) d FROM bookings WHERE vehicle_id=? AND status IN ('active','completed')`).get(v.id).d;
      return { vehicle: v.brand + ' ' + v.model, uid: v.uid, rented_days_total: days, bookings: db.prepare('SELECT COUNT(*) c FROM bookings WHERE vehicle_id=?').get(v.id).c };
    });
    const deposits = db.prepare(`SELECT deposit_status, COUNT(*) c, COALESCE(SUM(deposit_due),0) s FROM bookings WHERE status NOT IN ('cancelled') GROUP BY deposit_status`).all();
    return json(res, 200, { revenue_by_month: revenueByMonth, utilization: util, deposits });
  }
  /* settings + notifications */
  if (p === '/api/admin/settings' && req.method === 'GET') {
    return json(res, 200, { confirmation_mode: getSetting('confirmation_mode'), whatsapp_number: getSetting('whatsapp_number'), agency_name: getSetting('agency_name'), smtp_host: getSetting('smtp_host'), smtp_port: getSetting('smtp_port'), smtp_user: getSetting('smtp_user'), smtp_from: getSetting('smtp_from'), extras_catalog: extrasCatalog() });
  }
  if (p === '/api/admin/settings' && req.method === 'PUT') {
    const b = await readBody(req);
    for (const k of ['confirmation_mode','whatsapp_number','agency_name','smtp_host','smtp_port','smtp_user','smtp_from']) if (b[k] !== undefined) setSetting(k, b[k]);
    if (b.extras_catalog !== undefined) setSetting('extras_catalog', JSON.stringify(b.extras_catalog));
    return json(res, 200, { ok: true });
  }
  /* demo reset: restores the canonical demo dataset; users, sessions and settings are preserved */
  if (p === '/api/admin/reset-demo' && req.method === 'POST') {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM bookings; DELETE FROM maintenance; DELETE FROM notifications; DELETE FROM vehicles;');
      seedDemoData();
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
    return json(res, 200, { ok: true, detail: 'Données de démonstration restaurées. Configuration et compte admin inchangés.' });
  }
  if (p === '/api/admin/notifications' && req.method === 'GET') {
    return json(res, 200, { notifications: db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 100').all() });
  }
  return json(res, 404, { error: 'admin_route_not_found' });
}

server.listen(PORT, () => console.log('NOUR COCHES platform → http://localhost:' + PORT + '  (admin: /admin)'));
