// Offline pages show what the online ones would (FR-049, FR-055, leaf 9.2): for the same data,
// every read from the device store returns exactly what the server query returns, with the same
// filters, order, and paging, for the owner and for staff. The device store is filled the real
// way: the user's snapshot from /api/catalog, stored with applySnapshot().
import "fake-indexeddb/auto";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deviceSnapshot } from "@/app/api/catalog/device-snapshot";
import { OFFLINE_IMAGE_RULES, OFFLINE_PASSWORD_MIN_LENGTH } from "@/app/offline/limits";
import { listCategories, listCategoryOptions } from "@/features/categories/queries";
import { listInventoryChanges } from "@/features/inventory/queries";
import { archiveProduct } from "@/features/products/actions";
import { getProduct, listProducts } from "@/features/products/queries";
import { ACCEPTED_IMAGE_TYPES } from "@/features/products/schemas";
import { listSupplierOptions, listSuppliers } from "@/features/suppliers/queries";
import { listUsers } from "@/features/users/queries";
import type { Role } from "@/generated/prisma/enums";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { db } from "@/lib/db";
import { applySnapshot } from "@/lib/offline/catalog";
import { openOfflineDb, type OfflineDb } from "@/lib/offline/db";
import {
  categoryOptionsFrom,
  listCategoriesFrom,
  listSuppliersFrom,
  supplierOptionsFrom,
} from "@/lib/offline/read/catalog";
import { readDeviceRecords, type DeviceRecords } from "@/lib/offline/read/device";
import { listInventoryChangesFrom, listUsersFrom } from "@/lib/offline/read/people";
import { getProductFrom, listProductsFrom } from "@/lib/offline/read/products";
import type { Result } from "@/lib/result";
import { MAX_IMAGE_BYTES } from "@/lib/storage";
import { makeCategory, resetTestDatabase } from "../helpers/db";

// getServerSession needs a real request, and revalidatePath needs Next's request store.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

function actAs(user: { id: string }) {
  session.current = { user: { id: user.id } };
}

async function makePerson(name: string, role: Role, active = true) {
  return db.user.create({
    data: {
      email: `${name.toLowerCase().replace(/\W+/g, ".")}-${randomUUID().slice(0, 6)}@test.local`,
      name,
      role,
      active,
      passwordHash: "not-a-real-hash",
    },
  });
}

/**
 * A shop that exercises every filter and sort rule: names that differ only in case or accents,
 * the same name under two codes, barcodes, every stock state, products without a purchase price
 * or supplier, archived products, an unused category and supplier, and more products and history
 * rows than fit on one page, some at the same moment.
 */
async function seedShop() {
  const owner = await makePerson("Ana Owner", "OWNER");
  const staff = await makePerson("bea Staff", "STAFF");
  await makePerson("Carl Former", "STAFF", false);
  await makePerson("Zed Staff", "STAFF");
  await makePerson("Abe Staff", "STAFF");

  const categories = await Promise.all(
    ["Bags", "accessories", "Perfumes", "Ñ Specials", "Unused"].map((name) => makeCategory(name)),
  );
  const suppliers = await Promise.all(
    ["Samar Coop", "aklan weavers", "Zamboanga Crafts", "Never Used"].map((name, i) =>
      db.supplier.create({
        data: {
          name,
          contactPerson: i === 0 ? "Liza" : null,
          phone: i === 1 ? "0917 111 2222" : null,
          email: i === 2 ? "orders@zc.test" : null,
          address: i === 0 ? "Calbayog City" : null,
        },
      }),
    ),
  );

  const names = [
    "Banig Tote",
    "banig tote",
    "Piña Fan",
    "PIÑA Scarf",
    "Abaca Hat",
    "abaca hat",
    "Zebra Clutch",
    "zebra clutch",
    "Rattan Basket 10",
    "Rattan Basket 9",
    "Coin Purse",
    "Coin_Purse",
    "Sling-Bag",
    "Sling Bag",
    "Shell Earrings",
    "Pearl Necklace",
    "Capiz Lamp",
    "Woven Wallet",
    "Bamboo Comb",
    "Buri Mat",
    "Ylang Mist",
    "Sampaguita Oil",
    "Mango Soap",
    "Coconut Bowl",
    "Tinalak Pouch",
    "T'nalak Runner",
    "Inabel Throw",
    "Kapis Coaster",
    "Nito Tray",
    "Sinamay Hat",
    "Banig Tote", // same name, different code
    "Abel Iloko",
  ];
  const products: Awaited<ReturnType<typeof db.product.create>>[] = [];
  for (const [i, name] of names.entries()) {
    const stock = [0, 2, 5, 6, 40][i % 5]!;
    products.push(
      await db.product.create({
        data: {
          name,
          code: `${["EST", "est", "Bx"][i % 3]}-${String(100 - i).padStart(3, "0")}`,
          barcode: i % 4 === 0 ? `4800${String(i).padStart(4, "0")}` : null,
          categoryId: categories[i % 4]!.id,
          supplierId: i % 3 === 2 ? null : suppliers[i % 3]!.id,
          purchasePrice: i % 5 === 1 ? null : 10_000 + i * 100,
          sellingPrice: 20_000 + i * 150,
          stockQuantity: stock,
          lowStockThreshold: i % 7 === 0 ? 1 : 5,
          brand: i % 2 === 0 ? "Estetika" : null,
          expirationDate: i % 6 === 0 ? new Date("2027-03-01T00:00:00Z") : null,
        },
      }),
    );
  }

  actAs(owner);
  for (const product of [products[5]!, products[11]!, products[20]!]) {
    unwrap(await archiveProduct({ id: product.id }));
  }

  // More history than fits on one page (50), with several rows at the same moment.
  const base = Date.parse("2026-09-01T02:00:00.000Z");
  await db.inventoryChange.createMany({
    data: Array.from({ length: 70 }, (_, i) => {
      const product = products[i % products.length]!;
      return {
        id: randomUUID(),
        productId: i % 13 === 0 ? null : product.id,
        productName: product.name,
        productCode: product.code,
        type: (["SALE", "RESTOCK", "EDIT", "REFUND"] as const)[i % 4],
        quantityChange: i % 4 === 0 ? -1 : 3,
        stockAfter: i,
        userId: i % 2 === 0 ? owner.id : staff.id,
        note: i % 5 === 0 ? "Counted" : null,
        occurredAt: new Date(base + Math.floor(i / 3) * 60_000),
        recordedAt: new Date(base + Math.floor(i / 6) * 60_000),
      };
    }),
  });

  return { owner, staff, products, categories, suppliers };
}

let device: OfflineDb | null = null;

/** The user's device store, filled from their snapshot the way the app fills it. */
async function deviceRecordsFor(user: { id: string }): Promise<DeviceRecords> {
  actAs(user);
  device = openOfflineDb(`parity-${randomUUID()}`);
  await applySnapshot(unwrap(await deviceSnapshot({})), new Date(), device);
  return readDeviceRecords(device);
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
});

afterEach(async () => {
  await device?.delete();
  device = null;
});

/** Every product-list filter on its own and in a few combinations, plus paging. */
function productFilterCases(shop: Awaited<ReturnType<typeof seedShop>>) {
  const [bags, accessories, , specials] = shop.categories;
  return [
    {},
    { page: "2" },
    { page: "3" },
    { q: "banig" },
    { q: "BANIG TOTE" },
    { q: "piña" },
    { q: "PIÑA" },
    { q: "est-0" },
    // Prisma passes these to ILIKE unescaped, so they work as wildcards online.
    { q: "_" },
    { q: "%" },
    { q: "coin_purse" },
    { q: "b%g" },
    { q: "\\_" },
    { q: "sling" },
    { q: "48000004" },
    { q: "4800" },
    { q: "  hat  " },
    { q: "" },
    { category: bags!.id },
    { category: specials!.id },
    { category: "no-such-category" },
    { stock: "low" },
    { stock: "out" },
    { stock: "nonsense" },
    { cost: "missing" },
    { archived: "1" },
    { archived: "1", q: "abaca" },
    { q: "a", category: accessories!.id, stock: "low" },
    { q: "a", stock: "low", cost: "missing", page: "1" },
    { page: "0" },
    { page: "99" },
    { page: ["2", "1"] },
  ];
}

function historyFilterCases(shop: Awaited<ReturnType<typeof seedShop>>) {
  return [
    {},
    { page: "2" },
    { page: "5" },
    { type: "SALE" },
    { type: "RESTOCK", page: "1" },
    { type: "nonsense" },
    { q: "banig" },
    { q: "EST-0" },
    { q: "piña" },
    { q: "t_n%" },
    { product: shop.products[0]!.id },
    { product: shop.products[5]!.id, type: "EDIT" },
    { product: "no-such-product" },
    { q: "hat", type: "SALE" },
  ];
}

for (const who of ["owner", "staff"] as const) {
  test(`[FR-049-READ-PARITY] products and product details read offline match the server, for ${who}`, async () => {
    const shop = await seedShop();
    const user = shop[who];
    const records = await deviceRecordsFor(user);
    actAs(user);

    // Not a vacuous comparison: the list spans two pages, and most filters find something.
    expect(unwrap(await listProducts({})).pageCount).toBe(2);
    let found = 0;
    for (const filters of productFilterCases(shop)) {
      const online = await listProducts(filters);
      if (unwrap(online).items.length > 0) found += 1;
      expect(listProductsFrom(records, user.role, filters), JSON.stringify(filters)).toEqual(
        online,
      );
    }
    expect(found).toBeGreaterThan(15);
    for (const product of shop.products) {
      expect(getProductFrom(records, user.role, product.id)).toEqual(await getProduct(product.id));
    }
    expect(getProductFrom(records, user.role, "no-such-product")).toEqual(
      await getProduct("no-such-product"),
    );
    expect(categoryOptionsFrom(records.categories, user.role)).toEqual(await listCategoryOptions());
  });

  test(`[FR-049-READ-PARITY] inventory history read offline matches the server, for ${who}`, async () => {
    const shop = await seedShop();
    const user = shop[who];
    const records = await deviceRecordsFor(user);
    actAs(user);

    const all = unwrap(await listInventoryChanges({}));
    expect(all.total).toBeGreaterThan(50);
    for (const filters of historyFilterCases(shop)) {
      expect(
        listInventoryChangesFrom(records, user.role, filters),
        JSON.stringify(filters),
      ).toEqual(await listInventoryChanges(filters));
    }
  });
}

test("[FR-049-READ-PARITY] categories, suppliers, and user accounts read offline match the server for the owner", async () => {
  const shop = await seedShop();
  const records = await deviceRecordsFor(shop.owner);
  actAs(shop.owner);

  const categories = unwrap(await listCategories());
  expect(categories.some((c) => c.productCount === 0)).toBe(true);
  expect(listCategoriesFrom(records, "OWNER")).toEqual(await listCategories());
  expect(listSuppliersFrom(records, "OWNER")).toEqual(await listSuppliers());
  expect(supplierOptionsFrom(records.suppliers, "OWNER")).toEqual(await listSupplierOptions());
  expect(unwrap(await listUsers())).toHaveLength(5);
  expect(listUsersFrom(records.users, "OWNER")).toEqual(await listUsers());
});

test("[FR-055-ROLE-PAGES] staff get the same refusals offline as online for owner-only lists", async () => {
  const shop = await seedShop();
  const records = await deviceRecordsFor(shop.staff);
  actAs(shop.staff);

  const refused = (result: Result<unknown>) => (result.ok ? "ok" : result.error.code);
  expect(refused(listCategoriesFrom(records, "STAFF"))).toBe(refused(await listCategories()));
  expect(refused(listSuppliersFrom(records, "STAFF"))).toBe(refused(await listSuppliers()));
  expect(refused(supplierOptionsFrom(records.suppliers, "STAFF"))).toBe(
    refused(await listSupplierOptions()),
  );
  expect(refused(listUsersFrom(records.users, "STAFF"))).toBe(refused(await listUsers()));
  expect(refused(await listUsers())).toBe("FORBIDDEN");
});

test("[FR-049-READ-PARITY] the offline forms use the server's photo and password limits", () => {
  expect(OFFLINE_IMAGE_RULES).toEqual({
    maxBytes: MAX_IMAGE_BYTES,
    acceptedTypes: ACCEPTED_IMAGE_TYPES,
  });
  expect(OFFLINE_PASSWORD_MIN_LENGTH).toBe(PASSWORD_MIN_LENGTH);
});
