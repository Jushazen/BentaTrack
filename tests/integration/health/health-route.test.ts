import { afterEach, expect, test, vi } from "vitest";
import { GET } from "@/app/api/health/route";

// Lets a test make the shared client's queries fail as if the database were down.
const failure = vi.hoisted(() => ({ message: null as string | null }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  const db = new Proxy(actual.db, {
    get(target, prop) {
      if (prop === "$queryRaw" && failure.message !== null) {
        const message = failure.message;
        return async () => {
          throw new Error(message);
        };
      }
      return Reflect.get(target, prop);
    },
  });
  return { ...actual, db };
});

afterEach(() => {
  failure.message = null;
});

test("[HEALTH-1] reports a reachable database as healthy and is never cached", async () => {
  const response = await GET();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

test("[HEALTH-1] reports an unreachable database as 503 without leaking the error", async () => {
  failure.message = "connect ECONNREFUSED db.internal.example:5432 user=bentatrack";

  const response = await GET();
  const text = await response.text();

  expect(response.status).toBe(503);
  expect(JSON.parse(text)).toEqual({ status: "error", database: "unreachable" });
  expect(text).not.toContain("ECONNREFUSED");
  expect(text).not.toContain("db.internal.example");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
