import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'domains.db');

let db;

export function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT UNIQUE,
      bl INTEGER,
      aby INTEGER,
      acr INTEGER,
      niche TEXT,
      status TEXT DEFAULT 'pending',
      wayback_clean INTEGER DEFAULT 0,
      source TEXT,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      decided_at DATETIME
    );
  `);

  console.log('[db] База данных инициализирована:', DB_PATH);
  return db;
}

export function getDb() {
  if (!db) initDb();
  return db;
}

export function isDomainSeen(domain) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM domains WHERE domain = ?').get(domain);
  return !!row;
}

export function saveDomain(domainData) {
  const db = getDb();
  const { domain, bl, aby, acr, niche, status, wayback_clean, source } = domainData;
  try {
    db.prepare(`
      INSERT OR IGNORE INTO domains (domain, bl, aby, acr, niche, status, wayback_clean, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(domain, bl, aby, acr, niche, status || 'pending', wayback_clean ? 1 : 0, source);
    console.log(`[db] Домен сохранён: ${domain}`);
  } catch (err) {
    console.error(`[db] Ошибка сохранения домена ${domain}:`, err.message);
  }
}

export function updateDomainStatus(domain, status) {
  const db = getDb();
  db.prepare(`
    UPDATE domains SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE domain = ?
  `).run(status, domain);
  console.log(`[db] Статус домена ${domain} обновлён: ${status}`);
}

export function getApprovedDomains() {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM domains WHERE status = 'approved' ORDER BY decided_at DESC LIMIT 20
  `).all();
}

export function getStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM domains').get().count;
  const approved = db.prepare("SELECT COUNT(*) as count FROM domains WHERE status = 'approved'").get().count;
  const rejected = db.prepare("SELECT COUNT(*) as count FROM domains WHERE status = 'rejected'").get().count;
  const pending = db.prepare("SELECT COUNT(*) as count FROM domains WHERE status = 'pending'").get().count;
  return { total, approved, rejected, pending };
}

export function getDomainInfo(domain) {
  const db = getDb();
  return db.prepare('SELECT * FROM domains WHERE domain = ?').get(domain);
}
