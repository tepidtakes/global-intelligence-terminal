# Security

## What this app is built for

A **personal research tool that runs on your own computer**. It is not hardened for use as
a public website. Out of the box:

- The server listens on `127.0.0.1` only, so other devices on your network cannot reach it.
- Passwords are hashed with scrypt; sessions are random tokens in an httpOnly, SameSite=Lax
  cookie (marked `Secure` when `NODE_ENV=production`).
- Failed logins are limited to 10 per 15 minutes per address and email.
- Uploaded attachments are stored under random names and always served as downloads.
- Obsidian vault sync (which reads and writes files on the server's disk) only answers
  requests made directly from the same computer — never through a reverse proxy.

## Settings (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface to listen on. Use `0.0.0.0` **only** behind an HTTPS reverse proxy. |
| `PORT` | `5180` | Port. |
| `ALLOW_SIGNUP` | on | Set to `0` after creating your account so nobody else can register. |
| `TERMINAL_VAULT` | `local` | Obsidian sync: `local` (same computer only), `off`, or `any` (single-user private machine only). |
| `CONTACT_EMAIL` | empty | Optional; sent in the User-Agent to SEC, Wikipedia and Wikidata, which ask API users for a contact. |
| `NODE_ENV` | — | `production` serves the built app and marks cookies `Secure`. |

## If you host it for other people

Read this first — the defaults assume one trusted user on one machine.

- Put it behind HTTPS (e.g. Caddy or nginx), set `HOST=0.0.0.0`, `NODE_ENV=production`,
  `ALLOW_SIGNUP=0` (or add invitations), and `TERMINAL_VAULT=off`.
- **Data licences change when you host.** Yahoo Finance, Google News RSS and the analyst
  estimates are fetched from unofficial endpoints whose terms allow personal use only.
  Replace them with licensed feeds before offering the app to others — see
  [DATA_SOURCES.md](DATA_SOURCES.md).
- The free UN Comtrade, SEC and Wikidata APIs have rate limits per server; many users
  share one server's quota.
- There is no admin panel, email verification, password reset or audit log.
- Storage is a local SQLite file (`data/terminal.db`); back it up. For multi-user hosting,
  move to PostgreSQL (`db/postgres-schema.sql`).

## Known dependency advisories (November 2026)

`npm audit` reports advisories that are fixed only in new major versions:

| Package | Severity | Effect here |
|---|---|---|
| `maplibre-gl` 4.x | critical | HTML sanitiser bypass in popups. The app builds map labels with `textContent`, not HTML, so it is not reachable today. Upgrade to 6.x planned. |
| `vite` 5.x / `esbuild` | high / moderate | Development server only (`npm run dev`). Mitigated by listening on 127.0.0.1. Not used by `npm start`. |
| `@tiptap/*` 2.x | moderate | Note editor attribute handling. Notes are private to their author; risk is limited to opening a crafted Markdown file from your own Obsidian vault. |
| `react-router-dom` 6.x | moderate | Open-redirect / SSR issues. The app uses only internal links and no server-side rendering. |

## Reporting a vulnerability

Please open a private security advisory on the repository (GitHub → Security → Report a
vulnerability) rather than a public issue.
