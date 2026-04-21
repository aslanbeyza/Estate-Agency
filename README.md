# Estate Agency — Technical Case

A full-stack application that automates the post-agreement lifecycle of a real-estate transaction (earnest money → title deed → completed) and automatically distributes the service fee between the agency and the agents involved.

## Repositories / Folders

| Project        | Purpose                                            | Stack |
|----------------|----------------------------------------------------|-------|
| **backend/**   | REST API, commission engine, MongoDB persistence   | NestJS 11, MongoDB Atlas, Mongoose, Jest |
| **frontend/**  | Dashboard + transaction UI + agent reports        | Nuxt 3, Pinia, Tailwind CSS v4 |

## Live deployment

- **API**:      `<https://estate-agency-api.onrender.com>` _(fill in after deploy)_
- **Swagger**:  `<https://estate-agency-api.onrender.com>/api/docs`
- **Frontend**: `<https://estate-agency.vercel.app>` _(fill in after deploy)_

> **Cold start notice.** The Render backend runs on the free plan and sleeps after 15 minutes of inactivity. The first request after idle takes ~30–60 seconds while the container wakes up; subsequent requests are instant. Upgrade to the $7/mo starter plan to eliminate this.

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

### First-run bootstrap

Authentication is required on every route. Create the first admin user by `POST`-ing to `/auth/bootstrap-admin` (once, only works while the users collection is empty):

```bash
curl -X POST http://localhost:3001/auth/bootstrap-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme123","name":"Admin"}'
```

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

### C. Vercel (frontend)

1. <https://vercel.com/new> → import the same GitHub repo.
2. **Configure Project**:
   - **Framework Preset**: Nuxt (should auto-detect).
   - **Root Directory**: `frontend` ← important, this is a monorepo.
   - **Build Command**: leave default (`npm run build`).
   - **Output Directory**: leave default.
3. **Environment Variables** → add one:
   - `NUXT_PUBLIC_API_BASE` = `https://estate-agency-api.onrender.com` (no trailing slash)
4. **Deploy.** First build takes 2–3 minutes. Vercel gives you a URL like `https://estate-agency.vercel.app`.

### D. Tie them back together (CORS)

The backend won't accept cross-origin requests from Vercel until you tell it to. Go back to Render:

1. Render dashboard → your service → **Environment** → edit `FRONTEND_ORIGIN`:
   ```
   https://estate-agency.vercel.app
   ```
   (use your actual Vercel URL).
2. Save. Render redeploys automatically (~1 minute).
3. Open the Vercel URL. Log in with the admin you bootstrapped locally — wait, you haven't bootstrapped production yet. Do it now against the live API:
   ```bash
   curl -X POST https://estate-agency-api.onrender.com/auth/bootstrap-admin \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"changeme123","name":"Admin"}'
   ```
4. Log in through the frontend → you're live.

### E. Update this README

Replace the two placeholder URLs at the top (`API`, `Frontend`) with your actual Render + Vercel URLs and commit.

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

**93 unit tests across 10 suites** cover every commission scenario, every stage transition (valid + invalid + concurrent via OCC), the breakdown guard, agent earnings aggregation, authentication flows, RBAC guard semantics, the global exception filter, CORS origin parsing, Mongoose virtuals (`isPayoutReady`, `isSameAgent`), paginated list behaviour (defaults, clamping, `hasMore`), stats aggregation, and index-declaration regression.
