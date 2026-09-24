# Plan: BentaTrack build

Scope: bentatrack (this file lives at .unlazy/bentatrack/PLAN.md)
Depth: tree 3 (root → branch → leaf)
Mode: orchestrated, sequential fallback

Sources: `docs/SRS V2.pdf` as amended by `docs/SRS-V2-amendments.md` (decisions of 2026-09-24).
Ledgers are generated from `scripts/plan/ledgers.mjs`; edit the ledger directly once a leaf has started.

## Contract

- **Host launch mode:** sequential fallback. One leaf per working session, driven by the user, in the build order below. No parallel dispatch waves are opened, so no ownership claims or leases are used.
- **Toolchain:** Node ≥ 22 (dev machine: 24.17), npm, Windows PowerShell or cmd. Local Postgres 17 via `docker compose` on port 5433. Next.js 16.3 (App Router, Turbopack, `src/proxy.ts` not `middleware.ts`), React 19.2, Prisma 7.10 with `@prisma/adapter-pg`, NextAuth.js v4.24 (stable), Tailwind 4, Vitest 5, Playwright.
- **Running gates:** always from the repo root: `node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900 <ledger>`. First run of a new CHECK needs `--approve` after reading it.
- **Test tagging:** every test that proves a requirement puts its ID in brackets in the title, e.g. `test("[FR-005] sale reduces stock", …)`. `scripts/gates/require-tests.mjs` fails if any listed ID has no passing test or any test fails.
- **Test databases:** integration tests and Playwright use `TEST_DATABASE_URL` (`bentatrack_test`), never the dev database. Playwright's webServer runs a production build on port 3200 against the test DB. Every e2e test runs in both `desktop` and `phone` projects.

### Interfaces

- **Schema names:** exactly as checked by `scripts/gates/check-schema.mjs`: models `User, Category, Supplier, Product, Sale, SaleItem, Refund, RefundItem, InventoryChange`; enums `Role {OWNER, STAFF}`, `PaymentMethod {CASH, GCASH}`, `DiscountType {AMOUNT, PERCENT}`, `InventoryChangeType {SALE, RESTOCK, EDIT, REFUND, REMOVAL}`.
- **Money:** integer centavos (`Int`) everywhere; format with `src/lib/money.ts` as `₱1,234.50`. Never floats.
- **Time:** stored as UTC `DateTime`; report periods computed in `Asia/Manila`, weeks start Monday (`src/lib/dates.ts`).
- **Product status:** computed, not stored: `stockStatus(qty, threshold)` in `src/lib/stock-status.ts` → `OUT_OF_STOCK` if qty = 0, `LOW_STOCK` if 0 < qty ≤ threshold, else `ACTIVE`. Default threshold 5.
- **Snapshots:** `SaleItem` and `InventoryChange` copy `productName`/`productCode`; their `productId` is nullable with `onDelete: SetNull`, so hard-deleting a discontinued product keeps history (A2).
- **IDs:** `Sale`, `Refund`, and `InventoryChange` ids are UUIDs generated on the client so offline replays are idempotent. Other models use `cuid()`.
- **Offline-capable commands:** `recordSale`, `refundSale`, `restockProduct`. Each takes `{ id: uuid, occurredAt: ISO string, ... }`, is idempotent by `id` (a replay returns the original result without re-applying), and is called from the client through `runCommand(name, payload)` in `src/lib/commands.ts`. Leaf 2.1 creates an online-only `runCommand`; leaf 6.2 adds the outbox behind the same signature.
- **Server action result:** `type Result<T> = { ok: true; data: T } | { ok: false; error: { code: "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "OFFLINE"; message: string; fieldErrors?: Record<string, string[]> } }` from `src/lib/result.ts`. Actions never throw to the client.
- **Validation:** every server action parses input with a Zod schema from its feature's `schemas.ts` before touching the database.
- **Inventory log:** `recordInventoryChange(tx, { productId, type, quantityChange, userId, saleId?, refundId?, note?, occurredAt })` in `src/lib/inventory-log.ts` computes `stockAfter` and snapshots, inside the caller's transaction.
- **Low-stock alerts:** every stock-changing action returns `lowStockAlerts: { productId, name, quantity, threshold }[]` for products that crossed into LOW_STOCK or OUT_OF_STOCK. Client calls `showLowStockAlerts()` from `src/components/layout/low-stock-alerts.tsx` (leaf 3.1). The shell also shows a summary on app open (FR-007).
- **Image storage:** `storeProductImage(file) → url` in `src/lib/storage.ts` uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, else local disk `.uploads/products/` (dev/test only), served to signed-in users by `src/app/(app)/products/images/[file]/route.ts`. (Amended in leaf 3.2: `next start` only serves files present in `public/` at startup.)

### Permissions (capability matrix)

`can(role, capability)` in `src/lib/permissions.ts`; checked in `src/proxy.ts` for pages and again inside every server action.

| Capability | OWNER | STAFF |
|---|---|---|
| `sales.create`, `sales.read`, `refunds.create` | ✓ | ✓ |
| `products.read`, `products.create`, `products.update`, `inventory.restock`, `inventory.history`, `categories.read`, `search` | ✓ | ✓ |
| `dashboard.staff` | ✓ | ✓ |
| `products.delete`, `products.cost` (purchase price, profit), `suppliers.read`, `suppliers.manage`, `categories.manage`, `reports.read`, `users.manage`, `dashboard.owner` | ✓ | ✗ |

### Conventions

See `CLAUDE.md` "Coding conventions". Manual gates are reviewed by the team leader (Manuel Thomas Medina) unless the gate names the product owner.

## Current contract inventory

Contract revision: 2 (SRS V2 + amendments of 2026-09-24; rev 2: email login, NextAuth v4, Refund tables confirmed).

| ID | Required outcome or constraint | Owner | Observing gate or manual review | Disposition | Revision |
|---|---|---|---|---|---|
| C1 | FR-001 authorized users add products | 3.2 | leaf-3.2:G1, leaf-3.2:G2 | ACTIVE | 1 |
| C2 | FR-002 product fields incl. barcode (optional, unique) and low-stock threshold | 2.1, 3.2 | leaf-2.1:G2, leaf-2.1:G6, leaf-3.2:G1 | ACTIVE | 1 |
| C3 | FR-003 edit any product | 3.2 | leaf-3.2:G1, leaf-3.2:G2 | ACTIVE | 1 |
| C4 | FR-004 owner permanently deletes discontinued products; history kept via snapshots | 2.1, 3.2 | leaf-2.1:G6, leaf-3.2:G1, leaf-3.2:G2 | ACTIVE | 1 |
| C5 | FR-005 stock reduced automatically on sale | 4.1 | leaf-4.1:G1 | ACTIVE | 1 |
| C6 | FR-006 "Out of Stock" at zero without deleting | 2.1, 3.2 | leaf-2.1:G6, leaf-3.2:G2 | ACTIVE | 1 |
| C7 | FR-007 stock continuously monitored (live status + alert on open) | 2.1, 3.1 | leaf-2.1:G6, leaf-3.1:G1 | ACTIVE | 1 |
| C8 | FR-008 pop-up when a product reaches low stock | 4.1 | leaf-4.1:G2 | ACTIVE | 1 |
| C9 | FR-009 low stock flagged separately from out of stock | 2.1, 3.2 | leaf-2.1:G6, leaf-3.2:G2 | ACTIVE | 1 |
| C10 | FR-010 changes logged with date and time | 2.1, 3.4 | leaf-2.1:G6, leaf-3.4:G1 | ACTIVE | 1 |
| C11 | FR-011 affected product recorded per change | 2.1, 3.4 | leaf-2.1:G6, leaf-3.4:G1 | ACTIVE | 1 |
| C12 | FR-012 history of sales, restocks, edits, refunds, removals per product | 3.2, 3.4, 4.1, 4.2, 7.1 | leaf-3.2:G1 (EDIT-LOG), leaf-3.4:G1, leaf-4.1:G1, leaf-4.2:G1, leaf-7.1:G1 | ACTIVE | 1 |
| C13 | FR-013 product and quantity per sale (multi-item, A4) | 4.1 | leaf-4.1:G1 | ACTIVE | 1 |
| C14 | FR-014 unit price, total, date, time | 4.1 | leaf-4.1:G1 | ACTIVE | 1 |
| C15 | FR-015 staff member recorded | 4.1 | leaf-4.1:G1 | ACTIVE | 1 |
| C16 | FR-016 optional free-text customer info (B9) | 4.1 | leaf-4.1:G1 | ACTIVE | 1 |
| C17 | FR-017 whole-sale discount, amount or percent, capped at subtotal (B8) | 4.1 | leaf-4.1:G1 | ACTIVE | 1 |
| C18 | FR-018 payment method Cash or GCash only (A1) | 2.1, 4.1 | leaf-2.1:G2, leaf-4.1:G1 | ACTIVE | 1 |
| C19 | FR-019 no card payments | 2.1, 4.1 | leaf-2.1:G2 (enum is exactly CASH, GCASH), leaf-4.1:G1 | ACTIVE | 1 |
| C20 | FR-020 no automatic receipts (exclusion) | root | root:R2 review that no receipt feature was built | ACTIVE | 1 |
| C21 | FR-021 daily/weekly/monthly/yearly reports, Manila time, Monday weeks, refunds on refund date (B7) | 5.1 | leaf-5.1:G1, leaf-5.1:G2 | ACTIVE | 1 |
| C22 | FR-022 best-selling products report | 5.1 | leaf-5.1:G1, leaf-5.1:G2 | ACTIVE | 1 |
| C23 | FR-023 owner dashboard: total products, available stock, low stock | 5.2 | leaf-5.2:G1, leaf-5.2:G2 | ACTIVE | 1 |
| C24 | FR-023a staff dashboard: today's sales, low stock, recent transactions only (A6) | 5.2 | leaf-5.2:G1, leaf-5.2:G2 | ACTIVE | 1 |
| C25 | FR-024 recent transactions and best sellers on dashboard | 5.2 | leaf-5.2:G1, leaf-5.2:G2 | ACTIVE | 1 |
| C26 | FR-025 today's sales summary | 5.2 | leaf-5.2:G1, leaf-5.2:G2 | ACTIVE | 1 |
| C27 | FR-026 search by name | 3.5 | leaf-3.5:G1, leaf-3.5:G3 | ACTIVE | 1 |
| C28 | FR-027 search by code | 3.5 | leaf-3.5:G1, leaf-3.5:G3 | ACTIVE | 1 |
| C29 | FR-028 barcode lookup: scanner (keyboard) and phone camera | 3.5 | leaf-3.5:G1, leaf-3.5:G3; camera on real devices: leaf-3.5:G4 (manual) | ACTIVE | 1 |
| C30 | FR-029 no QR scanning | 3.5 | leaf-3.5:G2 | ACTIVE | 1 |
| C31 | FR-030 password for every account | 2.2 | leaf-2.2:G1, leaf-2.2:G3 | ACTIVE | 1 |
| C32 | FR-031 owner full access incl. suppliers | 2.2, 3.3 | leaf-2.2:G2, leaf-3.3:G1 | ACTIVE | 1 |
| C33 | FR-032 staff limits: no delete, cost, suppliers, reports, categories mgmt, users (A7) | 2.2, 2.3, 3.1, 3.2, 3.3, 5.1 | leaf-2.2:G2, leaf-2.3:G1, leaf-3.1:G1, leaf-3.2:G1, leaf-3.3:G1, leaf-5.1:G1 | ACTIVE | 1 |
| C34 | FR-033 exactly two roles | 2.1, 2.2 | leaf-2.1:G2, leaf-2.2:G2 | ACTIVE | 1 |
| C35 | FR-034 record sales, refunds, restocks offline | 6.2 | leaf-6.2:G1, leaf-6.2:G2 | ACTIVE | 1 |
| C36 | FR-035 automatic sync on reconnect | 6.2 | leaf-6.2:G1, leaf-6.2:G2 | ACTIVE | 1 |
| C37 | FR-036 no offline data lost | 6.2 | leaf-6.2:G1, leaf-6.2:G2 | ACTIVE | 1 |
| C38 | FR-037 per-product low-stock threshold, default 5 (B1) | 2.1 | leaf-2.1:G6 | ACTIVE | 1 |
| C39 | FR-038 restock action (B2) | 3.4 | leaf-3.4:G1, leaf-3.4:G2 | ACTIVE | 1 |
| C40 | FR-039 full or partial refunds restore stock (B3) | 4.2 | leaf-4.2:G1, leaf-4.2:G2 | ACTIVE | 1 |
| C41 | FR-040 refund never exceeds quantity sold | 4.2 | leaf-4.2:G1 | ACTIVE | 1 |
| C42 | FR-041 owner manages supplier records (B4) | 3.3 | leaf-3.3:G1, leaf-3.3:G2 | ACTIVE | 1 |
| C43 | FR-042 product references a supplier; owner-only visibility | 2.1, 3.2, 3.3 | leaf-2.1:G2, leaf-3.2:G1, leaf-3.3:G1 | ACTIVE | 1 |
| C44 | FR-043 owner manages categories; in-use category not deletable (B5) | 3.3 | leaf-3.3:G1, leaf-3.3:G2 | ACTIVE | 1 |
| C45 | FR-044 unique email login (B6) | 2.1, 2.2 | leaf-2.1:G2, leaf-2.2:G1 | ACTIVE | 2 |
| C46 | FR-045 owner creates, resets, deactivates accounts | 2.3 | leaf-2.3:G1, leaf-2.3:G2 | ACTIVE | 1 |
| C47 | FR-046 passwords ≥ 8 chars, stored hashed | 2.2, 2.3 | leaf-2.2:G1, leaf-2.3:G1 | ACTIVE | 1 |
| C48 | FR-047 gross profit, owner only; products without cost excluded | 5.1 | leaf-5.1:G1 | ACTIVE | 1 |
| C49 | FR-048 no report export (exclusion) | root | root:R2 review | ACTIVE | 1 |
| C50 | FR-049 product/supplier/category/user changes need a connection | 6.2 | leaf-6.2:G1 | ACTIVE | 1 |
| C51 | FR-050 online login once, then session works offline | 6.1 | leaf-6.1:G2 | ACTIVE | 1 |
| C52 | FR-051 online/offline indicator and pending count | 6.2 | leaf-6.2:G2 | ACTIVE | 1 |
| C53 | §3.4 user told when sync completes or fails | 6.2 | leaf-6.2:G2 (SYNC-NOTIFY) | ACTIVE | 1 |
| C54 | §3.4 secure, encrypted transport (HTTPS/TLS, D5) | 7.2 | leaf-7.2:G2 | OWNER_DECISION | 1 |
| C55 | §5.1 dashboard and product pages load < 2 s (D4) | 7.1 | leaf-7.1:G2 | ACTIVE | 1 |
| C56 | §5.1 search < 500 ms at 5,000 products (D4) | 3.5 | leaf-3.5:G1 | ACTIVE | 1 |
| C57 | §5.1 stock updates immediately after a sale | 4.1 | leaf-4.1:G2 | ACTIVE | 1 |
| C58 | §5.1 performance consistent online and offline | 7.1 | leaf-7.1:G3 (manual, device) | ACTIVE | 1 |
| C59 | §5.2 every action tied to the user who did it | 2.1, 7.1 | leaf-2.1:G2 (userId fields), leaf-7.1:G1 | ACTIVE | 1 |
| C60 | §5.3 keeps working offline, changes saved on device first | 6.1, 6.2 | leaf-6.1:G2, leaf-6.2:G1, leaf-6.2:G2 | ACTIVE | 1 |
| C61 | §2.5/§3.1 text labels with icons on all buttons and menus | 3.1 | leaf-3.1:G1 (UI-LABELS) | ACTIVE | 1 |
| C62 | §2.5 light and dark themes | 3.1 | leaf-3.1:G1 (UI-THEME) | ACTIVE | 1 |
| C63 | §2.5/§3.1 white/brown, simple, minimal, business-appropriate look | 3.1 | leaf-3.1:G2 (manual) | ACTIVE | 1 |
| C64 | §2.5 Estetika logo: placeholder wordmark now, official logo from owner (D3) | 3.1 | leaf-3.1:G1 (UI-LOGO); official file: owner | OWNER_DECISION | 1 |
| C65 | §3.1/§5.4 consistent layout on desktop, tablet, phone | all e2e | every e2e gate runs desktop + phone projects; node-*:N4 | ACTIVE | 1 |
| C66 | §2.5 a website, not a native app (installable PWA) | 6.1 | leaf-6.1:G2 (PWA-MANIFEST) | ACTIVE | 1 |
| C67 | §3.1 all listed screens exist | 1.1 + feature leaves | GATES.md:G10, each feature's e2e gate | ACTIVE | 1 |
| C68 | §5.4 room to add receipts or delivery later without redesign | root | root:R2 architecture review | ACTIVE | 1 |
| C69 | §2.4 stack (with D2 substitutions: Serwist, bcryptjs; NextAuth v4) | 1.1 | GATES.md:G1 | ACTIVE | 2 |
| C70 | §2.4 deployed on Vercel + Neon + Vercel Blob | 7.2 | leaf-7.2:G2, leaf-7.2:G3 | OWNER_DECISION | 1 |
| C71 | §6.1 schema as amended (C1–C7) | 2.1 | leaf-2.1:G2, leaf-2.1:G3 | ACTIVE | 1 |
| C72 | §2.1 system flow works end to end | 7.1 | leaf-7.1:G1, root:R3 | ACTIVE | 1 |
| C73 | Staff-created products hide cost; flagged "needs cost" for owner (A7 follow-on) | 3.2, 5.2 | leaf-3.2:G1, leaf-5.2:G1 | ACTIVE | 1 |
| C74 | Product images stored (Blob in prod, disk in dev) (D2) | 3.2 | leaf-3.2:G1 (IMG-1) | ACTIVE | 1 |
| C75 | Project installs, type-checks, lints, builds, starts, tests | 1.1 | GATES.md:G1–G10 | ACTIVE | 1 |
| C76 | Guest users / public catalog | — | — | REMOVED_BY_USER | 1 |
| C77 | Multi-device offline conflict handling (one device at a time) | — | — | REMOVED_BY_USER | 1 |

### Handoffs: requirements that no command can fully verify

These keep a manual gate or wait on the product owner. They are visible, not dropped.

| Row | Why it can't be a runnable gate | Who closes it |
|---|---|---|
| C20, C49 | Exclusions: nothing is built, so there is nothing to execute. Checked by reviewing the finished feature list. | Team leader at root:R2 |
| C29 (camera part) | Camera decoding needs a real camera and a printed barcode; headless browsers can't provide one. Keyboard-wedge scanners are automated. | Team, leaf-3.5:G4 |
| C54, C70 | Needs the owner's Vercel, Neon, and Blob accounts. The check (`check-deploy.mjs`) is runnable once `PRODUCTION_URL` exists. | Product owner provides accounts; team runs leaf-7.2 |
| C58 | "Feels the same" offline vs online is a perception on real hardware. | Team, leaf-7.1:G3 |
| C63 | Visual taste (white/brown, business-appropriate) is a human judgment. | Product owner, leaf-3.1:G2 |
| C64 (official logo) | The owner must supply the file. A text wordmark is used meanwhile. | Product owner |
| C68 | Extensibility is an architecture judgment. | Team leader at root:R2 |
| root:R3 | Demo to the product owner. | Team + product owner |

## State vocabulary

Leaf state is exactly one of:

- WAITING: at least one id in Needs is not VERIFIED
- READY: dependencies are VERIFIED
- IN-FLIGHT: being worked on, not yet parent-verified
- VERIFIED: parent `--reverify` passed and manual gates were reviewed
- ABANDONED: a required gate has a visible handoff

Branch state is exactly one of OPEN, VERIFIED, or ABANDONED, derived from its ledger.

## Tree

- 1 BentaTrack build .................... .unlazy/bentatrack/GATES.md
  - 1.1 Project setup ................... GATES.md (repo root)
  - 2 Data and access ................... gates/node-2.md
    - 2.1 Data model, migrations, seed .. gates/leaf-2.1.md
    - 2.2 Authentication and roles ...... gates/leaf-2.2.md
    - 2.3 User account management ....... gates/leaf-2.3.md
  - 3 Inventory ......................... gates/node-3.md
    - 3.1 App shell and design system ... gates/leaf-3.1.md
    - 3.3 Categories and suppliers ...... gates/leaf-3.3.md
    - 3.2 Products ...................... gates/leaf-3.2.md
    - 3.4 Restock and inventory history . gates/leaf-3.4.md
    - 3.5 Search and barcode scanning ... gates/leaf-3.5.md
  - 4 Sales ............................. gates/node-4.md
    - 4.1 Checkout ...................... gates/leaf-4.1.md
    - 4.2 Sales history and refunds ..... gates/leaf-4.2.md
  - 5 Reporting ......................... gates/node-5.md
    - 5.1 Sales reports ................. gates/leaf-5.1.md
    - 5.2 Owner and staff dashboards .... gates/leaf-5.2.md
  - 6 Offline ........................... gates/node-6.md
    - 6.1 PWA shell and offline catalog . gates/leaf-6.1.md
    - 6.2 Offline outbox and sync ....... gates/leaf-6.2.md
  - 7 Quality and release ............... gates/node-7.md
    - 7.1 End-to-end flows, performance . gates/leaf-7.1.md
    - 7.2 Deployment .................... gates/leaf-7.2.md

## Leaf dispatch table

Build order is top to bottom. `Owns` mirrors each ledger's `OWNS:` header. In sequential mode a later leaf may take over a file from a VERIFIED earlier leaf only through a logged plan amendment (planned: 6.2 takes `src/lib/commands.ts` from 2.1).

| Leaf | Owns | Needs | Tier | Planned wave | State |
|---|---|---|---|---|---|
| 1.1 | see GATES.md OWNS | - | mechanical | 1 | VERIFIED |
| 2.1 | prisma/schema.prisma, prisma/migrations/\*\*, prisma/seed.ts, src/lib/db.ts, src/lib/money.ts, src/lib/stock-status.ts, src/lib/inventory-log.ts, src/lib/commands.ts, src/lib/result.ts, tests/integration/helpers/\*\*, tests/integration/data/\*\*, tests/unit/data/\*\*, package.json | 1.1 | judgment | 2 | VERIFIED |
| 2.2 | src/lib/auth.ts, src/lib/permissions.ts, src/proxy.ts, src/app/(auth)/\*\*, src/app/api/auth/\*\*, src/types/\*\*, playwright.config.ts, tests/e2e/fixtures/\*\*, tests/e2e/auth/\*\*, tests/unit/auth/\*\*, tests/integration/auth/\*\* | 2.1 | judgment | 3 | VERIFIED |
| 3.1 | src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, src/app/(app)/layout.tsx, src/components/layout/\*\*, src/components/ui/\*\*, public/brand/\*\*, .tastemaker/\*\*, docs/design/\*\*, src/app/(auth)/login/\*\*, src/app/(auth)/forbidden/\*\*, tests/e2e/shell/\*\*, tests/unit/shell/\*\* | 2.2 | judgment | 4 | VERIFIED |
| 2.3 | src/features/users/\*\*, src/app/(app)/users/\*\*, tests/integration/users/\*\*, tests/e2e/users/\*\* | 2.2, 3.1 | mechanical | 5 | VERIFIED |
| 3.3 | src/features/categories/\*\*, src/features/suppliers/\*\*, src/app/(app)/categories/\*\*, src/app/(app)/suppliers/\*\*, tests/integration/catalog/\*\*, tests/e2e/catalog/\*\* | 2.2, 3.1 | mechanical | 5 | VERIFIED |
| 3.2 | src/features/products/\*\*, src/app/(app)/products/\*\*, src/lib/storage.ts, tests/integration/products/\*\*, tests/e2e/products/\*\* | 3.3 | judgment | 6 | VERIFIED |
| 3.4 | src/features/inventory/\*\*, src/app/(app)/inventory-history/\*\*, tests/integration/inventory/\*\*, tests/e2e/inventory/\*\* | 3.2 | mechanical | 7 | VERIFIED |
| 3.5 | src/features/search/\*\*, src/components/scanner/\*\*, tests/integration/search/\*\*, tests/e2e/search/\*\*, tests/unit/search/\*\* | 3.2 | judgment | 7 | IN-FLIGHT |
| 4.1 | src/features/sales/\*\*, src/app/(app)/checkout/\*\*, tests/unit/sales/\*\*, tests/integration/sales/\*\*, tests/e2e/checkout/\*\* | 3.4, 3.5 | judgment | 8 | WAITING |
| 4.2 | src/features/refunds/\*\*, src/app/(app)/sales/\*\*, tests/integration/refunds/\*\*, tests/e2e/refunds/\*\* | 4.1 | mechanical | 9 | WAITING |
| 5.1 | src/features/reports/\*\*, src/lib/dates.ts, src/app/(app)/reports/\*\*, src/components/charts/\*\*, tests/unit/reports/\*\*, tests/integration/reports/\*\*, tests/e2e/reports/\*\* | 4.2 | judgment | 10 | WAITING |
| 5.2 | src/features/dashboard/\*\*, src/app/(app)/dashboard/\*\*, tests/integration/dashboard/\*\*, tests/e2e/dashboard/\*\* | 5.1 | mechanical | 11 | WAITING |
| 6.1 | next.config.ts, src/app/sw.ts, src/app/manifest.ts, src/app/offline/\*\*, src/app/serwist/\*\*, src/lib/offline/db.ts, src/lib/offline/catalog.ts, public/icons/\*\*, tests/unit/offline/\*\*, tests/e2e/offline/\*\* | 3.5 | judgment | 8 | WAITING |
| 6.2 | src/lib/offline/outbox.ts, src/lib/offline/sync.ts, src/lib/commands.ts, src/app/api/sync/\*\*, src/components/sync/\*\*, tests/unit/sync/\*\*, tests/integration/sync/\*\*, tests/e2e/sync/\*\* | 6.1, 4.2 | judgment | 10 | WAITING |
| 7.1 | tests/e2e/flows/\*\*, tests/perf/\*\*, prisma/seed-demo.ts, scripts/gates/perf/\*\* | 2.3, 5.2, 6.2 | judgment | 12 | WAITING |
| 7.2 | docs/DEPLOY.md, src/app/api/health/\*\*, scripts/gates/check-deploy.mjs, tests/integration/health/\*\*, vercel.json | 7.1 | judgment | 13 | WAITING |

**Recommended sequential order:** 1.1 → 2.1 → 2.2 → 3.1 → 2.3 → 3.3 → 3.2 → 3.4 → 3.5 → 4.1 → 4.2 → 5.1 → 5.2 → 6.1 → 6.2 → 7.1 → 7.2. Close each branch's `node-*.md` ledger when its last child is VERIFIED.

## Status log

Append events to `.unlazy/bentatrack/status.log` (git-ignored):

```text
node .claude/skills/unlazy/scripts/gate-check.mjs --scope bentatrack --log "leaf-2.1 started"
node .claude/skills/unlazy/scripts/gate-check.mjs --scope bentatrack --log "leaf-2.1 verified"
```

Record plan amendments, leaf start, parent verification, abandonment, and branch integration. Apply State changes only in the dispatch table above.
