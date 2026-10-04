// The page a device lands on when its session was ended elsewhere (FR-045, FR-060, FR-055;
// leaf 9.5): owner-only data leaves the device before it signs out, and changes still waiting to
// sync stay on it (FR-036).
import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SignOutNow } from "@/app/(auth)/session-ended/sign-out-now";
import { offlineDb } from "@/lib/offline/db";

const signOut = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut }));

const T = "2026-10-01T00:00:00.000Z";

afterEach(async () => {
  signOut.mockClear();
  await offlineDb().delete();
  await offlineDb().open();
});

test("[FR-045-RECONNECT] the sign-out page removes owner data from the device before signing out, and keeps queued changes", async () => {
  const db = offlineDb();
  await db.users.put({
    id: "user-ana",
    email: "ana@estetika.ph",
    name: "Ana",
    role: "STAFF",
    active: false,
    createdAt: T,
    updatedAt: T,
  });
  await db.suppliers.put({
    id: "s-1",
    name: "Calbayog Weavers",
    contactPerson: null,
    phone: null,
    email: null,
    address: null,
    createdAt: T,
    updatedAt: T,
  });
  await db.meta.bulkPut([
    { key: "snapshotUserId", value: "user-owner" },
    { key: "snapshotRole", value: "OWNER" },
  ]);
  await db.outbox.put({
    id: "6f1c2b0e-8d4a-4c1e-9b7a-2f3d4e5a6b7c",
    kind: "SALE",
    payload: { userId: "user-ana", userName: "Ana", summary: "Sale", input: {} },
    createdAt: 1,
    attempts: 0,
    lastError: null,
  });
  // Positive control: the owner's data is there before the page opens.
  expect(await db.users.count()).toBe(1);

  let ownerDataWhenSigningOut = -1;
  signOut.mockImplementationOnce(async () => {
    ownerDataWhenSigningOut = (await db.users.count()) + (await db.suppliers.count());
  });
  render(<SignOutNow loginUrl="/login?signedOut=deactivated" />);

  await waitFor(() => expect(signOut).toHaveBeenCalled());
  expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login?signedOut=deactivated" });
  await waitFor(() => expect(ownerDataWhenSigningOut).toBe(0));
  expect(await db.suppliers.count()).toBe(0);
  expect(await db.meta.get("snapshotRole")).toBeUndefined();
  expect(await db.outbox.count()).toBe(1);
});
