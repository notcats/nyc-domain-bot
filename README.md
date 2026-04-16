# 🏙️ NYC Domain Bot

Telegram бот для автоматического мониторинга истекающих доменов с NYC-тематикой. Бот каждые 30 минут проверяет expireddomains.net и GoDaddy Auctions, фильтрует домены по заданным критериям и отправляет находки в Telegram с кнопками управления.

## 🚀 Возможности

- **Автоматический мониторинг** каждые N минут (настраивается)
- **Два источника**: expireddomains.net + GoDaddy Auctions
- **Умная фильтрация** по бэклинкам, году, архивам Wayback и ключевым словам
- **Проверка Wayback Machine** — только реальные сайты, без паркингов
- **Кнопки управления** в Telegram: купить, пропустить, подробнее
- **SQLite база данных** — не повторяет уже просмотренные домены
- **Определение ниши** — Legal, Real Estate, Healthcare и т.д.

## 📦 Установка

```bash
# Клонировать репозиторий
git clone https://github.com/notcats/nyc-domain-bot.git
cd nyc-domain-bot

# Установить зависимости
npm install

# Настроить переменные окружения
cp .env.example .env
# Отредактировать .env своими значениями

# Запустить бота
npm start
```

## ⚙️ Переменные окружения

Создайте файл `.env` на основе `.env.example`:

| Переменная | Описание | Обязательна |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен бота от [@BotFather](https://t.me/BotFather) | ✅ |
| `TELEGRAM_CHAT_ID` | ID вашего чата или канала | ✅ |
| `EXPIRED_DOMAINS_LOGIN` | Логин на expireddomains.net | ⚠️ |
| `EXPIRED_DOMAINS_PASSWORD` | Пароль на expireddomains.net | ⚠️ |
| `CHECK_INTERVAL` | Интервал проверки в минутах (по умолчанию: 30) | ❌ |

> **Примечание:** `EXPIRED_DOMAINS_LOGIN` и `EXPIRED_DOMAINS_PASSWORD` необязательны — бот может работать без авторизации, но с ограниченным доступом к данным.

### Как получить TELEGRAM_CHAT_ID

1. Откройте [@userinfobot](https://t.me/userinfobot) в Telegram
2. Отправьте `/start`
3. Скопируйте ваш `Id`

## 🔍 Фильтры доменов

| Критерий | Значение |
|---|---|
| TLD | только `.com` |
| Бэклинки (BL) | минимум **15** |
| Год регистрации (ABY) | до **2018** включительно |
| Архивов Wayback (ACR) | минимум **10** |
| Ключевые слова | `nyc`, `newyork`, `new-york`, `manhattan`, `brooklyn` |
| Запрещённые слова | `parking`, `casino`, `pharma`, `adult`, `spam` |
| Wayback проверка | только реальные сайты (не паркинги) |

## 🤖 Команды бота

| Команда | Описание |
|---|---|
| `/start` | Запустить мониторинг |
| `/stop` | Остановить мониторинг |
| `/status` | Статус и статистика |
| `/found` | Список одобренных доменов |
| `/check domain.com` | Ручная проверка домена |
| `/settings` | Просмотр настроек фильтров |

## 📱 Формат уведомления

```
🌐 НОВЫЙ ДОМЕН НАЙДЕН

Домен: newyorkhealthlaw.com
📅 Год: 2013
🔗 Бэклинки: 24
📦 Архивов: 19
🏷️ Ниша: Legal NYC
💰 Цена: ~$45 (аукцион)
📊 Источник: expireddomains.net

🔍 Wayback: реальный сайт ✅
📌 История: Сайт активен 2013–2022

[✅ КУПИТЬ] [❌ ПРОПУСТИТЬ]
[🔍 ПОДРОБНЕЕ]
```

## 🚂 Деплой на Railway

1. **Fork** этого репозитория на GitHub

2. Перейдите на [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → выберите `nyc-domain-bot`

3. В разделе **Variables** добавьте переменные окружения:
   ```
   TELEGRAM_BOT_TOKEN=ваш_токен
   TELEGRAM_CHAT_ID=ваш_chat_id
   EXPIRED_DOMAINS_LOGIN=ваш_логин
   EXPIRED_DOMAINS_PASSWORD=ваш_пароль
   CHECK_INTERVAL=30
   ```

4. Railway автоматически задеплоит бота. Статус можно отслеживать во вкладке **Deployments**.

> **Совет:** Railway бесплатно даёт ~$5/месяц — этого достаточно для постоянной работы бота.

## 🗄️ База данных

SQLite база данных `domains.db` автоматически создаётся при первом запуске:

```sql
CREATE TABLE domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE,
  bl INTEGER,           -- бэклинки
  aby INTEGER,          -- год регистрации
  acr INTEGER,          -- архивов Wayback
  niche TEXT,           -- ниша домена
  status TEXT,          -- pending / approved / rejected
  wayback_clean INTEGER,-- 1 = реальный сайт
  source TEXT,          -- expireddomains / godaddy
  found_at DATETIME,
  decided_at DATETIME
);
```

## 🏗️ Структура проекта

```
nyc-domain-bot/
├── src/
│   ├── bot.js          # Telegram бот (telegraf)
│   ├── scraper.js      # Парсер expireddomains.net (puppeteer)
│   ├── godaddy.js      # Парсер GoDaddy Auctions (axios + cheerio)
│   ├── wayback.js      # Проверка Wayback Machine API
│   ├── filter.js       # Фильтрация доменов
│   ├── scheduler.js    # Cron-планировщик
│   └── db.js           # SQLite база данных
├── .env.example
├── .gitignore
├── package.json
├── Procfile
├── railway.toml
└── README.md
```

## 📋 Лицензия

MIT

