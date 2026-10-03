// Signed-in shell. requirePageCapability() is the authoritative login check (the proxy is only
// the fast first check), and it supplies the role that decides which menu items show.
import { AppShell } from "@/components/layout/app-shell";
import { LowStockOnOpen } from "@/components/layout/low-stock-alerts";
import { OfflineCatalogSync } from "@/components/offline/offline-catalog-sync";
import { SyncStatus } from "@/components/sync/sync-status";
import { requirePageCapability } from "@/lib/auth";
import { db } from "@/lib/db";

/** Products in use that are Low Stock or Out of Stock; archived ones are left out (FR-057). */
async function lowStockCount(): Promise<number> {
  return db.product.count({
    where: { archivedAt: null, stockQuantity: { lte: db.product.fields.lowStockThreshold } },
  });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageCapability();
  const count = await lowStockCount();
  return (
    <AppShell
      user={{ name: user.name, role: user.role }}
      lowStockCount={count}
      status={<SyncStatus user={{ id: user.id, name: user.name }} />}
    >
      {children}
      <LowStockOnOpen count={count} />
      <OfflineCatalogSync />
    </AppShell>
  );
}
