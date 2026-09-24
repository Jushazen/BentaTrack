// Gate oracle: the agreed folder structure exists (CLAUDE.md "Folder structure").
import { existsSync } from "node:fs";

const REQUIRED = [
  "src/app/(auth)/login/page.tsx",
  "src/app/(app)/layout.tsx",
  ...[
    "dashboard",
    "products",
    "products/new",
    "products/[id]",
    "checkout",
    "sales",
    "reports",
    "inventory-history",
    "suppliers",
    "categories",
    "users",
  ].map((r) => `src/app/(app)/${r}/page.tsx`),
  "src/app/offline/page.tsx",
  ...["products", "categories", "suppliers", "inventory", "sales", "reports", "users"].flatMap(
    (f) => ["schemas", "actions", "queries"].map((k) => `src/features/${f}/${k}.ts`),
  ),
  ...["db", "auth", "permissions", "money", "dates", "offline/db", "offline/sync"].map(
    (f) => `src/lib/${f}.ts`,
  ),
  "src/components/ui",
  "src/components/layout",
  "prisma/schema.prisma",
  "prisma/seed.ts",
  "prisma.config.ts",
  "docker-compose.yml",
  ".env.example",
  "tests/setup.ts",
  "tests/unit",
  "tests/e2e",
  "vitest.config.mts",
  "playwright.config.ts",
  "CLAUDE.md",
  "AGENTS.md",
  "docs/SRS V2.pdf",
  "docs/SRS-V2-amendments.md",
  ".unlazy/bentatrack/PLAN.md",
];

const missing = REQUIRED.filter((p) => !existsSync(p));
if (missing.length) {
  console.error("missing:\n" + missing.join("\n"));
  process.exit(1);
}
console.log(`STRUCTURE OK (${REQUIRED.length} paths)`);
