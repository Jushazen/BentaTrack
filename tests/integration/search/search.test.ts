import { performance } from "node:perf_hooks";
import { beforeEach, expect, test, vi } from "vitest";
import { lookupProduct, searchProducts } from "@/features/search/queries";
import { db } from "@/lib/db";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

// getServerSession needs a real request.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));

async function signInAs(role: "OWNER" | "STAFF") {
  const user = await makeUser(role);
  session.current = { user: { id: user.id } };
  return user;
}

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

const names = async (q: string) => unwrap(await searchProducts(q)).map((hit) => hit.name);

let categoryId: string;

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
  categoryId = (await makeCategory("Bags")).id;
});

async function seedCatalog() {
  await makeProduct(categoryId, {
    name: "Leather Tote",
    code: "BAG-001",
    barcode: "4800016644290",
  });
  await makeProduct(categoryId, { name: "Canvas Tote Bag", code: "BAG-002" });
  await makeProduct(categoryId, { name: "Tote Organizer", code: "ORG-010" });
  await makeProduct(categoryId, { name: "Straw Hat", code: "HAT-7", stockQuantity: 0 });
  await makeProduct(categoryId, { name: "100% Cotton Scarf", code: "SCF_1" });
}

test("[FR-026] search by name is case-insensitive and matches anywhere in the name", async () => {
  await signInAs("STAFF");
  await seedCatalog();

  // Name starting with the query ranks before names that only contain it.
  expect(await names("tote")).toEqual(["Tote Organizer", "Canvas Tote Bag", "Leather Tote"]);
  expect(await names("STRAW")).toEqual(["Straw Hat"]);
  expect(await names("  hat  ")).toEqual(["Straw Hat"]);
  expect(await names("umbrella")).toEqual([]);
  expect(await names("")).toEqual([]);
});

test("[FR-026] wildcard characters in the query match literally", async () => {
  await signInAs("STAFF");
  await seedCatalog();
  expect(await names("100%")).toEqual(["100% Cotton Scarf"]);
  expect(await names("%")).toEqual(["100% Cotton Scarf"]);
  expect(await names("F_1")).toEqual(["100% Cotton Scarf"]);
  expect(await names("_")).toEqual(["100% Cotton Scarf"]);
});

test("[FR-026] results include stock status and never purchase price or supplier", async () => {
  await signInAs("STAFF");
  await seedCatalog();
  const [hit] = unwrap(await searchProducts("straw"));
  expect(hit).toMatchObject({
    code: "HAT-7",
    categoryName: "Bags",
    stockQuantity: 0,
    status: "OUT_OF_STOCK",
  });
  expect(Object.keys(hit ?? {})).not.toContain("purchasePrice");
  expect(Object.keys(hit ?? {})).not.toContain("supplierId");
});

test("[FR-027] search by product code: exact code first, then code prefix", async () => {
  await signInAs("STAFF");
  await seedCatalog();
  expect(await names("bag-002")).toEqual(["Canvas Tote Bag"]);
  expect(await names("BAG")).toEqual(["Canvas Tote Bag", "Leather Tote"]);
  expect(await names("org")).toEqual(["Tote Organizer"]);

  // Exact code, then code prefix, then name prefix.
  await makeProduct(categoryId, { name: "Hat Box", code: "BOX-1" });
  await makeProduct(categoryId, { name: "HAT-7 Stand", code: "STD-1" });
  const hat = await names("hat");
  expect(hat[0]).toBe("Straw Hat");
  expect(hat.slice(1).sort()).toEqual(["HAT-7 Stand", "Hat Box"]);
  expect(await names("hat-7")).toEqual(["Straw Hat", "HAT-7 Stand"]);
});

test("[FR-028] barcode lookup finds the exact product; codes work too; partial barcodes do not", async () => {
  await signInAs("STAFF");
  await seedCatalog();

  const byBarcode = unwrap(await lookupProduct("4800016644290"));
  expect(byBarcode?.name).toBe("Leather Tote");
  expect(unwrap(await lookupProduct(" bag-002 "))?.name).toBe("Canvas Tote Bag");
  expect(unwrap(await lookupProduct("48000166"))).toBeNull();
  expect(unwrap(await lookupProduct(""))).toBeNull();

  // The search box also puts an exact barcode match first.
  expect(await names("4800016644290")).toEqual(["Leather Tote"]);
  // A barcode that happens to equal another product's code wins the lookup.
  await db.product.update({ where: { code: "BAG-002" }, data: { barcode: "HAT-7" } });
  expect(unwrap(await lookupProduct("hat-7"))?.name).toBe("Canvas Tote Bag");
});

test("[FR-028] search and lookup require a signed-in user", async () => {
  await seedCatalog();
  expect(await searchProducts("tote")).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
  expect(await lookupProduct("4800016644290")).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
});

test("[NFR-PERF-2] search and barcode lookup answer within 500 ms (p95) over 5,000 products", async () => {
  await signInAs("STAFF");
  const categories = await Promise.all(
    ["Bags", "Hats", "Scarves", "Shoes", "Jewelry"].map((name, i) =>
      i === 0 ? { id: categoryId } : makeCategory(name),
    ),
  );
  const words = ["Leather", "Canvas", "Woven", "Abaca", "Rattan", "Beaded", "Silk", "Denim"];
  const kinds = ["Tote", "Clutch", "Hat", "Scarf", "Sandal", "Bracelet", "Pouch", "Wallet"];
  await db.product.createMany({
    data: Array.from({ length: 5_000 }, (_, i) => ({
      name: `${words[i % words.length]} ${kinds[(i * 7) % kinds.length]} ${i}`,
      code: `SKU-${String(i).padStart(5, "0")}`,
      barcode: `480${String(i).padStart(10, "0")}`,
      categoryId: categories[i % categories.length]!.id,
      sellingPrice: 10_000 + i,
      stockQuantity: i % 20,
    })),
  });
  expect(await db.product.count()).toBe(5_000);

  const queries = [
    "leather",
    "tote",
    "abaca clutch",
    "SKU-04",
    "sku-00042",
    "4800000004242",
    "wallet 49",
  ];
  const timings: number[] = [];
  // Warm up the connection pool and query plans first, as a running server would be.
  await searchProducts("warm");
  for (let round = 0; round < 10; round++) {
    for (const q of queries) {
      const start = performance.now();
      const result = await searchProducts(q);
      timings.push(performance.now() - start);
      expect(result.ok).toBe(true);
    }
    const start = performance.now();
    const found = unwrap(await lookupProduct(`480${String(round * 311).padStart(10, "0")}`));
    timings.push(performance.now() - start);
    expect(found?.code).toBe(`SKU-${String(round * 311).padStart(5, "0")}`);
  }

  expect(unwrap(await searchProducts("sku-00042"))[0]?.code).toBe("SKU-00042");
  expect(unwrap(await searchProducts("leather"))).toHaveLength(20);

  timings.sort((a, b) => a - b);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!;
  console.log(`search p95 over ${timings.length} calls: ${p95.toFixed(1)} ms`);
  expect(p95).toBeLessThan(500);
}, 120_000);
