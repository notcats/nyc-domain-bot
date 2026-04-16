import 'dotenv/config';
import fs from 'fs';
import { Telegraf } from 'telegraf';
import {
  initDb, isDomainSeen, saveDomain, updateDomainStatus,
  getApprovedDomainsPage, getAllApprovedDomains,
  getStats, getDomainInfo, getDomainById,
  upsertUser, getUsers, removeUser,
} from './db.js';
import { filterDomain, detectNiche } from './filter.js';
import { getFilterConfig, updateFilterConfig, SETTING_KEYS } from './config.js';
import { checkWayback, getSnapshotCount } from './wayback.js';
import { scrapeExpiredDomains } from './scraper.js';
import { scrapeGoDaddy, getGoDaddyBuyLink, getGoDaddyAuctionLink } from './godaddy.js';
import { startScheduler, stopScheduler, isSchedulerRunning } from './scheduler.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('[bot] TELEGRAM_BOT_TOKEN не задан!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Инициализация БД
initDb();

// Если задан CHAT_ID в env — автоматически зарегистрировать его как пользователя
if (process.env.TELEGRAM_CHAT_ID) {
  upsertUser(process.env.TELEGRAM_CHAT_ID, 'env');
  console.log(`[bot] Зарегистрирован пользователь из env: ${process.env.TELEGRAM_CHAT_ID}`);
}

// ─── Уведомления ─────────────────────────────────────────────────────────────

/**
 * Отправляет сообщение всем зарегистрированным пользователям.
 * @param {string} text
 * @param {object} [extra]
 */
async function broadcast(text, extra = {}) {
  const users = getUsers();
  for (const chatId of users) {
    try {
      await bot.telegram.sendMessage(chatId, text, extra);
    } catch (err) {
      console.error(`[bot] Ошибка отправки пользователю ${chatId}:`, err.message);
    }
  }
}

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

/**
 * Inline-keyboard using the DB row id so callback_data stays well under 64 bytes.
 * @param {number} domainId
 */
function getDomainKeyboard(domainId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ КУПИТЬ', callback_data: `approve_${domainId}` },
        { text: '❌ ПРОПУСТИТЬ', callback_data: `reject_${domainId}` },
      ],
      [
        { text: '🔍 ПОДРОБНЕЕ', callback_data: `details_${domainId}` },
      ],
    ],
  };
}

/**
 * Inline-keyboard for /found pagination.
 * @param {number} page - current page (1-based)
 * @param {number} totalPages
 */
function getFoundKeyboard(page, totalPages) {
  const buttons = [];
  if (page > 1) buttons.push({ text: '⬅️ Назад', callback_data: `found_page_${page - 1}` });
  if (page < totalPages) buttons.push({ text: 'Вперёд ➡️', callback_data: `found_page_${page + 1}` });
  return buttons.length ? { inline_keyboard: [buttons] } : undefined;
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
    await broadcast(`⚠️ Ошибка парсинга expireddomains.net:\n${err.message}`).catch(() => {});
  }

  // Парсинг GoDaddy Auctions
  try {
    const godaddyDomains = await scrapeGoDaddy();
    allDomains.push(...godaddyDomains);
    console.log(`[bot] GoDaddy: ${godaddyDomains.length} доменов`);
  } catch (err) {
    console.error('[bot] Ошибка парсинга GoDaddy:', err.message);
    await broadcast(`⚠️ Ошибка парсинга GoDaddy:\n${err.message}`).catch(() => {});
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

      // Сохраняем домен и получаем его id
      const domainId = saveDomain({ ...domainData, status: 'pending' });
      if (!domainId) continue;

      // Отправляем в Telegram всем пользователям
      const message = formatDomainMessage(domainData);
      const users = getUsers();
      for (const chatId of users) {
        try {
          await bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: getDomainKeyboard(domainId),
          });
        } catch (err) {
          console.error(`[bot] Ошибка отправки домена ${domainData.domain} пользователю ${chatId}:`, err.message);
        }
      }

      sent++;
      console.log(`[bot] Отправлен домен: ${domainData.domain} (id=${domainId}) ✅`);

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

bot.action(/^approve_(\d+)$/, async (ctx) => {
  const domainId = parseInt(ctx.match[1]);
  try {
    const domainInfo = getDomainById(domainId);
    if (!domainInfo) {
      await ctx.answerCbQuery('Домен не найден');
      return;
    }
    const { domain } = domainInfo;
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
    console.error(`[bot] Ошибка approve для id ${domainId}:`, err.message);
    await ctx.answerCbQuery('Ошибка!');
  }
});

bot.action(/^reject_(\d+)$/, async (ctx) => {
  const domainId = parseInt(ctx.match[1]);
  try {
    const domainInfo = getDomainById(domainId);
    if (!domainInfo) {
      await ctx.answerCbQuery('Домен не найден');
      return;
    }
    updateDomainStatus(domainInfo.domain, 'rejected');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.answerCbQuery('❌ Домен пропущен');
    console.log(`[bot] Домен отклонён: ${domainInfo.domain}`);
  } catch (err) {
    console.error(`[bot] Ошибка reject для id ${domainId}:`, err.message);
    await ctx.answerCbQuery('Ошибка!');
  }
});

bot.action(/^details_(\d+)$/, async (ctx) => {
  const domainId = parseInt(ctx.match[1]);
  try {
    const domainInfo = getDomainById(domainId);
    if (!domainInfo) {
      await ctx.answerCbQuery('Домен не найден');
      return;
    }
    const { domain } = domainInfo;
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
    console.error(`[bot] Ошибка details для id ${domainId}:`, err.message);
    await ctx.answerCbQuery('Ошибка!');
  }
});

bot.action(/^found_page_(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  try {
    const { rows, total, totalPages } = getApprovedDomainsPage(page);
    if (!rows.length) {
      await ctx.answerCbQuery('Нет данных');
      return;
    }
    const lines = rows.map((d, i) =>
      `${(page - 1) * 10 + i + 1}. \`${d.domain}\` — ${d.niche || 'NYC'} (BL: ${d.bl || 0}, Год: ${d.aby || 'N/A'})`
    );
    const keyboard = getFoundKeyboard(page, totalPages);
    await ctx.editMessageText(
      `✅ *Одобренные домены (${total}):*\n\n` + lines.join('\n'),
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('[bot] Ошибка found_page:', err.message);
    await ctx.answerCbQuery('Ошибка!');
  }
});

// ─── Команды бота ──────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  console.log('[bot] Команда /start');
  // Register this user
  upsertUser(ctx.chat.id, ctx.from?.username || '');

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

bot.command('unsubscribe', async (ctx) => {
  console.log('[bot] Команда /unsubscribe');
  try {
    removeUser(ctx.chat.id);
    await ctx.reply('👋 Вы отписались от уведомлений. Отправьте /start чтобы подписаться снова.');
  } catch (err) {
    console.error('[bot] Ошибка /unsubscribe:', err.message);
    await ctx.reply('❌ Ошибка при отписке.');
  }
});

bot.command('status', async (ctx) => {
  console.log('[bot] Команда /status');
  try {
    const stats = getStats();
    const schedulerStatus = isSchedulerRunning() ? '✅ Работает' : '⏹️ Остановлен';
    const interval = process.env.CHECK_INTERVAL || 30;
    const users = getUsers();

    await ctx.reply(
      '�� *Статистика NYC Domain Bot*\n\n' +
      `🔄 Мониторинг: ${schedulerStatus}\n` +
      `⏰ Интервал: каждые ${interval} мин\n` +
      `👥 Пользователей: ${users.length}\n\n` +
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
    const { rows, total, totalPages } = getApprovedDomainsPage(1);
    if (rows.length === 0) {
      await ctx.reply('📭 Одобренных доменов пока нет.');
      return;
    }

    const lines = rows.map((d, i) =>
      `${i + 1}. \`${d.domain}\` — ${d.niche || 'NYC'} (BL: ${d.bl || 0}, Год: ${d.aby || 'N/A'})`
    );

    const keyboard = getFoundKeyboard(1, totalPages);
    await ctx.reply(
      `✅ *Одобренные домены (${total}):*\n\n` + lines.join('\n'),
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch (err) {
    console.error('[bot] Ошибка /found:', err.message);
    await ctx.reply('Ошибка получения списка доменов');
  }
});

bot.command('export', async (ctx) => {
  console.log('[bot] Команда /export');
  try {
    const approved = getAllApprovedDomains();
    if (approved.length === 0) {
      await ctx.reply('📭 Нет одобренных доменов для экспорта.');
      return;
    }

    const header = 'domain,bl,aby,acr,niche,source,wayback_clean,found_at,decided_at\n';
    const rows = approved.map(d =>
      `${d.domain},${d.bl ?? ''},${d.aby ?? ''},${d.acr ?? ''},"${d.niche ?? ''}",${d.source ?? ''},${d.wayback_clean ?? 0},${d.found_at ?? ''},${d.decided_at ?? ''}`
    ).join('\n');

    const tmpPath = '/tmp/approved_domains.csv';
    fs.writeFileSync(tmpPath, header + rows, 'utf8');

    await ctx.replyWithDocument(
      { source: tmpPath, filename: 'approved_domains.csv' },
      { caption: `📊 Экспорт: ${approved.length} одобренных доменов` }
    );
    fs.unlinkSync(tmpPath);
    console.log(`[bot] Экспорт: ${approved.length} доменов`);
  } catch (err) {
    console.error('[bot] Ошибка /export:', err.message);
    await ctx.reply(`❌ Ошибка экспорта: ${err.message}`);
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
  const cfg = getFilterConfig();
  await ctx.reply(
    '⚙️ *Текущие настройки фильтров:*\n\n' +
    '🌍 TLD: только `.com`\n' +
    `🔗 Минимум бэклинков: \`${cfg.MIN_BACKLINKS}\`\n` +
    `📅 Максимальный год: \`${cfg.MAX_REGISTRATION_YEAR}\`\n` +
    `📦 Минимум архивов Wayback: \`${cfg.MIN_WAYBACK_SNAPSHOTS}\`\n\n` +
    '🔑 *Ключевые слова:*\n' +
    '`nyc`, `newyork`, `new-york`, `manhattan`, `brooklyn`\n\n' +
    '🚫 *Запрещённые слова:*\n' +
    '`parking`, `casino`, `pharma`, `adult`, `spam`\n\n' +
    '📡 *Источники:*\n' +
    '• expireddomains.net\n' +
    '• GoDaddy Auctions\n\n' +
    '✏️ *Изменить настройку:*\n' +
    '`/setfilter minbl 20`\n' +
    '`/setfilter maxyear 2015`\n' +
    '`/setfilter minacr 15`',
    { parse_mode: 'Markdown' }
  );
});

bot.command('setfilter', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    await ctx.reply(
      '❌ Использование:\n' +
      '`/setfilter minbl <число>` — минимум бэклинков\n' +
      '`/setfilter maxyear <год>` — максимальный год регистрации\n' +
      '`/setfilter minacr <число>` — минимум архивов Wayback',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const [param, rawValue] = args;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    await ctx.reply('❌ Значение должно быть числом.');
    return;
  }

  const keyMap = {
    minbl: SETTING_KEYS.MIN_BACKLINKS,
    maxyear: SETTING_KEYS.MAX_REGISTRATION_YEAR,
    minacr: SETTING_KEYS.MIN_WAYBACK_SNAPSHOTS,
  };

  const key = keyMap[param.toLowerCase()];
  if (!key) {
    await ctx.reply('❌ Неизвестный параметр. Используйте: `minbl`, `maxyear`, `minacr`', { parse_mode: 'Markdown' });
    return;
  }

  const ok = updateFilterConfig(key, value);
  if (ok) {
    console.log(`[bot] Настройка ${key} изменена на ${value}`);
    await ctx.reply(`✅ Настройка \`${param}\` изменена на \`${value}\``, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ Не удалось сохранить настройку.');
  }
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
