# TitanBot

A modular, feature-rich Discord community bot with economy, moderation, leveling, tickets, giveaways, verification, and more. Built with Discord.js v14 and PostgreSQL.

## Run & Operate

- **Start**: `node src/app.js`
- **Required secrets**: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`
- **Optional**: `TMDB_API_KEY` (for movie search), `SENTRY_DSN` (error tracking)

## Stack

- **Runtime**: Node.js 18+ (ESM modules, `"type": "module"`)
- **Discord**: discord.js v14, @discordjs/rest
- **Database**: PostgreSQL (via `pg`) with automatic in-memory fallback
- **Web**: Express v5 (health endpoints at `/health`, `/ready`, `/`)
- **Scheduler**: node-cron
- **Logging**: Winston + winston-daily-rotate-file
- **Validation**: Zod

## Where things live

- `src/app.js` — Main bot class and entrypoint
- `src/config/bot.js` — Bot-wide config (economy, tickets, embeds, messages)
- `src/config/postgres.js` — DB connection settings (reads PG* and POSTGRES_* env vars)
- `src/config/application.js` — Merged app config object
- `src/commands/` — Slash commands organized by category
- `src/events/` — Discord event handlers
- `src/handlers/` — Command/event/interaction loaders
- `src/services/` — Business logic (economy, tickets, giveaways, etc.)
- `src/utils/` — Shared utilities (database wrapper, logger, schemas, embeds)
- `scripts/` — DB backup/restore/migration scripts

## Architecture decisions

- **DB fallback**: If PostgreSQL is unavailable, bot falls back to in-memory storage automatically (data lost on restart, but bot stays online)
- **Schema auto-create**: Tables are created automatically on first connect via `autoCreateTables: true`
- **Port bridging**: `src/config/postgres.js` reads both `POSTGRES_*` and Replit's native `PG*` env vars
- **Corrupted bot.js recovered**: The original `src/config/bot.js` was corrupted on import; reconstructed from usage patterns across the codebase
- **Web server on port 5000**: Express health server runs on `0.0.0.0:5000` for Replit preview compatibility

## Product

- 99 slash commands across Economy, Moderation, Leveling, Tickets, Giveaways, Verification, Welcome, Voice, Fun, Utility, and more
- PostgreSQL-backed persistence with in-memory fallback
- Cron jobs: birthday checks (daily), giveaway checks (every minute), counter updates (every 15 min)

## User preferences

_Populate as you build_

## Gotchas

- `src/config/bot.js` was corrupted in the GitHub import (contained random example code); it has been reconstructed
- Discord credentials (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`) must be set as secrets
- The bot registers slash commands to the specific `GUILD_ID` guild on startup

## Pointers

- Discord.js v14 docs: https://discord.js.org/
- Replit DB skill: `.local/skills/database/SKILL.md`
