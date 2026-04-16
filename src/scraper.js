import axios from 'axios';
import * as cheerio from 'cheerio';
import { filterDomain, guessNiche } from './filter.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.expireddomains.net/',
};

const NYC_KEYWORDS = ['nyc', 'newyork', 'manhattan', 'brooklyn', 'queens', 'bronx'];

function parseRows($) {
  const rows = [];
  $('table.base1 tbody tr, #listing tbody tr, .domainlist tbody tr, table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;
    const domain = $(cells[0]).find('a').first().text().trim().toLowerCase();
    if (!domain || !domain.includes('.') || domain.length > 60) return;
    const bl  = parseInt($(cells[1]).text()) || 0;
    const aby = parseInt($(cells[4]).text()) || 0;
    const acr = parseInt($(cells[5]).text()) || 0;
    rows.push({ domain, bl, aby, acr });
  });
  return rows;
}

export async function scrapeExpiredDomains() {
  const results = [];
  const seen = new Set();

  for (const kw of NYC_KEYWORDS) {
    try {
      const url = `https://www.expireddomains.net/domain-name-search/?q=${kw}&ftld[]=com&fcom=1`;
      const res = await axios.get(url, { headers: HEADERS, timeout: 30000 });
      const $ = cheerio.load(res.data);
      const rows = parseRows($);
      let passed = 0;
      for (const d of rows) {
        if (seen.has(d.domain)) continue;
        seen.add(d.domain);
        if (filterDomain(d.domain, { tld: '.com', bl: d.bl, aby: d.aby, acr: d.acr })) {
          results.push({ ...d, source: 'expireddomains', niche: guessNiche(d.domain) });
          passed++;
        }
      }
      console.log(`[expireddomains:${kw}] ${rows.length} rows, ${passed} passed filter`);
    } catch (e) {
      console.error(`[expireddomains:${kw}] ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

export async function debugScrape() {
  const lines = [];
  try {
    const url = 'https://www.expireddomains.net/domain-name-search/?q=nyc&ftld[]=com';
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);

    lines.push(`HTTP ${res.status} | HTML: ${res.data.length} bytes`);
    lines.push(`<table> найдено: ${$('table').length}`);
    lines.push(`<tr> найдено: ${$('tr').length}`);
    lines.push(`<td> найдено: ${$('td').length}`);

    // Show all table class names
    const tableClasses = [];
    $('table').each((_, t) => {
      const cls = $(t).attr('class') || $(t).attr('id') || 'no-class';
      tableClasses.push(cls);
    });
    if (tableClasses.length)
      lines.push(`Table classes: ${tableClasses.slice(0, 5).join(', ')}`);

    // Show first domain-like link
    const links = [];
    $('a').each((_, a) => {
      const href = $(a).attr('href') || '';
      const text = $(a).text().trim();
      if (text.includes('.com') || text.includes('.net')) links.push(text);
    });
    if (links.length)
      lines.push(`Первые ссылки: ${links.slice(0, 5).join(', ')}`);
    else
      lines.push('Ссылок с доменами не найдено');

    // Show page title and a snippet
    lines.push(`Title: ${$('title').text().trim()}`);

    // Check if login form present
    if ($('input[type="password"]').length)
      lines.push('⚠️ Обнаружена форма логина — сайт требует авторизации');

    // Show raw HTML snippet (first 400 chars of body)
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 400);
    lines.push(`Текст страницы: ${bodyText}`);

  } catch (e) {
    lines.push(`Ошибка: ${e.message}`);
  }
  return lines;
}
