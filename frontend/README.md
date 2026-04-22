# Estate Agency Frontend

Nuxt 3 + Pinia + Tailwind CSS frontend for the estate agency commission management system.

## Tech stack

- Nuxt 3 (Vue 3, Nitro, file-based routing)
- Pinia (state management)
- Tailwind CSS v4 + custom utility classes
- TypeScript

## Prerequisites

- Node.js LTS (v20+; CI uses v22)
- Backend running — see [`../backend`](../backend)

## Setup

```bash
cp .env.example .env   # optional — defaults to http://localhost:3001
npm install
```

## Run

```bash
npm run dev
```

Frontend runs on `http://localhost:3000`.

## Build

```bash
npm run build
npm run preview   # preview the built output locally
```

## Environment variables

| Variable                 | Description                                | Default |
|--------------------------|--------------------------------------------|---------|
| `NUXT_PUBLIC_API_BASE`   | Full URL of the backend API                | `http://localhost:3001` |

## Pages

| Path                  | Description |
|-----------------------|-------------|
| `/`                   | Dashboard — KPI cards, stage counts, recent transactions |
| `/islemler`           | Transactions list + stage filter + create form |
| `/islemler/:id`       | Transaction detail — stage timeline, advance button, commission breakdown |
| `/danismanlar`        | Agents list with per-agent performance + transaction history panel |

> The routes and UI labels are in Turkish because the target consultancy operates in Turkey. API contracts and code are in English. See [`../backend/DESIGN.md`](../backend/DESIGN.md) §2.1 for the rationale.

## Project layout

```
app/
  app.vue                        shell (sidebar + topbar + dark mode + global <ToastContainer />)
  pages/
    index.vue                    Dashboard
    islemler/index.vue           Transactions list + create form
    islemler/[id].vue            Transaction detail
    danismanlar/index.vue        Agents with earnings + history
  components/                    StageBadge, StageTimeline, CommissionCard, AgentInfoCard, ToastContainer, EmptyState
  composables/                   useApi, useToast, useStageMeta, useTheme
  stores/                        agents, transactions (Pinia)
  assets/css/main.css            Tailwind layers + utility classes
```

Architectural notes (Pinia store design, composables, toast singleton, error contract with the backend) are in [`../backend/DESIGN.md`](../backend/DESIGN.md) §2.
