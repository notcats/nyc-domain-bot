import { filterDomain, guessNiche } from './filter.js';

const NYC_PREFIXES = ['nyc', 'newyork', 'manhattan', 'brooklyn', 'queens', 'bronx'];

// Extract root domain from SURT urlkey: "com,nyclaw,www)/path" → "nyclaw.com"
function surtToDomain(urlkey) {
  try {
    const surtHost = urlkey.split(')')[0]; // "com,nyclaw,www"
    const parts = surtHost.split(',');     // ["com", "nyclaw", "www"]
    if (parts.length < 2) return null;
    return `${parts[1]}.${parts[0]}`;     // "nyclaw.com"
  } catch { return null; }
}

async function findDomainsFromCDX(prefix) {
  const domains = new Set();
  try {
    // fl=urlkey returns compact SURT keys; high limit to get past the popular single-word domain
    const url = `https://web.archive.org/cdx/search/cdx?url=com,${prefix}&matchType=prefix&output=json&fl=urlkey&limit=5000&from=20100101&to=20190101`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) return [];
    const data = await res.json();
    for (const [urlkey] of data.slice(1)) {
      const domain = surtToDomain(urlkey);
      if (domain && domain.endsWith('.com') && domain.length < 50) domains.add(domain);
    }
    console.log(`CDX[${prefix}]: ${domains.size} unique domains from ${data.length - 1} records`);
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

  for (const prefix of NYC_PREFIXES) {
    const candidates = await findDomainsFromCDX(prefix);
    let count = 0;

    for (const domain of candidates) {
      if (count >= 20 || checked.has(domain)) continue;
      checked.add(domain);
      if (!filterDomain(domain, {})) continue;

      const expired = await isDomainExpired(domain);
      if (!expired) { await new Promise(r => setTimeout(r, 200)); continue; }

      count++;
      results.push({ domain, bl: 0, aby: 0, acr: 0, source: 'wayback-cdx', niche: guessNiche(domain) });
      await new Promise(r => setTimeout(r, 300));
    }
  }
  console.log(`scrapeExpiredDomains: ${results.length} candidates`);
  return results;
}

export async function debugScrape() {
  const lines = [];
  for (const prefix of NYC_PREFIXES.slice(0, 3)) {
    try {
      const url = `https://web.archive.org/cdx/search/cdx?url=com,${prefix}&matchType=prefix&output=json&fl=urlkey&limit=500&from=20100101&to=20190101`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      const domains = new Set();
      for (const [k] of data.slice(1)) {
        const d = surtToDomain(k);
        if (d && d.endsWith('.com')) domains.add(d);
      }
      const sample = [...domains].slice(0, 4).join(', ');
      lines.push(`com,${prefix}: ${data.length - 1} зап. | ${domains.size} дом. | ${sample || 'пусто'}`);
    } catch (e) {
      lines.push(`com,${prefix}: ошибка - ${e.message.slice(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return lines;
}
