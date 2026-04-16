# 🏙️ NYC Domain Bot

Telegram бот для мониторинга истекающих NYC-доменов на аукционах.

## Что делает

Каждые 30 минут:
1. Парсит **expireddomains.net** — фильтрует по BL ≥ 15, год ≤ 2018, ACR ≥ 10, TLD `.com`, ключевые слова NYC
2. Парсит **GoDaddy Auctions** — ищет NYC-домены
3. Проверяет каждый домен через **Wayback Machine API** — отсеивает парковки и «domain for sale»
4. Отправляет карточку домена в Telegram с кнопками **✅ КУПИТЬ / ❌ ПРОПУСТИТЬ / 🔍 ПОДРОБНЕЕ**

## Команды

| Команда | Описание |
|---------|----------|
| `/start` | Запустить мониторинг |
| `/stop` | Остановить мониторинг |
| `/status` | Статистика (найдено / одобрено / отклонено) |
| `/found` | Список одобренных доменов |
| `/check <домен>` | Ручная проверка домена через Wayback |

## Deploy на Railway

1. Fork this repo
2. **railway.app** → New Project → Deploy from GitHub → выбрать этот репо
3. Добавить переменные окружения (Variables):

| Переменная | Описание |
|-----------|----------|
| `BOT_TOKEN` | Токен бота от @BotFather |
| `TELEGRAM_CHAT_ID` | ID чата для уведомлений (`/start` в @userinfobot) |
| `EXPIRED_DOMAINS_LOGIN` | Логин на expireddomains.net (опционально) |
| `EXPIRED_DOMAINS_PASSWORD` | Пароль на expireddomains.net (опционально) |
| `CHECK_INTERVAL` | Интервал проверки в минутах (по умолчанию 30) |
| `DATA_PATH` | Путь для Railway Volume (напр. `/data`) — чтобы БД не терялась |

4. Railway автоматически задеплоит и запустит `node src/bot.js`

## Локальный запуск

```bash
npm install
cp .env.example .env
# Заполнить .env
node src/bot.js
```
