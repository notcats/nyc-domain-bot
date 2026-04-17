import { filterDomain, guessNiche } from './filter.js';

const NYC_BASE = ['nyc', 'newyork', 'manhattan', 'brooklyn', 'queens', 'bronx'];
const LETTERS  = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Skip single-word domains (nyc.com) by starting at the next letter level:
// com,nycl → nyclawyer.com, nyclaw.com, nycliving.com
// com,nycr → nycrealty.com, nycrestaurant.com
const CDX_PREFIXES = [];
for (const base of NYC_BASE)
  for (const l of LETTERS)
    CDX_PREFIXES.push(`${base}${l}`);
// 6 × 26 = 156 prefixes total

let scanIndex = 0; // cycles through all prefixes over time

function surtToDomain(urlkey) {
  try {
    const parts = urlkey.split(')')[0].split(',');
    return parts.length >= 2 ? `${parts[1]}.${parts[0]}` : null;
  } catch { return null; }
}

async function findDomainsFromCDX(prefix) {
  const domains = new Set();
  try {
    const url = `https://web.archive.org/cdx/search/cdx?url=com,${prefix}&matchType=prefix&output=json&fl=urlkey&limit=200&from=20100101&to=20190101`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    for (const [k] of data.slice(1)) {
      const d = surtToDomain(k);
      if (d && d.endsWith('.com') && d.length < 50) domains.add(d);
    }
    console.log(`CDX[${prefix}]: ${domains.size} domains / ${data.length - 1} records`);
  } catch (e) {
    console.error(`CDX[${prefix}]: ${e.message}`);
  }
  return [...domains];
}

async function isDomainExpired(domain) {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, { signal: AbortSignal.timeout(10000) });
    if (res.status === 404) return true;
    if (res.ok) {
      const data = await res.json();
      const exp = (data.events || []).find(e => e.eventAction === 'expiration');
      if (exp && new Date(exp.eventDate) < new Date()) return true;
    }
    return false;
  } catch { return true; }
}

export async function scrapeExpiredDomains() {
  const results = [];
  const checked = new Set();

  // Pick 15 consecutive prefixes per scan, cycling through all 156
  const batch = CDX_PREFIXES.slice(scanIndex % CDX_PREFIXES.length,
    (scanIndex % CDX_PREFIXES.length) + 15);
  scanIndex += 15;

  for (const prefix of batch) {
    const candidates = await findDomainsFromCDX(prefix);
    let count = 0;

    for (const domain of candidates) {
      if (count >= 15 || checked.has(domain)) continue;
      checked.add(domain);
      if (!filterDomain(domain, {})) continue;

      const expired = await isDomainExpired(domain);
      if (!expired) { await new Promise(r => setTimeout(r, 150)); continue; }

      count++;
      results.push({ domain, bl: 0, aby: 0, acr: 0, source: 'wayback-cdx', niche: guessNiche(domain) });
      await new Promise(r => setTimeout(r, 250));
    }
  }
  console.log(`scrapeExpiredDomains: ${results.length} candidates`);
  return results;
}

export async function debugScrape() {
  // Test a few high-value letter prefixes
  const testPrefixes = ['nycl', 'nycr', 'nycm', 'brooklynl', 'manhattanl'];
  const lines = [];
  for (const prefix of testPrefixes) {
    try {
      const url = `https://web.archive.org/cdx/search/cdx?url=com,${prefix}&matchType=prefix&output=json&fl=urlkey&limit=100&from=20100101&to=20190101`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const data = await res.json();
      const domains = new Set();
      for (const [k] of data.slice(1)) {
        const d = surtToDomain(k);
        if (d && d.endsWith('.com')) domains.add(d);
      }
      const sample = [...domains].slice(0, 4).join(', ');
      lines.push(`com,${prefix}: ${data.length - 1} зап. / ${domains.size} дом. - ${sample || 'пусто'}`);
    } catch (e) {
      lines.push(`com,${prefix}: ошибка - ${e.message.slice(0, 50)}`);
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return lines;
}
