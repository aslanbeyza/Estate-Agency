# DESIGN.md — Estate Agency (Backend + Frontend)

This document records the architectural decisions taken for the technical case. Code-level "why" that is not obvious from reading the source lives here.

---

## 1. Backend (NestJS + MongoDB Atlas)

### 1.1 Module structure

```
src/
  agents/           AgentsModule         — agent CRUD + per-agent earnings aggregation
  transactions/     TransactionsModule   — transaction lifecycle + stage transitions
  commission/       CommissionModule     — pure commission calculator (no DB, no IO)
  common/filters/   AllExceptionsFilter  — consistent JSON error shape
  health/           HealthController     — liveness + mongo connectivity
  main.ts           bootstrap            — global ValidationPipe, filter, CORS, Swagger
```

`CommissionModule` deliberately has **no Mongoose dependency**. It is a pure function wrapped in an `@Injectable()`. This keeps the most business-critical logic (the rules from §4.3 of the brief) trivially unit-testable without mocking a database, and lets us add more scenarios in the future without touching the transaction layer.

### 1.2 Data model

**Agent** (`agents/agent.schema.ts`)
- `name: string` (required)
- `email: string` (required, **unique** index)
- `phone?: string`
- Mongoose timestamps

**Transaction** (`transactions/transaction.schema.ts`)
- `propertyAddress: string`
- `totalServiceFee: number` (min 0)
- `stage: 'agreement' | 'earnest_money' | 'title_deed' | 'completed'`
- `listingAgent: ObjectId → Agent`
- `sellingAgent: ObjectId → Agent`
- `commissionBreakdown?: { agencyAmount, listingAgentAmount, sellingAgentAmount, scenario }`
  — populated **only** when stage transitions into `completed`

The same agent can appear as both `listingAgent` and `sellingAgent` (supports the "same agent" scenario).

### 1.3 Where is the commission breakdown stored?

The breakdown lives **embedded in the transaction document**, not in a separate collection.

Reasoning:
1. 1:1 relationship — one transaction has exactly one breakdown.
2. Once calculated it is an **immutable historical fact** — we never recompute it after a transaction is completed, even if commission policies change later. This protects audit integrity.
3. A single document read returns the entire financial picture; no extra joins / lookups.
4. A dedicated collection would be justified only if we wanted cross-transaction financial reporting with its own lifecycle (payouts, payment dates, tax jurisdiction, etc.) — that is out of scope for this case.

Per-agent earnings are instead **computed on demand** by `AgentsService.earnings()` via a single Mongo query filtered by `stage=completed` and either `listingAgent` or `sellingAgent`. This gives live numbers without denormalising a materialised view.

### 1.4 Stage transitions

The pipeline is a strict forward chain:

```
agreement → earnest_money → title_deed → completed
```

Only the next-in-line transition is accepted; anything else (jumping a step, going backwards, anything after `completed`) throws `400 BadRequestException`. `completed` is a terminal state.

Justification:
- Mirrors real-world property transactions (earnest → deed → close).
- Prevents financial inconsistencies (e.g. reversing from completed would silently orphan the commission breakdown).
- Makes the state machine trivial to test — we explicitly test both valid transitions and each invalid class (`agreement → completed`, `completed → title_deed`, unknown id).

The mapping is declared as a `Record` so adding new stages in the future is one line:

```typescript
const VALID_TRANSITIONS = {
  [Stage.AGREEMENT]:     Stage.EARNEST_MONEY,
  [Stage.EARNEST_MONEY]: Stage.TITLE_DEED,
  [Stage.TITLE_DEED]:    Stage.COMPLETED,
};
```

### 1.5 Commission rules (§4.3 of the brief)

Implemented in `CommissionService.calculate()`:

| Input                     | Output                                      | Scenario            |
|---------------------------|---------------------------------------------|---------------------|
| listingAgent == sellingAgent | agency = 50%, that agent = 50%           | `same_agent`        |
| listingAgent != sellingAgent | agency = 50%, each agent = 25%           | `different_agents`  |

**Rounding policy.** JS `number` is IEEE-754 double; `0.1 + 0.2 !== 0.3`. For money we round to 2 decimals (cent precision) using `Math.round((n + Number.EPSILON) * 100) / 100`. To guarantee the **sum invariant**

```
agencyAmount + listingAgentAmount + sellingAgentAmount === totalServiceFee
```

even for fees that do not divide evenly by 4 (e.g. `100_001`), the agency absorbs the rounding residue:

```typescript
const agencyAmount = round2(totalServiceFee - listingAgentAmount - sellingAgentAmount);
```

This is cheaper than introducing a big-decimal library and is backed by unit tests.

### 1.6 Validation and error handling

- Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- DTOs are fully decorated with `class-validator`. No manual validation in services.
- `AllExceptionsFilter` normalises every error to the shape:
  ```json
  {
    "statusCode": 400,
    "timestamp": "2026-04-20T18:00:00.000Z",
    "path": "/transactions/abc/stage",
    "method": "PATCH",
    "message": "Invalid stage transition: agreement → completed",
    "error": "Bad Request"
  }
  ```
  The frontend `useApi` composable relies on this contract to surface human-readable error toasts.

### 1.7 API surface

| Method | Path                           | Purpose                                       |
|--------|--------------------------------|-----------------------------------------------|
| GET    | `/`                            | API metadata (name, version, docs, health)    |
| GET    | `/health`                      | Liveness + mongo connectivity                 |
| GET    | `/api/docs`                    | Swagger UI                                    |
| POST   | `/agents`                      | Create agent                                  |
| GET    | `/agents`                      | List agents                                   |
| GET    | `/agents/:id`                  | Get one agent                                 |
| GET    | `/agents/:id/earnings`         | Aggregated earnings across completed tx      |
| DELETE | `/agents/:id`                  | Delete agent                                  |
| POST   | `/transactions`                | Create transaction (starts at `agreement`)    |
| GET    | `/transactions`                | List all (agents populated)                   |
| GET    | `/transactions/:id`            | Get one (agents populated)                    |
| PATCH  | `/transactions/:id/stage`      | Advance to the next stage                     |
| GET    | `/transactions/:id/breakdown`  | Commission breakdown (completed only)         |
| DELETE | `/transactions/:id`            | Delete a transaction                          |

### 1.8 Testing

Jest unit tests cover:
- `CommissionService` — §4.3 scenarios 1 & 2, edge cases (fee=0, negative fee, float drift), sum invariant on odd fees.
- `TransactionsService` — every valid transition, invalid transitions (`400`), terminal state guard, missing transaction (`404`), breakdown fetch before / after completion.
- `AgentsService` — `findOne` happy/missing, `remove` happy/missing, `earnings` aggregation across mixed same-agent and different-agent completed transactions.
- `AppController` — metadata root.

Total: **24 unit tests** across 4 suites, all green (`npm test`).

---

## 2. Frontend (Nuxt 3 + Pinia + Tailwind)

### 2.1 Page layout

```
app/
  app.vue                        shell (sidebar + mobile topbar + dark-mode + <ToastContainer />)
  pages/
    index.vue                    Dashboard — KPI cards, stage counts, recent transactions
    islemler/index.vue           Transactions list + create form + stage filter
    islemler/[id].vue            Transaction detail: stage timeline, advance button, commission card
    danismanlar/index.vue        Agents list + per-agent stats + transaction history panel
  components/                    presentational primitives (StageBadge, StageTimeline, CommissionCard…)
  composables/                   useApi, useToast, useStageMeta, useTheme
  stores/                        Pinia: agents, transactions
```

> **Directory convention.** Nuxt 3 by default expects `pages/`, `components/`, `composables/`, `stores/` at the project root. We opted for a top-level `app/` wrapper (the directory layout that Nuxt 4 standardises) so the repo has a clean `app/ | public/ | nuxt.config.ts` separation. This is enabled in `nuxt.config.ts` with:
>
> ```typescript
> export default defineNuxtConfig({
>   srcDir: 'app/',
>   dir: { pages: 'pages' },
>   // …
> });
> ```
>
> Every Nuxt 3 convention (auto-imports, file-based routing, Pinia module, composables) works identically — only the file resolution root changes.

> **Language note.** The UI labels and route names are Turkish (`islemler`, `danismanlar`) because the target consultancy operates in Turkey. API contracts, code, and commit messages are English. The mapping is deliberate — changing UI strings does not require touching any domain types.

### 2.2 State management — Pinia

We use the **options API** style of Pinia (`state`, `getters`, `actions`) rather than the composition API style. Reasoning:
- The shape of our domain is small and known ahead of time; `state()` reads like a type declaration.
- `getters` (counts per stage, total agency revenue) are naturally computed from the store and make the dashboard nearly logic-free.
- Actions do network IO through the `useApi` composable, so stores remain transport-agnostic.

Two stores:

- `useTransactionsStore` — holds `transactions[]` and `current`, exposes `fetchAll / fetchOne / create / updateStage / remove`, plus `counts` and `totalAgencyRevenue` getters.
- `useAgentsStore` — holds `agents[]`, exposes `fetchAll / create / remove / earnings`. `earnings` does **not** mutate the store, it returns the aggregated report directly (it's a query, not state).

Mutations after writes are optimistic-ish: a new agent/transaction is unshifted into the list so the dashboard updates without a full refetch; a stage update replaces the affected row in place.

### 2.3 `useApi` composable

`$fetch` is wrapped so every call:
- Prefixes the configured API base (`runtimeConfig.public.apiBase`).
- Extracts the backend's error-filter message shape (`{ message, statusCode, ... }`) into a plain `Error` with a preserved `status`.
- Exposes `get`, `post`, `patch`, `del` helpers so stores read declaratively.

This is why the stores can throw strings like `'Invalid stage transition: agreement → completed'` into toasts without any further parsing.

### 2.4 Toast system (`useToast` + `<ToastContainer />`)

`useToast` is a module-level singleton (`const toasts = ref<Toast[]>([])` outside the exported function) so every component shares the same queue. Push with `success / error / info`, auto-dismiss after a TTL, manual dismiss via the close button. Container is mounted once in `app.vue`, uses `<TransitionGroup>` for enter/leave.

Used in:
- Transaction creation (success + error).
- Stage advance (success or server-side validation error).
- Agent creation (success + error).

### 2.5 Other composables

- `useStageMeta` — centralised icon/colour/label per stage. Every stage-aware component (badge, timeline, filter chip, stage card) reads from here, so rebranding a stage is one place.
- `useTheme` — light/dark toggle with `localStorage` persistence.

### 2.6 Styling

Tailwind 4 with custom utility classes defined in `assets/css/main.css` (`.card`, `.btn-primary`, `.input-field`, `.td`, `.th`, `.nav-link`, etc.) to keep markup readable. Dark mode is implemented with the `dark:` variant.

### 2.7 Responsive strategy

- Below `md`: hamburger top bar + sliding sidebar + card lists.
- `md` and above: fixed sidebar, tables, side-by-side detail panels.

---

## 3. Deployment

- MongoDB Atlas cluster (free tier) — connection string in `MONGODB_URI`.
- Backend: any Node host (Render, Railway, Fly). Env vars: `MONGODB_URI`, `PORT`.
- Frontend: any Nuxt host (Vercel, Netlify). Env var: `NUXT_PUBLIC_API_BASE` → deployed backend URL.

Live URLs are listed in the root `README.md` once deployed.
