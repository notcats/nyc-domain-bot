// Фильтрация доменов по критериям NYC-тематики

const NYC_KEYWORDS = ['nyc', 'newyork', 'new-york', 'manhattan', 'brooklyn'];
const BANNED_KEYWORDS = ['parking', 'casino', 'pharma', 'adult', 'spam', 'porn', 'sex', 'drug'];

const MIN_BACKLINKS = 15;
const MAX_REGISTRATION_YEAR = 2018;
const MIN_WAYBACK_SNAPSHOTS = 10;

/**
 * Проверяет домен по всем критериям фильтрации.
 * @param {Object} domain
 * @param {string} domain.domain - имя домена
 * @param {number} domain.bl - количество бэклинков
 * @param {number} domain.aby - год регистрации
 * @param {number} domain.acr - количество архивов Wayback
 * @param {boolean} domain.wayback_clean - прошёл проверку Wayback
 * @returns {{ pass: boolean, reason: string }}
 */
export function filterDomain(domain) {
  const name = (domain.domain || '').toLowerCase();

  // TLD: только .com
  if (!name.endsWith('.com')) {
    return { pass: false, reason: 'Не .com домен' };
  }

  // Запрещённые слова
  for (const word of BANNED_KEYWORDS) {
    if (name.includes(word)) {
      return { pass: false, reason: `Запрещённое слово: ${word}` };
    }
  }

  // Ключевые слова NYC
  const hasNycKeyword = NYC_KEYWORDS.some(kw => name.includes(kw));
  if (!hasNycKeyword) {
    return { pass: false, reason: 'Нет NYC ключевых слов' };
  }

  // Бэклинки
  if (!domain.bl || domain.bl < MIN_BACKLINKS) {
    return { pass: false, reason: `Мало бэклинков: ${domain.bl} (минимум ${MIN_BACKLINKS})` };
  }

  // Год регистрации
  if (!domain.aby || domain.aby > MAX_REGISTRATION_YEAR) {
    return { pass: false, reason: `Год регистрации слишком новый: ${domain.aby} (максимум ${MAX_REGISTRATION_YEAR})` };
  }

  // Архивы Wayback
  if (!domain.acr || domain.acr < MIN_WAYBACK_SNAPSHOTS) {
    return { pass: false, reason: `Мало архивов Wayback: ${domain.acr} (минимум ${MIN_WAYBACK_SNAPSHOTS})` };
  }

  // Проверка Wayback (реальный сайт)
  if (!domain.wayback_clean) {
    return { pass: false, reason: 'Wayback: не реальный сайт или паркинг' };
  }

  return { pass: true, reason: 'OK' };
}

/**
 * Определяет нишу домена по ключевым словам
 * @param {string} domain
 * @returns {string}
 */
export function detectNiche(domain) {
  const name = domain.toLowerCase();

  if (name.match(/law|legal|attorney|lawyer|court/)) return 'Legal NYC';
  if (name.match(/real.?estate|realty|homes?|property|apartment/)) return 'Real Estate NYC';
  if (name.match(/restaurant|food|dine|eat|cuisine|kitchen/)) return 'Food & Dining NYC';
  if (name.match(/hotel|stay|lodg|inn|suite/)) return 'Hotels NYC';
  if (name.match(/health|medical|doctor|clinic|care/)) return 'Healthcare NYC';
  if (name.match(/tech|digital|web|app|software|dev/)) return 'Tech NYC';
  if (name.match(/finance|invest|money|fund|capital/)) return 'Finance NYC';
  if (name.match(/art|gallery|museum|culture|theater/)) return 'Arts & Culture NYC';
  if (name.match(/shop|store|boutique|market|buy/)) return 'Retail NYC';
  if (name.match(/news|media|press|journal|blog/)) return 'Media NYC';
  if (name.match(/sport|fitness|gym|yoga|run/)) return 'Sports & Fitness NYC';
  if (name.match(/tour|travel|guide|visit|trip/)) return 'Tourism NYC';
  if (name.match(/school|edu|college|learn|teach/)) return 'Education NYC';
  if (name.match(/brooklyn/)) return 'Brooklyn Local';
  if (name.match(/manhattan/)) return 'Manhattan Local';

  return 'NYC General';
}
