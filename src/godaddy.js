import axios from 'axios';
import * as cheerio from 'cheerio';
import { filterDomain, guessNiche } from './filter.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
};

export async function scrapeGodaddy() {
  const results = [];
  const keywords = ['nyc', 'newyork', 'manhattan', 'brooklyn'];

  for (const kw of keywords) {
    await new Promise(r => setTimeout(r, 2500));
    try {
      const url =
        `https://auctions.godaddy.com/trpSearchResults.aspx?` +
        `searchType=expired&status=auctions&keyword=${kw}&tlds=com`;
      const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      const $ = cheerio.load(res.data);

      $('[data-domain], .auction-result-row, .domain-listing').each((_, el) => {
        const domain =
          $(el).attr('data-domain') ||
          $(el).find('.domain-name, .domainname, [class*="domain"]').first().text().trim();
        if (!domain || !domain.endsWith('.com')) return;
        const price = $(el).find('[class*="price"], [class*="bid"], .price').first().text().trim();
        if (filterDomain(domain, { tld: '.com' })) {
          results.push({ domain: domain.toLowerCase(), bl: 0, aby: 0, acr: 0,
            price: price || 'N/A', source: 'godaddy', niche: guessNiche(domain) });
        }
      });
    } catch (e) {
      console.error(`GoDaddy [${kw}]: ${e.message}`);
    }
  }
  return results;
}

export const godaddyLink = domain =>
  `https://auctions.godaddy.com/trpItemListings.aspx?searchType=exact&keyword=${domain}`;
