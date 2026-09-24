@AGENTS.md

# BentaTrack

Web-based inventory and sales system for **Estetika**, a boutique in Calbayog City that currently uses a notebook and calculator. An Owner/Administrator and Inventory/Sales Staff use it on phones, tablets, and desktops, and it keeps working offline, syncing when back online.

Full requirements are in `docs/SRS V2.pdf` as amended by `docs/SRS-V2-amendments.md` (amendments win). The build plan is in `.unlazy/bentatrack/PLAN.md`.

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 + PostgreSQL (`@prisma/adapter-pg`) · Auth.js v5 (credentials) + bcryptjs · Zod 4 · Dexie (IndexedDB) + Serwist (PWA) · html5-qrcode · Chart.js · next-themes · lucide-react · sonner · date-fns + @date-fns/tz · Vercel + Neon + Vercel Blob. Tests: Vitest (unit + integration), Playwright (e2e, desktop + phone).

## Commands

| Task | Command |
|---|---|
| Install | `npm install` (then `cp .env.example .env` and fill it in) |
| Local database | `npm run db:up` (Docker Desktop must be running; Postgres on port 5433) |
| Migrate / seed | `npm run db:migrate` · `npm run db:seed` |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Type-check | `npm run typecheck` |
| Lint / format | `npm run lint` · `npm run format` |
| Unit + integration tests | `npm test` |
| End-to-end tests | `npm run test:e2e` |
| Run a leaf's gates | `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 <ledger>` |

## Folder structure

- `src/app/`: routes only. `(auth)/login`, `(app)/*` for signed-in pages, `api/*` for route handlers, `offline/` fallback page. Keep pages thin: fetch through `features/*/queries.ts`, mutate through `features/*/actions.ts`.
- `src/features/<feature>/`: `schemas.ts` (Zod), `actions.ts` (server actions), `queries.ts` (server reads), plus feature components.
- `src/components/ui/` shared primitives. `src/components/layout/` app shell, nav, alerts.
- `src/lib/`: cross-cutting helpers (`db`, `auth`, `permissions`, `money`, `dates`, `stock-status`, `inventory-log`, `commands`, `result`, `storage`). `src/lib/offline/`: Dexie DB, outbox, sync.
- `src/generated/prisma/`: generated client (git-ignored; never edit).
- `prisma/`: schema, migrations, seed. `tests/unit`, `tests/integration` (real Postgres test DB), `tests/e2e`.
- `scripts/gates/`: gate oracles. `.unlazy/bentatrack/`: PLAN.md and per-leaf gate ledgers.

## Coding conventions

- TypeScript strict; no `any`. Files `kebab-case.ts`, components `PascalCase`, functions `camelCase`.
- Server components by default; add `"use client"` only where interactivity needs it.
- `async/await` only, no `.then()` chains. Wrap multi-row writes in `prisma.$transaction`.
- Every server action: check the session and `can(role, capability)`, parse input with Zod, return `Result<T>` from `src/lib/result.ts`. Never throw to the client or leak stack traces.
- Money is integer centavos; format with `src/lib/money.ts`. Times stored UTC; reports use Asia/Manila, weeks start Monday.
- UI: every button and menu item shows a text label with its icon (never icon-only). Support light and dark themes.
- Tests that prove a requirement put its ID in the title: `test("[FR-005] sale reduces stock", …)`.

## Domain terms

- **Roles:** `OWNER` (full access) and `STAFF` (sales, refunds, restock, add/edit products; no delete, costs, suppliers, reports, categories, or users).
- **Product status** (computed): Active, Low Stock (0 < qty ≤ threshold, default 5), Out of Stock (0). Out of stock ≠ discontinued; only the owner deletes discontinued products.
- **Sale** has many **SaleItems**; whole-sale discount (amount or percent); payment `CASH` or `GCASH` only.
- **Refund** returns stock and money for part or all of a sale. **Restock** adds received units.
- **InventoryChange** logs `SALE | RESTOCK | EDIT | REFUND | REMOVAL` with user, delta, stock after, and product name/code snapshots.
- **Offline:** sales, refunds, and restocks queue in an IndexedDB outbox and replay idempotently (client-generated UUIDs). Other edits need a connection.

## Rules

- Never read, print, or copy values from `.env`. Refer to variables by name only; add new ones to `.env.example` with placeholders.
- Don't add, remove, or upgrade packages without asking first.
- Prefer the smallest edit that works; no large rewrites or drive-by refactors.
- Don't mark work done without running its gates and seeing them pass. Report failures honestly.
- Don't weaken, delete, or skip a gate or test to make it pass. Record `ABANDON:` with a reason instead.
- Stay inside the current leaf's `OWNS:` paths. Changing another leaf's files needs a logged plan amendment.

## Workflow

1. Pick the next READY leaf in the PLAN dispatch table (recommended order is listed there). Set it IN-FLIGHT.
2. Read its ledger in `.unlazy/bentatrack/gates/` and the SRS sections it cites.
3. Before changes touching more than 3 files, explain the plan and wait for OK.
4. Work in four passes: build it completely, reread as an expert, hunt defects, polish.
5. Run the leaf's gates, then mark the leaf VERIFIED in PLAN.md and log it. Close the branch ledger when its last leaf is verified.
