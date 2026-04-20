# Estate Agency Backend

NestJS + MongoDB Atlas backend for the estate agency commission management system.

## Tech stack

- Node.js (LTS, 20+)
- TypeScript
- NestJS 11 (`@nestjs/common`, `@nestjs/mongoose`, `@nestjs/config`, `@nestjs/swagger`)
- Mongoose 9 / MongoDB Atlas
- Jest for unit tests

## Prerequisites

- Node.js LTS (v20+)
- A MongoDB Atlas cluster (free tier is enough)

## Setup

```bash
cp .env.example .env
# Edit .env — set your MONGODB_URI from MongoDB Atlas
npm install
```

## Run

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build && npm run start:prod
```

Server runs on `http://localhost:3001` by default.

- Swagger UI: `http://localhost:3001/api/docs`
- Health: `http://localhost:3001/health`

## Tests

```bash
npm test            # unit tests
npm run test:cov    # unit tests + coverage
```

24 unit tests across 4 suites cover the commission rules, stage transitions, the `getBreakdown` guard, and the per-agent earnings aggregation. See `DESIGN.md §1.8`.

## Environment variables

| Variable       | Description                                  | Example |
|----------------|----------------------------------------------|---------|
| `MONGODB_URI`  | MongoDB Atlas connection string              | `mongodb+srv://user:pwd@cluster.mongodb.net/estate-agency` |
| `PORT`         | Server port                                  | `3001`  |

## API overview

| Method | Path                             | Description |
|--------|----------------------------------|-------------|
| GET    | `/`                              | API metadata |
| GET    | `/health`                        | Liveness + mongo readyState |
| POST   | `/agents`                        | Create agent |
| GET    | `/agents`                        | List agents |
| GET    | `/agents/:id`                    | Get agent |
| GET    | `/agents/:id/earnings`           | Aggregated earnings report |
| DELETE | `/agents/:id`                    | Delete agent |
| POST   | `/transactions`                  | Create transaction (starts at `agreement`) |
| GET    | `/transactions`                  | List all (agents populated) |
| GET    | `/transactions/:id`              | Get one (agents populated) |
| PATCH  | `/transactions/:id/stage`        | Advance to the next stage |
| GET    | `/transactions/:id/breakdown`    | Commission breakdown (completed only) |
| DELETE | `/transactions/:id`              | Delete transaction |

Full interactive documentation is available at `/api/docs` once the server is running.

## Project layout

```
src/
  agents/           AgentsModule
  transactions/     TransactionsModule
  commission/       CommissionModule (pure calculator)
  common/filters/   AllExceptionsFilter (normalised error shape)
  health/           HealthController
  main.ts           bootstrap — ValidationPipe, filter, CORS, Swagger
```

See `DESIGN.md` for architecture details and design rationale.
