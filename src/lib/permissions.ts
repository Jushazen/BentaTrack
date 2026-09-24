// Role capability matrix (FR-031–033, amendment A7). Must match the table in
// .unlazy/bentatrack/PLAN.md "Permissions". Used by src/proxy.ts for pages and by
// requireCapability() inside every server action.
import type { Role } from "@/generated/prisma/enums";

export const ROLES = ["OWNER", "STAFF"] as const satisfies readonly Role[];

export const CAPABILITIES = [
  "sales.create",
  "sales.read",
  "refunds.create",
  "products.read",
  "products.create",
  "products.update",
  "products.delete",
  "products.cost",
  "inventory.restock",
  "inventory.history",
  "categories.read",
  "categories.manage",
  "suppliers.read",
  "suppliers.manage",
  "search",
  "reports.read",
  "users.manage",
  "dashboard.staff",
  "dashboard.owner",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const STAFF_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "sales.create",
  "sales.read",
  "refunds.create",
  "products.read",
  "products.create",
  "products.update",
  "inventory.restock",
  "inventory.history",
  "categories.read",
  "search",
  "dashboard.staff",
]);

/** Owner has everything; staff has the fixed set above. Unknown roles get nothing. */
export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (role === "OWNER") return true;
  if (role === "STAFF") return STAFF_CAPABILITIES.has(capability);
  return false;
}

/**
 * Capability needed to open each signed-in page. Longest matching prefix wins.
 * Pages not listed here only need a signed-in user.
 */
export const ROUTE_CAPABILITIES: readonly (readonly [prefix: string, capability: Capability])[] = [
  ["/users", "users.manage"],
  ["/reports", "reports.read"],
  ["/suppliers", "suppliers.manage"],
  ["/categories", "categories.manage"],
  ["/products/new", "products.create"],
  ["/products", "products.read"],
  ["/checkout", "sales.create"],
  ["/sales", "sales.read"],
  ["/inventory-history", "inventory.history"],
];

/** Signed-in app pages. Everything else is public (login, forbidden, offline, auth API). */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  ...ROUTE_CAPABILITIES.map(([prefix]) => prefix),
] as const;

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function isProtectedPath(pathname: string): boolean {
  return pathname === "/" || PROTECTED_PREFIXES.some((p) => matches(pathname, p));
}

export function capabilityForPath(pathname: string): Capability | null {
  let best: readonly [string, Capability] | null = null;
  for (const rule of ROUTE_CAPABILITIES) {
    if (matches(pathname, rule[0]) && (!best || rule[0].length > best[0].length)) best = rule;
  }
  return best ? best[1] : null;
}
