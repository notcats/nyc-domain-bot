# 🏙️ NYC Domain Bot

Telegram бот для автоматического мониторинга истекающих доменов с NYC-тематикой. Бот каждые 30 минут проверяет expireddomains.net и GoDaddy Auctions, фильтрует домены по заданным критериям и отправляет находки в Telegram с кнопками управления.

## 🚀 Возможности

- **Автоматический мониторинг** каждые N минут (настраивается)
- **Два источника**: expireddomains.net + GoDaddy Auctions
- **Умная фильтрация** по бэклинкам, году, архивам Wayback и ключевым словам
- **Проверка Wayback Machine** — только реальные сайты, без паркингов
- **Retry-логика** — повторные HTTP-запросы при временных сбоях сети
- **Кнопки управления** в Telegram: купить, пропустить, подробнее
- **Пагинация** для списка одобренных доменов (`/found`)
- **Экспорт в CSV** командой `/export`
- **Настройка фильтров** прямо из Telegram (`/setfilter`)
- **Поддержка нескольких пользователей** — каждый, кто написал `/start`, получает уведомления
- **Уведомления об ошибках** — если парсер упал, бот сообщает об этом
- **SQLite база данных** — не повторяет уже просмотренные домены
- **Persistent storage** — путь к БД задаётся через `DB_PATH` (для Railway Volume)
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
| `TELEGRAM_CHAT_ID` | ID вашего чата (авторегистрация при `/start`) | ⚠️ |
| `EXPIRED_DOMAINS_LOGIN` | Логин на expireddomains.net | ❌ |
| `EXPIRED_DOMAINS_PASSWORD` | Пароль на expireddomains.net | ❌ |
| `CHECK_INTERVAL` | Интервал проверки в минутах (по умолчанию: 30) | ❌ |
| `DB_PATH` | Путь к файлу БД (по умолчанию: `domains.db` в корне) | ❌ |

> **Примечание:** `TELEGRAM_CHAT_ID` необязателен — бот регистрирует пользователей автоматически, когда они пишут `/start`. Если задан в env, регистрируется при старте автоматически.

### Как получить TELEGRAM_CHAT_ID

1. Откройте [@userinfobot](https://t.me/userinfobot) в Telegram
2. Отправьте `/start`
3. Скопируйте ваш `Id`

## 🔍 Фильтры доменов

| Критерий | Значение по умолчанию | Команда для изменения |
|---|---|---|
| TLD | только `.com` | — |
| Бэклинки (BL) | минимум **15** | `/setfilter minbl 20` |
| Год регистрации (ABY) | до **2018** включительно | `/setfilter maxyear 2015` |
| Архивов Wayback (ACR) | минимум **10** | `/setfilter minacr 15` |
| Ключевые слова | `nyc`, `newyork`, `new-york`, `manhattan`, `brooklyn` | — |
| Запрещённые слова | `parking`, `casino`, `pharma`, `adult`, `spam` | — |
| Wayback проверка | только реальные сайты (не паркинги) | — |

## 🤖 Команды бота

| Команда | Описание |
|---|---|
| `/start` | Запустить мониторинг и зарегистрировать пользователя |
| `/stop` | Остановить мониторинг |
| `/status` | Статус, статистика и число пользователей |
| `/found` | Список одобренных доменов (с пагинацией по 10 шт.) |
| `/export` | Скачать все одобренные домены в CSV |
| `/check domain.com` | Ручная проверка домена |
| `/settings` | Просмотр текущих настроек фильтров |
| `/setfilter minbl 20` | Изменить минимум бэклинков |
| `/setfilter maxyear 2015` | Изменить максимальный год регистрации |
| `/setfilter minacr 15` | Изменить минимум архивов Wayback |

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

3. В разделе **Variables** вашего сервиса добавьте переменные окружения:
   ```
   TELEGRAM_BOT_TOKEN=ваш_токен
   TELEGRAM_CHAT_ID=ваш_chat_id
   EXPIRED_DOMAINS_LOGIN=ваш_логин
   EXPIRED_DOMAINS_PASSWORD=ваш_пароль
   CHECK_INTERVAL=30
   DB_PATH=/data/domains.db
   ```

4. **Persistent storage** — чтобы база данных не сбрасывалась при каждом деплое:
   - Перейдите в **Service → Volumes**
   - Нажмите **Add Volume**, укажите Mount Path: `/data`
   - Убедитесь, что переменная `DB_PATH=/data/domains.db` добавлена в **Variables**

5. Railway автоматически задеплоит бота. Статус можно отслеживать во вкладке **Deployments**.

> **Важно:** Если вы видите предупреждения (⚠️) на Shared Variables, нажмите кнопку **SHARE** напротив каждой переменной, чтобы привязать их к вашему сервису. Либо добавляйте переменные сразу в **Service → Variables**, а не через Project Settings → Shared Variables.

> **Совет:** Railway бесплатно даёт ~$5/месяц — этого достаточно для постоянной работы бота.

## 🗄️ База данных

SQLite база данных создаётся автоматически при первом запуске.
По умолчанию — файл `domains.db` в корне проекта.
На Railway рекомендуется монтировать Volume и задать `DB_PATH=/data/domains.db`.

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

CREATE TABLE users (
  chat_id TEXT PRIMARY KEY,
  username TEXT,
  registered_at DATETIME
);

CREATE TABLE filter_settings (
  key TEXT PRIMARY KEY,
  value REAL NOT NULL
);
```

## 🧪 Тесты

```bash
npm test
```

Запускает тесты для `filter.js` и `wayback.js` без реальных HTTP-запросов (axios и config мокируются).

## 🏗️ Структура проекта

```
nyc-domain-bot/
├── src/
│   ├── bot.js          # Telegram бот (telegraf)
│   ├── config.js       # Динамические настройки фильтров
│   ├── scraper.js      # Парсер expireddomains.net (puppeteer)
│   ├── godaddy.js      # Парсер GoDaddy Auctions (axios + cheerio)
│   ├── wayback.js      # Проверка Wayback Machine API
│   ├── filter.js       # Фильтрация доменов
│   ├── scheduler.js    # Cron-планировщик
│   └── db.js           # SQLite база данных
├── tests/
│   ├── filter.test.js  # Тесты фильтрации
│   └── wayback.test.js # Тесты Wayback проверки
├── .env.example
├── .gitignore
├── package.json
├── Procfile
├── railway.toml
└── README.md
```

## 📋 Лицензия

MIT
