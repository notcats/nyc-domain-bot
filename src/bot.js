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

const bot     = new Bot(process.env.BOT_TOKEN);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── Helpers ───────────────────────────────────────────────────
function domainCard(domain, d, wb) {
  const year = (d.aby > 0 ? d.aby : wb?.firstYear) || 'н/д';
  const bl   = d.bl  > 0 ? d.bl  : '[проверить]';
  return [
    '🌐 *НОВЫЙ ДОМЕН НАЙДЕН*', '',
    `Домен: \`${domain}\``,
    `📅 Год: ${year}`,
    `🔗 Бэклинки: ${bl}`,
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
    .text('✅ КУПИТь',     `buy:${domain}`)
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
  catch (e) { console.error('Scraper error:', e.message); }

  try { all.push(...await scrapeGodaddy()); }
  catch (e) { console.error('GoDaddy error:', e.message); }

  const seen = new Set();
  const unique = all.filter(d => { if (seen.has(d.domain)) return false; seen.add(d.domain); return true; });
  console.log(`Candidates: ${unique.length}`);

  let newCount = 0;
  for (const d of unique) {
    if (domainExists(d.domain)) continue;
    await new Promise(r => setTimeout(r, 2500));

    const wb = await checkWayback(d.domain);
    const aby = d.aby || wb.firstYear || 0;
    const acr = d.acr || wb.snapshots || 0;

    if (!wb.clean || acr < 3) {
      insertDomain({ ...d, aby, acr, status: 'rejected', wayback_clean: 0 });
      continue;
    }

    const enriched = { ...d, aby, acr };
    insertDomain({ ...enriched, status: 'pending', wayback_clean: 1 });
    await sendDomain(d.domain, enriched, wb);
    newCount++;
  }
  console.log(`Scan complete. New: ${newCount}`);
  return newCount;
}

// ── Commands ───────────────────────────────────────────────────
bot.command('start', ctx => {
  startScheduler(runScan, parseInt(process.env.CHECK_INTERVAL) || 30);
  ctx.reply('✅ Мониторинг запущен! Проверка каждые 30 минут.\n\n/stop — остановить\n/scan — запустить скан сейчас\n/status — статистика\n/found — одобренные\n/check <домен> — Wayback\n/debug — диагностика');
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
    ctx.reply(`✅ Готово. Новых: ${found} | Всего: ${s.total} | Одобр.: ${s.approved}`);
  } catch (e) {
    ctx.reply(`❌ ${e.message}`);
  }
});

bot.command('debug', async ctx => {
  await ctx.reply('🔬 Проверяю RDAP... (~30 сек)');
  try {
    const lines = await debugScrape();
    ctx.reply('Диагностика (RDAP):\n' + lines.join('\n'));
  } catch (e) {
    ctx.reply(`❌ ${e.message}`);
  }
});

bot.command('status', ctx => {
  const s = getStats();
  ctx.reply([
    '📊 Статус бота',
    `Мониторинг: ${isRunning() ? '✅ активен' : '⏹ остановлен'}`,
    `Всего: ${s.total} | ✅ ${s.approved} | ❌ ${s.rejected} | ⏳ ${s.pending}`,
  ].join('\n'));
});

bot.command('found', ctx => {
  const list = getApproved();
  if (!list.length) return ctx.reply('Список пуст.');
  ctx.reply('✅ Одобренные:\n' + list.map(d => `${d.domain} - ${d.niche}`).join('\n'));
});

bot.command('check', async ctx => {
  const domain = ctx.match?.toLowerCase().trim();
  if (!domain) return ctx.reply('Укажите домен: /check example.com');
  await ctx.reply(`🔍 Проверяю ${domain}...`);
  const wb = await checkWayback(domain);
  ctx.reply([
    `${domain}`,
    `Wayback: ${wb.clean ? '✅ реальный' : '❌ ' + wb.reason}`,
    `Снимков: ${wb.snapshots} | Первый год: ${wb.firstYear || 'n/a'}`,
    wb.snapshotUrl ? wb.snapshotUrl : '',
  ].filter(Boolean).join('\n'));
});

// ── Callbacks ──────────────────────────────────────────────────
bot.callbackQuery(/^buy:(.+)$/, async ctx => {
  const domain = ctx.match[1];
  updateStatus(domain, 'approved');
  await ctx.answerCallbackQuery('Одобрен!');
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  ctx.reply(`✅ ${domain} одобрен!\n${godaddyLink(domain)}`);
});

bot.callbackQuery(/^skip:(.+)$/, async ctx => {
  updateStatus(ctx.match[1], 'rejected');
  await ctx.answerCallbackQuery('Отклонён.');
  ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
});

bot.callbackQuery(/^more:(.+)$/, async ctx => {
  const domain = ctx.match[1];
  await ctx.answerCallbackQuery();
  ctx.reply([
    `${domain}`,
    `Wayback: ${waybackLink(domain)}`,
    `Ahrefs: https://ahrefs.com/website-authority-checker/?target=${domain}`,
    `GoDaddy: ${godaddyLink(domain)}`,
  ].join('\n'));
});

// ── Boot (with 409 conflict retry) ─────────────────────────────────
if (CHAT_ID) {
  startScheduler(runScan, parseInt(process.env.CHECK_INTERVAL) || 30);
}

process.once('SIGINT',  () => bot.stop());
process.once('SIGTERM', () => bot.stop());

console.log('NYC Domain Bot запускается...');

const startWithRetry = async (attempt = 0) => {
  try {
    if (attempt > 0) await new Promise(r => setTimeout(r, 5000 * attempt));
    await bot.start();
  } catch (err) {
    if (err.error_code === 409 && attempt < 5) {
      console.log(`Conflict 409, retry ${attempt + 1}/5 in ${5 * (attempt + 1)}s...`);
      return startWithRetry(attempt + 1);
    }
    console.error('Fatal bot error:', err);
    process.exit(1);
  }
};

startWithRetry();
