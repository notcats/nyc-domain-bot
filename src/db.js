import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.DATA_PATH
  ? path.join(process.env.DATA_PATH, 'domains.json')
  : path.join(__dirname, '..', 'domains.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { domains: {}, customWords: [] }; }
}

function save(data) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function insertDomain(d) {
  const data = load();
  if (data.domains[d.domain]) return;
  data.domains[d.domain] = { ...d, found_at: new Date().toISOString() };
  save(data);
}

export const domainExists = domain => !!load().domains[domain];

export function updateStatus(domain, status) {
  const data = load();
  if (data.domains[domain]) {
    data.domains[domain].status = status;
    data.domains[domain].decided_at = new Date().toISOString();
    save(data);
  }
}

export const getApproved = () =>
  Object.values(load().domains).filter(d => d.status === 'approved');

export function getStats() {
  const list = Object.values(load().domains);
  return {
    total:    list.length,
    approved: list.filter(d => d.status === 'approved').length,
    rejected: list.filter(d => d.status === 'rejected').length,
    pending:  list.filter(d => d.status === 'pending').length,
  };
}

export function getCustomWords() {
  return load().customWords || [];
}

export function addCustomWord(word) {
  const clean = word.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!clean) return false;
  const data = load();
  const words = data.customWords || [];
  if (words.includes(clean)) return false;
  data.customWords = [...words, clean];
  save(data);
  return true;
}

export function removeCustomWord(word) {
  const data = load();
  const words = data.customWords || [];
  const next = words.filter(w => w !== word.toLowerCase());
  if (next.length === words.length) return false;
  data.customWords = next;
  save(data);
  return true;
}
