import axios from 'axios';
import * as cheerio from 'cheerio';
import { filterDomain, guessNiche } from './filter.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

export async function scrapeExpiredDomains() {
  const results = [];
  try {
    const url = 'https://www.expireddomains.net/backlinks-available/?' +
      'fl=1&fcom=1&bf=15&fy=2018&facr=10&ftld[]=com';
    const res = await axios.get(url, { headers: HEADERS, timeout: 30000 });
    const $ = cheerio.load(res.data);

    $('table.base1 tbody tr, #listing tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;
      const domain = $(cells[0]).find('a').first().text().trim().toLowerCase();
      if (!domain || !domain.includes('.')) return;
      const bl  = parseInt($(cells[1]).text()) || 0;
      const aby = parseInt($(cells[4]).text()) || 0;
      const acr = parseInt($(cells[5]).text()) || 0;
      if (filterDomain(domain, { tld: '.com', bl, aby, acr }))
        results.push({ domain, bl, aby, acr, source: 'expireddomains', niche: guessNiche(domain) });
    });
  } catch (e) {
    console.error('ExpiredDomains:', e.message);
  }
  return results;
}
