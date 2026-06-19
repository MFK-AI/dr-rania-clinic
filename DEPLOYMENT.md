# Dr. Rania Patient Intelligence Assistant — Deployment Guide

**Stack:** React 19 + Express 4 + tRPC 11 + Drizzle ORM + MySQL (TiDB)  
**Target:** Railway (backend + DB) + Netlify (frontend) + drmousa.clinic

---

## 1. Prerequisites

| Tool | Purpose |
|---|---|
| [Railway](https://railway.app) account | Backend hosting + MySQL database |
| [Netlify](https://netlify.com) account (MFK-infinity) | Frontend static hosting |
| GitHub repo `MFK-AI/dr-rania-clinic` | Source code |
| Domain `drmousa.clinic` | Custom domain (DNS at registrar) |

---

## 2. Railway — Backend + Database

### 2a. Create a new Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Select **Deploy from GitHub repo** → connect `MFK-AI/dr-rania-clinic`
3. Railway will detect the Node.js app automatically

### 2b. Add a MySQL database

1. In your Railway project, click **+ New** → **Database** → **MySQL**
2. Once provisioned, click the MySQL service → **Variables** tab
3. Copy the `MYSQL_URL` connection string (format: `mysql://user:pass@host:port/dbname`)

### 2c. Set environment variables

In the Railway service (the Node.js app), go to **Variables** and add:

```
DATABASE_URL=<paste MYSQL_URL from step 2b>
JWT_SECRET=<generate a random 64-char string, e.g. openssl rand -hex 32>
NODE_ENV=production
PORT=3000

# Manus Built-in APIs (AI / voice / storage)
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=<copy from Manus project secrets>
VITE_FRONTEND_FORGE_API_KEY=<copy from Manus project secrets>
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im

# Telegram
TELEGRAM_BOT_TOKEN=8428776079:AAEVYptUF4m5JiBCFGShxVPdfNu_tsRAUZI
TELEGRAM_CHAT_ID=1250323159

# Google Sheets / Calendar (gws CLI must be pre-authenticated — see note below)
# These are handled by the gws CLI credentials file, not env vars
```

> **Note on Google Sheets/Calendar:** The `gws` CLI uses a credentials file at `~/.gws/credentials.json`. On Railway, you must either:
> - Store the credentials JSON as an env var `GWS_CREDENTIALS_JSON` and write it to disk on startup, **or**
> - Use a Google Service Account with the Sheets/Calendar APIs enabled and share the sheet/calendar with the service account email.

### 2d. Run database migrations

After the first deploy, open a Railway shell and run:

```bash
pnpm drizzle-kit push
```

Or apply the SQL from `drizzle/migrations/` manually via the Railway MySQL console.

### 2e. Seed Dr. Rania's admin account

Run this SQL in the Railway MySQL console (replace the hash if you want a different password):

```sql
INSERT INTO users (openId, name, email, passwordHash, loginMethod, role, isActive, lastSignedIn)
VALUES (
  'local_dr_rania_admin',
  'Dr. Rania Khalil',
  'dr.raniakhalil83@gmail.com',
  '$2b$12$YNbXFFRsLjTlFp10K0eU9u3HN4IJRUUiB8B1MSfs2d3qdJIFRVLvO',
  'password',
  'doctor',
  1,
  NOW()
) ON DUPLICATE KEY UPDATE passwordHash = VALUES(passwordHash), role = 'doctor', isActive = 1;
```

**Initial password:** `DrRania2026!` — change it after first login.

### 2f. Get the Railway backend URL

After deploy, Railway gives you a URL like:  
`https://dr-rania-clinic-production.up.railway.app`

Save this — you'll need it for Netlify.

---

## 3. Netlify — Frontend

### 3a. Connect the repo

1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
2. Select `MFK-AI/dr-rania-clinic`
3. Set build settings:

| Setting | Value |
|---|---|
| **Base directory** | *(leave blank)* |
| **Build command** | `pnpm run build` |
| **Publish directory** | `dist` |

### 3b. Set environment variables in Netlify

Go to **Site settings → Environment variables** and add:

```
VITE_FRONTEND_FORGE_API_KEY=<same as Railway>
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
VITE_APP_ID=<your Manus app ID>
```

### 3c. Add the `_redirects` file (SPA routing)

Create `client/public/_redirects` with:

```
/*  /index.html  200
```

This ensures all routes (e.g. `/patients`, `/login`) are handled by the React app.

### 3d. Set the API proxy

Since the frontend and backend are on different domains, you need to proxy `/api` calls to Railway. Add a `netlify.toml` at the project root:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://dr-rania-clinic-production.up.railway.app/api/:splat"
  status = 200
  force = true
```

Replace the Railway URL with your actual backend URL.

---

## 4. Custom Domain — drmousa.clinic

### 4a. Point DNS to Netlify

At your domain registrar (where drmousa.clinic is registered), update the DNS records:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | `75.2.60.5` |
| `CNAME` | `www` | `<your-netlify-site>.netlify.app` |

Netlify's load balancer IP is `75.2.60.5`. DNS propagation takes 15 min – 48 hours.

### 4b. Add domain in Netlify

1. **Site settings → Domain management → Add custom domain**
2. Enter `drmousa.clinic` and `www.drmousa.clinic`
3. Netlify will auto-provision a free SSL certificate via Let's Encrypt

---

## 5. Daily 7AM Sync Cron Job

The endpoint `/api/scheduled/daily-sync` runs the Google Sheets full sync + Telegram morning summary.

On Railway, set up a cron job (or use a free service like [cron-job.org](https://cron-job.org)):

- **URL:** `https://dr-rania-clinic-production.up.railway.app/api/scheduled/daily-sync`
- **Method:** `POST`
- **Schedule:** `0 3 * * *` (3:00 AM UTC = 7:00 AM Dubai / UTC+4)

---

## 6. Environment Variables Summary

| Variable | Where | Description |
|---|---|---|
| `DATABASE_URL` | Railway | MySQL connection string |
| `JWT_SECRET` | Railway | 64-char random secret for JWT signing |
| `NODE_ENV` | Railway | Set to `production` |
| `PORT` | Railway | Set to `3000` (or Railway sets it automatically) |
| `BUILT_IN_FORGE_API_URL` | Railway | Manus AI API base URL |
| `BUILT_IN_FORGE_API_KEY` | Railway | Manus AI API key (server-side) |
| `TELEGRAM_BOT_TOKEN` | Railway | `8428776079:AAEVYptUF4m5JiBCFGShxVPdfNu_tsRAUZI` |
| `TELEGRAM_CHAT_ID` | Railway | `1250323159` |
| `VITE_FRONTEND_FORGE_API_KEY` | Railway + Netlify | Manus AI API key (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | Railway + Netlify | Manus AI API base URL |

---

## 7. First Login

After deployment:

1. Go to `https://drmousa.clinic/login`
2. Email: `dr.raniakhalil83@gmail.com`
3. Password: `DrRania2026!`
4. Navigate to **Admin Settings → Change Password** to set a permanent password

---

## 8. Adding Staff Accounts

From the Admin Settings page (doctor role only), use the **Create Staff Account** form to add assistants. Alternatively, call the tRPC endpoint `auth.createStaff` with `{ name, email, password, role }`.
