import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const BASE_URL = 'https://www.expireddomains.net';
const SEARCH_URL = `${BASE_URL}/domain-name-search/`;
const NYC_KEYWORDS = ['nyc', 'newyork', 'new-york', 'manhattan', 'brooklyn'];
const DELAY_MS = 2500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });
  return browser;
}

/**
 * Авторизация на expireddomains.net
 * @param {import('puppeteer-core').Page} page
 */
async function login(page) {
  const login = process.env.EXPIRED_DOMAINS_LOGIN;
  const password = process.env.EXPIRED_DOMAINS_PASSWORD;

  if (!login || !password) {
    console.log('[scraper] Нет данных для авторизации — работа без логина');
    return;
  }

  try {
    console.log('[scraper] Авторизация на expireddomains.net...');
    await page.goto(`${BASE_URL}/login/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(DELAY_MS);

    await page.type('input[name="login"]', login, { delay: 80 });
    await page.type('input[name="password"]', password, { delay: 80 });
    await sleep(500);

    await Promise.all([
      page.click('input[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    ]);

    console.log('[scraper] Авторизация выполнена ✅');
  } catch (err) {
    console.error('[scraper] Ошибка авторизации:', err.message);
  }
}

/**
 * Парсит таблицу доменов на текущей странице
 * @param {import('puppeteer-core').Page} page
 * @returns {Promise<Array>}
 */
async function parseDomainTable(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table.base1 tr, table#listing tr'));
    const domains = [];

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length < 4) continue;

      const domainCell = row.querySelector('td.field_domain a, td a[href*="expireddomains"]');
      if (!domainCell) continue;

      const domain = domainCell.textContent.trim().toLowerCase();
      if (!domain || !domain.includes('.')) continue;

      // Парсим метрики из ячеек таблицы
      const getText = (idx) => (cells[idx]?.textContent || '').trim();

      // Типичная структура таблицы: домен, BL, ABY, ACR, ...
      const blText = getText(2) || getText(3);
      const abyText = getText(4) || getText(5);
      const acrText = getText(6) || getText(7);

      const bl = parseInt(blText) || 0;
      const aby = parseInt(abyText) || 0;
      const acr = parseInt(acrText) || 0;

      if (domain.endsWith('.com')) {
        domains.push({ domain, bl, aby, acr, source: 'expireddomains.net' });
      }
    }

    return domains;
  });
}

/**
 * Поиск доменов по ключевому слову
 * @param {import('puppeteer-core').Page} page
 * @param {string} keyword
 * @returns {Promise<Array>}
 */
async function searchByKeyword(page, keyword) {
  const results = [];

  try {
    console.log(`[scraper] Поиск по ключевому слову: ${keyword}`);
    const searchUrl = `${SEARCH_URL}?q=${encodeURIComponent(keyword)}&start=0&tlds%5B%5D=com`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(DELAY_MS);

    const domains = await parseDomainTable(page);
    console.log(`[scraper] "${keyword}": найдено ${domains.length} доменов`);
    results.push(...domains);

    // Парсим вторую страницу если есть
    const hasNextPage = await page.$('a.next, a[rel="next"]');
    if (hasNextPage && results.length < 50) {
      await sleep(DELAY_MS);
      await Promise.all([
        hasNextPage.click(),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      ]);
      const page2Domains = await parseDomainTable(page);
      console.log(`[scraper] "${keyword}" стр.2: найдено ${page2Domains.length} доменов`);
      results.push(...page2Domains);
    }
  } catch (err) {
    console.error(`[scraper] Ошибка поиска "${keyword}":`, err.message);
  }

  return results;
}

/**
 * Основная функция парсинга expireddomains.net
 * @returns {Promise<Array>}
 */
export async function scrapeExpiredDomains() {
  console.log('[scraper] Запуск парсинга expireddomains.net...');
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36');
    await page.setDefaultNavigationTimeout(30000);

    await login(page);
    await sleep(DELAY_MS);

    const allDomains = [];

    for (const keyword of NYC_KEYWORDS) {
      await sleep(DELAY_MS);
      const domains = await searchByKeyword(page, keyword);
      allDomains.push(...domains);
    }

    // Убираем дубликаты
    const unique = Array.from(
      new Map(allDomains.map(d => [d.domain, d])).values()
    );

    console.log(`[scraper] Всего уникальных доменов: ${unique.length}`);
    return unique;
  } catch (err) {
    console.error('[scraper] Критическая ошибка:', err.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
      console.log('[scraper] Браузер закрыт');
    }
  }
}
