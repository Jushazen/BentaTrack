// Navigation for the signed-in shell. Filtered by role with the same capabilities the proxy and
// server actions use, so a hidden menu item always matches a blocked page (FR-032, UI-NAV-ROLE).
import {
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  Package,
  ReceiptText,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { can, type Capability } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  /** Shorter label for the phone tab bar. */
  shortLabel?: string;
  icon: LucideIcon;
  capability: Capability;
  /** Shows the low-stock count badge. */
  lowStockBadge?: boolean;
};

export type NavGroup = { id: "sell" | "stock" | "owner"; label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "sell",
    label: "Sell",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        shortLabel: "Home",
        icon: LayoutDashboard,
        capability: "dashboard.staff",
      },
      { href: "/checkout", label: "Checkout", icon: ShoppingCart, capability: "sales.create" },
      { href: "/sales", label: "Sales", icon: ReceiptText, capability: "sales.read" },
    ],
  },
  {
    id: "stock",
    label: "Stock",
    items: [
      {
        href: "/products",
        label: "Products",
        icon: Package,
        capability: "products.read",
        lowStockBadge: true,
      },
      {
        href: "/inventory-history",
        label: "Inventory history",
        shortLabel: "History",
        icon: ClipboardList,
        capability: "inventory.history",
      },
    ],
  },
  {
    id: "owner",
    label: "Owner",
    items: [
      { href: "/reports", label: "Reports", icon: ChartColumn, capability: "reports.read" },
      { href: "/categories", label: "Categories", icon: Tags, capability: "categories.manage" },
      { href: "/suppliers", label: "Suppliers", icon: Truck, capability: "suppliers.manage" },
      { href: "/users", label: "Users", icon: Users, capability: "users.manage" },
    ],
  },
];

/** The four always-visible phone tabs (the fourth tab, "More", opens the rest). */
export const PHONE_TAB_HREFS = ["/dashboard", "/checkout", "/products"] as const;

export function navGroupsFor(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(role, item.capability)),
  })).filter((group) => group.items.length > 0);
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function pageLabel(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) if (isActive(pathname, item.href)) return item.label;
  }
  return "BentaTrack";
}
