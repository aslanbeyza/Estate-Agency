# Estate Agency — Technical Case

A full-stack application that automates the post-agreement lifecycle of a real-estate transaction (earnest money → title deed → completed) and automatically distributes the service fee between the agency and the agents involved.

## Repositories / Folders

| Project        | Purpose                                            | Stack |
|----------------|----------------------------------------------------|-------|
| **backend/**   | REST API, commission engine, MongoDB persistence   | NestJS 11, MongoDB Atlas, Mongoose, Jest |
| **frontend/**  | Dashboard + transaction UI + agent reports        | Nuxt 3, Pinia, Tailwind CSS v4 |

## Live deployment

> Fill in once deployed.

- **API**:      `<https://…>`
- **Swagger**:  `<https://…>/api/docs`
- **Frontend**: `<https://…>`

## Quick start (local, both projects)

```bash
# 1) Backend
cd backend
cp .env.example .env
#   → set MONGODB_URI to your Atlas connection string
npm install
npm run start:dev     # → http://localhost:3001

# 2) Frontend (in a second terminal)
cd ../frontend
cp .env.example .env  # optional, default points to localhost:3001
npm install
npm run dev           # → http://localhost:3000
```

Open http://localhost:3000 and create a few agents, then a transaction, then walk it through `agreement → earnest_money → title_deed → completed`. The commission breakdown appears on the transaction detail page once completed.

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

## Testing

```bash
cd backend
npm test
```

24 unit tests across 4 suites cover every commission scenario, every stage transition (valid and invalid), the breakdown guard, and the per-agent earnings aggregation.
