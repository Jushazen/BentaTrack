"use client";

// The offline app (FR-049, FR-055; leaf 9.2). The service worker answers every page the network
// can't deliver with /offline, keeping the address the user asked for. This draws that page from
// the device store inside the usual app shell, with the same views the server pages use, so it
// looks and filters the same as online. It redraws when the device data changes (a sync).
// Pages it doesn't draw, or a device without the signed-in user's data, get the plain notice.
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LowStockOnOpen } from "@/components/layout/low-stock-alerts";
import { OfflineCatalogSync } from "@/components/offline/offline-catalog-sync";
import { SyncStatus } from "@/components/sync/sync-status";
import { buttonClasses } from "@/components/ui/button";
import { CategoriesView } from "@/features/categories/categories-view";
import { HistoryView } from "@/features/inventory/history-view";
import { ProductDetailView } from "@/features/products/product-detail-view";
import { ProductFormView } from "@/features/products/product-form-view";
import { ProductsView } from "@/features/products/products-view";
import { SuppliersView } from "@/features/suppliers/suppliers-view";
import { UsersView } from "@/features/users/users-view";
import type { Role } from "@/generated/prisma/enums";
import { offlineViewer } from "@/lib/offline/read/device";
import { readOfflinePage, type OfflinePage, type OfflinePageData } from "@/lib/offline/read/pages";
import { matchOfflineRoute, type OfflineRoute } from "@/lib/offline/read/routes";
import type { SavedSession } from "@/lib/offline/read/session";
import { AccountView } from "../(app)/account/account-view";
import { OFFLINE_IMAGE_RULES, OFFLINE_PASSWORD_MIN_LENGTH } from "./limits";
import { OfflineNotice } from "./offline-notice";

/** The same titles the server pages set. */
const TITLES: Record<OfflineRoute["page"], string> = {
  products: "Products",
  "product-new": "Add product",
  product: "Product",
  "product-edit": "Edit product",
  categories: "Categories",
  suppliers: "Suppliers",
  users: "Users",
  account: "My account",
  "inventory-history": "Inventory history",
};

/** The page asked for and who is signed in; null when the offline app can't draw it. */
type Target = { route: OfflineRoute; search: string; viewer: SavedSession } | null;

function PageView({ data, role }: { data: OfflinePageData; role: Role }) {
  switch (data.page) {
    case "products":
      return <ProductsView role={role} products={data.products} categories={data.categories} />;
    case "product":
      return <ProductDetailView role={role} product={data.product} />;
    case "product-form":
      return (
        <ProductFormView
          product={data.product}
          categories={data.categories}
          suppliers={data.suppliers}
          imageRules={OFFLINE_IMAGE_RULES}
        />
      );
    case "categories":
      return <CategoriesView categories={data.categories} />;
    case "suppliers":
      return <SuppliersView suppliers={data.suppliers} />;
    case "users":
      return <UsersView users={data.users} passwordMinLength={OFFLINE_PASSWORD_MIN_LENGTH} />;
    case "account":
      return <AccountView user={data.user} passwordMinLength={OFFLINE_PASSWORD_MIN_LENGTH} />;
    case "inventory-history":
      return <HistoryView history={data.history} />;
  }
}

function NotFound() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-text">Product not found</h1>
      <p className="text-muted">
        That product isn&apos;t on this device. It may have been added on another device since the
        last sync.
      </p>
      <Link href="/products" className={buttonClasses("secondary")}>
        <ArrowLeft aria-hidden className="size-4 shrink-0" />
        <span>All products</span>
      </Link>
    </div>
  );
}

async function findTarget(): Promise<Target> {
  const route = matchOfflineRoute(location.pathname);
  if (!route) return null;
  try {
    const viewer = await offlineViewer();
    return viewer ? { route, search: location.search, viewer } : null;
  } catch {
    // No IndexedDB (e.g. private mode): nothing is stored, so show the plain notice.
    return null;
  }
}

/** Device reads only, so the live query sees every table it depends on. */
async function readPage(target: Target): Promise<OfflinePage | null> {
  if (!target) return null;
  try {
    return await readOfflinePage(target.route, target.viewer, target.search);
  } catch {
    return null;
  }
}

/** `forbidden` is the /forbidden page, drawn on the server (it can't be imported here). */
export function OfflineApp({ forbidden }: { forbidden: ReactNode }) {
  // Found after mounting: the page is prerendered once, for every address.
  const [target, setTarget] = useState<Target | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void findTarget().then((found) => {
      if (live) setTarget(found);
    });
    return () => {
      live = false;
    };
  }, []);

  const page = useLiveQuery(() => readPage(target ?? null), [target], undefined);

  useEffect(() => {
    if (page?.status === "redirect") location.replace(page.to);
  }, [page]);
  useEffect(() => {
    if (target) document.title = `${TITLES[target.route.page]} · BentaTrack`;
  }, [target]);

  if (target === undefined || (target && page === undefined) || page?.status === "redirect") {
    return <main aria-busy="true" className="bg-bg min-h-dvh" />;
  }
  if (!target || !page) return <OfflineNotice />;
  if (page.status === "forbidden") return forbidden;

  const { viewer } = target;
  const lowStockCount = page.status === "ok" ? page.lowStockCount : 0;
  return (
    <AppShell
      user={{ name: viewer.name, role: viewer.role }}
      lowStockCount={lowStockCount}
      status={<SyncStatus user={{ id: viewer.id, name: viewer.name }} />}
    >
      {page.status === "ok" ? <PageView data={page.data} role={viewer.role} /> : <NotFound />}
      <LowStockOnOpen count={lowStockCount} />
      <OfflineCatalogSync />
    </AppShell>
  );
}
