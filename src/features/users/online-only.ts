// Account and password changes need a connection (FR-049 exception, FR-045, FR-060; leaf 9.5).
// They are never saved on the device to sync later, so no password is ever kept there. Offline,
// the forms refuse at once and say why, instead of failing to reach the server.
import { fail, type Result } from "@/lib/result";

export const ACCOUNT_NEEDS_CONNECTION =
  "Account changes need an internet connection. Connect and try again.";

export const PASSWORD_NEEDS_CONNECTION =
  "Changing your password needs an internet connection. Connect and try again.";

/** Runs `action` only while the device is online; offline, refuses with `message`. */
export async function onlineOnly<T>(
  action: () => Promise<Result<T>>,
  message: string = ACCOUNT_NEEDS_CONNECTION,
): Promise<Result<T>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return fail("OFFLINE", message);
  return action();
}
