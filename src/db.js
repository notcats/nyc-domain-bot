import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Allow Railway Volume (or any external path) via DB_PATH env var
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'domains.db');

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

    CREATE TABLE IF NOT EXISTS users (
      chat_id TEXT PRIMARY KEY,
      username TEXT,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS filter_settings (
      key TEXT PRIMARY KEY,
      value REAL NOT NULL
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

/**
 * Saves a domain and returns its DB id (existing or newly inserted).
 * @returns {number|null}
 */
export function saveDomain(domainData) {
  const db = getDb();
  const { domain, bl, aby, acr, niche, status, wayback_clean, source } = domainData;
  try {
    db.prepare(`
      INSERT OR IGNORE INTO domains (domain, bl, aby, acr, niche, status, wayback_clean, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(domain, bl, aby, acr, niche, status || 'pending', wayback_clean ? 1 : 0, source);
    const row = db.prepare('SELECT id FROM domains WHERE domain = ?').get(domain);
    console.log(`[db] Домен сохранён: ${domain} (id=${row?.id})`);
    return row?.id ?? null;
  } catch (err) {
    console.error(`[db] Ошибка сохранения домена ${domain}:`, err.message);
    return null;
  }
}

export function updateDomainStatus(domain, status) {
  const db = getDb();
  db.prepare(`
    UPDATE domains SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE domain = ?
  `).run(status, domain);
  console.log(`[db] Статус домена ${domain} обновлён: ${status}`);
}

/**
 * Returns a page of approved domains (10 per page).
 * @param {number} page - 1-based page number
 * @returns {{ rows: Array, total: number }}
 */
export function getApprovedDomainsPage(page = 1) {
  const db = getDb();
  const PAGE_SIZE = 10;
  const offset = (page - 1) * PAGE_SIZE;
  const rows = db.prepare(`
    SELECT * FROM domains WHERE status = 'approved' ORDER BY decided_at DESC LIMIT ? OFFSET ?
  `).all(PAGE_SIZE, offset);
  const total = db.prepare("SELECT COUNT(*) as count FROM domains WHERE status = 'approved'").get().count;
  return { rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) };
}

/** Returns all approved domains (for CSV export). */
export function getAllApprovedDomains() {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM domains WHERE status = 'approved' ORDER BY decided_at DESC
  `).all();
}

/** @deprecated Use getApprovedDomainsPage instead */
export function getApprovedDomains() {
  return getApprovedDomainsPage(1).rows;
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

export function getDomainById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM domains WHERE id = ?').get(id);
}

// ─── Multi-user support ───────────────────────────────────────────────────────

export function upsertUser(chatId, username) {
  const db = getDb();
  db.prepare(`
    INSERT INTO users (chat_id, username) VALUES (?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET username = excluded.username
  `).run(String(chatId), username || '');
  console.log(`[db] Пользователь зарегистрирован: ${chatId}`);
}

/** Returns array of chat_id strings for all registered users. */
export function getUsers() {
  const db = getDb();
  return db.prepare('SELECT chat_id FROM users').all().map(r => r.chat_id);
}

/** Removes a user from the users table. */
export function removeUser(chatId) {
  const db = getDb();
  db.prepare('DELETE FROM users WHERE chat_id = ?').run(String(chatId));
  console.log(`[db] Пользователь удалён: ${chatId}`);
}

// ─── Filter settings ──────────────────────────────────────────────────────────

export function getFilterSetting(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM filter_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setFilterSetting(key, value) {
  const db = getDb();
  db.prepare(`
    INSERT INTO filter_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
  console.log(`[db] Настройка ${key} = ${value}`);
}
