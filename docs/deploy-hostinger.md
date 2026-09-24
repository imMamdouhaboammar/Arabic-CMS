# Deploying to Hostinger

This site is a server-rendered Astro app (`@astrojs/node`, standalone) with a
SQLite database and local media. That shapes which Hostinger products work.

## Pick the right plan

| Hostinger product | Works? | Notes |
|---|---|---|
| Premium / Single shared hosting | No | No persistent Node.js process |
| Business Web Hosting or Cloud (Node.js web app in hPanel) | Yes | Managed deploys from GitHub. Data must live outside the build directory (see below) |
| VPS (KVM) | Yes, recommended long term | Full control over disk, backups, process manager and Nginx |

Node.js **22.16 or later** is required (`engines.node` in `package.json`).

## The one rule that protects your content

Hostinger's managed Node.js apps build every deploy into a fresh directory
(`~/domains/<domain>/hbuilds/current/nodejs`, where `current` is re-pointed on
each deploy). The default `./data.db` and `./uploads` would sit inside that
directory, so **each deploy would start with an empty CMS and lose media**.

Set `CMS_DATA_DIR` to a folder outside the build, for example:

```
CMS_DATA_DIR=/home/<user>/domains/mamdouhaboammar.com/cms-data
```

The app creates `data.db` and `uploads/` inside it. Find the real home path in
hPanel → File Manager or with `pwd` over SSH.

## Hostinger managed Node.js app (Business / Cloud)

1. hPanel → Websites → Add website → **Node.js application**
2. Connect GitHub and choose `imMamdouhaboammar/Arabic-CMS`, branch `main`
3. Build settings
   - Package manager: **npm**
   - Build command: `npm run build`
   - Start command: `npm start` (entry file `dist/server/entry.mjs`)
   - Node.js version: **22** or **24**
4. Environment variables (applied to both build and runtime, persisted across deploys)
   - `SITE_URL=https://mamdouhaboammar.com`
   - `CMS_DATA_DIR=/home/<user>/domains/mamdouhaboammar.com/cms-data`
   - `EMDASH_ENCRYPTION_KEY=<output of: openssl rand -base64 32>`
5. Deploy, then open `https://mamdouhaboammar.com/_emdash/admin` and finish the
   setup wizard to create the admin account
6. Check `https://mamdouhaboammar.com/healthz` returns `{"status":"ok","database":"ok"}`

`PORT` and `HOST` are injected by the host. The start script does not override
them; locally they default to `0.0.0.0:3000` from `astro.config.mjs`.

`SITE_URL` and the `CMS_*` paths are read when the app is **built**. After
changing them, trigger a redeploy.

## VPS outline

```bash
# as a non-root deploy user
git clone https://github.com/imMamdouhaboammar/Arabic-CMS.git /srv/arabic-cms/app
cd /srv/arabic-cms/app
cp .env.example .env   # fill in SITE_URL, CMS_DATA_DIR=/srv/arabic-cms/data, EMDASH_ENCRYPTION_KEY
npm ci
set -a; . ./.env; set +a
npm run build
PORT=3000 npm start    # run under pm2 or systemd in practice
```

Put Nginx (or Caddy) in front for TLS and proxy to `127.0.0.1:3000`.
Keep `/srv/arabic-cms/data` on the same disk and include it in backups.

## After the first deploy

- Uptime monitor on `/healthz` (returns 503 if the database is unreachable)
- Submit `https://mamdouhaboammar.com/sitemap.xml` in Google Search Console
- Follow [backup and restore](backup-and-restore.md): database and uploads are
  one recovery unit, and `EMDASH_ENCRYPTION_KEY` is stored separately
