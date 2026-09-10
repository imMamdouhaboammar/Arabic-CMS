# Arabic-CMS

Arabic-first RTL technical publication CMS built on [EmDash](https://github.com/emdash-cms/emdash) and Astro. This repository is no longer the upstream EmDash blog template: the public site ships Arabic locale defaults, IBM Plex Sans Arabic typography, and seed content for an architecture / developer-productivity publication.

Seeded site identity (from `seed/seed.json` / `metadata.json`):

- **Name:** مدونة عربية تقنية
- **Focus:** software architecture, engineering thinking, and developer productivity
- **Author byline:** ممدوح أبو عمار

## What works today

- Server-rendered public routes (`output: "server"`) with the Astro Node standalone adapter
- Arabic-only i18n (`defaultLocale: "ar"`) and Arabic font scripting through EmDash
- Homepage, post archive, single posts, category/tag archives, search, static pages, RSS, and Arabic 404/500 pages
- Local SQLite content (`data.db`) and local media (`uploads/`)
- EmDash admin UI, audit-log plugin, dark/light theme, SEO metadata / JSON-LD helpers already present in the template surface
- Repository Quality CI on Node 22: `npm ci`, `npm test`, `npm run typecheck`, `npm run build`

## Intentional limits

- No Cloudflare / D1 / R2 variant in this repo (remove upstream template links that pointed at sibling templates)
- Backup *automation* for SQLite + uploads is tracked separately (see `docs/backup-and-restore.md` and open Issue #15 / PR #124)
- Canonical package-manager enforcement is still an open product decision (Issue #114 / #115); CI currently installs with **npm** via `package-lock.json`

## Routes

| Page | Route |
|---|---|
| Homepage | `/` |
| All posts | `/posts` |
| Single post | `/posts/:slug` |
| Category archive | `/category/:slug` |
| Tag archive | `/tag/:slug` |
| Search | `/search` |
| Static pages | `/pages/:slug` |
| RSS | `/rss.xml` |
| Admin | `/_emdash/admin` |
| 404 / 500 | fallback pages |

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22 (Quality workflow) |
| Framework | Astro + `@astrojs/node` (standalone) |
| CMS | EmDash (`emdash`, `@emdash-cms/plugin-audit-log`) |
| Database | SQLite (`file:./data.db`) |
| Media | Local filesystem (`./uploads`) |
| UI fonts | IBM Plex Sans Arabic + JetBrains Mono |

## Setup

```bash
npm ci
npm run dev
```

- Site: http://localhost:3000
- Admin: http://localhost:3000/_emdash/admin

Copy `.env.example` before enabling session encryption. Keep `EMDASH_ENCRYPTION_KEY` private.

Production-style start after a build:

```bash
npm run build
npm start
```

## Verification

Match the Quality workflow:

```bash
npm test
npm run typecheck
npm run build
```

## Repository map

| Path | Purpose |
|---|---|
| `astro.config.mjs` | Arabic locale, EmDash SQLite/local storage, fonts, audit-log plugin |
| `seed/seed.json` | Schema + Arabic demo content |
| `src/pages/` | Public SSR routes |
| `src/layouts/` | Shared EmDash layout wiring |
| `docs/backup-and-restore.md` | SQLite + uploads recovery contract |
| `tests/` | Node test runner coverage |
| `AGENTS.md` | Agent working notes for EmDash |

## Ops notes

SQLite content and local media are one recovery boundary. Read [backup and restore](docs/backup-and-restore.md) before inventing backup/restore steps.

## Upstream

EmDash is the CMS dependency and docs source: https://github.com/emdash-cms/emdash and https://docs.emdashcms.com. This fork’s product surface is Arabic-CMS, not the generic blog template marketing page.

