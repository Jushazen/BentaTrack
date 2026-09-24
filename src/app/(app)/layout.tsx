// Signed-in shell. requirePageCapability() is the authoritative login check (the proxy is only
// the fast first check), and it supplies the role that decides which menu items show.
import { AppShell } from "@/components/layout/app-shell";
import { LowStockOnOpen } from "@/components/layout/low-stock-alerts";
import { requirePageCapability } from "@/lib/auth";
import { db } from "@/lib/db";

/** Products that are Low Stock or Out of Stock (quantity at or below their own threshold). */
async function lowStockCount(): Promise<number> {
  return db.product.count({
    where: { stockQuantity: { lte: db.product.fields.lowStockThreshold } },
  });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageCapability();
  const count = await lowStockCount();
  return (
    <AppShell user={{ name: user.name, role: user.role }} lowStockCount={count}>
      {children}
      <LowStockOnOpen count={count} />
    </AppShell>
  );
}
