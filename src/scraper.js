import { filterDomain, guessNiche } from './filter.js';

const NYC_PREFIXES = ['nyc', 'newyork', 'manhattan', 'brooklyn', 'queens', 'bronx'];

async function findDomainsFromCDX(prefix) {
  const domains = new Set();
  try {
    const url = `https://web.archive.org/cdx/search/cdx?url=${prefix}*.com&output=json&fl=original&collapse=urlkey&limit=500&from=20050101&to=20190101&filter=statuscode:200`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const data = await res.json();
    for (const [original] of data.slice(1)) {
      try {
        const u = new URL(original.startsWith('http') ? original : `https://${original}`);
        const domain = u.hostname.replace(/^www\./, '').toLowerCase();
        if (domain.endsWith('.com') && domain.length < 50 && !domain.includes(' '))
          domains.add(domain);
      } catch {}
    }
    console.log(`CDX[${prefix}]: ${domains.size} unique domains`);
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
  } catch {
    return true;
  }
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
      const url = `https://web.archive.org/cdx/search/cdx?url=${prefix}*.com&output=json&fl=original&collapse=urlkey&limit=20&from=20100101&to=20190101&filter=statuscode:200`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      const sample = data.slice(1, 4).map(([o]) => {
        try { return new URL(o.startsWith('http') ? o : `https://${o}`).hostname.replace(/^www\./, ''); } catch { return o; }
      });
      lines.push(`CDX[${prefix}*.com]: HTTP${res.status} | ${data.length - 1} результатов | ${sample.join(', ') || 'пусто'}`);
    } catch (e) {
      lines.push(`CDX[${prefix}]: ошибка — ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return lines;
}
