import 'dotenv/config';
import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import { lookupDomain } from './src/whois.js';
import store from './src/store.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

const HELP = [
  '🏙️ *NYC Domain Bot*',
  '',
  'Слежу за датами истечения ваших доменов и предупреждаю заранее.',
  '',
  'Команды:',
  '/add `<домен>` — добавить домен',
  '/list — список доменов с датами',
  '/check `<домен>` — разовая проверка',
  '/remove `<домен>` — убрать домен',
].join('\n');

function daysUntil(date) {
  return Math.ceil((date - Date.now()) / 86400000);
}

function formatInfo(domain, info) {
  if (!info.expiry) return `❓ *${domain}*\nДата истечения не найдена в WHOIS`;
  const days = daysUntil(info.expiry);
  const dateStr = info.expiry.toISOString().split('T')[0];
  const emoji = days < 0 ? '🔴' : days <= 7 ? '🔴' : days <= 30 ? '🟡' : '🟢';
  const label = days < 0 ? 'истёк' : days === 0 ? 'истекает сегодня' : `через ${days} дн.`;
  return `${emoji} *${domain}*\n📅 ${dateStr} (${label})`;
}

bot.start(ctx => ctx.replyWithMarkdown(HELP));
bot.help(ctx => ctx.replyWithMarkdown(HELP));

bot.command('check', async ctx => {
  const domain = ctx.message.text.split(' ')[1]?.toLowerCase().trim();
  if (!domain) return ctx.reply('Укажите домен: /check example.nyc');
  await ctx.reply(`🔍 Проверяю ${domain}…`);
  try {
    const info = await lookupDomain(domain);
    ctx.replyWithMarkdown(formatInfo(domain, info));
  } catch (e) {
    ctx.reply(`❌ Ошибка WHOIS: ${e.message}`);
  }
});

bot.command('add', async ctx => {
  const domain = ctx.message.text.split(' ')[1]?.toLowerCase().trim();
  if (!domain) return ctx.reply('Укажите домен: /add example.nyc');
  const chatId = String(ctx.chat.id);
  if (store.getDomains(chatId).includes(domain))
    return ctx.reply(`${domain} уже в списке.`);
  store.addDomain(chatId, domain);
  await ctx.reply(`✅ ${domain} добавлен. Проверяю WHOIS…`);
  try {
    const info = await lookupDomain(domain);
    ctx.replyWithMarkdown(formatInfo(domain, info));
  } catch (e) {
    ctx.reply(`⚠️ Домен добавлен, но WHOIS недоступен: ${e.message}`);
  }
});

bot.command('list', async ctx => {
  const chatId = String(ctx.chat.id);
  const domains = store.getDomains(chatId);
  if (!domains.length)
    return ctx.reply('Список пуст. Добавьте домен: /add example.nyc');
  await ctx.reply(`⏳ Проверяю ${domains.length} дом. через WHOIS…`);
  const lines = await Promise.all(
    domains.map(async d => {
      try { return formatInfo(d, await lookupDomain(d)); }
      catch { return `❓ *${d}* — WHOIS недоступен`; }
    })
  );
  ctx.replyWithMarkdown(lines.join('\n\n'));
});

bot.command('remove', ctx => {
  const domain = ctx.message.text.split(' ')[1]?.toLowerCase().trim();
  if (!domain) return ctx.reply('Укажите домен: /remove example.nyc');
  const chatId = String(ctx.chat.id);
  if (store.removeDomain(chatId, domain)) {
    ctx.reply(`🗑️ ${domain} удалён из списка.`);
  } else {
    ctx.reply(`${domain} не найден в вашем списке.`);
  }
});

cron.schedule('0 6 * * *', async () => {
  const allChats = store.getAllChats();
  for (const [chatId, domains] of Object.entries(allChats)) {
    for (const domain of domains) {
      try {
        const info = await lookupDomain(domain);
        if (!info.expiry) continue;
        const days = daysUntil(info.expiry);
        if (days >= 0 && days <= 30) {
          await bot.telegram.sendMessage(
            chatId,
            `⚠️ *Напоминание!*\n${formatInfo(domain, info)}`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch { /* продолжаем цикл при ошибке одного домена */ }
    }
  }
});

bot.launch();
console.log('NYC Domain Bot запущен');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
