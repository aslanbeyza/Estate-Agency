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
- `totalServiceFee: number` — **integer kuruş** (1 TRY = 100 kuruş), min 0, `Number.isInteger` validator
- `stage: 'agreement' | 'earnest_money' | 'title_deed' | 'completed'`
- `listingAgent: ObjectId → Agent`
- `sellingAgent: ObjectId → Agent`
- `commissionBreakdown?: { agencyAmount, listingAgentAmount, sellingAgentAmount, scenario }`
  — populated **only** when stage transitions into `completed`; all amounts are integer kuruş

> **Money is stored as an integer, not a float.** Every monetary field in the schema and every amount in the commission breakdown is kept in kuruş (1/100 TRY). This sidesteps IEEE-754 drift (`0.1 + 0.2 !== 0.3`) at the persistence layer — there is no rounding, no `Number.EPSILON`, and no big-decimal dependency. The presentation layer (frontend `formatTRY` / `toKurus` helpers) is the single place that converts between kuruş and human-readable TL.

The same agent can appear as both `listingAgent` and `sellingAgent` (supports the "same agent" scenario).

**Soft-delete for `Agent`.** Transactions reference agents by `ObjectId`, and `commissionBreakdown` is embedded as an immutable historical fact. Hard-deleting an agent would therefore leave every past transaction with a dangling reference — `populate('listingAgent')` would resolve to `null` and the UI would crash on `tx.listingAgent.name`. To keep historical data correct, `Agent` carries a nullable `deletedAt: Date` column instead:

- `DELETE /agents/:id` sets `deletedAt = new Date()` (idempotent; re-deleting is a no-op).
- `AgentsService.findAll` filters `{ deletedAt: null }` so the active roster is clean.
- `AgentsService.findOne` and every `populate('listingAgent' | 'sellingAgent')` call **do not** filter — history must resolve. Populate selects include `deletedAt` so the frontend can tag these as `(silindi)` without an extra round-trip.
- `TransactionsService.create` rejects any reference to a soft-deleted agent with `400 BadRequestException`. This keeps the invariant "every new transaction points at a live agent" while preserving old data.
- The email `unique` index is re-declared as a **partial index over `{ deletedAt: null }`** so a soft-deleted agent keeps its row without blocking a fresh signup on the same email.

Alternatives considered and rejected: a global Mongoose query middleware that filters `deletedAt` everywhere (too much magic; breaks history populate), a `mongoose-delete` plugin (extra dependency for a four-line behaviour), and per-collection archival tables (overkill for this scope and it would split the audit trail across two collections).

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

**Concurrent writes — optimistic concurrency control.** `updateStage` is a classic read-modify-write (`findById` → validate transition → `save`). Without a guard, two clients that read the same transaction at the same `__v` would both pass validation and the second save would silently overwrite the first — a textbook lost-update bug, and in our case it would also desync `commissionBreakdown` from the actual transition history.

The `Transaction` schema therefore enables Mongoose's built-in OCC:

```typescript
@Schema({ timestamps: true, optimisticConcurrency: true })
```

Every `save()` is now issued with `{ _id, __v: <loaded version> }` as its update filter and the version key is bumped atomically. If another writer advanced the same document in between, MongoDB matches no rows, Mongoose throws `VersionError`, and the service converts that into `409 Conflict` so the client can refetch and retry:

```typescript
try {
  return await tx.save();
} catch (err) {
  if (err instanceof MongooseError.VersionError) {
    throw new ConflictException(
      `Transaction ${id} was modified by another request. Please refresh and try again.`,
    );
  }
  throw err;
}
```

This is intentionally scoped to `Transaction` — it is the only document with a non-trivial state machine. `Agent` writes are append/delete only and don't need per-field concurrency control.

### 1.5 Commission rules (§4.3 of the brief)

Implemented in `CommissionService.calculate()`:

| Input                     | Output                                      | Scenario            |
|---------------------------|---------------------------------------------|---------------------|
| listingAgent == sellingAgent | agency = 50%, that agent = 50%           | `same_agent`        |
| listingAgent != sellingAgent | agency = 50%, each agent = 25%           | `different_agents`  |

**Integer arithmetic, residue absorbed by the agency.** Because every input is an integer kuruş (see §1.2), the calculator can do pure integer math with `Math.floor` — no rounding, no `Number.EPSILON`, no big-decimal library. The sum invariant

```
agencyAmount + listingAgentAmount + sellingAgentAmount === totalServiceFee
```

is preserved byte-for-byte even for fees that do not divide evenly by 4 (e.g. `100_001 kr`). The agency absorbs the 0–3 kuruş residue, which matches real-world accounting conventions (the house takes the rounding):

```typescript
const agentsPool = Math.floor(totalServiceFee / 2);
const half = Math.floor(agentsPool / 2);
const agencyAmount = totalServiceFee - listingAgentAmount - sellingAgentAmount;
```

Non-integer inputs are rejected at two layers: the DTO (`@IsInt()`) and the service (`Number.isInteger` guard) — this catches accidental TL values slipping through as a regression.

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

### 1.6b Business logic stays on the server

Every derived fact that depends on business rules is produced by the backend and consumed verbatim by the UI. Two mechanisms achieve this:

1. **Mongoose virtuals on `Transaction`** — `isPayoutReady` (stage === completed ∧ breakdown present) and `isSameAgent` (listing and selling resolve to the same id) are declared on the schema and serialised via `toJSON: { virtuals: true }`. Every endpoint that returns a transaction automatically ships them. `__v` is hidden from the wire (it still drives optimistic concurrency in the DB).

2. **Agent-lens DTOs on dedicated endpoints**:
   - `GET /agents/stats` runs a single `$lookup` + `$filter` aggregation pipeline and returns each active agent augmented with `listingCount`, `sellingCount`, `completedCount`, `totalEarned` (integer kuruş). The frontend renders the response directly — no per-agent loops, no summing, no role detection.
   - `GET /agents/:id/transactions` returns each transaction the agent participates in with the role (`listing` | `selling` | `both`) and the agent's own share pre-computed. Same-agent scenario is collapsed server-side so the UI never has to know that the agent pool lives on `listingAgentAmount` in that mode.

Why: commission policies, payout rules and role-labelling are **business rules**, not presentation. If any of them changes tomorrow (e.g. "5% goes to a bonus pool before the 50/50 split") the backend is the only place that has to ship. The frontend imports one type definition, reads two flags and two numbers.

What stays on the frontend: locale-bound UI strings (`ROLE_LABEL` Turkish map), display formatting (`formatTRY`, `agentLabel`'s `(silindi)` suffix) and input conversion (`toKurus`). These are genuine view-layer concerns.

### 1.6c Commission policy — externalised and versioned per record

Commission rates used to live as magic numbers inside `CommissionService` (agency `/ 2`, agents `/ 4`). Two problems with that: (a) changing the rate required a code deploy, and (b) once the number moved, historical transactions no longer matched the rule their breakdown was computed under — an audit nightmare.

The refactor:

- **Rates are basis points, not percentages.** `CommissionPolicy { agencyBps, listingAgentBps }` — 10 000 bps = 100 %. Integers only, same invariant as kuruş: no float drift when serialised, stored or compared.
- **`CommissionPolicyService` reads from environment at startup.** `COMMISSION_AGENCY_BPS` (default 5000) and `COMMISSION_LISTING_AGENT_BPS` (default 5000, of the agent pool). Out-of-range or non-integer values throw at startup — no silent fallback, because a wrong split is worse than a crash in financial software.
- **`CommissionService` calculates from the injected policy.** Existing invariants hold: `agencyAmount + listingAgentAmount + sellingAgentAmount === totalServiceFee`, agency absorbs the residue, same-agent scenario gives the full pool to the listing agent. Default policy produces identical numbers to the old hard-coded formulas — parity tests in `commission.service.spec.ts` protect this.
- **Every breakdown records the policy used.** `CommissionBreakdown.policy` carries the `{ agencyBps, listingAgentBps }` snapshot. Because breakdowns are embedded in transactions and never mutated, a 2026-03-14 transaction will forever show the rates that paid it out even if the live policy moves to 60 / 20 / 20 in June.

Why not put the rates in MongoDB now? Nothing in `CommissionService` depends on where `CommissionPolicyService` sourced the policy. When an admin UI becomes necessary, swap the `ConfigService` read for a cached `settings` collection read — callers and tests do not change. Keeping the source externalised via an interface is the whole point of the exercise; the env is simply the first (and simplest) implementation.

The frontend displays percentages computed from `amount / totalServiceFee` on each breakdown. The UI never needs to know what the "current" rate is — the record tells its own story.

### 1.7 API surface

| Method | Path                           | Purpose                                       |
|--------|--------------------------------|-----------------------------------------------|
| GET    | `/`                            | API metadata (name, version, docs, health)    |
| GET    | `/health`                      | Liveness + mongo connectivity                 |
| GET    | `/api/docs`                    | Swagger UI                                    |
| POST   | `/agents`                      | Create agent                                  |
| GET    | `/agents`                      | List active agents                            |
| GET    | `/agents/stats`                | Agents + aggregate counts + total earnings    |
| GET    | `/agents/:id`                  | Get one agent (incl. soft-deleted)            |
| GET    | `/agents/:id/earnings`         | Aggregated earnings across completed tx       |
| GET    | `/agents/:id/transactions`     | Agent-lens transaction feed (role + amount)   |
| DELETE | `/agents/:id`                  | Soft-delete agent (idempotent)                |
| POST   | `/transactions`                | Create transaction (starts at `agreement`)    |
| GET    | `/transactions`                | List all (agents populated)                   |
| GET    | `/transactions/:id`            | Get one (agents populated)                    |
| PATCH  | `/transactions/:id/stage`      | Advance to the next stage                     |
| GET    | `/transactions/:id/breakdown`  | Commission breakdown (completed only)         |
| DELETE | `/transactions/:id`            | Delete a transaction                          |

### 1.8 Testing

Jest unit tests cover:
- `CommissionService` — §4.3 scenarios 1 & 2, edge cases (fee=0, negative fee, float drift), sum invariant on odd fees.
- `TransactionsService` — every valid transition, invalid transitions (`400`), terminal state guard, missing transaction (`404`), breakdown fetch before / after completion, optimistic-concurrency collision (`409` on `VersionError`), passthrough of unrelated save errors, and **create-time soft-delete integrity** (accepts two active agents, rejects any soft-deleted reference with `400`, collapses same-agent to a single lookup).
- `AgentsService` — `findAll` filters `deletedAt: null`, `findOne` still resolves soft-deleted rows (so populate history works), `remove` soft-deletes on first call and is idempotent on second, missing id still throws `404`, `earnings` aggregation across mixed same-agent and different-agent completed transactions, `stats` delegates to the aggregation pipeline and enforces the `deletedAt: null` match stage, `transactions` projects role + amount (`listing`, `both`, `null` while not yet payout-ready) and keeps working for soft-deleted agents so their history stays accessible.
- `Transaction` schema virtuals — `isPayoutReady` is false until `stage = completed` **and** the breakdown has been populated; `isSameAgent` compares populated / raw refs; JSON output ships both virtuals and hides `__v`.
- `AppController` — metadata root.

Total: **44 unit tests** across 5 suites, all green (`npm test`).

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
