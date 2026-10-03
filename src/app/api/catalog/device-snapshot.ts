// Builds the role-scoped device snapshot described in src/lib/offline/snapshot.ts (FR-055,
// leaf 9.1). Server only.
import { z } from "zod";
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { SNAPSHOT_OVERLAP_MS, SNAPSHOT_VERSION, type Snapshot } from "@/lib/offline/snapshot";
import { can } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";

export const snapshotQuerySchema = z.object({
  since: z.iso.datetime({ offset: true }).optional().catch(undefined),
  user: z.string().trim().max(100).optional().catch(undefined),
  role: z.enum(["OWNER", "STAFF"]).optional().catch(undefined),
});

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

/**
 * The snapshot for the signed-in user. Everything when `since` is missing, in the future, or
 * belongs to a different user or role on this device; otherwise only what changed after it.
 */
export async function deviceSnapshot(rawQuery: unknown): Promise<Result<Snapshot>> {
  const auth = await requireCapability("search");
  if (!auth.ok) return auth;
  const user = auth.data;
  const parsed = snapshotQuerySchema.safeParse(rawQuery ?? {});
  if (!parsed.success) return fail("VALIDATION", "That sync request isn't valid.");
  const query = parsed.data;

  const now = new Date();
  const sinceMs = query.since ? Date.parse(query.since) : NaN;
  const full =
    !Number.isFinite(sinceMs) ||
    sinceMs > now.getTime() ||
    query.user !== user.id ||
    query.role !== user.role;
  const changed = full ? undefined : { gt: new Date(sinceMs - SNAPSHOT_OVERLAP_MS) };

  const seesCosts = can(user.role, "products.cost");
  const seesSuppliers = can(user.role, "suppliers.read");
  const seesUsers = can(user.role, "users.manage");

  const [products, categories, categoryIds, suppliers, supplierIds, users, userIds] =
    await Promise.all([
      db.product.findMany({
        where: changed ? { updatedAt: changed } : {},
        include: { category: { select: { name: true } } },
        orderBy: [{ name: "asc" }, { code: "asc" }],
      }),
      db.category.findMany({
        where: changed ? { updatedAt: changed } : {},
        orderBy: { name: "asc" },
      }),
      db.category.findMany({ select: { id: true } }),
      seesSuppliers
        ? db.supplier.findMany({
            where: changed ? { updatedAt: changed } : {},
            orderBy: { name: "asc" },
          })
        : [],
      seesSuppliers ? db.supplier.findMany({ select: { id: true } }) : [],
      seesUsers
        ? db.user.findMany({
            where: changed ? { updatedAt: changed } : {},
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              active: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { name: "asc" },
          })
        : [],
      seesUsers ? db.user.findMany({ select: { id: true } }) : [],
    ]);

  // A refund changes its sale's refunded quantities, so the sale is sent again with it.
  const [sales, refunds, inventoryChanges] = await Promise.all([
    db.sale.findMany({
      where: changed
        ? { OR: [{ recordedAt: changed }, { refunds: { some: { recordedAt: changed } } }] }
        : {},
      include: { items: { orderBy: { id: "asc" } }, staff: { select: { name: true } } },
      orderBy: { occurredAt: "asc" },
    }),
    db.refund.findMany({
      where: changed ? { recordedAt: changed } : {},
      include: { items: { orderBy: { id: "asc" } }, user: { select: { name: true } } },
      orderBy: { occurredAt: "asc" },
    }),
    db.inventoryChange.findMany({
      where: changed ? { recordedAt: changed } : {},
      include: { user: { select: { name: true } } },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  return ok({
    version: SNAPSHOT_VERSION,
    full,
    cursor: iso(now),
    user: { id: user.id, role: user.role },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      barcode: p.barcode,
      brand: p.brand,
      categoryId: p.categoryId,
      categoryName: p.category.name,
      supplierId: seesSuppliers ? p.supplierId : null,
      purchasePrice: seesCosts ? p.purchasePrice : null,
      sellingPrice: p.sellingPrice,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      expirationDate: p.expirationDate ? iso(p.expirationDate).slice(0, 10) : null,
      imageUrl: p.imageUrl,
      archivedAt: isoOrNull(p.archivedAt),
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      createdAt: iso(c.createdAt),
      updatedAt: iso(c.updatedAt),
    })),
    categoryIds: categoryIds.map((c) => c.id),
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      createdAt: iso(s.createdAt),
      updatedAt: iso(s.updatedAt),
    })),
    supplierIds: supplierIds.map((s) => s.id),
    users: users.map((u) => ({ ...u, createdAt: iso(u.createdAt), updatedAt: iso(u.updatedAt) })),
    userIds: userIds.map((u) => u.id),
    sales: sales.map((s) => ({
      id: s.id,
      occurredAt: iso(s.occurredAt),
      recordedAt: iso(s.recordedAt),
      staffId: s.staffId,
      staffName: s.staff.name,
      customerInfo: s.customerInfo,
      subtotal: s.subtotal,
      discountType: s.discountType,
      discountValue: s.discountValue,
      discountAmount: s.discountAmount,
      total: s.total,
      paymentMethod: s.paymentMethod,
      items: s.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productCode: item.productCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: seesCosts ? item.unitCost : null,
        refundedQuantity: item.refundedQuantity,
      })),
    })),
    refunds: refunds.map((r) => ({
      id: r.id,
      saleId: r.saleId,
      occurredAt: iso(r.occurredAt),
      recordedAt: iso(r.recordedAt),
      userId: r.userId,
      userName: r.user.name,
      amount: r.amount,
      note: r.note,
      items: r.items.map((item) => ({
        id: item.id,
        saleItemId: item.saleItemId,
        quantity: item.quantity,
        amount: item.amount,
        returnedToStock: item.returnedToStock,
      })),
    })),
    inventoryChanges: inventoryChanges.map((c) => ({
      id: c.id,
      productId: c.productId,
      productName: c.productName,
      productCode: c.productCode,
      type: c.type,
      quantityChange: c.quantityChange,
      stockAfter: c.stockAfter,
      saleId: c.saleId,
      refundId: c.refundId,
      userId: c.userId,
      userName: c.user.name,
      note: c.note,
      occurredAt: iso(c.occurredAt),
      recordedAt: iso(c.recordedAt),
    })),
  });
}
