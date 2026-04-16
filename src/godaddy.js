import axios from 'axios';
import * as cheerio from 'cheerio';

const GODADDY_AUCTIONS_URL = 'https://auctions.godaddy.com/trpSearchResults.aspx';
const NYC_KEYWORDS = ['nyc', 'newyork', 'new-york', 'manhattan', 'brooklyn'];
const DELAY_MS = 2500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

/**
 * Парсит цену из текста
 * @param {string} text
 * @returns {string}
 */
function parsePrice(text) {
  const match = text.match(/\$[\d,]+/);
  return match ? match[0] : 'N/A';
}

/**
 * Парсит одну страницу результатов GoDaddy Auctions
 * @param {string} keyword
 * @param {number} page
 * @returns {Promise<Array>}
 */
async function scrapeGoDaddyPage(keyword, page = 1) {
  const domains = [];

  try {
    await sleep(DELAY_MS);
    const params = new URLSearchParams({
      q: keyword,
      tlds: 'com',
      ext: '.com',
      pricetype: 'auction',
      orderby: 'bids',
      orderdir: 'DESC',
      PageIndex: page.toString(),
    });

    const url = `${GODADDY_AUCTIONS_URL}?${params.toString()}`;
    console.log(`[godaddy] Запрос: ${keyword}, страница ${page}`);

    const response = await axios.get(url, {
      headers: DEFAULT_HEADERS,
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // Парсим таблицу результатов
    $('tr.trpSrchRow, .auction-row, tr[id^="row"]').each((_, row) => {
      const $row = $(row);

      const domainEl = $row.find('a.domain-link, a[href*="godaddy.com/domain"], td.domain a, .trpDomain a').first();
      const domain = domainEl.text().trim().toLowerCase();

      if (!domain || !domain.endsWith('.com')) return;

      const priceEl = $row.find('.trpBidAmt, .price, td:contains("$")').first();
      const price = parsePrice(priceEl.text() || '');

      const bidsEl = $row.find('.trpBids, .bids').first();
      const bids = parseInt(bidsEl.text()) || 0;

      domains.push({
        domain,
        price,
        bids,
        bl: 0,  // GoDaddy не даёт BL напрямую
        aby: 0,
        acr: 0,
        source: 'godaddy',
      });
    });

    // Альтернативный парсинг если структура другая
    if (domains.length === 0) {
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().toLowerCase();

        if (
          text.endsWith('.com') &&
          NYC_KEYWORDS.some(kw => text.includes(kw)) &&
          (href.includes('godaddy') || href.includes('auction'))
        ) {
          domains.push({
            domain: text,
            price: 'N/A',
            bids: 0,
            bl: 0,
            aby: 0,
            acr: 0,
            source: 'godaddy',
          });
        }
      });
    }

    console.log(`[godaddy] "${keyword}" стр.${page}: найдено ${domains.length} доменов`);
  } catch (err) {
    console.error(`[godaddy] Ошибка парсинга "${keyword}" стр.${page}:`, err.message);
  }

  return domains;
}

/**
 * Получает ссылку на аукцион GoDaddy для домена
 * @param {string} domain
 * @returns {string}
 */
export function getGoDaddyAuctionLink(domain) {
  return `https://auctions.godaddy.com/trpItemListing.aspx?miid=${encodeURIComponent(domain)}`;
}

/**
 * Получает ссылку на покупку домена на GoDaddy
 * @param {string} domain
 * @returns {string}
 */
export function getGoDaddyBuyLink(domain) {
  return `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${encodeURIComponent(domain)}`;
}

/**
 * Основная функция парсинга GoDaddy Auctions
 * @returns {Promise<Array>}
 */
export async function scrapeGoDaddy() {
  console.log('[godaddy] Запуск парсинга GoDaddy Auctions...');
  const allDomains = [];

  for (const keyword of NYC_KEYWORDS) {
    await sleep(DELAY_MS);

    const page1 = await scrapeGoDaddyPage(keyword, 1);
    allDomains.push(...page1);

    if (page1.length >= 10) {
      await sleep(DELAY_MS);
      const page2 = await scrapeGoDaddyPage(keyword, 2);
      allDomains.push(...page2);
    }
  }

  // Убираем дубликаты
  const unique = Array.from(
    new Map(allDomains.map(d => [d.domain, d])).values()
  );

  console.log(`[godaddy] Всего уникальных доменов: ${unique.length}`);
  return unique;
}
