import axios from 'axios';

const WAYBACK_AVAILABLE_API = 'https://archive.org/wayback/available';
const WAYBACK_CDX_API = 'https://web.archive.org/cdx/search/cdx';

const RED_FLAGS = [
  'domain may be for sale',
  'domain is for sale',
  'buy this domain',
  'related searches',
  'this domain is for sale',
  'under construction',
  'coming soon',
  'parked free',
  'domain parking',
];

const MIN_SNAPSHOTS = 5;
const REQUEST_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Получает количество снимков в Wayback Machine для домена
 * @param {string} domain
 * @returns {Promise<number>}
 */
export async function getSnapshotCount(domain) {
  try {
    await sleep(REQUEST_DELAY_MS);
    const url = `${WAYBACK_CDX_API}?url=${encodeURIComponent(domain)}&output=json&limit=1000&fl=timestamp&collapse=timestamp:6`;
    console.log(`[wayback] Получение снимков для ${domain}`);
    const response = await axios.get(url, { timeout: 15000 });
    const data = response.data;

    if (!Array.isArray(data) || data.length <= 1) {
      return 0;
    }
    // Первая строка — заголовки, остальные — данные
    return data.length - 1;
  } catch (err) {
    console.error(`[wayback] Ошибка получения снимков для ${domain}:`, err.message);
    return 0;
  }
}

/**
 * Получает последний снимок Wayback для анализа содержимого
 * @param {string} domain
 * @returns {Promise<string|null>}
 */
async function getLatestSnapshot(domain) {
  try {
    await sleep(REQUEST_DELAY_MS);
    const response = await axios.get(`${WAYBACK_AVAILABLE_API}?url=${encodeURIComponent(domain)}`, { timeout: 10000 });
    const data = response.data;

    if (data?.archived_snapshots?.closest?.url) {
      return data.archived_snapshots.closest.url;
    }
    return null;
  } catch (err) {
    console.error(`[wayback] Ошибка получения последнего снимка для ${domain}:`, err.message);
    return null;
  }
}

/**
 * Получает содержимое страницы с Wayback Machine для анализа красных флагов
 * @param {string} snapshotUrl
 * @returns {Promise<string>}
 */
async function fetchSnapshotContent(snapshotUrl) {
  try {
    await sleep(REQUEST_DELAY_MS);
    const response = await axios.get(snapshotUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DomainChecker/1.0)',
      },
    });
    return (response.data || '').toLowerCase();
  } catch (err) {
    console.error(`[wayback] Ошибка получения содержимого снимка:`, err.message);
    return '';
  }
}

/**
 * Получает историю домена по CDX API (первый и последний год)
 * @param {string} domain
 * @returns {Promise<{firstYear: number|null, lastYear: number|null, description: string}>}
 */
export async function getDomainHistory(domain) {
  try {
    await sleep(REQUEST_DELAY_MS);
    const url = `${WAYBACK_CDX_API}?url=${encodeURIComponent(domain)}&output=json&fl=timestamp,statuscode&limit=1000&collapse=timestamp:6`;
    const response = await axios.get(url, { timeout: 15000 });
    const data = response.data;

    if (!Array.isArray(data) || data.length <= 1) {
      return { firstYear: null, lastYear: null, description: 'Нет данных' };
    }

    const rows = data.slice(1);
    const timestamps = rows.map(r => r[0]).filter(Boolean).sort();

    const firstYear = timestamps[0] ? parseInt(timestamps[0].slice(0, 4)) : null;
    const lastYear = timestamps[timestamps.length - 1] ? parseInt(timestamps[timestamps.length - 1].slice(0, 4)) : null;

    const description = firstYear && lastYear
      ? `Сайт активен ${firstYear}–${lastYear}`
      : 'История неизвестна';

    return { firstYear, lastYear, description };
  } catch (err) {
    console.error(`[wayback] Ошибка получения истории для ${domain}:`, err.message);
    return { firstYear: null, lastYear: null, description: 'Ошибка получения данных' };
  }
}

/**
 * Проверяет домен в Wayback Machine.
 * @param {string} domain
 * @returns {Promise<{ clean: boolean, snapshots: number, reason: string, history: string }>}
 */
export async function checkWayback(domain) {
  console.log(`[wayback] Проверка домена: ${domain}`);

  const snapshots = await getSnapshotCount(domain);
  console.log(`[wayback] ${domain}: найдено ${snapshots} снимков`);

  if (snapshots < MIN_SNAPSHOTS) {
    return {
      clean: false,
      snapshots,
      reason: `Мало снимков: ${snapshots} (минимум ${MIN_SNAPSHOTS})`,
      history: 'Недостаточно данных',
    };
  }

  const snapshotUrl = await getLatestSnapshot(domain);
  if (!snapshotUrl) {
    return {
      clean: false,
      snapshots,
      reason: 'Последний снимок недоступен',
      history: 'Нет доступных снимков',
    };
  }

  const content = await fetchSnapshotContent(snapshotUrl);

  for (const flag of RED_FLAGS) {
    if (content.includes(flag)) {
      console.log(`[wayback] ${domain}: красный флаг — "${flag}"`);
      return {
        clean: false,
        snapshots,
        reason: `Красный флаг: "${flag}"`,
        history: 'Паркинг или страница продажи',
      };
    }
  }

  const { firstYear, lastYear, description } = await getDomainHistory(domain);

  console.log(`[wayback] ${domain}: чистый сайт ✅`);
  return {
    clean: true,
    snapshots,
    reason: 'Реальный сайт',
    history: description,
    firstYear,
    lastYear,
  };
}
