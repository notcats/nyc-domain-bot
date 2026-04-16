import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = process.env.DATA_PATH || path.join(__dirname, '..');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'domains.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS domains (
    id          INTEGER PRIMARY KEY,
    domain      TEXT UNIQUE NOT NULL,
    bl          INTEGER DEFAULT 0,
    aby         INTEGER DEFAULT 0,
    acr         INTEGER DEFAULT 0,
    niche       TEXT,
    status      TEXT DEFAULT 'pending',
    wayback_clean INTEGER DEFAULT 0,
    source      TEXT,
    price       TEXT,
    found_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at  DATETIME
  )
`);

export function insertDomain(d) {
  return db.prepare(`
    INSERT OR IGNORE INTO domains
      (domain, bl, aby, acr, niche, status, wayback_clean, source, price)
    VALUES
      (@domain, @bl, @aby, @acr, @niche, @status, @wayback_clean, @source, @price)
  `).run({
    domain: d.domain, bl: d.bl || 0, aby: d.aby || 0, acr: d.acr || 0,
    niche: d.niche || null, status: d.status || 'pending',
    wayback_clean: d.wayback_clean ? 1 : 0,
    source: d.source || null, price: d.price || null,
  });
}

export const domainExists = domain =>
  !!db.prepare('SELECT id FROM domains WHERE domain = ?').get(domain);

export function updateStatus(domain, status) {
  db.prepare('UPDATE domains SET status=?, decided_at=CURRENT_TIMESTAMP WHERE domain=?')
    .run(status, domain);
}

export const getApproved = () =>
  db.prepare("SELECT * FROM domains WHERE status='approved' ORDER BY found_at DESC").all();

export function getStats() {
  const r = k => db.prepare(`SELECT COUNT(*) n FROM domains WHERE status=?`).get(k).n;
  const total = db.prepare('SELECT COUNT(*) n FROM domains').get().n;
  return { total, approved: r('approved'), rejected: r('rejected'), pending: r('pending') };
}
