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

**Driver-level translations.** `AllExceptionsFilter` catches untyped throws (not just `HttpException`) and specifically rewrites the Mongo / Mongoose classes that tend to surface through services:

| Error                                          | Status | Why                                                                         |
|------------------------------------------------|--------|-----------------------------------------------------------------------------|
| `HttpException` (any subclass)                 | as-is  | Explicit, the service already knew what it wanted                           |
| `MongooseError.VersionError`                   | 409    | Safety net for optimistic concurrency — matches the explicit catch          |
| `MongooseError.ValidationError`                | 400    | Per-field messages returned as `string[]` to fit the class-validator shape  |
| `MongooseError.CastError`                      | 400    | Malformed `ObjectId` is a client bug, not a server bug                      |
| `MongoServerError` `code === 11000`            | 409    | Duplicate-unique-index — field name in message, **value scrubbed** (may be PII) |
| `MongoNetworkError` / `MongoServerSelectionError` / timeouts | 503 | Transient infra. 500 would burn alerts on every Atlas flake                 |
| anything else                                  | 500    | Raw message is logged server-side but replaced with `"Internal server error"` on the wire |

The "scrub before return" rule is important: the driver's `keyValue` on a duplicate-key error looks like `{ email: 'ayse@example.com' }`, which is user data we should not echo back to the caller. We return the field name only.

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

### 1.6d CORS — origin-locked, no wildcard

The default `app.enableCors()` call reflects `Access-Control-Allow-Origin: *`, which makes every commission breakdown and agent earnings number reachable from any page the user happens to have open. That is the wrong tradeoff for financial data.

- `FRONTEND_ORIGIN` is a comma-separated allow-list read at bootstrap. Unset falls back to `http://localhost:3000` so `npm run dev` just works — but that's the **only** implicit origin.
- `parseAllowedOrigins` throws at startup if `*` appears anywhere in the list. A misconfigured prod env should fail to boot, not quietly open up.
- `credentials: false` stays off until we actually need cross-origin cookies; `credentials: true` combined with any origin `*` is a spec violation and would be doubly wrong here.
- `methods` is pinned to the verbs we use (`GET`, `POST`, `PATCH`, `DELETE`, plus `OPTIONS` for the preflight). Narrower than NestJS's default and closer to what the API actually accepts.

This is a defence-in-depth measure, not the entire security story. It mitigates casual cross-origin reads and browser-driven scraping; it complements (but does not replace) the authentication layer described in §1.6e.

### 1.6e Authentication, authorization and audit trail

The commission and stage-transition endpoints manipulate money and contractual state. They cannot remain open.

**Identity.** A minimal `User { email, passwordHash, name, role, deletedAt }` model; passwords are bcrypt-hashed at cost 10 and the hash is `select: false` so it never leaks through `populate` or `toJSON`. Soft-delete mirrors the agent model — a deactivated user keeps their row so historical `createdBy` / `stageHistory.by` references still resolve.

**Login flow.** `POST /auth/login` validates email + password and returns `{ access_token, user }`. The token is a standard JWT signed with `JWT_SECRET` (the app refuses to boot if unset or empty) and expires after `JWT_EXPIRES_IN` (default `12h`). `ExtractJwt.fromAuthHeaderAsBearerToken()` — no cookie-based session, no CSRF surface to manage.

**Initial admin.** The first admin is created **out of band** via `npm run seed:admin` in `backend/` (script `scripts/seed-admin.ts`), using `MONGODB_URI`. It is idempotent: if an active user with the seed email already exists, the script does nothing. Default credentials are documented in the repo root `README.md`; production deployments should override via `SEED_ADMIN_*` env vars or change the password after first login.

**Guards (global + opt-out).**
- `JwtAuthGuard` is registered as `APP_GUARD`, so every route requires a valid Bearer token by default — secure-by-default. Individual routes opt out with `@Public()` (login, health, root, Swagger UI).
- `RolesGuard` also runs globally and enforces `@Roles(UserRole.ADMIN)` / `@Roles(UserRole.AGENT, UserRole.ADMIN)` metadata. Missing `@Roles` means "any authenticated user is fine".
- On every request `JwtStrategy.validate` re-reads the user from MongoDB. A soft-deleted user is rejected (`401`) even if their token has not expired yet — revocation is immediate.

**Role matrix.**

| Route                                        | Public | agent | admin |
|----------------------------------------------|:-:|:-:|:-:|
| `POST /auth/login`                           | ✓ |   |   |
| `GET /health`, `/`, `/api/docs`              | ✓ |   |   |
| `GET /auth/me`                               |   | ✓ | ✓ |
| `GET /agents`, `/agents/stats`, `/agents/:id/*` |   | ✓ | ✓ |
| `POST /agents`, `DELETE /agents/:id`          |   |   | ✓ |
| `GET /transactions`, `/transactions/:id`, `/:id/breakdown` |   | ✓ | ✓ |
| `POST /transactions`                          |   | ✓ | ✓ |
| `PATCH /transactions/:id/stage`               |   |   | ✓ |
| `DELETE /transactions/:id`                    |   |   | ✓ |

Stage advancement (the action that triggers commission calculation) is admin-only. This is the concrete answer to "an unauthenticated actor could flip a transaction to `completed`": they now can't reach the route without a token, and even with a valid agent token the `RolesGuard` stops them.

**Audit trail (embedded).** Every transaction carries:
- `createdBy: ObjectId<User>` — the authenticated user at the moment of creation.
- `stageHistory: [{ stage, at: Date, by: ObjectId<User> }]` — append-only, populated at create time with the initial `agreement` entry and pushed on each successful stage transition. Answers "who approved this transaction?" directly with no join, no separate audit-log collection.

Because `stageHistory.by` points at a soft-deletable user, history never silently loses its actor even if the manager leaves the agency. The audit trail is embedded (not a separate collection) for the same reason the commission breakdown is embedded: per-transaction immutability is easier to guarantee when the facts live next to the transaction itself.

### 1.6f Hardening — helmet and rate limiting

- **`helmet()`** is the first middleware in the pipeline (`app.use(helmet())` in `main.ts`). Sets `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy`, etc. Stock defaults — the API is JSON-only and the only served HTML is Swagger UI on the same origin.
- **`ThrottlerModule`** is registered globally with a 60 requests / 60 seconds per-IP bucket. Enough for an office of a few dozen staff clicking through the dashboard; tight enough that a dumb scraper gives up quickly.
- **Login** layers on `@Throttle({ default: { limit: 5, ttl: 60_000 } })`. An attacker testing 5 passwords per minute on a bcrypt-protected hash is not a meaningful threat; the rate limit closes what little window remains.

### 1.6g Pagination and dashboard aggregation

Every list endpoint that can grow unboundedly ships paginated. `GET /transactions` accepts `?limit=` (1–100, default 20), `?offset=` (default 0) and an optional `?stage=` filter, all validated by `QueryTransactionsDto`. The response is a uniform envelope:

```json
{ "items": [...], "total": 1_284, "limit": 20, "offset": 40, "hasMore": true }
```

- **Offset-based, not cursor-based.** The expected dataset is mid-hundreds per office, not millions. Offset maps one-to-one to `?page=N` in the URL, which is what the UI needs for shareable deep links. If the collection ever grows past ~50k rows we can switch to keyset pagination by `createdAt` without breaking the wire format — the frontend already reads `hasMore` instead of computing page counts.
- **Hard upper bound on `limit`.** Without a ceiling a single `?limit=999999` request would defeat the entire purpose of pagination; the DTO validator caps it at 100 and the service re-clamps defensively so an internal bypass of validation can't widen the window.
- **Stable ordering.** Pagination is only meaningful with deterministic order; we sort by `createdAt DESC, _id DESC` so rows inserted between requests don't shift page boundaries and the `_id` tiebreaker guarantees uniqueness on the `createdAt` key.
- **Counts + revenue don't piggyback on the list.** Previously the frontend derived stage counts and agency revenue by iterating `state.transactions`. With pagination that array is now a window, not the whole collection, so those derivations would silently lie. The fix is a dedicated `GET /transactions/stats` endpoint: a single aggregation returning `{ counts: { agreement, earnest_money, title_deed, completed }, totalAgencyRevenue, totalCompletedServiceFee, total }`. The dashboard reads from this; the list page reads from pagination metadata. Two responsibilities, two endpoints.
- **Frontend hybrid UX.** The `/islemler` page uses an `IntersectionObserver` sentinel (`rootMargin: 200px`) for infinite scroll *and* reflects the currently-loaded depth in the URL as `?page=N&stage=X` (via `router.replace` so the back button doesn't fire for every scroll step). Opening `/islemler?page=3&stage=completed` replays pages 1–3 sequentially so the shared URL reproduces the sender's view without forcing them to scroll from the top.
- **Optimistic counters on mutation.** Create / delete bump `pagination.total` locally so the "Tümü (N)" chip updates without a round-trip, and then fire `fetchStats()` in the background so any discrepancy is reconciled within one tick.

### 1.6h Indexing strategy

With pagination in place, every extra millisecond of query planning compounds over thousands of list refreshes. The transaction collection carries **four purpose-built compound indexes** designed against the exact query shapes the service layer emits, all following the ESR rule (Equality prefix → Sort → Range):

| Index | Serves |
|-------|--------|
| `{ createdAt: -1, _id: -1 }` | Unfiltered paginated list (`find({}).sort(…)`) — `_id` tiebreaker keeps page boundaries stable under concurrent inserts. |
| `{ stage: 1, createdAt: -1, _id: -1 }` | Stage-chip click → `find({ stage }).sort(…)` + `countDocuments({ stage })`. The equality prefix on `stage` is what makes this index "win" the planner over the previous one. |
| `{ listingAgent: 1, stage: 1, createdAt: -1 }` | `find({ stage: COMPLETED, $or: [{ listingAgent }, …] })` for earnings, and the agent transactions view. MongoDB resolves `$or` as an **index union** — one plan per branch — so we need one compound per agent side. |
| `{ sellingAgent: 1, stage: 1, createdAt: -1 }` | Same as above, other side of the `$or`. |

- **Why not just `@Prop({ index: true })` on every field?** Single-field indexes on `stage` alone are low-selectivity (4 values, ~quarter of the collection per value) and can't satisfy the `sort(createdAt)` — the planner would still do an in-memory sort. The ESR compounds above are what actually eliminate the slow path.
- **Write-amplification trade-off.** Four indexes means every insert writes four extra B-tree entries. For this workload (a few dozen writes/day, thousands of reads) that's a clearly favourable exchange.
- **Protected against accidental removal.** `transaction.schema.spec.ts` has dedicated tests that assert each of these indexes is still declared; dropping one in a future refactor fails CI rather than silently bringing back collection scans.
- **Users and Agents** keep only their existing indexes (partial unique email on `User` where `deletedAt: null`; the baseline `_id`). Their collections stay small enough that adding more indexes would cost more on writes than it saves on reads.

### 1.7 API surface

| Method | Path                           | Auth | Purpose                                   |
|--------|--------------------------------|------|-------------------------------------------|
| GET    | `/`                            | public | API metadata (name, version, docs, health) |
| GET    | `/health`                      | public | Liveness + mongo connectivity             |
| GET    | `/api/docs`                    | public | Swagger UI                                |
| POST   | `/auth/login`                  | public (5/min) | Email + password → Bearer token  |
| GET    | `/auth/me`                     | any authenticated | Current user claims           |
| POST   | `/agents`                      | admin | Create agent                             |
| GET    | `/agents`                      | any authenticated | List active agents        |
| GET    | `/agents/stats`                | any authenticated | Agents + aggregate counts + total earnings |
| GET    | `/agents/:id`                  | any authenticated | Get one agent (incl. soft-deleted) |
| GET    | `/agents/:id/earnings`         | any authenticated | Aggregated earnings across completed tx |
| GET    | `/agents/:id/transactions`     | any authenticated | Agent-lens transaction feed |
| DELETE | `/agents/:id`                  | admin | Soft-delete agent (idempotent)           |
| POST   | `/transactions`                | agent + admin | Create transaction (`agreement` start) |
| GET    | `/transactions`                | any authenticated | **Paginated** list (`?limit=`, `?offset=`, `?stage=`) |
| GET    | `/transactions/stats`          | any authenticated | Aggregate counts + total agency revenue (kuruş) |
| GET    | `/transactions/:id`            | any authenticated | Get one (agents populated) |
| PATCH  | `/transactions/:id/stage`      | admin | Advance to the next stage               |
| GET    | `/transactions/:id/breakdown`  | any authenticated | Commission breakdown (completed only) |
| DELETE | `/transactions/:id`            | admin | Delete a transaction                    |

### 1.8 Testing

Jest unit tests cover:
- `CommissionService` — §4.3 scenarios 1 & 2, edge cases (fee=0, negative fee, float drift), sum invariant on odd fees.
- `TransactionsService` — every valid transition, invalid transitions (`400`), terminal state guard, missing transaction (`404`), breakdown fetch before / after completion, optimistic-concurrency collision (`409` on `VersionError`), passthrough of unrelated save errors, **create-time soft-delete integrity** (accepts two active agents, rejects any soft-deleted reference with `400`, collapses same-agent to a single lookup), **pagination** (defaults, stage filter, `hasMore` edge cases, limit/offset clamping), **stats aggregation** (normal result, empty collection, missing fields defensive-defaulted).
- `AgentsService` — `findAll` filters `deletedAt: null`, `findOne` still resolves soft-deleted rows (so populate history works), `remove` soft-deletes on first call and is idempotent on second, missing id still throws `404`, `earnings` aggregation across mixed same-agent and different-agent completed transactions, `stats` delegates to the aggregation pipeline and enforces the `deletedAt: null` match stage, `transactions` projects role + amount (`listing`, `both`, `null` while not yet payout-ready) and keeps working for soft-deleted agents so their history stays accessible.
- `Transaction` schema virtuals — `isPayoutReady` is false until `stage = completed` **and** the breakdown has been populated; `isSameAgent` compares populated / raw refs; JSON output ships both virtuals and hides `__v`. Index tests assert all four ESR compound indexes are still declared so no future refactor can silently bring back collection scans.
- `AppController` — metadata root.

- `AuthService` — login flow (token shape, `Unauthorized` for unknown email or wrong password, no hash leakage in the response).
- `RolesGuard` — missing / empty `@Roles` passes through; required role matches pass; mismatching role or missing `req.user` throws `Forbidden`; multiple roles behave as OR.
- `AllExceptionsFilter` — translates driver-level errors to proper HTTP codes, scrubs duplicate-key values.

Total: **93 unit tests** across 10 suites, all green (`npm test`).

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

- `useTransactionsStore` — holds a **windowed** `transactions[]` (server-paginated), `current`, server-computed `stats`, and `pagination` metadata (`offset / limit / total / hasMore`). Exposes `fetchPage / fetchThroughPage / fetchStats / fetchOne / create / updateStage / remove`. The `counts` and `totalAgencyRevenue` getters read from `stats`, never from the windowed list — this is the key change that lets the dashboard stay honest once the collection grows past a single page.
- `useAgentsStore` — holds `agents[]`, exposes `fetchAll / create / remove / earnings`. `earnings` does **not** mutate the store, it returns the aggregated report directly (it's a query, not state).

Mutations after writes are optimistic-ish: a new agent/transaction is unshifted into the list, `pagination.total` is bumped locally, and `fetchStats()` is fired-and-forgotten to reconcile any drift on the next tick. Stage updates replace the affected row in place.

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
