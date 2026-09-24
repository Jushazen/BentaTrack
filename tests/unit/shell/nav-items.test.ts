import { describe, expect, test } from "vitest";
import {
  NAV_GROUPS,
  PHONE_TAB_HREFS,
  isActive,
  navGroupsFor,
  pageLabel,
} from "@/components/layout/nav-items";
import { can, capabilityForPath } from "@/lib/permissions";

const OWNER_ONLY = ["/reports", "/categories", "/suppliers", "/users"];
const hrefs = (role: "OWNER" | "STAFF") =>
  navGroupsFor(role).flatMap((g) => g.items.map((i) => i.href));

describe("shell navigation", () => {
  test("[UI-NAV-ROLE] staff menu has no owner-only pages and no Owner group", () => {
    const staff = hrefs("STAFF");
    for (const href of OWNER_ONLY) expect(staff).not.toContain(href);
    expect(navGroupsFor("STAFF").map((g) => g.id)).toEqual(["sell", "stock"]);
  });

  test("[UI-NAV-ROLE] owner menu has every page, grouped Sell / Stock / Owner", () => {
    expect(navGroupsFor("OWNER").map((g) => g.id)).toEqual(["sell", "stock", "owner"]);
    expect(hrefs("OWNER")).toEqual(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
  });

  test("[UI-NAV-ROLE] every menu item needs exactly the capability its page needs", () => {
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      const pageCapability = capabilityForPath(item.href);
      if (pageCapability) expect(item.capability, item.href).toBe(pageCapability);
      for (const role of ["OWNER", "STAFF"] as const) {
        const shown = hrefs(role).includes(item.href);
        expect(shown, `${role} ${item.href}`).toBe(can(role, item.capability));
      }
    }
  });

  test("[UI-LABELS] every menu item and phone tab has a text label", () => {
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      expect(item.label.trim().length, item.href).toBeGreaterThan(0);
      expect((item.shortLabel ?? item.label).length, item.href).toBeLessThanOrEqual(10);
    }
    for (const href of PHONE_TAB_HREFS) expect(hrefs("STAFF")).toContain(href);
  });

  test("[UI-NAV-ROLE] active state matches whole path segments", () => {
    expect(isActive("/products/abc", "/products")).toBe(true);
    expect(isActive("/productsx", "/products")).toBe(false);
    expect(pageLabel("/inventory-history")).toBe("Inventory history");
    expect(pageLabel("/nowhere")).toBe("BentaTrack");
  });
});
