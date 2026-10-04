// Account and password changes need a connection (FR-049 exception, FR-045, FR-060; leaf 9.5).
// Offline, the forms refuse at once with a message saying so, nothing is sent or queued, and no
// password ever reaches the device store (C97).
import { configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ChangePasswordForm } from "@/features/account/change-password-form";
import { AddStaffForm } from "@/features/users/add-staff-form";
import { ACCOUNT_NEEDS_CONNECTION, PASSWORD_NEEDS_CONNECTION } from "@/features/users/online-only";
import { UserList } from "@/features/users/user-list";
import { offlineDb } from "@/lib/offline/db";

const calls = vi.hoisted(() => ({ users: [] as string[], account: [] as string[] }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/features/users/actions", () => {
  const record = (name: string) => async () => {
    calls.users.push(name);
    return { ok: true, data: { id: "u", name: "Ana", email: "a@x.ph", role: "STAFF" } };
  };
  return {
    createStaffUser: record("createStaffUser"),
    resetUserPassword: record("resetUserPassword"),
    setUserActive: record("setUserActive"),
  };
});
vi.mock("@/features/account/actions", () => ({
  changeOwnPassword: async () => {
    calls.account.push("changeOwnPassword");
    return { ok: true, data: { signedOut: true } };
  },
}));

// The full suite runs database tests alongside; give each wait more than the default second.
configure({ asyncUtilTimeout: 10_000 });

const TYPED = ["Staff-Pass-77", "Reset-Pass-55", "Estetika-2026", "Another-Pass-9"];

function setOnline(online: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

async function everythingStored(): Promise<string> {
  const db = offlineDb();
  await db.open();
  return JSON.stringify(await Promise.all(db.tables.map((table) => table.toArray())));
}

beforeEach(() => {
  calls.users = [];
  calls.account = [];
});

afterEach(async () => {
  vi.restoreAllMocks();
  toast.error.mockClear();
  toast.success.mockClear();
  document.body.innerHTML = "";
  await offlineDb().delete();
  await offlineDb().open();
});

function type(label: string, value: string, exact = true) {
  fireEvent.change(screen.getByLabelText(label, { exact }), { target: { value } });
}

test("[ACCOUNT-ONLINE-ONLY] offline, adding staff, resetting a password, reactivating, and changing the owner's password are refused with a message, and nothing is sent", async () => {
  setOnline(false);

  render(<AddStaffForm passwordMinLength={8} />);
  type("Name", "Ana Reyes");
  type("Email", "ana@estetika.ph");
  type("Password", TYPED[0]);
  fireEvent.click(screen.getByRole("button", { name: "Add staff account" }));
  await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith(ACCOUNT_NEEDS_CONNECTION));
  document.body.innerHTML = "";

  const ana = {
    id: "user-ana",
    name: "Ana",
    email: "ana@estetika.ph",
    role: "STAFF" as const,
    active: false,
    createdAt: new Date(),
  };
  render(<UserList users={[ana]} passwordMinLength={8} />);
  fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
  type("New password for Ana", TYPED[1]);
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(3));
  expect(toast.error.mock.calls.every(([message]) => message === ACCOUNT_NEEDS_CONNECTION)).toBe(
    true,
  );
  document.body.innerHTML = "";

  render(<ChangePasswordForm passwordMinLength={8} />);
  type("Current password", TYPED[2]);
  type("New password", TYPED[3]);
  type("Confirm new password", TYPED[3]);
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith(PASSWORD_NEEDS_CONNECTION));

  expect(calls).toEqual({ users: [], account: [] });
  expect(toast.success).not.toHaveBeenCalled();

  // Positive control: online, the same form reaches the server.
  setOnline(true);
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  await waitFor(() => expect(calls.account).toEqual(["changeOwnPassword"]));
});

test("[OFFLINE-NO-PLAINTEXT] a password typed into an account form offline never reaches the device store", async () => {
  setOnline(false);
  // Positive control: something typed and saved on the device would be found.
  await offlineDb().meta.put({ key: "probe", value: "probe-value-123" });
  expect(await everythingStored()).toContain("probe-value-123");

  render(<AddStaffForm passwordMinLength={8} />);
  type("Name", "Ana Reyes");
  type("Email", "ana@estetika.ph");
  type("Password", TYPED[0]);
  fireEvent.click(screen.getByRole("button", { name: "Add staff account" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  document.body.innerHTML = "";

  render(<ChangePasswordForm passwordMinLength={8} />);
  type("Current password", TYPED[2]);
  type("New password", TYPED[3]);
  type("Confirm new password", TYPED[3]);
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));

  const stored = await everythingStored();
  for (const password of TYPED) expect(stored).not.toContain(password);
  expect(await offlineDb().outbox.count()).toBe(0);
});
