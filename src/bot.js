import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { initDb, isDomainSeen, saveDomain, updateDomainStatus, getApprovedDomains, getStats, getDomainInfo } from './db.js';
import { filterDomain, detectNiche } from './filter.js';
import { checkWayback, getSnapshotCount } from './wayback.js';
import { scrapeExpiredDomains } from './scraper.js';
import { scrapeGoDaddy, getGoDaddyBuyLink, getGoDaddyAuctionLink } from './godaddy.js';
import { startScheduler, stopScheduler, isSchedulerRunning } from './scheduler.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN) {
  console.error('[bot] TELEGRAM_BOT_TOKEN не задан!');
  process.exit(1);
}

if (!CHAT_ID) {
  console.error('[bot] TELEGRAM_CHAT_ID не задан!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Инициализация БД
initDb();

// ─── Форматирование сообщений ────────────────────────────────────────────────

function formatDomainMessage(domain) {
  const source = domain.source === 'godaddy' ? 'GoDaddy Auctions' : 'expireddomains.net';
  const waybackStatus = domain.wayback_clean ? 'реальный сайт ✅' : 'не проверен ⚠️';
  const price = domain.price ? `~${domain.price}` : '~$12 (регистрация)';

  return `🌐 *НОВЫЙ ДОМЕН НАЙДЕН*\n\n` +
    `Домен: \`${domain.domain}\`\n` +
    `📅 Год: ${domain.aby || 'N/A'}\n` +
    `🔗 Бэклинки: ${domain.bl || 0}\n` +
    `📦 Архивов: ${domain.acr || 0}\n` +
    `🏷️ Ниша: ${domain.niche || 'NYC General'}\n` +
    `💰 Цена: ${price} (аукцион)\n` +
    `📊 Источник: ${source}\n\n` +
    `🔍 Wayback: ${waybackStatus}\n` +
    `📌 История: ${domain.history || 'Нет данных'}`;
}

function getDomainKeyboard(domain) {
  return {
    inline_keyboard: [
      [
        { text: '✅ КУПИТЬ', callback_data: `approve_${domain}` },
        { text: '❌ ПРОПУСТИТЬ', callback_data: `reject_${domain}` },
      ],
      [
        { text: '🔍 ПОДРОБНЕЕ', callback_data: `details_${domain}` },
      ],
    ],
  };
}

// ─── Основная логика проверки доменов ────────────────────────────────────────

export async function checkDomains() {
  console.log('[bot] Начало проверки доменов...');

  let allDomains = [];

  // Парсинг expireddomains.net
  try {
    const expiredDomains = await scrapeExpiredDomains();
    allDomains.push(...expiredDomains);
    console.log(`[bot] expireddomains.net: ${expiredDomains.length} доменов`);
  } catch (err) {
    console.error('[bot] Ошибка парсинга expireddomains.net:', err.message);
  }

  // Парсинг GoDaddy Auctions
  try {
    const godaddyDomains = await scrapeGoDaddy();
    allDomains.push(...godaddyDomains);
    console.log(`[bot] GoDaddy: ${godaddyDomains.length} доменов`);
  } catch (err) {
    console.error('[bot] Ошибка парсинга GoDaddy:', err.message);
  }

  // Убираем дубликаты
  allDomains = Array.from(new Map(allDomains.map(d => [d.domain, d])).values());
  console.log(`[bot] Всего уникальных доменов: ${allDomains.length}`);

  let sent = 0;
  for (const domainData of allDomains) {
    try {
      // Пропускаем уже просмотренные
      if (isDomainSeen(domainData.domain)) {
        console.log(`[bot] Пропуск (уже в БД): ${domainData.domain}`);
        continue;
      }

      // Определяем нишу
      domainData.niche = detectNiche(domainData.domain);

      // Wayback проверка
      const wayback = await checkWayback(domainData.domain);
      domainData.wayback_clean = wayback.clean;
      domainData.acr = domainData.acr || wayback.snapshots;
      domainData.history = wayback.history;

      // Фильтрация
      const filter = filterDomain(domainData);
      if (!filter.pass) {
        console.log(`[bot] Отклонён (${filter.reason}): ${domainData.domain}`);
        saveDomain({ ...domainData, status: 'rejected' });
        continue;
      }

      // Сохраняем домен
      saveDomain({ ...domainData, status: 'pending' });

      // Отправляем в Telegram
      const message = formatDomainMessage(domainData);
      await bot.telegram.sendMessage(CHAT_ID, message, {
        parse_mode: 'Markdown',
        reply_markup: getDomainKeyboard(domainData.domain),
      });

      sent++;
      console.log(`[bot] Отправлен домен: ${domainData.domain} ✅`);

      // Задержка между отправками
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[bot] Ошибка обработки домена ${domainData.domain}:`, err.message);
    }
  }

  console.log(`[bot] Проверка завершена. Отправлено: ${sent} доменов`);
  return sent;
}

// ─── Callback обработчики ─────────────────────────────────────────────────────

bot.action(/^approve_(.+)$/, async (ctx) => {
  const domain = ctx.match[1];
  try {
    updateDomainStatus(domain, 'approved');
    const buyLink = getGoDaddyBuyLink(domain);
    const auctionLink = getGoDaddyAuctionLink(domain);

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(
      `✅ *Домен одобрен: ${domain}*\n\n` +
      `🛒 Купить на GoDaddy:\n${buyLink}\n\n` +
      `🏷️ Аукцион:\n${auctionLink}`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery('✅ Домен одобрен!');
    console.log(`[bot] Домен одобрен: ${domain}`);
  } catch (err) {
    console.error(`[bot] Ошибка approve для ${domain}:`, err.message);
    await ctx.answerCbQuery('Ошибка!');
  }
});

bot.action(/^reject_(.+)$/, async (ctx) => {
  const domain = ctx.match[1];
  try {
    updateDomainStatus(domain, 'rejected');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.answerCbQuery('❌ Домен пропущен');
    console.log(`[bot] Домен отклонён: ${domain}`);
  } catch (err) {
    console.error(`[bot] Ошибка reject для ${domain}:`, err.message);
    await ctx.answerCbQuery('Ошибка!');
  }
});

bot.action(/^details_(.+)$/, async (ctx) => {
  const domain = ctx.match[1];
  try {
    const domainInfo = getDomainInfo(domain);
    const waybackUrl = `https://web.archive.org/web/*/${domain}`;
    const ahrefsUrl = `https://ahrefs.com/site-explorer/overview/v2/subdomains/live?target=${domain}`;
    const expiredUrl = `https://www.expireddomains.net/domain-name-search/?q=${domain}`;

    const message =
      `🔍 *Подробнее: ${domain}*\n\n` +
      `📅 Год регистрации: ${domainInfo?.aby || 'N/A'}\n` +
      `🔗 Бэклинки: ${domainInfo?.bl || 0}\n` +
      `📦 Архивов Wayback: ${domainInfo?.acr || 0}\n` +
      `🏷️ Ниша: ${domainInfo?.niche || 'N/A'}\n` +
      `📊 Источник: ${domainInfo?.source || 'N/A'}\n` +
      `📈 Статус: ${domainInfo?.status || 'N/A'}\n\n` +
      `🕰️ Wayback Machine:\n${waybackUrl}\n\n` +
      `📊 Ahrefs (бесплатно):\n${ahrefsUrl}\n\n` +
      `🔎 ExpiredDomains:\n${expiredUrl}`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('🔍 Подробная информация');
    console.log(`[bot] Запрос подробностей: ${domain}`);
  } catch (err) {
    console.error(`[bot] Ошибка details для ${domain}:`, err.message);
    await ctx.answerCbQuery('Ошибка!');
  }
});

// ─── Команды бота ──────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  console.log('[bot] Команда /start');
  if (!isSchedulerRunning()) {
    startScheduler(checkDomains);
    await ctx.reply(
      '🚀 *NYC Domain Bot запущен!*\n\n' +
      `⏰ Проверка каждые ${process.env.CHECK_INTERVAL || 30} минут\n` +
      '🔍 Источники: expireddomains.net + GoDaddy Auctions\n\n' +
      'Используйте /status для статистики',
      { parse_mode: 'Markdown' }
    );
    // Запускаем первую проверку сразу
    checkDomains().catch(err => console.error('[bot] Ошибка первой проверки:', err.message));
  } else {
    await ctx.reply('⚠️ Мониторинг уже запущен. Используйте /status для статистики.');
  }
});

bot.command('stop', async (ctx) => {
  console.log('[bot] Команда /stop');
  if (isSchedulerRunning()) {
    stopScheduler();
    await ctx.reply('⏹️ Мониторинг остановлен.');
  } else {
    await ctx.reply('⚠️ Мониторинг не был запущен.');
  }
});

bot.command('status', async (ctx) => {
  console.log('[bot] Команда /status');
  try {
    const stats = getStats();
    const schedulerStatus = isSchedulerRunning() ? '✅ Работает' : '⏹️ Остановлен';
    const interval = process.env.CHECK_INTERVAL || 30;

    await ctx.reply(
      '📊 *Статистика NYC Domain Bot*\n\n' +
      `🔄 Мониторинг: ${schedulerStatus}\n` +
      `⏰ Интервал: каждые ${interval} мин\n\n` +
      `📦 Всего найдено: ${stats.total}\n` +
      `✅ Одобрено: ${stats.approved}\n` +
      `❌ Отклонено: ${stats.rejected}\n` +
      `⏳ На рассмотрении: ${stats.pending}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[bot] Ошибка /status:', err.message);
    await ctx.reply('Ошибка получения статистики');
  }
});

bot.command('found', async (ctx) => {
  console.log('[bot] Команда /found');
  try {
    const approved = getApprovedDomains();
    if (approved.length === 0) {
      await ctx.reply('📭 Одобренных доменов пока нет.');
      return;
    }

    const lines = approved.map((d, i) =>
      `${i + 1}. \`${d.domain}\` — ${d.niche || 'NYC'} (BL: ${d.bl || 0}, Год: ${d.aby || 'N/A'})`
    );

    await ctx.reply(
      `✅ *Одобренные домены (${approved.length}):*\n\n` + lines.join('\n'),
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[bot] Ошибка /found:', err.message);
    await ctx.reply('Ошибка получения списка доменов');
  }
});

bot.command('check', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const domain = args[0]?.toLowerCase().trim();

  if (!domain) {
    await ctx.reply('❌ Укажите домен: /check domain.com');
    return;
  }

  console.log(`[bot] Команда /check ${domain}`);
  await ctx.reply(`🔍 Проверяю домен: \`${domain}\`...`, { parse_mode: 'Markdown' });

  try {
    const niche = detectNiche(domain);
    const wayback = await checkWayback(domain);
    const snapshots = wayback.snapshots || await getSnapshotCount(domain);

    const domainData = {
      domain,
      bl: 0,
      aby: 0,
      acr: snapshots,
      niche,
      wayback_clean: wayback.clean,
      history: wayback.history,
    };

    const filterResult = filterDomain(domainData);
    const waybackUrl = `https://web.archive.org/web/*/${domain}`;

    await ctx.reply(
      `🌐 *Результат проверки: ${domain}*\n\n` +
      `🏷️ Ниша: ${niche}\n` +
      `📦 Снимков Wayback: ${snapshots}\n` +
      `🔍 Wayback: ${wayback.clean ? '✅ реальный сайт' : '❌ ' + wayback.reason}\n` +
      `📌 История: ${wayback.history}\n\n` +
      `🔎 Фильтр: ${filterResult.pass ? '✅ Прошёл' : '❌ ' + filterResult.reason}\n\n` +
      `🕰️ ${waybackUrl}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error(`[bot] Ошибка /check ${domain}:`, err.message);
    await ctx.reply(`❌ Ошибка проверки домена: ${err.message}`);
  }
});

bot.command('settings', async (ctx) => {
  console.log('[bot] Команда /settings');
  await ctx.reply(
    '⚙️ *Текущие настройки фильтров:*\n\n' +
    '🌍 TLD: только `.com`\n' +
    '🔗 Минимум бэклинков: `15`\n' +
    '📅 Максимальный год: `2018`\n' +
    '📦 Минимум архивов Wayback: `10`\n\n' +
    '🔑 *Ключевые слова:*\n' +
    '`nyc`, `newyork`, `new-york`, `manhattan`, `brooklyn`\n\n' +
    '🚫 *Запрещённые слова:*\n' +
    '`parking`, `casino`, `pharma`, `adult`, `spam`\n\n' +
    '📡 *Источники:*\n' +
    '• expireddomains.net\n' +
    '• GoDaddy Auctions',
    { parse_mode: 'Markdown' }
  );
});

// ─── Запуск бота ───────────────────────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error('[bot] Необработанная ошибка:', err.message);
});

process.on('SIGINT', () => {
  console.log('[bot] Получен SIGINT, завершение...');
  stopScheduler();
  bot.stop('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[bot] Получен SIGTERM, завершение...');
  stopScheduler();
  bot.stop('SIGTERM');
  process.exit(0);
});

console.log('[bot] Запуск NYC Domain Bot...');
bot.launch().then(() => {
  console.log('[bot] Бот успешно запущен ✅');
  // Автозапуск мониторинга при старте
  startScheduler(checkDomains);
  console.log('[bot] Мониторинг запущен. Отправьте /start в Telegram для управления.');
});
