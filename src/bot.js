import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { scrapeExpiredDomains, debugScrape } from './scraper.js';
import { scrapeGodaddy, godaddyLink } from './godaddy.js';
import { checkWayback, waybackLink } from './wayback.js';
import { getMetrics } from './majestic.js';
import {
  insertDomain, domainExists, updateStatus, getApproved, getStats,
  getCustomWords, addCustomWord, removeCustomWord,
} from './db.js';
import { startScheduler, stopScheduler, isRunning } from './scheduler.js';

if (!process.env.BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN is not set');
  process.exit(1);
}

const bot     = new Bot(process.env.BOT_TOKEN);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function domainCard(domain, d, wb, m) {
  const year   = (d.aby > 0 ? d.aby : wb?.firstYear) || 'н/д';
  const mLine  = m
    ? `TF:${m.tf} | CF:${m.cf} | RD:${m.rd}`
    : (process.env.MAJESTIC_KEY ? 'TF: нет данных' : 'TF: [добавь MAJESTIC_KEY]');
  return [
    '🌐 *НОВЫЙ ДОМЕН НАЙДЕН*', '',
    `Домен: \`${domain}\``,
    `📅 Год: ${year}`,
    `📊 ${mLine}`,
    `📦 Архивов: ${d.acr || wb?.snapshots || 'н/д'}`,
    `🏷️ Ниша: ${d.niche || 'General NYC'}`,
    `📡 Источник: ${d.source}`,
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

async function sendDomain(domain, d, wb, m) {
  if (!CHAT_ID) return;
  await bot.api.sendMessage(CHAT_ID, domainCard(domain, d, wb, m), {
    parse_mode: 'Markdown',
    reply_markup: actionKeyboard(domain),
  });
}

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

  const minTF = process.env.MAJESTIC_KEY ? parseInt(process.env.MIN_TF || '10') : 0;

  let newCount = 0;
  for (const d of unique) {
    if (domainExists(d.domain)) continue;
    await new Promise(r => setTimeout(r, 2500));

    const wb  = await checkWayback(d.domain);
    const aby = d.aby || wb.firstYear || 0;
    const acr = d.acr || wb.snapshots  || 0;

    if (!wb.clean || acr < 3) {
      insertDomain({ ...d, aby, acr, status: 'rejected', wayback_clean: 0 });
      continue;
    }

    const m  = await getMetrics(d.domain);
    const tf = m?.tf || 0;

    if (minTF > 0 && tf < minTF) {
      console.log(`${d.domain}: TF=${tf} < MIN_TF=${minTF}, skip`);
      insertDomain({ ...d, aby, acr, tf, cf: m?.cf||0, rd: m?.rd||0, status: 'rejected', reason: `tf=${tf}` });
      continue;
    }

    const enriched = { ...d, aby, acr, tf, cf: m?.cf||0, rd: m?.rd||0 };
    insertDomain({ ...enriched, status: 'pending', wayback_clean: 1 });
    await sendDomain(d.domain, enriched, wb, m);
    newCount++;
  }
  console.log(`Scan complete. New: ${newCount}`);
  return newCount;
}

// ── Commands ───────────────────────────────────────────────────
bot.command('start', ctx => {
  startScheduler(runScan, parseInt(process.env.CHECK_INTERVAL) || 30);
  ctx.reply(
    '✅ Мониторинг запущен!\n\n' +
    '/stop — остановить\n' +
    '/scan — скан сейчас\n' +
    '/status — статус\n' +
    '/found — одобренные домены\n' +
    '/addword <слово> — добавить слово поиска\n' +
    '/words — список слов\n' +
    '/removeword <слово> — удалить слово\n' +
    '/check <домен> — проверить домен\n' +
    '/debug — диагностика'
  );
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
  await ctx.reply('🔬 Проверяю...');
  try {
    const lines = await debugScrape();
    ctx.reply(lines.join('\n'));
  } catch (e) {
    ctx.reply(`❌ ${e.message}`);
  }
});

bot.command('status', ctx => {
  const s     = getStats();
  const minTF = process.env.MAJESTIC_KEY ? parseInt(process.env.MIN_TF || '10') : null;
  ctx.reply([
    '📊 Статус бота',
    `Мониторинг: ${isRunning() ? '✅ активен' : '⏹ остановлен'}`,
    `Всего: ${s.total} | ✅ ${s.approved} | ❌ ${s.rejected} | ⏳ ${s.pending}`,
    `Majestic: ${process.env.MAJESTIC_KEY ? `✅ MIN_TF=${minTF}` : '❌ не настроен'}`,
    `Пользовательских слов: ${getCustomWords().length}`,
  ].join('\n'));
});

bot.command('found', ctx => {
  const list = getApproved();
  if (!list.length) return ctx.reply('Список пуст.');
  ctx.reply('✅ Одобренные:\n' + list.map(d => `${d.domain} TF:${d.tf ?? '?'} - ${d.niche}`).join('\n'));
});

bot.command('check', async ctx => {
  const domain = ctx.match?.toLowerCase().trim();
  if (!domain) return ctx.reply('Укажите домен: /check example.com');
  await ctx.reply(`🔍 Проверяю ${domain}...`);
  const [wb, m] = await Promise.all([checkWayback(domain), getMetrics(domain)]);
  ctx.reply([
    domain,
    `Wayback: ${wb.clean ? '✅ реальный' : '❌ ' + wb.reason}`,
    `Снимков: ${wb.snapshots} | Год: ${wb.firstYear || 'n/a'}`,
    m ? `TF:${m.tf} CF:${m.cf} RD:${m.rd}` : 'Majestic: не настроен',
    wb.snapshotUrl || '',
  ].filter(Boolean).join('\n'));
});

bot.command('addword', ctx => {
  const raw = ctx.match?.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
  if (!raw) return ctx.reply('Укажите слово: /addword dentist');
  const ok = addCustomWord(raw);
  if (!ok) return ctx.reply(`${raw} уже в списке.`);
  const examples = ['nyc', 'manhattan', 'brooklyn'].map(p => `${p}${raw}.com`).join(', ');
  ctx.reply(`✅ Добавлено: ${raw}\nБудут проверяться: ${examples} и др.`);
});

bot.command('words', ctx => {
  const words = getCustomWords();
  if (!words.length) return ctx.reply('Список пуст.\n/addword <слово> — добавить');
  ctx.reply('📝 Пользовательские слова:\n' + words.map(w => `• ${w}`).join('\n'));
});

bot.command('removeword', ctx => {
  const word = ctx.match?.toLowerCase().trim();
  if (!word) return ctx.reply('Укажите слово: /removeword dentist');
  const ok = removeCustomWord(word);
  ctx.reply(ok ? `🗑 ${word} удалён.` : `${word} не найден в списке.`);
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
    domain,
    `Wayback: ${waybackLink(domain)}`,
    `Majestic: https://majestic.com/reports/site-explorer?IndexDataSource=F&oq=${domain}`,
    `Ahrefs: https://ahrefs.com/website-authority-checker/?target=${domain}`,
    `GoDaddy: ${godaddyLink(domain)}`,
  ].join('\n'));
});

// ── Boot ──────────────────────────────────────────────────────
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
