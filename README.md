# Estate Agency — Technical Case

A full-stack application that automates the post-agreement lifecycle of a real-estate transaction (earnest money → title deed → completed) and automatically distributes the service fee between the agency and the agents involved.

## Repositories / Folders

| Project        | Purpose                                            | Stack |
|----------------|----------------------------------------------------|-------|
| **backend/**   | REST API, commission engine, MongoDB persistence   | NestJS 11, MongoDB Atlas, Mongoose, Jest |
| **frontend/**  | Dashboard + transaction UI + agent reports        | Nuxt 3, Pinia, Tailwind CSS v4 |

## Live deployment

| Resource | URL |
|----------|-----|
| **Frontend (Vercel)** | <https://estate-agency-azure.vercel.app> |
| **API (Render)** | <https://estate-agency-api.onrender.com> |
| **Swagger** | <https://estate-agency-api.onrender.com/api/docs> |

Replace the API host in this table if your Render service uses a different hostname. The frontend must have `NUXT_PUBLIC_API_BASE` set to that API origin (no trailing slash), and Render’s `FRONTEND_ORIGIN` must list the Vercel URL above for CORS.

> **Cold start notice.** The Render backend runs on the free plan and sleeps after 15 minutes of inactivity. The first request after idle takes ~30–60 seconds while the container wakes up; subsequent requests are instant. Upgrade to the $7/mo starter plan to eliminate this.

### Automatic live updates from GitHub

You do **not** need extra deploy scripts in this repo for production to track Git: connect each host to the **same GitHub repository** once, then every `git push` to the configured branch rebuilds and rolls out automatically.

| Host | What to verify |
|------|----------------|
| **Render (API)** | Service was created from this repo (Blueprint or Git-backed web service). **Settings → Build & Deploy → Auto-Deploy** should be **On** for your production branch (e.g. `main`). `backend/render.yaml` already sets `autoDeploy: true` for blueprint-created services. |
| **Vercel (frontend)** | Same GitHub repo must be **connected** under **Settings → Git**. **Root Directory** = `frontend`. **Production Branch** must match the branch you push to (often `main`). With that, every push to that branch starts a **Production Deployment** automatically — check **Deployments** in the Vercel dashboard. Do not use “Ignored Build Step” to skip all builds unless you mean to. |

After that, workflow is: **commit → push to GitHub → wait for Render + Vercel build logs → live site updates.** Optional: [GitHub Actions CI](.github/workflows/ci.yml) runs tests/build on push/PR. Optional alternative: [deploy-vercel workflow](.github/workflows/deploy-vercel.yml) only if you prefer deploying the frontend via Actions (off by default; see file header — avoid running it together with Vercel’s Git integration or you’ll double-deploy).

## Quick start (local, both projects)

```bash
# 1) Backend
cd backend
cp .env.example .env
#   → set MONGODB_URI to your Atlas connection string
#   → set JWT_SECRET to `openssl rand -hex 32`
npm install
npm run start:dev     # → http://localhost:3001

# 2) Frontend (in a second terminal)
cd ../frontend
cp .env.example .env  # default points to localhost:3001
npm install
npm run dev           # → http://localhost:3000
```

### First-run admin (seed)

Authentication is required on every route. After MongoDB is reachable, create the default admin **once** from the backend folder (uses the same `MONGODB_URI` as the API):

```bash
cd backend
npm run seed:admin
```

By default this creates `admin@gmail.com` / `password123` (override with `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` if needed). If that email already exists as an active user, the script skips and does nothing.

Then open http://localhost:3000, log in, create a few agents, then a transaction, then walk it through `agreement → earnest_money → title_deed → completed`. The commission breakdown appears on the transaction detail page once completed.

## Deployment — step by step

The stack deploys cleanly on **MongoDB Atlas** (database) + **Render** (backend) + **Vercel** (frontend). All three have generous free tiers.

### A. MongoDB Atlas (database)

1. Create a free account at <https://www.mongodb.com/atlas/register>.
2. **Create Cluster → M0 (Free)** → pick the region closest to your Render region (Frankfurt if you're in Europe).
3. **Database Access → Add New Database User** → create a username + strong password. Grant `Read and write to any database`.
4. **Network Access → Add IP Address → `0.0.0.0/0` (Allow from anywhere)** — Render's outbound IPs are not static on the free plan, so a wildcard is the pragmatic choice. The database itself is still protected by the username/password.
5. **Connect → Drivers → Node.js** → copy the connection string. Looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Append the database name before the `?`:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/estate-agency?retryWrites=true&w=majority
   ```
   Save this — you'll paste it into Render.

### B. Render (backend)

This repo already ships a `backend/render.yaml` blueprint. You only need to click-through the import + fill in secrets.

1. Push the repo to GitHub (public repo recommended so the reviewer can browse the code).
2. <https://dashboard.render.com> → **New → Blueprint** → connect the GitHub repo.
3. Render detects `backend/render.yaml` and proposes a free web service named `estate-agency-api`. Accept.
4. Render prompts you for the three `sync: false` secrets:
   - `MONGODB_URI` → the Atlas URI from step A5.
   - `JWT_SECRET` → generate a long random string. One option:
     ```bash
     openssl rand -hex 32
     ```
   - `FRONTEND_ORIGIN` → put `http://localhost:3000` for now. You'll update it after Vercel is live (step D).
5. **Create Resources** → Render runs `npm ci && npm run build`, then `npm run start:prod`. First deploy takes 3–5 minutes.
6. When the build is green, the service exposes a URL like `https://estate-agency-api.onrender.com`. Open `/health` to verify:
   ```
   https://estate-agency-api.onrender.com/health
   ```
   Should return `{"status":"ok", ...}`. Swagger lives at `/api/docs`.

### C. Vercel (frontend) — new project from scratch

Use this after deleting an old Vercel project or the first time you connect the repo.

1. Open <https://vercel.com/new> and sign in (GitHub login is easiest).
2. **Add New… → Project** → **Import** your GitHub repo (select the **monorepo root**, not `frontend` only).
3. On the **Configure Project** screen (do not click Deploy until these are set):
   - **Framework Preset**: Nuxt.js (auto-detected).
   - **Root Directory**: click **Edit** → set to **`frontend`** → **Continue**. This is required so Vercel runs `npm install` / `npm run build` inside the Nuxt app, not the repo root.
   - **Build Command**: `npm run build` (default).
   - **Output Directory**: leave **empty** — Nuxt on Vercel uses Nitro’s output; the preset is applied automatically when `VERCEL` is set during build (see `nuxt.config.ts`).
4. **Environment Variables** → **Add**:
   - Name: `NUXT_PUBLIC_API_BASE`  
   - Value: your live API URL, e.g. `https://estate-agency-api.onrender.com` (**no** trailing slash).
5. **Deploy**. Wait for the build; fix any red errors in the deployment log (common mistake: forgetting **Root Directory** `frontend`).
6. **Git → Production Branch**: under **Settings → Git**, set **Production Branch** to `main` (or whatever you use). With the repo connected, **every `git push` to that branch** creates a new **Production** deployment.
7. If the Vercel hostname changed (e.g. new `*.vercel.app` URL), update **`FRONTEND_ORIGIN`** on Render (step D) to match exactly, then redeploy the API so CORS allows the new origin.

**Note:** You do **not** need `.github/workflows/deploy-vercel.yml` unless you explicitly want CLI-based deploys. The dashboard Git connection is enough for automatic updates.

### D. Tie them back together (CORS)

The backend won't accept cross-origin requests from Vercel until you tell it to. Go back to Render:

1. Render dashboard → your service → **Environment** → edit `FRONTEND_ORIGIN`:
   ```
   https://estate-agency-azure.vercel.app
   ```
   (use your actual Vercel production URL).
2. Save. Render redeploys automatically (~1 minute).
3. Open the Vercel URL. If production MongoDB has no admin yet, run the seed **locally** (or any machine with Node) using the **same** `MONGODB_URI` as Render:
   ```bash
   cd backend
   export MONGODB_URI='mongodb+srv://...'   # paste from Atlas / Render secrets
   npm run seed:admin
   ```
4. Log in through the frontend → you're live.

### E. Keep deploy URLs in sync

Whenever the production API or Vercel hostname changes, update the [Live deployment](#live-deployment) table, Vercel env (`NUXT_PUBLIC_API_BASE`), and Render `FRONTEND_ORIGIN`, then redeploy.

---

## Technical case compliance (brief checklist)

This repo is structured to match the published **Technical Case (NestJS, MongoDB, Nuxt 3)**. Mapping:

| Requirement | Where it is satisfied |
|---------------|------------------------|
| **§2** Transaction lifecycle, commission distribution, financial breakdown, REST API | `backend/src/transactions`, `backend/src/commission`, `GET /transactions/:id/breakdown` |
| **§3** NestJS, MongoDB Atlas, Mongoose, Jest; Nuxt 3, Pinia, Tailwind | Root table above; `backend/package.json`, `frontend/package.json` |
| **§4.1** Stages + transitions + dashboard; invalid transitions documented | `TransactionStage`, `TransactionsService.updateStage`, `frontend/app/pages/islemler`, [`DESIGN.md` §1.4](backend/DESIGN.md) |
| **§4.2** Agency + per-agent amounts + listing/selling rationale | Embedded `commissionBreakdown`, UI `CommissionCard`, [`DESIGN.md` §1.3](backend/DESIGN.md) |
| **§4.3** 50% / 50% scenarios 1 & 2 + tests | `CommissionService`, `commission.service.spec.ts` |
| **§5** Design documented | [`backend/DESIGN.md`](backend/DESIGN.md) (backend + frontend architecture) |
| **§6.1** Monorepo `backend/` + `frontend/` | This repository |
| **§6.2** Unit tests (commission, stages, core logic) | `npm test` in `backend/` — see Testing below |
| **§6.3** DESIGN.md | [`backend/DESIGN.md`](backend/DESIGN.md) |
| **§6.4** README | This file + [`backend/README.md`](backend/README.md) + [`frontend/README.md`](frontend/README.md) |
| **§6.5** Live API + live frontend + Atlas | [Live deployment](#live-deployment) table; Atlas is required in production ([§A](#a-mongodb-atlas-database)) |

### Known limitations / reviewer's checklist

- **Public Git repository (§6.1):** The case asks for a public repo for reviewers. Publishing and link-sharing are on you; the code layout matches the expected structure.
- **Problem narrative vs scope:** The brief mentions earnest money, deeds, and *payments* as part of a messy real-world process. This system models the **agreed stage pipeline** and **service-fee distribution**; it does not implement a full multi-line-item payment ledger. That is intentional for the “core” scope; extend with extra collections if you need per-payment traceability.
- **Deliverable 6.5:** You must keep **MongoDB Atlas** as the production database, and confirm both URLs respond (API `/health`, frontend login). If the Render API hostname differs from the table, update the table and env vars.

## Documentation

- **Architecture, data model, design decisions** → [`backend/DESIGN.md`](backend/DESIGN.md)
- **Backend setup, env, API reference** → [`backend/README.md`](backend/README.md)
- **Frontend setup, pages, composables** → [`frontend/README.md`](frontend/README.md)

## Commission rules (§4.3 of the brief)

- Agency always takes 50 % of the total service fee.
- Agent pool is the remaining 50 %:
  - **Same agent** (listing == selling) → that agent takes 100 % of the agent pool (= 50 % of the total fee).
  - **Different agents** → split equally (25 % / 25 % of the total fee).
- The sum invariant `agency + listing + selling === totalServiceFee` is preserved via residue-absorption rounding. See [`backend/DESIGN.md §1.5`](backend/DESIGN.md).
- All amounts are stored and computed as **integer kuruş** (1 TRY = 100 kuruş); see [`backend/DESIGN.md §1.2`](backend/DESIGN.md).
- Rates are configurable via `COMMISSION_AGENCY_BPS` / `COMMISSION_LISTING_AGENT_BPS` env vars (basis points), with the active policy snapshotted into every completed transaction for audit. See [`backend/DESIGN.md §1.6c`](backend/DESIGN.md).

## Testing

```bash
cd backend
npm test
```

**101 unit tests across 10 suites** cover every commission scenario, every stage transition (valid + invalid + concurrent via OCC), the breakdown guard, agent earnings aggregation, authentication flows, RBAC guard semantics, the global exception filter, CORS origin parsing, Mongoose virtuals (`isPayoutReady`, `isSameAgent`), paginated list behaviour (defaults, clamping, `hasMore`), stats aggregation, and index-declaration regression. Run from `backend/`: `npm test`. If Jest fails on Watchman in your environment, use `CI=true npx jest --ci --watchman=false` instead.
