# CLAUDE.md — NYC Domain Bot

AI guidance for working with the NYC Domain Bot codebase.

## What This App Is

**NYC Domain Bot** is a Telegram bot that monitors `.nyc` (and NYC-related) domain expiration dates via WHOIS. Users add domains to a personal watchlist; the bot checks WHOIS daily at 06:00 UTC and sends reminders when a domain expires within 30 days.

## Repository Structure

```
nyc-domain-bot/
├── bot.js             # Entry point — grammY bot, commands, daily scheduler
├── package.json
├── railway.toml       # Railway deployment config
├── .env.example
└── src/
    ├── whois.js       # WHOIS lookup logic (lookupDomain)
    └── store.js       # Persistent per-chat domain lists
```

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM — `import` syntax) |
| Telegram | grammY |
| WHOIS | Custom `src/whois.js` |
| Storage | `src/store.js` (file-based JSON, Railway Volume) |
| Deploy | Railway (`railway.toml`) |

## Bot Commands

| Command | Description |
|---|---|
| `/start` / `/help` | Show help message |
| `/add <domain>` | Add domain to watchlist + immediate WHOIS check |
| `/list` | Show all watched domains with expiry status |
| `/check <domain>` | One-off WHOIS lookup |
| `/remove <domain>` | Remove domain from watchlist |

## Domain Status Colours

- 🟢 > 30 days remaining
- 🟡 ≤ 30 days remaining
- 🔴 ≤ 7 days remaining or already expired

## Daily Check

Runs every minute via `setInterval`; fires the real check at 06:00 UTC once per calendar day. Sends reminder for any domain with 0–30 days left.

## Environment Variables

```
BOT_TOKEN=...              # From @BotFather
TELEGRAM_CHAT_ID=...       # Default notification chat (optional)
CHECK_INTERVAL=30          # Minutes between active scans (optional)
DATA_PATH=/data            # Railway Volume path for persistent store
```

## Development Workflow

```bash
npm install
cp .env.example .env
# Fill in BOT_TOKEN
node bot.js
```

## Deploy (Railway)

1. Fork repo → Railway → Deploy from GitHub
2. Add env vars (see above)
3. Add a Railway Volume mounted at `/data` so the domain store survives redeploys
4. Railway runs `node src/bot.js` per `railway.toml`

## Conventions

1. ESM modules throughout (`import`/`export`) — do not mix with `require`.
2. All domain names are lowercased before storage and lookup.
3. `store.js` is the only persistence layer — keep it simple (JSON file).
4. Never hardcode `BOT_TOKEN` — always read from `process.env`.
