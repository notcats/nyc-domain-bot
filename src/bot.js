import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { scrapeExpiredDomains, debugScrape } from './scraper.js';
import { scrapeGodaddy, godaddyLink } from './godaddy.js';
import { checkWayback, waybackLink } from './wayback.js';
import { insertDomain, domainExists, updateStatus, getApproved, getStats } from './db.js';
import { startScheduler, stopScheduler, isRunning } from './scheduler.js';

if (!process.env.BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN is not set');
  process.exit(1);
}

const bot    = new Bot(process.env.BOT_TOKEN);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── Helpers ────────────────────────────────────────────────────
function domainCard(domain, d, wb) {
  return [
    '🌐 *НОВЫЙ ДОМЕН НАЙДЕН*', '',
    `Домен: \`${domain}\``,
    `📅 Год: ${d.aby || 'н/д'}`,
    `🔗 Бэклинки: ${d.bl || 'н/д'}`,
    `📦 Архивов: ${d.acr || wb?.snapshots || 'н/д'}`,
    `🏷️ Ниша: ${d.niche || 'General NYC'}`,
    `💰 Цена: ${d.price || 'н/д'}`,
    `📊 Источник: ${d.source}`,
    '',
    `🔍 Wayback: ${wb?.clean ? 'реальный сайт ✅' : '⚠️ ' + (wb?.reason || 'не проверен')}`,
  ].join('\n');
}

function actionKeyboard(domain) {
  return new InlineKeyboard()
    .text('✅ КУПИТЬ',    `buy:${domain}`)
    .text('❌ ПРОПУСТИТЬ', `skip:${domain}`)
    .text('🔍 ПОДРОБНЕЕ',  `more:${domain}`);
}

async function sendDomain(domain, d, wb) {
  if (!CHAT_ID) return;
  await bot.api.sendMessage(CHAT_ID, domainCard(domain, d, wb), {
    parse_mode: 'Markdown',
    reply_markup: actionKeyboard(domain),
  });
}

// ── Scan job ───────────────────────────────────────────────────
async function runScan() {
  console.log(`[${new Date().toISOString()}] Scan started`);
  const all = [];

  try { all.push(...await scrapeExpiredDomains()); }
  catch (e) { console.error('ExpiredDomains error:', e.message); }

  try { all.push(...await scrapeGodaddy()); }
  catch (e) { console.error('GoDaddy error:', e.message); }

  const seen = new Set();
  const unique = all.filter(d => { if (seen.has(d.domain)) return false; seen.add(d.domain); return true; });

  console.log(`Candidates after dedup: ${unique.length}`);
  let newCount = 0;

  for (const d of unique) {
    if (domainExists(d.domain)) continue;
    await new Promise(r => setTimeout(r, 2500));

    const wb = await checkWayback(d.domain);
    if (!wb.clean) {
      insertDomain({ ...d, status: 'rejected', wayback_clean: 0 });
      continue;
    }

    insertDomain({ ...d, status: 'pending', wayback_clean: 1 });
    await sendDomain(d.domain, d, wb);
    newCount++;
  }
  console.log(`Scan complete. New domains sent: ${newCount}`);
  return newCount;
}

// ── Commands ───────────────────────────────────────────────────
bot.command('start', ctx => {
  startScheduler(runScan, parseInt(process.env.CHECK_INTERVAL) || 30);
  ctx.reply('✅ Мониторинг запущен! Проверка каждые 30 минут.\n\nКоманды:\n/stop — остановить\n/scan — запустить сканирование сейчас\n/status — статистика\n/found — одобренные домены\n/check <домен> — ручная проверка Wayback\n/debug — диагностика scrapers');
});

bot.command('stop', ctx => {
  stopScheduler();
  ctx.reply('⏹ Мониторинг остановлен.');
});

bot.command('scan', async ctx => {
  await ctx.reply('🔍 Запускаю сканирование...');
  try {
    const found = await runScan();
    const s = getStats();
    ctx.reply(`✅ Готово. Новых доменов отправлено: ${found}\nВсего в базе: ${s.total} | Одобрено: ${s.approved} | На рассмотрении: ${s.pending}`);
  } catch (e) {
    ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});

bot.command('debug', async ctx => {
  await ctx.reply('🔬 Проверяю scrapers... (займёт ~30 сек)');
  try {
    const lines = await debugScrape();
    ctx.reply('*Диагностика expireddomains.net:*\n' + lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (e) {
    ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});

bot.command('status', ctx => {
  const s = getStats();
  ctx.reply([
    '*📊 Статус бота*',
    `Мониторинг: ${isRunning() ? '✅ активен' : '⏹ остановлен'}`,
    `Всего найдено: ${s.total}`,
    `✅ Одобрено: ${s.approved}`,
    `❌ Отклонено: ${s.rejected}`,
    `⏳ На рассмотрении: ${s.pending}`,
  ].join('\n'), { parse_mode: 'Markdown' });
});

bot.command('found', ctx => {
  const list = getApproved();
  if (!list.length) return ctx.reply('Список одобренных доменов пуст.');
  const text = list.map(d => `• \`${d.domain}\` — ${d.niche}`).join('\n');
  ctx.reply(`✅ *Одобренные домены:*\n${text}`, { parse_mode: 'Markdown' });
});

bot.command('check', async ctx => {
  const domain = ctx.match?.toLowerCase().trim();
  if (!domain) return ctx.reply('Укажите домен: /check example.com');
  await ctx.reply(`🔍 Проверяю ${domain}…`);
  const wb = await checkWayback(domain);
  ctx.reply([
    `*${domain}*`,
    `Wayback: ${wb.clean ? '✅ реальный сайт' : '❌ ' + wb.reason}`,
    `Снимков: ${wb.snapshots}`,
    wb.snapshotUrl ? `[Открыть](${wb.snapshotUrl})` : '',
  ].filter(Boolean).join('\n'), { parse_mode: 'Markdown' });
});

// ── Callbacks ──────────────────────────────────────────────────
bot.callbackQuery(/^buy:(.+)$/, async ctx => {
  const domain = ctx.match[1];
  updateStatus(domain, 'approved');
  await ctx.answerCallbackQuery('Домен одобрен!');
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  ctx.reply(`✅ *${domain}* одобрен!\n[Купить на GoDaddy](${godaddyLink(domain)})`,
    { parse_mode: 'Markdown' });
});

bot.callbackQuery(/^skip:(.+)$/, async ctx => {
  const domain = ctx.match[1];
  updateStatus(domain, 'rejected');
  await ctx.answerCallbackQuery('Домен отклонён.');
  ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
});

bot.callbackQuery(/^more:(.+)$/, async ctx => {
  const domain = ctx.match[1];
  await ctx.answerCallbackQuery();
  ctx.reply([
    `🔍 *${domain}*`, '',
    `[Wayback Machine](${waybackLink(domain)})`,
    `[Ahrefs checker](https://ahrefs.com/website-authority-checker/?target=${domain})`,
    `[expireddomains.net](https://www.expireddomains.net/domain-name-search/?q=${domain})`,
    `[GoDaddy Auctions](${godaddyLink(domain)})`,
  ].join('\n'), { parse_mode: 'Markdown' });
});

// ── Boot ───────────────────────────────────────────────────────
if (CHAT_ID) {
  startScheduler(runScan, parseInt(process.env.CHECK_INTERVAL) || 30);
}

bot.start();
console.log('NYC Domain Bot запущен');

process.once('SIGINT',  () => bot.stop());
process.once('SIGTERM', () => bot.stop());
