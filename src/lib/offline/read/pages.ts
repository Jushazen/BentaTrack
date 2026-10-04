// What each offline-app page shows, read from the device store (FR-049, FR-055; leaves 9.2, 9.3).
// Each page gets the same data its server page would, through the reads in this folder and
// ../sales-read.ts, and each checks the role first, as the server pages do (FR-032). Sales,
// dashboard, and report pages include changes waiting to sync. Browser only.
import type { CategoryOption, CategoryRow } from "@/features/categories/queries";
import type { Dashboard } from "@/features/dashboard/dashboard";
import type { HistoryPage } from "@/features/inventory/queries";
import type { ProductDetail, ProductPage } from "@/features/products/queries";
import type { SaleDetail, SalesPage } from "@/features/refunds/queries";
import type { SalesReport } from "@/features/reports/sales-report";
import type { SupplierOption, SupplierRow } from "@/features/suppliers/queries";
import type { UserRow } from "@/features/users/queries";
import { can } from "@/lib/permissions";
import type { Result } from "@/lib/result";
import { offlineDb, type OfflineDb } from "../db";
import {
  dashboardFrom,
  getSaleFrom,
  listSalesFrom,
  readSalesRecords,
  salesReportFrom,
  withPending,
} from "../sales-read";
import {
  categoryOptionsFrom,
  listCategoriesFrom,
  listSuppliersFrom,
  supplierOptionsFrom,
} from "./catalog";
import { readDeviceRecords } from "./device";
import { listInventoryChangesFrom, listUsersFrom } from "./people";
import { getProductFrom, listProductsFrom, lowStockCountFrom } from "./products";
import { OFFLINE_ROUTE_CAPABILITY, type OfflineRoute } from "./routes";
import type { SavedSession } from "./session";

export type OfflinePageData =
  | { page: "products"; products: Result<ProductPage>; categories: CategoryOption[] }
  | {
      page: "product-form";
      /** Absent when adding a product. */
      product?: ProductDetail;
      categories: CategoryOption[];
      /** Null for staff: no purchase price or supplier fields. */
      suppliers: SupplierOption[] | null;
    }
  | { page: "product"; product: ProductDetail }
  | { page: "categories"; categories: Result<CategoryRow[]> }
  | { page: "suppliers"; suppliers: Result<SupplierRow[]> }
  | { page: "users"; users: Result<UserRow[]> }
  | { page: "account"; user: { name: string; email: string } }
  | { page: "inventory-history"; history: Result<HistoryPage> }
  // `waitingToSync`: how many sales and refunds included haven't synced yet (leaf 9.3).
  | { page: "dashboard"; dashboard: Result<Dashboard>; waitingToSync: number }
  | { page: "sales"; sales: Result<SalesPage>; waitingToSync: number }
  | { page: "sale"; sale: SaleDetail }
  | { page: "reports"; report: Result<SalesReport>; waitingToSync: number };

export type OfflinePage =
  /** The role may not open this page; online it would go to /forbidden. */
  | { status: "forbidden" }
  /** No such product or sale (online: the not-found page). */
  | { status: "not-found" }
  /** Archived products can't be edited; online the edit page sends them to their page. */
  | { status: "redirect"; to: string }
  | { status: "ok"; lowStockCount: number; data: OfflinePageData };

/** URL search params as Next.js passes them to a page: a repeated key becomes a list. */
export function searchParamsObject(search: string): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    const seen = params[key];
    params[key] = seen === undefined ? value : [...(Array.isArray(seen) ? seen : [seen]), value];
  }
  return params;
}

function okOr<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.data : fallback;
}

type SalesRoute = Extract<OfflineRoute, { page: "dashboard" | "sales" | "sale" | "reports" }>;

function isSalesRoute(route: OfflineRoute): route is SalesRoute {
  return (
    route.page === "dashboard" ||
    route.page === "sales" ||
    route.page === "sale" ||
    route.page === "reports"
  );
}

/** Sales history, one sale, the dashboard, and reports, with changes waiting to sync. */
async function readSalesPage(
  route: SalesRoute,
  viewer: SavedSession,
  search: string,
  db: OfflineDb,
): Promise<OfflinePage> {
  const { role } = viewer;
  const records = await readSalesRecords(db);
  const shop = withPending(records, role);
  const ok = (data: OfflinePageData): OfflinePage => ({
    status: "ok",
    lowStockCount: lowStockCountFrom(records.products),
    data,
  });
  const filters = searchParamsObject(search);
  switch (route.page) {
    case "dashboard":
      return ok({
        page: "dashboard",
        dashboard: dashboardFrom(shop, records.products, role, new Date()),
        waitingToSync: shop.waiting,
      });
    case "sales":
      return ok({
        page: "sales",
        sales: listSalesFrom(shop, role, filters),
        waitingToSync: shop.waiting,
      });
    case "sale": {
      const sale = getSaleFrom(shop, role, route.id);
      return sale.ok ? ok({ page: "sale", sale: sale.data }) : { status: "not-found" };
    }
    case "reports":
      return ok({
        page: "reports",
        report: salesReportFrom(shop, role, filters, new Date()),
        waitingToSync: shop.waiting,
      });
  }
}

/** Reads one offline-app page for the signed-in `viewer`. */
export async function readOfflinePage(
  route: OfflineRoute,
  viewer: SavedSession,
  search: string,
  db: OfflineDb = offlineDb(),
): Promise<OfflinePage> {
  const { role } = viewer;
  if (!can(role, OFFLINE_ROUTE_CAPABILITY[route.page])) return { status: "forbidden" };
  if (isSalesRoute(route)) return readSalesPage(route, viewer, search, db);
  const tables = await readDeviceRecords(db);
  // Staff devices hold no suppliers or users (leaf 9.1); never use them for staff anyway.
  const suppliers = can(role, "suppliers.read") ? tables.suppliers : [];
  const users = can(role, "users.manage") ? tables.users : [];
  const ok = (data: OfflinePageData): OfflinePage => ({
    status: "ok",
    lowStockCount: lowStockCountFrom(tables.products),
    data,
  });
  const categoryOptions = () => okOr(categoryOptionsFrom(tables.categories, role), []);
  const supplierOptions = () =>
    can(role, "suppliers.read") ? okOr(supplierOptionsFrom(suppliers, role), []) : null;

  switch (route.page) {
    case "products":
      return ok({
        page: "products",
        products: listProductsFrom(tables, role, searchParamsObject(search)),
        categories: categoryOptions(),
      });
    case "product-new":
      return ok({
        page: "product-form",
        categories: categoryOptions(),
        suppliers: supplierOptions(),
      });
    case "product":
    case "product-edit": {
      const product = getProductFrom({ ...tables, suppliers }, role, route.id);
      if (!product.ok) return { status: "not-found" };
      if (route.page === "product") return ok({ page: "product", product: product.data });
      if (product.data.archived) {
        return { status: "redirect", to: `/products/${encodeURIComponent(route.id)}` };
      }
      return ok({
        page: "product-form",
        product: product.data,
        categories: categoryOptions(),
        suppliers: supplierOptions(),
      });
    }
    case "categories":
      return ok({ page: "categories", categories: listCategoriesFrom(tables, role) });
    case "suppliers":
      return ok({
        page: "suppliers",
        suppliers: listSuppliersFrom({ suppliers, products: tables.products }, role),
      });
    case "users":
      return ok({ page: "users", users: listUsersFrom(users, role) });
    case "account": {
      const stored = users.find((u) => u.id === viewer.id);
      return ok({
        page: "account",
        user: { name: stored?.name ?? viewer.name, email: stored?.email ?? viewer.email },
      });
    }
    case "inventory-history":
      return ok({
        page: "inventory-history",
        history: listInventoryChangesFrom(tables, role, searchParamsObject(search)),
      });
  }
}
