import puppeteer from 'puppeteer';
import { filterDomain, guessNiche } from './filter.js';

const BASE = 'https://www.expireddomains.net';

export async function scrapeExpiredDomains() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-gpu', '--single-process'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    // Login if credentials are provided
    if (process.env.EXPIRED_DOMAINS_LOGIN) {
      await page.goto(`${BASE}/login/`, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.type('#id_username', process.env.EXPIRED_DOMAINS_LOGIN, { delay: 50 });
      await page.type('#id_password', process.env.EXPIRED_DOMAINS_PASSWORD, { delay: 50 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click('[type=submit]'),
      ]);
      console.log('Logged in to expireddomains.net');
    }

    // Build search URL with filters
    const searchUrl = `${BASE}/backlinks-available/?` +
      `fl=1&fcom=1&bf=15&fy=2018&facr=10&ftld[]=com&start=0`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const rows = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('table.base1 tbody tr, #listing tbody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) return;
        const domainEl = cells[0]?.querySelector('a');
        const domain = domainEl?.textContent?.trim().toLowerCase();
        if (!domain || !domain.includes('.')) return;
        results.push({
          domain,
          bl:  parseInt(cells[1]?.textContent?.trim()) || 0,
          aby: parseInt(cells[4]?.textContent?.trim()) || 0,
          acr: parseInt(cells[5]?.textContent?.trim()) || 0,
        });
      });
      return results;
    });

    return rows
      .filter(d => filterDomain(d.domain, { tld: '.com', bl: d.bl, aby: d.aby, acr: d.acr }))
      .map(d => ({ ...d, source: 'expireddomains', niche: guessNiche(d.domain) }));

  } finally {
    await browser.close();
  }
}
