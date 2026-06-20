# Cloudflare Pages Setup Guide

## Build Settings (in Cloudflare Pages Dashboard)

| Setting | Value |
|---|---|
| **Framework preset** | None |
| **Build command** | `pnpm run build:client` |
| **Build output directory** | `dist/public` |
| **Root directory** | *(leave blank)* |
| **Node.js version** | `22` |

---

## Environment Variables (in Cloudflare Pages → Settings → Environment Variables)

Set these for **Production** environment:

| Variable | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `VITE_FRONTEND_FORGE_API_KEY` | *(copy from Railway env vars)* |
| `VITE_FRONTEND_FORGE_API_URL` | *(copy from Railway env vars)* |

---

## How API Proxying Works

The file `client/public/_redirects` (included in the build output) tells Cloudflare Pages to:

1. **Proxy `/api/*`** → `https://dr-rania-clinic-production.up.railway.app/api/:splat` with status 200  
   This means all tRPC calls from the frontend go to Railway without CORS issues.

2. **SPA fallback** → Serve `index.html` for any route not matching a static file  
   This makes React Router work correctly on direct URL access (e.g. `/patients/123`).

---

## Custom Domain (drmousa.clinic)

1. In Cloudflare Pages → **Custom domains** → **Set up a custom domain**
2. Enter `drmousa.clinic`
3. Since the domain is already on Cloudflare DNS, it will auto-configure the CNAME record
4. SSL certificate is provisioned automatically

---

## Triggering a Redeploy

After pushing to GitHub (`main` branch), Cloudflare Pages auto-deploys.  
To manually trigger: Cloudflare Pages → Deployments → **Retry deployment** on the latest commit.
