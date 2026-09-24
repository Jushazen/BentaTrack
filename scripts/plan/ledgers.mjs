// Source of truth for the per-leaf and per-branch gate ledgers in .unlazy/bentatrack/gates/.
// Regenerate with: node scripts/plan/ledgers.mjs
// Only regenerates ledgers that are still untouched (no evidence recorded yet),
// so re-running never erases gate evidence. Edit ledgers directly once a leaf starts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = ".unlazy/bentatrack/gates";
const LINT = "node .claude/skills/unlazy/scripts/gate-lint.mjs";
const CHECK = "node .claude/skills/unlazy/scripts/gate-check.mjs --root . --cwd . --timeout 900";
const unit = (ids, ...paths) =>
  `node scripts/gates/require-tests.mjs vitest --ids ${ids.join(",")} ${paths.join(" ")}`;
const e2e = (ids, ...paths) =>
  `node scripts/gates/require-tests.mjs playwright --ids ${ids.join(",")} ${paths.join(" ")}`;
const PASS = "REQUIRED TESTS PASSED";

/**
 * @typedef {{ id: string, title: string, check?: string, expect?: string }} Gate
 * @typedef {{ id: string, name: string, owns: string[], scope: string, srs: string, notes?: string[], gates: Gate[] }} Leaf
 */

/** @type {Leaf[]} */
export const LEAVES = [
  {
    id: "2.1",
    name: "Data model, migrations, seed, data helpers",
    owns: [
      "prisma/schema.prisma",
      "prisma/migrations/**",
      "prisma/seed.ts",
      "src/lib/db.ts",
      "src/lib/money.ts",
      "src/lib/stock-status.ts",
      "src/lib/inventory-log.ts",
      "src/lib/commands.ts",
      "src/lib/result.ts",
      "tests/integration/helpers/**",
      "tests/integration/data/**",
      "tests/unit/data/**",
      "package.json",
    ],
    scope:
      "The nine-table Prisma schema from the PLAN contract, its first migration, an idempotent seed, and the shared data helpers every feature uses.",
    srs: "§6.1; amendments A2–A5, B1, C1–C7; FR-002, FR-004, FR-006, FR-009, FR-010, FR-011, FR-037",
    notes: [
      "Start Docker Desktop, then `npm run db:up`.",
      'Add `"postinstall": "prisma generate"` to package.json so fresh clones get the client.',
      "Integration test helper must create/reset the `bentatrack_test` database (e.g. `prisma migrate reset --force` with DATABASE_URL=TEST_DATABASE_URL).",
    ],
    gates: [
      {
        id: "G1",
        title: "local Postgres accepts connections",
        check: "node scripts/gates/check-db.mjs",
        expect: "DB OK",
      },
      {
        id: "G2",
        title: "schema contains every agreed model, field, enum value, and unique constraint",
        check: "node scripts/gates/check-schema.mjs",
        expect: "SCHEMA OK",
      },
      {
        id: "G3",
        title: "migrations apply cleanly and match the schema",
        check: "npx prisma migrate deploy && npx prisma migrate status",
        expect: "Database schema is up to date",
      },
      {
        id: "G4",
        title: "fresh clones generate the Prisma client on install",
        check: "npm pkg get scripts.postinstall",
        expect: "prisma generate",
      },
      {
        id: "G5",
        title: "seed creates the owner and starter categories and is safe to re-run",
        check: unit(["SEED-1", "SEED-2"], "tests/integration/data"),
        expect: PASS,
      },
      {
        id: "G6",
        title:
          "data rules hold: fields and uniqueness, stock status, snapshots survive deletion, history logging, money, idempotent commands",
        check: unit(
          [
            "FR-002",
            "FR-004",
            "FR-006",
            "FR-009",
            "FR-010",
            "FR-011",
            "FR-037",
            "MONEY-1",
            "CMD-1",
          ],
          "tests/unit/data",
          "tests/integration/data",
        ),
        expect: PASS,
      },
    ],
  },
  {
    id: "2.2",
    name: "Authentication and role permissions",
    owns: [
      "src/lib/auth.ts",
      "src/lib/permissions.ts",
      "src/proxy.ts",
      "src/app/(auth)/**",
      "src/app/api/auth/**",
      "src/types/**",
      "playwright.config.ts",
      "tests/e2e/fixtures/**",
      "tests/e2e/auth/**",
      "tests/unit/auth/**",
      "tests/integration/auth/**",
    ],
    scope:
      "Email/password login with NextAuth.js v4 credentials provider (JWT sessions), bcryptjs hashes, role-based route protection in src/proxy.ts (Next 16's renamed middleware), and the capability matrix from the PLAN contract.",
    srs: "§4.8 FR-030–033; amendments A7, B6 (FR-044, FR-046); §5.2; Figure 3",
    notes: [
      "Install browsers once: `npx playwright install chromium`.",
      "Point the Playwright webServer at TEST_DATABASE_URL and seed fixture users in tests/e2e/fixtures.",
      "Read node_modules/next/dist/docs/01-app/02-guides/authentication.md and the proxy.md reference first (Next 16 renamed middleware to proxy).",
      "NextAuth v4 in the App Router: route handler at src/app/api/auth/[...nextauth]/route.ts, getServerSession(authOptions) on the server. Check that next-auth/middleware's withAuth works as a proxy export; otherwise decode the JWT with getToken in src/proxy.ts.",
    ],
    gates: [
      {
        id: "G1",
        title:
          "credentials: passwords required, hashed, min 8 chars, emails unique and case-insensitive, deactivated users rejected",
        check: unit(
          ["FR-030", "FR-044", "FR-046", "AUTH-DEACTIVATED"],
          "tests/unit/auth",
          "tests/integration/auth",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title: "the role capability matrix matches the PLAN contract exactly",
        check: unit(["FR-031", "FR-032", "FR-033"], "tests/unit/auth"),
        expect: PASS,
      },
      {
        id: "G3",
        title:
          "in the browser, login routes by role and protected pages reject the wrong role or no session",
        check: e2e(["FR-030", "FR-033", "NFR-SEC-1"], "tests/e2e/auth"),
        expect: PASS,
      },
    ],
  },
  {
    id: "2.3",
    name: "User account management (owner)",
    owns: [
      "src/features/users/**",
      "src/app/(app)/users/**",
      "tests/integration/users/**",
      "tests/e2e/users/**",
    ],
    scope:
      "Owner creates staff accounts, resets passwords, and deactivates/reactivates accounts; staff cannot reach any of it.",
    srs: "§3.1 User Accounts screen; FR-031, FR-032; amendment B6 (FR-045, FR-046)",
    gates: [
      {
        id: "G1",
        title: "user actions enforce owner-only access, unique emails, and password rules",
        check: unit(
          ["FR-045", "FR-046", "USERS-DUP", "USERS-STAFF-DENIED"],
          "tests/integration/users",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title: "owner creates, resets, deactivates, and reactivates a staff account in the browser",
        check: e2e(["FR-045"], "tests/e2e/users"),
        expect: PASS,
      },
    ],
  },
  {
    id: "3.1",
    name: "App shell and design system",
    owns: [
      "src/app/layout.tsx",
      "src/app/page.tsx",
      "src/app/globals.css",
      "src/app/(app)/layout.tsx",
      "src/components/layout/**",
      "src/components/ui/**",
      "public/brand/**",
      "tests/e2e/shell/**",
      "tests/unit/shell/**",
    ],
    scope:
      "Responsive signed-in shell: role-aware navigation with text+icon labels, light/dark theme, white/brown palette, Estetika wordmark, toaster, and the shared low-stock alert component.",
    srs: "§2.5, §3.1 design requirements, §5.4; FR-007; amendment D3 (placeholder logo)",
    notes: [
      "Use the tastemaker skill for the visual design pass.",
      "Low-stock alert contract: see PLAN contract 'Low-stock alerts'.",
    ],
    gates: [
      {
        id: "G1",
        title:
          "every button and link shows visible text, theme toggle persists, wordmark shows, nav hides owner-only items from staff, low stock is announced on open",
        check: e2e(
          ["UI-LABELS", "UI-THEME", "UI-LOGO", "UI-NAV-ROLE", "FR-007"],
          "tests/e2e/shell",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title:
          "owner or team approves the look (white/brown, simple, business-appropriate) from desktop and phone screenshots in both themes",
      },
    ],
  },
  {
    id: "3.3",
    name: "Categories and suppliers (owner)",
    owns: [
      "src/features/categories/**",
      "src/features/suppliers/**",
      "src/app/(app)/categories/**",
      "src/app/(app)/suppliers/**",
      "tests/integration/catalog/**",
      "tests/e2e/catalog/**",
    ],
    scope:
      "Owner-only management of categories and supplier records; staff may read category names only.",
    srs: "FR-031, FR-032; amendments B4 (FR-041, FR-042), B5 (FR-043)",
    gates: [
      {
        id: "G1",
        title:
          "category and supplier rules: owner CRUD, in-use category cannot be deleted, staff denied supplier access",
        check: unit(
          ["FR-041", "FR-043", "FR-043-INUSE", "FR-042-STAFF"],
          "tests/integration/catalog",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title: "owner manages categories and suppliers in the browser",
        check: e2e(["FR-041", "FR-043"], "tests/e2e/catalog"),
        expect: PASS,
      },
    ],
  },
  {
    id: "3.2",
    name: "Products",
    owns: [
      "src/features/products/**",
      "src/app/(app)/products/**",
      "src/lib/storage.ts",
      "tests/integration/products/**",
      "tests/e2e/products/**",
    ],
    scope:
      "Product list, add, edit (logged), owner-only delete of discontinued products, image upload (Vercel Blob, local disk in dev), automatic status labels, and cost/supplier hidden from staff.",
    srs: "§4.2 FR-001–006; FR-009, FR-037; amendments A2, A3, A7 follow-on, B4 (FR-042)",
    gates: [
      {
        id: "G1",
        title:
          "product actions: create/edit/delete rules, staff cannot delete or see cost/supplier, edits logged, staff-created products flagged as needing cost, images stored",
        check: unit(
          [
            "FR-001",
            "FR-002",
            "FR-003",
            "FR-004",
            "FR-004-STAFF",
            "FR-042",
            "EDIT-LOG",
            "NEEDS-COST",
            "IMG-1",
          ],
          "tests/integration/products",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title:
          "in the browser: add with image, edit, delete, Out of Stock label, Low Stock shown separately",
        check: e2e(["FR-001", "FR-003", "FR-004", "FR-006", "FR-009"], "tests/e2e/products"),
        expect: PASS,
      },
    ],
  },
  {
    id: "3.4",
    name: "Restock and inventory history",
    owns: [
      "src/features/inventory/**",
      "src/app/(app)/inventory-history/**",
      "tests/integration/inventory/**",
      "tests/e2e/inventory/**",
    ],
    scope:
      "Restock action (online path) and an inventory history page filterable by product, newest first.",
    srs: "§4.4 FR-010–012; amendment B2 (FR-038)",
    gates: [
      {
        id: "G1",
        title:
          "restock increases stock by the received quantity, rejects invalid quantities, and logs date, product, user, delta, stock-after",
        check: unit(
          ["FR-038", "FR-038-INVALID", "FR-010", "FR-011", "FR-012-RESTOCK"],
          "tests/integration/inventory",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title: "restock and history view work in the browser",
        check: e2e(["FR-038", "FR-012-VIEW"], "tests/e2e/inventory"),
        expect: PASS,
      },
    ],
  },
  {
    id: "3.5",
    name: "Product search and barcode scanning",
    owns: [
      "src/features/search/**",
      "src/components/scanner/**",
      "tests/integration/search/**",
      "tests/e2e/search/**",
      "tests/unit/search/**",
    ],
    scope:
      "Search by name or code, exact barcode lookup, USB/Bluetooth scanner (keyboard) input, and camera scanning limited to 1D barcodes.",
    srs: "§4.7 FR-026–029; §5.1 search speed; amendment D4",
    gates: [
      {
        id: "G1",
        title:
          "search by name, code, and barcode returns correct products; p95 under 500 ms over 5,000 products",
        check: unit(["FR-026", "FR-027", "FR-028", "NFR-PERF-2"], "tests/integration/search"),
        expect: PASS,
      },
      {
        id: "G2",
        title: "camera scanner is configured for 1D barcode formats only (no QR)",
        check: unit(["FR-029"], "tests/unit/search"),
        expect: PASS,
      },
      {
        id: "G3",
        title:
          "in the browser: name/code search and keyboard-wedge barcode entry open the right product",
        check: e2e(["FR-026", "FR-027", "FR-028-WEDGE"], "tests/e2e/search"),
        expect: PASS,
      },
      {
        id: "G4",
        title:
          "camera scanning reads a real product barcode on an Android phone and an iPhone (device test)",
      },
    ],
  },
  {
    id: "4.1",
    name: "Checkout",
    owns: [
      "src/features/sales/**",
      "src/app/(app)/checkout/**",
      "tests/unit/sales/**",
      "tests/integration/sales/**",
      "tests/e2e/checkout/**",
    ],
    scope:
      "Multi-item sale with quantities, whole-sale discount (amount or percent), Cash/GCash, optional customer text, atomic stock deduction with SALE history, idempotent by client id, and low-stock popups.",
    srs: "§4.5 FR-013–020; FR-005, FR-008, FR-012; amendments A1, A4, B8, B9; Figure 1",
    gates: [
      {
        id: "G1",
        title:
          "sale rules: records items, prices, time, staff, customer, discount capped at subtotal, Cash/GCash only, deducts stock atomically, logs SALE, idempotent, rejects overselling online",
        check: unit(
          [
            "FR-005",
            "FR-012-SALE",
            "FR-013",
            "FR-014",
            "FR-015",
            "FR-016",
            "FR-017",
            "FR-017-CAP",
            "FR-018",
            "FR-019",
            "SALE-ATOMIC",
            "SALE-IDEMPOTENT",
            "SALE-OVERSELL",
          ],
          "tests/unit/sales",
          "tests/integration/sales",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title:
          "in the browser: full checkout updates stock immediately and pops a low-stock alert when a product crosses its threshold",
        check: e2e(["CHECKOUT-FLOW", "NFR-STOCK-IMMEDIATE", "FR-008"], "tests/e2e/checkout"),
        expect: PASS,
      },
    ],
  },
  {
    id: "4.2",
    name: "Sales history and refunds",
    owns: [
      "src/features/refunds/**",
      "src/app/(app)/sales/**",
      "tests/integration/refunds/**",
      "tests/e2e/refunds/**",
    ],
    scope:
      "Sales list and full or partial refunds that restore stock, record money returned, and log REFUND history.",
    srs: "FR-012; amendment B3 (FR-039, FR-040), C7",
    gates: [
      {
        id: "G1",
        title:
          "refunds restore stock, never exceed quantity sold, log REFUND, are idempotent, and staff may process them",
        check: unit(
          ["FR-039", "FR-040", "FR-012-REFUND", "REFUND-IDEMPOTENT", "REFUND-STAFF"],
          "tests/integration/refunds",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title: "a partial refund works in the browser",
        check: e2e(["FR-039"], "tests/e2e/refunds"),
        expect: PASS,
      },
    ],
  },
  {
    id: "5.1",
    name: "Sales reports",
    owns: [
      "src/features/reports/**",
      "src/lib/dates.ts",
      "src/app/(app)/reports/**",
      "src/components/charts/**",
      "tests/unit/reports/**",
      "tests/integration/reports/**",
      "tests/e2e/reports/**",
    ],
    scope:
      "Daily/weekly/monthly/yearly sales in Asia/Manila with Monday weeks, refunds subtracted on their own date, best sellers, owner-only gross profit, Chart.js charts; staff denied.",
    srs: "§4.6 FR-021, FR-022; amendment B7 (FR-047, FR-048)",
    gates: [
      {
        id: "G1",
        title:
          "report totals equal independently computed fixture totals across Manila day/week/month/year boundaries; best sellers, profit, and staff denial correct",
        check: unit(
          ["FR-021", "FR-021-TZ", "FR-022", "FR-047", "FR-047-NOCOST", "REPORTS-STAFF"],
          "tests/unit/reports",
          "tests/integration/reports",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title: "reports and charts render for the owner in the browser",
        check: e2e(["FR-021", "FR-022"], "tests/e2e/reports"),
        expect: PASS,
      },
    ],
  },
  {
    id: "5.2",
    name: "Owner and staff dashboards",
    owns: [
      "src/features/dashboard/**",
      "src/app/(app)/dashboard/**",
      "tests/integration/dashboard/**",
      "tests/e2e/dashboard/**",
    ],
    scope:
      "Owner dashboard (totals, stock, low stock, needs-cost, recent sales, best sellers, today) and a limited staff dashboard.",
    srs: "§4.6 FR-023–025; amendment A6 (FR-023a), A7 follow-on",
    gates: [
      {
        id: "G1",
        title: "dashboard data matches fixtures for owner and staff, including needs-cost list",
        check: unit(
          ["FR-023", "FR-023A", "FR-024", "FR-025", "NEEDS-COST-DASH"],
          "tests/integration/dashboard",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title: "both dashboards render the right widgets for each role in the browser",
        check: e2e(["FR-023", "FR-023A", "FR-024", "FR-025"], "tests/e2e/dashboard"),
        expect: PASS,
      },
    ],
  },
  {
    id: "6.1",
    name: "PWA shell and offline catalog",
    owns: [
      "next.config.ts",
      "src/app/sw.ts",
      "src/app/manifest.ts",
      "src/app/offline/**",
      "src/app/serwist/**",
      "src/lib/offline/db.ts",
      "src/lib/offline/catalog.ts",
      "public/icons/**",
      "tests/unit/offline/**",
      "tests/e2e/offline/**",
    ],
    scope:
      "Serwist service worker (Turbopack build), web manifest, offline fallback page, Dexie product catalog cache, and offline access for an already signed-in session.",
    srs: "§2.4, §4.9, §5.3; amendment B10 (FR-050), D2",
    notes: [
      "Read node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md and the @serwist/turbopack docs first.",
    ],
    gates: [
      {
        id: "G1",
        title: "Dexie catalog schema stores and queries products offline",
        check: unit(["OFFLINE-DB"], "tests/unit/offline"),
        expect: PASS,
      },
      {
        id: "G2",
        title:
          "service worker controls the page, manifest is valid, signed-in user can reload checkout and search products while offline",
        check: e2e(["PWA-SW", "PWA-MANIFEST", "FR-050", "OFFLINE-CATALOG"], "tests/e2e/offline"),
        expect: PASS,
      },
    ],
  },
  {
    id: "6.2",
    name: "Offline outbox and sync",
    owns: [
      "src/lib/offline/outbox.ts",
      "src/lib/offline/sync.ts",
      "src/lib/commands.ts",
      "src/app/api/sync/**",
      "src/components/sync/**",
      "tests/unit/sync/**",
      "tests/integration/sync/**",
      "tests/e2e/sync/**",
    ],
    scope:
      "Sales, refunds, and restocks queue in an IndexedDB outbox when offline, replay in order and idempotently on reconnect, never get lost, and the UI shows online status, pending count, and sync results.",
    srs: "§3.4, §4.9 FR-034–036, §5.3; amendment B10 (FR-049, FR-051); Figure 4",
    notes: [
      "Takes ownership of src/lib/commands.ts from leaf 2.1 (plan amendment logged when this leaf starts).",
    ],
    gates: [
      {
        id: "G1",
        title:
          "outbox survives reloads, replays in order, never double-applies, keeps failed items, and product edits refuse offline",
        check: unit(
          ["FR-034", "FR-035", "FR-036", "SYNC-ORDER", "FR-049"],
          "tests/unit/sync",
          "tests/integration/sync",
        ),
        expect: PASS,
      },
      {
        id: "G2",
        title:
          "in the browser: an offline sale syncs on reconnect with no loss and the user is told when sync completes or fails",
        check: e2e(["FR-034", "FR-035", "FR-036", "FR-051", "SYNC-NOTIFY"], "tests/e2e/sync"),
        expect: PASS,
      },
    ],
  },
  {
    id: "7.1",
    name: "End-to-end flows and performance",
    owns: ["tests/e2e/flows/**", "tests/perf/**", "prisma/seed-demo.ts", "scripts/gates/perf/**"],
    scope:
      "The SRS system flow end to end, full history coverage, per-user attribution, and the 2-second page-load target on a production build.",
    srs: "§2.1 system flow; FR-012; §5.1, §5.2; amendment D4",
    gates: [
      {
        id: "G1",
        title:
          "login, scan, sell, stock deducted, dashboard and reports updated; history shows every change type; every change is attributed to its user",
        check: e2e(["FLOW-SYSTEM", "FR-012", "NFR-SEC-2"], "tests/e2e/flows"),
        expect: PASS,
      },
      {
        id: "G2",
        title:
          "dashboard and product pages load under 2 s on a throttled phone profile with the demo dataset",
        check: e2e(["NFR-PERF-1"], "tests/perf"),
        expect: PASS,
      },
      {
        id: "G3",
        title: "on a real phone, offline use feels as fast as online use (§5.1 bullet 4)",
      },
    ],
  },
  {
    id: "7.2",
    name: "Deployment",
    owns: [
      "docs/DEPLOY.md",
      "src/app/api/health/**",
      "scripts/gates/check-deploy.mjs",
      "tests/integration/health/**",
      "vercel.json",
    ],
    scope:
      "Production on Vercel with Neon Postgres and Vercel Blob, migrations deployed, owner account seeded, HTTPS enforced.",
    srs: "§2.4 deployment; §3.4 secure connection; amendments D2, D5",
    notes: [
      "Needs the owner's Vercel, Neon, and Blob accounts. The gates stay unmet until PRODUCTION_URL exists.",
    ],
    gates: [
      {
        id: "G1",
        title: "health endpoint reports database connectivity",
        check: unit(["HEALTH-1"], "tests/integration/health"),
        expect: PASS,
      },
      {
        id: "G2",
        title:
          "production serves the login page over HTTPS, redirects HTTP to HTTPS, sends HSTS, and reports a healthy database",
        check: "node scripts/gates/check-deploy.mjs",
        expect: "DEPLOY OK",
      },
      { id: "G3", title: "owner logged into production and replaced the seeded password" },
    ],
  },
];

/** Branches: id, name, direct children (leaf ids), extra e2e dirs for regression. */
export const BRANCHES = [
  { id: "2", name: "Data and access", children: ["2.1", "2.2", "2.3"] },
  { id: "3", name: "Inventory", children: ["3.1", "3.3", "3.2", "3.4", "3.5"] },
  { id: "4", name: "Sales", children: ["4.1", "4.2"] },
  { id: "5", name: "Reporting", children: ["5.1", "5.2"] },
  { id: "6", name: "Offline", children: ["6.1", "6.2"] },
  { id: "7", name: "Quality and release", children: ["7.1", "7.2"] },
];

function gateBlock(g) {
  const lines = [`- [ ] ${g.id}: ${g.title}`];
  if (g.check) lines.push(`  CHECK: ${g.check}`, `  EXPECT: ${g.expect}`);
  lines.push("  EVIDENCE: pending", "");
  return lines.join("\n");
}

function leafLedger(leaf) {
  const path = `${DIR}/leaf-${leaf.id}.md`;
  const g0 = {
    id: "G0",
    title: "this ledger states outcomes that can fail",
    check: `${LINT} ${path}`,
    expect: "LINT OK",
  };
  return [
    `# Gates: leaf ${leaf.id} ${leaf.name}`,
    "",
    `OWNS: ${leaf.owns.join(", ")}`,
    "",
    `Scope: ${leaf.scope}`,
    "",
    `SRS: ${leaf.srs}`,
    "",
    ...(leaf.notes?.length ? ["Notes:", ...leaf.notes.map((n) => `- ${n}`), ""] : []),
    `Run: \`${CHECK} ${path}\``,
    "",
    ...[g0, ...leaf.gates].map(gateBlock),
  ].join("\n");
}

function nodeLedger(branch) {
  const path = `${DIR}/node-${branch.id}.md`;
  const children = branch.children.map((c) => `${DIR}/leaf-${c}.md`).join(" ");
  const gates = [
    {
      id: "N0",
      title: "this ledger states outcomes that can fail",
      check: `${LINT} ${path}`,
      expect: "LINT OK",
    },
    {
      id: "N1",
      title: "every direct child is reverified from its exact ledger",
      check: `${CHECK} --reverify --jobs 1 ${children}`,
      expect: "ALL MET",
    },
    {
      id: "N2",
      title: "the joined code type-checks, lints clean, and builds",
      check:
        "npm run typecheck && npm run lint && npm run build && node -e \"console.log('QUALITY OK')\"",
      expect: "QUALITY OK",
    },
    {
      id: "N3",
      title: "no unit or integration test anywhere has regressed",
      check: "npm test",
      expect: "/Tests\\s+\\d+ passed \\(\\d+\\)/",
    },
    {
      id: "N4",
      title: "no end-to-end test anywhere has regressed on desktop or phone",
      check: "npx playwright test",
      expect: "/\\d+ passed/",
    },
    { id: "N5", title: "the children's manual gates were reviewed at branch level" },
  ];
  return [
    `# Gates: branch ${branch.id} ${branch.name} integration`,
    "",
    `Scope: integrate children ${branch.children.map((c) => `leaf-${c}`).join(", ")} into one verified result`,
    "",
    `Run: \`${CHECK} ${path}\``,
    "",
    ...gates.map(gateBlock),
  ].join("\n");
}

function untouched(path) {
  if (!existsSync(path)) return true;
  const text = readFileSync(path, "utf8");
  return !/- \[x\]/.test(text) && !/EVIDENCE: (?!pending)/.test(text);
}

mkdirSync(DIR, { recursive: true });
const written = [];
for (const leaf of LEAVES) {
  const path = `${DIR}/leaf-${leaf.id}.md`;
  if (!untouched(path)) continue;
  writeFileSync(path, leafLedger(leaf));
  written.push(path);
}
for (const branch of BRANCHES) {
  const path = `${DIR}/node-${branch.id}.md`;
  if (!untouched(path)) continue;
  writeFileSync(path, nodeLedger(branch));
  written.push(path);
}
const root = ".unlazy/bentatrack/GATES.md";
if (untouched(root)) {
  const nodes = BRANCHES.map((b) => `${DIR}/node-${b.id}.md`).join(" ");
  const gates = [
    {
      id: "R0",
      title: "this ledger states outcomes that can fail",
      check: `${LINT} ${root}`,
      expect: "LINT OK",
    },
    {
      id: "R1",
      title: "setup leaf and every branch are reverified from their exact ledgers",
      check: `${CHECK} --reverify --jobs 1 GATES.md ${nodes}`,
      expect: "ALL MET",
    },
    {
      id: "R2",
      title:
        "every contract inventory row in PLAN.md has a current owner and a met observation, or a visible handoff",
    },
    {
      id: "R3",
      title: "the finished app was demonstrated to the product owner against SRS §2.1 system flow",
    },
  ];
  writeFileSync(
    root,
    [
      "# Gates: BentaTrack build (root)",
      "",
      "Scope: every SRS V2 requirement (as amended) is built, integrated, and verified, or visibly handed off",
      "",
      `Run: \`${CHECK} ${root}\``,
      "",
      ...gates.map(gateBlock),
    ].join("\n"),
  );
  written.push(root);
}
console.log(written.length ? "wrote:\n" + written.join("\n") : "no untouched ledgers to write");
