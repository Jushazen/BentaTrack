import { describe, expect, test } from "vitest";
import { Role } from "@/generated/prisma/enums";
import {
  CAPABILITIES,
  ROLES,
  can,
  capabilityForPath,
  isProtectedPath,
  type Capability,
} from "@/lib/permissions";

// Written out independently from src/lib/permissions.ts, copied from the PLAN.md
// "Permissions (capability matrix)" table, so a change to either side is caught.
const PLAN_STAFF_ALLOWED: Capability[] = [
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
];
const PLAN_OWNER_ONLY: Capability[] = [
  "products.delete",
  "products.cost",
  "suppliers.read",
  "suppliers.manage",
  "categories.manage",
  "reports.read",
  "users.manage",
  "dashboard.owner",
];

describe("capability matrix", () => {
  test("[FR-031] the owner has every capability, including suppliers", () => {
    for (const capability of CAPABILITIES) expect(can("OWNER", capability), capability).toBe(true);
    expect(can("OWNER", "suppliers.read")).toBe(true);
  });

  test("[FR-032] staff has exactly the PLAN set: no delete, costs, suppliers, reports, categories, or users", () => {
    const staffAllowed = CAPABILITIES.filter((c) => can("STAFF", c));
    expect([...staffAllowed].sort()).toEqual([...PLAN_STAFF_ALLOWED].sort());
    for (const capability of PLAN_OWNER_ONLY)
      expect(can("STAFF", capability), capability).toBe(false);
  });

  test("[FR-033] there are exactly two roles, and the matrix covers every capability", () => {
    expect([...ROLES].sort()).toEqual(["OWNER", "STAFF"]);
    expect(Object.values(Role).sort()).toEqual(["OWNER", "STAFF"]);
    expect([...CAPABILITIES].sort()).toEqual([...PLAN_STAFF_ALLOWED, ...PLAN_OWNER_ONLY].sort());
    expect(can(undefined, "search")).toBe(false);
    expect(can("ADMIN" as never, "search")).toBe(false);
  });

  test("[FR-032] owner-only pages map to owner-only capabilities", () => {
    for (const path of ["/users", "/reports", "/suppliers", "/categories", "/users/abc"]) {
      const capability = capabilityForPath(path);
      expect(capability, path).not.toBeNull();
      expect(can("STAFF", capability!), path).toBe(false);
    }
    for (const path of [
      "/checkout",
      "/products",
      "/products/new",
      "/sales",
      "/inventory-history",
    ]) {
      expect(can("STAFF", capabilityForPath(path)!), path).toBe(true);
    }
    expect(capabilityForPath("/usersettings")).toBeNull(); // prefix must match a whole segment
  });

  test("[FR-033] every app page is protected; login and static pages are not", () => {
    for (const path of ["/", "/dashboard", "/products/x", "/users", "/reports", "/checkout"]) {
      expect(isProtectedPath(path), path).toBe(true);
    }
    for (const path of ["/login", "/forbidden", "/offline", "/api/auth/session"]) {
      expect(isProtectedPath(path), path).toBe(false);
    }
  });
});
